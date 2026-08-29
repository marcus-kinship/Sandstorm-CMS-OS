/**
 * @file explorer/window/index.js
 * @description Assembler for the explorer.js window-UI split. Exports
 * `start(os)` — creates a fresh per-window `state` (see state.js; Explorer
 * is `multistart: true`, so every open window gets its own independent
 * state object, never shared module-level state), registers this window's
 * entries on the shared `app.explorer.contextMenu`, builds the window via
 * `os.ui.windowStart`, and — once the window's DOM exists — registers the
 * instance for `app.explorer._instances`/`_refreshAll`, wires keyboard
 * shortcuts, binds every toolbar/panel control (toolbar.js), performs the
 * initial navigate/render, and sets up dialog mode if this window was
 * opened via `app.explorer.windows.fileDialog`.
 *
 * File Explorer program window for Sandstorm OS. Lazy-loaded by
 * `app.program.open()` the first time the user opens the program —
 * registration (the shared `app.explorer` API, folder icons, program
 * metadata) lives in `setup.js`.
 *
 * The explorer shell consists of three panes:
 * - Navigation sidebar (bookmarks, drives, folders tree via `exp-nav`)
 * - Toolbar with back/forward/up/refresh/search/view-toggle buttons
 * - Main content area with list or grid view
 *
 * File operations (open, rename, delete, new folder/file, drag-and-drop) are
 * implemented via the `app.explorer` API in `setup.js`.
 *
 * @module components/explorer/window/index
 */
import { createState } from './state.js';
import { node } from './fsutil.js';
import { update, navigate } from './core.js';
import { registerContextMenuEntries } from './menus.js';
import { bindWindowEvents } from './toolbar.js';
import { setupDialogMode } from './dialogmode.js';
import { startInlineNewFolder, startInlineNewFile } from './createitems.js';
import { handleQuickSearchKey } from './quicksearch.js';

export function start(os) {
    app.dev.log('[start] explorer start() called', 'Explorer');

    const state = createState();
    state.os = os;

    registerContextMenuEntries(state);

    // ── Window ────────────────────────────────────────────────────────────────

    os.ui.windowStart("explorer", {
        id:           "explorer",
        title:        _("Explorer"),
        windowIcon:   true,
        resizable:    true,
        width:        "1000px",
        height:       "700px",
        body(windowobj) {
            state.win = windowobj;

            const _capturedDialog = app.explorer._pendingDialog || null;
            if (_capturedDialog) app.explorer._pendingDialog = null;
            app.dev.log(`[body] called — windowId=${windowobj ? windowobj.windowId : 'undefined'} hasDialog=${!!_capturedDialog}`, 'Explorer');

            if (_capturedDialog && windowobj) {
                _capturedDialog._pendingResult = undefined;

                const _parentId = _capturedDialog.options?.parentId || null;
                const _dialogId = windowobj.windowId;
                app.dev.log(`[body] parentId=${_parentId} dialogId=${_dialogId}`, 'Explorer');

                windowobj.state.close(() => {
                    app.dev.log(`[body] state.close fired for ${_dialogId}`, 'Explorer');
                    const result = _capturedDialog._pendingResult !== undefined
                        ? _capturedDialog._pendingResult
                        : null;
                    _capturedDialog.resolve(result);
                    if (_parentId && app.windows?.closeDialog) {
                        app.windows.closeDialog(_dialogId);
                    }
                });

                if (_parentId && app.windows?.openDialog) {
                    const _statusText  = _capturedDialog.options?.statusText  || undefined;
                    const _dialogTitle = _capturedDialog.options?.dialogTitle || undefined;
                    setTimeout(() => {
                        app.dev.log(`[body] openDialog parentId=${_parentId} dialogId=${_dialogId}`, 'Explorer');
                        const ok = app.windows.openDialog({
                            parentId: _parentId,
                            dialogId: _dialogId,
                            modal: true,
                            statusText:  _statusText,
                            dialogTitle: _dialogTitle,
                        });
                        app.dev.log(`[body] openDialog returned: ${ok}`, 'Explorer');
                    }, 0);
                } else {
                    app.dev.warn(`[body] openDialog skipped parentId=${_parentId}`, 'Explorer');
                }
            } else if (_capturedDialog && !windowobj) {
                app.dev.warn('[body] windowobj undefined — state.close NOT registered', 'Explorer');
            }

            setTimeout(() => {
                const wid    = windowobj?.windowId || 'explorer-0';
                const _winEl = windowobj?.el?.[0] ?? document.querySelector(`#${wid}-win`);
                state.winRoot = _winEl?.querySelector('.exp-root') ?? null;
                app.dev.log(`[setTimeout] wid=${wid} elFound=${!!windowobj?.el?.[0]} winRoot=${!!state.winRoot} hasDialog=${!!_capturedDialog}`, 'Explorer');
                if (!state.winRoot) { app.dev.warn('[setTimeout] winRoot null — window DOM saknas, avbryter setup', 'Explorer'); return; }

                // Register this instance so newFolder/remove can refresh it
                const _inst = {
                    root:        state.winRoot,
                    currentPath: () => state.path,
                    update:      () => update(state),
                    navigate:    (p) => navigate(state, p),
                    get history() { return state.win?.history ?? null; },
                };
                app.explorer._instances.push(_inst);

                // Keep active pointers pointing to this window when it's focused
                const _setActive = () => {
                    app.explorer._activeStartInlineNewFolder = () => startInlineNewFolder(state);
                    app.explorer._activeStartInlineNewFile   = () => startInlineNewFile(state);
                    app.explorer._activeWin = _inst;
                };
                state.winRoot.addEventListener('mousedown',   _setActive);
                state.winRoot.addEventListener('contextmenu', _setActive, true);

                // ── Keyboard shortcuts (Delete = recycle bin, Ctrl+Z = undo, Ctrl+Shift+Z/Ctrl+Y = redo, A–Ö/0–9 = quick search) ──
                if (!state.isDialog) {
                    const _onKey = e => {
                        if (app.explorer._activeWin !== _inst) return;
                        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                        if (e.key === 'Delete' && !e.ctrlKey && !e.altKey) {
                            e.preventDefault();
                            if (state.selection.size > 0) app.recyclebin?.send([...state.selection]);
                        } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                            e.preventDefault();
                            _inst.history?.undo();
                        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
                            e.preventDefault();
                            _inst.history?.redo();
                        } else if (handleQuickSearchKey(state, e)) {
                            e.preventDefault();
                        }
                    };
                    document.addEventListener('keydown', _onKey);
                    // Clean up key listener when the window is removed from DOM
                    new MutationObserver(() => {
                        if (!document.contains(state.winRoot)) {
                            document.removeEventListener('keydown', _onKey);
                        }
                    }).observe(document.body, { childList: true, subtree: true });
                }

                // Wire every toolbar/panel/list-area DOM control
                bindWindowEvents(state, wid);

                // Navigate to pending path if opened via app.explorer.open(address)
                const pp = app.explorer?._pendingPath;
                if (pp && node(pp)) { app.explorer._pendingPath = null; navigate(state, pp); }
                else update(state);

                // Dialog mode — set up footer inside the correct window element
                if (_capturedDialog) {
                    app.dev.log('[setTimeout] anropar setupDialogMode', 'Explorer');
                    setupDialogMode(state, _capturedDialog, windowobj);
                }
            }, 0);

            return app.explorer.windows.buildShell();
        }
    });
}
