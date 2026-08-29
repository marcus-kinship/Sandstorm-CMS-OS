/**
 * @file taskbar/notify.js
 * @description Taskbar notification API — shows colour-coded status dots on
 * task icons.
 *
 * Registers `app.desktop.taskbar.notify` — same IIFE-extends-app.desktop.taskbar
 * convention as the other taskbar/*.js sibling modules (menu.js, overflow.js,
 * sort.js). Loaded via `taskbar/index.js`'s side-effect imports, which run
 * before `index.js`'s own `Object.assign`/`app.lock()` calls — so this file
 * must not itself run before `taskbar/config.js` has created
 * `app.desktop.taskbar` (guaranteed by `load.js`'s systemfiles order: config
 * → overflow → menu → sort → index, and index.js imports this file first
 * thing).
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/notify
 */
(function (app) {

    /** @type {Object<string,{showTimer:number,hideTimer:number,cleanupTimer:number}>} */
    const _transitions = {};

    /**
     * Cancels any pending notification timers for a program and ensures the
     * transitions entry exists for the next operation.
     * @param {string} programid
     */
    function _clearTransitions(programid) {
        if (_transitions[programid]) {
            clearTimeout(_transitions[programid].showTimer);
            clearTimeout(_transitions[programid].hideTimer);
            clearTimeout(_transitions[programid].cleanupTimer);
        }
        if (!_transitions[programid]) {
            _transitions[programid] = {};
        }
    }

    /**
     * Applies a notification state (success / fail / abort) to a taskbar icon.
     * Shows the coloured indicator dot, then auto-hides after `args.time` ms.
     * @param {Object}  args
     * @param {string}  args.programid   - Target program ID.
     * @param {string}  [args.class]     - CSS class override (defaults to `defaultClass`).
     * @param {number}  [args.time=1000] - How long (ms) to show before auto-clearing. 0 = permanent.
     * @param {string}  defaultClass     - "success" | "fail" | "abort"
     */
    function _applyNotification(args, defaultClass) {
        args = args || {};
        args.programid = args.programid || "";
        args.class = args.class || defaultClass;
        args.time = (args.time !== undefined) ? args.time : 1000;

        _clearTransitions(args.programid);

        const taskElement = $("#pid-" + args.programid + "-task");
        taskElement.removeClass("success fail abort");
        taskElement.find(".notification-indicator").remove();
        taskElement.find(".after").css("opacity", "1");

        _transitions[args.programid].showTimer = setTimeout(() => {
            taskElement.addClass(args.class);
            taskElement.append('<div class="notification-indicator"></div>');
            taskElement.find(".after").css("opacity", "0");

            if (args.time > 0) {
                _transitions[args.programid].hideTimer = setTimeout(() => {
                    taskElement.find(".after").css("opacity", "1");
                    taskElement.find(".notification-indicator").css("opacity", "0");

                    _transitions[args.programid].cleanupTimer = setTimeout(() => {
                        taskElement.removeClass(args.class);
                        taskElement.find(".notification-indicator").remove();
                        delete _transitions[args.programid];
                        app.desktop.taskbar.setProgramStatus(args.programid, taskElement[0]);
                    }, 400);
                }, args.time);
            }
        }, 10);
    }

    Object.assign(app.desktop.taskbar, {

        /**
         * Taskbar notification API — shows colour-coded status dots on task icons.
         * @namespace app.desktop.taskbar.notify
         */
        notify: {
            /**
             * Shows a green success indicator on the icon.
             * @param {{programid:string, time?:number}} args
             */
            success: function (args) {
                _applyNotification(args, "success");
            },

            /**
             * Shows a red failure indicator on the icon.
             * @param {{programid:string, time?:number}} args
             */
            fail: function (args) {
                _applyNotification(args, "fail");
            },

            /**
             * Shows a yellow abort indicator on the icon.
             * @param {{programid:string, time?:number}} args
             */
            abort: function (args) {
                _applyNotification(args, "abort");
            },

            /**
             * Immediately clears any active notification state from a task icon.
             * @param {string} programid
             */
            clear: function (programid) {
                _clearTransitions(programid);

                const taskElement = $("#pid-" + programid + "-task");
                taskElement.find(".after").css("opacity", "1");
                taskElement.find(".notification-indicator").css("opacity", "0");

                _transitions[programid].cleanupTimer = setTimeout(() => {
                    taskElement.removeClass("success fail abort");
                    taskElement.find(".notification-indicator").remove();
                    delete _transitions[programid];
                }, 400);
            },

            /**
             * Passes the task icon element to a callback for custom manipulation.
             * @param {string}        programid
             * @param {Function|null} [callback] - Receives the jQuery icon element.
             */
            process: function (programid, callback = null) {
                let taskbarElement = $("#pid-" + programid + "-task");

                if (typeof callback === "function") {
                    callback(taskbarElement);
                }
            }
        },

    });

})((window.app = window.app || {}));
