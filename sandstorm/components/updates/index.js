/**
 * @file components/updates/index.js
 * @description Update readiness agent — wiring.
 *
 * Sandstorm's role in a deployment is deliberately narrow: be a *readiness
 * agent* and the *cutover UX*, not the deploy engine. The server prepares
 * the new version (blue-green), runs health checks, owns rollback and the
 * dependency graph, and makes the final go/no-go decision. This module:
 *
 *   1. collects runtime OBSERVATIONS (readiness.js) — never a verdict
 *   2. runs the client-side handoff state machine (handoff.js)
 *   3. renders the pre-swap / waiting UI (panel.js)
 *
 * Transport is pluggable and knows nothing about readiness/handoff:
 *   - primary: polling `configure({ transport:'poll', ... })`. Each poll
 *     carries the current observations and doubles as the lease heartbeat.
 *   - alternative: `document` event `sandstorm:update` (for a future
 *     SSE/WebSocket layer) → same `app.updates.signal()` pipeline.
 *
 * See PROTOCOL.md for the full client/server contract.
 *
 * @module components/updates/index
 */

import { collect } from './readiness.js';
import { createHandoff } from './handoff.js';
import { render as renderPanel } from './panel.js';

export function setup(os) {

    // Loaded via app.includeProgram (load.js `programs`), which
    // unconditionally calls app.program.add() right after setup() — so a
    // system id must be registered here or program.js logs its "No program
    // ID set" warning every boot (same reason search/index.js and
    // responsivelayout/index.js do this). taskbar/startmenu both false.
    os.program.addInfo('updates', {
        name: () => _('Updates'),
        version: '1.0',
        owner: 'Marcus Larsson',
        description: () => _('Update readiness agent'),
        icontype: 'svg',
        icon: '#ic-cp-update',
        taskbar: false,
        startmenu: false,
        multistart: false,
        main: 'start',
        programtype: 'system',
    });

    // app.updates may already exist — controlpanel/programs/update.js adds
    // startMenuUpdateTab to it. Augment, don't clobber.
    const updates = (window.app.updates = window.app.updates || {});

    updates.clientId = updates.clientId
        || (self.crypto && crypto.randomUUID ? crypto.randomUUID()
            : 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36));

    updates.state = 'idle';
    updates.currentUpdateId = null;
    updates.affected = null;
    updates.frozen = false;
    updates._operations = new Map();
    updates._lastServerMessage = null;

    updates.readiness = { collect: (affected) => collect(affected || updates.affected) };

    const handoff = createHandoff(updates);
    updates.handoff = handoff;
    updates.panel = { render: renderPanel };

    // ── Opt-in long-operation tracking ──────────────────────────────────────
    // A program that starts something it does not want interrupted (a big
    // import, a multi-step publish) calls beginOperation() and endOperation().
    updates.beginOperation = (description = 'operation', programId = null) => {
        const token = 'op_' + Math.random().toString(36).slice(2);
        updates._operations.set(token, { token, description, programId, since: Date.now() });
        return token;
    };
    updates.endOperation = (token) => { updates._operations.delete(token); };

    // ── Transport-agnostic pipeline entry ──────────────────────────────────
    // Every transport (poll response, CustomEvent, future WS frame) funnels
    // through here. Guards on updateId so a stale message can't revive a
    // finished update.
    updates.signal = (msg) => {
        if (!msg || typeof msg !== 'object') return;
        updates._lastServerMessage = msg;

        const directive = msg.directive || 'idle';

        // Stale-message guard.
        if (updates.currentUpdateId && msg.updateId && msg.updateId !== updates.currentUpdateId
            && directive !== 'prepare-handoff' && directive !== 'idle') {
            return;
        }

        switch (directive) {
            case 'idle':
                if (updates.state !== 'idle') handoff.abort('server idle');
                break;
            case 'prepare-handoff':
                handoff.adopt(msg);
                if (msg.hold || msg.lease) handoff.holdLease(msg);
                break;
            case 'cutover-now':
                handoff.cutover(msg);
                break;
            case 'aborted':
                handoff.abort('server aborted');
                break;
            default:
                try { app.dev.warn('unknown update directive: ' + directive, 'Updates'); } catch {}
        }

        refreshOpenPanels();
    };

    // ── Polling transport ─────────────────────────────────────────────────
    let pollTimer = null;
    updates.config = { transport: null, url: null, action: 'update.poll', intervalMs: 30000 };

    updates.configure = (cfg = {}) => {
        Object.assign(updates.config, cfg);
        if (updates.config.transport === 'poll') startPolling();
        else stopPolling();
    };

    updates.poll = async () => {
        const c = updates.config;
        const url = c.url || (app.config && app.config.local && app.config.local.jsapiLink);
        if (!url) return null;

        const body = {
            action: c.action,
            clientId: updates.clientId,
            currentUpdateId: updates.currentUpdateId,
            state: updates.state,
            observations: updates.readiness.collect()
        };

        try {
            const res = await app.api.post(url, body);
            const msg = res && (res.data || res);
            if (msg) updates.signal(msg);
            return msg;
        } catch (e) {
            // A missed poll must NOT advance anything — it just means the
            // lease is not renewed. Fail-safe by omission.
            try { app.dev.log('update poll failed: ' + (e && e.message), 'Updates'); } catch {}
            return null;
        }
    };

    function startPolling() {
        stopPolling();
        const iv = Math.max(5000, updates.config.intervalMs || 30000);
        pollTimer = setInterval(() => updates.poll(), iv);
        updates.poll();
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
    updates._stopPolling = stopPolling;

    // ── Alternative transport: a CustomEvent an external layer can fire ────
    document.addEventListener('sandstorm:update', (e) => {
        if (e && e.detail) updates.signal(e.detail);
    });

    // ── Panel plumbing ────────────────────────────────────────────────────
    // Any mounted panel marks itself with [data-updates-panel]; we re-render
    // it whenever state changes. Buttons use [data-upd-action].
    function refreshOpenPanels() {
        document.querySelectorAll('[data-updates-panel]').forEach(el => {
            renderPanel(el, {
                readiness: updates.readiness.collect(),
                server: mergedServerCtx(),
                state: updates.state
            });
        });
    }
    updates._refreshPanels = refreshOpenPanels;

    function mergedServerCtx() {
        const m = updates._lastServerMessage || {};
        return {
            directive: m.directive || 'idle',
            affectedPrograms: (updates.affected && updates.affected.affectedPrograms) || m.affectedPrograms || [],
            checks: m.checks || {},
            estimatedDisruptionMs: m.estimatedDisruptionMs,
            currentVersion: m.currentVersion
        };
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-upd-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-upd-action');
        if (action === 'update-now') {
            // The user consents; tell the server via the next poll body.
            updates._userConsent = { updateId: updates.currentUpdateId, at: Date.now() };
            updates.poll();
        } else if (action === 'defer') {
            updates._userConsent = null;
            handoff.abort('user deferred');
        } else if (action === 'check') {
            updates.poll();
        }
    });

    app.lifecycle.on('update.state', () => refreshOpenPanels());
    app.lifecycle.on('history.changed', () => refreshOpenPanels());

    try { app.dev.log('update readiness agent ready (transport idle until configure())', 'Updates'); } catch {}
}

export function start() {}
