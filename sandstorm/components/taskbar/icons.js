/**
 * @file taskbar/icons.js
 * @description Task icon registry and rendering: add/remove/update entries
 * in `config.taskIcons`, render them into the `.tasks` container (and the
 * overflow dropdown), and apply/derive their running/success/fail/abort
 * status classes.
 *
 * Registers several `app.desktop.taskbar.*` methods — same IIFE-extends
 * convention as the other taskbar/*.js sibling modules. Loaded via
 * `taskbar/index.js`'s side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/icons
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Removes a program's taskbar icon when all its windows are closed.
         * Pinned programs (`program.taskbar === true`) only lose their run/hid state;
         * their icon stays. Unpinned programs have their icon fully removed.
         * @param {string}  programId
         * @param {Object}  [options]
         * @param {boolean} [options.wait=true] - Await the fade-out animation before removing.
         * @returns {Promise<void>}
         */
        removeProgram: async function (programId, options = {}) {
            const { wait = true } = options;

            const program = app.program.getInfo(programId);
            const taskbarElement = $(`#pid-${programId}-task`);
            const remainingWindows = document.querySelectorAll(`.pid-${programId}`).length;

            if (!taskbarElement.length) return;

            if (program?.taskbar === true) {
                if (remainingWindows === 0) {
                    taskbarElement.removeClass("runstate hidstate");
                }
                return;
            }

            if (program?.taskbar === false && remainingWindows === 0) {
                taskbarElement.removeClass("runstate hidstate");
                app.program.setTaskbarIconDisplayFalse(programId);

                if (wait) {
                    await app.ui.animation(taskbarElement.get(0));
                }

                taskbarElement.remove();
                app.desktop.taskbar.removeTaskIcon(programId);
            }
        },

        /**
         * Removes all entries from `config.taskIcons`.
         */
        clearTaskIcons: function () {
            if (app.desktop.taskbar.config.taskIcons && Array.isArray(app.desktop.taskbar.config.taskIcons)) {
                const count = app.desktop.taskbar.config.taskIcons.length;

                if (count > 0) {
                    app.desktop.taskbar.config.taskIcons = [];
                    app.dev.log(`Cleared ${count} task icon${count !== 1 ? "s" : ""} from taskbar.`);
                } else {
                    app.dev.warn("No task icons to clear.");
                }
            } else {
                app.dev.warn("Task icon config not initialized or invalid.");
            }
        },

        /**
         * Removes a single icon from `config.taskIcons` by program ID.
         * @param {string} programId - The base program ID (without the `pid-…-task` wrapper).
         */
        removeTaskIcon: function (programId) {
            const fullId = `pid-${programId}-task`;

            if (app.desktop.taskbar.config && Array.isArray(app.desktop.taskbar.config.taskIcons)) {
                let beforeCount = app.desktop.taskbar.config.taskIcons.length;

                app.desktop.taskbar.config.taskIcons = app.desktop.taskbar.config.taskIcons.filter(icon => icon.id !== fullId);

                if (app.desktop.taskbar.config.taskIcons.length !== beforeCount) {
                    app.desktop.taskbar.config.taskIcons.sort((a, b) => a.order - b.order);
                    app.dev.log(`Removed task icon: ${fullId}`);
                } else {
                    app.dev.log(`No task icon found with ID: ${fullId}`);
                }
            } else {
                app.dev.warn("Task icon config not initialized or invalid.");
            }
        },

        /**
         * Adds or updates an icon in `config.taskIcons`. If an icon with the same `id`
         * already exists it is merged; otherwise it is appended. The array is sorted by
         * `order` after every write.
         * @param {Object}   iconOptions
         * @param {string}   iconOptions.id         - Unique DOM id, typically `pid-<programId>-task`.
         * @param {string}   iconOptions.programid  - Program ID.
         * @param {string}   [iconOptions.svg]      - SVG href used as icon.
         * @param {string}   [iconOptions.img]      - Image URL used when no SVG.
         * @param {string}   [iconOptions.class]    - CSS class for the icon element.
         * @param {string}   [iconOptions.name]     - Tooltip / accessible label.
         * @param {number}   [iconOptions.order]    - Sort order; defaults to append position.
         * @param {Function} [iconOptions.callback] - Click handler.
         * @param {Function} [iconOptions.contextMenu] - Right-click handler.
         */
        setTaskIcon: function (iconOptions) {
            if (this.config && Array.isArray(app.desktop.taskbar.config.taskIcons)) {
                const existingIconIndex = app.desktop.taskbar.config.taskIcons.findIndex(icon => icon.id === iconOptions.id);

                if (existingIconIndex === -1) {
                    if (typeof iconOptions.order !== "number") {
                        iconOptions.order = app.desktop.taskbar.config.taskIcons.length;
                    }
                    app.desktop.taskbar.config.taskIcons.push(iconOptions);
                } else {
                    app.desktop.taskbar.config.taskIcons[existingIconIndex] = {
                        ...app.desktop.taskbar.config.taskIcons[existingIconIndex],
                        ...iconOptions
                    };
                }

                app.desktop.taskbar.config.taskIcons.sort((a, b) => a.order - b.order);
            }
        },

        /**
         * Clears and re-populates the overflow dropdown menu with the given icon IDs.
         * Called by `overflow.showMenu` whenever the set of overflowing icons changes.
         * @param {string[]} overflowIcons - Array of `taskIcon.id` values to display.
         */
        fillOverflowMenu: function (overflowIcons) {
            const $menu = $(`#${app.desktop.taskbar.config.tasksOverFlowmenuId}`);
            $menu.empty();

            const taskIcons = app.desktop.taskbar.config.taskIcons;

            overflowIcons.forEach((id) => {
                const icon = taskIcons.find(task => task.id === id);

                if (!icon) {
                    app.dev.warn(`No matching icon found for ID: ${id}`);
                    return;
                }

                let afterDiv = this.setProgramStatusAnimation(icon);

                const $taskIconDiv = $("<div>", {
                    id: icon.id,
                    class: icon.class || "task-icon",
                    html: icon.svg
                        ? `<svg title="${icon.name || "Task Icon"}"><use href="${icon.svg}"></use></svg>`
                        : `<img src="${icon.img}" title="${icon.name || "Task Icon"}" alt="${icon.name || "Task Icon"}" />`
                });

                $taskIconDiv.append(afterDiv);

                this.setProgramStatus(icon.programid, $taskIconDiv);

                $taskIconDiv.on("click", () => {
                    if (typeof icon.callback === "function") {
                        icon.callback();
                    }

                    const $overflowIcon = $('.tasksoverflow .overflow-icon');
                    if ($overflowIcon.length > 0) {
                        if (icon.svg) {
                            $overflowIcon.html(`<svg title="${icon.name || "Task Icon"}"><use href="${icon.svg}"></use></svg>`);
                        } else {
                            $overflowIcon.html(`<img src="${icon.img}" title="${icon.name || "Task Icon"}" alt="${icon.name || "Task Icon"}" />`);
                        }
                    }
                });

                if (typeof icon.contextMenu === "function") {
                    $taskIconDiv.on("contextmenu", function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        icon.contextMenu(event);
                    });
                }

                $menu.append($taskIconDiv);
            });

            app.dev.log("Overflow menu updated", "Taskbar");
        },

        /**
         * Reconciles the `.tasks` container with the current icon list instead of tearing
         * it down and rebuilding from scratch. Called by `overflow.handle()` — first without
         * a limit (to measure widths), then again with a limit once overflow count is known.
         * Icons are skipped when `icon.hidden`, when the backing program does not exist,
         * or when the program has both `taskbar` and `taskbarDisplay` set to false.
         *
         * Existing DOM nodes for icons that stay visible are kept in place (only their status
         * classes are refreshed and, if needed, their position in the DOM) rather than being
         * replaced — recreating them every call destroyed and recreated their `.after` glow
         * dot, which restarted its `fadein` CSS animation on every resize tick and produced a
         * visible yellow-circle blink under running icons.
         * @param {number} [limit] - Maximum number of icons to render. Omit for all.
         */
        createTaskbarIcons: function (limit) {
            if (!this.config?.options?.id) {
                app.dev.log('Taskbar container ID not set');
                return;
            }

            let taskIcons = app.desktop.taskbar.config.taskIcons;
            const container = document.querySelector(`#${this.config.options.id} .tasks`);

            if (!Array.isArray(taskIcons)) {
                app.dev.error("taskIcons should be an array");
                return;
            }

            if (app.desktop.taskbar.config.isUnbuilt == true) {
                return;
            }

            if (!container) {
                app.dev.error("The specified container was not found:", `${this.config.options.id} .tasks`);
                return;
            }

            const maxIcons = limit && limit <= taskIcons.length ? limit : taskIcons.length;

            const visibleIcons = [];

            for (let i = 0; i < maxIcons; i++) {
                const icon = taskIcons[i];

                if (icon.hidden) continue;

                if (icon.programid && !icon.isWindowOnly) {
                    const program = app.program.getInfo(icon.programid);
                    if (!program) continue;

                    const display = program.taskbarDisplay;
                    const defaultVisible = program.taskbar;

                    if (display === false && defaultVisible === false) {
                        continue;
                    }
                }

                if (typeof icon !== "object" || !icon.id || (!icon.svg && !icon.img)) {
                    app.dev.warn(`Invalid icon object at index ${i}`, icon);
                    continue;
                }

                visibleIcons.push(icon);
            }

            // Drop DOM nodes for icons that are no longer visible (overflowed, hidden, removed).
            const desiredIds = new Set(visibleIcons.map(icon => icon.id));
            Array.from(container.children).forEach(child => {
                if (!desiredIds.has(child.id)) child.remove();
            });

            // Add/refresh/reorder in one pass, touching existing nodes as little as possible.
            let previousNode = null;

            visibleIcons.forEach(icon => {
                let taskIconDiv = document.getElementById(icon.id);
                const isNew = !taskIconDiv || taskIconDiv.parentNode !== container;

                if (isNew) {
                    taskIconDiv = document.createElement("div");
                    taskIconDiv.id = icon.id;

                    taskIconDiv.innerHTML = icon.svg
                        ? `<svg title="${icon.name || "Task Icon"}"><use href="${icon.svg}"></use></svg>`
                        : `<img src="${icon.img}" title="${icon.name || "Task Icon"}" alt="${icon.name || "Task Icon"}" />`;

                    if (typeof icon.callback === "function") {
                        taskIconDiv.addEventListener("click", icon.callback);
                    }

                    if (typeof icon.contextMenu === "function") {
                        taskIconDiv.addEventListener("contextmenu", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            icon.contextMenu(event);
                        });
                    }

                    taskIconDiv.appendChild(this.setProgramStatusAnimation(icon));

                    app.dev.log(`Added icon: ${icon.id}`, "Taskbar");
                }

                taskIconDiv.className = icon.class || "";
                taskIconDiv.classList.add("ui-sortable-handle");

                this.setProgramStatus(icon.programid, taskIconDiv);

                let $win = $(".pid-" + icon.programid);
                if ($win.length) {
                    taskIconDiv.classList.add("runstate");
                }

                const expectedNext = previousNode ? previousNode.nextSibling : container.firstChild;
                if (expectedNext !== taskIconDiv) {
                    container.insertBefore(taskIconDiv, expectedNext);
                }

                previousNode = taskIconDiv;
            });
        },

        /**
         * Applies the correct CSS state class (runstate / success / fail / abort) to an
         * icon element based on the program's current status from `app.program.getStatus`.
         * @param {string}          pid     - Program ID.
         * @param {HTMLElement|jQuery} element - The icon element to update.
         */
        setProgramStatus: function (pid, element) {
            if (!pid || !element) return;

            const el = element instanceof jQuery ? element[0] : element;

            el.classList.remove("runstate", "success", "fail", "abort");

            if (pid === "sandstormscomponents") {
                const windowExists = $(`.pid-${pid}`).length > 0;
                if (windowExists) {
                    el.classList.add("runstate");
                }
                return;
            }

            const status = app.program.getStatus(pid);
            if (!status) {
                if ($(`.pid-${pid}`).length > 0) el.classList.add("runstate");
                return;
            }

            switch (status) {
                case "running":
                    el.classList.add("runstate");
                    break;
                case "success":
                    el.classList.add("success");
                    break;
                case "fail":
                    el.classList.add("fail");
                    break;
                case "abort":
                    el.classList.add("abort");
                    break;
            }
        },

        /**
         * Creates the `.after` glow div that appears beneath a task icon to indicate
         * running state. Uses `icon.afterStyle` if provided, otherwise derives colours
         * from `icon.taskIconColors`.
         * @param {Object} icon - Icon data object from `config.taskIcons`.
         * @returns {HTMLElement} The `.after` div element (not yet attached to DOM).
         */
        setProgramStatusAnimation: function (icon) {
            if (!icon || typeof icon !== "object") {
                app.dev.warn("createProgramStatusAnimation: invalid icon data");
                return document.createElement("div");
            }

            const afterDiv = document.createElement("div");
            afterDiv.className = "after";

            if (icon.afterStyle) {
                afterDiv.setAttribute("style", icon.afterStyle);
                return afterDiv;
            }

            if (Array.isArray(icon.taskIconColors)) {
                const color1 = icon.taskIconColors[0] || "#ffc108";
                const color2 = icon.taskIconColors[1] || "#ffb300";
                afterDiv.style.background = `radial-gradient(circle, ${color1} 0%, ${color2} 100%)`;
                afterDiv.dataset.customColor = "1";
            } else {
                afterDiv.style.background = "var(--background-radial)";
            }

            if (icon.taskIconTaskAnimation) {
                afterDiv.style.animation = icon.taskIconTaskAnimation;
            }

            return afterDiv;
        },

        /**
         * Fades out a task icon and then removes it from `config.taskIcons`.
         * @param {string} taskId              - Base program / task ID.
         * @param {string} [fadeClass="fade-out"] - CSS animation class to apply.
         * @returns {Promise<void>}
         */
        fadeOutIcon: async function (taskId, fadeClass = "fade-out") {
            const element = $(`#pid-${taskId}-task`);

            await app.ui.animation(element, fadeClass);

            app.desktop.taskbar.removeTaskIcon(taskId);
        },

    });

})((window.app = window.app || {}));
