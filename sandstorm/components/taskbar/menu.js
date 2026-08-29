/**
 * @file taskbar/menu.js
 * @description Right-click context-menu builder for taskbar task icons.
 *
 * Registers `app.desktop.taskbar.menu` — assembles and renders context menus
 * for programs pinned to the taskbar.
 *
 * Responsibilities:
 * - `getStartProgramData` / `getStartProgramToTaskbarData` — "Start …" items.
 * - `getDockToOrFromTaskbarData` — "Pin / Unpin" toggle item.
 * - `getCloseAllWindowsData` — "Close window / Close all windows" item.
 * - `makeMenuData` / `singleMenuData` / `collectMenuData` — populate `menudata`.
 * - `build(parentElement)` — render `menudata` and position the menu DOM node.
 * - `getPosition(menuElement)` — calculate viewport-clamped absolute coordinates.
 *
 * @module components/taskbar/menu
 */
(function (app) {

    app.desktop.taskbar.menu = {
        /** @type {Array<{title: string, id: string|null, callback: Function, icon?: string}>} Accumulated menu item descriptors built before calling `build`. */
        menudata: [],
        /** @type {string} DOM id of the task icon that owns the currently open menu. */
        taskIconsId: "",

        /**
         * Returns a menu item that launches the given program.
         * Returns an empty object when the program is not registered.
         *
         * @param {string} [id=""] - Program id.
         * @returns {{ title: string, id: null, callback: Function } | {}}
         */
        getStartProgramData: function (id = "") {
            const program = app.program.getInfo(id);

            if (!program) {
                return {};
            }

            const data = {
                title: `Start ${program.name}`,
                id: null,
                callback: function () {
                    app.program.open(id);

                    const taskbarIcon = $(`#pid-${id}-task`);
                    if (taskbarIcon.length) {
                        taskbarIcon.addClass('runstate');
                    }
                }
            };

            return data;
        },

        /**
         * Returns a menu item that toggles whether the program is pinned to the taskbar.
         * Label adapts based on the current `program.taskbar` flag.
         *
         * @param {string} [id=""] - Program id.
         * @returns {{ title: string, shortcut: string, callback: Function, alt: string } | {}}
         */
        getDockToOrFromTaskbarData: function (id = "") {
            const program = app.program.getInfo(id);

            if (!program) {
                return {};
            }

            let text = "";
            if (program.taskbar === true) {
                text = _("Remove this from the taskbar");
            } else {
                text = _("Add this to the taskbar");
            }

            const data = {
                shortcut: "",
                title: text,
                callback: () => {
                    if (program.taskbar === true) {
                        program.taskbar = false;
                        const taskIconId = $(`#pid-${id}-task`);

                        if (taskIconId.length == 0) {
                            app.desktop.startmenu.addToTaskbar(program, id);
                        } else {
                            if (!taskIconId.hasClass("runstate") && !taskIconId.hasClass("hidstate")) {
                                taskIconId.remove();
                            }
                        }
                    } else {
                        program.taskbar = true;
                        app.desktop.startmenu.dockToTaskbar(program, id);
                    }
                },
                alt: "",
            };

            return data;
        },

        /**
         * Returns a menu item that closes all open windows for the given program.
         * Returns an empty object when no windows are open or `id` is falsy.
         * The label becomes "Close window" when only one window is open.
         *
         * @param {string} [id=""] - Program id.
         * @returns {{ title: string, id: string, callback: Function } | {}}
         */
        getCloseAllWindowsData: function (id = "") {
            const windowElement = $(".pid-" + id + ":not(.single)");

            if (!id || windowElement.length === 0) {
                return {};
            }

            let text = _("Close all windows");
            if (windowElement.length === 1) {
                text = _("Close window");
            }

            const data = {
                title: text,
                id: id,
                closeAll: true,
                callback: async function () {
                    const programId = id;

                    await app.ui.windows.functions.closeProgramWindows(programId, {
                        wait: true,
                        parallel: true,
                        excludeWindowId: null
                    });

                    console.log(`All windows have been closed for process ${programId}.`);
                }
            };

            return data;
        },

        /**
         * Returns a menu item that starts the program and ensures it appears in the taskbar.
         * Returns an empty object when the program or its main entry point is not found.
         *
         * @param {string} id - Program id.
         * @returns {{ title: string, shortcut: string, callback: Function, alt: string } | {}}
         */
        getStartProgramToTaskbarData: function (id) {
            const program = app.program.getInfo(id);

            if (!program) {
                return {};
            }

            const data = {
                shortcut: "",
                title: printf(_("Start %s"), program.name),
                callback: () => {
                    app.program.open(id);

                    if ($(`#pid-${id}-task`).length === 0) {
                        app.desktop.taskbar.addToTaskbar(program, id);
                    }

                    $(`#pid-${id}-task`).addClass("runstate");
                },
                alt: "",
            };

            return data;
        },

        /**
         * Sets `taskIconsId` to `id` and replaces `menudata` when a non-empty item list is provided.
         * Used to inject a custom item list before calling `build`.
         *
         * @param {string} id - Task icon DOM id.
         * @param {Array} [item=[]] - Menu item descriptors to assign to `menudata`.
         */
        makeMenuData: function (id, item = []) {
            this.taskIconsId = id;
            if (item.length > 0) {
                this.menudata = item;
            }
        },

        /**
         * Builds `menudata` for a single-window program.
         * Always prepends a show/hide entry for the window and appends a close-all entry when applicable.
         *
         * @param {Object} program - Program descriptor from `app.program`.
         * @param {string} id - Task icon DOM id (also used to find the window by `#id-win`).
         * @param {Array} [item=[]] - Additional menu items inserted between the window entry and close-all.
         */
        singleMenuData: function (program, id, item = []) {
            const menudata = [];
            this.taskIconsId = id;

            const windowElement = $(`#${id}-win`);

            const title = windowElement.find('.window-list .title').text();
            const windowId = windowElement.attr('id').replace('-win', '');

            menudata.push({
                title: title,
                id: windowId,
                callback: function () {
                    const currentWindowElement = $("#" + windowId + "-win");

                    if (currentWindowElement.css('display') !== "none") {
                        app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, id);
                        $(`#pid-${id}-task`)[0].className = 'blockicon hidstate';
                    } else {
                        app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, id);
                        app.setActiveWindow(windowId);
                        $(`#pid-${id}-task`)[0].className = 'blockicon runstate';
                    }
                }
            });

            if (item.length > 0) {
                item.forEach(function (menuItem) {
                    menudata.push(menuItem);
                });
            }

            const closeAllWindowsData = this.getCloseAllWindowsData(id);

            if (Object.keys(closeAllWindowsData).length !== 0) {
                menudata.push(closeAllWindowsData);
            }

            this.menudata = menudata;
        },

        /**
         * Builds `menudata` for a multi-window program.
         * Creates one show/hide entry per open window plus optional extra items and a close-all entry.
         * When `get` is true, returns the array instead of storing it in `this.menudata`.
         *
         * @param {string} id - Program id (used to find `.pid-{id}` window elements).
         * @param {Array} [item=[]] - Additional menu items appended after the window list.
         * @param {boolean} [get=false] - When true, returns the array instead of assigning `menudata`.
         * @returns {Array|undefined}
         */
        collectMenuData: function (id, item = [], get = false) {
            const menudata = [];
            this.taskIconsId = id;

            $(".pid-" + id + ":not(.single)").each(function () {
                const windowElement = $(this);
                const windowId = windowElement.attr('id').replace('-win', '');
                const title = windowElement.find('.window-list .title').text();

                menudata.push({
                    title: title,
                    id: windowId,
                    callback: function () {
                        const currentWindowElement = $("#" + windowId + "-win");

                        if (currentWindowElement.css('display') !== "none") {
                            app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, id);
                            $(`#pid-${id}-task`)[0].className = 'blockicon hidstate';
                        } else {
                            app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, id);
                            app.setActiveWindow(windowId);
                            $(`#pid-${id}-task`)[0].className = 'blockicon runstate';
                        }
                    }
                });
            });

            if (item.length > 0) {
                item.forEach(function (menuItem) {
                    menudata.push(menuItem);
                });
            }

            const closeAllWindowsData = this.getCloseAllWindowsData(id);

            if (Object.keys(closeAllWindowsData).length !== 0) {
                menudata.push(closeAllWindowsData);
            }

            if (!get) {
                this.menudata = menudata;
            } else {
                return menudata;
            }
        },

        /**
         * Positions a menu element above the task icon identified by `this.taskIconsId`.
         * Clamps to viewport bounds so the menu never overflows the screen edges.
         *
         * @param {HTMLElement} menuElement - The menu DOM node to position.
         */
        getPosition: function (menuElement) {
            const id = this.taskIconsId;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const rect = $(`#pid-${id}-task`)[0].getBoundingClientRect();

            const menuWidth = menuElement.offsetWidth;
            const menuHeight = menuElement.offsetHeight;

            let direction = "up,center";
            let [primaryDirection, alignment] = direction.split(',');

            let x = rect.left;
            let y = rect.top;

            if (primaryDirection === 'up') {
                y -= menuHeight;
            } else if (primaryDirection === 'down') {
                y += rect.height;
            }

            if (alignment === 'left') {
                x = rect.left;
            } else if (alignment === 'right') {
                x = rect.right - menuWidth;
            } else if (alignment === 'center') {
                x = rect.left + (rect.width / 2) - (menuWidth / 2);
            }

            if (x + menuWidth > windowWidth) {
                x = windowWidth - menuWidth - 10;
            }
            if (x < 0) {
                x = 10;
            }
            if (y + menuHeight > windowHeight) {
                y = windowHeight - menuHeight - 10;
            }
            if (y < 0) {
                y = 10;
            }

            menuElement.style.left = `${x}px`;
            menuElement.style.top = `${y}px`;
        },

        /**
         * Renders each entry in `this.menudata` as a row inside `parentElement`, then appends
         * the element to `document.body` and positions it via `getPosition`.
         * Rows with a non-null `id` get an inline close button that closes the associated window.
         *
         * @param {HTMLElement} parentElement - Container element to populate and append.
         */
        build: function (parentElement) {
            this.menudata.forEach(item => {
                const menuItemElement = document.createElement('div');
                menuItemElement.style.justifyContent = 'space-between';
                menuItemElement.className = 'ctm-row';

                const icon = document.createElement('span');
                icon.innerHTML = item.icon || '';
                icon.style.marginRight = '10px';

                const title = document.createElement('span');
                title.textContent = item.title;

                menuItemElement.addEventListener('click', () => {
                    item.callback();
                    parentElement.remove();
                });

                const line = document.createElement('div');
                line.className = 'ctm-title';
                line.appendChild(icon);
                line.appendChild(title);

                menuItemElement.appendChild(line);

                if (item.id != null || item.id != undefined) {
                    const close = document.createElement('div');
                    close.innerHTML = `<svg><use href="#ic-bts-close"></use></svg>`;
                    close.className = "close";
                    close.title = _("Close");
                    close.addEventListener("click", async function (event) {
                        event.stopPropagation();

                        if (item.closeAll) {

                            await item.callback();
                            parentElement.remove();
                            return;
                        }

                        const windowId = item.id;
                        const programId = windowId.split("-")[0];
                        const taskId = windowId;

                        await app.ui.windows.functions.closeWindow(windowId, taskId, programId, false, {
                            wait: true
                        });

                        menuItemElement.remove();
                    });

                    menuItemElement.appendChild(close);
                }

                parentElement.appendChild(menuItemElement);
            });

            document.body.appendChild(parentElement);
            this.getPosition(parentElement);

            setTimeout(() => {
                document.addEventListener('click', function onOutsideClick(event) {
                    if (!document.body.contains(parentElement)) return;
                    if (parentElement.contains(event.target)) return;
                    parentElement.remove();
                }, { capture: true, once: true });
            }, 0);
        }
    };

})((window.app = window.app || {}));
