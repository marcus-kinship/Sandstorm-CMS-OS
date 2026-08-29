/**
 * @file taskbar/build.js
 * @description Taskbar construction and lifecycle: `build()` (creates the
 * DOM, loads CSS, starts the clock/overflow system, runs the entrance
 * animation, and wires the responsive mobile/desktop position swap),
 * `setPosition()` (per-edge inline styles), `addMove`/`removeMove`
 * (drag-to-reposition to a screen edge), `handleTaskbarResize()` (overflow
 * debug indicator), and `hide()`/`show()` (slide off/on screen).
 *
 * Registers these on `app.desktop.taskbar` — same IIFE-extends convention
 * as the other taskbar/*.js sibling modules. Loaded via `taskbar/index.js`'s
 * side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/build
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Enables drag-to-reposition on the taskbar element when `config.positionLock` is false.
         * Dragging to a screen edge snaps and applies the corresponding position class.
         * @param {jQuery} taskbarid - jQuery wrapper of the taskbar element.
         */
        addMove: function (taskbarid) {
            if (!app.desktop.taskbar.config.positionLock) {
                let dragging = false;
                let isTouch = false;

                taskbarid.on('mousedown touchstart', function (event) {
                    if (event.target !== this) {
                        return;
                    }

                    dragging = true;
                    isTouch = event.type === 'touchstart';
                });

                $(document).on('mousemove touchmove', function (event) {
                    if (!dragging) return;

                    var pageX = event.originalEvent.touches ? event.originalEvent.touches[0].pageX : event.pageX;
                    var pageY = event.originalEvent.touches ? event.originalEvent.touches[0].pageY : event.pageY;

                    var windowWidth = $(window).width();
                    var windowHeight = $(window).height();

                    if (pageX < windowWidth * 0.25 || pageX > windowWidth * 0.75 || pageY < windowHeight * 0.25 || pageY > windowHeight * 0.75) {
                        taskbarid.css('transition', 'none');

                        app.desktop.taskbar.adjustWindowsPosition(taskbarid);

                        var windowElement = $('.window.maximized');
                        var taskbarElement = $('.taskbar-s').eq(0);

                        let taskbarWidth = taskbarElement.width();
                        let taskbarHeight = taskbarElement.height();

                        if (pageX <= windowWidth / 4) {
                            taskbarid.removeClass("taskbar-left taskbar-right taskbar-top taskbar-bottom").addClass("taskbar-left");
                            windowElement.css({
                                left: `${taskbarWidth}px`,
                                top: '0px',
                                right: '0px',
                                bottom: '0px',
                                width: `calc(100% - ${taskbarWidth}px)`,
                                height: '100%',
                            });
                        } else if (pageX >= windowWidth * 3 / 4) {
                            taskbarid.removeClass("taskbar-left taskbar-right taskbar-top taskbar-bottom").addClass("taskbar-right");
                            windowElement.css({
                                right: `${taskbarWidth}px`,
                                top: '0px',
                                left: '0px',
                                bottom: '0px',
                                width: `calc(100% - ${taskbarWidth}px)`,
                                height: '100%',
                            });
                        } else if (pageY <= windowHeight / 4) {
                            taskbarid.removeClass("taskbar-left taskbar-right taskbar-top taskbar-bottom").addClass("taskbar-top");
                            windowElement.css({
                                top: `${taskbarHeight}px`,
                                left: '0px',
                                right: '0px',
                                bottom: '0px',
                                width: '100%',
                                height: `calc(100% - ${taskbarHeight}px)`,
                            });
                        } else {
                            taskbarid.removeClass("taskbar-left taskbar-right taskbar-top taskbar-bottom").addClass("taskbar-bottom");
                            windowElement.css({
                                bottom: `${taskbarHeight}px`,
                                top: '0px',
                                right: '0px',
                                left: '0px',
                                width: '100%',
                                height: `calc(100% - ${taskbarHeight}px)`,
                            });
                        }
                    }
                });

                $(document).on('mouseup touchend', function () {
                    dragging = false;
                    taskbarid.css('transition', '0.9s 0.8s, opacity 1800ms');

                    if (taskbarid.hasClass('taskbar-left') || taskbarid.hasClass('taskbar-right')) {
                        app.desktop.taskbar.config.clockOverflowActive = false;
                        clearInterval(app.desktop.taskbar.config.clockInterval);
                        app.desktop.taskbar.config.clockInterval = app.desktop.taskbar.analogClock();
                    } else if (taskbarid.hasClass('taskbar-bottom') || taskbarid.hasClass('taskbar-top')) {
                        app.desktop.taskbar.setClockDisplay(app.desktop.taskbar.config.clockDisplayMode);
                    }
                });
            }
        },

        /**
         * Removes all drag-to-reposition event listeners from the taskbar element.
         * @param {jQuery} taskbarid
         */
        removeMove: function (taskbarid) {
            taskbarid.off('mousedown touchstart');
            $(document).off('mousemove touchmove');
            $(document).off('mouseup touchend');
        },

        /**
         * Slides the taskbar off-screen and marks it as unbuilt.
         * Direction matches the current position (bottom → down, left → left, etc.).
         * Awaits a 500 ms animation before setting `config.isUnbuilt = true`.
         * @returns {Promise<void>}
         */
        hide: async function () {
            const id = this.config.options.id;
            const position = this.config.options.position;
            const taskbar = $('#' + id)[0];

            if (!taskbar) return;

            taskbar.style.transition = "all 0.5s ease";
            taskbar.style.opacity = "0";

            switch (position) {
                case "bottom":
                    taskbar.style.transform = "translateY(100%)";
                    break;
                case "top":
                    taskbar.style.transform = "translateY(-100%)";
                    break;
                case "left":
                    taskbar.style.transform = "translateX(-100%)";
                    break;
                case "right":
                    taskbar.style.transform = "translateX(100%)";
                    break;
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            app.desktop.taskbar.config.isUnbuilt = true;
        },

        /**
         * Slides the taskbar back into view from its off-screen hide position.
         * Sets `config.isUnbuilt = false` after the animation completes (500 ms).
         * @returns {Promise<void>}
         */
        show: async function () {
            const id = this.config.options.id;
            const position = this.config.options.position;
            const taskbar = $('#' + id)[0];

            if (!taskbar) return;

            switch (position) {
                case "bottom":
                    taskbar.style.transform = "translateY(100%)";
                    break;
                case "top":
                    taskbar.style.transform = "translateY(-100%)";
                    break;
                case "left":
                    taskbar.style.transform = "translateX(-100%)";
                    break;
                case "right":
                    taskbar.style.transform = "translateX(100%)";
                    break;
            }

            taskbar.style.opacity = "0";
            taskbar.style.transition = "all 0.5s ease";

            await new Promise(resolve => requestAnimationFrame(resolve));

            taskbar.style.transform = "translateX(0) translateY(0)";
            taskbar.style.opacity = "1";

            await new Promise(resolve => setTimeout(resolve, 500));

            app.desktop.taskbar.config.isUnbuilt = false;
        },

        /**
         * Creates the taskbar DOM, loads the external CSS, starts the overflow system,
         * and runs the slide-in + child fade-in entrance animation.
         * Must be called after `options()` has been set. Wraps everything in a jQuery
         * document-ready handler so it is safe to call during the boot sequence.
         */
        build: function () {
            if (!this.config) {
                app.dev.error("Taskbar configuration is not set.");
                return;
            }

            $(async function () {
                let id = app.desktop.taskbar.config.options.id;
                let position = app.desktop.taskbar.config.options.position;
                let startButton = app.desktop.taskbar.config.options.button;

                if (typeof startButton === "string") {
                    if (!startButton.startsWith("app.")) startButton = "app." + startButton;

                    const parts = startButton.split(".");
                    const fnName = parts.pop();
                    const context = parts.reduce((o, k) => o?.[k], window);
                    const fn = context?.[fnName];

                    if (typeof fn === "function") {
                        startButton = fn.call(context);
                    }
                }

                let $taskbar = $("#" + id);

                if (!$taskbar.length) {
                    $taskbar = $("<div>", { id }).appendTo("body");
                }

                $taskbar.addClass("taskbar-s");

                await app.addCSS("Taskbar", app.config.local.ComponentsRoot + "taskbar/style.css", true);

                // Left side
                const $left = $("<div>", { class: "left" });
                const $tasks = $("<div>", { class: "tasks" });
                const $overflow = $("<div>", { class: "tasksoverflow" });

                $left.append(startButton, $tasks, $overflow);

                // Right side
                const $right = $("<div>", { class: "right" });
                $right.empty();

                const statusIcons = app.desktop.taskbar.createStatusIcons();
                if (statusIcons) $right.append(statusIcons);

                $right.append(`
                    <div id="timeDisplay" style="color:#fff;">00:00:00</div>
                    <div id="showDesktopBtn" title="${_('Show desktop')}"></div>
                `);

                $taskbar.append($left, $right);

                app.desktop.taskbar.setPosition($taskbar[0], position);

                if ($taskbar.hasClass('taskbar-left') || $taskbar.hasClass('taskbar-right')) {
                    app.desktop.taskbar.config.clockInterval = app.desktop.taskbar.analogClock();
                } else {
                    app.desktop.taskbar.setClockDisplay(app.desktop.taskbar.config.clockDisplayMode);
                }
                app.desktop.taskbar.overflow.start();

                // Phase 1: snap taskbar fully off-screen (no transition) based on its edge
                const initTransform =
                    $taskbar.hasClass('taskbar-bottom') ? 'translateY(200%)' :
                    $taskbar.hasClass('taskbar-top')    ? 'translateY(-200%)' :
                    $taskbar.hasClass('taskbar-left')   ? 'translateX(-200%)' :
                                                          'translateX(200%)';

                $taskbar.css({ transition: 'none', transform: initTransform, opacity: '0' });

                // Phase 2: hide children for staggered fade-in after slide
                let i = 0;
                $("#" + id + " > div > *").each(function () {
                    $(this).css("--transition-delay", `${i * 0.2}s`).addClass("fade-hidden");
                    i++;
                });

                void $taskbar[0].offsetHeight;

                // Clear inline overrides — CSS transition now active, element slides in
                requestAnimationFrame(() => {
                    $taskbar.css({ transition: '', transform: '', opacity: '' });

                    // After slide completes, fade in children with stagger
                    setTimeout(() => {
                        $("#" + id + " > div > *").addClass("fade-in");

                        const style = window.getComputedStyle($taskbar[0]);
                        const durations = (style.transitionDuration || '').split(',').map(s => {
                            const v = parseFloat(s.trim());
                            return s.includes('ms') ? v : v * 1000;
                        });
                        const maxDuration = durations.length ? Math.max(...durations) : 1000;
                        app.desktop.taskbar.config.animate = Math.ceil(maxDuration) + 10;
                    }, 950);
                });

                $("#" + id + " > div > *").on("transitionend", function () {
                    $(this).removeClass("fade-in fade-hidden");
                });

                if (app.desktop.taskbar.config.options.context) {
                    app.desktop.contextMenuInit("#" + id, app.desktop.taskbar.config.options.context);
                }

                app.desktop.taskbar.addMove($taskbar);
                app.desktop.taskbar.sort.sortableTaskIcons();

                let previousPosition = null;
                let previousMenuPosition = "";
                let mobileApplied = false;
                let resizeTimeout = null;
                let checkInProgress = false;

                // Exit direction for leaving `position` toward mobile/bottom
                // mode — matches setPosition()'s own off-screen convention
                // (top:-Y, bottom:+Y, left:-X, right:+X) so each edge slides
                // away toward ITS OWN side. The exit transform used to be a
                // flat "translateY(100%)" (down) for every position — fine
                // for taskbar-bottom leaving toward mobile-bottom (never
                // actually reached, see the early return below, since
                // that's already the target), but visually wrong for
                // top/left/right: reported live as the top taskbar sliding
                // DOWN into the page content while fading out, instead of
                // up and off the top edge — confirmed by sampling its
                // computed rect every 20ms during the transition.
                function _exitTransform(position) {
                    switch (position) {
                        case "taskbar-top": return "translateY(-100%)";
                        case "taskbar-left": return "translateX(-100%)";
                        case "taskbar-right": return "translateX(100%)";
                        default: return "translateY(100%)"; // taskbar-bottom
                    }
                }

                async function checkTaskbarPosition() {
                    if (!app.exists("app.desktop.startmenu.options.menu")) {
                        return;
                    }
                    if (checkInProgress) return;
                    checkInProgress = true;

                    const width = window.innerWidth;
                    const pos = app.desktop.taskbar.config.position;
                    const menu = app.desktop.startmenu.options.menu;
                    const $menu = menu ? $("#" + menu.id) : null;

                    try {

                    if (width <= app.config.local.breakpoints.taskbar) {
                        if (pos === "taskbar-bottom") return;

                        app.dev.log(`Taskbar: ${pos} → taskbar-bottom (width=${width}px)`, "Taskbar");
                        previousPosition = pos;

                        previousMenuPosition = "";
                        if ($menu && $menu.length) {
                            const cl = $menu[0].classList;
                            if (cl.contains("def-l")) previousMenuPosition = "def-l";
                            else if (cl.contains("def-r")) previousMenuPosition = "def-r";
                            else if (cl.contains("def-t")) previousMenuPosition = "def-t";
                            else if (cl.contains("def-b")) previousMenuPosition = "def-b";
                        }

                        const _menuOpenMobile = $menu && $menu.length && (
                            $menu[0].classList.contains("show-l") ||
                            $menu[0].classList.contains("show-r") ||
                            $menu[0].classList.contains("show-t") ||
                            $menu[0].classList.contains("show-b")
                        );

                        $taskbar.css({
                            transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                            transform: _exitTransform(pos),
                            opacity: 0
                        });

                        if ($menu && $menu.length && _menuOpenMobile) {
                            $menu.css({
                                transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                transform: "translateY(50%)",
                                opacity: 0
                            });
                        }

                        await app.ui.waitForTransitionEnd($taskbar);

                        if ($menu && $menu.length && _menuOpenMobile) {
                            await app.ui.waitForTransitionEnd($menu);
                        }

                        $taskbar.css("transition", "none");
                        if ($menu && $menu.length) $menu.css("transition", "none");

                        app.desktop.taskbar.config.position = "taskbar-bottom";
                        $taskbar
                            .removeClass("taskbar-left taskbar-right taskbar-top")
                            .addClass("taskbar-bottom")
                            .css({ transform: "translateY(0)" });

                        if ($menu && $menu.length) {
                            $menu.removeClass("def-l def-r def-t def-b show-l show-r show-t show-b")
                                .addClass(_menuOpenMobile ? "def-b show-b" : "def-b")
                                .css({ transform: "translateY(0)" });
                        }

                        requestAnimationFrame(() => {
                            $taskbar.css({
                                transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                opacity: 1
                            });
                            if ($menu && $menu.length && _menuOpenMobile) {
                                $menu.css({
                                    transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                    opacity: 1
                                });
                            }
                        });

                        app.desktop.taskbar.setClockDisplay(app.desktop.taskbar.config.clockDisplayMode);
                        app.desktop.taskbar.adjustWindowsPosition($taskbar);
                        app.desktop.taskbar.adjustFullWindowsPosition($taskbar);
                        app.desktop.taskbar.sort.sortableTaskIcons();

                        mobileApplied = true;

                    } else if (mobileApplied && previousPosition) {
                        app.dev.log(`Taskbar: taskbar-bottom → ${previousPosition} (width=${width}px)`, "Taskbar");
                        const _menuOpenDesktop = $menu && $menu.length && (
                            $menu[0].classList.contains("show-l") ||
                            $menu[0].classList.contains("show-r") ||
                            $menu[0].classList.contains("show-t") ||
                            $menu[0].classList.contains("show-b")
                        );

                        $taskbar.css({
                            transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                            transform: "translateY(100%)",
                            opacity: 0
                        });

                        if ($menu && $menu.length && _menuOpenDesktop) {
                            $menu.css({
                                transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                transform: "translateY(50%)",
                                opacity: 0
                            });
                        }

                        await app.ui.waitForTransitionEnd($taskbar);

                        if ($menu && $menu.length && _menuOpenDesktop) {
                            await app.ui.waitForTransitionEnd($menu);
                        }

                        $taskbar.css("transition", "none");
                        if ($menu && $menu.length) $menu.css("transition", "none");

                        app.desktop.taskbar.config.position = previousPosition;

                        $taskbar.removeClass("taskbar-left taskbar-right taskbar-top taskbar-bottom")
                            .addClass(previousPosition)
                            .css({ transform: "translateY(0)" });

                        if ($menu && $menu.length) {
                            $menu.removeClass("def-l def-r def-b show-l show-r show-b");
                            if (previousMenuPosition) {
                                const classes = _menuOpenDesktop
                                    ? previousMenuPosition + " " + previousMenuPosition.replace("def-", "show-")
                                    : previousMenuPosition;
                                $menu.addClass(classes);
                            }
                            $menu.css({ transform: "translateY(0)" });
                        }

                        requestAnimationFrame(() => {
                            $taskbar.css({
                                transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                opacity: 1
                            });
                            if ($menu && $menu.length && _menuOpenDesktop) {
                                $menu.css({
                                    transition: "transform .35s ease-in-out, opacity .35s ease-in-out",
                                    opacity: 1
                                });
                            }
                        });

                        if ($taskbar.hasClass('taskbar-left') || $taskbar.hasClass('taskbar-right')) {
                            app.desktop.taskbar.config.clockOverflowActive = false;
                            clearInterval(app.desktop.taskbar.config.clockInterval);
                            app.desktop.taskbar.config.clockInterval = app.desktop.taskbar.analogClock();
                        } else {
                            app.desktop.taskbar.setClockDisplay(app.desktop.taskbar.config.clockDisplayMode);
                        }
                        app.desktop.taskbar.adjustWindowsPosition($taskbar);
                        app.desktop.taskbar.adjustFullWindowsPosition($taskbar);
                        app.desktop.taskbar.sort.sortableTaskIcons();

                        mobileApplied = false;
                    }
                    } finally {
                        checkInProgress = false;
                    }
                }

                app.dev.log(`Breakpoints: taskbar≤${app.config.local.breakpoints.taskbar}px`, "Taskbar");

                $(window).on("resize", () => {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(checkTaskbarPosition, 50);
                });

                checkTaskbarPosition();
            });
        },

        /**
         * Attaches a window-resize listener that checks whether the taskbar's left or
         * right sides overflow and adds a visible red debug box when they do.
         * Also snap-forces bottom position on narrow (≤ 705 px) screens.
         */
        handleTaskbarResize: function () {
            const $taskbar = $('.taskbar-s');
            if ($taskbar.length === 0) return;

            const $taskbarLeft = $taskbar.find('.left');
            const $taskbarRight = $taskbar.find('.right');
            if ($taskbarLeft.length === 0 || $taskbarRight.length === 0) return;

            const isBottomOrTop = $taskbar.hasClass('taskbar-bottom') || $taskbar.hasClass('taskbar-top');
            const isLeftOrRight = $taskbar.hasClass('taskbar-left') || $taskbar.hasClass('taskbar-right');

            function calculateChildrenSize($element, isWidth) {
                let totalSize = 0;
                $element.children().each(function () {
                    totalSize += isWidth ? $(this).outerWidth(true) : $(this).outerHeight(true);
                });
                return totalSize;
            }

            function manageOverflow($side, dimension, totalSize, maxSize, sideName) {
                const overflow = totalSize > maxSize;
                const redBoxClass = `red-box-${sideName}`;
                let $redBox = $side.find(`.${redBoxClass}`);

                if (overflow) {
                    $side.css(dimension, `${maxSize}px`).css('overflow', 'hidden');

                    if ($redBox.length === 0) {
                        $redBox = $('<div>', { class: redBoxClass }).css({
                            position: 'absolute',
                            width: '36px',
                            height: '32px',
                            backgroundColor: 'red',
                            zIndex: 10,
                            opacity: 1,
                            transition: 'opacity 0.3s',
                        });

                        if (sideName === 'left') {
                            $redBox.css({ right: '0', top: '50%', transform: 'translateY(-50%)' });
                        } else if (sideName === 'right') {
                            $redBox.css({ left: '0', top: '50%', transform: 'translateY(-50%)' });
                        }

                        $side.append($redBox);
                    }
                } else {
                    $side.css(dimension, '').css('overflow', '');
                    $redBox.remove();
                }
            }

            if (isBottomOrTop) {
                const taskbarWidth = $taskbar.width();
                manageOverflow($taskbarLeft, 'width', calculateChildrenSize($taskbarLeft, true), taskbarWidth / 2, 'left');
                manageOverflow($taskbarRight, 'width', calculateChildrenSize($taskbarRight, true), taskbarWidth / 2, 'right');
            } else if (isLeftOrRight) {
                const taskbarHeight = $taskbar.height();
                manageOverflow($taskbarLeft, 'height', calculateChildrenSize($taskbarLeft, false), taskbarHeight / 2, 'left');
                manageOverflow($taskbarRight, 'height', calculateChildrenSize($taskbarRight, false), taskbarHeight / 2, 'right');
            }
        },

        /**
         * Applies position-specific inline styles and a CSS class to the taskbar element.
         * Sets `position: fixed`, `z-index`, the appropriate `taskbar-{side}` class, and an
         * initial off-screen transform that the entrance animation will clear.
         * @param {HTMLElement} taskbar  - The raw taskbar DOM element.
         * @param {string}      position - "bottom" | "top" | "left" | "right"
         */
        setPosition: function (taskbar, position) {
            taskbar.style.position = "fixed";
            taskbar.style.transition = "all 0.9s ease,opacity 1800ms ease";
            taskbar.style.opacity = 0;
            taskbar.style.transitionDelay = "0.8s";
            taskbar.style.zIndex = "9998";

            switch (position) {
                case "bottom":
                    taskbar.classList.add('taskbar-bottom');
                    taskbar.style.transform = "translateY(100%)";
                    break;
                case "top":
                    taskbar.classList.add('taskbar-top');
                    taskbar.style.transform = "translateY(-100%)";
                    break;
                case "left":
                    taskbar.classList.add('taskbar-left');
                    taskbar.style.transform = "translateX(-100%)";
                    break;
                case "right":
                    taskbar.classList.add('taskbar-right');
                    taskbar.style.transform = "translateX(100%)";
                    break;
                default:
                    console.warn(`Unknown position: ${position}. Defaulting to bottom.`);
                    taskbar.classList.add('taskbar-bottom');
                    taskbar.style.transform = "translateY(100%)";
            }
        },

    });

})((window.app = window.app || {}));
