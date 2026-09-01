/**
 * @file components/updates/readiness.js
 * @description Runtime-observation collector for the update readiness agent.
 *
 * IMPORTANT: this module returns OBSERVATIONS ONLY — never a verdict. The
 * server decides whether a cutover is safe, from these observations plus
 * its own health/rollback/dependency state. A tampered or broken client
 * must not be able to say "ready" on its own.
 *
 * Signal sources (all read live, nothing cached):
 *  - open programs / windows           → DOM `.window.pid-<id>` classes
 *  - sessions with undo history         → app.historyManager.has()/get().canUndo()
 *  - in-flight writes / uploads         → app.api.pendingWrites()
 *  - running background jobs            → app.program.getStatus(id)
 *  - active operations                  → app.updates._operations (opt-in, program-pushed)
 *
 * A note on `sessionsWithUndoHistory`: canUndo() does NOT mean the document
 * is unsaved — Sandstorm has no real dirty-state tracking yet (Notepad
 * confirms this in notepad_tabs.js). It is a *risk indicator* only. It is
 * reported under its literal name and never conflated with "unsaved".
 *
 * @module components/updates/readiness
 */

/**
 * @typedef {Object} AffectedPayload
 * @property {string}   updateId
 * @property {string[]} [affectedPrograms]
 * @property {string[]} [affectedServices]
 * @property {string[]} [affectedCapabilities]
 */

/**
 * Enumerate currently-open programs by parsing running windows' `pid-<id>`
 * classes (same technique startmenu/running_apps.js uses — window-level ids
 * from getAllWindowId() don't always match registered program ids).
 * @returns {Map<string, number>} programId → window count
 */
function openProgramWindowCounts() {
    const counts = new Map();
    document.querySelectorAll('.window[class*="pid-"]').forEach(el => {
        const m = /(?:^|\s)pid-([a-z0-9_-]+)(?:\s|$)/i.exec(el.className);
        if (!m) return;
        // A window minimized to the taskbar is still "open" for our purposes
        // (its state and any in-flight work survive). A window mid-close-
        // animation still counts too — being conservative is the safe bias.
        counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    });
    return counts;
}

function hasUndoHistory(programId) {
    try {
        return !!(app.historyManager
            && app.historyManager.has(programId)
            && app.historyManager.get(programId)
            && app.historyManager.get(programId).canUndo());
    } catch { return false; }
}

function programJobStatus(programId) {
    try {
        const s = app.program && app.program.getStatus && app.program.getStatus(programId);
        return (typeof s === 'string' && s.trim()) ? s.trim() : null;
    } catch { return null; }
}

function pendingWrites() {
    try { return (app.api && app.api.pendingWrites && app.api.pendingWrites()) || 0; }
    catch { return 0; }
}

/**
 * Rough 0..1 "how disruptive would a cutover be right now" heuristic. This
 * is a SOFT signal for the server's timing decision only — it is never a
 * gate. Weighted toward things that would lose work.
 */
function computeSoftScore({ touchedOpen, undoSessions, writes, jobs }) {
    let s = 0;
    s += Math.min(0.45, touchedOpen * 0.18);      // an affected program is open
    s += Math.min(0.30, undoSessions * 0.10);     // work-in-progress risk indicator
    s += writes > 0 ? 0.35 : 0;                    // active writes/uploads
    s += jobs > 0 ? 0.20 : 0;                      // background jobs running
    return Math.min(1, +s.toFixed(3));
}

/**
 * Collect a fresh readiness observation.
 * @param {AffectedPayload|null} [affected] - the server's impact list for the
 *   current update, so each open program can be marked `touchedByUpdate`.
 * @returns {Object} observations — see PROTOCOL.md for the exact shape.
 */
export function collect(affected = null) {

    const affectedPrograms = new Set((affected && affected.affectedPrograms) || []);
    const counts = openProgramWindowCounts();

    const openPrograms = [];
    const sessionsWithUndoHistory = [];
    const runningJobs = [];
    let touchedOpen = 0;

    for (const [id, windows] of counts) {
        const undo = hasUndoHistory(id);
        const touched = affectedPrograms.has(id);
        if (undo) sessionsWithUndoHistory.push(id);
        if (touched) touchedOpen++;

        openPrograms.push({
            id,
            windows,
            // NOT a dirty flag — see the module header. Reported as `undoHistory`
            // so no caller can mistake it for "unsaved changes".
            undoHistory: undo,
            touchedByUpdate: touched
        });

        const status = programJobStatus(id);
        if (status) runningJobs.push({ id, status });
    }

    const writes = pendingWrites();

    // Opt-in: a program can register a long operation it doesn't want
    // interrupted via app.updates.beginOperation(desc) / endOperation(token).
    const activeOperations = (() => {
        try { return (app.updates && app.updates._operations
            ? [...app.updates._operations.values()].map(o => ({ ...o })) : []); }
        catch { return []; }
    })();

    return {
        timestamp: Date.now(),
        clientId: (app.updates && app.updates.clientId) || null,
        updateId: (affected && affected.updateId) || null,

        openPrograms,
        sessionsWithUndoHistory,
        inFlightWrites: writes,
        runningJobs,
        activeOperations,

        softScore: computeSoftScore({
            touchedOpen,
            undoSessions: sessionsWithUndoHistory.length,
            writes,
            jobs: runningJobs.length
        })

        // Deliberately NO `verdict` / `safe` / `ready` field. The server
        // computes that. See PROTOCOL.md.
    };
}
