/**
 * @file window/lifecycle.js
 * @description Minimize/maximize/close family for the window-management
 * split (see window/index.js for the assembly). Split out of the original
 * monolithic window.js — moved verbatim, no logic changes.
 *
 * Dependency rule: imports from window/state.js only.
 *
 * `closeActiveWindow`/`closeThisWindow`/`close` call `this.closeWindow(...)`
 * — this still resolves correctly once index.js assembles all of these
 * exports into the same `app.ui.windows.functions` object, since `this` is
 * bound by the call site (`app.ui.windows.functions.xxx(...)`), not by
 * where the function was defined.
 *
 * @module components/ui/window/lifecycle
 */

import { _caretRAF, triggerEvent, clearEvents } from './state.js';
import { clearWindowFromAllZones } from './snap-zones.js';

/**
 * Actually performs a minimize (class toggle + taskbar sync + genie
 * animation into the taskbar icon) — factored out of the `minimize`
 * click-binder below so it can also be invoked programmatically (see
 * `minimizeNow`) without a real click. The click-bound path is
 * unaffected — it just calls this with `instant` left at its default
 * (`false`).
 * @private
 */
export function _doMinimize(windowId, taskId, { instant = false } = {}) {
    const winEl = $(`#${windowId}-win`);
    const eventId = winEl.data("eventId");

    clearWindowFromAllZones(windowId);

    // Update taskbar state
    $(`#pid-${taskId}-task`).addClass("hidstate").removeClass("runstate");

    // Update window classes
    winEl.removeClass("maximized normal").addClass("minimized");

    app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, taskId, { instant });

    // Update position of caret()
    _caretRAF();

    // Trigger minimize event if set
    if (eventId) {
        app.dev.log(`[UI Window] Triggering minimize event for ${eventId}`, "UI Window");
        app.ui.windows.trigger(eventId, "minimize", winEl[0], windowId);
    }

    // Retrieve the stored window object safely from WeakMap
    const storedWindowObj = app.store.get(winEl[0]);
    triggerEvent(taskId, "minimize", storedWindowObj);
}

/**
 * Core window close logic - shared by all close methods
 * @private
 */
export async function _performWindowClose(windowElement, programId, options = {}) {
    const { wait = true, triggerEvent: doTriggerEvent = true } = options;

    const windowId = windowElement.attr("id")?.replace("-win", "");
    if (!windowId) return null;

    clearWindowFromAllZones(windowId);

    const storedWindowObj = app.store.get(windowElement[0]);

    if (doTriggerEvent) {
        const eventId = windowElement.data("eventId");
        if (eventId) {
            app.dev.log(`Running close event for eventId: ${eventId}`, "UI Window");
            await app.ui.windows.trigger(eventId, "close", windowElement[0], programId);
        }
        if (programId !== "sandstormscomponents") {
            triggerEvent(storedWindowObj.windowId, "close", storedWindowObj); // now works
        }

    }

    if (wait) {
        await app.ui.animation(windowElement.get(0));
    }

    // Remove DOM element and stored window first
    app.store.remove(windowElement[0]);
    windowElement.remove();

    if (app.exists("app.historyManager.destroy")) {
        const privateInfo = app.program.getInfo(programId);
        if (privateInfo?.historyScope === 'private' && (privateInfo?.historyOnExit ?? 'clear') === 'clear') {
            app.historyManager.destroy(windowId);
        }
    }

    // Then check remaining windows
    const remaining = document.querySelectorAll(`.pid-${programId}`).length;

    if (remaining === 0) {
        if (programId !== "sandstormscomponents") {
            app.dev.log(`Running programEnd once event for ` + storedWindowObj.windowId, "UI Window");
            await triggerEvent(storedWindowObj.windowId, "programEnd", storedWindowObj);

            app.dev.log(`Clear all remaining event listeners for this program`, "UI Window");
            clearEvents(storedWindowObj.windowId);
            app.program.setStatus(programId, "");

            if (app.exists("app.removeProgramCSS")) {
                app.removeProgramCSS(programId);
            }

            if (app.exists("app.historyManager.destroy")) {
                const info = app.program.getInfo(programId);
                if (info?.historyScope !== 'private' && (info?.historyOnExit ?? 'clear') === 'clear') {
                    app.historyManager.destroy(programId);
                }
            }
        }
    }

    return { windowId, programId };
}

