/**
 * @file startmenu/tabs.js
 * @description Start-menu tab factories: Apps, Email, Calendar, Widgets
 * (Messages), Settings, Account, Updates — plus the generic `addTab`/
 * `extendsTabs` registration helpers.
 *
 * Exported functions are plain (non-arrow) so `this` resolves to
 * `app.desktop.startmenu` when called as its methods (see startmenu/index.js
 * for the assembly) — several of them call `this.addTab(...)`.
 * Split out of the original monolithic startmenu.js — moved verbatim, no
 * logic changes.
 *
 * @module components/startmenu/tabs
 */
import { getHiddenWindowIds } from './state.js';

/**
 * Creates and registers an "Apps" tab showing all programs with `startmenu: true`.
 * Each icon opens the program and adds it to the running-apps panel.
 * Includes a page-dot indicator for vertical scrolling and a right-click context menu
 * with dock/undock and close-all options.
 *
 * @function createAppsTab
 * @memberof app.desktop.startmenu
 */
export function createAppsTab() {
    if (app.exists("app.program")) {
        const appsTab = {
            title: () => _("Apps"),
            icontype: "svg",
            icon: "#ic-apps",
            tab: function () {

                let appsHTML = ""; // This will store HTML for the apps
                let index = 0; // Start with index 0
                const allProgramInfo = app.program.getAll();

                // Ensure that the program info is defined before attempting to access it
                if (!allProgramInfo) {
                    console.error("Error: Program info is not defined.");
                    return;
                }

                // Loop through each program in the info array and build the app icons
                for (const [id, program] of Object.entries(allProgramInfo)) {
                    if (program.startmenu === true) {
                        appsHTML += `
            <div class="appsborder"><div class="appicos" data-num="${index}" data-id="${id}">
                ${program.icontype === "svg"
                                ? `<svg title="${program.name}"><use href="${program.icon}"></use></svg>`
                                : `<img src="${program.icon}" title="${program.name}" />`}
            </div>
            <div class="name">${app.util.escapeHtml(app.util.truncate(program.name))}</div></div>`;
                    }
                    index++;
                }

                const hideAllActive = getHiddenWindowIds().length > 0;
                return `
            <div class="h2 color pd">${_("Apps")}<span class="appslist-pages"></span></div>
            <div class="appslist">
                ${appsHTML}
            </div>
             <div class="h2 color pd run apps-running-row">
                <span>${_("Apps running")}</span>
                <button type="button" class="apps-hide-all-btn${hideAllActive ? ' active' : ''}" title="${_(hideAllActive ? 'Show all windows' : 'Hide all windows')}">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 14H5v-4h14v4z"/></svg>
                </button>
             </div>
             <div class="appslist run appsrunning"></div>
        `;
            },
            callback: function () {

                // "Hide all windows" / "Show all windows" toggle button, next to
                // the "Apps running" header.
                document.querySelector(".apps-hide-all-btn")?.addEventListener("click", (e) => {
                    e.stopPropagation();
                    app.desktop.startmenu.toggleHideAllWindows();
                });

                document.querySelectorAll(".appsborder").forEach((element) => {
                    const id = element.querySelector(".appicos")?.getAttribute("data-id");

                    element.addEventListener("click", (event) => {

                        // Launch the program (lazy-loads its module on first open)
                        app.program.open(id);

                    });

                    // Configure the context menu options
                    const contextMenu = {
                        callback: () => {
                            // Initialize an empty array to hold menu items
                            let items = [];

                            // Retrieve and add the "Dock to/From Taskbar" option to the menu
                            const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(id);
                            // Only add the option if valid data is returned
                            if (Object.keys(dockToOrFromTaskbar).length !== 0) {
                                items.push(dockToOrFromTaskbar);
                            }

                            // Retrieve and add the "Start Program" option to the menu
                            const startProgramData = app.desktop.taskbar.menu.getStartProgramToTaskbarData(id);
                            // Only add the option if valid data is returned
                            if (Object.keys(startProgramData).length !== 0) {
                                items.push(startProgramData);
                            }

                            // Retrieve and add the "Close All Windows" option to the menu
                            const closeAllWindowsData = app.desktop.taskbar.menu.getCloseAllWindowsData(id);
                            // Only add the option if valid data is returned
                            if (Object.keys(closeAllWindowsData).length !== 0) {
                                items.push(closeAllWindowsData);
                            }

                            items.push({
                                title: () => _('Copy path'),
                                callback() {
                                    app.util.copyToClipboard('/programs/' + id, { successBody: '/programs/' + id });
                                }
                            });

                            // Return the populated items array to be used in the context menu
                            return items;
                        },
                        zIndex: 10000, // High zIndex to ensure the menu appears above other elements
                        classes: "",   // Optional CSS classes for additional styling
                        seltaget: true // Set to true if specific target handling is required
                    };

                    // Configure the context menu for the specified element
                    app.desktop.startmenu.contextMenu(element, contextMenu);

                });

                // Page dot indicator — ○ current, ● clickable pages
                const _renderPages = (list) => {
                    const badge = document.querySelector('.startmenu .appslist-pages');
                    if (!badge) return;
                    const total     = list.scrollHeight;
                    const view      = list.clientHeight;
                    const maxScroll = total - view;
                    if (maxScroll > 0 && view > 0) {
                        const pages   = Math.max(1, Math.round(total / view));
                        const ratio   = list.scrollTop / maxScroll;
                        const current = Math.min(pages, Math.round(ratio * (pages - 1)) + 1);
                        badge.innerHTML = '';
                        for (let i = 1; i <= pages; i++) {
                            const dot = document.createElement('span');
                            dot.className = 'appslist-dot' + (i === current ? ' cur' : '');
                            if (i !== current) {
                                dot.addEventListener('click', () => {
                                    const target = ((i - 1) / (pages - 1)) * maxScroll;
                                    list.scrollTo({ top: target, behavior: 'smooth' });
                                });
                            }
                            badge.appendChild(dot);
                        }
                    } else {
                        badge.innerHTML = '';
                    }
                };
                const _initList = document.querySelector('.startmenu .appslist:not(.run)');
                if (_initList) setTimeout(() => _renderPages(_initList), 16);

                // Capture wheel anywhere in document — closest() finds if inside .appslist
                document.addEventListener('wheel', (e) => {
                    const list = e.target.closest?.('.startmenu .appslist:not(.run)');
                    if (list) setTimeout(() => _renderPages(list), 16);
                }, { passive: true, capture: true });

                // Fallback: direct scroll (scrollbar drag, keyboard, scrollTo)
                if (_initList) {
                    _initList.addEventListener('scroll', () => _renderPages(_initList), { passive: true });
                }

                let _pagesResizeTimer = null;
                $(window).off('resize.startmenuAppsPages').on('resize.startmenuAppsPages', () => {
                    clearTimeout(_pagesResizeTimer);
                    _pagesResizeTimer = setTimeout(() => {
                        const list = document.querySelector('.startmenu .appslist:not(.run)');
                        if (list) _renderPages(list);
                    }, 100);
                });

            }
        };

        this.addTab(appsTab); // Lägg till e-postfliken
    }
}

