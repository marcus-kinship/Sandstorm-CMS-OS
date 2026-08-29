/**
 * @file window/dialogs.js
 * @description Program-facing window entry points and generic dialog
 * builders for the window-management split (see window/index.js for the
 * assembly). Split out of the original monolithic window.js — moved
 * verbatim, no logic changes.
 *
 * Dependency rule: imports from window/state.js and window/element.js only.
 *
 * `window`/`layer`/`alert`/`prompt`/`confirm` all call `basWindow`, defined
 * later in this same file — safe, since function declarations are hoisted
 * throughout their whole module, exactly like they were hoisted throughout
 * the whole original file's shared script scope before this split.
 *
 * Pre-existing bug preserved as-is (not introduced by this split, not fixed
 * here): `button`'s own body assigns to the bare identifier `button` instead
 * of a local — `let button = document.createElement(...)`. In real module
 * code this would throw a ReferenceError if ever called; grepped the repo
 * and `app.ui.button(...)` is never actually called anywhere, so it's dormant.
 *
 * @module components/ui/window/dialogs
 */

import { clearEvents, triggerEvent, getFileExtension } from './state.js';
import { WindowElement } from './element.js';

/**
 * Creates a new program window.
 * @param {string} id - The unique program identifier, for example, "calculator".
 * @param {object} data - An object containing information for the window, including:
 * @param {boolean} data.single - Indicates whether the window is part of a group (e.g., tabbed interface). Example: false.
 * @param {string} data.title - The title of the window. Example: "Calculator".
 * @param {boolean} data.windowIcon - Indicates whether the window should display an icon. Example: false.
 * @param {string} data.width - The width of the window, specified as a string with units (e.g., "px", "em"). Example: "300px".
 * @param {string} data.height - The height of the window, specified as a string with units (e.g., "px", "em"). Example: "400px".
 * @param {string} data.minWidth - The minimum width of the window. Example: "300px".
 * @param {string} data.minHeight - The minimum height of the window. Example: "400px".
 * @param {string|object} data.body - The content or layout of the window's body. This can be an HTML string or a structured object.
 * @param {string} data.taskbarIcon - The icon used in the taskbar or window.
 * @param {string} data.eventId - A unique identifier for window-specific events (close, maximize, minimize). Automatically generated.
 * @param {string} options.mode - Window mode, can be "normal" or "maximized". Default is "normal".
 * @param {string|number} options.left - Horizontal position of the window (center, left, right, or pixel value).
 * @param {string|number} options.top - Vertical position of the window (center, top, bottom, or pixel value).
 *
 * @example
 * app.ui.windowStart(programid,{
 *     title: "My Window",
 *     width: "400px",
 *     height: "300px",
 *     body: function() { return "<p>Window Content</p>"; },
 *     controls: { minimize: true, maximize: true, close: true },
 *     mode: "maximized",
 *     left: "center",
 *     top: "center"
 * });
 */