/**
 * Close all windows belonging to a specific program (programId).
 *
 * @param {string} programId - The program ID (the part before the dash in window ids).
 * @param {Object} options
 * @param {boolean} [options.wait=true] - Wait for each window animation to complete.
 * @param {boolean} [options.parallel=true] - If true, close windows in parallel; if false, close sequentially.
 * @param {string|null} [options.excludeWindowId=null] - Optional full windowId to exclude (e.g. "calc-3").
 * @returns {Promise<void>}
 */
export async function closeProgramWindows(programId, options = {}) {
    const {
        wait = true,
        parallel = true,
        excludeWindowId = null
    } = options;

    if (!programId) {
        app.dev.warn("[UI Window] closeProgramWindows called without programId.");
        return;
    }

    // Find all window elements for this program
    const nodeList = document.querySelectorAll(`.pid-${programId}`);
    if (!nodeList || nodeList.length === 0) {
        app.dev.log(`[UI Window] No windows found for program '${programId}'.`);
        return;
    }

    const windows = Array.from(nodeList)
        .map(el => $(el))
        .filter($el => {
            if (!$el || !$el.length) return false;
            const rawId = $el.attr("id");
            const windowId = rawId ? rawId.replace("-win", "") : null;
            if (!windowId) return false;
            if (excludeWindowId && windowId === excludeWindowId) return false;
            return true;
        });

    if (windows.length === 0) {
        app.dev.log(`[UI Window] No windows to close for program '${programId}' after filtering.`);
        return;
    }

    // PHASE 1: Close all windows (without individual taskbar handling)
    const closeWindow = async ($win) => {
        try {
            await _performWindowClose($win, programId, {
                wait,
                triggerEvent: true
            });

            const windowId = $win.attr("id")?.replace("-win", "");
            app.program.removeWindowInfo(windowId, programId);
        } catch (err) {
            app.dev.error(`[UI Window] Error closing window: ${err}`, "UI Window");
        }
    };

    if (parallel) {
        await Promise.all(windows.map($w => closeWindow($w)));
    } else {
        for (const $w of windows) {
            await closeWindow($w);
        }
    }

    if (app.exists("app.desktop.taskbar.removeProgram")) {
        // PHASE 2: Handle taskbar cleanup ONCE after all windows are closed
        await app.desktop.taskbar.removeProgram(programId, { wait });
    }

    if (app.exists("app.desktop.startmenu.updateRunningApps")) {
        // PHASE 3: Update start menu ONCE
        app.desktop.startmenu.updateRunningApps(programId);
    }

    // Cleanup
    app.ui.windows.functions.removeResizeListener();

    const remaining = document.querySelectorAll(`.pid-${programId}`).length;
    app.dev.log(
        `[UI Window] All windows closed for program '${programId}'. Remaining: ${remaining}`,
        "UI Window"
    );
}

/**
 * Closes a specific window by its windowId and taskId.
 *
 * @param {string} windowId - The unique ID of the window.
 * @param {string} taskId - The unique ID of the associated taskbar element.
 * @param {string} programId - The program ID the window belongs to.
 * @param {boolean} noprogram - Skip program cleanup if true.
 * @param {Object} options - Additional options.
 * @param {boolean} options.wait - If true, waits for animations to complete.
 * @returns {Promise<void>}
 */
export async function closeWindow(windowId, taskId, programId, noprogram = false, options = {}) {
    const { wait = true } = options;
    const windowElement = $(`#${windowId}-win`);

    if (!windowElement.length) return;

    // Close the window
    await _performWindowClose(windowElement, programId, {
        wait,
        triggerEvent: true
    });

    // Handle cleanup
    if (!noprogram) {
        app.program.removeWindowInfo(windowId, programId);

        if (app.exists("app.desktop.taskbar.removeProgram")) {
            // PHASE 2: Hand;le taskbar cleanup ONCE after all windows are closed
            await app.desktop.taskbar.removeProgram(programId, { wait });
        }

        if (app.exists("app.desktop.startmenu.updateRunningApps")) {
            // PHASE 3: Update start menu ONCE
            app.desktop.startmenu.updateRunningApps(programId);
        }
    }

    app.dev.log(`Window '${programId}' (ID: ${windowId}) has been closed.`, "UI Window");
}