/**
 * Creates and registers an email tab by delegating to `app.mail.startMenuEmailTab()`.
 * Only added if the mail module exposes that method.
 *
 * @function createEmailTab
 * @memberof app.desktop.startmenu
 */
export function createEmailTab() {
    if (!app.exists("app.mail.startMenuEmailTab()")) {
        const emailTab = app.mail.startMenuEmailTab();
        this.addTab(emailTab);
    }
}

/**
 * Creates and adds a new calendar tab to the user interface.
 *
 * @function createCalendarTab
 * @param {Object} [calendar={}] - Configuration object for the calendar, allowing customization of default settings.
 * @param {boolean} [calendar.showWeekNumber=true] - Specifies whether to display the week number in the calendar.
 * @param {string} [calendar.startDay='monday'] - The starting day of the week ('monday' or 'sunday').
 * @param {string} [calendar.dateFormat='w d m'] - The format for displaying dates (e.g., 'full' for "Tuesday 22 October").
 * @param {string[]} [calendar.months] - List of month names, with January at index 0.
 * @param {Object} [calendar.weekDays] - Object containing full and abbreviated names for weekdays.
 * @param {string[]} [calendar.weekDays.full] - Full names of weekdays, with Monday at index 0.
 * @param {string[]} [calendar.weekDays.short] - Abbreviated names of weekdays, with Monday at index 0.
 *
 * @description
 * Initializes and adds a calendar tab with default settings to the interface. If a calendar configuration object
 * is provided as a parameter, it will be merged with the default settings. The calendar tab includes a header
 * and navigation controls and allows additional configuration for date format, starting day, and display options.
 */