export function windowStart(id, data) {
    // Validate that the data object contains the necessary properties
    if (typeof data !== "object" || data === null) {
        console.error("Data must be a non-null object.");
        return;
    }

    // Add CSS for the window

    if (data.single == undefined) {
        data.single = false;
    }

    // Check if app.desktop.startmenu.addToTaskbar and app.desktop.taskbar exist
    if (
        app.exists("app.desktop.taskbar.addToTaskbar")) {
        const program = app.program.getInfo(id);
        app.program.setTaskbarIconDisplayTrue(id);
        app.desktop.taskbar.addToTaskbar(program, id, data);
    }

    // List of required properties
    const requiredProperties = ["id", "title", "width", "height", "body"];
    for (const prop of requiredProperties) {
        if (!(prop in data)) {
            console.error(`Data is missing the property '${prop}'.`);
            return;
        }
    }

    // Set default controls if not provided
    if (data.controls == undefined) {
        data.controls = {
            minimize: true,
            maximize: true,
            close: true,
        };
    }

    // Check if the window should be resizable
    if (data.resizable == undefined) {
        data.resizable = false;
    }

    // Set default positions if they do not exist
    if (!data.left) {
        data.left = "center"; // Center horizontally
    }

    if (!data.top) {
        data.top = "center"; // Center vertically
    }

    // Set default mode if not provided
    if (!["normal", "maximized"].includes(data.mode)) {
        data.mode = "normal"; // Default to normal if invalid or missing
    }

    if (!data.minWidth) {
        data.minWidth = data.width;
    }

    if (!data.minHeight) {
        data.minHeight = data.height;
    }

    // Create a unique window ID
    const last = app.program.getLastWindowId(id);
    const windowId = `${id}-${last}`;
    app.dev.log(`[windowStart] id=${id} windowId=${windowId} existingInDOM=${!!document.getElementById(windowId + '-win')}`, "UI Window");

    // Clear any stale event listeners from a previous window that reused this ID
    clearEvents(windowId);

    if (app.exists("app.historyManager.create")) {
        const info = app.program.getInfo(id);
        if (info?.historyScope === 'private') {
            app.historyManager.create(windowId, { historyOnExit: info.historyOnExit });
        }
    }

    app.program.addWindowInfo(id, windowId, data);

    // Set additional properties in the data object
    data.id = id;
    data.windowId = windowId;

    app.dev.log(
        `Window '${data.title}' (ID: ${windowId}) has been created.`,
        "UI Window"
    );

    let windowobj = new WindowElement(windowId, data, id);

    // Send the prepared data to the body creation function
    app.ui.windows.functions.body(data, false, windowobj); // Pass false if this is a program window

    // Get windowElement and taskId
    const windowElement = $(`#${windowId}-win`);

    if (windowobj) {
        windowobj.el = windowElement;
    }

    // Register window events
    triggerEvent(windowobj.window, "ready", windowobj);

    // Store the window object in the WeakMap using its DOM element as the key
    app.store.set(windowElement[0], windowobj);

    let taskId = id;

    // Set the active window
    app.setActiveWindow(windowId);

    // Set program status running
    app.program.setStatus(id, "running");

    if (app.exists("app.desktop.taskbar.overflow.handle")) {
        app.desktop.taskbar.overflow.handle();
    }

    windowElement.click(function () {
        app.setActiveWindow(windowId);
        if (
            !windowElement.hasClass("single") &&
            app.exists("app.desktop.startmenu.showRunningApp")
        ) {
            // Remove suffix '-<number>-win' to extract the base window ID
            var id = windowId.replace(/-\d+$/, "");
            app.desktop.startmenu.showRunningApp(id);
        }
    });

    // Add windowElement and taskElement to the data object
    data.windowElement = windowElement; // Add windowElement to the data object
    data.taskElement = taskId; // Add taskElement to the data object

    // Call the position function to set the window's position
    app.ui.windows.functions.position(data);

    // Calls the draggable function to enable drag functionality on the specified window.
    app.ui.windows.functions.draggable(data);

    // Calls the resizable function to enable resize functionality on the specified window.
    app.ui.windows.functions.resizable(data);


    if (data.windowIcon != undefined) {
        app.ui.windows.functions.contextmenu.toggle();

        if (data.resizable) {
            app.ui.windows.functions.contextmenu.maximize();
        }
    }
    app.ui.windows.functions.contextmenu.copyTitle();

    if (data.resizable) {
        // Maximize function
        if (data.controls.maximize) {
            windowElement.find(".window-list").dblclick(function (event) {
                app.ui.windows.functions.maximize(windowId, event);
            });

            // Maximize function
            windowElement
                .find(".window-list .controls .maximize")
                .on("click", function (event) {
                    app.ui.windows.functions.maximize(windowId, event);
                });
        }
    }

    // Minimize function
    if (data.controls.minimize) {
        app.ui.windows.functions.minimize(windowId, taskId);
    }

    // Close function
    if (data.controls.close) {

        app.ui.windows.functions.close(windowId, taskId, id, false);
    }


    windowElement.delay(10).animate(
        {
            opacity: 1,
            transform: "scale(1)",
        },
        400,
        () => {
            if (document.body.style.cursor === 'progress') document.body.style.cursor = '';
            if (app.exists("app.cursor.stopWorking")) app.cursor.stopWorking();
        }
    );
}

/**
 * Creates a standard window in the app UI.
 *
 * @param {Object} options - The configuration object for the window.
 * @param {string} options.title - The title of the window.
 * @param {string} options.width - The width of the window (e.g., '400px').
 * @param {string} options.height - The height of the window (e.g., '300px').
 * @param {string} options.minWidth - The width of the window (e.g., '400px').
 * @param {string} options.minHeight - The height of the window (e.g., '300px').
 * @param {boolean} options.single -  Indicates whether the window is part of a group (e.g., tabbed interface). Example: false.
 * @param {function} options.body - A function that returns the HTML content of the window body.
 * @param {Object} options.controls - Object specifying control buttons (minimize, maximize, close).
 * @param {boolean} [options.resizable=false] - Whether the window is resizable or not.
 * @param {string} options.taskbarIcon - Set icon on taskbar or window
 * @param {string} data.eventId - A unique identifier for window-specific events (close, maximize, minimize). Automatically generated.
 * @param {string} options.icontype - Set type of icon
 * @param {boolean} options.windowIcon - Set icon on window
 * @param {string} options.mode - Window mode, can be "normal" or "maximized". Default is "normal".
 * @param {string|number} options.left - Horizontal position of the window (center, left, right, or pixels)
 * @param {string|number} options.top - Vertical position of the window (center, top, bottom, or pixels)
 *
 * @example
 * app.ui.window({
 *     title: "My Window",
 *     width: "400px",
 *     height: "300px",
 *     body: function() { return "<p>Window Content</p>"; },
 *     controls: { minimize: true, maximize: true, close: true }
 * });
 */
