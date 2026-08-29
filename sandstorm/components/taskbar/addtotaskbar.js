/**
 * @file taskbar/addtotaskbar.js
 * @description Creates/registers pinned or window-only task icons: the
 * click (focus/minimise/launch, or show a window-picker menu when a program
 * has multiple open windows) and right-click (pin/unpin, start, close-all)
 * behavior.
 *
 * Registers `app.desktop.taskbar.addToTaskbar`/`addProgramsToTaskbar` — same
 * IIFE-extends convention as the other taskbar/*.js sibling modules. Loaded
 * via `taskbar/index.js`'s side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/addtotaskbar
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Creates a task icon for an opening program window and triggers overflow recalculation.
         * Handles both program-backed windows and window-only (no base program) entries.
         * @param {Object|null} program - Program info object from `app.program.getInfo`, or null for window-only.
         * @param {string}      id      - Program / task ID.
         * @param {Object}      [data]  - Fallback icon data when `program` is null
         *                               (`data.icontype`, `data.taskbarIcon`, `data.title`).
         */
        addToTaskbar: function (program, id, data) {
            let color1 = "#ffc108";
            let color2 = "#ffb300";
            let animation = "";

            if (program && program.taskIconColors) {
                color1 = program.taskIconColors[0];
                color2 = program.taskIconColors[1];
            }

            if (program && program.taskIconTaskAnimation) {
                animation = program.taskIconTaskAnimation;
            }

            const callback = function () {
                const numWindows = $(`.pid-${id}`).length;
                const taskbarIcon = $(`#pid-${id}-task`);

                if (numWindows > 1) {
                    app.desktop.taskbar.menu.collectMenuData(id);

                    const menuElement = document.createElement('div');
                    menuElement.className = 'contextMenu show';
                    menuElement.style.position = 'absolute';
                    menuElement.style.zIndex = 10000;

                    app.desktop.taskbar.menu.build(menuElement);

                } else if (numWindows === 1) {
                    let windowElement;

                    if (program && program.windows && program.windows[0]) {
                        windowElement = $(`#${program.windows[0].id}-win`);
                    } else {
                        windowElement = $(`.pid-${id}:first`);
                    }

                    if (windowElement.length > 0 && windowElement.css('display') !== "none") {
                        const windowId = windowElement.attr('id').replace('-win', '');
                        app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, id);
                        taskbarIcon.addClass('hidstate');
                    } else if (windowElement.length > 0) {
                        const windowId = windowElement.attr('id').replace('-win', '');
                        app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, id);
                        taskbarIcon.addClass('runstate');
                    }
                } else if (numWindows === 0) {
                    if (program) {
                        app.program.open(id);
                        taskbarIcon.addClass('runstate');
                        app.program.running(id);
                    }
                }
            };

            const contextMenu = function (e) {
                e.preventDefault();
                $(".contextMenu").remove();
                const numWindows = $(`.pid-${id}`).length;

                if (numWindows >= 1) {
                    const menudata = [];

                    if (program) {
                        const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(id);
                        if (Object.keys(dockToOrFromTaskbar).length !== 0) {
                            menudata.push(dockToOrFromTaskbar);
                        }

                        const startProgram = app.desktop.taskbar.menu.getStartProgramData(id);
                        if (Object.keys(startProgram).length !== 0) {
                            menudata.push(startProgram);
                        }
                    }

                    app.desktop.taskbar.menu.collectMenuData(id, menudata);

                    const menuElement = document.createElement('div');
                    menuElement.className = 'contextMenu show';
                    menuElement.style.position = 'absolute';
                    menuElement.style.zIndex = 10000;

                    app.desktop.taskbar.menu.build(menuElement);

                } else if (numWindows === 0 && program) {
                    const menudata = [];
                    const startProgram = app.desktop.taskbar.menu.getStartProgramData(id);
                    if (Object.keys(startProgram).length !== 0) {
                        menudata.push(startProgram);
                    }

                    const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(id);
                    if (Object.keys(dockToOrFromTaskbar).length !== 0) {
                        menudata.push(dockToOrFromTaskbar);
                    }

                    app.desktop.taskbar.menu.makeMenuData(id, menudata);

                    const menuElement = document.createElement('div');
                    menuElement.className = 'contextMenu show';
                    menuElement.style.position = 'absolute';
                    menuElement.style.zIndex = 10000;

                    app.desktop.taskbar.menu.build(menuElement);
                }
            };

            let svgSource = null;
            let imgSource = null;
            let iconName = "";

            if (program) {
                svgSource = program.icontype === "svg" ? program.icon : null;
                imgSource = program.icontype !== "svg" ? program.icon : null;
                iconName = program.name;
            } else if (data) {
                svgSource = data.icontype === "svg" ? data.taskbarIcon : null;
                imgSource = data.icontype !== "svg" ? data.taskbarIcon : null;
                iconName = data.title || id;
            }

            const afterStyle = (program && program.taskIconColors)
                ? `background: radial-gradient(circle, ${color1} 0%, ${color2} 100%);${animation}`
                : `background: var(--background-radial);${animation}`;

            const iconData = {
                id: `pid-${id}-task`,
                programid: id,
                svg: svgSource,
                img: imgSource,
                class: 'blockicon',
                name: iconName,
                callback: callback,
                contextMenu: contextMenu,
                taskIconColors: (program && program.taskIconColors) || null,
                taskIconTaskAnimation: (program && program.taskIconTaskAnimation) || animation,
                afterStyle: afterStyle,
                isWindowOnly: !program
            };

            this.setTaskIcon(iconData);
            app.desktop.taskbar.overflow.handle();

            $(`#pid-${id}-task`).addClass("runstate");
        },

        /**
         * Iterates all registered programs and registers those with `program.taskbar !== false`
         * (or with existing open windows) into `config.taskIcons` via `setTaskIcon`.
         * Called once by `load.js` after all programs have been loaded.
         */
        addProgramsToTaskbar: function () {
            for (const id in app.program.getAll()) {
                const program = app.program.getInfo(id);
                const windows = program.windows || [];

                if (program.taskbar === false && windows.length === 0) {
                    continue;
                }

                let color1 = "#ffc108";
                let color2 = "#ffb300";
                let animation = "";

                if (program.taskIconColors) {
                    color1 = program.taskIconColors[0];
                    color2 = program.taskIconColors[1];
                }

                if (program.taskIconTaskAnimation) {
                    animation = program.taskIconTaskAnimation;
                }

                const data = {
                    id: `pid-${id}-task`,
                    programid: id,
                    svg: program.icontype === "svg" ? program.icon : null,
                    img: program.icontype !== "svg" ? program.icon : null,
                    class: 'blockicon',
                    name: program.name,
                    taskIconColors: program.taskIconColors || null,
                    taskIconTaskAnimation: program.taskIconTaskAnimation || animation,
                    callback: function () {
                        const numWindows = $(`.pid-${id}`).length;
                        const taskbarIcon = $(`#pid-${id}-task`);

                        if (numWindows > 1) {
                            app.desktop.taskbar.menu.collectMenuData(id);

                            const menuElement = document.createElement('div');
                            menuElement.className = 'contextMenu show';
                            menuElement.style.position = 'absolute';
                            menuElement.style.zIndex = 10000;

                            app.desktop.taskbar.menu.build(menuElement);

                        } else if (numWindows === 1) {
                            const windowElement = $(`#${program.windows[0].id}-win`);

                            if (windowElement.css('display') !== "none") {
                                app.desktop.taskbar.functions.animateWindowToTaskbar(program.windows[0].id, id);
                                taskbarIcon.addClass('hidstate');
                            } else {
                                app.desktop.taskbar.functions.animateTaskbarToWindow(program.windows[0].id, id);
                                taskbarIcon.addClass('runstate');
                            }
                        } else if (numWindows === 0) {
                            app.program.open(id);
                            taskbarIcon.addClass('runstate');
                            app.program.running(id);
                        }
                    },
                    contextMenu: function (e) {
                        e.preventDefault();
                        $(".contextMenu").remove();
                        const numWindows = $(`.pid-${id}`).length;

                        if (numWindows >= 1) {
                            const menudata = [];
                            const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(id);
                            if (Object.keys(dockToOrFromTaskbar).length !== 0) {
                                menudata.push(dockToOrFromTaskbar);
                            }

                            const startProgram = app.desktop.taskbar.menu.getStartProgramData(id);
                            if (Object.keys(startProgram).length !== 0) {
                                menudata.push(startProgram);
                            }

                            app.desktop.taskbar.menu.collectMenuData(id, menudata);

                            const menuElement = document.createElement('div');
                            menuElement.className = 'contextMenu show';
                            menuElement.style.position = 'absolute';
                            menuElement.style.zIndex = 10000;

                            app.desktop.taskbar.menu.build(menuElement);

                        } else if (numWindows === 0) {
                            const menudata = [];
                            const startProgram = app.desktop.taskbar.menu.getStartProgramData(id);
                            if (Object.keys(startProgram).length !== 0) {
                                menudata.push(startProgram);
                            }

                            const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(id);
                            if (Object.keys(dockToOrFromTaskbar).length !== 0) {
                                menudata.push(dockToOrFromTaskbar);
                            }

                            app.desktop.taskbar.menu.makeMenuData(id, menudata);

                            const menuElement = document.createElement('div');
                            menuElement.className = 'contextMenu show';
                            menuElement.style.position = 'absolute';
                            menuElement.style.zIndex = 10000;

                            app.desktop.taskbar.menu.build(menuElement);
                        }
                    }
                };

                app.desktop.taskbar.setTaskIcon(data);
            }
        },

    });

})((window.app = window.app || {}));