export function createCalendarTab(calendar = {}, dailySchedule = {}) {
    if (app.exists("app.ui.calendar.init")) {
        // Default configuration for the calendar
        let defaultConfig = {
            todayId: "#sm-bt-today",
            prevId: "#sm-bt-prev",
            nextId: "#sm-bt-next",
            selectDateId: "#sm-bt-selectDate",
            calendarmapId: "#sm-bt-calendar-map",
        };

        // Merge defaultConfig with calendar settings
        let options = Object.assign({}, defaultConfig, calendar);

        const calendarTab = {
            title: () => _("Calendar"),
            icontype: "svg",
            icon: "#ic-date",
            tab: function () {
                return `
        <div class="calendar">
            <div class="h2 color pd" id="sm-bt-today">
            </div>
            <div class="header pd" style="padding-top: 0px;">
                <div class="h2 color" id="sm-bt-selectDate">
                </div>
                <div id="bt-select-weeks">
                    <div id="sm-bt-prev">
                        <svg><use href="#ic-arrow-up" /></svg>
                    </div>
                    <div id="sm-bt-next">
                        <svg><use href="#ic-arrow-down" /></svg>
                    </div>
                </div>
            </div>
            <div class="body pd" style="padding-top: 0px;">
                <div id="sm-bt-calendar-map">
                </div>
            </div>
        </div>`;
            },
            callback: function () {

                const calendarInstance = app.ui.calendar.init(options);

                if (dailySchedule) {
                    calendarInstance.update((dates) => {
                        if (dailySchedule.updateMonth) {
                            dailySchedule.updateMonth();
                        }

                        if (dailySchedule.dailySchedule) {
                            //  kör callback om den finns

                            let str = dailySchedule.dailySchedule.callback;
                            let fullPath = "app." + str;

                            // Kontrollera att funktionen existerar
                            if (app.exists(fullPath)) {
                                // Dela upp vägen för att nå funktionen dynamiskt
                                let parts = str.split(".");
                                let fn = app;

                                for (let p of parts) {
                                    if (fn[p] !== undefined) {
                                        fn = fn[p];
                                    } else {
                                        fn = null;
                                        break;
                                    }
                                }

                                // Om fn är en funktion, anropa den
                                if (typeof fn === "function") {
                                    fn(calendarInstance);
                                }
                            }

                            //  och uppdatera schemat
                            calendarInstance.dailySchedule(dailySchedule.dailySchedule);
                        }
                    });
                }

                calendarInstance.start();

            }
        };

        // Add the calendar tab
        this.addTab(calendarTab);
    }
}

/**
 * Adds an event to the given calendar instance.
 *
 * @function calendarAddEvent
 * @memberof app.desktop.startmenu
 * @param {Object} calendar - A calendar instance returned by `app.ui.calendar.init()`.
 */
export function calendarAddEvent(calendar) {

    calendar.addEvent();
}

/**
 * Creates and registers a "Widget" tab containing the status icons, analog clock,
 * digital time and a placeholder notifications list.
 *
 * @function createStatusTab
 * @memberof app.desktop.startmenu
 */
