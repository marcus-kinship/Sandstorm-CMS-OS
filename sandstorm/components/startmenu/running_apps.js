/**
 * @file startmenu/running_apps.js
 * @description Start-menu "Apps running" panel: add/remove entries, show
 * per-app details, and the "hide all windows" toggle.
 *
 * Exported functions are plain (non-arrow), called as methods of
 * `app.desktop.startmenu` (see startmenu/index.js for the assembly).
 * Split out of the original monolithic startmenu.js — moved verbatim, no
 * logic changes.
 *
 * @module components/startmenu/running_apps
 */
import { getHiddenWindowIds, setHiddenWindowIds } from './state.js';

/**
* Removes an app from the running apps list if no windows with the given program ID exist.
*
* This function checks if any windows with the specified program ID (as part of their class list)
* are currently active. If none are found, it removes the corresponding app entry from the
* `.runapplist` element, which represents the list of running apps.
*
* @param {string} programId - The unique identifier of the program to check and remove.
*

* // Calling the function:
* removeFromRunningApps("formbuilder");
*/
export function removeFromRunningApps(programId) {
    // Cache jQuery selectors for efficiency
    const $windows = $(`.window.pid-${programId}`);
    const $runAppListItem = $(`.runapplist > [data-id="${programId}"]`);
    const $taskbarItem = $(`#pid-${programId}-task`);

    app.dev.log(`Number of windows for programId "${programId}": ${$windows.length}`, "Startmenu");

    // If no windows remain, remove the app from the running apps list
    if ($windows.length === 0 && $runAppListItem.length) {
        $runAppListItem.remove();
        app.dev.log(`Removed app with programId "${programId}" from .runapplist.`, "Startmenu");
    }

    // If the running apps list is empty, clear the startmenu running apps section
    const $runAppList = $('.runapplist');
    if ($runAppList.children().length === 0) {
        $(".startmenu .appsrunning").html("");
        app.dev.log("Cleared .startmenu .appsrunning because .runapplist is empty.", "Startmenu");
    }

    // Update the overflow icon if the taskbar item exists in the overflow menu
    if ($windows.length === 0 && $taskbarItem.length && $("#tasksoverflow-menu").has($taskbarItem).length) {
        $(".overflow-icon").empty();

        // Clone the first icon from the overflow menu
        const $firstChildIcon = $("#tasksoverflow-menu > div:first-child").find("img, svg").first().clone();
        if ($firstChildIcon.length) {
            $(".overflow-icon").append($firstChildIcon);
            app.dev.log("Updated .overflow-icon with new icon from #tasksoverflow-menu.", "Startmenu");
        }
    }
}

/**
 * Adds a program to the running-apps panel in the start menu (or updates the list
 * if apps are already shown).  Safe to call before the panel DOM exists — returns early.
 *
 * @function addToRunningApps
 * @memberof app.desktop.startmenu
 * @param {string} programId - The registered program ID to display.
 */
export function addToRunningApps(programId) {
    // Guard: bail if the program isn't registered
    let programInfo = app.program.getInfo(programId);
    if (!programInfo) return;

    let runningIds = [...new Set(
        [...document.querySelectorAll('.window')]
            .flatMap(w => [...w.classList]
                .filter(c => c.startsWith('pid-'))
                .map(c => c.slice(4))
            )
            .filter(id => app.program.getInfo(id))
    )];

    if (!runningIds.includes(programId)) {
        runningIds.push(programId);
    }

    const $appsrunning = $(".startmenu .appsrunning");

    // If the DOM element doesn't exist yet the startmenu hasn't been built.
    if (!$appsrunning.length) return;

    if ($appsrunning.is(":empty")) {
        const html = `
    <div class="apprun-container">
        <div class="left-panel">
            <ul class="scroll runapplist">
                <li class="app-item selected" data-id="${programId}">
                    <div class="icon-placeholder">
                        ${programInfo.icontype === "svg"
                ? `<svg class="app-item-svg"><use href="${programInfo.icon}"></use></svg>`
                : `<img src="${programInfo.icon}" alt="${programInfo.name}" />`}
                    </div>
                    <div class="app-item-content">
                        <div>${programInfo.name}</div>
                        <div><svg class="app-item-svg"><use href="#ic-arrow-right"></use></svg></div>
                    </div>
                </li>
            </ul>
        </div>
        <div class="right-panel">
            <div class="app-details"></div>
        </div>
    </div>
`;
        $appsrunning.append(html);
        app.desktop.startmenu.showRunningApp(programId);
    } else {
        $(".runapplist").empty();

        runningIds.forEach(id => {
            const info = app.program.getInfo(id);
            if (!info) return; // skip windows whose program isn't registered

            const selected = id === programId;
            const itemHTML = `
        <li class="app-item ${selected ? "selected" : ""}" data-id="${id}">
            <div class="icon-placeholder">
                ${info.icontype === "svg"
                    ? `<svg class="app-item-svg"><use href="${info.icon}"></use></svg>`
                    : `<img src="${info.icon}" alt="${info.name}" />`}
            </div>
            <div class="app-item-content">
                <div>${info.name}</div>
                <div><svg class="app-item-svg"><use href="#ic-arrow-right"></use></svg></div>
            </div>
        </li>
    `;
            $(".runapplist").append(itemHTML);
        });

        app.desktop.startmenu.showRunningApp(programId);

        $(".runapplist .app-item").on("click", function () {
            const clickedId = $(this).data("id");
            app.desktop.startmenu.showRunningApp(clickedId);
        });
    }
}

