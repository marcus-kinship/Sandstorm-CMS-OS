/**
 * @file cursor/renderer.js
 * @description Owns the actual overlay DOM. Subscribes to `cursorchange` /
 * `positionchange` / `visibilitychange` / `settingschange` via `events.js`
 * — never imports `cursor-map.js` and never sees a raw CSS cursor value,
 * only the resolved internal ids `detect.js`/`registry.js` produce.
 *
 * Owns the single global `cursor: none !important` override rule — the
 * ONLY thing in this whole engine that "uses `cursor:` in CSS", and only as
 * the unavoidable, industry-standard way to suppress the native pointer so
 * this SVG overlay is the only thing visibly drawn. `pointer-events:none`
 * on the overlay is critical — without it nothing on the page would stay
 * clickable/hoverable.
 *
 * @module components/cursor/renderer
 */

import { on } from './events.js';
import * as state from './state.js';
import { applyTheme } from './theme.js';

let _root = null;   // #cursor-engine-root
let _svg = null;    // the <svg> inside it, holding two stacked <use> layers
let _useA = null;
let _useB = null;
let _activeIsA = true; // which of _useA/_useB is currently the visible (opacity:1) layer
let _ring = null;   // standalone spin ring for cursor-working — see _createOverlay()
let _usageBadge = null;
let _idleTimer = null;

const WORKING_RING_PATH = 'M18 8.5 a4 4 0 1 1 -4 -4';

const ANCHOR_BY_ID = new Map(); // cursor id -> 'top-left' | 'center', from the active pack's manifest

const WINDOW_FADE_MS = 200; // within the spec's 150-250ms range

function _injectCSS() {
    if (document.getElementById('cursor-engine-style')) return;
    const style = document.createElement('style');
    style.id = 'cursor-engine-style';
    style.textContent = `
        #cursor-engine-root {
            position: fixed; top: 0; left: 0; z-index: 2147483000;
            pointer-events: none; will-change: transform, opacity;
            filter: drop-shadow(var(--cursor-shadow, 1px 2px 3px rgba(0,0,0,0.4)));
            opacity: 0;
            transition: opacity ${WINDOW_FADE_MS}ms ease;
        }
        #cursor-engine-root.cursor-window-visible { opacity: 1; }
        #cursor-engine-root svg {
            display: block; color: var(--cursor-color, #4da3ff);
            opacity: var(--cursor-opacity, 1);
            filter: drop-shadow(var(--cursor-glow, none));
        }
        #cursor-engine-root svg use { transition: opacity 120ms ease; }
        #cursor-engine-root.cursor-hover svg { transform: scale(1.15); }
        #cursor-engine-root.cursor-idle svg { animation: cursor-idle-breathe 2.4s ease-in-out infinite; }
        #cursor-engine-root.cursor-click svg { animation: cursor-click-pulse 260ms ease-out; }
        #cursor-engine-root .cursor-busy-spin { transform-origin: center; animation: cursor-spin 900ms linear infinite; }
        #cursor-engine-root svg .cursor-ring-overlay {
            opacity: 0; transition: opacity 120ms ease;
            transform-box: fill-box; transform-origin: center;
        }
        #cursor-engine-root svg .cursor-ring-overlay.show {
            opacity: 1; animation: cursor-spin 900ms linear infinite;
        }
        @keyframes cursor-idle-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes cursor-click-pulse { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
        @keyframes cursor-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .cursor-engine-trail {
            position: fixed; top: 0; left: 0; z-index: 2147482999; pointer-events: none;
            width: 6px; height: 6px; border-radius: 50%; background: var(--cursor-color, #4da3ff);
            opacity: 0; will-change: transform, opacity;
        }

        #cursor-engine-usage {
            position: fixed; left: 12px; bottom: 48px; z-index: 2147483000;
            display: none; align-items: center; gap: 8px; padding: 6px 12px;
            background: var(--theme-backgruondcolorc, #00000040); backdrop-filter: blur(10px);
            border-radius: 20px; color: #fff; font-size: 11px; box-shadow: 1px 1px 6px rgba(0,0,0,0.4);
        }
        #cursor-engine-usage.show { display: flex; }
        #cursor-engine-usage .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cursor-color, #4da3ff); animation: cursor-spin 1.5s linear infinite; }

        html.cursor-engine-native-hidden, html.cursor-engine-native-hidden * { cursor: none !important; }
    `;
    document.head.appendChild(style);
}

function _createOverlay() {
    if (_root) return;
    _root = document.createElement('div');
    _root.id = 'cursor-engine-root';
    _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svg.setAttribute('width', '24');
    _svg.setAttribute('height', '24');
    _svg.setAttribute('viewBox', '0 0 24 24');
    _useA = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    _useA.setAttribute('href', '#cursor-normal');
    _useB = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    _useB.setAttribute('href', '#cursor-normal');
    _useB.style.opacity = '0';
    _svg.appendChild(_useA);
    _svg.appendChild(_useB);

    _ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    _ring.setAttribute('class', 'cursor-ring-overlay');
    _ring.setAttribute('d', WORKING_RING_PATH);
    _ring.setAttribute('fill', 'none');
    _ring.setAttribute('stroke', 'currentColor');
    _ring.setAttribute('stroke-width', '2');
    _ring.setAttribute('stroke-linecap', 'round');
    _svg.appendChild(_ring);

    _root.appendChild(_svg);
    document.body.appendChild(_root);

    _usageBadge = document.createElement('div');
    _usageBadge.id = 'cursor-engine-usage';
    _usageBadge.innerHTML = `<span class="dot"></span><span class="text"></span>`;
    document.body.appendChild(_usageBadge);
}

