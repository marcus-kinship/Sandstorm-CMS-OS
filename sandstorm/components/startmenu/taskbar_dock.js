/**
 * @file startmenu/taskbar_dock.js
 * @description Pins/updates a program's taskbar icon from the start menu
 * ("Dock to taskbar"), wiring its left-click (focus/minimise/launch) and
 * right-click (context menu) behavior.
 *
 * Exported function is plain (non-arrow), called as a method of
 * `app.desktop.startmenu` (see startmenu/index.js for the assembly).
 * Split out of the original monolithic startmenu.js — moved verbatim, no
 * logic changes.
 *
 * @module components/startmenu/taskbar_dock
 */

/**
 * Pins a program to the taskbar or updates an existing icon's click/right-click handlers.
 * - If the taskbar icon does not yet exist it is created and appended to `#taskbar .left .tasks`.
 * - Left-click: focus/minimise the open window, or launch if no window is open.
 * - Right-click: context menu with dock, start and close-all options.
 *
 * @function dockToTaskbar
 * @memberof app.desktop.startmenu
 * @param {Object} program - Program info object retrieved from `app.program.getInfo()`.
 * @param {string} id      - Program ID (e.g. `"calc"`).
 */
export function dockToTaskbar(program, id) {
    // Find the taskbar icon by its ID
    let d = $(`#pid-${id}-task`);

    // right-click

    let contextMenu = function (e) {
        e.preventDefault();

        $(".contextMenu").remove();
        const numWindows = document.querySelectorAll(`.pid-${id}`).length;

        if (numWindows >= 1) {

            const menudata = [];

            // Add option to remove the program from the taskbar
            menudata.push({
                title: _("Remove this from the taskbar"),
                id: null,
                callback: function () {
                    // Update the program's taskbar state
                    program.taskbar = false;

                    // Remove the taskbar icon from the UI (assuming a function or code to handle this)
                    const taskbarIcon = $(`#pid-${id}-task`)[0];
                    if (taskbarIcon) {
                        taskbarIcon.remove();  // Remove the icon from the taskbar
                    }
                }
            });

            // Add option to start the program
            menudata.push({
                title: printf(_("Start %s"), program.name),  // More descriptive title
                id: null,
                callback: function () {
                    // Launch the program (lazy-loads its module on first open)
                    app.program.open(id);

                    // Update taskbar icon state to running
                    const taskbarIcon = $(`#pid-${id}-task`)[0];
                    if (taskbarIcon) {
                        taskbarIcon.classList.add('runstate');
                    }
                }
            });

            // Collect additional menu data and show the context menu
            app.desktop.taskbar.menu.collectMenuData(program, id, menudata);

            const menuElement = document.createElement('div');
            menuElement.className = 'contextMenu show';
            menuElement.style.position = 'absolute';
            menuElement.style.zIndex = 10000;

            app.desktop.taskbar.menu.build(menuElement);

        } else if (numWindows === 0) {
            const menudata = [];

            // Add "start program" option
            menudata.push({
                title: printf(_("Start %s"), program.name),  // More descriptive title
                id: null,
                callback: function () {
                    // Launch the program (lazy-loads its module on first open)
                    app.program.open(id);

                    // Update taskbar icon state to running
                    const taskbarIcon = $(`#pid-${id}-task`)[0];
                    if (taskbarIcon) {
                        taskbarIcon.classList.add('runstate');
                    }
                }
            });

            // Add "Remove this from the taskbar" option
            menudata.push({
                title: _("Remove this from the taskbar"),
                id: null,
                callback: function () {
                    // Set taskbar flag to false
                    program.taskbar = false;

                    // Remove the taskbar icon from the UI
                    const taskbarIcon = $(`#pid-${id}-task`)[0];
                    if (taskbarIcon) {
                        taskbarIcon.remove();
                    }
                }
            });

            // Show context menu if multiple windows are open
            app.desktop.taskbar.menu.makeMenuData(id, menudata);

            const menuElement = document.createElement('div');
            menuElement.className = 'contextMenu show';
            menuElement.style.position = 'absolute';
            menuElement.style.zIndex = 10000;

            app.desktop.taskbar.menu.build(menuElement);
        }
    };

    // left-click

    let callback = function () {  // Define callback function for clicking the icon
        const numWindows = document.querySelectorAll(`.pid-${id}`).length;
        const taskbarIcon = $(`#pid-${id}-task`);

        if (numWindows > 1) {
            // Show context menu if multiple windows are open
            app.desktop.taskbar.menu.collectMenuData(program, id);

            const menuElement = document.createElement('div');
            menuElement.className = 'contextMenu show';
            menuElement.style.position = 'absolute';
            menuElement.style.zIndex = 10000;

            app.desktop.taskbar.menu.build(menuElement);

        } else if (numWindows === 1) {

            const windowElement = $(`#${program.windows[0].id}-win`);

            if (windowElement.css('display') !== "none") {

                app.ui.animateWindowToTaskbar(program.windows[0].id, id);
                // Update taskbar icon state to hidden
                taskbarIcon.addClass('hidstate');
            } else {

                app.ui.animateTaskbarToWindow(program.windows[0].id, id);
                // Update taskbar icon state to running
                taskbarIcon.addClass('runstate');
            }
        } else if (numWindows === 0) {
            // No windows are open, start the program (lazy-loads its module on first open)
            app.program.open(id);

            // Update taskbar icon state to running
            taskbarIcon.addClass('runstate');
        }
    };

    // Check if the taskbar icon exists
    if (d.length === 0) {
        // add program

        const taskbarIcon = document.createElement("div");
        taskbarIcon.id = `pid-${id}-task`;
        taskbarIcon.className = "blockicon";

        // Check if the icon type is SVG
        if (program.icontype === "svg") {  // Use `===` for comparison
            taskbarIcon.innerHTML = `<svg title="${program.name}"><use href="${program.icon}"></use></svg>`;
        } else if (program.icontype !== "svg") {  // Use `!==` for non-equality
            taskbarIcon.innerHTML = `<img src="${program.icon}" title="${program.name}" />`;
        }

        // Add click event listener for the task icon
        taskbarIcon.addEventListener("click", callback);

        taskbarIcon.addEventListener("contextmenu", (event) => {
            contextMenu(event);
        });

        // Append the taskbar icon to the taskbar
        $("#taskbar .left .tasks").append(taskbarIcon);

        // Apply draggable functionality to .tasks
        $("#taskbar .left .tasks").sortable({ axis: "x" });
    } else {
        // remove right-click and left-click och add new right-click and left-click

        // Remove existing left-click and right-click event listeners
        d.off('click');  // Remove left-click events
        d.off('contextmenu');  // Remove right-click events

        // Add new left-click event listener
        d.on('click', function (e) {
            callback();
        });

        // Add new right-click (context menu) event listener
        d.on('contextmenu', function (e) {
            contextMenu(e);
        });
    }
}
