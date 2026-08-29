/**
 * @file historyManager.js
 * @description Sandstorm OS's central history engine — undo/redo, command
 * pattern, one independent history session per running program.
 *
 * Internal API (program.js / window.js only):
 * - {@link app.historyManager.create}
 * - {@link app.historyManager.destroy}
 * - {@link app.historyManager.get}
 * - {@link app.historyManager.has}
 *
 * Public API (what a program actually uses, via `win.history` — see
 * window.js's `WindowElement.history` getter): `execute()`, `undo()`,
 * `redo()`, `clear()`, `canUndo()`, `canRedo()`, `getHistory()`,
 * `getPointer()`. A program never calls `app.historyManager.create()`
 * itself — `program.js`'s `open()` does that before the program's own
 * `main()` runs, keyed off `historyOnExit` from the program's own
 * `os.program.addInfo()` registration.
 *
 * @module components/historyManager
 */

const sessions = new Map(); // programId -> HistorySession

const DEFAULT_OPTIONS = { maxHistory: 1000, historyOnExit: 'clear' };

/**
 * @typedef {Object} HistoryCommand
 * @property {string} title
 * @property {string} [type]
 * @property {function(): void} do
 * @property {function(): void} undo
 * @property {function(): void} redo
 */

class HistorySession {
    constructor(programId, options) {
        this.programId = programId;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.history = [];
        this.pointer = -1;
    }

    /** @param {HistoryCommand} command */
    execute(command) {
        command.do();

        // A fresh execute() after one or more undo()s discards the
        // now-stale redo tail — standard command-pattern behavior, so a
        // later redo() can never replay a command whose "before" state no
        // longer matches reality.
        this.history.splice(this.pointer + 1);
        this.history.push(command);
        this.pointer = this.history.length - 1;

        if (this.history.length > this.options.maxHistory) {
            this.history.shift();
            this.pointer--;
        }

        app.dev.log('history', 'execute', command.title);
        app.lifecycle.emit('history.execute', { programId: this.programId, title: command.title });
        app.lifecycle.emit('history.changed', { programId: this.programId });
    }

    undo() {
        if (!this.canUndo()) return;
        const command = this.history[this.pointer];
        command.undo();
        this.pointer--;

        app.dev.log('history', 'undo', command.title);
        app.lifecycle.emit('history.undo', { programId: this.programId, title: command.title });
        app.lifecycle.emit('history.changed', { programId: this.programId });
    }

    redo() {
        if (!this.canRedo()) return;
        const command = this.history[this.pointer + 1];
        command.redo();
        this.pointer++;

        app.dev.log('history', 'redo', command.title);
        app.lifecycle.emit('history.redo', { programId: this.programId, title: command.title });
        app.lifecycle.emit('history.changed', { programId: this.programId });
    }

    clear() {
        this.history = [];
        this.pointer = -1;

        app.dev.log('history', 'clear');
        app.lifecycle.emit('history.clear', { programId: this.programId });
        app.lifecycle.emit('history.changed', { programId: this.programId });
    }

    canUndo() { return this.pointer >= 0; }
    canRedo() { return this.pointer < this.history.length - 1; }
    getHistory() { return [...this.history]; }
    getPointer() { return this.pointer; }
}

app.historyManager = {
    /**
     * Creates (or returns the existing) history session for `programId` —
     * idempotent, so calling it again for a program that already has a
     * session (e.g. opening a second window of a multi-instance program)
     * just returns the same session rather than resetting it.
     * @param {string} programId
     * @param {{maxHistory?: number, historyOnExit?: 'clear'|'keep'}} [options]
     * @returns {HistorySession}
     */
    create(programId, options = {}) {
        if (sessions.has(programId)) return sessions.get(programId);
        const session = new HistorySession(programId, options);
        sessions.set(programId, session);
        app.dev.log('history', 'create', programId);
        app.lifecycle.emit('history.create', { programId });
        return session;
    },

    /**
     * Removes a program's history session entirely. Called by window.js's
     * programEnd handling when that program's `historyOnExit` is `'clear'`.
     * @param {string} programId
     */
    destroy(programId) {
        if (!sessions.has(programId)) return;
        sessions.delete(programId);
        app.dev.log('history', 'destroy', programId);
        app.lifecycle.emit('history.destroy', { programId });
    },

    /**
     * @param {string} programId
     * @returns {HistorySession|null}
     */
    get(programId) {
        return sessions.get(programId) ?? null;
    },

    /**
     * @param {string} programId
     * @returns {boolean}
     */
    has(programId) {
        return sessions.has(programId);
    }
};

app.lock('historyManager.create', { writable: false, configurable: false });
app.lock('historyManager.destroy', { writable: false, configurable: false });
app.lock('historyManager.get', { writable: false, configurable: false });
app.lock('historyManager.has', { writable: false, configurable: false });
