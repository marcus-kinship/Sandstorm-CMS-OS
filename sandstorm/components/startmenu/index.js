/**
 * @file startmenu/index.js
 * @description Assembler for the start-menu split. Reassembles the exact
 * same `app.desktop.startmenu` shape the original monolithic startmenu.js
 * built — preloads the CSS, then merges the tab factories (tabs.js), the
 * running-apps panel (running_apps.js), the taskbar-dock helper
 * (taskbar_dock.js), the logoff/help button wiring (buttons.js), and the
 * menu shell lifecycle (core.js) onto one object.
 *
 * Extends `app.desktop.startmenu` with the full start menu UI: tabs, running-apps panel,
 * logoff/help buttons, keyboard shortcut toggle, and an extensible tab system.
 *
 * @module components/startmenu/index
 *
 * @example
 * // Startup sequence snippet:
 * app.desktop.startmenu.logoffButton({ menuItem: [...] });
 * app.desktop.startmenu.createAppsTab();
 * app.desktop.startmenu.init({ id: "ms-startmenu", position: "bottom" });
 * app.desktop.startmenu.startbutton({ id: "bts-start", content: "<svg>...</svg>", shortcut: "s+m" });
 * document.querySelector("#taskbar .left").appendChild(app.desktop.startmenu.build());
 */
import { logoffButton, helpButton } from './buttons.js';
import {
    createAppsTab, createEmailTab, createCalendarTab, calendarAddEvent,
    createStatusTab, createSettingsTab, createUsersTab, createUpdateTab,
    addTab, extendsTabs,
} from './tabs.js';
import {
    removeFromRunningApps, addToRunningApps, showRunningApp, updateRunningApps,
    hideRunningApps, showLastRunningApp, countRunningApps, toggleHideAllWindows,
} from './running_apps.js';
import { dockToTaskbar } from './taskbar_dock.js';
import {
    options, contextMenu, setUserInitials, init, startbutton,
    toggleMenu, calculateMenuHeight, build, hide,
} from './core.js';
import { wireSearch, renderSearchResults } from './search.js';

(function (app) {
    // Ensure the app namespace exists and define a start menu module
    app.desktop = app.desktop || {};

    // Preload CSS at module-load time so it is ready before init() is called
    if (typeof app.addCSS === "function") {
        app.addCSS('Startmenu', 'sandstorm/components/startmenu.css', true);
    }

    app.desktop.startmenu = {
        options,
        logoffButton,
        helpButton,
        createAppsTab,
        createEmailTab,
        createCalendarTab,
        calendarAddEvent,
        createStatusTab,
        createSettingsTab,
        createUsersTab,
        createUpdateTab,
        addTab,
        init,
        removeFromRunningApps,
        addToRunningApps,
        showRunningApp,
        updateRunningApps,
        hideRunningApps,
        showLastRunningApp,
        countRunningApps,
        toggleHideAllWindows,
        setUserInitials,
        contextMenu,
        dockToTaskbar,
        startbutton,
        extendsTabs,
        toggleMenu,
        calculateMenuHeight,
        build,
        hide,
        wireSearch,
        renderSearchResults,
    };
})((window.app = window.app || {}));