export function createStatusTab() {

    const statusIconsElement = app.desktop.taskbar.createStatusIcons("widgetstatusicons");

    const statusTab = {
        title: () => _("Messages"),
        icontype: "svg",
        icon: "#ic-info",
        tab: function () {
            return `<div class="sw-grid">
                <div class="widget-box sw-wide" id="status-box">
                    <div class="widget-title"><span>${_("Status")}</span></div>
                    <div class="content">${statusIconsElement ? statusIconsElement.outerHTML : ''}</div>
                </div>
                <div class="widget-box" id="clock-box">
                    <div class="widget-title"><span>${_("The clock")}</span></div>
                    <div class="content">
                        <p id="msanalogclock">00:00</p>
                        <p id="mstimedigital">00:00</p>
                    </div>
                </div>
                <div class="widget-box" id="notices-box">
                    <div class="widget-title"><span>${_("Notices")}</span></div>
                    <div class="content">
                        <div id="notifications"><ul><li>Notis 1</li><li>Notis 2</li><li>Notis 3</li></ul></div>
                    </div>
                </div>
            </div>`;
        },
        callback: function () {
            setTimeout(function () {
                let _smRect = null;
                $('.widget-box').draggable({
                    handle: '.widget-title',
                    helper: function () {
                        const $el = $(this);
                        return $el.clone()
                            .addClass('widget-drag-helper')
                            .css({ width: $el.outerWidth() });
                    },
                    appendTo: 'body',
                    zIndex: 99999,
                    cursor: 'grabbing',
                    start: function () {
                        const sm = document.querySelector('.startmenu');
                        _smRect = sm ? sm.getBoundingClientRect() : null;
                    },
                    stop: function (event, ui) {
                        const r = _smRect;
                        if (!r) return;
                        const x = ui.offset.left;
                        const y = ui.offset.top;
                        if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
                            const uid = Date.now();
                            const srcId = $(this).attr('id') || '';
                            const spans = { 'clock-box': [2, 3], 'status-box': [4, 1], 'notices-box': [2, 2] };
                            const [cw, ch] = spans[srcId] || [2, 2];

                            const $inner = $(this).clone().css({ width: '100%', 'box-shadow': 'none', background: 'transparent' });
                            const $analog = $inner.find('#msanalogclock');
                            const $digital = $inner.find('#mstimedigital');
                            if ($analog.length) $analog.attr('id', 'msanalogclock-dw-' + uid);
                            if ($digital.length) $digital.attr('id', 'mstimedigital-dw-' + uid);

                            const grid = app.desktop.icon.grid;
                            const container = document.querySelector('.desktop-icons') || document.body;
                            const wid = 'widget-' + uid;
                            const pw = cw * grid.cellW + (cw - 1) * grid.gap;
                            const ph = ch * grid.cellH + (ch - 1) * grid.gap;

                            // Determine target cell from drop coordinates
                            const cRect = container.getBoundingClientRect();
                            const relX  = ui.offset.left - cRect.left;
                            const relY  = ui.offset.top  - cRect.top;
                            const drop  = grid.fromPixel(relX, relY);

                            const $dw = $('<div class="dg-widget"></div>').css({
                                position: 'absolute', width: pw, height: ph
                            });
                            $('<button class="dg-close">✕</button>').on('click', function () {
                                grid.unregister(wid);
                                $dw.remove();
                            }).appendTo($dw);
                            $dw.append($inner);
                            $(container).append($dw);

                            // Try drop cell, push icons out, fall back to firstFree
                            const atDrop  = grid.getAt(drop.col, drop.row, cw, ch, wid);
                            const icons   = atDrop.filter(b => !!document.querySelector(`.desktop-icon[data-program="${b.id}"]`));
                            const wBlocks = atDrop.filter(b => !document.querySelector(`.desktop-icon[data-program="${b.id}"]`));
                            let gpos = (wBlocks.length === 0) ? drop : null;

                            if (gpos) {
                                grid.register(wid, gpos.col, gpos.row, cw, ch, $dw[0]);
                                const moves = []; let ok = true;
                                for (const ic of icons) {
                                    const f = grid.firstFree(ic.w, ic.h);
                                    if (!f) { ok = false; break; }
                                    moves.push({ ...ic, nc: f.col, nr: f.row });
                                    grid.register(ic.id, f.col, f.row, ic.w, ic.h);
                                }
                                if (ok) {
                                    for (const m of moves) grid.applyIcon(m.id, m.nc, m.nr, m.w, m.h, true);
                                } else {
                                    for (const m of moves) grid.register(m.id, m.col, m.row, m.w, m.h);
                                    gpos = null;
                                }
                            }
                            if (!gpos) {
                                gpos = grid.firstFree(cw, ch);
                                grid.register(wid, gpos.col, gpos.row, cw, ch, $dw[0]);
                            }
                            const { x: gx, y: gy } = grid.toPixel(gpos.col, gpos.row);
                            $dw.css({ left: gx + 'px', top: gy + 'px' });

                            let _curCol = gpos.col, _curRow = gpos.row;

                            $dw.draggable({
                                containment: container,
                                cursor: 'grabbing',
                                handle: '.widget-title',
                                start: function () {
                                    grid.showIndicator(_curCol, _curRow, cw, ch);
                                },
                                drag: function (e, ui) {
                                    const np = grid.fromPixel(ui.position.left, ui.position.top);
                                    grid.showIndicator(np.col, np.row, cw, ch);
                                },
                                stop: function (e, ui) {
                                    grid.hideIndicator();
                                    const np = grid.fromPixel(ui.position.left, ui.position.top);
                                    const newCol = np.col, newRow = np.row;

                                    const snapBack = () => {
                                        const { x: sx, y: sy } = grid.toPixel(_curCol, _curRow);
                                        $dw.css({ left: sx + 'px', top: sy + 'px' });
                                    };

                                    const blocked = grid.getAt(newCol, newRow, cw, ch, wid);
                                    const icons   = blocked.filter(b => !!document.querySelector(`.desktop-icon[data-program="${b.id}"]`));
                                    const others  = blocked.filter(b => !document.querySelector(`.desktop-icon[data-program="${b.id}"]`));

                                    if (others.length > 0) {
                                        snapBack(); return;
                                    }

                                    // Temporarily place widget so firstFree skips its area
                                    grid.register(wid, newCol, newRow, cw, ch, $dw[0]);

                                    const moves = [];
                                    let possible = true;
                                    for (const icon of icons) {
                                        const free = grid.firstFree(icon.w, icon.h);
                                        if (!free) { possible = false; break; }
                                        moves.push({ id: icon.id, oldCol: icon.col, oldRow: icon.row, newCol: free.col, newRow: free.row, w: icon.w, h: icon.h });
                                        grid.register(icon.id, free.col, free.row, icon.w, icon.h);
                                    }

                                    if (possible) {
                                        for (const m of moves) grid.applyIcon(m.id, m.newCol, m.newRow, m.w, m.h, true);
                                        _curCol = newCol; _curRow = newRow;
                                        const { x: sx, y: sy } = grid.toPixel(newCol, newRow);
                                        $dw.css({ left: sx + 'px', top: sy + 'px' });
                                    } else {
                                        for (const m of moves) grid.register(m.id, m.oldCol, m.oldRow, m.w, m.h);
                                        grid.register(wid, _curCol, _curRow, cw, ch, $dw[0]);
                                        snapBack();
                                    }
                                }
                            });

                            if ($analog.length) app.desktop.taskbar.analogClock('msanalogclock-dw-' + uid, 130, 130);
                            if ($digital.length) app.desktop.taskbar.clock('mstimedigital-dw-' + uid);
                        }
                    }
                });
            }, 0);
        }
    };

    this.addTab(statusTab); // Lägg till statusfliken
}