export function window(options = []) {
    if (options.title == undefined) {
        options.title = "";
    }

    basWindow(options);
}

/**
 * Creates a standard layer in the app UI.
 *
 * @param {Object} options - The configuration object for the layer.
 * @param {string} options.title - The title of the layer.
 * @param {string} options.width - The width of the layer (e.g., '400px').
 * @param {string} options.height - The height of the layer (e.g., '300px').
 * @param {string} options.minWidth - The width of the layer (e.g., '400px').
 * @param {string} options.minHeight - The height of the layer (e.g., '300px').
 * @param {boolean} options.single -  Indicates whether the layer is part of a group (e.g., tabbed interface). Example: false.
 * @param {function} options.body - A function that returns the HTML content of the window body.
 * @param {Object} options.controls - Object specifying control buttons (minimize, maximize, close).
 * @param {boolean} [options.resizable=false] - Whether the layer is resizable or not.
 * @param {string} options.taskbarIcon - Set icon on taskbar or layer
 * @param {string} options.icontype - Set type of icon
 * @param {boolean} options.windowIcon - Set icon on layer
 * @param {string} options.mode - layer mode, can be "normal" or "maximized". Default is "normal".
 * @param {string|number} options.left - Horizontal position of the layer (center, left, right, or pixels)
 * @param {string|number} options.top - Vertical position of the layer (center, top, bottom, or pixels)
 *
 * @example
 * app.ui.layer({
 *     title: "My Window",
 *     width: "400px",
 *     height: "300px",
 *     body: function() { return "<p>Window Content</p>"; },
 *     controls: { minimize: true, maximize: true, close: true }
 * });
 */
export function layer(options = []) {
    if (options.title == undefined) {
        options.title = "";
    }
    options.function = "layer";

    if (!options.class) {
        options.class = "layer";
    } else {
        options.class = "layer " + options.class;
    }

    basWindow(options);
}

/**
 * Creates an alert window with a message and optional confirm button.
 * Supports both synchronous and asynchronous callbacks for the confirm action.
 *
 * @param {Object} options - The configuration object for the alert window.
 * @param {string} [options.title="Alert"] - The title of the alert window.
 * @param {function} options.body - Function that returns the HTML content for the alert body.
 * @param {string} [options.confirm="OK"] - The label for the confirm button.
 * @param {function|async function} [options.onConfirm] - Callback executed when the confirm button is clicked (supports both async and sync).
 * @param {boolean} [options.close=true] - Whether the window should automatically close after the confirm action.
 * @param {string} [options.width="380px"] - The width of the alert window.
 * @param {string} [options.height="200px"] - The height of the alert window.
 * @param {string} [options.icon="#ic-warning"] - The icon shown in the dialog body.
 * @param {string} [options.taskbarIcon="#ic-warning"] - The icon shown in the taskbar.
 *
 * @example
 * app.ui.alert({
 *     title: "Warning",
 *     body: () => "<p>Something went wrong.</p>",
 *     confirm: "OK",
 *     icon: "#ic-warning",
 *     onConfirm: async () => {
 *         await someAsyncOperation();
 *     },
 *     close: true
 * });
 */
