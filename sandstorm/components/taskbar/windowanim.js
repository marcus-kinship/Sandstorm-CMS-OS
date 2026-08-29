/**
 * @file taskbar/windowanim.js
 * @description Window minimize/restore animations (slide-and-scale into/out
 * of the taskbar icon, edge-aware) and the two window-repositioning helpers
 * that keep normal/maximized windows clear of the taskbar when it changes
 * position.
 *
 * Registers `app.desktop.taskbar.functions.{animateWindowVisibility,
 * animateWindowToTaskbar, animateTaskbarToWindow}`,
 * `adjustWindowsPosition`, `adjustFullWindowsPosition` — same IIFE-extends
 * convention as the other taskbar/*.js sibling modules. Loaded via
 * `taskbar/index.js`'s side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/windowanim
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Window animation helpers used by taskbar icon click handlers.
         * @namespace app.desktop.taskbar.functions
         */
        functions: {
            /**
             * Toggles a window between visible and minimised-to-taskbar state.
             * @param {number} numWindows - 1-based window instance index.
             * @param {string} id         - Program ID.
             */
            animateWindowVisibility: function (numWindows, id) {
                let windowId = $(`#${id}-${numWindows}-win`).attr("id");
                windowId = windowId.replace("-win", "");

                let windowElement = $(`#${id}-${numWindows}-win`);
                let taskid = `${id}-${numWindows}`;

                if (!windowElement.hasClass("single")) {
                    taskid = `${id}`;
                }

                if (windowElement.css("display") !== "none") {
                    app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, taskid);
                    $(`#pid-${taskid}-task`).addClass("hidstate");
                } else {
                    app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, taskid);
                    $(`#pid-${taskid}-task`).addClass("runstate");
                }
            },

            /**
             * Animates a window shrinking into its taskbar icon (minimise).
             * @param {string} windowId - Window element ID (without `-win` suffix).
             * @param {string} taskid   - Task icon ID (without `pid-…-task` wrapper).
             * @param {Object} [options]
             * @param {boolean} [options.instant=false] - Skip the visible
             *   slide/scale tween and jump straight to the fully-minimized
             *   end state (`display:none`, positioned at the taskbar icon).
             *   All the same position/state bookkeeping (`originalPosition`,
             *   `minimizedPosition`, `taskbarPosition`, `mode`) is still
             *   computed and stored exactly as in the animated path, so
             *   `animateTaskbarToWindow` (restore) behaves identically
             *   either way. Used when a window is launched already minimized
             *   (e.g. a shortcut's `startMode`) — nothing was ever shown, so
             *   there's nothing to animate away.
             */
            animateWindowToTaskbar: function (windowId, taskid, options = {}) {
                var instant = options.instant === true;
                var $window = $(`#${windowId}-win`);
                var $taskbarIcon = $(`#pid-${taskid}-task`);
                var $taskbar = $(".taskbar-s");

                if (!instant) $taskbarIcon.addClass("taskbar-icon-bounce");

                if (!$window.length || !$taskbarIcon.length) {
                    app.dev.error("Window or taskbar icon not found.");
                    return;
                }

                var windowPos = $window.offset();
                var iconPos = $taskbarIcon.offset();

                var originalPosition = {
                    top: $window.css("top") !== "auto" ? $window.css("top") : "0px",
                    left: $window.css("left") !== "auto" ? $window.css("left") : "0px",
                    width: $window.css("width"),
                    height: $window.css("height")
                };

                if ($window.hasClass("maximized")) {
                    $window.data("mode", "maximized");
                } else {
                    $window.data("mode", "normal");
                }

                $window.removeClass("maximized").addClass("minimized");

                if (app.exists("app.program.updateWindowStatus")) {
                    if (!$window.hasClass("single")) {
                        var id = windowId.replace(/-\d+$/, "");
                        app.program.updateWindowStatus(id, windowId, "minimized");
                    }
                }

                $window.data("originalPosition", originalPosition);

                var windowWidth = $window.outerWidth(true);
                var windowHeight = $window.outerHeight(true);
                var iconWidth = $taskbarIcon.outerWidth(true);
                var iconHeight = $taskbarIcon.outerHeight(true);

                var taskbarPosition = "bottom";
                if ($taskbar.hasClass("taskbar-top")) {
                    taskbarPosition = "top";
                } else if ($taskbar.hasClass("taskbar-left")) {
                    taskbarPosition = "left";
                } else if ($taskbar.hasClass("taskbar-right")) {
                    taskbarPosition = "right";
                }

                $window.data("taskbarPosition", taskbarPosition);

                var newLeft, newTop;

                switch (taskbarPosition) {
                    case "bottom":
                        newLeft = iconPos.left + iconWidth / 2 - windowWidth / 2;
                        newTop = iconPos.top - windowHeight;
                        break;
                    case "top":
                        newLeft = iconPos.left + iconWidth / 2 - windowWidth / 2;
                        newTop = iconPos.top + iconHeight;
                        break;
                    case "left":
                        newLeft = iconPos.left + iconWidth;
                        newTop = iconPos.top + iconHeight / 2 - windowHeight / 2;
                        break;
                    case "right":
                        newLeft = iconPos.left - windowWidth;
                        newTop = iconPos.top + iconHeight / 2 - windowHeight / 2;
                        break;
                }

                $window.data("minimizedPosition", {
                    left: newLeft,
                    top: newTop,
                    iconPos: iconPos,
                    iconWidth: iconWidth,
                    iconHeight: iconHeight,
                    windowWidth: windowWidth,
                    windowHeight: windowHeight
                });

                var windowCenterX = windowPos.left + windowWidth / 2;
                var windowCenterY = windowPos.top + windowHeight / 2;
                var targetX = newLeft + windowWidth / 2;
                var targetY = newTop + windowHeight / 2;

                var distance = Math.sqrt(
                    Math.pow(windowCenterX - targetX, 2) +
                    Math.pow(windowCenterY - targetY, 2)
                );

                var baseDuration = 300;
                var distanceFactor = 0.5;
                var maxDuration = 800;

                var animationDuration = Math.min(baseDuration + (distance * distanceFactor), maxDuration);

                $window.data("animationDuration", animationDuration);

                var scaleOrigin;
                switch (taskbarPosition) {
                    case "bottom":
                        scaleOrigin = "bottom center";
                        break;
                    case "top":
                        scaleOrigin = "top center";
                        break;
                    case "left":
                        scaleOrigin = "center left";
                        break;
                    case "right":
                        scaleOrigin = "center right";
                        break;
                }

                if (instant) {
                    $window.css({
                        top: newTop + "px",
                        left: newLeft + "px",
                        opacity: "0",
                        transform: "scale(0.1)",
                        display: "none",
                        transition: "",
                        transformOrigin: ""
                    });
                    return;
                }

                $window.css({
                    top: newTop + "px",
                    left: newLeft + "px",
                    opacity: "0",
                    transform: "scale(0.1)",
                    transformOrigin: scaleOrigin,
                    transition: `all ${animationDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1.0)`
                });

                setTimeout(() => {
                    $taskbarIcon.removeClass("taskbar-icon-bounce");
                }, 1000);

                setTimeout(function () {
                    $window.css({
                        display: "none",
                        transition: "",
                        transformOrigin: ""
                    });
                }, animationDuration);
            },

            /**
             * Animates a window expanding out from its taskbar icon (restore).
             * @param {string} windowId - Window element ID (without `-win` suffix).
             * @param {string} taskid   - Task icon ID (without `pid-…-task` wrapper).
             */
            animateTaskbarToWindow: function (windowId, taskid) {
                var $window = $(`#${windowId}-win`);
                var $taskbarIcon = $(`#pid-${taskid}-task`);

                $taskbarIcon.addClass("taskbar-icon-bounce");

                app.setActiveWindow(windowId);

                $window.removeClass("minimized");
                let mode = $window.data("mode");

                if (app.exists("app.program.updateWindowStatus")) {
                    if (!$window.hasClass("single")) {
                        var id = windowId.replace(/-\d+$/, "");
                        app.program.updateWindowStatus(id, windowId, mode);
                        if (app.exists("app.desktop.startmenu.showRunningApp")) {
                            app.desktop.startmenu.showRunningApp(id);
                        }
                    }
                }

                $window.addClass(mode);

                var originalPosition = $window.data("originalPosition");
                var minimizedPosition = $window.data("minimizedPosition");
                var taskbarPosition = $window.data("taskbarPosition") || "bottom";
                var animationDuration = $window.data("animationDuration") || 400;

                var scaleOrigin;
                switch (taskbarPosition) {
                    case "bottom":
                        scaleOrigin = "bottom center";
                        break;
                    case "top":
                        scaleOrigin = "top center";
                        break;
                    case "left":
                        scaleOrigin = "center left";
                        break;
                    case "right":
                        scaleOrigin = "center right";
                        break;
                    default:
                        scaleOrigin = "bottom center";
                }

                if (minimizedPosition) {
                    $window.css({
                        display: "block",
                        top: minimizedPosition.top + "px",
                        left: minimizedPosition.left + "px",
                        opacity: "0",
                        transform: "scale(0.1)",
                        transformOrigin: scaleOrigin,
                        transition: ""
                    });
                } else {
                    $window.css({
                        display: "block",
                        opacity: "0",
                        transform: "scale(0.1)"
                    });
                }

                setTimeout(() => {
                    $taskbarIcon.removeClass("taskbar-icon-bounce");
                }, 1000);

                $window[0].offsetHeight;

                setTimeout(function () {
                    if (originalPosition) {
                        $window.css({
                            opacity: "1",
                            transform: "scale(1)",
                            top: originalPosition.top,
                            left: originalPosition.left,
                            transition: `all ${animationDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1.0)`
                        });

                        setTimeout(function () {
                            $window.css({
                                transition: "",
                                transformOrigin: ""
                            });
                        }, animationDuration);
                    } else {
                        $window.css({
                            opacity: "1",
                            transform: "scale(1)"
                        });
                    }
                }, 10);
            }
        },

        /**
         * Nudges any non-maximised window that overlaps with the taskbar back into the
         * visible desktop area. Called when the taskbar changes position.
         * @param {jQuery} taskbarid - jQuery wrapper of the taskbar element.
         */
        adjustWindowsPosition: function (taskbarid) {
            let allWindows = $('.window:not(.maximized)');

            let windowWidth = $(window).width();
            let windowHeight = $(window).height();

            allWindows.each(function () {
                let windowElement = $(this);
                let windowOffset = windowElement.offset();
                let windowRight = windowOffset.left + windowElement.outerWidth();
                let windowBottom = windowOffset.top + windowElement.outerHeight();

                if (taskbarid.hasClass('taskbar-left') && windowOffset.left < taskbarid.outerWidth()) {
                    windowElement.css('left', taskbarid.outerWidth());
                } else if (taskbarid.hasClass('taskbar-right') && windowRight > windowWidth - taskbarid.outerWidth()) {
                    windowElement.css('left', windowWidth - taskbarid.outerWidth() - windowElement.outerWidth());
                } else if (taskbarid.hasClass('taskbar-top') && windowOffset.top < taskbarid.outerHeight()) {
                    windowElement.css('top', taskbarid.outerHeight());
                } else if (taskbarid.hasClass('taskbar-bottom') && windowBottom > windowHeight - taskbarid.outerHeight()) {
                    windowElement.css('top', windowHeight - taskbarid.outerHeight() - windowElement.outerHeight());
                }
            });
        },

        /**
         * Resizes maximised windows to fill the desktop area excluding the taskbar.
         * @param {jQuery} taskbarid - jQuery wrapper of the taskbar element.
         */
        adjustFullWindowsPosition: function (taskbarid) {
            let windowElement = $('.window.maximized');

            var taskbarElement = taskbarid;

            let taskbarWidth = taskbarElement.width();
            let taskbarHeight = taskbarElement.height();

            if (taskbarElement.hasClass('taskbar-left')) {
                windowElement.css({
                    left: `${taskbarWidth}px`,
                    top: '0px',
                    right: '0px',
                    bottom: '0px',
                    width: `calc(100% - ${taskbarWidth}px)`,
                    height: '100%',
                });
            } else if (taskbarElement.hasClass('taskbar-right')) {
                windowElement.css({
                    right: `${taskbarWidth}px`,
                    top: '0px',
                    left: '0px',
                    bottom: '0px',
                    width: `calc(100% - ${taskbarWidth}px)`,
                    height: '100%',
                });
            } else if (taskbarElement.hasClass('taskbar-top')) {
                windowElement.css({
                    top: `${taskbarHeight}px`,
                    left: '0px',
                    right: '0px',
                    bottom: '0px',
                    width: '100%',
                    height: `calc(100% - ${taskbarHeight}px)`,
                });
            } else if (taskbarElement.hasClass('taskbar-bottom')) {
                windowElement.css({
                    bottom: `${taskbarHeight}px`,
                    top: '0px',
                    right: '0px',
                    left: '0px',
                    width: '100%',
                    height: `calc(100% - ${taskbarHeight}px)`,
                });
            }
        },

    });

})((window.app = window.app || {}));