/**
 * Closes the currently active window.
 *
 * @param {boolean} noprogram - Skip program cleanup if true.
 * @param {Object} options - Additional options.
 * @param {boolean} options.wait - If true, waits for animations to complete.
 * @returns {Promise<void>}
 */
export async function closeActiveWindow(noprogram = false, options = {}) {
    const { wait = true } = options;

    const activeWindow = $(".window.active");
    if (!activeWindow.length) {
        app.dev.warn("No active window to close.");
        return;
    }

    const windowId = activeWindow.attr("id")?.replace("-win", "");
    const programClass = activeWindow.attr("class")?.match(/pid-([^\s]+)/);
    const programId = programClass ? programClass[1] : null;

    if (!programId || !windowId) {
        app.dev.log(`Cannot close window '${windowId}', programId not found.`, "UI Window");
        return;
    }

    // Reuse closeWindow logic
    await this.closeWindow(windowId, null, programId, noprogram, { wait });
}

/**
 * Closes all windows in the OS.
 *
 * @param {Object} options - Options object.
 * @param {boolean} options.wait - Wait for each window to close.
 * @param {boolean} options.parallel - Close all windows simultaneously if wait=false.
 * @param {string} options.excludeWindowId - Optional window ID to exclude from closing.
 * @returns {Promise<void>}
 */
export async function closeAll(options = {}) {
    const {
        wait = false,
        parallel = true,
        excludeWindowId = null
    } = options;

    const windows = $(".window").toArray();
    if (!windows.length) return;

    // Group windows by program
    const programGroups = new Map();

    windows.forEach(win => {
        const $win = $(win);
        const rawId = $win.attr("id");
        const windowId = rawId?.replace("-win", "");

        if (excludeWindowId && windowId === excludeWindowId) return;

        const programClass = $win.attr("class")?.match(/pid-([^\s]+)/);
        const programId = programClass ? programClass[1] : windowId?.split("-")[0];

        if (!programId) return;

        if (!programGroups.has(programId)) {
            programGroups.set(programId, []);
        }
        programGroups.get(programId).push($win);
    });

    // Close each program's windows as a group
    const closeProgramGroup = async ([programId, windows]) => {
        if (programId === "sandstormscomponents") {
            // Handle system windows separately
            for (const $win of windows) {
                await _performWindowClose($win, programId, { wait, triggerEvent: true });
                const windowId = $win.attr("id")?.replace("-win", "");
                app.program.removeSandstormComponents(windowId);
            }
            return;
        }

        // Close all windows for this program
        const closePromises = windows.map($win =>
            _performWindowClose($win, programId, {
                wait,
                triggerEvent: true
            }).then(result => {
                if (result) {
                    app.program.removeWindowInfo(result.windowId, programId);
                }
            })
        );

        await Promise.all(closePromises);

        // Handle taskbar cleanup once per program
        if (app.exists("app.desktop.taskbar.removeProgram")) {
            // PHASE 2: Handle taskbar cleanup ONCE after all windows are closed
            await app.desktop.taskbar.removeProgram(programId, { wait });
        }

        if (app.exists("app.desktop.startmenu.updateRunningApps")) {
            // PHASE 3: Update start menu ONCE
            app.desktop.startmenu.updateRunningApps(programId);
        }
    };

    if (parallel) {
        await Promise.all(
            Array.from(programGroups.entries()).map(group => closeProgramGroup(group))
        );
    } else {
        for (const group of programGroups.entries()) {
            await closeProgramGroup(group);
        }
    }

    app.ui.windows.functions.removeResizeListener();
}

