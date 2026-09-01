/**
 * @file components/updates/handoff.js
 * @description The client-side cutover state machine + steps.
 *
 * The point of a handoff (vs a blunt location.reload()) is that the user
 * should experience "the system updated — carry on", not "it reloaded and I
 * lost my place". So: commit open work, freeze new actions, wait for the
 * server to actually swap, reconnect against the new version, restore the UI.
 *
 * State machine (see PROTOCOL.md):
 *
 *   idle → preparing → waiting-for-readiness → lease-active
 *        → handoff → cutover → reconnecting → complete
 *
 * From (almost) any state:  → aborted → idle
 *
 * FAIL-CLOSED: the two steps that need a backend that does not exist yet —
 * waitForCutover() and reconnect() — return { status:'not-implemented',
 * safe:false } and NEVER simulate success. A handoff that reaches them
 * aborts cleanly (unfreezes, restores) rather than leaving the user stuck
 * or falsely telling them the update is done.
 *
 * @module components/updates/handoff
 */

export const STATES = Object.freeze([
    'idle', 'preparing', 'waiting-for-readiness', 'lease-active',
    'handoff', 'cutover', 'reconnecting', 'complete', 'aborted'
]);

// Steps a flush request gives a program to save itself before we give up on it.
const FLUSH_DEADLINE_MS = 2500;

function log(...a) { try { app.dev.log(a.join(' '), 'Updates'); } catch {} }
function emit(event, detail) { try { app.lifecycle.emit(event, detail); } catch {} }

/**
 * Creates a handoff controller bound to `updates` (the app.updates object).
 * One controller instance per app.updates; it owns `updates.state`.
 */
