/**
 * @file controlpanel/program.js
 * @description Control Panel window management sub-module.
 *
 * Exports `setup(os)` which builds `app.controlpanel.window` — the public API
 * for opening the Control Panel and its associated windows (Task Manager,
 * panel shortcuts).
 *
 * Loaded as a sub-module by `controlpanel.js` during `setup()`, so
 * `app.controlpanel` is guaranteed to exist when this runs.
 *
 * @module components/controlpanel/program
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-task-manager',
        viewBox: '0 0 386 328',
        content: ` <g
     transform="matrix(0.10010119,0,0,-0.10014322,-10.471175,339.76127)"
     fill="#fff"
     stroke="none"
     id="g2760">
    <path
       d="M 110,1770 V 410 H 2035 3960 V 1770 3130 H 2035 110 Z m 2890,1191 c 64,-46 65,-125 1,-168 -116,-78 -271,44 -185,146 43,52 128,62 184,22 z m 390,0 c 64,-46 65,-125 1,-168 -116,-78 -271,44 -185,146 43,52 128,62 184,22 z m 380,0 c 64,-46 65,-125 1,-168 -116,-78 -271,44 -185,146 43,52 128,62 184,22 z m 50,-1361 V 570 H 2035 250 v 1030 1030 h 1785 1785 z"
       id="path2756" />
    <path
       d="m 2226,2129 c -18,-14 -85,-136 -198,-362 l -170,-341 -65,130 c -35,71 -74,137 -86,146 -20,16 -58,18 -414,18 H 900 v -105 -105 h 340 340 l 100,-201 c 92,-182 104,-202 135,-215 41,-17 80,-10 113,19 12,11 97,171 188,354 91,183 167,333 170,333 2,0 33,-58 69,-130 51,-101 71,-133 95,-145 26,-14 73,-15 330,-13 l 298,3 26,24 c 34,32 42,80 21,124 -9,20 -24,39 -33,44 -9,4 -132,10 -272,13 l -255,5 -100,197 c -104,206 -122,228 -183,228 -16,0 -41,-10 -56,-21 z"
       id="path2758" />
  </g>`
    });

    os.svg.global.load({
        id: 'ic-settings',
        viewBox: '0 0 512 512',
        content: `<path fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M262.29 192.31a64 64 0 1057.4 57.4 64.13 64.13 0 00-57.4-57.4zM416.39 256a154.34 154.34 0 01-1.53 20.79l45.21 35.46a10.81 10.81 0 012.45 13.75l-42.77 74a10.81 10.81 0 01-13.14 4.59l-44.9-18.08a16.11 16.11 0 00-15.17 1.75A164.48 164.48 0 01325 400.8a15.94 15.94 0 00-8.82 12.14l-6.73 47.89a11.08 11.08 0 01-10.68 9.17h-85.54a11.11 11.11 0 01-10.69-8.87l-6.72-47.82a16.07 16.07 0 00-9-12.22 155.3 155.3 0 01-21.46-12.57 16 16 0 00-15.11-1.71l-44.89 18.07a10.81 10.81 0 01-13.14-4.58l-42.77-74a10.8 10.8 0 012.45-13.75l38.21-30a16.05 16.05 0 006-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 00-6.07-13.94l-38.19-30A10.81 10.81 0 0149.48 186l42.77-74a10.81 10.81 0 0113.14-4.59l44.9 18.08a16.11 16.11 0 0015.17-1.75A164.48 164.48 0 01187 111.2a15.94 15.94 0 008.82-12.14l6.73-47.89A11.08 11.08 0 01213.23 42h85.54a11.11 11.11 0 0110.69 8.87l6.72 47.82a16.07 16.07 0 009 12.22 155.3 155.3 0 0121.46 12.57 16 16 0 0015.11 1.71l44.89-18.07a10.81 10.81 0 0113.14 4.58l42.77 74a10.8 10.8 0 01-2.45 13.75l-38.21 30a16.05 16.05 0 00-6.05 14.08c.33 4.14.55 8.3.55 12.47z"/>`
    });

    const base = os.config.local.ComponentsRoot + 'controlpanel/';

    let _shortcutOpen = false;

    app.controlpanel.window = {

        /** Open the main Control Panel window (launcher view by default). */
        main() {
            const $root = $('#cp-root');

            if (!_shortcutOpen) {
                app.program.controlpanel.reset();
            }
            _shortcutOpen = false;

            if (app.exists("app.desktop.startmenu.addToRunningApps")) {
                app.desktop.startmenu.addToRunningApps("controlpanel");
            }

            // Window is already open — just re-render and focus.
            if ($root.length) {
                app.program.controlpanel._render();
                const wId = $root.closest('.window').attr('id')?.replace('-win', '');
                if (wId) try { app.setActiveWindow(wId); } catch(e) {}
                return;
            }

            os.ui.windowStart("controlpanel", {
                id:          "controlpanel",
                title:       _("Controlpanel"),
                resizable:   true,
                single:      true,
                width:       "1000px",
                height:      "868px",
                minWidth:    "425px",
                icontype:    "svg",
                windowIcon:  "#ic-controlpanel",
                taskbarIcon: "#ic-controlpanel",
                body(windowobj) {
                    const langToken = 'cp-main-' + windowobj?.windowId;
                    if (os.exists("app.language.registerRefresh")) {
                        os.language.registerRefresh(langToken, () => app.program.controlpanel._render());
                    }
                    windowobj?.on?.('close', () => {
                        app.program.controlpanel.reset();
                        if (os.exists("app.language.unregisterRefresh")) os.language.unregisterRefresh(langToken);
                    });
                    os.addCSS('cp-controlpanel', base + 'controlpanel.css', true);
                    os.addCSS('cp-launcher',     base + 'launcher.css',     true);
                    os.addCSS('cp-tabs',         base + 'tabs.css',         true);
                    setTimeout(() => app.program.controlpanel._render(), 50);
                    return '<div id="cp-root" class="cp-root"></div>';
                }
            });
        },

        /** Open the Task Manager in a separate window. */
        taskManager() {
            if (app.exists("app.desktop.startmenu.addToRunningApps")) {
                app.desktop.startmenu.addToRunningApps("controlpanel");
            }

            os.ui.windowStart("controlpanel", {
                id:          "cp-taskmanager",
                title:       _("Task Manager"),
                width:       "640px",
                height:      "440px",
                icontype:    "svg",
                single:      true,
                windowIcon:  '#ic-task-manager',
                taskbarIcon: '#ic-task-manager',
                body(windowobj) {
                    const css = `
                        <style>
                        #tm-root { display:flex; flex-direction:column; height:100%; box-sizing:border-box; font-size:12px; color:#fff; }
                        #tm-tabs { display:flex; gap:1px; padding:8px 12px 0; flex-shrink:0; }
                        .tm-tab { padding:7px 18px; border-radius:6px 6px 0 0; cursor:pointer; font-size:12px; color:rgba(255,255,255,0.55); transition:color 0.15s,background 0.15s; user-select:none; }
                        .tm-tab:hover { color:#fff; background:rgba(255,255,255,0.05); }
                        .tm-tab.active { color:#fff; background:var(--theme-backgruondcolorc,#00000040); }
                        #tm-body { flex:1; overflow:hidden; display:flex; flex-direction:column; min-height:0; }
                        #tm-proc-panel, #tm-perf-panel, #tm-info-panel { flex:1; overflow:hidden; display:none; min-height:0; }
                        #tm-proc-panel.visible, #tm-perf-panel.visible, #tm-info-panel.visible { display:flex; flex-direction:column; }
                        .tm-list { flex:1; display:flex; flex-direction:column; min-height:0; border-top:1px solid rgba(255,255,255,0.1); overflow:hidden; }
                        .tm-list-header { display:flex; align-items:center; height:32px; flex-shrink:0;  border-bottom:1px solid rgba(255,255,255,0.12); }
                        .tm-list-body { flex:1; overflow-y:auto; min-height:0; }
                        .tm-list-row { display:flex; align-items:center; min-height:34px; border-bottom:1px solid rgba(255,255,255,0.05); background-color:#ffffff00; transition:background-color 1s ease;}
                        .tm-list-row:hover { background-color:var(--theme-backgruondcolorc,#00000040); animation:fadeInOut 3s ease infinite; animation-delay:1s; }
                        .tm-list-row.tm-selected { background-color:var(--theme-backgruondcolorc,#00000040); }
                        .tm-col { padding:0 12px; font-size:12px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-sizing:border-box; }
                        .tm-list-header .tm-col { font-size:11px; font-weight:600; user-select:none; }
                        .tm-col-1 { flex:0 0 52%; }
                        .tm-col-2 { flex:0 0 24%; }
                        .tm-col-3 { flex:0 0 24%; }
                        .tm-name-cell { display:flex; align-items:center; gap:9px; }
                        .tm-icon { width:16px; height:16px; flex-shrink:0; display:flex; align-items:center; justify-content:center; opacity:0.9; }
                        .tm-icon svg { width:16px; height:16px; }
                        .tm-icon img { width:16px; height:16px; object-fit:contain; }
                        .tm-dot { width:7px; height:7px; border-radius:50%; background:#4ade80; flex-shrink:0; }
                        .tm-empty { color:rgba(255,255,255,0.38); font-style:italic; padding:24px 12px; text-align:center; }
                        #tm-footer { display:flex; align-items:center; gap:8px; padding:8px 12px; flex-shrink:0; }
                        #tm-footer-info { font-size:11px; color:rgba(255,255,255,0.5); flex:1; }
                        #tm-end-task { font-size:11px; }
                        #tm-end-task:disabled { opacity:0.35; cursor:default; }
                        .tm-perf-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:14px; }
                        .tm-perf-card { background:var(--theme-backgruondcolorc,#00000040); border-radius:8px; padding:14px 16px; }
                        .tm-perf-label { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,0.45); margin-bottom:6px; }
                        .tm-perf-val { font-size:22px; font-weight:600; color:#fff; }
                        .tm-perf-sub { font-size:11px; color:rgba(255,255,255,0.45); margin-top:3px; }
                        .tm-bar-wrap { height:5px; background:rgba(255,255,255,0.1); border-radius:3px; margin-top:10px; overflow:hidden; }
                        .tm-bar { height:100%; border-radius:3px; background:#4ade80; transition:width 0.6s; }
                        </style>
                    `;

                    const KIND_LABEL = { file: () => _('System file'), module: () => _('Module'), program: () => _('Program') };

                    const html = `
                        ${css}
                        <div id="tm-root">
                            <div id="tm-tabs">
                                <div class="tm-tab active" data-tm-tab="proc">${_('Processes')}</div>
                                <div class="tm-tab" data-tm-tab="perf">${_('Performance')}</div>
                                <div class="tm-tab" data-tm-tab="info">${_('Information')}</div>
                            </div>
                            <div id="tm-body">
                                <div id="tm-proc-panel" class="visible">
                                    <div class="tm-list">
                                        <div class="tm-list-header">
                                            <span class="tm-col tm-col-1">${_('Name')}</span>
                                            <span class="tm-col tm-col-2">${_('Status')}</span>
                                            <span class="tm-col tm-col-3">${_('Version')}</span>
                                        </div>
                                        <div class="tm-list-body" id="tm-proc-list"></div>
                                    </div>
                                </div>
                                <div id="tm-perf-panel">
                                    <div class="tm-perf-grid">
                                        <div class="tm-perf-card">
                                            <div class="tm-perf-label">${_('Memory')}</div>
                                            <div class="tm-perf-val" id="tm-mem-val">—</div>
                                            <div class="tm-perf-sub" id="tm-mem-sub"></div>
                                            <div class="tm-bar-wrap"><div class="tm-bar" id="tm-mem-bar" style="width:0%"></div></div>
                                        </div>
                                        <div class="tm-perf-card">
                                            <div class="tm-perf-label">${_('CPU')}</div>
                                            <div class="tm-perf-val" id="tm-cpu-val">—</div>
                                            <div class="tm-perf-sub" id="tm-cpu-sub"></div>
                                        </div>
                                        <div class="tm-perf-card">
                                            <div class="tm-perf-label">${_('Running programs')}</div>
                                            <div class="tm-perf-val" id="tm-prog-count">0</div>
                                            <div class="tm-perf-sub" id="tm-win-count"></div>
                                        </div>
                                        <div class="tm-perf-card">
                                            <div class="tm-perf-label">${_('Platform')}</div>
                                            <div class="tm-perf-val" style="font-size:14px;" id="tm-plat-val">—</div>
                                            <div class="tm-perf-sub" id="tm-plat-sub"></div>
                                        </div>
                                    </div>
                                </div>
                                <div id="tm-info-panel">
                                    <div class="tm-list">
                                        <div class="tm-list-header">
                                            <span class="tm-col tm-col-1">${_('Path')}</span>
                                            <span class="tm-col tm-col-2">${_('Kind')}</span>
                                            <span class="tm-col tm-col-3">${_('Loaded at')}</span>
                                        </div>
                                        <div class="tm-list-body" id="tm-info-list"></div>
                                    </div>
                                </div>
                            </div>
                            <div id="tm-footer">
                                <span id="tm-footer-info"></span>
                                <button class="aero-button m" id="tm-end-task" disabled>
                                    ${_('End Task')}<div class="after"></div>
                                </button>
                                <button class="aero-button m" id="tm-refresh">
                                    ${_('Refresh')}<div class="after"></div>
                                </button>
                            </div>
                        </div>
                    `;

                    let _interval = null;
                    let _selected = null;
                    let _activeTab = 'proc';

                    function _mb(bytes) {
                        return (bytes / 1048576).toFixed(1) + ' MB';
                    }

                    function _iconHtml(p) {
                        if (!p.icon) return `<div class="tm-dot"></div>`;
                        if (p.icontype === 'svg' || p.icon.startsWith('#')) {
                            return `<div class="tm-icon"><svg><use href="${p.icon}"></use></svg></div>`;
                        }
                        return `<div class="tm-icon"><img src="${p.icon}" alt=""></div>`;
                    }

                    function _updateEndTask() {
                        const btn = $('#tm-end-task')[0];
                        if (btn) btn.disabled = !_selected;
                    }

                    // Only touches the DOM when the rendered content actually
                    // changed. `_refresh()` runs every 2s via `_interval` — always
                    // reassigning `list.innerHTML` on every tick destroys and
                    // recreates every row element even when nothing changed,
                    // which silently killed the :hover fadeInOut animation (and
                    // any other transient state tied to that specific element)
                    // the instant a tick landed while the mouse was still over a
                    // row — confirmed live by tagging a row's DOM node and
                    // watching it disappear after exactly one refresh tick.
                    function _setListHTML(list, html) {
                        if (list.dataset.lastHtml === html) return;
                        list.dataset.lastHtml = html;
                        list.innerHTML = html;
                    }

                    function _renderProcs() {
                        const list = $('#tm-proc-list')[0];
                        if (!list) return;
                        const all     = app.program.getAll();
                        const running = Object.entries(all).filter(([, p]) => p.status === 'running');

                        if (running.length === 0) {
                            _selected = null;
                            _updateEndTask();
                            _setListHTML(list, `<div class="tm-empty">${_('No running processes')}</div>`);
                            return;
                        }

                        if (!running.some(([id]) => id === _selected)) {
                            _selected = null;
                            _updateEndTask();
                        }

                        _setListHTML(list, running.map(([id, p]) => `
                            <div class="tm-list-row${_selected === id ? ' tm-selected' : ''}" data-tm-id="${id}">
                                <span class="tm-col tm-col-1"><div class="tm-name-cell">${_iconHtml(p)}<span>${p.name || id}</span></div></span>
                                <span class="tm-col tm-col-2">${_('Running')}</span>
                                <span class="tm-col tm-col-3">${p.version || '—'}</span>
                            </div>
                        `).join(''));
                    }

                    function _renderPerf() {
                        const mem = performance.memory;
                        if (mem) {
                            const used  = mem.usedJSHeapSize;
                            const total = mem.jsHeapSizeLimit;
                            const pct   = Math.round(used / total * 100);
                            const el    = $('#tm-mem-val')[0];
                            const sub   = $('#tm-mem-sub')[0];
                            const bar   = $('#tm-mem-bar')[0];
                            if (el)  el.textContent  = _mb(used);
                            if (sub) sub.textContent = `${_('of')} ${_mb(total)} (${pct}%)`;
                            if (bar) bar.style.width = pct + '%';
                        } else {
                            const el = $('#tm-mem-val')[0];
                            if (el) el.textContent = _('N/A');
                        }

                        const cores  = navigator.hardwareConcurrency || '—';
                        const cpuEl  = $('#tm-cpu-val')[0];
                        const cpuSub = $('#tm-cpu-sub')[0];
                        if (cpuEl)  cpuEl.textContent  = cores;
                        if (cpuSub) cpuSub.textContent = _('Logical cores');

                        const platEl  = $('#tm-plat-val')[0];
                        const platSub = $('#tm-plat-sub')[0];
                        if (platEl)  platEl.textContent  = navigator.platform || '—';
                        if (platSub) platSub.textContent = navigator.userAgent.split(' ').slice(-1)[0] || '';

                        const all      = app.program.getAll();
                        const runCount = Object.values(all).filter(p => p.status === 'running').length;
                        const winCount = document.querySelectorAll('.window').length;
                        const pcEl = $('#tm-prog-count')[0];
                        const wcEl = $('#tm-win-count')[0];
                        if (pcEl) pcEl.textContent = runCount;
                        if (wcEl) wcEl.textContent = `${winCount} ${_('open windows')}`;
                    }

                    // Per direct feedback: the Information tab's own "Files loaded
                    // this session: N" line moved down into this shared footer,
                    // replacing the processes/memory summary while that tab is
                    // active, rather than sitting as a separate line above its own
                    // list — swapped by activeTab rather than being a second,
                    // always-visible summary alongside the normal footer text.
                    function _renderFooter() {
                        const el = $('#tm-footer-info')[0];
                        if (!el) return;

                        if (_activeTab === 'info') {
                            const loaded = os.config.local.loadedModules || [];
                            el.textContent = `${_('Files loaded this session')}: ${loaded.length}`;
                            return;
                        }

                        const all      = app.program.getAll();
                        const runCount = Object.values(all).filter(p => p.status === 'running').length;
                        let txt = `${runCount} ${_('processes')}`;
                        if (performance.memory) txt += `  •  ${_('Memory')}: ${_mb(performance.memory.usedJSHeapSize)}`;
                        el.textContent = txt;
                    }

                    // Every file loaded this session — sandstorm/core/modules.js's
                    // three loaders (importFile/includeModule/includeProgram) each
                    // append one entry here, so this isn't limited to core boot
                    // files the way app.config.local.importFiles is (that one only
                    // ever tracked importFile's own loads, never a program's own
                    // lazy sub-modules — which is most of what a program like
                    // Designer loads at runtime). "Loaded at" uses the same
                    // formatClockTime() the taskbar clock itself renders with
                    // (sandstorm/components/taskbar/clock.js), honoring the
                    // user's own 12h/24h Control Panel > Taskbar setting — plain
                    // toLocaleTimeString() ignores that setting entirely and just
                    // follows the browser's locale (12-hour in a US-locale one).
                    function _renderInfo() {
                        const loaded  = os.config.local.loadedModules || [];
                        const list = $('#tm-info-list')[0];
                        if (!list) return;
                        if (loaded.length === 0) {
                            _setListHTML(list, `<div class="tm-empty">${_('Nothing loaded yet')}</div>`);
                            return;
                        }
                        _setListHTML(list, loaded.map(entry => `
                            <div class="tm-list-row">
                                <span class="tm-col tm-col-1">${os.util.escapeHtml(entry.path)}</span>
                                <span class="tm-col tm-col-2">${KIND_LABEL[entry.kind]?.() || os.util.escapeHtml(entry.kind)}</span>
                                <span class="tm-col tm-col-3">${os.desktop.taskbar.formatClockTime(new Date(entry.loadedAt))}</span>
                            </div>
                        `).join(''));
                    }

                    function _refresh() {
                        _renderProcs();
                        _renderPerf();
                        _renderInfo();
                        _renderFooter();
                    }

                    setTimeout(() => {
                        _refresh();
                        _interval = setInterval(_refresh, 2000);

                        $('#tm-refresh').on('click', _refresh);

                        $('#tm-end-task').on('click', function () {
                            if (!_selected) return;
                            app.ui.windows.functions.closeProgramWindows(_selected);
                            _selected = null;
                            _updateEndTask();
                            setTimeout(_refresh, 300);
                        });

                        $('#tm-proc-list').on('click', function (e) {
                            const row = e.target.closest('.tm-list-row[data-tm-id]');
                            if (!row) return;
                            document.querySelectorAll('#tm-proc-list .tm-list-row').forEach(r => r.classList.remove('tm-selected'));
                            _selected = row.dataset.tmId;
                            row.classList.add('tm-selected');
                            _updateEndTask();
                        });

                        $('#tm-tabs').on('click', function (e) {
                            const tab = e.target.closest('.tm-tab');
                            if (!tab) return;
                            const key = tab.dataset.tmTab;
                            _activeTab = key;
                            document.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
                            tab.classList.add('active');
                            $('#tm-proc-panel').toggleClass('visible', key === 'proc');
                            $('#tm-perf-panel').toggleClass('visible', key === 'perf');
                            $('#tm-info-panel').toggleClass('visible', key === 'info');
                            _renderFooter();
                        });

                        if (windowobj) {
                            windowobj.on('close', () => {
                                if (_interval) { clearInterval(_interval); _interval = null; }
                            });
                        }
                    }, 0);

                    return html;
                }
            });
        },

        /** Open main window with Taskbar panel pre-selected. */
        taskbar() {
            _shortcutOpen = true;
            app.program.controlpanel.open('taskbar');
            app.controlpanel.window.main();
        },

        /** Open main window with Background panel pre-selected. */
        customize() {
            _shortcutOpen = true;
            app.program.controlpanel.open('customize');
            app.controlpanel.window.main();
        },

        /** Open main window with Theme panel pre-selected. */
        theme() {
            _shortcutOpen = true;
            app.program.controlpanel.open('theme');
            app.controlpanel.window.main();
        },

        /** Open main window with Users panel pre-selected. */
        users() {
            _shortcutOpen = true;
            app.program.controlpanel.open('users');
            app.controlpanel.window.main();
        }
    };
}

export function start() {}
