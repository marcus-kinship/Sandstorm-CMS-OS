/**
 * @file taskbar/config.js
 * @description Taskbar configuration bootstrap for Sandstorm OS.
 *
 * Creates `app.desktop.taskbar` with its initial `config` object.
 * This file must load before all other taskbar modules so they can
 * read and extend the shared configuration store.
 *
 * @module components/taskbar/config
 */
(function (app) {

    app.desktop = app.desktop || {};

    /**
     * Taskbar namespace.  All taskbar sub-modules (index, menu, overflow, sort)
     * extend this object with their own methods.
     *
     * @namespace app.desktop.taskbar
     */
    app.desktop.taskbar = {

        /**
         * Shared runtime configuration shared by all taskbar sub-modules.
         *
         * @type {Object}
         * @property {Array}   taskIcons            - Registered taskbar icon descriptors.
         * @property {Array}   statusIcons          - Registered status-area icon descriptors.
         * @property {string}  tasksOverFlowmenuId  - DOM ID of the overflow dropdown menu.
         * @property {string}  position             - Current taskbar CSS class (e.g. `"taskbar-bottom"`).
         * @property {boolean} positionLock         - Prevent user from dragging the taskbar to a new edge.
         * @property {number|null} clockInterval    - ID of the `setInterval` driving the clock display.
         * @property {string}  clockDisplayMode     - User-chosen clock display for horizontal
         *                                             (desktop/tablet) taskbars: `"digital"` (00:00:00),
         *                                             `"digital-short"` (00:00), `"analog"`, or `"hidden"`.
         * @property {string}  clockTimeFormat      - `"24"` for 24-hour time, `"12"` for 12-hour with AM/PM.
         * @property {boolean} clockOverflowActive  - True when a digital clock mode has been auto-swapped
         *                                             for the analog icon because `.tasks` overflowed.
         * @property {boolean} isUnbuilt            - True before `taskbar.build()` has been called.
         * @property {number}  animate              - Duration (ms) of taskbar open/close animation; 0 = disabled.
         */
        config: {
            taskIcons: [],
            statusIcons: [],
            tasksOverFlowmenuId: "tasksoverflow-menu",
            position: 'taskbar-bottom',
            positionLock: true,
            clockInterval: null,
            clockDisplayMode: 'digital',
            clockTimeFormat: '24',
            clockOverflowActive: false,
            isUnbuilt: false,
            animate: 0,
        }
    };

})((window.app = window.app || {}));
