/**
 * @file window/element.js
 * @description The `WindowElement` class for the window-management split
 * (see window/index.js for the assembly). Split out of the original
 * monolithic window.js — moved verbatim, no logic changes.
 *
 * Dependency rule: imports from window/state.js only (for the `windowEvents`
 * bus's setEvent/triggerEvent/removeWindowEvent — `removeEvent` here is
 * renamed to `removeWindowEvent` on import to match state.js's own export,
 * itself renamed only to avoid colliding with the *other* bus's own
 * `removeEvent` now that both live in the same state.js module — see that
 * file's header comment). Everything else (`app.ui.windows.functions.*`)
 * is called through the live `app` object at runtime, same as today.
 *
 * @module components/ui/window/element
 */

import { setEvent, triggerEvent, removeWindowEvent } from './state.js';

// ── WindowElement class ───────────────────────────────────────────────────────

export class WindowElement {
    constructor(windowId, options, id) {
        this.windowId = windowId;
        this.el       = null;
        this.options  = options;
        this.pid      = id;
        this.taskId   = options.single ? windowId.replace(/-win$/, "") : id;
        this._temp    = {};
        this._session = {};
    }

    state = {
        before:     (callback) => setEvent(this.windowId, "before",     callback),
        ready:      (callback) => setEvent(this.windowId, "ready",      callback),
        close:      (callback) => setEvent(this.windowId, "close",      callback),
        programEnd: (callback) => setEvent(this.windowId, "programEnd", callback),
        minimize:   (callback) => setEvent(this.windowId, "minimize",   callback),
        maximize:   (callback) => setEvent(this.windowId, "maximize",   callback),
        resize:     (callback) => setEvent(this.windowId, "resize",     callback),
    };

    /**
     * This window's undo/redo session — created by program.js's open()
     * (historyScope:'public', the default — keyed by programId, shared by
     * every window of a multi-instance program) or by this same file's
     * windowStart() (historyScope:'private' — keyed by windowId, one
     * independent session per window) before this window's body() ever
     * runs, so it's always already there by the time a program reads it. A
     * live getter (not a value copied in the constructor) so it keeps
     * working correctly across the rare case of the session being
     * destroyed and recreated (e.g. a historyOnExit:'clear' program
     * closing and reopening) without this WindowElement itself being
     * reconstructed.
     *
     * Program code only ever sees execute()/undo()/redo()/clear()/
     * canUndo()/canRedo()/getHistory()/getPointer() — create()/destroy()
     * are internal to program.js/window.js and never exposed here.
     *
     * @example
     * body: function (win) {
     *     win.history.execute({
     *         title: "Create Header",
     *         do()   { ... },
     *         undo() { ... },
     *         redo() { ... }
     *     });
     * }
     */
    get history() {
        const info = app.program.getInfo(this.pid);
        const key  = info?.historyScope === 'private' ? this.windowId : this.pid;
        return app.historyManager?.get(key) ?? null;
    }

    ui = {
        prompt: (options) => {
            return app.ui.prompt({
                title:          options.title,
                text:           options.text,
                default:        options.default || "",
                width:          options.width  || 400,
                height:         options.height || 180,
                programid:      this.pid     || null,
                parentWindowId: this.windowId,
                modal:          true
            });
        }
    };

    async _triggerState(name, ...args) {
        await triggerEvent(this.windowId, name, ...args);
    }

    on(eventType, callback)        { return setEvent(this.windowId, eventType, callback); }
    trigger(eventType, ...args)    { triggerEvent(this.windowId, eventType, ...args); }
    off(eventType, callback)       { removeWindowEvent(this.windowId, eventType, callback); }
    close()                        { app.ui.windows.functions.closeWindow(this.windowId, this.taskId, this.pid, false); }
    minimize(event)                { app.ui.windows.functions.minimize(this.windowId, event); }
    maximize(event)                { app.ui.windows.functions.maximize(this.windowId, event); }
    title(newTitle)                { app.ui.windows.functions.updateTitle(this.windowId, newTitle); }
    setStatus(newStatus)           { app.program.setStatus(this.pid, newStatus); }
    getStatus()                    { return app.program.getStatus(this.pid); }

    /**
     * Inject a named CSS block scoped to this program. Removed automatically
     * when the program's last window closes (app.removeProgramCSS, called
     * from the window-close cleanup path) — no manual programEnd wiring needed.
     * For loading a CSS file by URL, use addProgramCSS(name, url, true) instead.
     * @param {string} uniqueName
     * @param {string} cssString
     */
    addCSS(uniqueName, cssString) {
        app.addProgramCSS(this.pid, uniqueName, cssString);
    }

    /**
     * Inject a named CSS block or load a CSS file, scoped to this program.
     * Automatically removed when the program's last window closes.
     * @param {string} identifier
     * @param {string} css - Raw CSS string, or a file URL when `path` is true.
     * @param {boolean} [path=false]
     * @returns {Promise<void>}
     */
    async addProgramCSS(identifier, css, path = false) {
        await app.addProgramCSS(this.pid, identifier, css, path);
    }

    session = {
        set:    (key, value) => { app.program.session.set(this.pid, key, value); },
        get:    (key)        => { return app.program.session.get(this.pid, key); },
        remove: (key)        => { app.program.session.remove(this.pid, key); },
        clear:  ()           => { app.program.session.clear(this.pid); },
    };

    temp = {
        set: (key, value) => { this._temp[key] = value; },
        get: (key)        => this._temp[key]
    };

    async loadRes(resources = []) {
        await app.load.resources(resources);
        this.state.programEnd(() => app.load.removeResources(resources));
    }
}