/**
 * Closes a specific window given its jQuery element.
 *
 * @param {jQuery} windowElement - The jQuery element representing the window to close
 * @param {boolean} noprogram - If true, skips removing program info
 * @param {Object} options - Additional options
 * @param {boolean} options.wait - If true, waits for animations to complete
 * @returns {Promise<void>}
 */
export async function closeThisWindow(windowElement, noprogram = false, options = {}) {
    const { wait = true } = options;

    if (!windowElement || !windowElement.length) return;

    const windowId = windowElement.attr("id")?.replace("-win", "");
    const programClass = windowElement.attr("class")?.match(/pid-([^\s]+)/);
    const programId = programClass ? programClass[1] : null;

    if (!programId) {
        console.warn(`Cannot close window '${windowId}', programId not found.`);
        app.program.removeSandstormComponents(windowId);
        return;
    }

    // Handle sandstormscomponents separately
    if (programId === "sandstormscomponents") {
        await _performWindowClose(windowElement, programId, { wait, triggerEvent: true });
        app.program.removeSandstormComponents(windowId);

        const numWindows = $(`[id^="sandstormscomponents-"][id$="-win"]`).length;
        if (numWindows === 0) {
            const taskbarElement = $(`#pid-${programId}-task`);
            if (taskbarElement.length) {
                if (wait) await app.ui.animation(taskbarElement.get(0));
                taskbarElement.remove();
                app.desktop.taskbar.removeTaskIcon(programId);
            }
        }

        app.dev.log(
            `[UI Window] Closed system window '${windowId}' (sandstormscomponents). Remaining: ${numWindows}`,
            "UI Window"
        );
        return;
    }

    // Reuse closeWindow logic for regular windows
    await this.closeWindow(windowId, null, programId, noprogram, { wait });
}

/**
 * Closes a window and handles associated cleanup tasks, including taskbar and program info.
 * Can trigger the "close" event for the window, or skip event triggering if needed.
 *
 * @param {string} windowId - The unique identifier of the window to close.
 * @param {string} taskId - The taskbar element ID (optional, may be used for animations or state updates).
 * @param {string} id - The program ID the window belongs to.
 * @param {boolean} noprogram - If true, skips removing program info and taskbar icon.
 * @param {boolean} action - If false, performs close immediately without waiting for button click.
 * @param {Object} options - Additional options.
 * @param {boolean} [options.wait=true] - If true, waits for animations to complete before removing elements.
 * @param {boolean} [options.triggerEvent=true] - If true, triggers the "close" event associated with this window.
 * @returns {Promise<void>}
 */
export async function close(windowId, taskId, id, noprogram = false, action = true, options = {}) {
    const { wait = true, triggerEvent = true } = options;

    const windowElement = $(`#${windowId}-win`);

    if (!windowElement.length) {
        app.dev.warn(`[UI Window] No window element found for ${windowId}.`, "UI Window");
        return;
    }

    const performClose = async () => {
        await this.closeWindow(windowId, taskId, id, noprogram, { wait });
    };

    // If action is false, perform close immediately
    if (!action) {
        await performClose();
        return;
    }

    // Attach click event to window close buttons
    windowElement
        .find(".window-list .controls .close, .window-list .window-header .icon .control-menu .ctm-row.close")
        .off("click.close")
        .on("click.close", async (e) => {
            e.stopPropagation();
            await performClose();
        });
}

/**
 * Maximizes or restores the size and position of a window.
 * If the window is currently maximized, it restores it to its previous size and position.
 * If the window is not maximized, it maximizes the window to fit the available screen space
 * while accounting for the position of the taskbar.
 *
 * @function maximize
 * @param {string} windowId - The unique identifier of the window to maximize or restore.
 * @throws Will throw an error if the window with the specified ID does not exist.
 *
 * @example
 * // To maximize a window with the ID 'myWindow'
 * maximize('myWindow');
 *
 * @example
 * // To restore a maximized window with the ID 'myWindow'
 * maximize('myWindow');
 */