function _applyPosition({ x, y }) {
    if (!_root) return;
    const anchor = ANCHOR_BY_ID.get(state.getActiveCursorId()) || 'top-left';
    const size = Number(state.getSettings()?.size) || 24;
    const offsetX = anchor === 'center' ? size / 2 : 0;
    const offsetY = anchor === 'center' ? size / 2 : 0;
    _root.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px)`;

    if (_idleTimer) clearTimeout(_idleTimer);
    _root.classList.remove('cursor-idle');
    if (state.getSettings()?.animations?.idle) {
        _idleTimer = setTimeout(() => _root?.classList.add('cursor-idle'), 2500);
    }
}

function _applyCursorChange(id) {
    if (!_useA || !_useB) return;
    const incoming = _activeIsA ? _useB : _useA;
    const outgoing = _activeIsA ? _useA : _useB;
    _activeIsA = !_activeIsA;

    incoming.setAttribute('href', `#${id}`);
    _root.classList.toggle('cursor-hover', id === 'cursor-link' && !!state.getSettings()?.animations?.hover);
    const spinEnabled = (id === 'cursor-busy' || id === 'cursor-working') && state.getSettings()?.animations?.busy;
    incoming.classList.toggle('cursor-busy-spin', spinEnabled && id === 'cursor-busy');
    outgoing.classList.remove('cursor-busy-spin');
    _ring?.classList.toggle('show', spinEnabled && id === 'cursor-working');

    incoming.style.opacity = '1';
    outgoing.style.opacity = '0';
}

function _applyVisibility(visible) {
    if (_root) _root.style.display = visible ? '' : 'none';
    if (visible && !_bootPhase) _fadeWindowIn();
}

function _applyNativeCursorRule() {
    const settings = state.getSettings();
    document.documentElement.classList.toggle('cursor-engine-native-hidden', !!settings?.enabled && !settings?.cssCursorAlso);
}

function _applySize() {
    const size = Number(state.getSettings()?.size) || 24;
    if (_svg) { _svg.setAttribute('width', String(size)); _svg.setAttribute('height', String(size)); }
}

function _applySettings(settings) {
    applyTheme(settings.theme);
    _applySize();
    _applyNativeCursorRule();
    _applyVisibility(settings.enabled ? state.isVisible() : false);
    if (_root) _root.style.display = settings.enabled ? (state.isVisible() ? '' : 'none') : 'none';
}

let _bound = false;
let _bootPhase = false;

/**
 * Fades the overlay in — CSS opacity transition, reused via a single class
 * toggle (never re-created), so a fast leave→enter simply reverses the same
 * in-flight transition instead of stacking or restarting one.
 */
function _fadeWindowIn() {
    _root?.classList.add('cursor-window-visible');
}

/** Fades the overlay out — see _fadeWindowIn(). */
function _fadeWindowOut() {
    _root?.classList.remove('cursor-window-visible');
}

// `mouseleave`/`mouseenter` don't bubble, but bound directly on `document`
// they fire exactly once each time the pointer crosses the viewport's own
// boundary (leaving/entering the browser window entirely) — the standard
// cross-browser technique, distinct from `pointerdown`'s click flourish
// above and from detect.js's per-element cursor-type tracking.
function _onWindowMouseLeave() {
    _fadeWindowOut();
}

function _onWindowMouseEnter() {
    _fadeWindowIn();
}

export function init() {
    if (_bound) return;
    _bound = true;
    _bootPhase = true;
    _injectCSS();
    _createOverlay();
    on('cursorchange', _applyCursorChange);
    on('positionchange', _applyPosition);
    on('visibilitychange', _applyVisibility);
    on('settingschange', _applySettings);
    on('permissionused', ({ active, programName }) => {
        if (active) showUsageBadge(programName);
        else hideUsageBadge();
    });

    document.addEventListener('pointerdown', flashClick, { passive: true });

    // Window-boundary fade — see _fadeWindowIn/_onWindowMouseLeave above.
    document.addEventListener('mouseleave', _onWindowMouseLeave);
    document.addEventListener('mouseenter', _onWindowMouseEnter);

    const settings = state.getSettings();
    if (settings) _applySettings(settings);

    if (window.__sandstormBootMouse) {
        requestAnimationFrame(() => requestAnimationFrame(_fadeWindowIn));
    }
    _bootPhase = false;
}

/** @param {{id: string, cursors: Array<{id, anchor}>}} manifest */
export function setPackManifest(manifest) {
    ANCHOR_BY_ID.clear();
    for (const c of manifest.cursors) ANCHOR_BY_ID.set(c.id, c.anchor);
}

export function showUsageBadge(programName) {
    if (!_usageBadge || !state.getSettings()?.security?.showUsage) return;
    _usageBadge.querySelector('.text').textContent = `${programName} styr muspekaren`;
    _usageBadge.classList.add('show');
}

export function hideUsageBadge() {
    _usageBadge?.classList.remove('show');
}

export function flashClick() {
    if (!state.getSettings()?.animations?.click) return;
    _root?.classList.remove('cursor-click');
    void _root?.offsetWidth;
    _root?.classList.add('cursor-click');
}
