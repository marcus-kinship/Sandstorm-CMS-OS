/**
 * @file taskbar/hoverpreview.js
 * @description Hover preview for task icons with multiple open windows.
 *
 * Hovering a task icon that has more than one open window (same condition
 * `addtotaskbar.js`'s click handler already uses to decide between a direct
 * focus/minimize and the `.contextMenu` window-picker) shows a small panel
 * above the icon with one tile per window - click a tile to activate that
 * window. A single-window (or no-window) icon keeps relying on the existing
 * plain `title=""` tooltip (`sandstorm/components/ui.js`'s `tooltip.init`) -
 * per design, a preview is only worth the extra panel once an icon alone can
 * no longer tell two windows apart.
 *
 * Each tile shows the program's icon + the window's title, NOT a live
 * content thumbnail - `windowswitcher.js`'s Shift+W switcher has real
 * DOM-clone-and-scale thumbnails (see its `buildThumbnail()`), but that
 * logic is substantial and currently private to that module; reusing it
 * here would mean extracting it into a shared utility first, which is its
 * own follow-up, not bundled into this change.
 *
 * Registers nothing new on `app.desktop.taskbar` beyond `hoverPreview` -
 * same IIFE-extends convention as the other taskbar/*.js sibling modules.
 * Must load before `taskbar/index.js`'s trailing `app.lock('desktop.taskbar.*')`
 * call, so it's imported there like every other sibling.
 *
 * @module components/taskbar/hoverpreview
 */