/**
 * Creates and registers a "Settings" tab that lists all control panel panels
 * as a sidebar nav and renders their content on demand.
 *
 * @function createSettingsTab
 * @memberof app.desktop.startmenu
 */
export function createSettingsTab() {

    const settingTab = {
        title: () => _("Settings"),
        icontype: "svg",
        icon: "#ic-settings",
        tab: function () {
            const panels = app.program?.controlpanel?.getAll?.() || [];
            const items = panels.map(({ panel, front }) => {
                const name = typeof panel.name === 'function' ? panel.name() : (panel.name || '');
                const icon = front.icon
                    ? `<svg width="18" height="18"><use href="${front.icon}"/></svg>`
                    : '';
                return `<div class="sm-settings-item" data-sm-panel="${panel.id}">${icon}<span>${name}</span></div>`;
            }).join('');
            return `<div class="sm-settings-list">${items}</div>`;
        },
        callback: function () {
            $(document).off('click.sm-settings').on('click.sm-settings', '.sm-settings-item', function () {
                const panelId = $(this).data('sm-panel');
                app.program.controlpanel.open(panelId);
                app.controlpanel.window.main();
            });
        }
    };

    this.addTab(settingTab);
}
/**
 * Creates and registers an "Account" tab.
 * Delegates rendering and callbacks to `app.users.startMenuUsersTab()` when available,
 * otherwise renders a disabled placeholder.
 *
 * @function createUsersTab
 * @memberof app.desktop.startmenu
 */