export function alert(options = {}) {
    // Generate unique ID for confirm button
    const confirmId = "confirmBtn_" + Math.random().toString(36).substring(2, 10);

    // Default icons
    let dialogIcon = options.icon || "#ic-warning";
    let taskbarIconImage = options.taskbarIcon || dialogIcon;

    options.taskbarIcon = taskbarIconImage;
    options.icontype = "svg";
    options.class = options.class ? `${options.class} d-msgwin` : "d-msgwin";

    // Always centered
    options.left = "center";
    options.top = "center";
    options.mode = "normal";
    options.function = "alert";
    options.eventId = false;

    // Default close behavior
    if (!("close" in options)) {
        options.close = true;
    }

    // Detect icon type
    const supportedTypes = ["png", "jpg", "jpeg", "gif", "webp"];
    let dialogIconType = "svg";
    let extension = getFileExtension(dialogIcon);
    if (supportedTypes.includes(extension)) {
        dialogIconType = extension;
    }

    // Default task icon colors
    if (!Array.isArray(options.taskIconColors)) {
        options.taskIconColors = ["#ff4d4d", "#cc0000"];
    }

    options.taskIconTaskAnimation = "animation: pulse 3s infinite;";

    // Build dialog HTML
    let iconHtml = dialogIconType === "svg"
        ? `<svg title="${_("Warning")}"><use href="${dialogIcon}"></use></svg>`
        : `<img src="${dialogIcon}" alt="${_("Warning")}" />`;

    let html = `<div class="m-window d-warning">
<div class="m-icon">${iconHtml}</div>
<div>`;

    if (typeof options.body === "function") {
        html += options.body(app);
    } else if (typeof options.body === "string") {
        html += `<p style="margin:0;">${app.util.escapeHtml(options.body)}</p>`;
    } else if (options.message) {
        html += `<p style="margin:0;">${app.util.escapeHtml(options.message)}</p>`;
    }

    app.addCSS(
        "alert",
        `
.window.d-msgwin {
    container-type: inline-size;
    height: auto !important;
    min-height: 205px;
}
.window.d-msgwin > .content {
    height: auto !important;
    overflow: visible;
}
.m-window {
    display: flex;
    color: white;
    column-gap: 27px;
    min-height: 70px;
    margin-left: 28px;
    margin-right: 28px;
}
.m-window > .m-icon > svg, .m-window > .m-icon > img {
    width: 48px;
    height: 48px;
}
.m-window > div {
    padding-top: 18px;
}
.flex-right {
    flex-direction: row-reverse;
}
@container (max-width: 420px) {
    .m-window {
        flex-direction: column;
        align-items: center;
        text-align: center;
        column-gap: 0;
        row-gap: 10px;
        margin-left: 16px;
        margin-right: 16px;
    }
    .m-window > div {
        padding-top: 0;
    }
    .buttons.flex-right {
        flex-direction: column !important;
        align-items: stretch !important;
        margin-left: 16px !important;
        margin-right: 16px !important;
    }
    .buttons.flex-right .aero-button {
        width: 100%;
        box-sizing: border-box;
        justify-content: center;
    }
}
`
    );

    // Only confirm button
    html += `</div></div><div class="buttons flex-right" style="display: flex;flex-wrap: wrap;align-items: center; margin-left: 15px; margin-right:8px;padding-top: 20px;row-gap: 18px;column-gap: 6px;">`;
    html += `<div id="${confirmId}" class="aero-button confirm" tabindex="0" role="button">${options.confirm || _("OK")}<div class="after pulse"></div></div>`;
    html += `</div>`;

    options.body = function () {
        return html;
    };

    // Defaults
    options.width = options.width || "450px";
    options.height = options.height || "205px";
    options.title = options.title || "Alert";

    basWindow(options);

    // Bind confirm callback
    setTimeout(() => {
        try {
            const confirmBtn = document.getElementById(confirmId);
            if (confirmBtn && typeof options.onConfirm === "function") {
                confirmBtn.addEventListener("click", async (e) => {

                    e.stopPropagation();
                    const isAsync = options.onConfirm.constructor.name === "AsyncFunction";
                    try {
                        if (isAsync) {
                            await options.onConfirm();
                        } else {
                            options.onConfirm();
                        }
                    } catch (err) {
                        console.error("Error in alert onConfirm:", err);
                    }

                    if (options.close !== false) {
                        app.ui.windows.functions.closeActiveWindow();
                    }
                });
            }
            bindButtonActivation(confirmBtn);
            trapDialogFocus(confirmBtn?.closest(".window"));
        } catch (err) {
            console.error("Alert button binding failed:", err);
        }
    }, 10);
}

// aero-button is a plain <div> here (not a real <button>) - shared by
// alert/prompt/confirm below, all built the same way. tabindex="0" (added
// to each button's own HTML string) makes it Tab-reachable, but a div gets
// no keyboard ACTIVATION for free the way a real <button> does - this adds
// the missing Enter/Space -> click translation.
//
// stopPropagation matters here, not just preventDefault: prompt()'s own
// pre-existing document-level keyHandler treats ANY Enter keydown as
// "confirm", regardless of which element is actually focused (a real bug
// found live - pressing Enter while Cancel was focused fired BOTH this
// button's own click AND that unconditional handler's confirm path).
// Stopping propagation here means only the specific focused button's own
// click ever fires, whichever one that is.
function bindButtonActivation(el) {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            el.click();
        }
    });
}

