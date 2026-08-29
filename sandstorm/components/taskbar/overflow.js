/**
 * @file taskbar/overflow.js
 * @description Taskbar overflow manager for Sandstorm OS.
 *
 * Registers `app.desktop.taskbar.overflow` — handles the case where more task icons
 * are registered than fit in the available taskbar space.
 *
 * Responsibilities:
 * - `initialization()` — bind the resize handler; trigger an initial check.
 * - `start()` — first full calculation after taskbar build.
 * - `handle()` — recalculate on resize or icon change.
 * - `functions` — pure helpers: `isHorizontal`, `calculateAvailableSpace`,
 *   `calculateIconLayout`, `applyOverflow`, `applyClockOverflow`, `showMenu`, `hideMenu`,
 *   `createIcon`, `getPosition`, `showMenuWithPosition`, `hideMenuWithTransition`,
 *   `setupButtonHandler`, `setupClickOutsideHandler`.
 *
 * @module components/taskbar/overflow
 */
(function (app) {

    app.desktop.taskbar.overflow = {
        /**
         * Binds the resize handler and triggers an initial overflow check after a short delay.
         * Called once during taskbar setup to wire up responsive overflow behavior.
         */
        initialization: function () {
            $(window).on("resize", app.desktop.taskbar.overflow.handle);

            setTimeout(() => {
                app.desktop.taskbar.overflow.handle();
            }, 5);
        },

        /**
         * Performs the first full overflow calculation after the taskbar is built.
         * Creates all task icons, measures available space, and applies overflow if needed.
         * Also binds the window resize handler, throttled to once per animation frame —
         * `resize` can fire far more often than the browser paints, and re-running the full
         * layout/DOM pass on every one of those ticks was pure waste.
         */
        start: function () {
            let taskIcons = app.desktop.taskbar.config.taskIcons;
            let gap = 4;
            let gapstart = 2;
            let taskbar = $(".taskbar-s");
            let startButton = $(".taskbar-s .left #bts-start");

            if (!app.desktop.taskbar.overflow.functions.isHorizontal(taskbar)) return;

            const spaceInfo = app.desktop.taskbar.overflow.functions.calculateAvailableSpace(taskbar);
            app.desktop.taskbar.createTaskbarIcons();

            const iconInfo = app.desktop.taskbar.overflow.functions.calculateIconLayout(
                startButton,
                gapstart,
                gap,
                spaceInfo.windowWidth,
                spaceInfo.rightWidth,
                spaceInfo.availableSpace
            );
            app.desktop.taskbar.overflow.functions.applyOverflow(iconInfo, taskIcons);

            let resizeScheduled = false;
            $(window).on("resize", () => {
                if (resizeScheduled) return;
                resizeScheduled = true;

                requestAnimationFrame(() => {
                    resizeScheduled = false;
                    app.desktop.taskbar.overflow.handle();
                });
            });
        },

        /**
         * Recalculates icon overflow on resize or icon change.
         * Rebuilds task icons, measures available space, and updates the overflow menu state.
         */
        handle: function () {
            let taskIcons = app.desktop.taskbar.config.taskIcons;
            let gap = 4;
            let gapstart = 2;
            let taskbar = $(".taskbar-s");
            let startButton = $(".taskbar-s .left #bts-start");

            if (!app.desktop.taskbar.overflow.functions.isHorizontal(taskbar)) {
                return;
            }

            const spaceInfo = app.desktop.taskbar.overflow.functions.calculateAvailableSpace(taskbar);

            app.desktop.taskbar.createTaskbarIcons();

            const iconInfo = app.desktop.taskbar.overflow.functions.calculateIconLayout(startButton, gapstart, gap, spaceInfo.windowWidth, spaceInfo.rightWidth, spaceInfo.availableSpace);

            app.desktop.taskbar.overflow.functions.applyOverflow(iconInfo, taskIcons);
        },

        functions: {

            /**
             * Applies the result of `calculateIconLayout` to the DOM.
             * Shows the overflow menu at the correct position when icons overflow, otherwise hides it.
             *
             * @param {{ maxIcons: number, overflowCount: number }} iconInfo - Layout calculation result.
             * @param {Array} taskIcons - Full list of task icon descriptors.
             */
            applyOverflow: function (iconInfo, taskIcons) {
                if (iconInfo.overflowCount > 0) {
                    const position = app.desktop.taskbar.overflow.functions.getPosition();

                    app.desktop.taskbar.overflow.functions.showMenu(
                        iconInfo.maxIcons,
                        iconInfo.overflowCount,
                        taskIcons
                    );

                    $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`).css(position);
                } else {
                    app.desktop.taskbar.overflow.functions.hideMenu();
                }

                app.desktop.taskbar.overflow.functions.applyClockOverflow(iconInfo.overflowCount > 0);
            },

            /**
             * Swaps a digital clock mode for the small analog clock icon at the same breakpoint
             * used for `.tasks` overflow (i.e. when the task icons no longer fit), and restores
             * the user's chosen digital mode once space is available again. Only applies to
             * horizontal taskbars in a digital mode — left/right taskbars already show the
             * analog clock unconditionally, and an explicit "analog"/"hidden" choice never
             * needs the space-saving swap.
             *
             * @param {boolean} isOverflowing - Whether `.tasks` currently overflows.
             */
            applyClockOverflow: function (isOverflowing) {
                const config = app.desktop.taskbar.config;
                const taskbar = $(".taskbar-s");

                if (!app.desktop.taskbar.overflow.functions.isHorizontal(taskbar)) return;
                if (config.clockDisplayMode !== "digital" && config.clockDisplayMode !== "digital-short") return;

                if (isOverflowing && !config.clockOverflowActive) {
                    config.clockOverflowActive = true;
                    clearInterval(config.clockInterval);
                    config.clockInterval = app.desktop.taskbar.analogClock("timeDisplay", 25, 25);
                } else if (!isOverflowing && config.clockOverflowActive) {
                    config.clockOverflowActive = false;
                    clearInterval(config.clockInterval);
                    $("#timeDisplay").empty();
                    const format = config.clockDisplayMode === "digital-short" ? "short" : "full";
                    config.clockInterval = app.desktop.taskbar.clock("timeDisplay", format);
                }
            },

            /**
             * Returns true when the taskbar is oriented horizontally (top or bottom).
             * Overflow is only active for horizontal taskbars.
             *
             * @param {jQuery} taskbar - The taskbar jQuery element.
             * @returns {boolean}
             */
            isHorizontal: function (taskbar) {
                return taskbar.hasClass("taskbar-bottom") || taskbar.hasClass("taskbar-top");
            },

            /**
             * Measures the taskbar and its sub-regions to derive the usable pixel budget for task icons.
             *
             * @param {jQuery} taskbar - The taskbar jQuery element.
             * @returns {{ startButtonWidth: number, rightWidth: number, availableSpace: number, windowWidth: number }}
             */
            calculateAvailableSpace: function (taskbar) {
                const startButtonWidth = taskbar.find(".left #bts-start").outerWidth(true) || 0;
                const rightWidth = taskbar.find(".right").outerWidth() || 0;
                const availableSpace = taskbar.width() - startButtonWidth - rightWidth;
                const windowWidth = window.innerWidth;

                return {
                    startButtonWidth,
                    rightWidth,
                    availableSpace,
                    windowWidth
                };
            },

            /**
             * Determines how many icons fit in the available space and how many overflow.
             * Reserves 65 px for the overflow button when not all icons fit.
             *
             * @param {jQuery} startButton - Start button element (unused directly; kept for call-site symmetry).
             * @param {number} gapstart - Gap after the start button.
             * @param {number} gap - Gap between task icons.
             * @param {number} windowWidth - Current viewport width.
             * @param {number} rightWidth - Width of the right taskbar section.
             * @param {number} availableSpace - Total pixel budget for task icons.
             * @returns {{ icons: jQuery, iconWidths: number[], maxIcons: number, overflowCount: number, totalIconsWidth: number }}
             */
            calculateIconLayout: function (startButton, gapstart, gap, windowWidth, rightWidth, availableSpace) {
                const icons = $(".taskbar-s .tasks .blockicon");
                let totalIconsWidth = 0;
                let iconWidths = [];

                icons.each(function (index) {
                    const isLast = index === icons.length - 1;
                    let iconWidth = $(this).outerWidth(true);
                    if (!isLast) {
                        iconWidth += gap;
                    }
                    iconWidths.push(iconWidth);
                    totalIconsWidth += iconWidth;
                });

                let usedWidth = 0;
                let maxIcons = 0;

                if (totalIconsWidth <= availableSpace) {
                    maxIcons = iconWidths.length;
                } else {
                    for (let i = 0; i < iconWidths.length; i++) {
                        if (usedWidth + iconWidths[i] + 65 <= availableSpace) {
                            usedWidth += iconWidths[i];
                            maxIcons++;
                        } else {
                            break;
                        }
                    }
                }

                if (maxIcons === 0) {
                    maxIcons = 1;
                }

                const overflowCount = Math.max(0, icons.length - maxIcons);

                return {
                    icons,
                    iconWidths,
                    maxIcons,
                    overflowCount,
                    totalIconsWidth
                };
            },

            /**
             * Renders the overflow button and populates the hidden overflow menu.
             * Calls `createTaskbarIcons(maxIcons)` to trim the visible icon list first.
             * Skips rendering when there is no overflow or all icons already fit.
             *
             * @param {number} maxIcons - Number of icons that fit in the taskbar.
             * @param {number} overflowCount - Number of icons that don't fit.
             * @param {Array} taskIcons - Full task icon descriptor list.
             */
            showMenu: function (maxIcons, overflowCount, taskIcons) {
                if (overflowCount === 0 || taskIcons.length <= maxIcons) {
                    return;
                }

                app.desktop.taskbar.createTaskbarIcons(maxIcons);

                const overflowIconHtml =
                    app.desktop.taskbar.overflow.functions.createIcon(taskIcons, maxIcons);

                $(".tasksoverflow:eq(0)").html(`
                    <div class="blockicon overflow-icon">${overflowIconHtml}</div>
                    <div id="sw-bt-tasksoverflow"><span>${overflowCount}</span></div>
                `).show();

                const nextOverflowIcon = taskIcons[maxIcons];
                const taskIcon = $(".tasksoverflow:eq(0) .overflow-icon");

                if (taskIcon.length) {
                    app.desktop.taskbar.setProgramStatus(nextOverflowIcon.programid, taskIcon);
                }

                let $menu = $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`);
                if ($menu.length === 0) {
                    $("body").append(
                        `<div id="${app.desktop.taskbar.config.tasksOverFlowmenuId}" class="hidden"></div>`
                    );
                    $menu = $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`);
                }

                const overflowIconIds = taskIcons.slice(maxIcons).map(i => i.id);

                app.desktop.taskbar.fillOverflowMenu(overflowIconIds);

                const $overflowBtn = $(".tasksoverflow:eq(0)");
                app.desktop.taskbar.overflow.functions.setupButtonHandler($overflowBtn, $menu);
                app.desktop.taskbar.overflow.functions.setupClickOutsideHandler($menu, $overflowBtn);
            },

            /**
             * Builds the SVG or IMG element used as the overflow button icon.
             * Falls back to a default archive icon when `taskIcons[maxIcons]` is undefined.
             *
             * @param {Array} taskIcons - Full task icon descriptor list.
             * @param {number} maxIcons - Index of the first overflowed icon.
             * @returns {string} HTML string for the icon element.
             */
            createIcon: function (taskIcons, maxIcons) {
                const nextOverflowIcon = taskIcons[maxIcons] || {
                    svg: "default-archive-icon.svg",
                    img: "default-archive-icon.png",
                    name: "Overflow Icon"
                };

                if (nextOverflowIcon.svg) {
                    return `<svg><use href="${nextOverflowIcon.svg}"></use></svg>`;
                } else {
                    return `<img src="${nextOverflowIcon.img}" />`;
                }
            },

            /**
             * Legacy setup path for the overflow menu (not used in the primary flow).
             * Populates the menu from a pre-extracted overflow icon list and wires up button handlers.
             *
             * @param {jQuery[]} overflowIcons - jQuery elements of overflowed icons.
             */
            setupMenu: function (overflowIcons) {
                const $overflowBtn = $("#sw-bt-tasksoverflow");
                let $menu = $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`);

                if ($menu.length === 0) {
                    $("body").append(`<div id="${app.desktop.taskbar.config.tasksOverFlowmenuId}" class="hidden"><p>Overflow Menu</p></div>`);
                }

                const extractedIds = overflowIcons.map((i, el) => el.id).get();
                app.desktop.taskbar.fillOverflowMenu(extractedIds);

                app.desktop.taskbar.overflow.functions.setupButtonHandler($overflowBtn, $menu);
                app.desktop.taskbar.overflow.functions.setupClickOutsideHandler($menu, $overflowBtn);
            },

            /**
             * Wires the click handler on the overflow button to toggle the menu open/closed.
             * Detaches any previous handler before binding to avoid duplicate listeners.
             *
             * @param {jQuery} $overflowBtn - The overflow trigger button element.
             * @param {jQuery} $menu - The overflow menu container element.
             */
            setupButtonHandler: function ($overflowBtn, $menu) {
                $overflowBtn.off("click").on("click", (event) => {
                    event.stopPropagation();

                    if ($menu.is(":visible")) {
                        app.desktop.taskbar.overflow.functions.hideMenuWithTransition($menu);
                        return;
                    }

                    app.desktop.taskbar.overflow.functions.showMenuWithPosition($menu);
                });
            },

            /**
             * Closes the overflow menu when the user clicks outside it.
             * Uses a namespaced event (`click.tasksoverflow`) to allow clean removal on rebind.
             *
             * @param {jQuery} $menu - The overflow menu container element.
             * @param {jQuery} $overflowBtn - The overflow trigger button (excluded from outside-click detection).
             */
            setupClickOutsideHandler: function ($menu, $overflowBtn) {
                $(document).off("click.tasksoverflow").on("click.tasksoverflow", (event) => {
                    if (!$menu.is(event.target) &&
                        !$menu.has(event.target).length &&
                        !$overflowBtn.is(event.target)) {
                        app.desktop.taskbar.overflow.functions.hideMenuWithTransition($menu);
                    }
                });
            },

            /**
             * Computes absolute CSS position for the overflow menu relative to the taskbar edge.
             * Returns coordinates appropriate for all four taskbar positions (top/bottom/left/right).
             *
             * @returns {{ left?: string, top?: string, bottom?: string, right?: string, width?: string, height?: string }}
             */
            getPosition: function ($menu) {
                const $taskbar = $(".taskbar-s");
                if ($taskbar.length === 0) return {};

                const rect = $taskbar[0].getBoundingClientRect();
                let position = {};

                if ($taskbar.hasClass("taskbar-bottom")) {
                    position = {
                        left: rect.left + "px",
                        bottom: window.innerHeight - rect.top + "px",
                        width: rect.width + "px"
                    };
                } else if ($taskbar.hasClass("taskbar-top")) {
                    position = {
                        left: rect.left + "px",
                        top: rect.bottom + "px",
                        width: rect.width + "px"
                    };
                } else if ($taskbar.hasClass("taskbar-left")) {
                    position = {
                        left: rect.right + "px",
                        top: rect.top + "px",
                        height: rect.height + "px"
                    };
                } else if ($taskbar.hasClass("taskbar-right")) {
                    position = {
                        right: window.innerWidth - rect.left + "px",
                        top: rect.top + "px",
                        height: rect.height + "px"
                    };
                }

                return position;
            },

            /**
             * Makes the overflow menu visible at the correct screen position.
             * Sets display to flex before fading in via a short opacity timeout.
             *
             * @param {jQuery} $menu - The overflow menu container element.
             */
            showMenuWithPosition: function ($menu) {
                const position = app.desktop.taskbar.overflow.functions.getPosition();
                $menu.css(position);

                $menu.css({
                    display: 'flex',
                    height: 'fit-content',
                    minHeight: "36",
                });

                setTimeout(() => {
                    $menu.css({ opacity: 1 });
                }, 5);
            },

            /**
             * Fades the overflow menu out and hides it after the transition completes.
             *
             * @param {jQuery} $menu - The overflow menu container element.
             */
            hideMenuWithTransition: function ($menu) {
                $menu.css({
                    opacity: 0,
                    transition: 'opacity 500ms'
                });

                setTimeout(() => {
                    $menu.hide();
                }, 500);
            },

            /**
             * Immediately hides the overflow button and fades out the overflow menu if visible.
             */
            hideMenu: function () {
                const $menu = $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`);

                $(".tasksoverflow:eq(0)").hide();

                if ($menu.length && $menu.is(":visible")) {
                    app.desktop.taskbar.overflow.functions.hideMenuWithTransition($menu);
                }
            }
        }
    };

})((window.app = window.app || {}));
