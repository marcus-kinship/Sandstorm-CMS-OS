/**
 * @file cursor/permission.js
 * @description Per-program consent gate for cursor control — browser-style
 * (camera/mic) UX, confirmed with the user as consent/auditability rather
 * than a hard security boundary: this codebase has no real process
 * isolation between programs, so "which program is calling" is resolved
 * the same convention-based way the rest of the OS already tracks "the
 * currently active window" (see `sandstorm/components/ui/window/lifecycle.js`'s
 * own `programClass = attr("class")?.match(/pid-([^\s]+)/)` pattern, reused
 * here) — not a cryptographic guarantee.
 *
 * Keyed by an explicit **scope** string (only `"cursor-control"` is
 * registered by this engine, but nothing here hardcodes that name, so a
 * second scope could reuse this file later without restructuring it).
 *
 * @module components/cursor/permission
 */

import * as state from './state.js';
import { emit } from './events.js';

const _decisions = new Map(); // `${scope}::${programId}` -> 'allow-always' | 'deny-always'
let _loaded = false;
let _saveTimeout = null;

function _key(scope, programId) {
    return `${scope}::${programId}`;
}

function _load() {
    if (_loaded) return;
    _loaded = true;
    const stored = app.config?.user?.settings?.cursorPermissions;
    if (stored) {
        for (const [key, decision] of Object.entries(stored)) _decisions.set(key, decision);
    }
}

function _save() {
    if (!app.config.user) app.config.user = {};
    if (!app.config.user.settings) app.config.user.settings = {};
    app.config.user.settings.cursorPermissions = Object.fromEntries(_decisions);
    clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
        if (typeof app.saveUserSettings === "function") app.saveUserSettings();
    }, 500);
}

/** Convention-based "who is calling" — see file header. Returns `null` for
 *  a system-level call (no active program window, e.g. during boot). */
function getCallerProgramId() {
    const activeWindow = document.querySelector('.window.active');
    const cls = activeWindow?.getAttribute('class') || '';
    const match = cls.match(/pid-([^\s]+)/);
    return match ? match[1] : null;
}

function isSystemProgram(programId) {
    return !programId;
}

/**
 * @param {string} programId
 * @param {string} scope
 * @returns {'granted'|'denied'|'ask'}
 */
export function check(programId, scope) {
    _load();
    const settings = state.getSettings();
    if (!settings?.security?.askBeforeControl) return 'granted';
    if (settings?.security?.systemOnly && !isSystemProgram(programId)) return 'denied';
    if (isSystemProgram(programId)) return 'granted'; // system-level calls are always trusted

    const decision = _decisions.get(_key(scope, programId));
    if (decision === 'allow-always') return 'granted';
    if (decision === 'deny-always') return 'denied';
    return 'ask';
}

function _showConsentDialog(programId, scope) {
    return new Promise((resolve) => {
        const uid = 'cursor-consent-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const programName = app.program?.getInfo?.(programId)?.name || programId || _('Okänt program');

        app.ui.window({
            title: _('Programmet vill styra muspekaren'),
            width: '380px',
            height: '270px',
            windowIcon: true,
            icontype: 'svg',
            icon: '#ic-warning',
            resizable: false,
            class: 'd-msgwin cursor-consent-dlg',
            left: 'center',
            top: 'center',
            body: () => `
                <div class="m-window d-check" style="flex-direction:column;align-items:flex-start;gap:6px;">
                    <div><strong>${_('Program')}:</strong> ${app.util.escapeHtml(programName)}</div>
                    <div>${_('Detta program vill')}:</div>
                    <ul style="margin:0 0 0 18px;padding:0;">
                        <li>${_('Flytta pekaren')}</li>
                        <li>${_('Byta cursor')}</li>
                        <li>${_('Kontrollera animationer')}</li>
                    </ul>
                </div>
                <div class="buttons flex-right" style="display:flex;gap:6px;padding:14px;flex-wrap:wrap;justify-content:flex-end;">
                    <div id="${uid}-deny" class="aero-button">${_('Neka')}</div>
                    <div id="${uid}-once" class="aero-button">${_('Tillåt en gång')}</div>
                    <div id="${uid}-always" class="aero-button">${_('Tillåt alltid')}<div class="after pulse"></div></div>
                </div>
            `,
        });

        setTimeout(() => {
            const finish = (decision) => {
                app.ui.windows.functions.closeActiveWindow();
                resolve(decision);
            };
            document.getElementById(`${uid}-deny`)?.addEventListener('click', () => finish('deny-always'));
            document.getElementById(`${uid}-once`)?.addEventListener('click', () => finish('allow-once'));
            document.getElementById(`${uid}-always`)?.addEventListener('click', () => finish('allow-always'));
        }, 10);
    });
}

/**
 * @param {string} programId
 * @param {string} scope
 * @returns {Promise<'granted'|'denied'>}
 */
export async function request(programId, scope) {
    const current = check(programId, scope);
    if (current !== 'ask') return current;

    const decision = await _showConsentDialog(programId, scope);
    if (decision !== 'allow-once') set(programId, scope, decision);
    return decision === 'deny-always' ? 'denied' : 'granted';
}

/**
 * @param {string} programId
 * @param {string} scope
 * @param {'allow-always'|'deny-always'|'ask'} decision - `'ask'` clears any stored decision.
 */
export function set(programId, scope, decision) {
    _load();
    const key = _key(scope, programId);
    if (decision === 'ask') _decisions.delete(key);
    else _decisions.set(key, decision);
    _save();
}

export function revoke(programId, scope) {
    set(programId, scope, 'deny-always');
}

/** @param {string} scope @returns {Array<{programId:string, decision:string}>} */
export function list(scope) {
    _load();
    const out = [];
    for (const [key, decision] of _decisions) {
        const [keyScope, programId] = key.split('::');
        if (keyScope === scope) out.push({ programId, decision });
    }
    return out;
}

/** @param {string} scope @param {string} [programId] - omit to reset every program for this scope. */
export function reset(scope, programId) {
    _load();
    if (programId) {
        _decisions.delete(_key(scope, programId));
    } else {
        for (const key of [..._decisions.keys()]) {
            if (key.startsWith(`${scope}::`)) _decisions.delete(key);
        }
    }
    _save();
}

export { getCallerProgramId, isSystemProgram };