/**
 * Displays information about a running application in the UI.
 *
 * This function updates the `.app-details` section with the details of the selected application,
 * including its icon, name, and description. It also highlights the selected application in
 * the `.runapplist` and adds interactive options for managing the application's windows and taskbar state.
 *
 * @param {string} programId - The unique identifier for the program to display.
 *
 * @returns {null|void} - Returns `null` if the application is not found or the program information is missing.
 *
 * @example
 * // Highlight and display details of the "calculator" application.
 * app.desktop.startmenu.showRunningApp("calc");
 *
 * @remarks
 * - This function assumes that the `app.program.getInfo()` method retrieves program details using the given `programId`.
 * - It modifies the `.app-details` container with the program's information and updates the `.runapplist` to mark the app as selected.
 * - If the `programId` is not found or invalid, a warning is logged via `app.dev.warn`.
 *
 * @throws {Error} - Throws no explicit errors, but logs warnings if the program ID or info is invalid.
 */

export function showRunningApp(programId) {

    const appInRunList = $(`.runapplist > [data-id="${programId}"]`);

    if (!appInRunList.length > 0) {
        return null;
    }

    const programInfo = app.program.getInfo(programId);

    if (!programInfo) {
        app.dev.warn(`Program info for ID "${programId}" not found.`, "Startmenu");
        return null;
    }

    let menudata = [];

    // Retrieve and add the "Dock to/From Taskbar" option to the menu
    const dockToOrFromTaskbar = app.desktop.taskbar.menu.getDockToOrFromTaskbarData(programId);
    // Only add the option if valid data is returned
    if (Object.keys(dockToOrFromTaskbar).length !== 0) {
        menudata.push(dockToOrFromTaskbar);
    }

    // Retrieve and add the "start program" option to the menu
    const startProgram = app.desktop.taskbar.menu.getStartProgramData(programId);
    // Only add the option if valid data is returned
    if (Object.keys(startProgram).length !== 0) {
        menudata.push(startProgram);
    }

    // Collect additional menu data for menu
    menudata = app.desktop.taskbar.menu.collectMenuData(programId, menudata, true);

    const action = document.createElement('ul');
    action.className = 'action';
    menudata.forEach(item => {
        const menuItemElement = document.createElement('li');
        menuItemElement.style.justifyContent = 'space-between';
        menuItemElement.className = 'actions-row';

        // Add icon (if available)
        const icon = document.createElement('span');
        icon.innerHTML = item.icon || ''; // Use provided icon or leave blank

        // Add title
        const title = document.createElement('span');
        title.textContent = item.title;

        // Add tooltip and bind the callback function
        menuItemElement.addEventListener('click', item.callback);
        const line = document.createElement('div');
        line.className = 'actions-title';
        line.appendChild(icon);
        line.appendChild(title);

        menuItemElement.appendChild(line);

        // Add alternative text (alt description)
        if (item.id != null || item.id != undefined) {
            const close = document.createElement('div');
            close.innerHTML = `<svg><use href="#ic-bts-close"></use></svg>`;
            close.className = "close";
            close.title = _("Close");
            close.addEventListener('click', function (event) {
                event.stopPropagation();
                const windowElement = $("#" + item.id + "-win"); // Stänger hela menyn

                app.ui.animation(windowElement.get(0));
                windowElement.remove();
                app.ui.windows.functions.removeResizeListener();

                let index = item.id.indexOf('-');
                let id = item.id.substring(0, index);

                const numWindows = $('.pid-' + id).length;
                if (numWindows > 0) {

                    if (id != "sandstormscomponents") {
                        let program = app.program.getInfo(id);
                        if (program.taskbar != true) {

                            if ($('.pid-' + id).hasClass("single")) {
                                id = item.id;
                            }

                            let taskSelector = `#pid-${id}-task`;
                            $(taskSelector).fadeOut(400, function () {
                                $(taskSelector).remove();
                                console.log("remove", id);

                            });
                        }
                    }
                }

                if (id != "sandstormscomponents") {

                    let index = item.id.indexOf('-');
                    let id = item.id.substring(0, index);
                    app.program.removeWindowInfo(item.id, id);

                }
                console.log(`Window '${item.title}' (ID: ${id}) has been closed.`);
            });

            menuItemElement.appendChild(close);
        }

        // Append the menu item to the parent element
        action.appendChild(menuItemElement);
    });

    // Update .app-details with the program information.
    $(".app-details").html(`
        <div class="icon-placeholder large">
            ${programInfo.icontype === "svg"
            ? `<svg><use href="${programInfo.icon}"></use></svg>`
            : `<img src="${programInfo.icon}" alt="${programInfo.name}" />`}
        </div>
        <div class="h2">${programInfo.name}</div>
        <div class="p">${programInfo.description || "No description available."}</div>
    `);

    $(".app-details").append(action);
    $(".runapplist .app-item").removeClass("selected");
    appInRunList.addClass("selected");

}
/**
 * Updates the display of running applications in the start menu.
 *
 * Removes the specified program from the running apps list and then
 * decides whether to hide or show the running apps section depending
 * on how many apps remain.
 *
 * @function updateRunningApps
 * @param {string} programId - The ID of the program to remove from the running apps list.
 * @returns {void}
 */