(function (app) {

    const SHOW_DELAY = 400;  // ms - avoids flashing a preview while the pointer just passes over several icons
    const HIDE_DELAY = 250;  // ms - grace period for the pointer to travel from the icon up into the panel

    Object.assign(app.desktop.taskbar, {

        hoverPreview: {
            /** @type {HTMLElement|null} The currently-shown preview panel, if any. */
            element: null,
            /** @type {number|null} */
            showTimer: null,
            /** @type {number|null} */
            hideTimer: null,

            /**
             * Schedules the preview panel for the given program after SHOW_DELAY,
             * cancelling any pending hide.
             * @param {string} programId
             */
            show: function (programId) {
                clearTimeout(this.hideTimer);
                clearTimeout(this.showTimer);

                this.showTimer = setTimeout(() => {
                    // Belt-and-suspenders beyond _remove()'s own
                    // showTimer-cancel on contextmenu: even a sub-pixel
                    // cursor shift from the right-click itself (or the menu
                    // DOM appearing under an otherwise-still cursor) can
                    // re-fire a fresh mouseover on the icon AFTER the menu
                    // is already open, scheduling a brand new SHOW_DELAY
                    // timer that isn't cancelled by anything - this check
                    // catches that case at the last possible moment,
                    // regardless of how a stray timer got scheduled.
                    if (document.querySelector(".contextMenu")) return;
                    this._render(programId);
                }, SHOW_DELAY);
            },

            /**
             * Schedules the preview panel to be removed after HIDE_DELAY, giving
             * the pointer time to move from the icon into the panel itself.
             */
            scheduleHide: function () {
                clearTimeout(this.showTimer);
                this.hideTimer = setTimeout(() => {
                    this._remove();
                }, HIDE_DELAY);
            },

            /**
             * Cancels a pending hide - called when the pointer enters the panel itself.
             */
            cancelHide: function () {
                clearTimeout(this.hideTimer);
            },

            /**
             * Builds and positions the preview panel for a program's open windows.
             * Reuses `taskbar.menu.collectMenuData(id, [], true)` (the existing
             * `get: true` mode already used nowhere else) for the window list/
             * activate-callbacks, and `taskbar.menu.getPosition()` for the same
             * viewport-clamped above-the-icon placement the click menu uses.
             * `collectMenuData` always appends a "Close all windows"/"Close
             * window" entry (`closeAll: true`) regardless of `get` - filtered
             * out here, it belongs to the click-menu, not this preview.
             *
             * Each tile shows a real thumbnail of the window's own content via
             * `app.ui.buildWindowThumbnail` (exposed by `windowswitcher.js` -
             * the same clone-and-scale logic its Shift+W switcher cards use),
             * not just an icon+title - important once two windows share a
             * program (e.g. two Notepad documents), where an icon alone can't
             * tell them apart.
             * @param {string} programId
             */
            _render: function (programId) {
                const windows = (app.desktop.taskbar.menu.collectMenuData(programId, [], true) || [])
                    .filter((w) => !w.closeAll);

                this._remove();

                if (windows.length < 2) return;

                const escape = typeof app.util?.escapeHtml === "function"
                    ? app.util.escapeHtml
                    : (s) => s;

                const program = app.program.getInfo(programId);
                const iconHtml = program
                    ? (program.icontype === "svg"
                        ? `<svg><use href="${program.icon}"></use></svg>`
                        : `<img src="${program.icon}" alt="" />`)
                    : "";

                const panel = document.createElement("div");
                panel.className = "taskbar-preview";

                const tiles = windows.map((win) => {
                    const tile = document.createElement("div");
                    tile.className = "taskbar-preview-tile";
                    tile.innerHTML = `
                        <div class="taskbar-preview-header">
                            <span class="taskbar-preview-icon">${iconHtml}</span>
                            <span class="taskbar-preview-title">${escape(win.title || "")}</span>
                        </div>
                        <div class="taskbar-preview-thumb-wrap"></div>
                        <div class="taskbar-preview-close" title="${escape(_("Close"))}"><svg><use href="#ic-bts-close"></use></svg></div>
                    `;
                    tile.addEventListener("click", () => {
                        win.callback();
                        this._remove();
                    });

                    // Same close-a-single-window call the click-menu's own
                    // close button uses (menu.js build()) - stopPropagation
                    // so this doesn't also trigger the tile's own activate
                    // click above. Re-renders instead of just dropping this
                    // one tile: if that was the last/second-to-last window,
                    // _render's own `windows.length < 2` guard then closes
                    // the whole panel, which is the correct end state.
                    tile.querySelector(".taskbar-preview-close").addEventListener("click", async (event) => {
                        event.stopPropagation();
                        await app.ui.windows.functions.closeWindow(win.id, null, programId, false, { wait: true });
                        this._render(programId);
                    });

                    panel.appendChild(tile);
                    return { win, tile };
                });

                panel.addEventListener("mouseenter", () => this.cancelHide());
                panel.addEventListener("mouseleave", () => this.scheduleHide());

                document.body.appendChild(panel);
                this.element = panel;

                // buildWindowThumbnail sizes its clone against the wrap
                // element's OWN layout box (clientWidth/Height) - only
                // meaningful once `panel` is actually attached to the
                // document, so this has to happen after the appendChild
                // above, not while building each tile's innerHTML.
                if (typeof app.ui?.buildWindowThumbnail === "function") {
                    tiles.forEach(({ win, tile }) => {
                        const sourceEl = document.getElementById(`${win.id}-win`);
                        if (!sourceEl) return;

                        const wrapEl = tile.querySelector(".taskbar-preview-thumb-wrap");

                        // buildWindowThumbnail's first arg is a "candidate"
                        // object it only ever reads `.el` off of (matching
                        // windowswitcher.js's own candidate shape) - not a
                        // raw element.
                        app.ui.buildWindowThumbnail({ el: sourceEl }, wrapEl);

                        // buildWindowThumbnail deliberately clones the WHOLE
                        // .window, header included (its own switcher wants
                        // that - see its file comment). At this small preview
                        // size the cloned title bar just reads as a stray
                        // dark strip along the top, not a recognizable header
                        // - hidden here without touching the shared function
                        // or its switcher use. Reaches into the clone's own
                        // shadow root (mode:"open", so `.shadowRoot` is
                        // reachable from outside) rather than a light-DOM CSS
                        // selector, which can't cross into shadow DOM at all.
                        const shadowRoot = wrapEl.firstElementChild?.shadowRoot;
                        const titleBar = shadowRoot?.querySelector(".window-list");
                        if (titleBar) titleBar.style.display = "none";
                    });
                }

                app.desktop.taskbar.menu.taskIconsId = programId;
                app.desktop.taskbar.menu.getPosition(panel);
            },

            /**
             * Removes the currently-shown panel, if any.
             */
            _remove: function () {
                // Also cancels a pending SHOW_DELAY timer, not just an
                // already-rendered panel - without this, a right-click (or
                // left-click) that lands in the window between hovering and
                // the panel actually rendering left `show()`'s setTimeout
                // free to fire anyway a moment later, popping the preview up
                // on top of the context menu that had just opened.
                clearTimeout(this.showTimer);

                if (this.element) {
                    this.element.remove();
                    this.element = null;
                }
            }
        }

    });

    // Delegated, plain DOM - so it keeps working across createTaskbarIcons()'s
    // own DOM reuse/recreation (see that method's comment on why icon nodes
    // aren't torn down and rebuilt on every refresh), AND so this file can
    // run before jQuery has loaded: load.js's systemfiles list loads
    // taskbar/index.js (and therefore this sibling) BEFORE
    // js/jquery-3.7.1.min.js - the same reason windowswitcher.js, loaded in
    // that same early slot, uses zero jQuery itself. `$` is only ever
    // touched inside functions below that actually run later at real
    // hover/click time (well after full boot), never at module-evaluation
    // time. mouseover/mouseout (unlike mouseenter/mouseleave) bubble, so
    // delegation here is done manually via relatedTarget/closest() - the
    // standard non-jQuery mouseenter/mouseleave delegation polyfill pattern.
    document.addEventListener("mouseover", (event) => {
        const icon = event.target.closest(".taskbar-s .tasks .blockicon");
        if (!icon) return;
        if (event.relatedTarget && icon.contains(event.relatedTarget)) return; // moved between the icon's own children
        if (document.querySelector(".contextMenu")) return; // a right-click menu is open - never even schedule a preview

        const programId = icon.id.replace(/^pid-/, "").replace(/-task$/, "");
        if (document.querySelectorAll(`.pid-${programId}`).length > 1) {
            app.desktop.taskbar.hoverPreview.show(programId);
        }
    });

    document.addEventListener("mouseout", (event) => {
        const icon = event.target.closest(".taskbar-s .tasks .blockicon");
        if (!icon) return;
        if (event.relatedTarget && icon.contains(event.relatedTarget)) return; // still within the icon

        app.desktop.taskbar.hoverPreview.scheduleHide();
    });

    // Clicking the task icon itself - left click (direct focus/minimize, or
    // opens the .contextMenu window-picker) or right click (the pin/close-all
    // context menu) - should never leave the hover preview sitting on screen
    // overlapping whatever that click just opened. Removes immediately,
    // bypassing the usual HIDE_DELAY grace period.
    document.addEventListener("click", (event) => {
        if (event.target.closest(".taskbar-s .tasks .blockicon")) {
            app.desktop.taskbar.hoverPreview._remove();
        }
    });

    document.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".taskbar-s .tasks .blockicon")) {
            app.desktop.taskbar.hoverPreview._remove();
        }
    });

})((window.app = window.app || {}));
