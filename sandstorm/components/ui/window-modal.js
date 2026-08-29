/**
 * @file window-modal.js
 * @description Strict modal-dialog system for the Sandstorm window manager.
 *
 * Exposes `app.windows` with:
 *   openDialog({ parentId, dialogId, modal })
 *   closeDialog(dialogId)
 *   destroyWindow(windowId)
 *   getWindowState(windowId)
 *
 * ARCHITECTURE:
 *   - Every window has explicit state: { id, parentId, mode, dialogOpen, dialogId }
 *   - Dialog is a sub-state on the parent (dialogOpen boolean), not a separate system.
 *   - parentId is ALWAYS from options — never from config fallback.
 *   - All cleanup goes through _destroyDialogLink() — one guaranteed path.
 *
 * RULES enforced:
 *   - Parent must exist and must not itself be a dialog (mode === "dialog").
 *   - Parent may have at most one active dialog at a time.
 *   - A dialog cannot host another dialog.
 *   - Modal creates a visual + interactive lock-layer over the parent.
 *
 * Must load AFTER window.js (needs app.ui.windows.functions and app.setActiveWindow).
 *
 * @module components/ui/window-modal
 */
(function (app) {

    /**
     * Per-window modal state.
     *
     * mode      "main"   — normal window, can host a dialog
     *           "dialog" — currently acting as a dialog for parentId
     *
     * dialogOpen true when this (main) window has an active dialog open.
     * dialogId   ID of the currently active child dialog (set when dialogOpen=true).
     * parentId   ID of this window's parent (set when mode="dialog").
     *
     * @type {Map<string, {id:string, parentId:string|null, mode:"main"|"dialog", dialogOpen:boolean, dialogId:string|null}>}
     */
    const _windowStates = new Map();

    /** Active overlay elements keyed by parentId. @type {Map<string, HTMLElement>} */
    const _overlays = new Map();

    /** MutationObservers tracking parent position/size. @type {Map<string, MutationObserver>} */
    const _observers = new Map();

    /** Maps parentId → dialogId (used by unlockWindowLayer). @type {Map<string,string>} */
    const _parentToDialog = new Map();

    /** Saved parent taskbar callbacks restored on unlock. @type {Map<string,Function>} */
    const _savedCallbacks = new Map();

    /** Original dialog title+icon saved in lockWindowLayer, restored in unlockWindowLayer.
     *  @type {Map<string, {title:string|null, icon:{type:string,path:string}|null}>} */
    const _savedDialogMeta = new Map();

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _getWindowEl(windowId) {
        return $(`#${windowId}-win`)[0];
    }

    function _windowExists(windowId) {
        return !!_getWindowEl(windowId);
    }

    function _getOrCreateWindowState(windowId) {
        if (!_windowStates.has(windowId)) {
            _windowStates.set(windowId, {
                id:         windowId,
                parentId:   null,
                mode:       "main",
                dialogOpen: false,
                dialogId:   null
            });
        }
        return _windowStates.get(windowId);
    }

    /**
     * Guaranteed cleanup path — resets both sides of a dialog link atomically.
     * Always call this before unlockWindowLayer / focus-return / taskbar restore.
     */
    function _destroyDialogLink(dialogId, parentId) {
        if (dialogId) {
            const ds = _windowStates.get(dialogId);
            if (ds) {
                ds.mode     = "main";
                ds.parentId = null;
            }
        }
        if (parentId) {
            const ps = _windowStates.get(parentId);
            if (ps) {
                ps.dialogOpen = false;
                ps.dialogId   = null;
            }
        }
    }

    /** Recalculate overlay bounds to match current parent position/size. */
    function _updateOverlayBounds(parentId) {
        const overlay  = _overlays.get(parentId);
        const parentEl = _getWindowEl(parentId);
        if (!overlay || !parentEl) return;

        const rect    = parentEl.getBoundingClientRect();
        const parentZ = parseInt(parentEl.style.zIndex, 10) || 0;

        overlay.style.top    = rect.top    + "px";
        overlay.style.left   = rect.left   + "px";
        overlay.style.width  = rect.width  + "px";
        overlay.style.height = rect.height + "px";
        overlay.style.zIndex = parentZ + 1;
    }

    /**
     * Sets overlay bounds to explicit target values instead of reading
     * `getBoundingClientRect()`. Callers that already know the parent's exact
     * destination rect (e.g. dragresize.js's `adjust()`, which computes the
     * clamped/workspace position itself) should use this instead of relying
     * on the MutationObserver + `_updateOverlayBounds` path: that path reads
     * the parent's live rect, which is racy against the parent's own CSS
     * position transition (the observer's mutation callback can fire before
     * the transition has visibly progressed, freezing the overlay near the
     * start position for the rest of the animation). The overlay has a
     * matching CSS transition of its own (see the "window-modal" CSS below),
     * so setting the final target here lets it animate there in lockstep
     * with the parent rather than snapping or lagging behind it.
     */
    function setOverlayBounds(parentId, { top, left, width, height } = {}) {
        const overlay = _overlays.get(parentId);
        if (!overlay) return;
        if (top    !== undefined) overlay.style.top    = top    + "px";
        if (left   !== undefined) overlay.style.left   = left   + "px";
        if (width  !== undefined) overlay.style.width  = width  + "px";
        if (height !== undefined) overlay.style.height = height + "px";
    }

    /** Ensure the dialog element sits above the overlay. */
    function _ensureDialogAboveOverlay(parentId) {
        const overlay     = _overlays.get(parentId);
        const parentState = _windowStates.get(parentId);
        if (!overlay || !parentState || !parentState.dialogId) return;

        const dialogEl = _getWindowEl(parentState.dialogId);
        if (!dialogEl) return;

        const overlayZ = parseInt(overlay.style.zIndex, 10) || 0;
        const dialogZ  = parseInt(dialogEl.style.zIndex, 10) || 0;

        if (dialogZ <= overlayZ) {
            dialogEl.style.zIndex = overlayZ + 1;
        }
    }

    /** Brief visual pulse on a dialog to draw attention when parent is clicked. */
    function _pulseDialog(dialogId) {
        const dialogEl = _getWindowEl(dialogId);
        if (!dialogEl) return;
        dialogEl.classList.remove("modal-focus-pulse");
        void dialogEl.offsetWidth;
        dialogEl.classList.add("modal-focus-pulse");
        setTimeout(() => dialogEl.classList.remove("modal-focus-pulse"), 500);
    }

    // -------------------------------------------------------------------------
    // lockWindowLayer
    // -------------------------------------------------------------------------

    /**
     * Activates the full modal lock between a parent window and its dialog.
     *
     * A) Sets parent state (dialogOpen=true, dialogId) and dialog state (mode="dialog", parentId).
     * B) Creates a click-blocking overlay covering the parent's bounding box.
     * C) Ensures dialog z-index is above overlay.
     * D) Moves focus to dialog.
     * E) Hides dialog taskbar icon; overrides parent taskbar callback to control both windows.
     * F) Disables resize/drag on parent; installs MutationObserver to track position changes.
     *
     * @param {string} parentId
     * @param {string} dialogId
     */
    function lockWindowLayer(parentId, dialogId, statusText, dialogTitle) {
        const parentEl = _getWindowEl(parentId);
        const dialogEl = _getWindowEl(dialogId);
        if (!parentEl || !dialogEl) return;

        // ── A) Update explicit state ──────────────────────────────────────────
        const parentState        = _getOrCreateWindowState(parentId);
        parentState.dialogOpen   = true;
        parentState.dialogId     = dialogId;

        const dialogState        = _getOrCreateWindowState(dialogId);
        dialogState.mode         = "dialog";
        dialogState.parentId     = parentId;

        // ── D) Focus dialog first so we can read its resulting z-index ────────
        if (app.ui && app.ui.caret) {
            if (typeof app.ui.caret.saveState === "function") app.ui.caret.saveState(parentId);
            if (typeof app.ui.caret.hidden   === "function") app.ui.caret.hidden();
        }
        if (typeof app.setActiveWindow === "function") {
            app.setActiveWindow(dialogId);
        }

        // ── B) Overlay layer ──────────────────────────────────────────────────
        const rect    = parentEl.getBoundingClientRect();
        const parentZ = parseInt(parentEl.style.zIndex, 10) || 0;

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.setAttribute("data-parent-id", parentId);
        overlay.setAttribute("data-dialog-id", dialogId);
        overlay.style.cssText = [
            "position: fixed",
            `top: ${rect.top}px`,
            `left: ${rect.left}px`,
            `width: ${rect.width}px`,
            `height: ${rect.height}px`,
            `z-index: ${parentZ + 1}`,
            "cursor: default",
            "pointer-events: all",
            "background-color: var(--theme-backgruondcolore, #00000080)",
            "transition: opacity 180ms ease"
        ].join(";");

        const statusEl = document.createElement("div");
        statusEl.className = "modal-overlay-status";
        statusEl.textContent = statusText || _("The program is waiting for the user");
        overlay.appendChild(statusEl);

        // Clicks on overlay → redirect to dialog
        overlay.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (typeof app.setActiveWindow === "function") {
                app.setActiveWindow(dialogId);
            }
            _pulseDialog(dialogId);
        }, true);

        overlay.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
        }, true);

        overlay.addEventListener("contextmenu", (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        // Prepare dialog for entrance animation (start invisible)
        dialogEl.style.transition = "opacity 180ms ease";
        dialogEl.style.opacity    = "0";

        document.body.appendChild(overlay);
        overlay.style.setProperty("opacity", "0", "important");
        _overlays.set(parentId, overlay);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.setProperty("opacity", "1", "important");
            dialogEl.style.opacity = "1";
        }));
        // Clear dialog inline fade styles once animation is done
        setTimeout(() => {
            dialogEl.style.transition = "";
            dialogEl.style.opacity    = "";
        }, 300);

        // ── C) Dialog must be above overlay ───────────────────────────────────
        const dialogZ = parseInt(dialogEl.style.zIndex, 10) || 0;
        if (dialogZ <= parentZ + 1) {
            dialogEl.style.zIndex = parentZ + 2;
        }

        // ── E) Taskbar: hide dialog icon, merge callbacks ─────────────────────
        const parentPid = parentId.replace(/-\d+$/, "");
        const dialogPid = dialogId.replace(/-\d+$/, "");

        _parentToDialog.set(parentId, dialogId);

        // Only merge icons when dialog belongs to a different program than the parent
        if (app.desktop && app.desktop.taskbar && app.desktop.taskbar.config
                && dialogPid !== parentPid) {

            const dialogIconData = app.desktop.taskbar.config.taskIcons.find(
                i => i.id === `pid-${dialogPid}-task`
            );
            const _dialogProgramWindows = document.querySelectorAll(`.pid-${dialogPid}`).length;
            if (dialogIconData && _dialogProgramWindows <= 1) dialogIconData.hidden = true;

            {
                const _dTitleEl = dialogEl.querySelector(".window-header .title");
                const _dSvgUse  = dialogEl.querySelector(".window-header .icon svg use");
                const _dImgEl   = dialogEl.querySelector(".window-header .icon img");

                // Save dialog's originals so unlockWindowLayer can restore them
                _savedDialogMeta.set(dialogId, {
                    title: _dTitleEl ? _dTitleEl.textContent.trim() : null,
                    icon:  _dSvgUse
                        ? { type: "svg", path: _dSvgUse.getAttribute("href") }
                        : _dImgEl
                            ? { type: "img", path: _dImgEl.getAttribute("src") }
                            : null
                });

                // Apply parent's icon directly to dialog header (no taskbar config touched)
                const _pSvgUse = parentEl.querySelector(".window-header .icon svg use");
                const _pImgEl  = parentEl.querySelector(".window-header .icon img");
                const _parentIconHtml = _pSvgUse
                    ? `<svg><use href="${_pSvgUse.getAttribute("href")}"></use></svg>`
                    : _pImgEl
                        ? `<img src="${_pImgEl.getAttribute("src")}" alt="" />`
                        : null;
                if (_parentIconHtml) {
                    const _ic = dialogEl.querySelector(".window-header .icon");
                    if (_ic) {
                        const _ex = _ic.querySelector("img, svg");
                        if (_ex) _ex.remove();
                        _ic.insertAdjacentHTML("afterbegin", _parentIconHtml);
                    }
                }

                // Apply composite title directly to dialog header (no taskbar config touched)
                const _pTitle  = parentEl.querySelector(".window-header .title")?.textContent.trim();
                const _suffix  = dialogTitle || (_dTitleEl ? _dTitleEl.textContent.trim() : null);
                if (_pTitle && _suffix && _dTitleEl) {
                    _dTitleEl.textContent = `${_pTitle} — ${_suffix}`;
                }
            }

            // Override parent callback to control both windows together
            const parentIconData = app.desktop.taskbar.config.taskIcons.find(
                i => i.id === `pid-${parentPid}-task`
            );
            if (parentIconData && !_savedCallbacks.has(parentId)) {
                _savedCallbacks.set(parentId, parentIconData.callback);

                parentIconData.callback = function () {
                    const parentWinEl = _getWindowEl(parentId);
                    const dialogWinEl = _getWindowEl(dialogId);
                    const parentTaskEl = document.getElementById(`pid-${parentPid}-task`);
                    if (!parentWinEl) return;

                    const parentVisible = window.getComputedStyle(parentWinEl).display !== "none";
                    const activeOverlay = _overlays.get(parentId);

                    if (parentVisible) {
                        // Minimize both windows with full taskbar animation (fly to icon)
                        if (app.desktop.taskbar.functions) {
                            app.desktop.taskbar.functions.animateWindowToTaskbar(parentId, parentPid);
                            if (dialogWinEl) {
                                app.desktop.taskbar.functions.animateWindowToTaskbar(dialogId, parentPid);
                            }
                        }
                        if (parentTaskEl) {
                            parentTaskEl.classList.remove("runstate");
                            parentTaskEl.classList.add("hidstate");
                        }
                        // Fade out overlay simultaneously
                        if (activeOverlay) {
                            activeOverlay.style.setProperty("opacity", "0", "important");
                            setTimeout(() => { activeOverlay.style.display = "none"; }, 200);
                        }
                    } else {
                        // Restore both windows with full taskbar animation (fly from icon)
                        if (activeOverlay) {
                            activeOverlay.style.display = "flex";
                            requestAnimationFrame(() => requestAnimationFrame(() => {
                                activeOverlay.style.setProperty("opacity", "1", "important");
                            }));
                        }
                        if (dialogWinEl && app.desktop.taskbar.functions) {
                            app.desktop.taskbar.functions.animateTaskbarToWindow(dialogId, parentPid);
                        }
                        if (app.desktop.taskbar.functions) {
                            app.desktop.taskbar.functions.animateTaskbarToWindow(parentId, parentPid);
                        }
                        if (parentTaskEl) {
                            parentTaskEl.classList.add("runstate");
                            parentTaskEl.classList.remove("hidstate");
                        }
                        setTimeout(() => {
                            if (_overlays.has(parentId)) {
                                parentWinEl.style.transition = "opacity 180ms ease";
                                parentWinEl.style.opacity    = "0";
                            }
                        }, 820);
                        // Ensure dialog gets focus
                        requestAnimationFrame(() => {
                            if (typeof app.setActiveWindow === "function") {
                                app.setActiveWindow(dialogId);
                            }
                        });
                    }
                };
            }

            // Refresh taskbar to apply hidden flag
            if (app.desktop.taskbar.overflow && app.desktop.taskbar.overflow.handle) {
                app.desktop.taskbar.overflow.handle();
            }
        }

        // ── F) Freeze resize/drag on parent ───────────────────────────────────
        if (app.ui && app.ui.windows && app.ui.windows.functions) {
            try { app.ui.windows.functions.pauseResize(`${parentId}-win`); } catch (_) {}
            try { app.ui.windows.functions.pauseDrag(`${parentId}-win`);   } catch (_) {}
        }

        // Track parent style mutations (position/size changes during drag/resize)
        const styleObserver = new MutationObserver(() => {
            _updateOverlayBounds(parentId);
            _ensureDialogAboveOverlay(parentId);
        });
        styleObserver.observe(parentEl, { attributes: true, attributeFilter: ["style"] });
        _observers.set(parentId, styleObserver);

        app.dev.log(
            `[Modal] Layer locked — parent: ${parentId}, dialog: ${dialogId}`,
            "Window Modal"
        );
    }

    // -------------------------------------------------------------------------
    // unlockWindowLayer
    // -------------------------------------------------------------------------

    /**
     * Removes all modal locking artifacts for a parent window.
     * State has already been cleared by _destroyDialogLink before this is called.
     *
     * @param {string} parentId
     */
    function unlockWindowLayer(parentId) {
        // Fade out overlay and simultaneously fade parent back in
        const overlay = _overlays.get(parentId);
        if (overlay) {
            overlay.style.setProperty("opacity", "0", "important");
            setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
            _overlays.delete(parentId);
        }

        // Disconnect observer
        const observer = _observers.get(parentId);
        if (observer) {
            observer.disconnect();
            _observers.delete(parentId);
        }

        const parentEl = _getWindowEl(parentId);
        if (parentEl) {
            // Restore resize/drag
            if (app.ui && app.ui.windows && app.ui.windows.functions) {
                try { app.ui.windows.functions.resumeResize(`${parentId}-win`); } catch (_) {}
                try { app.ui.windows.functions.resumeDrag(`${parentId}-win`);   } catch (_) {}
            }
        }

        const parentPid = parentId.replace(/-\d+$/, "");

        // Restore dialog taskbar icon and parent callback
        const dialogId = _parentToDialog.get(parentId);
        _parentToDialog.delete(parentId);

        if (app.desktop && app.desktop.taskbar && app.desktop.taskbar.config) {
            if (dialogId) {
                const dialogPid = dialogId.replace(/-\d+$/, "");
                const dialogIconData = app.desktop.taskbar.config.taskIcons.find(
                    i => i.id === `pid-${dialogPid}-task`
                );
                if (dialogIconData && dialogIconData.hidden) dialogIconData.hidden = false;

                // Restore dialog's original title and icon in window header DOM
                const savedMeta = _savedDialogMeta.get(dialogId);
                if (savedMeta) {
                    const dialogEl = _getWindowEl(dialogId);
                    if (dialogEl) {
                        if (savedMeta.title !== null) {
                            const titleEl = dialogEl.querySelector(".window-header .title");
                            if (titleEl) titleEl.textContent = savedMeta.title;
                        }
                        if (savedMeta.icon) {
                            const ic = dialogEl.querySelector(".window-header .icon");
                            if (ic) {
                                const ex = ic.querySelector("img, svg");
                                if (ex) ex.remove();
                                ic.insertAdjacentHTML("afterbegin",
                                    savedMeta.icon.type === "svg"
                                        ? `<svg><use href="${savedMeta.icon.path}"></use></svg>`
                                        : `<img src="${savedMeta.icon.path}" alt="" />`
                                );
                            }
                        }
                    }
                    _savedDialogMeta.delete(dialogId);
                }
            }

            if (_savedCallbacks.has(parentId)) {
                const parentIconData = app.desktop.taskbar.config.taskIcons.find(
                    i => i.id === `pid-${parentPid}-task`
                );
                if (parentIconData) parentIconData.callback = _savedCallbacks.get(parentId);
                _savedCallbacks.delete(parentId);
            }

            if (app.desktop.taskbar.overflow && app.desktop.taskbar.overflow.handle) {
                app.desktop.taskbar.overflow.handle();
            }
        }

        app.dev.log(`[Modal] Layer unlocked — parent: ${parentId}`, "Window Modal");
    }

    // -------------------------------------------------------------------------
    // openDialog
    // -------------------------------------------------------------------------

    /**
     * Opens a dialog window tied to a parent window with full lifecycle enforcement.
     *
     * parentId is always taken from options — never from config fallback.
     *
     * VALIDATION (all must pass before anything happens):
     *   1. parentId must exist as a live window.
     *   2. dialogId must exist as a live window.
     *   3. parentId must not itself be a dialog (mode === "dialog").
     *   4. parentId must not already have an active dialog (dialogOpen === false).
     *   5. dialogId must not already be coupled to another parent.
     *
     * @param {Object}  options
     * @param {string}  options.parentId  - ID of the window that owns the dialog.
     * @param {string}  options.dialogId  - ID of the dialog window.
     * @param {boolean} [options.modal=true] - When true, activates the full lock-layer.
     * @param {string}  [options.statusText]  - Text shown on the overlay. Defaults to "Programmet väntar på användaren..."
     * @param {string}  [options.dialogTitle] - Suffix for the dialog title bar (combined as "ParentName — dialogTitle"). Auto-composed from DOM when omitted.
     * @returns {boolean} true on success, false if validation fails.
     */
    function openDialog(options) {
        const { parentId, dialogId, modal = true, statusText, dialogTitle } = options;

        // ── Validation ────────────────────────────────────────────────────────
        if (!_windowExists(parentId)) {
            app.dev.error(`[openDialog] parentId "${parentId}" does not exist in DOM`, "Window Modal");
            return false;
        }

        if (!_windowExists(dialogId)) {
            app.dev.error(`[openDialog] dialogId "${dialogId}" does not exist in DOM`, "Window Modal");
            return false;
        }

        const parentState = _getOrCreateWindowState(parentId);
        const dialogState = _getOrCreateWindowState(dialogId);

        if (parentState.mode === "dialog") {
            app.dev.error(`[openDialog] "${parentId}" is itself a dialog — dialogs cannot host dialogs`, "Window Modal");
            return false;
        }

        if (parentState.dialogOpen && parentState.dialogId && !_windowExists(parentState.dialogId)) {
            app.dev.warn(`[openDialog] Stale dialog state on "${parentId}" — resetting`, "Window Modal");
            _destroyDialogLink(parentState.dialogId, parentId);
        }

        if (parentState.dialogOpen) {
            app.dev.error(`[openDialog] "${parentId}" already has active dialog: "${parentState.dialogId}"`, "Window Modal");
            return false;
        }

        if (dialogState.mode === "dialog" && dialogState.parentId && !_windowExists(dialogState.parentId)) {
            app.dev.warn(`[openDialog] Stale parent state on dialog "${dialogId}" — resetting`, "Window Modal");
            _destroyDialogLink(dialogId, dialogState.parentId);
        }

        if (dialogState.mode === "dialog") {
            app.dev.error(`[openDialog] "${dialogId}" already coupled to parent "${dialogState.parentId}"`, "Window Modal");
            return false;
        }

        // ── Activate ──────────────────────────────────────────────────────────
        if (modal) {
            lockWindowLayer(parentId, dialogId, statusText, dialogTitle);
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // closeDialog
    // -------------------------------------------------------------------------

    /**
     * Closes the modal relationship for a dialog window.
     *
     * Uses _destroyDialogLink as the single guaranteed cleanup path, then
     * tears down the visual layer and returns focus to the parent.
     *
     * Does NOT close the dialog window itself — call the window's own close method.
     *
     * @param {string} dialogId
     */
    function closeDialog(dialogId) {
        const dialogState = _windowStates.get(dialogId);

        if (!dialogState || dialogState.mode !== "dialog") {
            app.dev.warn(`[closeDialog] "${dialogId}" is not registered as active dialog — skipping`, "Window Modal");
            return;
        }

        const parentId = dialogState.parentId;

        // Guaranteed cleanup — resets both sides atomically before any visual work
        _destroyDialogLink(dialogId, parentId);

        if (parentId) {
            unlockWindowLayer(parentId);

            // Return focus to parent
            if (_windowExists(parentId) && typeof app.setActiveWindow === "function") {
                app.setActiveWindow(parentId);
            }

            // Restore caret to its pre-dialog position once focus has settled
            setTimeout(() => {
                if (app.ui && app.ui.caret) {
                    if (typeof app.ui.caret.restoreState === "function") app.ui.caret.restoreState(parentId);
                    if (typeof app.ui.caret.removeState  === "function") app.ui.caret.removeState(parentId);
                }
            }, 50);
        }

        app.dev.log(
            `[Modal] Dialog closed — dialog: ${dialogId}, parent: ${parentId}`,
            "Window Modal"
        );
    }

    // -------------------------------------------------------------------------
    // destroyWindow
    // -------------------------------------------------------------------------

    /**
     * Guaranteed cleanup for a window that is being destroyed.
     *
     * If the window is a dialog: closes the modal relationship (unlocks parent).
     * If the window is a parent with an open dialog: tears down the link cleanly.
     *
     * Safe to call even if the window was not part of any modal relationship.
     *
     * @param {string} windowId
     */
    function destroyWindow(windowId) {
        const state = _windowStates.get(windowId);
        if (!state) return;

        if (state.mode === "dialog" && state.parentId) {
            // This dialog is being destroyed — close the modal relationship
            closeDialog(windowId);
        } else if (state.dialogOpen && state.dialogId) {
            // Parent is being destroyed while it has an open dialog — clean up
            const orphanedDialogId = state.dialogId;
            _destroyDialogLink(orphanedDialogId, windowId);
            unlockWindowLayer(windowId);

            // Reset orphaned dialog's state
            const orphanState = _windowStates.get(orphanedDialogId);
            if (orphanState) {
                orphanState.mode     = "main";
                orphanState.parentId = null;
            }
        }

        _windowStates.delete(windowId);
    }

    // -------------------------------------------------------------------------
    // getWindowState
    // -------------------------------------------------------------------------

    /**
     * Returns the current modal state object for a window.
     * Returns a default (non-modal) state if the window has no registered state.
     *
     * @param {string} windowId
     * @returns {{ id: string, parentId: string|null, mode: "main"|"dialog", dialogOpen: boolean, dialogId: string|null }}
     */
    function getWindowState(windowId) {
        return _windowStates.get(windowId) || {
            id:         windowId,
            parentId:   null,
            mode:       "main",
            dialogOpen: false,
            dialogId:   null
        };
    }

    // -------------------------------------------------------------------------
    // setActiveWindow intercept
    // -------------------------------------------------------------------------

    /**
     * Wraps app.setActiveWindow to enforce modal focus rules:
     *   - If the target window has an open dialog, redirect focus to the dialog
     *     and pulse it to draw attention.
     *   - After every activation, synchronise overlay z-indices.
     */
    if (typeof app.setActiveWindow === "function") {
        const _origSetActiveWindow = app.setActiveWindow.bind(app);

        app.setActiveWindow = function (windowId) {
            const state = _windowStates.get(windowId);

            if (state && state.dialogOpen && state.dialogId && _windowExists(state.dialogId)) {
                // Redirect: parent has open dialog → focus dialog
                _origSetActiveWindow(state.dialogId);
                _pulseDialog(state.dialogId);
            } else {
                _origSetActiveWindow(windowId);
            }

            // After z-indices settle, keep overlays correct
            requestAnimationFrame(() => {
                _overlays.forEach((_, parentId) => {
                    _updateOverlayBounds(parentId);
                    _ensureDialogAboveOverlay(parentId);
                });
            });
        };
    }

    // -------------------------------------------------------------------------
    // CSS
    // -------------------------------------------------------------------------

    if (typeof app.addCSS === "function") {
        app.addCSS("window-modal", `
            /* Overlay that blocks parent input, fades in/out */
            .modal-overlay {
                background: var(--theme-backgruondcolore, #00000080);
                border-radius: 12px;
                transition: opacity 180ms ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* Status label shown in the center of the overlay */
            .modal-overlay-status {
                color: #fff;
                font-size: 14px;
                pointer-events: none;
                user-select: none;
                text-align: center;
                padding: 0 16px;
            }

            /* Focus-pulse animation triggered on the dialog when parent is clicked */
            @keyframes modal-focus-pulse-kf {
                0%   { box-shadow: 0 0 0   0   rgba(255, 255, 255, 0.55); }
                40%  { box-shadow: 0 0 14px 6px rgba(255, 255, 255, 0.28); }
                100% { box-shadow: 0 0 0   0   rgba(255, 255, 255, 0.00); }
            }
            .modal-focus-pulse {
                animation: modal-focus-pulse-kf 0.45s ease forwards !important;
            }
        `);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    app.windows = Object.assign(app.windows || {}, {
        /** Open a dialog window tied to a parent with optional modal lock. */
        openDialog,

        /** Release the modal relationship for a dialog (does not close the window). */
        closeDialog,

        /**
         * Guaranteed cleanup when a window is destroyed.
         * Handles both dialog and parent-with-dialog cases.
         */
        destroyWindow,

        /** Get the current modal state for any window ID. */
        getWindowState,

        /** Set overlay bounds to explicit values (bypasses getBoundingClientRect racing a CSS transition). */
        setOverlayBounds,

        /** Low-level: activate the full lock-layer between parent and dialog. */
        lockWindowLayer,

        /** Low-level: tear down all lock-layer artifacts for a parent window. */
        unlockWindowLayer,
    });

    if (app.dev) {
        app.dev.log("[Modal] Window modal system ready.", "Window Modal");
    }

})(window.app = window.app || {});