export function maximize(windowId) {
    if (app.windows?.getWindowState?.(windowId)?.dialogOpen) {
        return;
    }

    const windowElement = $(`#${windowId}-win`);

    const maximizeButton = windowElement.find(".window-list .controls .maximize");
    const maximized = windowElement.hasClass("maximized");
    const newTooltipText = maximized ? _("Maximize") : _("Normal");

    maximizeButton.html(
        maximized
            ? `<svg><use href="#ic-bts-maximize"></use></svg>`
            : `<svg><use href="#ic-bts-minimize"></use></svg>`
    );

    if (maximizeButton.attr("data-tooltip") !== undefined) {
        maximizeButton.attr("data-tooltip", newTooltipText);
    } else {
        maximizeButton.attr("title", newTooltipText);
    }

    windowElement.css({
        transition:
            "opacity 1s ease-out, transform 400ms ease, left 400ms ease, top 400ms ease, width 400ms ease-out, height 400ms ease-out",
    });

    windowElement
        .find(
            ".window-list .window-header .icon .control-menu .ctm-row:eq(1) .ctm-title span:eq(0)"
        )
        .html(`<svg><use href="#ic-bts-maximize"></use></svg>`);

    // Check if the window is currently maximized
    if (windowElement.hasClass("maximized")) {
        // Minimize: Restore previous size and position
        windowElement.removeClass("maximized");
        windowElement.addClass("normal");

        // Retrieve values from windowElement.data
        const originalWidth = windowElement.data("win.width");
        const originalHeight = windowElement.data("win.height");
        const originalTop = windowElement.data("win.top");
        const originalLeft = windowElement.data("win.left");

        // Remove 'px' and convert to numeric values for comparison
        const topValue = parseInt(originalTop, 10);
        const leftValue = parseInt(originalLeft, 10);

        // Update text to "Maximize"
        windowElement
            .find(
                ".window-list .window-header .icon .control-menu .ctm-row:eq(1) .ctm-title span:eq(1)"
            )
            .text(_("Maximize"));

        // Update the window status if the function exists
        if (app.exists("app.program.updateWindowStatus")) {
            if (!windowElement.hasClass("single")) {
                // Remove suffix '-<number>-win' to extract the base window ID
                var id = windowId.replace(/-\d+$/, "");
                app.program.updateWindowStatus(id, windowId, "normal");
            }
        }

        // Restore size and position
        windowElement.css({
            width: originalWidth,
            height: originalHeight,
            top: originalTop,
            left: originalLeft,
        });

        // Get the browser window dimensions
        let windowWidth = $(window).width();
        let windowHeight = $(window).height();

        // Get the taskbar element, its position, and dimensions
        let taskbarElement = $(".taskbar-s").eq(0);
        let taskbarWidth = taskbarElement.width();
        let taskbarHeight = taskbarElement.height();

        const restoredWidth = originalWidth;
        const restoredHeight = originalHeight;

        // Check the window's position relative to the browser edges and the taskbar
        if (taskbarElement.hasClass("taskbar-left")) {
            // Taskbar is on the left, so adjust left and top positions
            if (leftValue <= taskbarWidth) {
                // Ensure the window doesn’t overlap with the left taskbar
                windowElement.css("left", taskbarWidth + "px");
            }

            // Taskbar is on the right, adjust the right edge
            if (
                leftValue + restoredWidth >=
                windowWidth - taskbarWidth
            ) {
                // Ensure the window stays within the left edge before the right taskbar
                windowElement.css(
                    "left",
                    windowWidth - taskbarWidth - restoredWidth + "px"
                );
            }

            if (topValue <= 0) {
                // Ensure the window doesn’t go above the screen
                windowElement.css("top", "0px");
            }
        } else if (taskbarElement.hasClass("taskbar-right")) {
            if (leftValue <= 0) {
                // Ensure the window doesn’t go beyond the left edge
                windowElement.css("left", "0px");
            }

            // Taskbar is on the right, adjust the right edge
            if (
                leftValue + restoredWidth >=
                windowWidth - taskbarWidth
            ) {
                // Ensure the window stays within the left edge before the right taskbar
                windowElement.css(
                    "left",
                    windowWidth - taskbarWidth - restoredWidth + "px"
                );
            }
            if (topValue <= 0) {
                // Ensure the window doesn’t go above the screen
                windowElement.css("top", "0px");
            }
        } else if (taskbarElement.hasClass("taskbar-top")) {
            // Taskbar is at the top, adjust the top position
            if (topValue <= taskbarHeight) {
                // Ensure the window doesn’t overlap with the top taskbar
                windowElement.css("top", taskbarHeight + "px");
            }
            if (leftValue <= 0) {
                // Ensure the window doesn’t go beyond the left edge
                windowElement.css("left", "0px");
            }
        } else if (taskbarElement.hasClass("taskbar-bottom")) {
            if (topValue <= 0) {
                // Ensure the window doesn’t go above the screen
                windowElement.css("top", "0px");
            }

            // Taskbar is at the bottom, adjust the bottom edge
            if (
                topValue + restoredHeight >=
                windowHeight - taskbarHeight
            ) {
                // Ensure the window stays above the bottom taskbar
                windowElement.css(
                    "top",
                    windowHeight - taskbarHeight - restoredHeight + "px"
                );
            }
            if (leftValue <= 0) {
                // Ensure the window doesn’t go beyond the left edge
                windowElement.css("left", "0px");
            }
        }
    } else {
        clearWindowFromAllZones(windowId);
        windowElement.data('snap.slots', null);

        windowElement.data("win.width", windowElement.width());
        windowElement.data("win.height", windowElement.height());
        const _rawTop = windowElement[0].style.top;
        const _rawLeft = windowElement[0].style.left;
        windowElement.data("win.top", _rawTop && _rawTop !== "auto" ? _rawTop : windowElement.css("top"));
        windowElement.data("win.left", _rawLeft && _rawLeft !== "auto" ? _rawLeft : windowElement.css("left"));

        // Maximize the window
        windowElement
            .find(
                ".window-list .icon .control-menu .ctm-row:eq(1) .ctm-title span:eq(0)"
            )
            .html(`<svg><use href="#ic-bts-minimize"></use></svg>`);

        windowElement
            .find(
                ".window-list .icon .control-menu .ctm-row:eq(1) .ctm-title span:eq(1)"
            )
            .text(_("Normal"));

        windowElement.addClass("maximized");
        windowElement.removeClass("normal");

        var id = windowId.replace(/-\d+$/, "");

        // Update the window status if the function exists
        if (app.exists("app.program.updateWindowStatus")) {
            if (!windowElement.hasClass("single")) {
                // Remove suffix '-<number>-win' to extract the base window ID

                app.program.updateWindowStatus(id, windowId, "maximized");
            }
        }

        const eventId = windowElement.data("eventId"); // read eventId from the element
        if (eventId) {
            app.dev.log(`[UI Window] Triggering maximize event for ${eventId}`, "UI Window");
            app.ui.windows.trigger(eventId, "maximize", windowElement[0], windowId);
        }

        // Retrieve the stored window object safely from WeakMap
        const storedWindowObj = app.store.get(windowElement[0]);
        triggerEvent(id, "maximize", storedWindowObj);

        // Handle taskbar position
        var taskbarElement = $(".taskbar-s").eq(0); // First taskbar element

        // get taskbarens width and height
        let taskbarWidth = taskbarElement.width();
        let taskbarHeight = taskbarElement.height();

        if (taskbarElement.hasClass("taskbar-left")) {
            windowElement.css({
                left: `${taskbarWidth}px`,
                top: "0px",
                right: "0px",
                bottom: "0px",
                width: `calc(100% - ${taskbarWidth}px)`,
                height: "100%",
            });
        } else if (taskbarElement.hasClass("taskbar-right")) {
            windowElement.css({
                right: `${taskbarWidth}px`,
                top: "0px",
                left: "0px",
                bottom: "0px",
                width: `calc(100% - ${taskbarWidth}px)`,
                height: "100%",
            });
        } else if (taskbarElement.hasClass("taskbar-top")) {
            windowElement.css({
                top: `${taskbarHeight}px`,
                left: "0px",
                right: "0px",
                bottom: "0px",
                width: "100%",
                height: `calc(100% - ${taskbarHeight}px)`,
            });
        } else if (taskbarElement.hasClass("taskbar-bottom")) {
            windowElement.css({
                bottom: `${taskbarHeight}px`,
                top: "0px",
                right: "0px",
                left: "0px",
                width: "100%",
                height: `calc(100% - ${taskbarHeight}px)`,
            });
        }
    }

    // Update position of caret()
    _caretRAF();

    // Restore transition effects after maximizing
    setTimeout(function () {
        windowElement.css({
            transition:
                "opacity 1s ease-out, transform 1s ease, left 0.3s ease, top 0.3s ease, width 400ms ease-out, height 400ms ease-out",
        });
    }, 400);
}

