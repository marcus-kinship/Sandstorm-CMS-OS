/**
 * @file controlpanel/controlpanel.js
 * @description Control Panel program for Sandstorm OS.
 *
 * ES module that registers the built-in settings program.
 * Exports `setup(os)` (icon + program registration) and
 * `start(os, win)` (window creation with tabbed settings interface).
 *
 * The Control Panel provides access to system settings including
 * appearance, users, programs, system info, and updates.
 * Sub-pages are loaded from `controlpanel/programs/` as separate modules.
 *
 * @module components/controlpanel/controlpanel
 */
export async function setup(os) {

    // ── SVG Icons ─────────────────────────────────────────────────────────────

    os.svg.global.load({
        id: 'ic-controlpanel',
        viewBox: '0 0 222 170',
        content: `<g>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(92, 190, 223)"
 d="M12.720,0.580 L209.280,0.580 C216.065,0.580 221.565,6.080 221.565,12.865 L221.565,157.135 C221.565,163.920 216.065,169.420 209.280,169.420 L12.720,169.420 C5.935,169.420 0.435,163.920 0.435,157.135 L0.435,12.865 C0.435,6.080 5.935,0.580 12.720,0.580 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(3, 112, 200)"
 d="M29.415,137.605 L187.230,137.605 C188.622,137.605 189.750,138.733 189.750,140.125 L189.750,145.480 C189.750,146.872 188.622,148.000 187.230,148.000 L29.415,148.000 C28.023,148.000 26.895,146.872 26.895,145.480 L26.895,140.125 C26.895,138.733 28.023,137.605 29.415,137.605 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(241, 149, 0)"
 d="M29.415,137.605 L103.283,137.605 C103.933,137.605 105.803,137.605 105.803,137.605 C105.803,137.605 105.803,139.384 105.803,140.125 L105.803,145.480 C105.803,146.136 105.803,148.000 105.803,148.000 C105.803,148.000 104.018,148.000 103.283,148.000 L29.415,148.000 C28.023,148.000 26.895,146.872 26.895,145.480 L26.895,140.125 C26.895,138.733 28.023,137.605 29.415,137.605 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(3, 112, 200)"
 d="M150.375,90.040 L181.717,90.040 C186.154,90.040 189.750,93.636 189.750,98.072 C189.750,102.509 186.154,106.105 181.717,106.105 L150.375,106.105 C145.939,106.105 142.343,102.509 142.343,98.072 C142.343,93.636 145.939,90.040 150.375,90.040 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(3, 112, 200)"
 d="M150.375,58.540 L181.717,58.540 C186.154,58.540 189.750,62.136 189.750,66.573 C189.750,71.009 186.154,74.605 181.717,74.605 L150.375,74.605 C145.939,74.605 142.343,71.009 142.343,66.573 C142.343,62.136 145.939,58.540 150.375,58.540 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(241, 149, 0)"
 d="M150.375,27.040 L181.717,27.040 C186.154,27.040 189.750,30.636 189.750,35.073 C189.750,39.509 186.154,43.105 181.717,43.105 L150.375,43.105 C145.939,43.105 142.343,39.509 142.343,35.073 C142.343,30.636 145.939,27.040 150.375,27.040 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(3, 112, 200)"
 d="M69.026,27.040 C92.034,27.040 110.685,45.938 110.685,69.250 C110.685,92.562 92.034,111.460 69.026,111.460 C46.019,111.460 27.367,92.562 27.367,69.250 C27.367,45.938 46.019,27.040 69.026,27.040 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(241, 149, 0)"
 d="M68.790,27.040 C68.790,27.040 70.208,22.315 73.515,22.315 C102.652,24.205 116.276,52.791 115.882,63.895 C116.040,69.014 110.1000,69.250 110.1000,69.250 C110.1000,69.250 77.295,69.329 73.515,69.250 C69.735,69.171 68.948,64.998 68.948,63.895 C68.948,62.792 68.790,27.040 68.790,27.040 Z"/>
</g>`
    });

    os.svg.global.load({
        id: 'ic-code',
        viewBox: '0 0 640 640',
        content: `<g><path style="fill:#ffffff;" d="M392.8 65.2C375.8 60.3 358.1 70.2 353.2 87.2L225.2 535.2C220.3 552.2 230.2 569.9 247.2 574.8C264.2 579.7 281.9 569.8 286.8 552.8L414.8 104.8C419.7 87.8 409.8 70.1 392.8 65.2zM457.4 201.3C444.9 213.8 444.9 234.1 457.4 246.6L530.8 320L457.4 393.4C444.9 405.9 444.9 426.2 457.4 438.7C469.9 451.2 490.2 451.2 502.7 438.7L598.7 342.7C611.2 330.2 611.2 309.9 598.7 297.4L502.7 201.4C490.2 188.9 469.9 188.9 457.4 201.4zM182.7 201.3C170.2 188.8 149.9 188.8 137.4 201.3L41.4 297.3C28.9 309.8 28.9 330.1 41.4 342.6L137.4 438.6C149.9 451.1 170.2 451.1 182.7 438.6C195.2 426.1 195.2 405.8 182.7 393.3L109.3 320L182.6 246.6C195.1 234.1 195.1 213.8 182.6 201.3z"/></g>`
    });

    // ── Program registration ──────────────────────────────────────────────────

    const id = "controlpanel";
    const program = {
        name:        () => _("Controlpanel"),
        version:     "1.0",
        owner:       "Marcus Larsson",
        description: () => _("Settings for the entire os cms system"),
        icontype:    "svg",
        icon:        "#ic-controlpanel",
        taskbar:     false,
        startmenu:   true,
        multistart:  false,
        main:        "start",
        programtype: "system"
    };

    os.program.addInfo(id, program);

    // ── Context menus ─────────────────────────────────────────────────────────

    os.desktop.buildContextMenuList(1, "body", {
        title: () => _("Customize"),
        shortcut: "S+C",
        callback: () => {
            if (os.exists("app.controlpanel.window.customize")) {
                os.controlpanel.window.customize();
                os.desktop.taskbar.addToTaskbar(program, id);
            } else {
                os.ui.alert();
            }
        },
        alt: "C",
        icon: '<svg><use href="#ic-customize"></use></svg>'
    });

    app.desktop.buildContextMenuList(0, "#taskbar", {
        title: () => _("Task Manager"),
        shortcut: "S+T",
        callback: () => {
            if (app.exists("app.controlpanel.window.taskManager")) {
                app.controlpanel.window.taskManager();
            }
        },
        alt: "S+T",
        icon: '<svg><use href="#ic-task-manager"></use></svg>'
    });

    app.desktop.buildContextMenuList(1, "#taskbar", {
        title: () => _("Settings"),
        shortcut: "S+S",
        callback: () => {
            if (app.exists("app.controlpanel.window.taskbar")) {
                app.controlpanel.window.taskbar();
            }
        },
        alt: "S+S",
        icon: '<svg><use href="#ic-settings"></use></svg>'
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE STATE  (shared between app.controlpanel.add and app.program.controlpanel)
    // ─────────────────────────────────────────────────────────────────────────

    const _registry    = []; // { front, panel }
    let   _activePanel = null;
    let   _searchQuery = '';

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _escAttr(str) {
        return app.util.escapeHtml(str);
    }

    function _resolve(val) {
        return typeof val === 'function' ? val() : (val || '');
    }

    function _matches(item, query) {
        const q = query.toLowerCase();
        return [
            _resolve(item.front?.label),
            item.front?.name   || '',
            ...(item.front?.keywords || [])
        ].some(s => s.toLowerCase().includes(q));
    }

    // ── Render: launcher view ─────────────────────────────────────────────────

    function _launcherHTML() {
        const items = _searchQuery
            ? _registry.filter(r => _matches(r, _searchQuery))
            : _registry;

        const grid = items.map(item => {
            const front = item.front;
            const label = _resolve(front.label);
            const icon  = front.type === 'svg'
                ? `<svg class="cp-prog-icon-svg"><use href="${front.icon}"></use></svg>`
                : `<img class="cp-prog-icon-img" src="${front.icon}" alt="${_escAttr(label)}">`;
            return `
                <div class="cp-prog-item" data-cp-open="${_escAttr(item.panel.id)}">
                    <div class="cp-prog-icon">${icon}</div>
                    <div class="cp-prog-label">${label}</div>
                </div>`;
        }).join('');

        return `
            <div class="cp-launcher">
                <div class="cp-launcher-search">
                    <div class="cp-search-bar">
                        <svg class="cp-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input type="text"
                               class="cp-search-input"
                               data-cp-search
                               value="${_escAttr(_searchQuery)}"
                               placeholder="${_escAttr(_('Search settings...'))}">
                    </div>
                </div>
                <div class="cp-prog-grid">
                    ${grid || `<div class="cp-no-results">${_('No results')}</div>`}
                </div>
                <div class="cp-search-results"></div>
            </div>`;
    }

    // ── Render: navigation + panel view ──────────────────────────────────────

    function _navHTML() {
        const iconSize = { users: 17, system: 19 };

        function _buildTab(reg) {
            const panelId  = reg.panel.id;
            const active   = panelId === _activePanel ? ' active' : '';
            const front    = reg.front;
            const sz       = iconSize[panelId] || 16;
            const icon     = front.type === 'svg'
                ? `<svg class="cp-tab-icon-svg" width="${sz}" height="${sz}"><use href="${front.icon}"></use></svg>`
                : `<img class="cp-tab-icon-img" src="${front.icon}" alt="">`;
            const dataAttr = front.action
                ? `data-cp-action="${_escAttr(panelId)}"`
                : `data-cp-panel="${_escAttr(panelId)}"`;
            return `
                <div class="cp-tab${active}" ${dataAttr}>
                    <div class="cp-tab-icon" style="width:${sz}px;height:${sz}px;">${icon}</div>
                    <span class="cp-tab-name">${_resolve(reg.panel.name)}</span>
                    <span class="cp-tab-arrow">&#8250;</span>
                </div>`;
        }

        const normal  = _registry.filter(r => !r.front.pinBottom);
        const pinned  = _registry.filter(r =>  r.front.pinBottom);
        const nav     = normal.map(_buildTab).join('');
        const pinnedNav = pinned.length
            ? `<div class="cp-tab-nav-pinned">${pinned.map(_buildTab).join('')}</div>`
            : '';

        return `
            <div class="cp-tab-panel">
                <div class="cp-tab-sidebar">
                    <div class="cp-back" data-cp-back>
                        <div class="cp-back-icon"><svg><use href="#ic-arrow-left" /></svg></div>
                        <span class="cp-back-label">${_('Settings')}</span>
                    </div>
                    <div class="cp-tab-search" data-cp-search-toggle>
                        <svg class="cp-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input type="text"
                               class="cp-tab-search-input"
                               data-cp-tab-search
                               placeholder="${_escAttr(_('Search...'))}">
                    </div>
                    <div class="cp-tab-nav">${nav}</div>
                    ${pinnedNav}
                </div>
                <div class="cp-tab-main">
                    <div class="cp-tab-topbar">
                        <div class="cp-topbar-btn" data-cp-back title="${_escAttr(_('Settings'))}"><svg viewBox="0 0 24 24"><use href="#ic-arrow-left" /></svg></div>
                        <div class="cp-topbar-btn" data-cp-topbar-search title="${_escAttr(_('Search...'))}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                        </div>
                        <div class="cp-topbar-spacer"></div>
                        <div class="cp-topbar-btn" data-cp-sidebar-toggle title="${_escAttr(_('Menu'))}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <line x1="3" y1="12" x2="21" y2="12"/>
                                <line x1="3" y1="18" x2="21" y2="18"/>
                            </svg>
                        </div>
                    </div>
                    <div class="cp-tab-content" id="cp-tab-content"></div>
                </div>
            </div>`;
    }

    // ── Render: active panel content ──────────────────────────────────────────

    const _LOADING_HTML = `<div class="cp-panel-loading"><span class="cp-panel-spinner"></span></div>`;
    const _LOAD_ERROR_HTML = `<div class="cp-panel-load-error">${_('Failed to load this settings panel.')}</div>`;

    async function _renderPanel() {
        if (!_activePanel) return;
        const reg = _registry.find(r => r.panel.id === _activePanel);
        if (!reg) return;
        const $content = $('#cp-tab-content');
        if (!$content.length) return;

        let renderFn = reg.panel.render || reg.panel._render;
        if (!renderFn && reg.panel.contentPath) {
            $content.html(_LOADING_HTML);
            try {
                const mod = await os.includeModule(os.config.local.ComponentsRoot + reg.panel.contentPath);
                if (!mod) throw new Error(`includeModule returned null for "${reg.panel.contentPath}"`);
                if (mod.setup) await mod.setup(os);
                renderFn = mod[reg.panel.renderExport || 'render'];
                if (typeof renderFn !== 'function') throw new Error(`"${reg.panel.renderExport || 'render'}" export not found on "${reg.panel.contentPath}"`);
                reg.panel._render = renderFn; // cached — next opens are instant
            } catch (error) {
                app.dev.error(`Failed to load Control Panel panel "${reg.panel.id}"`, error, "ControlPanel");
                if (_activePanel === reg.panel.id) $content.html(_LOAD_ERROR_HTML);
                return;
            }
            if (_activePanel !== reg.panel.id) return; // user navigated away while loading
        }
        if (typeof renderFn === 'function') $content.html(renderFn(os));
    }

    // ── Main render loop ──────────────────────────────────────────────────────

    function _render() {
        const $root = $('#cp-root');
        if (!$root.length) return;

        if (_activePanel === null) {
            $root.html(_launcherHTML());
        } else {
            $root.html(_navHTML());
            _renderPanel();
        }
        _bindEvents($root);
    }

    // ── Event delegation ──────────────────────────────────────────────────────

    function _bindEvents($root) {
        $root.off('.cpui');

        // Open panel from launcher icon
        $root.on('click.cpui', '[data-cp-open]', function () {
            app.program.controlpanel.open($(this).data('cp-open'));
        });

        // Switch active panel via nav
        $root.on('click.cpui', '[data-cp-panel]', function () {
            _activePanel = $(this).data('cp-panel');
            $root.find('.cp-tab').removeClass('active');
            $(this).addClass('active');
            _renderPanel();
            $root.find('.cp-tab-panel').removeClass('cp-sidebar-open');
        });

        // Back to launcher
        $root.on('click.cpui', '[data-cp-back]', function () {
            _activePanel = null;
            _render();
        });

        $root.on('click.cpui', '[data-cp-sidebar-toggle]', function () {
            $root.find('.cp-tab-panel').toggleClass('cp-sidebar-open');
        });

        $root.on('click.cpui', '[data-cp-topbar-search]', function () {
            $root.find('.cp-tab-panel').addClass('cp-sidebar-open');
            setTimeout(() => $root.find('[data-cp-tab-search]').trigger('focus'), 50);
        });

        $(document).off('click.cpui-drawer-outside keydown.cpui-drawer-outside')
            .on('click.cpui-drawer-outside', function (e) {
                const $panel = $root.find('.cp-tab-panel.cp-sidebar-open');
                if (!$panel.length) return;
                const $sidebar = $root.find('.cp-tab-sidebar');
                const $toggles = $root.find('[data-cp-sidebar-toggle], [data-cp-topbar-search]');
                if (!$sidebar.is(e.target) && !$sidebar.has(e.target).length &&
                    !$toggles.is(e.target) && !$toggles.has(e.target).length) {
                    $panel.removeClass('cp-sidebar-open');
                }
            })
            .on('keydown.cpui-drawer-outside', function (e) {
                if (e.key === 'Escape') {
                    $root.find('.cp-tab-panel').removeClass('cp-sidebar-open');
                }
            });

        // Action items (pinBottom etc.)
        $root.on('click.cpui', '[data-cp-action]', function () {
            const panelId = $(this).data('cp-action');
            const reg = _registry.find(r => r.panel.id === panelId);
            if (reg?.front?.action) reg.front.action();
        });

        // Sidebar nav search
        $root.on('input.cpui', '[data-cp-tab-search]', function () {
            const q = $(this).val().toLowerCase();
            $root.find('.cp-tab-nav .cp-tab').each(function () {
                const panelId = $(this).data('cp-panel');
                const reg = _registry.find(r => r.panel.id === panelId);
                $(this).toggle(!q || (reg && _matches(reg, q)));
            });
        });

        $root.on('click.cpui', '[data-cp-search-toggle]', function (e) {
            const $search = $(this);
            if ($search.hasClass('cp-search-open')) return;
            e.stopPropagation();
            $search.addClass('cp-search-open');
            $search.find('[data-cp-tab-search]').trigger('focus');
        });

        $(document).off('click.cpui-search-outside keydown.cpui-search-outside')
            .on('click.cpui-search-outside', function (e) {
                const $open = $root.find('.cp-tab-search.cp-search-open');
                if ($open.length && !$open.has(e.target).length) {
                    $open.removeClass('cp-search-open');
                }
            })
            .on('keydown.cpui-search-outside', function (e) {
                if (e.key === 'Escape') {
                    $root.find('.cp-tab-search.cp-search-open').removeClass('cp-search-open');
                }
            });

        // Search input — searches front metadata AND registered settings items (label/keywords only, not html/style/className)
        $root.on('input.cpui', '[data-cp-search]', function () {
            _searchQuery = $(this).val();

            // Settings hits first — used both for results list and to expand the panel grid
            const hits = _searchQuery
                ? (app.controlpanel?.searchengine?.search(_searchQuery) || [])
                : [];
            const panelsWithSettingsHit = new Set(hits.map(h => h._panelId));

            // Panel grid — show panel if front-level metadata OR any settings item matches
            const panelItems = _searchQuery
                ? _registry.filter(r => _matches(r, _searchQuery) || panelsWithSettingsHit.has(r.panel.id))
                : _registry;
            const panelHTML = panelItems.length
                ? panelItems.map(item => {
                    const front = item.front;
                    const label = _resolve(front.label);
                    const icon  = front.type === 'svg'
                        ? `<svg class="cp-prog-icon-svg"><use href="${front.icon}"></use></svg>`
                        : `<img class="cp-prog-icon-img" src="${front.icon}" alt="${_escAttr(label)}">`;
                    return `<div class="cp-prog-item" data-cp-open="${_escAttr(item.panel.id)}"><div class="cp-prog-icon">${icon}</div><div class="cp-prog-label">${label}</div></div>`;
                }).join('')
                : `<div class="cp-no-results">${_('No results')}</div>`;
            $root.find('.cp-prog-grid').html(panelHTML);

            // Settings items results list
            let itemsHTML = '';
            if (hits.length) {
                const rows = hits.map(entry => {
                    const panelId  = entry._panelId || '';
                    const reg      = _registry.find(r => r.panel.id === panelId);
                    const panelLbl = _resolve(reg?.panel?.name) || panelId;
                    const itemLbl  = typeof entry.label === 'function' ? entry.label() : (entry.label || '');
                    return `<div class="cp-search-result-item" data-cp-open="${_escAttr(panelId)}">
                        <span class="cp-search-result-panel">${_escAttr(panelLbl)}</span>
                        <span class="cp-search-result-sep">›</span>
                        <span class="cp-search-result-label">${_escAttr(itemLbl)}</span>
                    </div>`;
                }).join('');
                itemsHTML = `<div class="cp-search-results-header">${_('Settings')}</div>${rows}`;
            }
            $root.find('.cp-search-results').html(itemsHTML);

            // Re-bind all cp-open clicks (grid + result items)
            $root.find('[data-cp-open]').off('click.cpui').on('click.cpui', function () {
                app.program.controlpanel.open($(this).data('cp-open'));
            });
            $root.find('[data-cp-search]').focus();
        });
    }

    // ── CSS ───────────────────────────────────────────────────────────────────


    // ─────────────────────────────────────────────────────────────────────────
    // app.program.controlpanel  — Runtime tab API
    // ─────────────────────────────────────────────────────────────────────────

    (function (app) {
        app.program = app.program || {};

        app.program.controlpanel = {

            /** Return all registered panels. */
            getAll() { return [..._registry]; },

            /** Search registered panels by label, name, or keywords. */
            search(query) {
                if (!query) return [..._registry];
                return _registry.filter(r => _matches(r, query));
            },

            /** Navigate to a panel. If the window is not open yet, the next render will pick it up. */
            open(panelId) {
                _activePanel = panelId;
                _render();
            },

            /** Return the currently active panel id, or null (launcher view). */
            active() { return _activePanel; },

            /** Reset to launcher view (called on window close and non-shortcut open). */
            reset() {
                _activePanel = null;
                _searchQuery = '';
            },

            /** Internal: re-render into #cp-root (used by program.js window.main). */
            _render
        };
    })(window.app = window.app || {});

    // ─────────────────────────────────────────────────────────────────────────
    // app.controlpanel  — Backward-compat + boot registration API
    // ─────────────────────────────────────────────────────────────────────────

    (function (app) {

        app.controlpanel = {

            /**
             * Boot-only: register a program in the controlpanel launcher.
             * Cleaned up by load.js after all programs have loaded.
             *
             * @param {object} descriptor
             * @param {object} descriptor.front  — launcher tile: { name, icon, type, label, keywords? }
             * @param {object} descriptor.tab    — tab definition: { id, name, render(os) }
             */
            add(descriptor) {
                const panel = descriptor?.panel ?? descriptor?.tab;
                if (!panel?.id) return;
                if (_registry.find(r => r.panel.id === panel.id)) return;
                _registry.push({ front: descriptor.front, panel });
                _registry.sort((a, b) => (a.front.order ?? 50) - (b.front.order ?? 50));
                if (panel.searchItems?.length && app.searchengine) {
                    app.searchengine._register('controlpanel',
                        panel.searchItems.map(item => ({ ...item, _panelId: panel.id }))
                    );
                }
            },

            /**
             * Legacy boot API — kept as no-op so language.js is not broken
             * until it is migrated. Cleaned up by load.js after boot.
             */
            addMenuItem() {},

            /**
             * Search control-panel settings items registered via app.ui.body(tree,'controlpanel').
             * Delegates to app.searchengine with programid:'controlpanel'.
             * @param {string} word
             * @returns {Array} matched items with { _programid, id, label, description, keywords }
             */
            searchengine: {
                search(word) {
                    return app.searchengine?.search({ word, programid: 'controlpanel' }) || [];
                }
            }
        };

    })(window.app = window.app || {});

    // Load window management (app.controlpanel.window) as a sub-module so that
    // it can be maintained independently in program.js.
    const base = os.config.local.ComponentsRoot + 'controlpanel/';
    const pm = await os.includeModule(base + 'program.js');
    if (pm?.setup) pm.setup(os);
}

export function start() {
    if (!$('#cp-root').length) {
        window.app.controlpanel.window.main();
    }
}

