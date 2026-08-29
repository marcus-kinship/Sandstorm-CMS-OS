/**
 * @file notepad/notepad.js
 * @description Notepad program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icon + metadata + New-file menu entries) lives in
 * `setup.js`.
 * Exports `start(os, win)` (window creation; editing logic in `notepad_data.js`).
 *
 * Layout, settled after a few rounds of direct back-and-forth: the menu
 * lives merged into the title row (`menu.options.position: "window-title"`,
 * the same feature `program/designer/designer.js` uses — flush/transparent
 * background via `sandstorm/components/ui.css`'s `.menu-in-title .wm-menu`
 * override, not the normal menu bar's own `#00000040` box), and the tab bar
 * row directly below it (`.notepad-tabbar`) matches that same flush,
 * transparent style — NOT the classic separate-band look Solitaire's own
 * default `position:"top"` menu has (that was tried as an alternative
 * reference partway through and explicitly reverted back to this merged
 * style right after). A tab bar row sits directly below the title, wired
 * up by the new `notepad_tabs.js`; see that file's own header comment for
 * why it's a fresh, per-window-instance implementation rather than a reuse
 * of `designer_tabs.js` verbatim (Notepad allows multiple simultaneous
 * windows, Designer's tab module is a single global singleton that only
 * works because Designer never does).
 *
 * @module program/notepad/notepad
 */

function injectCSS() {
    if (document.getElementById('notepad-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'notepad-tabs-style';
    style.textContent = `

        .notepad-tabbar { display: flex; align-items: center;  flex: 0 0 auto; gap: 2px;  background: none; }
        .notepad-tabs-list { display: flex; align-items: stretch; overflow-x: auto; flex: 0 1 auto; min-width: 0; }
        .notepad-tab {
            display: flex; align-items: center; gap: 8px; max-width: 200px; height: 32px; padding: 0 14px;
            font-size: 13px; color: rgba(255,255,255,0.6); cursor: default; border-radius: 6px 6px 0 0;
            white-space: nowrap; user-select: none;
        }
        .notepad-tab:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .notepad-tab.active { color: #fff; background: var(--theme-backgruondcolorc, #00000040); }
        .notepad-tab-title { overflow: hidden; text-overflow: ellipsis; }
        .notepad-tab-close { opacity: 0.6; font-size: 15px; line-height: 1; padding: 0 2px; }
        .notepad-tab-close:hover { opacity: 1; }
        .notepad-tab-add {
            flex: 0 0 auto; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
            color: rgba(255,255,255,0.6); font-size: 18px; cursor: default; border-radius: 6px; background: none; border: none;
        }
        .notepad-tab-add:hover { color: #fff; background: rgba(255,255,255,0.08); }
    `;
    document.head.appendChild(style);
}

export function start(os) {
    injectCSS();

    const instanceId = "notepad-" + Date.now();

    const _initPath = app.notepad?._pendingPath || null;
    if (app.notepad) { app.notepad._pendingPath = null; app.notepad._pendingEntry = null; }
    if (_initPath) {
        app.notepad = app.notepad || {};
        app.notepad._pendingFiles = app.notepad._pendingFiles || {};
        app.notepad._pendingFiles[instanceId] = _initPath;
    }
    app.dev.log(`start: instanceId="${instanceId}" initPath="${_initPath}"`, 'Notepad');

    // Delegate a menu action to the command object set up by notepad_data.js.
    function exec(action) {
        const activeWin = document.querySelector(".window.active");
        if (activeWin && activeWin._np && typeof activeWin._np[action] === "function") {
            if (activeWin.id) {
                app.config.set('notepad', 'activeWindowId', activeWin.id.replace('-win', ''));
            }
            activeWin._np[action]();
        }
    }

    os.ui.windowStart("notepad", {
        id: instanceId,
        title: _("Notepad"),
        windowIcon: true,
        resizable: true,
        width: "600px",
        height: "480px",
        menu: {
            options: {
                position: "window-title",
                mobileicon: true,
                windowTitleText: "hidden",
            },
            menu: {
                [_("File")]: {
                    children: {
                        [_("Open")]:         { click: () => exec("open") },
                        [_("Save")]:         { click: () => exec("save") },
                        [_("Save As")]:      { click: () => exec("saveAs") },
                        "---":               {},
                        [_("Print layout")]: { click: () => exec("printLayout") },
                        [_("Print")]:        { click: () => exec("print") },
                        "--- 2":             {},
                        [_("Exit")]:         { click: () => exec("exit") }
                    }
                },
                [_("Edit")]: {
                    children: {
                        [_("Undo")]:       { click: () => exec("undo") },
                        [_("Redo")]:       { click: () => exec("redo") },
                        "---":             {},
                        [_("Cut")]:        { click: () => exec("cut") },
                        [_("Copy")]: { click: () => exec("copy") },
                        [_("Paste")]:      { click: () => exec("paste") },
                        "--- 2":           {},
                        [_("Find")]:       { click: () => exec("find") },
                        [_("Find next")]:  { click: () => exec("findNext") },
                        [_("Replace")]:    { click: () => exec("replace") },
                        "--- 3":           {},
                        [_("Font")]:       { click: () => exec("font") }
                    }
                },
                [_("View")]: {
                    children: {
                        [_("Status bar")]: { click: () => exec("toggleStatusBar") },
                        "---":             {},
                        [_("About")]:      { click: () => exec("about") },
                        [_("Help")]:       { click: () => exec("help") }
                    }
                }
            }
        },
        body: function (windowobj) {
            const langToken = "notepad-" + windowobj?.windowId;
            if (windowobj) {
                os.language.registerRefresh(langToken, () => windowobj.title(_("Notepad")));
                windowobj.on("close", () => os.language.unregisterRefresh(langToken));
            }

            const ui = {
                section: {
                    class: "notepad-app",
                    style: { display: "flex", flexDirection: "column", height: "100%" },
                    subs: [
                        {
                            block: {
                                class: "notepad-tabbar",
                                subs: [
                                    { block: { class: "notepad-tabs-list" } },
                                    { block: { class: "notepad-tab-add", textContent: "+" } }
                                ]
                            }
                        },
                        {
                            textarea: {
                                class: "notepad-editor",
                                style: {
                                    flex: "1",
                                    width: "100%",
                                    padding: "10px",
                                    border: "none",
                                    outline: "none",
                                    background: "#ffffff",
                                    color: "#000000",
                                    fontFamily: "monospace",
                                    fontSize: "13px",
                                    lineHeight: "1.5",
                                    resize: "none",
                                    boxSizing: "border-box"
                                }
                            }
                        },
                        {
                            block: {
                                class: "notepad-statusbar",
                                style: {
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: "3px 10px",
                                    fontSize: "11px",
                                    color: "#ffffff",
                                    borderTop: "1px solid rgba(255,255,255,0.1)",
                                    opacity: "0.65",
                                    flexShrink: "0"
                                },
                                subs: [
                                    { block: { class: "ns-position",  textContent: _("Ln 1, Col 1") } },
                                    { block: { class: "ns-chars",     textContent: _("0 chars") } },
                                    { block: { class: "ns-crlf",      textContent: "LF" } },
                                    { block: { class: "ns-encoding",  textContent: "UTF-8" } }
                                ]
                            }
                        },
                        {
                            script: {
                                path: "notepad/notepad_data.js",
                                call: "data"
                            }
                        }
                    ]
                }
            };
            const builder = os.ui.body(ui);
            return builder.render();
        }
    });
}