export function createHandoff(updates) {

    let currentUpdateId = null;
    let lease = null;
    let frozen = false;
    let flushedPrograms = [];

    function setState(next, extra = {}) {
        if (!STATES.includes(next)) return;
        updates.state = next;
        emit('update.state', { state: next, updateId: currentUpdateId, ...extra });
        log('state →', next);
    }

    /** Stale-message guard: ignore anything not for the update we're on. */
    function isForCurrentUpdate(msg) {
        if (!msg || !msg.updateId) return false;
        if (currentUpdateId && msg.updateId !== currentUpdateId) {
            log('ignoring message for stale updateId', msg.updateId, '(current', currentUpdateId + ')');
            return false;
        }
        return true;
    }

    function leaseValid() {
        if (!lease || !lease.id) return false;
        const exp = Date.parse(lease.expiresAt || '');
        return Number.isFinite(exp) && exp > Date.now();
    }

    // ── Steps ────────────────────────────────────────────────────────────────

    /**
     * Ask every open program to persist its work. Best-effort: we dispatch a
     * `sandstorm:flush` CustomEvent on each window and a program answers by
     * calling `event.detail.done()`. Programs that don't listen are recorded
     * as `unflushed` (a risk the server is told about, not a hard failure).
     */
    async function flushSessions() {
        const windows = [...document.querySelectorAll('.window[class*="pid-"]')];
        const pending = new Set();
        const flushed = [];

        windows.forEach(winEl => {
            const m = /(?:^|\s)pid-([a-z0-9_-]+)(?:\s|$)/i.exec(winEl.className);
            const id = m ? m[1] : null;
            if (!id) return;
            pending.add(id);
            const ev = new CustomEvent('sandstorm:flush', {
                detail: { programId: id, done: () => { pending.delete(id); if (!flushed.includes(id)) flushed.push(id); } }
            });
            winEl.dispatchEvent(ev);
        });

        // Also nudge the two programs known to have a save action, in case
        // they haven't wired the event yet.
        try {
            document.querySelectorAll('.window.pid-notepad').forEach(w => {
                const inst = app.store && app.store.get(w);
                inst && inst.win && inst.win._np && inst.win._np.save && inst.win._np.save();
            });
        } catch {}

        const start = Date.now();
        while (pending.size && Date.now() - start < FLUSH_DEADLINE_MS) {
            await new Promise(r => setTimeout(r, 100));
        }

        flushedPrograms = flushed;
        return { flushed, unflushed: [...pending] };
    }

    /** Block new user actions during the cutover window. Reversible. */
    function freeze() {
        if (frozen) return;
        frozen = true;
        updates.frozen = true;
        document.documentElement.classList.add('sandstorm-updating');
        // A transparent scrim on <body> so clicks can't start new work.
        let scrim = document.getElementById('sandstorm-update-scrim');
        if (!scrim) {
            scrim = document.createElement('div');
            scrim.id = 'sandstorm-update-scrim';
            scrim.style.cssText =
                'position:fixed;inset:0;z-index:2147483000;cursor:progress;' +
                'background:transparent;';
            document.body.appendChild(scrim);
        }
        emit('update.frozen', { updateId: currentUpdateId });
        log('frozen');
    }

    function unfreeze() {
        if (!frozen) return;
        frozen = false;
        updates.frozen = false;
        document.documentElement.classList.remove('sandstorm-updating');
        document.getElementById('sandstorm-update-scrim')?.remove();
        emit('update.unfrozen', { updateId: currentUpdateId });
        log('unfrozen');
    }

    /**
     * STUB — fail-closed. The real implementation polls the server (or reads
     * the transport) until it confirms the new version is live and healthy.
     * Until the backend exists this returns safe:false so a handoff that
     * reaches it aborts instead of pretending the swap happened.
     */
    async function waitForCutover() {
        log('waitForCutover(): backend transport not implemented — fail-closed');
        return { status: 'not-implemented', safe: false };
    }

    /**
     * STUB — fail-closed. The real implementation re-fetches the version
     * marker / health endpoint against the swapped server and verifies the
     * client is now talking to the new version. Never reports success while
     * unimplemented.
     */
    async function reconnect() {
        log('reconnect(): backend transport not implemented — fail-closed');
        return { status: 'not-implemented', safe: false };
    }

    /** Unfreeze and let the user carry on; re-focus what we flushed. */
    function restoreSessions() {
        unfreeze();
        setState('complete');
        try {
            app.notifications?.notify?.({
                title: _('System updated'),
                body: _('You can continue where you left off.'),
                priority: 'info', programId: 'updates'
            });
        } catch {}
        // Return to idle so a future update can run.
        currentUpdateId = null;
        lease = null;
        setTimeout(() => { if (updates.state === 'complete') setState('idle'); }, 4000);
    }

    // ── Public controller API ────────────────────────────────────────────────

    return {
        get state() { return updates.state; },
        get updateId() { return currentUpdateId; },
        get lease() { return lease; },
        isFrozen: () => frozen,

        /** Begin tracking an update the server has prepared. */
        adopt(msg) {
            if (!msg || !msg.updateId) return;
            if (currentUpdateId && currentUpdateId !== msg.updateId && updates.state !== 'idle') {
                log('server switched updateId mid-flight — aborting old', currentUpdateId);
                this.abort('superseded');
            }
            currentUpdateId = msg.updateId;
            lease = msg.lease || null;
            updates.currentUpdateId = currentUpdateId;
            updates.affected = {
                updateId: msg.updateId,
                affectedPrograms: msg.affectedPrograms || [],
                affectedServices: msg.affectedServices || [],
                affectedCapabilities: msg.affectedCapabilities || []
            };
            if (updates.state === 'idle') setState('preparing');
            setState('waiting-for-readiness');
        },

        /** Server directive: it wants us ready and holding a lease. */
        holdLease(msg) {
            if (!isForCurrentUpdate(msg)) return;
            lease = msg.lease || lease;
            setState('lease-active');
        },

        /**
         * Server directive: cut over NOW. Requires a currently-valid lease —
         * a `cutover-now` without one is refused (see PROTOCOL.md).
         */
        async cutover(msg) {
            if (!isForCurrentUpdate(msg)) return;
            if (msg.lease) lease = msg.lease;
            if (!leaseValid()) {
                log('REFUSED cutover-now: no valid lease');
                emit('update.refused', { updateId: currentUpdateId, reason: 'no-valid-lease' });
                return;
            }

            setState('handoff');
            const flush = await flushSessions();
            emit('update.flushed', { updateId: currentUpdateId, ...flush });

            freeze();
            setState('cutover');

            const cut = await waitForCutover();
            if (!cut.safe) { this.abort('cutover-transport-unavailable'); return; }

            setState('reconnecting');
            const rc = await reconnect();
            if (!rc.safe) { this.abort('reconnect-failed'); return; }

            restoreSessions();
        },

        /** Roll the client back to a usable state from anywhere. */
        abort(reason = 'aborted') {
            log('abort:', reason);
            unfreeze();
            setState('aborted', { reason });
            try {
                if (reason !== 'server idle' && reason !== 'superseded') {
                    app.notifications?.notify?.({
                        title: _('Update postponed'),
                        body: _('The system will try again later. Nothing was changed.'),
                        priority: 'info', programId: 'updates'
                    });
                }
            } catch {}
            currentUpdateId = null;
            lease = null;
            updates.currentUpdateId = null;
            updates.affected = null;
            setTimeout(() => { if (updates.state === 'aborted') setState('idle'); }, 2000);
        },

        // exposed for tests / the panel
        _steps: { flushSessions, freeze, unfreeze, waitForCutover, reconnect, restoreSessions },
        _leaseValid: leaseValid
    };
}