/**
 * Minimizes the specified window and updates the taskbar state.
 *
 * This function attaches a click event listener to the minimize button of the window
 * specified by `windowId`. When the minimize button is clicked, the window is hidden,
 * and its state in the taskbar is updated accordingly. The function also animates
 * the window minimizing to the taskbar using the provided taskbar animation function.
 *
 * @function minimize
 * @param {string} windowId - The ID of the window to be minimized. This ID should correspond to the window's DOM element ID.
 * @param {string} taskId - The ID of the taskbar element that corresponds to the window. This is used to update the taskbar's state.
 *
 * @example
 * // Usage of the minimize function
 * app.ui.windows.functions.minimize('myWindow', 'myTask');
 */
export function minimize(windowId, taskId) {
    const winEl = $(`#${windowId}-win`);

    winEl.find(".window-list .controls .minimize, .window-list .icon .control-menu .ctm-row.minimize")
        .on("click", function () {
            _doMinimize(windowId, taskId);
        });
}

/**
 * Minimizes a window immediately, without requiring a real
 * click on its minimize button — the programmatic counterpart
 * to `minimize` (which only binds a click handler). Used to
 * spawn a window straight into the taskbar with `instant:
 * true` so it's never visibly shown first (see
 * `app.program.open()`'s `options.window.start`).
 *
 * @function minimizeNow
 * @param {string} windowId
 * @param {string} taskId
 * @param {Object} [opts]
 * @param {boolean} [opts.instant=false] - Skip the genie-effect
 *   taskbar animation and jump straight to the minimized end
 *   state. Set to `true` for a window that was never visible
 *   in the first place — all the same position/state
 *   bookkeeping restore depends on is still computed either way.
 *
 * @example
 * app.ui.windows.functions.minimizeNow('myWindow', 'myTask', { instant: true });
 */