// Traps Tab/Shift+Tab within a modal dialog's own focusable elements while
// it's open. Reported live: opening the "Forgot password" prompt and
// pressing Tab moved focus straight to the desktop/main window behind it
// instead of ever reaching Cancel/Send - alert/prompt/confirm's own button
// divs had no tabindex until the fix above, and even once focusable,
// nothing stopped Tab from walking straight past the dialog's own last
// focusable element into whatever came next in the underlying document.
// Always intercepts Tab (not just at the first/last element) and manually
// moves focus within `containerEl`'s own focusable set - this doesn't
// depend on the dialog's elements happening to be contiguous in the page's
// overall tab order, which a boundary-only trap would.
function trapDialogFocus(containerEl) {
    if (!containerEl) return;

    const FOCUSABLE_SELECTOR = 'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])';

    const handler = (e) => {
        if (e.key !== "Tab") return;

        if (!document.contains(containerEl)) {
            document.removeEventListener("keydown", handler, true);
            return;
        }

        // Not this dialog's own Tab to manage (e.g. a second dialog opened
        // on top of it currently has focus) - leave it alone.
        if (!containerEl.contains(document.activeElement)) return;

        const focusable = Array.from(containerEl.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(el => el.offsetParent !== null);

        if (!focusable.length) return;

        e.preventDefault();

        const currentIndex = focusable.indexOf(document.activeElement);
        let nextIndex;
        if (e.shiftKey) {
            nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
        } else {
            nextIndex = currentIndex === -1 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
        }
        focusable[nextIndex].focus();
    };

    // Capture phase - runs before anything else (e.g. a program's own
    // keydown listeners underneath) gets a chance to react to Tab first.
    document.addEventListener("keydown", handler, true);

    const observer = new MutationObserver(() => {
        if (!document.contains(containerEl)) {
            document.removeEventListener("keydown", handler, true);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Creates a prompt window using the same base as alert/confirm windows.
 * Returns a Promise that resolves with user input or null if cancelled.
 */
export function prompt(options) {
    return new Promise((resolve) => {
        const promptId = "prompt_" + Math.random().toString(36).substring(2, 10);

        const {
            title = "Prompt",
            text = "",
            default: defaultValue = "",
            width = "400px",
            height = "230px",
            programid = null,
            parentWindowId = null,
            confirm = { label: "Yes", key: "y" },
            cancel = { label: "No", key: "n" },
            modal = true
        } = options;

        let html = `<div class="m-window d-prompt" style="min-height: 70px; color: var(--theme-fontcolor, #fff);">
                <div style="padding:10px;"><strong>${app.util.escapeHtml(title)}</strong></div>
                <div style="padding:10px;">
                    <p style="margin:0;">${app.util.escapeHtml(text)}</p>
                    <input type="text" class="prompt-input" autocomplete="off" value="${app.util.escapeHtml(defaultValue)}" style="width:100%;padding:5px;margin-top:10px;box-sizing:border-box;color:inherit;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.2);border-radius:4px;" />
                </div>
                <div class="buttons flex-right" style="display:flex;justify-content:flex-end;padding:10px;column-gap:5px;">
                    <div id="cancel_${promptId}" class="aero-button cancel" tabindex="0" role="button">${app.util.escapeHtml(cancel.label)}</div>
                    <div id="confirm_${promptId}" class="aero-button confirm" tabindex="0" role="button">${app.util.escapeHtml(confirm.label)}</div>
                </div>
            </div>`;

        // Pass options to basWindow (global or app.ui.windows.functions.basWindow)
        basWindow({
            title,
            body: () => html,
            width,
            height,
            programid,
            parentWindowId,
            modal,
            left: "center",
            top: "center",
            function: "prompt",
            eventId: false
        });

        // Wait a tick to ensure DOM is rendered
        setTimeout(() => {
            const inputEl = document.querySelector(`#${promptId} .prompt-input`) || document.querySelector(".prompt-input");
            const confirmBtn = document.getElementById(`confirm_${promptId}`);
            const cancelBtn = document.getElementById(`cancel_${promptId}`);

            if (inputEl) inputEl.focus();

            const winEl = confirmBtn?.closest('.window') || cancelBtn?.closest('.window');
            const realWindowId = winEl?.id?.replace(/-win$/, '');
            const realProgramId = winEl?.className?.match(/pid-([^\s]+)/)?.[1];

            const closePrompt = (value) => {
                if (realWindowId && realProgramId && typeof app.ui.windows.functions.closeWindow === "function") {
                    app.ui.windows.functions.closeWindow(realWindowId, null, realProgramId);
                } else {
                    app.ui.windows.functions.closeActiveWindow();
                }
                resolve(value);
            };

            // Confirm button
            if (confirmBtn) {
                confirmBtn.addEventListener("click", () => {
                    closePrompt(inputEl ? inputEl.value : null);
                });
            }

            // Cancel button
            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => closePrompt(null));
            }

            bindButtonActivation(confirmBtn);
            bindButtonActivation(cancelBtn);
            trapDialogFocus(confirmBtn?.closest(".window") || cancelBtn?.closest(".window") || winEl);

            // Keyboard shortcuts
            const keyHandler = (e) => {
                if (e.key === "Enter" || e.key.toLowerCase() === confirm.key) {
                    closePrompt(inputEl ? inputEl.value : null);
                } else if (e.key === "Escape" || e.key.toLowerCase() === cancel.key) {
                    closePrompt(null);
                }
            };
            document.addEventListener("keydown", keyHandler);

            // Cleanup listener when window closes
            const observer = new MutationObserver(() => {
                if (!document.querySelector(".d-prompt")) {
                    document.removeEventListener("keydown", keyHandler);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }, 10);
    });
}

/**
 * Creates a customizable confirm window with optional confirm and cancel buttons.
 * Supports both asynchronous (async) and synchronous callback functions for button actions.
 *
 * @param {Object} options - Configuration object for the confirm window.
 * @param {string} [options.title="Confirm"] - The title of the confirm window.
 * @param {function} options.body - Function that returns the HTML content for the confirm body.
 * @param {string} [options.confirm="OK"] - The label text for the confirm button.
 * @param {string} [options.cancel] - The label text for the cancel button (optional).
 * @param {function|async function} [options.onConfirm] - Callback executed when the confirm button is clicked.
 *     - Can be synchronous or asynchronous.
 *     - If it returns `false`, the window will **not** close automatically.
 * @param {function|async function} [options.onCancel] - Callback executed when the cancel button is clicked.
 *     - Can be synchronous or asynchronous.
 *     - If it returns `false`, the window will **not** close automatically.
 * @param {boolean} [options.close=true] - Determines whether the confirm window should close automatically.
 *     - If set to `false`, the window will stay open regardless of callback result.
 * @param {string} [options.width="450px"] - The width of the confirm window.
 * @param {string} [options.height="205px"] - The height of the confirm window.
 * @param {string} [options.icon="#ic-check"] - The icon shown in the dialog body.
 * @param {string} [options.taskbarIcon="#ic-check"] - The icon shown in the taskbar.
 * @param {Array<string>} [options.taskIconColors=["#00aaff", "#97cbff"]] - The taskbar icon gradient colors.
 * @param {string} [options.taskIconTaskAnimation="animation: pulse 3s infinite;"] - Optional icon animation CSS.
 *
 * @example
 * app.ui.confirm({
 *     title: "Confirmation",
 *     body: () => "<p>Are you sure you want to log off?</p>",
 *     confirm: "Yes",
 *     cancel: "No",
 *     close: true,
 *     onConfirm: async () => {
 *         const result = await closeAllWindows();
 *         if (!result) return false; // prevent window from closing
 *     },
 *     onCancel: () => {
 *         console.log("Cancelled.");
 *     }
 * });
 */
export function confirm(options = {}) {
    // Generate unique IDs for confirm and cancel buttons
    const confirmId = "confirmBtn_" + Math.random().toString(36).substring(2, 10);
    const cancelId = "cancelBtn_" + Math.random().toString(36).substring(2, 10);

    // Set default icons
    let dialogIcon = options.icon || "#ic-check";
    let taskbarIconImage = options.taskbarIcon || dialogIcon;

    options.taskbarIcon = taskbarIconImage;
    options.icontype = "svg";
    options.class = options.class ? `${options.class} d-msgwin` : "d-msgwin";

    // Confirm windows are always centered and use normal mode
    options.left = "center";
    options.top = "center";
    options.mode = "normal";
    options.function = "confirm";
    options.eventId = false;

    // Default close behavior
    if (!("close" in options)) {
        options.close = true;
    }

    // Detect taskbar icon type by file extension
    let extension = getFileExtension(taskbarIconImage);
    const supportedTypes = ["png", "jpg", "jpeg", "gif", "webp"];
    if (supportedTypes.includes(extension)) {
        options.icontype = extension;
    }

    // Determine dialog icon type
    let dialogIconType = "svg";
    let dialogExtension = getFileExtension(dialogIcon);
    if (supportedTypes.includes(dialogExtension)) {
        dialogIconType = dialogExtension;
    }

    // Default taskbar colors
    if (!Array.isArray(options.taskIconColors)) {
        options.taskIconColors = ["#00aaff", "#97cbff"];
    }

    options.taskIconTaskAnimation = "animation: pulse 3s infinite;";

    // Build dialog HTML with dynamic icon
    let iconHtml = dialogIconType === "svg"
        ? `<svg title="${_("Confirm")}"><use href="${dialogIcon}"></use></svg>`
        : `<img src="${dialogIcon}" alt="${_("Confirm")}" />`;

    let html = `<div class="m-window d-check"><div class="m-icon">${iconHtml}</div><div>`;

    // Append custom body content if provided
    if (typeof options.body === "function") {
        html += options.body(app);
    } else if (typeof options.body === "string") {
        html += `<p style="margin:0;">${app.util.escapeHtml(options.body)}</p>`;
    } else if (options.message) {
        html += `<p style="margin:0;">${app.util.escapeHtml(options.message)}</p>`;
    }

    // Inject minimal CSS for confirm layout
    app.addCSS(
        "alert, confirm",
        `
.window.d-msgwin {
    container-type: inline-size;
    height: auto !important;
    min-height: 205px;
}
.window.d-msgwin > .content {
    height: auto !important;
    overflow: visible;
}
.m-window {
    display: flex;
    color: white;
    column-gap: 27px;
    min-height: 70px;
    margin-left: 28px;
    margin-right: 28px;
}
.m-window > .m-icon > svg, .m-window > .m-icon > img {
    width: 48px;
    height: 48px;
}
.m-window > div {
    padding-top: 18px;
}
.flex-right {
    flex-direction: row-reverse;
}
@container (max-width: 420px) {
    .m-window {
        flex-direction: column;
        align-items: center;
        text-align: center;
        column-gap: 0;
        row-gap: 10px;
        margin-left: 16px;
        margin-right: 16px;
    }
    .m-window > div {
        padding-top: 0;
    }
    .buttons.flex-right {
        flex-direction: column !important;
        align-items: stretch !important;
        margin-left: 16px !important;
        margin-right: 16px !important;
    }
    .buttons.flex-right .aero-button {
        width: 100%;
        box-sizing: border-box;
        justify-content: center;
    }
}
`
    );

    // Add confirm/cancel buttons with unique IDs
    if (options.cancel || options.confirm) {
        html += `</div></div><div class="buttons flex-right" style="display: flex;flex-wrap: wrap;align-items: center; margin-left: 15px; margin-right:8px;padding-top: 20px;row-gap: 18px;column-gap: 6px;">`;

        if (options.cancel) {
            html += `<div id="${cancelId}" class="aero-button cancel" tabindex="0" role="button">${options.cancel}</div>`;
        }

        html += `<div id="${confirmId}" class="aero-button confirm" tabindex="0" role="button">${options.confirm || _("OK")}<div class="after pulse"></div></div>`;
        html += `</div>`;
    }

    options.body = function () {
        return html;
    };

    // Apply default values if not defined
    options.width = options.width || "450px";
    options.height = options.height || "205px";
    options.title = options.title || "Confirm";

    // Create the confirm window
    basWindow(options);

    // Bind event listeners after window has been rendered
    setTimeout(() => {
        try {
            const confirmBtn = document.getElementById(confirmId);
            const cancelBtn = document.getElementById(cancelId);

            // Helper to detect if a function is async
            const isAsyncFunction = (fn) =>
                fn && fn.constructor && fn.constructor.name === "AsyncFunction";

            // Confirm button
            if (confirmBtn && typeof options.onConfirm === "function") {
                confirmBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    let result;
                    try {
                        if (isAsyncFunction(options.onConfirm)) {
                            await options.onConfirm();
                        } else {
                            options.onConfirm();
                        }
                    } catch (err) {
                        console.error("Error in confirm onConfirm:", err);
                    }

                    if (options.close !== false) {
                        app.ui.windows.functions.closeActiveWindow();
                    }
                });
            }

            // Cancel button
            if (cancelBtn && typeof options.onCancel === "function") {
                cancelBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    let result;
                    try {
                        if (isAsyncFunction(options.onCancel)) {
                            result = await options.onCancel();
                        } else {
                            result = options.onCancel();
                        }
                    } catch (err) {
                        console.error("Error in confirm onCancel:", err);
                    }

                    if (options.close !== false && result !== false) {
                        app.ui.windows.functions.closeActiveWindow();
                    }
                });
            }

            bindButtonActivation(confirmBtn);
            bindButtonActivation(cancelBtn);
            trapDialogFocus(confirmBtn?.closest(".window") || cancelBtn?.closest(".window"));
        } catch (err) {
            console.error("Confirm button binding failed:", err);
        }
    }, 10);
}

export function button(label, cls = "aero-button") {
    button = document.createElement("div");
    button.className = cls;
    button.innerHTML = label;
    return button;
}

/**
 * Base function to create and display a window.
 *
 * @param {Object} info - The configuration object for the window.
 * @param {string} info.title - The title of the window.
 * @param {string} info.width - The width of the window (e.g., '400px').
 * @param {string} info.height - The height of the window (e.g., '300px').
 * @param {function} info.body - A function that returns the HTML content of the window body.
 * @param {Object} info.controls - Object specifying control buttons (minimize, maximize, close).
 * @param {boolean} [info.resizable=false] - Whether the window is resizable or not.
 * @param {string} [info.mode="normal"] - Window mode, can be "normal" or "maximized".
 * @param {string|number} [info.left="center"] - Horizontal position of the window.
 * @param {string|number} [info.top="center"] - Vertical position of the window.
 */
function basWindow(info) {
    let data = info;

    // Validate that the data object contains the necessary properties
    if (typeof data !== "object" || data === null) {
        console.error("Data must be a non-null object.");
        return;
    }

    if (data.single == undefined) {
        data.single = false;
    }

    // Set default mode if not provided
    if (!["normal", "maximized"].includes(data.mode)) {
        data.mode = "normal"; // Default to normal if invalid or missing
    }

    let id =
        data.programid && data.programid !== ""
            ? data.programid
            : "sandstormscomponents";

    let program = {};
    let last = 0; // Declare 'last' outside, initializing with a default value
    let noprogram = true;

    if (id === "sandstormscomponents") {
        noprogram = true;
        program.name = data.title;
        program.icon = data.taskbarIcon;
        program.taskIconColors = data.taskIconColors;
        program.taskIconTaskAnimation = data.taskIconTaskAnimation;
        program.icontype = data.icontype;
        program.taskbar = false;
        program.programId = "sandstormscomponents";

        // Ensure 'last' is defined, defaulting to 0 if no elements match
        const className = ".pid-" + id;

        // Kontrollera om det finns några element med rätt klass
        last = $(className).length || 0;
    } else {

        program = Object.assign({}, app.program.getInfo(id));
        app.program.setStatus(data.programid, "running");
        noprogram = false;
        // Create a unique window ID
        last = app.program.getLastWindowId(id);

    }

    // Check if app functions exist before proceeding
    if (app.exists("app.desktop.taskbar.addToTaskbar")) {
        // Add the program to the taskbar
        app.desktop.taskbar.addToTaskbar(program, id, data);

    }

    const requiredProperties = ["title", "width", "height", "body"];
    for (const prop of requiredProperties) {
        if (!(prop in data)) {
            console.error(`Data is missing the property '${prop}'.`);
            return;
        }
    }

    // Set default controls if not provided
    if (!data.controls) {
        data.controls = { minimize: true, maximize: true, close: true };
    }

    if (!data.resizable) {
        data.resizable = false;
    }

    if (!data.left) {
        data.left = "center";
    }

    if (!data.top) {
        data.top = "center";
    }

    if (!data.minWidth) {
        data.minWidth = data.width;
    }

    if (!data.minHeight) {
        data.minHeight = data.height;
    }

    // Create a unique window ID
    const windowId = `${id}-${last}`;

    if (!noprogram) {
        app.program.addWindowInfo(id, windowId, data);
    }

    // Set additional properties in the data object
    data.id = id;
    data.windowId = windowId;

    app.dev.log(
        `Window '${data.title}' (ID: ${windowId}) has been created.`,
        "UI Window"
    );


    if (typeof data.function === "string") {
        // Add to Sandstorm components
        program.function = data.function;
        app.program.addSandstormComponents(windowId, program);
    }

    // Now send this data to the body creation function
    app.ui.windows.functions.body(data, noprogram);

    const windowElement = $(`#${windowId}-win`);
    let taskSelector = `#pid-${id}-task`;

    let taskId = taskSelector ? taskSelector.replace(/^#/, "") : null;

    var baseWindowId = windowId.split("-")[0];

    // Determine the correct taskbar icon
    if (baseWindowId === "sandstormscomponents") {
        taskId = `${baseWindowId}`;
    }

    // Set the active window
    app.setActiveWindow(windowId);

    if (app.exists("app.desktop.taskbar.overflow.handle")) {
        app.desktop.taskbar.overflow.handle();
    }

    windowElement.click(function () {
        app.setActiveWindow(windowId);
    });

    // Add windowElement and taskElement to the data object
    data.windowElement = windowElement; // Add windowElement to the data object
    data.taskElement = taskSelector; // Add taskElement to the data object

    // Call the position function to set the window's position
    app.ui.windows.functions.position(data);

    // Calls the draggable function to enable drag functionality on the specified window.
    app.ui.windows.functions.draggable(data);

    // Calls the resizable function to enable resize functionality on the specified window.
    app.ui.windows.functions.resizable(data);

    if (data.confirm) {
        windowElement.find(".confirm").on("click", function () {
            if (typeof data.confirm.action === "function") {
                data.confirmAction();
            }
        });
    }

    if (data.cancel) {
        windowElement.find(".cancel").on("click", function () {
            if (typeof data.cancel.action === "function") {
                data.cancelAction();
            }
        });
    }

    if (data.windowIcon) {
        app.ui.windows.functions.contextmenu.toggle();

        if (data.resizable) {
            app.ui.windows.functions.contextmenu.maximize();
        }
    }
    app.ui.windows.functions.contextmenu.copyTitle();

    if (data.resizable) {
        // Maximize function
        if (data.controls.maximize) {
            windowElement.find(".window-list").dblclick(function (event) {
                app.ui.windows.functions.maximize(windowId, event);

            });

            // Maximize function
            windowElement
                .find(".window-list .controls .maximize")
                .on("click", function (event) {
                    app.ui.windows.functions.maximize(windowId, event);

                });
        }
    }

    // Minimize function
    if (data.controls.minimize) {
        app.ui.windows.functions.minimize(windowId, taskId);
    }

    // Close function
    if (data.controls.close) {
        app.ui.windows.functions.close(windowId, taskId, id, noprogram);
    }

    // Trigger window fade-in animation
    windowElement.delay(10).animate({ opacity: 1, transform: "scale(1)" }, 400);
}