export function updateRunningApps(programId) {
    app.desktop.startmenu.removeFromRunningApps(programId);

    if (app.desktop.startmenu.countRunningApps() > 1) {
        app.desktop.startmenu.hideRunningApps();
    } else {
        app.desktop.startmenu.showLastRunningApp();
    }
}
/**
 * Clears the displayed program details and deselects all running applications.
 *
 * This function resets the `.app-details` section to be empty and removes the `selected`
 * class from all applications in the `.runapplist`. It ensures no program is highlighted or
 * displayed as active in the UI.
 *
 * @returns {void} - This function does not return a value.
 *
 * @example
 * // Hide details and deselect all applications in the running apps list.
 * app.desktop.startmenu.hideRunningApps();
 *
 *
 * @logs {Console} - Logs "All running apps deselected, details hidden." for debugging purposes.
 */
export function hideRunningApps() {

    // Clear the content of .app-details
    $(".app-details").html(``);

    // Remove the 'selected' class from all applications in .runapplist
    $(".runapplist .app-item").removeClass("selected");

    // Log the operation for debugging purposes
    app.dev.log("All running apps deselected, details hidden.");
}

/**
 * Marks the last launched program in the running apps list.
 * This function identifies the last launched program by selecting the last item in the .runapplist
 * and calls the showRunningApp function to display its details.
 *
 * @returns {void} - This function does not return a value.
 */
export function showLastRunningApp() {
    // Find the last launched program from the .runapplist
    const lastLaunchedProgram = $(".runapplist .app-item").last();

    if (lastLaunchedProgram.length > 0) {
        // Get the program ID from the last item
        const lastProgramId = lastLaunchedProgram.data("id");

        // Show the details of the last launched program
        app.desktop.startmenu.showRunningApp(lastProgramId);
    }
}

/**
 * Returns the number of running programs in the .runapplist.
 * This function counts the number of items with the class .app-item inside .runapplist.
 *
 * @returns {number} - The number of running programs.
 */
export function countRunningApps() {
    // Find and return the number of running programs in the .runapplist
    return $(".runapplist .app-item").length;
}

/**
 * Toggles between minimizing every open window to the taskbar and restoring
 * exactly the windows that toggle just minimized — windows the user had
 * already minimized manually beforehand are left alone either way.
 *
 * Reuses the same per-window animation/state calls the taskbar icon click
 * handler uses (`animateWindowToTaskbar` / `animateTaskbarToWindow`), and
 * resolves each window's own `taskId` via `app.store.get()` (set on the
 * window element by windowStart) rather than recomputing it, since single-
 * vs multi-instance programs derive it differently.
 *
 * @function toggleHideAllWindows
 * @memberof app.desktop.startmenu
 */
export function toggleHideAllWindows() {
    const btn = document.querySelector(".apps-hide-all-btn");

    if (getHiddenWindowIds().length > 0) {
        // ── Restore only the windows this toggle hid ──────────────────
        getHiddenWindowIds().forEach(({ windowId, taskId }) => {
            const $win = $(`#${windowId}-win`);
            if (!$win.length || !$win.hasClass("minimized")) return;
            app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, taskId);
            $(`#pid-${taskId}-task`).removeClass("hidstate").addClass("runstate");
        });
        setHiddenWindowIds([]);

        if (btn) {
            btn.classList.remove("active");
            btn.title = _("Hide all windows");
        }
        app.dev.log("Restored all windows hidden by the toggle.", "Startmenu");
    } else {
        // ── Minimize every currently visible window ───────────────────
        const toHide = [];
        document.querySelectorAll(".window:not(.minimized)").forEach((winEl) => {
            if ($(winEl).css("display") === "none") return;
            const windowobj = app.store.get(winEl);
            if (!windowobj || !windowobj.taskId) return;
            toHide.push({ windowId: windowobj.windowId, taskId: windowobj.taskId });
        });

        toHide.forEach(({ windowId, taskId }) => {
            app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, taskId);
            $(`#pid-${taskId}-task`).addClass("hidstate").removeClass("runstate");
        });
        setHiddenWindowIds(toHide);

        if (btn) {
            btn.classList.add("active");
            btn.title = _("Show all windows");
        }
        app.dev.log(`Hid ${toHide.length} window(s) via toggle.`, "Startmenu");
    }
}