export function createUsersTab() {
    const usersTab = {
        title: () => _("Account"),
        icontype: "svg",
        icon: "#ic-cp-user",
        tab: function () {
            if (window.app?.users?.startMenuUsersTab) {
                return app.users.startMenuUsersTab().tab();
            }
            return `<div style="padding:18px 32px;color:var(--theme-fontcolor,#fff);font-size:12px;opacity:0.5;">${_('Account')}</div>`;
        },
        callback: function () {
            if (window.app?.users?.startMenuUsersTab) {
                app.users.startMenuUsersTab().callback?.();
            }
        }
    };
    this.addTab(usersTab);
}

/**
 * Creates and registers an "Updates" tab.
 * Delegates rendering and callbacks to `app.updates.startMenuUpdateTab()` when available,
 * otherwise renders a disabled placeholder.
 *
 * @function createUpdateTab
 * @memberof app.desktop.startmenu
 */
export function createUpdateTab() {
    const updateTab = {
        title: () => _("Updates"),
        icontype: "svg",
        icon: "#ic-updates",
        tab: function () {
            if (window.app?.updates?.startMenuUpdateTab) {
                return app.updates.startMenuUpdateTab().tab();
            }
            return `<div style="padding:18px 32px;color:var(--theme-fontcolor,#fff);font-size:12px;opacity:0.5;">${_('Updates')}</div>`;
        },
        callback: function () {
            if (window.app?.updates?.startMenuUpdateTab) {
                app.updates.startMenuUpdateTab().callback?.();
            }
        }
    };

    this.addTab(updateTab); // Lägg till e-postfliken
}


/**
 * Adds a tab definition to the internal tab list.
 * The tab object must have `title`, `icontype`, `icon`, `tab()` and optionally `callback()`.
 *
 * @function addTab
 * @memberof app.desktop.startmenu
 * @param {Object|null} tabConfig - Tab configuration object.
 * @param {string} tabConfig.title - Display name shown in the icon tooltip.
 * @param {string} tabConfig.icontype - Icon type: `"svg"` or `"img"`.
 * @param {string} tabConfig.icon - SVG href (e.g. `"#ic-apps"`) or image path.
 * @param {Function} tabConfig.tab - Returns the HTML string for the tab body.
 * @param {Function} [tabConfig.callback] - Called after the tab HTML is inserted.
 */
export function addTab(tabConfig = null) {

    if (tabConfig != null &&
        tabConfig.title != undefined &&
        tabConfig.icontype != undefined &&
        tabConfig.icon != undefined
    ) {
        this.options.tabConfig.tabs.push(tabConfig);
    }

}

/**
 * Appends the standard system tabs (divider, Widget, Account, Settings, Updates)
 * to the tab list.  Called automatically by `build()` before initialising the tab UI.
 *
 * @function extendsTabs
 * @memberof app.desktop.startmenu
 */
export function extendsTabs() {

    this.options.tabConfig.tabs.push({ 'divider': '<div class="line"></div>' });
    this.createStatusTab();
    this.createUsersTab();
    this.createSettingsTab();
    this.createUpdateTab();

}
