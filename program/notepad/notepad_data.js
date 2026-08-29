/**
 * @file notepad/notepad_data.js
 * @description Notepad editor logic for Sandstorm OS.
 *
 * Exports `data(os)` — wires the editor textarea inside the active window
 * with keyboard shortcuts, file open/save via the Explorer dialog, and
 * unsaved-changes tracking. Called by `notepad.js` `start()` after the
 * window HTML is in the DOM.
 *
 * Also wires up `notepad_tabs.js`'s per-window tab bar (see that file's own
 * header comment) — one shared `<textarea>` per window still, swapped by
 * content string on tab-activate rather than one `<textarea>` per tab; see
 * the tab-wiring block below for the documented undo/redo limitation that
 * trade-off carries.
 *
 * @module program/notepad/notepad_data
 */
import { createTabs } from './notepad_tabs.js';

export function data(os) {



    const win    = document.querySelector(".window.active");
    if (!win) return;

    const editor = win.querySelector(".notepad-editor");
    if (!editor) return;

    let _selectionStart = 0;
    let _selectionEnd = 0;

    function saveSelection() {
        _selectionStart = editor.selectionStart;
        _selectionEnd = editor.selectionEnd;
    }

    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("select", saveSelection);
    editor.addEventListener("focus", saveSelection);
    editor.addEventListener("blur", saveSelection);


    os.ui.contextMenu(editor, {
        zIndex: 6000,
        items: [
            {
                title: _("Cut"),
                callback: () => win._np.cut()
            },
            {
                title: _("Copy"),
                callback: () => win._np.copy()
            },
            {
                title: _("Paste"),
                icon: "#ic-paste",
                callback: () => win._np.paste()
            },
            { divider: true },
            {
                title: _("Select all"),
                callback: () => {
                    editor.focus();
                    editor.select();
                    updateStatus();
                }
            }
        ]
    });

    // ── CSS ──────────────────────────────────────────────────────────────────
    os.addCSS("notepad-ui", `
        .notepad-app {
            position: relative;
        }
        .notepad-findbar {
            display: none;
            position: absolute;
            top: 10px;
            right: 14px;
            width: 270px;
            z-index: 10;
          backdrop-filter: blur(10px);
    background-color: rgb(0 0 0 / 30%);
    background: linear-gradient(144deg, var(--theme-backgruondcolora, rgba(37, 37, 37, 0.3)) 0%, var(--theme-backgruondcolorb, rgba(10, 10, 10, 0.2)) 47%);
            border-radius: 8px;
            box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
            color: var(--theme-fontcolor, #fff);
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 12px;
            overflow: hidden;
        }
        .notepad-findbar .nf-titlebar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 7px 10px;
            user-select: none;
        }
        .notepad-findbar .nf-titlebar span {
            font-weight: 500;
            font-size: 12px;
        }
        .notepad-findbar .nf-close {
            border-radius: 50%;
            transition: none;
            cursor: default;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 19px;
            height: 19px;
            border: none;
            color: var(--theme-fontcolor, #fff);
            font-size: 13px;
            line-height: 1;
            padding: 0;
                background: transparent;
            position: relative;
        }
        .notepad-findbar .nf-close svg {
            width: 9px;
            height: 9px;
            fill: var(--theme-fontcolor, #fff);
        }
        .notepad-findbar .nf-close::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.4);
            border-radius: 50%;
            transition: opacity 2s ease-in-out;
            opacity: 0;
            z-index: -1;
        }
        .notepad-findbar:hover .nf-titlebar .nf-close::after {
            opacity: 1;
        }
        .notepad-findbar .nf-body {
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding: 10px;
        }
        .notepad-findbar .nf-row {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .notepad-findbar input {
            flex: 1;
            padding: 4px 8px;
            border-radius: 5px;
           background-color: var(--theme-backgruondcolorc, #00000040);
    box-sizing: border-box;
    border: 0px;
    color: #ffffff90;
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
            color: var(--theme-fontcolor, #fff);
            font-size: 12px;
            outline: none;
            min-width: 0;
        }
        .notepad-findbar input:focus {
            border-color: rgba(255,255,255,0.4);
        }
        .notepad-findbar button {
            font-size: 9px;
        }

        .notepad-findbar .nf-match-count {
            opacity: 0.55;
            font-size: 11px;
            white-space: nowrap;
        }
    `);

    // ── Status bar ───────────────────────────────────────────────────────────

    function updateStatus() {
        const text    = editor.value;
        const start = document.activeElement === editor
            ? editor.selectionStart
            : _selectionStart;

        const end = document.activeElement === editor
            ? editor.selectionEnd
            : _selectionEnd;
        
        const total   = text.length;
        const selected = end - start;

        // Line / column based on cursor (selectionStart)
        const before = text.substring(0, start);
        const lines  = before.split("\n");
        const line   = lines.length;
        const col    = lines[lines.length - 1].length + 1;

        win.querySelector(".ns-position").textContent = `Ln ${line}, Col ${col}`;

        // Show "X selected / Y total" when text is selected, otherwise just total
        win.querySelector(".ns-chars").textContent = selected > 0
            ? `${selected} / ${total} chars`
            : `${total} char${total !== 1 ? "s" : ""}`;
    }

    editor.addEventListener("keyup",         updateStatus);
    editor.addEventListener("mouseup",        updateStatus);
    editor.addEventListener("input",          updateStatus);
    document.addEventListener("selectionchange", () => {
        if (document.activeElement === editor) updateStatus();
    });

    // ── Find / Replace bar ───────────────────────────────────────────────────

    let findIndex = -1;

    function makeDraggable(panel, handle) {
        let sx, sy, sl, st;
        handle.addEventListener("mousedown", e => {
            if (e.button !== 0) return;
            e.preventDefault();
            sx = e.clientX; sy = e.clientY;
            sl = panel.offsetLeft; st = panel.offsetTop;
            const onMove = e => {
                panel.style.left = (sl + e.clientX - sx) + "px";
                panel.style.top  = (st + e.clientY - sy) + "px";
                panel.style.right = "auto";
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }

    function buildFindBar() {
        const panel = document.createElement("div");
        panel.className = "notepad-findbar";

        // Title bar
        const titleBar = document.createElement("div");
        titleBar.className = "nf-titlebar";
        const titleText = document.createElement("span");
        titleText.textContent = _("Find");
        const btnClose = document.createElement("button");
        btnClose.className = "nf-close";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#ic-bts-close");
        svg.appendChild(use);
        btnClose.appendChild(svg);
        btnClose.addEventListener("mousedown", e => e.preventDefault());
        btnClose.addEventListener("click", closeFindBar);
        titleBar.append(titleText, btnClose);

        // Body
        const body = document.createElement("div");
        body.className = "nf-body";

        // Search row
        const searchRow = document.createElement("div");
        searchRow.className = "nf-row";
        const search = document.createElement("input");
        search.className = "nf-search";
        search.placeholder = _("Find…");
        const matchCount = document.createElement("span");
        matchCount.className = "nf-match-count";
        searchRow.append(search, matchCount);

        // Button row
        const btnRow = document.createElement("div");
        btnRow.className = "nf-row";
        const btnFind = makeBtn(_("Find"), () => { findIndex = -1; doFind(1); });
        const btnNext = makeBtn(_("Next"), () => doFind(1));
        btnFind.addEventListener("mousedown", e => e.preventDefault());
        btnNext.addEventListener("mousedown", e => e.preventDefault());
        btnRow.append(btnFind, btnNext);

        // Replace row (hidden by default)
        const replaceRow = document.createElement("div");
        replaceRow.className = "nf-row nf-replace-row";
        replaceRow.style.display = "none";
        const replace = document.createElement("input");
        replace.className = "nf-replace";
        replace.placeholder = _("Replace…");
        const btnReplace = makeBtn(_("Replace"), doReplace);
        btnReplace.addEventListener("mousedown", e => e.preventDefault());
        replaceRow.append(replace, btnReplace);

        search.addEventListener("input", () => { findIndex = -1; highlightCount(); });
        search.addEventListener("keydown", e => {
            if (e.key === "Enter")  { doFind(e.shiftKey ? -1 : 1); e.preventDefault(); }
            if (e.key === "Escape") { closeFindBar(); }
        });

        body.append(searchRow, btnRow, replaceRow);
        panel.append(titleBar, body);
        win.querySelector(".notepad-app").appendChild(panel);
        makeDraggable(panel, titleBar);

        return panel;
    }

    function makeBtn(label, fn) {
        const b = document.createElement("button");
        b.className = "aero-button";
        b.textContent = label;

        const normalized = label.trim().toLowerCase();
        if (/^(yes|ok|okay|find)$/.test(normalized)) {
            const pulse = document.createElement("div");
            pulse.className = "after pulse";
            b.append(pulse);
        }

        b.addEventListener("click", fn);
        return b;
    }

    function getFindBar() {
        return win.querySelector(".notepad-findbar");
    }

    function openFindBar(withReplace) {
        let bar = getFindBar();
        if (!bar) bar = buildFindBar();

        bar.querySelector(".nf-replace-row").style.display = withReplace ? "flex" : "none";

        bar.style.display = "block";
        findIndex = -1;
        bar.querySelector(".nf-search").select();
        bar.querySelector(".nf-search").focus();
        highlightCount();
    }

    function closeFindBar() {
        const bar = getFindBar();
        if (bar) bar.style.display = "none";
        editor.focus();
    }

    function highlightCount() {
        const bar = getFindBar();
        if (!bar) return;
        const term  = bar.querySelector(".nf-search").value;
        const count = term ? countMatches(term) : 0;
        bar.querySelector(".nf-match-count").textContent = term ? `${count} match${count !== 1 ? "es" : ""}` : "";
    }

    function countMatches(term) {
        const text  = editor.value.toLowerCase();
        const lower = term.toLowerCase();
        let count = 0;
        let idx   = 0;
        while ((idx = text.indexOf(lower, idx)) !== -1) { count++; idx += lower.length; }
        return count;
    }

    function doFind(direction) {
        const bar = getFindBar();
        if (!bar) return;
        const term = bar.querySelector(".nf-search").value;
        if (!term) return;

        const text  = editor.value;
        const lower = text.toLowerCase();
        const lterm = term.toLowerCase();

        if (direction === 1) {
            const start = findIndex >= 0 ? findIndex + 1 : 0;
            let   idx   = lower.indexOf(lterm, start);
            if (idx === -1) idx = lower.indexOf(lterm, 0); // wrap
            findIndex = idx;
        } else {
            const end = findIndex > 0 ? findIndex - 1 : text.length;
            let   idx = lower.lastIndexOf(lterm, end);
            if (idx === -1) idx = lower.lastIndexOf(lterm); // wrap
            findIndex = idx;
        }

        if (findIndex >= 0) {
            editor.focus();
            editor.setSelectionRange(findIndex, findIndex + term.length);
            scrollEditorToSelection();
        }

        highlightCount();
    }

    function doReplace() {
        const bar = getFindBar();
        if (!bar) return;
        const term        = bar.querySelector(".nf-search").value;
        const replacement = bar.querySelector(".nf-replace").value;
        if (!term) return;

        const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        if (sel.toLowerCase() === term.toLowerCase()) {
            const start = editor.selectionStart;
            editor.value =
                editor.value.substring(0, start) +
                replacement +
                editor.value.substring(editor.selectionEnd);
            editor.setSelectionRange(start, start + replacement.length);
            findIndex = start;
        }
        doFind(1);
        updateStatus();
    }

    function scrollEditorToSelection() {
        const linesBefore  = editor.value.substring(0, findIndex).split("\n").length;
        const lineHeight   = parseFloat(getComputedStyle(editor).lineHeight) || 20;
        editor.scrollTop   = Math.max(0, (linesBefore - 3) * lineHeight);
    }

    // ── Command API (consumed by notepad.js exec()) ──────────────────────────

    let _clip = "";
    let _clipWarned = false;

    function clipboardAlert() {
        if (_clipWarned) return;
        _clipWarned = true;
        os.ui.alert({
            title: _("Clipboard unavailable"),
            body: () => `<p>${_("System clipboard requires a secure connection (HTTPS). Cut, copy and paste work within Notepad only.")}</p>`,
            icon: "#ic-warning"
        });
    }

    win._np = {
        _currentFile:    null,

        undo:            () => { editor.focus(); document.execCommand("undo"); },
        redo:            () => { editor.focus(); document.execCommand("redo"); },
        cut: () => {
            const start = document.activeElement === editor ? editor.selectionStart : _selectionStart;
            const end   = document.activeElement === editor ? editor.selectionEnd : _selectionEnd;
            if (start === end) return;
            _clip = editor.value.substring(start, end);
            editor.focus();
            editor.setSelectionRange(start, end);
            editor.setRangeText("", start, end, "end");
            updateStatus();
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_clip).catch(() => {});
            } else {
                clipboardAlert();
            }
        },
        copy: () => {
            const start = document.activeElement === editor ? editor.selectionStart : _selectionStart;
            const end   = document.activeElement === editor ? editor.selectionEnd : _selectionEnd;
            _clip = editor.value.substring(start, end);
            if (!_clip) return;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_clip).catch(() => {});
            } else {
                clipboardAlert();
            }
        },
        paste: () => {

            const doInsert = text => {

                if (!text) return;

                saveSelection();

                const start = document.activeElement === editor
                    ? editor.selectionStart
                    : _selectionStart;

                const end = document.activeElement === editor
                    ? editor.selectionEnd
                    : _selectionEnd;

                editor.focus();
                editor.setSelectionRange(start, end);

                editor.setRangeText(text, start, end, "end");

                saveSelection();
                updateStatus();
            };

            if (navigator.clipboard) {
                navigator.clipboard.readText().then(doInsert).catch(() => doInsert(_clip));
            } else {
                clipboardAlert();
                doInsert(_clip);
            }
        },

        find:            () => openFindBar(false),
        findNext:        () => { if (!getFindBar() || getFindBar().style.display === "none") openFindBar(false); else doFind(1); },
        replace:         () => openFindBar(true),

        open: async () => {
            // No type filter — show all files
            const parentId = win.id?.replace('-win', '') || '';
            const path = await app.explorer.windows.select.file({
                parentId,
                statusText: _("The program is waiting for the user"),
                dialogTitle: _("Open File"),
            });
            if (!path) return;
            const node = app.explorer._getNode(path);
            editor.value = node?.content ?? '';
            win._np._currentFile = path;
            const name = path.split('/').pop();
            os.ui.windows.functions.updateTitle(win.id?.replace('-win', '') || '', name + ' — Notepad');
            win._npTabs?.setTitle(win._npTabs.getActive(), name);
            app.dev.log(`Opened: ${path}`, 'Notepad');
        },

        save: async () => {
            if (win._np._currentFile) {
                const node = app.explorer._getNode(win._np._currentFile);
                if (node) {
                    node.content = editor.value;
                    node.size    = editor.value.length + ' B';
                }
                app.api.post('/api/fs/write', { path: win._np._currentFile, content: editor.value })
                    .success(() => app.dev.log(`Saved: ${win._np._currentFile}`, 'Notepad'))
                    .fail(()    => app.dev.log(`Saved (offline): ${win._np._currentFile}`, 'Notepad'));
            } else {
                win._np.saveAs();
            }
        },

        saveAs: async () => {
            const parentId = win.id?.replace('-win', '') || '';
            const path = await app.explorer.windows.save.file({
                types: ['txt'],
                parentId,
                statusText: _("The program is waiting for the user"),
                dialogTitle: _("Save As"),
            });
            if (!path) return;
            const content = editor.value;
            app.api.post('/api/fs/write', { path, content })
                .success(() => app.dev.log(`Saved as: ${path}`, 'Notepad'))
                .fail(()    => app.dev.log(`Saved as (offline): ${path}`, 'Notepad'));
            app.explorer.newFile(path, content);
            win._np._currentFile = path;
            const name = path.split('/').pop();
            os.ui.windows.functions.updateTitle(win.id?.replace('-win', '') || '', name + ' — Notepad');
            win._npTabs?.setTitle(win._npTabs.getActive(), name);
        },
        printLayout:     () => { /* TODO */ },
        print:           () => window.print(),

        exit:            () => os.ui.windows.functions.closeActiveWindow(),

        toggleStatusBar: () => {
            const sb = win.querySelector(".notepad-statusbar");
            if (sb) sb.style.display = sb.style.display === "none" ? "" : "none";
        },

        about: () => {
            const info = os.program.getInfo('notepad') || {};
            os.ui.windowStart('notepad', {
                id: 'notepad-about', title: _('About Notepad'),
                width: '340px', height: '240px', resizable: false, single: true,
                body() {
                    return `<div style="padding:28px 24px;text-align:center;color:#fff;font-family:system-ui,sans-serif;font-size:13px;line-height:1.6;">
                        <svg width="48" height="48" style="margin-bottom:10px;"><use href="#notepad"></use></svg>
                        <div style="font-size:16px;font-weight:600;margin-bottom:6px;">Notepad ${info.version || '1.0'}</div>
                        <div style="opacity:.75;">${info.description || _('A simple notepad application for basic text editing.')}</div>
                        <div style="opacity:.45;margin-top:6px;font-size:11px;">${_('Owner')}: ${info.owner || 'Sandstorm'}</div>
                    </div>`;
                }
            });
        },

        help: () => {
            os.ui.windowStart('notepad', {
                id: 'notepad-help', title: _('Notepad Help'),
                width: '480px', height: '420px', resizable: true, single: true,
                body() {
                    const s = (t, b) => `<div style="margin-bottom:12px;"><strong>${t}</strong><div style="opacity:.75;margin-top:3px;">${b}</div></div>`;
                    return `<div style="padding:20px;color:#fff;font-family:system-ui,sans-serif;font-size:12px;line-height:1.6;overflow-y:auto;height:100%;box-sizing:border-box;">
                        <h3 style="margin:0 0 16px;font-size:14px;">${_('Notepad Help')}</h3>
                        ${s(_('Open / Save / Save As'), _('File menu → Open, Save, Save As. Use these to manage your text files.'))}
                        ${s(_('Find & Replace'), _('Edit → Find or Edit → Replace. Press Enter to find next, Shift+Enter for previous.'))}
                        ${s(_('Font'), _('Edit → Font. Choose typeface, style, size and text colour.'))}
                        ${s(_('Font size shortcut'), _('Ctrl + Plus increases font size, Ctrl + Minus decreases it while the editor is focused.'))}
                        ${s(_('Status bar'), _('View → Status bar toggles the line/column counter at the bottom.'))}
                        ${s(_('Print'), _('File → Print opens the browser print dialog.'))}
                        ${s(_('Keyboard shortcuts'), `
                            <table style="border-collapse:collapse;width:100%;">
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+Z</td><td>${_('Undo')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+Y</td><td>${_('Redo')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+X</td><td>${_('Cut')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+C</td><td>${_('Copy')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+V</td><td>${_('Paste')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+F</td><td>${_('Find')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl++</td><td>${_('Increase font size')}</td></tr>
                                <tr><td style="padding:2px 8px 2px 0;opacity:.6;">Ctrl+-</td><td>${_('Decrease font size')}</td></tr>
                            </table>
                        `)}
                    </div>`;
                }
            });
        },

        font: () => {
            const savedStart = editor.selectionStart;
            const savedEnd   = editor.selectionEnd;

            const allFonts = (app.fonts?.get() || []).map(f => f.name);

            const SYSTEM_FONT_NAMES = [
                'Arial','Arial Black','Comic Sans MS','Courier New','Georgia',
                'Impact','Lucida Console','Palatino Linotype','Tahoma','Times New Roman',
                'Trebuchet MS','Verdana','Helvetica','Geneva','Monaco','Monospace'
            ];

            // Read current editor styles safely
            const curSize   = parseFloat(editor.style.fontSize)  || 13;
            const curFamily = (editor.style.fontFamily || 'monospace').replace(/['"]/g, '').split(',')[0].trim();
            const curBold   = editor.style.fontWeight === 'bold';
            const curItalic = editor.style.fontStyle  === 'italic';

            // Convert any rgb(...) colour to #rrggbb for input[type=color]
            function _toHex(raw) {
                const m = raw.match(/rgb\s*\(\s*(\d+),\s*(\d+),\s*(\d+)\)/);
                if (m) return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
                if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
                return '#000000';
            }
            const curColor = _toHex(editor.style.color || '#000000');

            os.addCSS('notepad-font-dlg', `
                .np-fdlg{padding:14px;color:#fff;font-family:system-ui,sans-serif;font-size:12px;
                    display:flex;flex-direction:column;gap:10px;height:100%;box-sizing:border-box;}
                .np-fdlg label{display:flex;flex-direction:column;gap:3px;font-size:11px;opacity:.75;}
                .np-fdlg select,.np-fdlg input[type=number]{background:var(--theme-backgruondcolorc,#00000040);
                    border:0;border-radius:5px;color:#fff;padding:5px 8px;font-size:12px;
                    box-shadow:1px 1px 1px #ffffff29,-1px -1px 1px #ffffff29;outline:none;
                    width:100%;box-sizing:border-box;}
                .np-fdlg input[type=color]{height:30px;padding:2px 4px;cursor:pointer;border:0;
                    border-radius:5px;width:100%;background:transparent;}
                .np-fdlg .np-frow{display:flex;gap:8px;}
                .np-fdlg .np-frow label{flex:1;}
                .np-fdlg .np-fcheck{display:flex;align-items:center;gap:6px;flex-direction:row;font-size:12px;opacity:1;}
                .np-fpreview{border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:10px;
                    min-height:52px;display:flex;align-items:center;justify-content:center;flex:1;overflow:hidden;}
                .np-factions{display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;}
            `);

            const fontOptions = allFonts.map(f =>
                `<option value="${f}"${f.toLowerCase() === curFamily.toLowerCase() ? ' selected' : ''}>${f}</option>`
            ).join('');

            const uid = 'np-font-' + Date.now();

            os.ui.windowStart('notepad', {
                id:        'notepad-font',
                title:     _('Font'),
                single:    true,
                width:     '460px',
                height:    '500px',
                resizable: false,
                body: function (wo) {
                    const wid = (wo && wo.windowId) ? wo.windowId : '';

                    // Bindings wired after the window is in the DOM
                    setTimeout(function () {
                        const root = wid
                            ? $('#' + wid + '-win')[0]
                            : document.querySelector('.' + uid);
                        if (!root) return;

                        const selFont  = root.querySelector('.np-fsel');
                        const inpSize  = root.querySelector('.np-fsize');
                        const inpColor = root.querySelector('.np-fcolor');
                        const chkBold  = root.querySelector('.np-fbold');
                        const chkItal  = root.querySelector('.np-fital');
                        const prev     = root.querySelector('.np-fpreview span');

                        if (!selFont || !inpSize || !inpColor || !chkBold || !chkItal) return;

                        const loadedGF = new Set(SYSTEM_FONT_NAMES.map(f => f.toLowerCase()));

                        function loadGF(name) {
                            const key = name.toLowerCase();
                            if (loadedGF.has(key)) return;
                            loadedGF.add(key);
                            const lnk = document.createElement('link');
                            lnk.rel  = 'stylesheet';
                            lnk.href = 'https://fonts.googleapis.com/css2?family=' +
                                encodeURIComponent(name) + '&display=swap';
                            document.head.appendChild(lnk);
                        }

                        function refresh() {
                            if (!prev) return;
                            prev.style.fontFamily  = "'" + selFont.value + "',sans-serif";
                            prev.style.fontSize    = inpSize.value + 'px';
                            prev.style.color       = inpColor.value;
                            prev.style.fontWeight  = chkBold.checked ? 'bold' : 'normal';
                            prev.style.fontStyle   = chkItal.checked ? 'italic' : 'normal';
                        }

                        selFont.addEventListener('change', function () { loadGF(selFont.value); refresh(); });
                        inpSize.addEventListener('input',  refresh);
                        inpColor.addEventListener('input', refresh);
                        chkBold.addEventListener('change', refresh);
                        chkItal.addEventListener('change', refresh);
                        refresh();

                        root.querySelector('.np-fapply')?.addEventListener('click', function () {
                            var chosenFont = selFont.value;
                            var chosenSize = inpSize.value;

                            loadGF(chosenFont);
                            editor.style.fontFamily = "'" + chosenFont + "',sans-serif";
                            editor.style.fontSize   = chosenSize + 'px';
                            editor.style.color      = inpColor.value;
                            editor.style.fontWeight = chkBold.checked ? 'bold' : 'normal';
                            editor.style.fontStyle  = chkItal.checked ? 'italic' : 'normal';
                            root.querySelector('.controls .close, .window-header .icon .control-menu .ctm-row.close')?.click();

                            // Restore cursor and reposition the caret AFTER the chosen
                            // font is fully loaded. If we measure before the font loads,
                            // getCaretCoordinates uses the fallback (sans-serif) metrics;
                            // when the real font then loads and the text reflows, the caret
                            // ends up at the wrong x position.
                            function _refocus() {
                                editor.focus();
                                editor.setSelectionRange(savedStart, savedEnd);
                                requestAnimationFrame(function () {
                                    app.ui.caret.updatePosition();
                                });
                            }

                            setTimeout(function () {
                                var fontSpec = chosenSize + 'px \'' + chosenFont + '\'';
                                if (document.fonts && typeof document.fonts.load === 'function') {
                                    document.fonts.load(fontSpec)
                                        .then(_refocus)
                                        .catch(_refocus);
                                } else {
                                    _refocus();
                                }
                            }, 50);
                        });
                        root.querySelector('.np-fcancel')?.addEventListener('click', function () {
                            root.querySelector('.controls .close, .window-header .icon .control-menu .ctm-row.close')?.click();
                        });
                    }, 0);

                    return '<div class="np-fdlg ' + uid + '">' +
                        '<label>' + _('Font family') + '<select class="np-fsel">' + fontOptions + '</select></label>' +
                        '<div class="np-frow">' +
                            '<label>' + _('Size (px)') + '<input type="number" class="np-fsize" value="' + curSize + '" min="6" max="120" step="1"></label>' +
                            '<label>' + _('Text colour') + '<input type="color" class="np-fcolor" value="' + curColor + '"></label>' +
                        '</div>' +
                        '<div class="np-frow">' +
                            '<label class="np-fcheck"><input type="checkbox" class="np-fbold"' + (curBold ? ' checked' : '') + '> <span>' + _('Bold') + '</span></label>' +
                            '<label class="np-fcheck"><input type="checkbox" class="np-fital"' + (curItalic ? ' checked' : '') + '> <span>' + _('Italic') + '</span></label>' +
                        '</div>' +
                        '<div style="font-size:11px;opacity:.5;">' + _('Preview') + '</div>' +
                        '<div class="np-fpreview"><span>' + _('The quick brown fox jumps over the lazy dog') + '</span></div>' +
                        '<div class="np-factions">' +
                            '<button class="aero-button np-fcancel">' + _('Cancel') + '</button>' +
                            '<button class="aero-button np-fapply">' + _('Apply') + '<div class="after pulse"></div></button>' +
                        '</div>' +
                    '</div>';
                }
            });
        }
    };

    // ── Tab bar ──────────────────────────────────────────────────────────────
    let _previousTabId = null;
    const _tabState = new Map(); // tabId -> {content, currentFile}

    $(win).on('notepad-tab-activated', (e, tabId) => {
        if (_previousTabId != null) {
            _tabState.set(_previousTabId, { content: editor.value, currentFile: win._np._currentFile });
        }
        const saved = _tabState.get(tabId);
        editor.value = saved ? saved.content : '';
        win._np._currentFile = saved ? saved.currentFile : null;
        _previousTabId = tabId;
        updateStatus();
    });

    win._npTabs = createTabs(win);

    // ── Font size keyboard shortcut (Ctrl+Plus / Ctrl+Minus when editor focused) ─
    editor.addEventListener('keydown', e => {
        if (!e.ctrlKey && !e.metaKey) return;
        if (e.key === '+' || e.key === '=' || e.key === 'Add') {
            e.preventDefault();
            const sz = Math.min(120, (parseFloat(editor.style.fontSize) || 13) + 1);
            editor.style.fontSize = sz + 'px';
            updateStatus();
            requestAnimationFrame(() => app.ui.caret.updatePosition());
        } else if (e.key === '-' || e.key === 'Subtract') {
            e.preventDefault();
            const sz = Math.max(6, (parseFloat(editor.style.fontSize) || 13) - 1);
            editor.style.fontSize = sz + 'px';
            updateStatus();
            requestAnimationFrame(() => app.ui.caret.updatePosition());
        }
    });

    // ── Init ─────────────────────────────────────────────────────────────────
    updateStatus();
    editor.focus();

    const _winInstanceId = win.id?.replace('-win', '') || '';
    const _pendingPath   = app.notepad?._pendingFiles?.[_winInstanceId];
    app.dev.log(`data init: instanceId="${_winInstanceId}" pendingPath="${_pendingPath}"`, 'Notepad');
    if (_pendingPath) {
        delete app.notepad._pendingFiles[_winInstanceId];
        const node = app.explorer?._getNode(_pendingPath);
        app.dev.log(`data init: node found=${!!node} url="${node?.url}"`, 'Notepad');
        if (node) {
            const name = _pendingPath.split('/').pop();
            const _applyContent = text => {
                app.dev.log(`data init: applied "${_pendingPath}" (${text.length} chars)`, 'Notepad');
                editor.value = text;
                win._np._currentFile = _pendingPath;
                os.ui.windows.functions.updateTitle(_winInstanceId, name + ' — Notepad');
                win._npTabs?.setTitle(win._npTabs.getActive(), name);
                updateStatus();
            };
            if (node.url) {
                fetch(node.url).then(r => r.text()).then(_applyContent).catch(e => app.dev.log(`data init: fetch failed ${e}`, 'Notepad'));
            } else {
                _applyContent(node.content ?? '');
            }
        } else {
            app.dev.log(`data init: _getNode returned null for "${_pendingPath}"`, 'Notepad');
        }
    }
}