export function minimizeNow(windowId, taskId, opts = {}) {
    _doMinimize(windowId, taskId, opts);
}

/**
 * Handles context menu functionalities for window icons in the UI.
 * @namespace contextmenu
 */
/**
 * Maximizes the window when the maximize button is clicked in the control menu.
 * - Handles click event on `.ctm-row.maximize` within `.control-menu`.
 * - Calls `app.ui.windows.functions.contextmenu.maximize(windowId)` to perform the maximize action.
 *
 * Exported as `contextmenuMaximize` (not `maximize`, already taken by the
 * plain `maximize` export above) — index.js reassembles this alongside
 * `contextmenuToggle` (window/menu-body.js) into the same
 * `contextmenu: { toggle, maximize }` namespace object the original file had.
 * @function maximize
 * @memberof contextmenu
 * @example
 * app.ui.windows.functions.contextmenu.maximize();
 */
export function contextmenuMaximize() {
    // Maximize function for .ctm-row.maximize
    $(".window .window-list .icon .control-menu .ctm-row.maximize").on(
        "click",
        function (e) {
            e.stopPropagation(); // Prevent event propagation

            // Get the window ID and remove the "-win" suffix
            let windowId = $(this).closest(".window").attr("id");
            windowId = windowId.replace("-win", "");

            // Maximize the window using the app's window functions
            app.ui.windows.functions.maximize(windowId);
            // Update position of caret()
            _caretRAF();
        }
    );
}
