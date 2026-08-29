/**
 * @file window/menu-body.js
 * @description Window body/menu-builder family for the window-management
 * split (see window/index.js for the assembly). Split out of the original
 * monolithic window.js — moved verbatim, no logic changes.
 *
 * Dependency rule: imports from window/state.js only.
 *
 * Re-exports `setMainMenu`/`getMainMenu`/`resetMainMenu` from state.js
 * (where the actual `menu` variable they close over lives) so index.js can
 * pull every "menu family" export from this one file, same grouping the
 * original object literal had. `contextmenuToggle` here pairs with
 * `contextmenuMaximize` in window/lifecycle.js — index.js reassembles both
 * into one `contextmenu: { toggle, maximize }` namespace object, exactly
 * like the original file's own `contextmenu: {...}` had.
 *
 * @module components/ui/window/menu-body
 */

import { triggerEvent, setMainMenu, getMainMenu, resetMainMenu } from './state.js';

export { setMainMenu, getMainMenu, resetMainMenu };

if (typeof app !== "undefined" && typeof app.addCSS === "function") {
    app.addCSS("wm-submenu-portal", `
        .wm-floating.submenu {
            list-style: none;
            padding: 6px;
            margin: 0;
            min-width: 170px;
            color: var(--theme-fontcolor, #fff);
            background: linear-gradient(144deg, rgba(37,37,37,0.3) 0%, rgba(10,10,10,0.2) 47%);
            box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
            backdrop-filter: blur(10px);
            border-radius: 10px;
        }
        .wm-floating.submenu .menu-item {
            position: relative;
            background-color: transparent;
            transition: background-color 0.15s ease;
            border-radius: 5px;
            padding: 8px 8px;
            cursor: default;
            white-space: nowrap;
        }
        .wm-floating.submenu .menu-item:hover {
            background-color: #00000080;
        }
        .wm-floating.submenu .wm-item-row {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
        }
        .wm-floating.submenu .wm-title {
            display: flex;
        }
        .wm-floating.submenu .wm-r10 {
            margin-left: 10px;
        }
        .wm-floating.submenu .wm-item-svg {
            width: 18px;
            height: 18px;
        }
        .wm-floating.submenu .shortcut {
            font-size: 0.8em;
            color: #888;
            margin-left: 5px;
        }
        .wm-floating.submenu .menu-separator {
            height: 1px;
            background-color: #ffffff80;
            margin: 4px 8px;
            pointer-events: none;
            list-style: none;
        }
    `);
}

/**
 * Fades out an element using a CSS transition class and removes it from the DOM.
 *
 * This function supports:
 * - A direct DOM element
 * - A CSS selector string
 * - A jQuery-wrapped element
 *
 * It returns a Promise that resolves when:
 * - The fade-out transition finishes, OR
 * - The fallback timeout triggers (if "transitionend" does not fire)
 *
 * @async
 * @function fadeOut
 * @param {HTMLElement|string|jQuery} element - The target element, a selector, or a jQuery object.
 * @param {string} [fadeClass="fade-out"] - The CSS class used to trigger the fade-out transition.
 * @returns {Promise<void>} Resolves when the element has been removed or the fallback completes.
 *
 * @example
 * // Fade out using default class
 * await app.ui.windows.functions.fadeOut("#my-element");
 *
 * @example
 * // Fade out with custom class
 * await app.ui.windows.functions.fadeOut(myDiv, "fade-out-fast");
 *
 * @example
 * // Using a jQuery wrapper
 * await app.ui.windows.functions.fadeOut($("#popup"));
 */
export async function fadeOut(element, fadeClass = "fade-out") {
    if (element && element.jquery) {
        element = element.get(0);
    }

    await app.ui.animation(element, fadeClass);

    // private window-cleanup afterwards
    if (element.remove) element.remove();
    app.ui.windows.functions.removeResizeListener();
}

/**
 * Returns the stacking order of .window elements from bottom -> top as an array.
 * - If multiple have the same z-index, DOM order is used as a tie-breaker.
 * - .active elements are always moved to the end of the array.
 * - The PARENT of a currently-active locked dialog is moved to just below
 *   it (see below) — without this, activating a dialog (which is what
 *   app.setActiveWindow actually does when its target has a dialog open,
 *   see window-modal.js's wrapper) only pulls the dialog itself to the
 *   top; the parent is left wherever it was already sorted, which can
 *   still be underneath some unrelated third window even though the
 *   dialog+overlay stacked directly above it in z-index give the visual
 *   impression the whole pair is "the active window".
 * - Can optionally apply sequential z-index values starting from baseZ.
 *
 * @param {Object} opts
 * @param {string} opts.selector - CSS selector (default '.window')
 * @param {number} opts.baseZ - starting value for new z-index (default 1)
 * @param {boolean} opts.applyZ - if true, assigns sequential z-index values
 * @param {boolean} opts.returnElements - if true, returns jQuery elements instead of IDs
 * @returns {Array} IDs/data-ids or jQuery elements
 */
export function getOrder({
    selector = ".window",
    baseZ = 1,
    applyZ = false,
    returnElements = false,
} = {}) {
    let mapped = $(selector)
        .map(function (index) {
            let z = parseInt($(this).css("z-index"), 10);
            if (isNaN(z)) z = 0;
            return { el: $(this), z: z, domIndex: index };
        })
        .get();

    // Sort by z-index first (lowest = bottom), then by DOM order for ties
    mapped.sort((a, b) => {
        if (a.z !== b.z) return a.z - b.z;
        return a.domIndex - b.domIndex;
    });

    // If the active window is a locked dialog, find its parent so it can be
    // carried up alongside it below.
    let activeParentId = null;
    if (app.windows && typeof app.windows.getWindowState === 'function') {
        for (const m of mapped) {
            if (!m.el.hasClass("active")) continue;
            const id = (m.el.attr("id") || "").replace(/-win$/, "");
            if (!id) continue;
            const state = app.windows.getWindowState(id);
            if (state.mode === "dialog" && state.parentId) activeParentId = state.parentId;
            break; // only one .active window ever exists
        }
    }

    // Separate active / active's-dialog-parent / everything else
    let active = mapped.filter((m) => m.el.hasClass("active"));
    let activeParent = activeParentId
        ? mapped.filter((m) => (m.el.attr("id") || "").replace(/-win$/, "") === activeParentId)
        : [];
    let nonActive = mapped.filter((m) => !m.el.hasClass("active") && !activeParent.includes(m));
    let ordered = nonActive.concat(activeParent).concat(active); // parent-of-active-dialog, then active, always last

    // Optionally apply new sequential z-index
    if (applyZ) {
        $.each(ordered, function (i, m) {
            m.el.css("z-index", baseZ + i);
        });
    }

    // Return jQuery elements or IDs
    return ordered.map((m) => {
        if (returnElements) return m.el;
        return m.el.attr("id") || m.el.data("id") || m.el;
    });
}

/**
 * Updates the title of a specific window.
 *
 * This function selects the window by its ID and updates its title.
 *
 * @param {string} windowId - The ID of the window to update.
 * @param {string} title - The new title to set for the window.
 */
export function updateTitle(windowId, title) {
    // Select the window element using the windowId
    const windowElement = $(`#${windowId}-win`);

    // Check if the window element exists
    if (windowElement.length) {
        // Update the title inside the window header
        app.dev.log(`Update window title to ${title}`, "Window");

        windowElement.find(".window-header .title").text(title);
    } else {
        app.dev.error(`Window with ID ${windowId} not found.`, "Window");
        throw new Error(`Stop: Window with ID ${windowId} does not exist.`);
    }
}

export function rename(windowId, newName) {
    const windowElement = $(`#${windowId}-win`);
    if (!windowElement.length) {
        app.dev.error(`Window with ID ${windowId} not found.`, "Window");
        return;
    }
    windowElement.find(".window-header .title").text(newName);
    if (app.desktop && app.desktop.taskbar && app.desktop.taskbar.config && Array.isArray(app.desktop.taskbar.config.taskIcons)) {
        const programId = windowId.replace(/-\d+$/, "");
        const iconData = app.desktop.taskbar.config.taskIcons.find(i => i.id === `pid-${programId}-task`);
        if (iconData) {
            iconData.name = newName;
            if (app.desktop.taskbar.overflow && app.desktop.taskbar.overflow.handle) {
                app.desktop.taskbar.overflow.handle();
            }
        }
    }
}

export function windowIcon(windowId, options) {
    const { type, path } = options;
    const windowElement = $(`#${windowId}-win`);
    if (!windowElement.length) {
        app.dev.error(`Window with ID ${windowId} not found.`, "Window");
        return;
    }
    const iconContainer = windowElement.find(".window-header .icon");
    if (iconContainer.length) {
        iconContainer.find("img, svg").remove();
        const newIconHtml = type === "svg"
            ? `<svg><use href="${path}"></use></svg>`
            : `<img src="${path}" alt="" />`;
        iconContainer.prepend(newIconHtml);
    }
    if (app.desktop && app.desktop.taskbar && app.desktop.taskbar.config && Array.isArray(app.desktop.taskbar.config.taskIcons)) {
        const programId = windowId.replace(/-\d+$/, "");
        const iconData = app.desktop.taskbar.config.taskIcons.find(i => i.id === `pid-${programId}-task`);
        if (iconData) {
            if (type === "svg") {
                iconData.svg = path;
                iconData.img = null;
            } else {
                iconData.img = path;
                iconData.svg = null;
            }
            if (app.desktop.taskbar.overflow && app.desktop.taskbar.overflow.handle) {
                app.desktop.taskbar.overflow.handle();
            }
        }
    }
}

/**
 * Retrieves all window IDs from elements with the class `.window`,
 * removes the '-number-win' part (where `number` is one or more digits)
 * from each ID, and returns an array of cleaned IDs.
 *
 * @function getAllWindowId
 * @returns {Array<string>} An array of cleaned window IDs, with the '-number-win' part removed.
 * @example
 * Retrieves all window IDs
 * windowIds = app.ui.windows.functions.getAllWindowId();
 */
export function getAllWindowId() {
    // Select the windows
    const windows = $(".window");
    const windowIds = [];

    // Loop through each window element
    windows.each(function () {
        // Get the ID of the window element
        const windowId = $(this).attr("id"); // Get the ID attribute of the element

        // Check if the ID exists
        if (windowId) {
            // Remove the '-number-win' part of the ID using a regular expression
            const cleanedId = windowId.replace(/(.*?)(-\d+-win)$/, "$1");
            windowIds.push(cleanedId); // Add the cleaned ID to the array
        }
    });

    // Return the array of cleaned window IDs
    return windowIds;
}

/**
 * Retrieves the current title of a specific window.
 *
 * This function selects the window by its ID and returns its current title.
 *
 * @param {string} windowId - The ID of the window to retrieve the title from.
 *
 * @returns {string} - The current title of the window.
 */
export function getTitle(windowId) {
    // Select the window element using the windowId
    const windowElement = $(`#${windowId}-win`);

    // Check if the window element exists
    if (windowElement.length) {
        // Return the current title inside the window header
        return windowElement.find(".window-header .title").text();
    } else {
        app.dev.error(`Window with ID ${windowId} not found.`, "Window");
        throw new Error(`Stop: Window with ID ${windowId} does not exist.`);
    }
}

/**
 * Toggles the display of the control menu when the window header icon is clicked or a context menu event occurs.
 * - Handles click and contextmenu events on `.window-header .icon` elements.
 * - Ensures only one control menu is visible at a time.
 * - Closes the control menu when clicking outside of it.
 *
 * Exported as `contextmenuToggle` (see file header — pairs with
 * `contextmenuMaximize` in window/lifecycle.js).
 * @function toggle
 * @memberof contextmenu
 * @example
 * app.ui.windows.functions.contextmenu.toggle();
 */
export function contextmenuToggle() {
    // Handle click event on the window header icon (img or svg)
    $(
        ".window .window-list .icon img, .window .window-list .icon svg"
    ).on("click contextmenu", function (e) {
        e.stopPropagation(); // Prevent the click event from propagating to parent elements
        e.preventDefault(); // Prevent default behavior (e.g., context menu)

        // Hide all other control menus and context menus
        $(".window .window-list .icon .control-menu")
            .not($(this).siblings(".control-menu"))
            .removeClass("show");
        $(".contextMenu").removeClass("show");

        // Toggle the control menu for the clicked window
        const $controlMenu = $(this).siblings(".control-menu");
        if ($controlMenu.hasClass("show")) {
            $controlMenu.removeClass("show"); // Hide the menu
        } else {
            $controlMenu.addClass("show"); // Show the menu
        }
    });

    // Close the control menu if clicking outside
    $(document).on("click contextmenu", function () {
        $(".window .control-menu").removeClass("show");
    });
}

const _iconCopyTitle = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

/**
 * Right-click "Copy title" on `.window-header .title`. The title bar is
 * deliberately NOT text-selectable (see ui.css) — it's the same element
 * jQuery UI's `draggable({handle: ".window-list"})` uses to move the
 * window, so a selectable title would fight every window-drag started from
 * on top of it. This context-menu entry is the title's only copy path,
 * matching how real desktop OSes handle title-bar text.
 *
 * Re-scans on every call (same rebind-per-window-creation pattern as
 * `contextmenuToggle` above) — a `_qmCopyTitleBound` marker on each title
 * element stops repeated calls from stacking duplicate `app.ui.contextMenu`
 * bindings on titles from windows opened earlier.
 */
export function contextmenuCopyTitle() {
    document.querySelectorAll(".window .window-list .title").forEach(titleEl => {
        if (titleEl._qmCopyTitleBound) return;
        titleEl._qmCopyTitleBound = true;
        app.ui.contextMenu(titleEl, {
            callback: () => [{
                title: () => _("Copy title"),
                icon: _iconCopyTitle,
                callback: () => app.util.copyToClipboard(titleEl.textContent, { successTitle: _("Title copied") }),
            }],
        });
    });
}

/**
 * Creates and adds the HTML structure of a window to the DOM.
 * @param {Object} options - Options for creating the window.
 * @param {string} options.id - Program ID or unique identifier.
 * @param {string} options.windowId - Unique window identifier.
 * @param {string} options.title - Title of the window.
 * @param {string} options.width - Width of the window.
 * @param {string} options.height - Height of the window.
 * @param {string} options.class - custom style of the window.
 * @param {boolean} [options.windowIcon=false] - Whether to show a window icon.
 * @param {string} [options.icontype='img'] - Type of icon (e.g., 'img' or 'svg').
 * @param {string} [options.icon=''] - URL or SVG reference for the icon.
 * @param {string} [options.taskbarIcon=''] - Taskbar icon.
 * @param {string} [options.mode] - Window mode, can be "normal" or "maximized". Default is "normal".
 * @param {Object} [options.controls={minimize: true, maximize: true, close: true}] - Control options for the window.
 * @param {boolean} [options.resizable=false] - Whether the window is resizable.
 * @param {Object} [options.menu] - Menu configuration object.
 * @param {Object} [options.menu.options] - Menu options like position and appearance.
 * @param {Object} [options.menu.options.colors] - Custom color theme for the menu.
 * @param {Object} [options.menu.options.colors.main] - Colors for the main menu.
 * @param {string} [options.menu.options.colors.main.background] - Background color for the main menu.
 * @param {string} [options.menu.options.colors.main.text] - Text color for the main menu.
 * @param {string} [options.menu.options.colors.main.hover] - Hover background color for main menu items.
 * @param {string} [options.menu.options.colors.main.iconFill] - Icon fill color for main menu icons.
 * @param {string} [options.menu.options.colors.main.shortcutColor] - Shortcut text color in main menu.
 * @param {Object} [options.menu.options.colors.submenu] - Colors for the submenu.
 * @param {string} [options.menu.options.colors.submenu.background] - Background color for submenu.
 * @param {string} [options.menu.options.colors.submenu.text] - Text color for submenu items.
 * @param {string} [options.menu.options.colors.submenu.textHover] - Hover text color for submenu items.
 * @param {string} [options.menu.options.colors.submenu.hover] - Hover background color for submenu items.
 * @param {string} [options.menu.options.colors.submenu.borderRadius] - Border radius for submenu.
 * @param {string|boolean} [options.menu.options.colors.submenu.boxShadow] - Box shadow for submenu.
 * @param {string} [options.menu.options.colors.submenu.padding] - Padding inside submenu.
 * @param {string} [options.menu.options.colors.submenu.menuitemBorderRadius] - Border radius for submenu items.
 * @param {string} [options.menu.options.colors.submenu.iconFill] - Icon fill color for submenu icons.
 * @param {string} [options.menu.options.colors.submenu.shortcutColor] - Shortcut text color in submenu.
 * @param {string} [options.menu.options.position='top'] - Position of menu bar ('top', 'left', 'bottom', 'right', 'window-title'). 'window-title' renders the menu bar inside the title row itself instead of as a separate row below it.
 * @param {boolean} [options.menu.options.mobileicon=true] - Whether to show mobile menu icon.
 * @param {string} [options.menu.options.class=''] - Additional CSS classes for the menu.
 * @param {Object} [options.menu.menu] - Menu items and their structure.
 * @param {Function} [options.body] - A function that returns the window's body content as a string.
 * @param {boolean} noprogram - Indicates whether the window is tied to a program.
 */
export function body(options, noprogram, windowobj) {
    // Extract necessary variables from options
    let id = options.id;
    let windowId = options.windowId;
    let title = options.title;
    let width = options.width;
    let height = options.height;
    let windowIcon = options.windowIcon;
    let mode = options.mode;
    let cssclass = options.class || "";
    let icontype = options.icontype || "img";
    let icon = options.icon || "";
    let taskbarIcon = options.taskbarIcon || "";
    let controls = options.controls || {
        minimize: true,
        maximize: true,
        close: true,
    };

    // Add eventId attribute if set
    let eventIdAttr = "";
    if (options.eventId) {
        eventIdAttr = ` data-event-id="${options.eventId}"`;
    }

    let resizable = options.resizable || false;
    let body = options.body ? options.body(windowobj) : "<p>Default content</p>";
    if (options.menu) {
        app.ui.windows.functions.setMainMenu(options.menu);
    }

    const compactMenuOpt   = options.compactMenu;
    const compactThreshold = options.compactThreshold ?? 350;

    let single = "";

    // Conditional behavior if the window is tied to a program
    if (!noprogram) {
        let programInfo = app.program.getInfo(id);
        if (programInfo) {
            icontype = programInfo.icontype || "img";
            icon = programInfo.icon || "";
            taskbarIcon = programInfo.name || "";
        }
        // before - Register callback before window is created
        triggerEvent(windowobj.windowId, "before", windowobj);

    } else {
        app.dev.log(
            "No program linked. Using default values.",
            "UI Window"
        );

        if (typeof options.windowIcon === "string") icon = options.windowIcon;
        taskbarIcon = options.title || "";
    }

    if (options.single) {
        icontype = options.icontype || "img";
        if (typeof options.windowIcon === "string") icon = options.windowIcon;
        taskbarIcon = options.title || "";
        single = "single";
    }

    if (mode == "maximized") {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const taskbarElement = document.querySelector(".taskbar-s");

        if (taskbarElement) {
            const taskbarRect = taskbarElement.getBoundingClientRect();

            if (taskbarElement.classList.contains("taskbar-left")) {
                width = windowWidth - taskbarRect.width + "px";
                height = windowHeight + "px";
            } else if (taskbarElement.classList.contains("taskbar-right")) {
                width = windowWidth - taskbarRect.width + "px";
                height = windowHeight + "px";
            } else if (taskbarElement.classList.contains("taskbar-top")) {
                width = windowWidth + "px";
                height = windowHeight - taskbarRect.height + "px";
            } else if (taskbarElement.classList.contains("taskbar-bottom")) {
                width = windowWidth + "px";
                height = windowHeight - taskbarRect.height + "px";
            } else {
                width = windowWidth + "px";
                height = windowHeight + "px";
            }
        } else {
            width = windowWidth + "px";
            height = windowHeight + "px";
        }
    }

    // Generate menu HTML if menu options are provided
    let menuHTML = "";
    let menuPosition = "top";
    let menuMobileIcon = false;
    let menuClass = "";
    let hasMenu = false;
    let windowTitleText = "visible";
    const clickHandlers = {};
    let handlerId = 0;
    let menu = app.ui.windows.functions.getMainMenu();

    if (menu && menu.options) {
        hasMenu = true;
        menuPosition = menu.options.position || "top";
        menuMobileIcon =
            menu.options.mobileicon !== undefined
                ? menu.options.mobileicon
                : true;
        menuClass = menu.options.class || "";
        windowTitleText = menu.options.windowTitleText || "visible";
    }
    const menuInTitle = menuPosition === "window-title";
    const titleHidden = windowTitleText === "hidden";

    // Function to create menu HTML structure
    /**
     * Builds the HTML string for the window menu bar and all nested submenus.
     *
     * Menu items are defined as a plain object whose keys are the visible labels.
     * Any item whose key starts with `"---"` (or whose value is `"---"` or
     * `{ separator: true }`) is rendered as a horizontal divider instead of a
     * clickable row. Use a unique suffix to add multiple separators in the same
     * level, e.g. `"--- "`, `"---2"`.
     *
     * @param {Object} menuObj - Menu definition object.
     * @param {Object} menuObj.menu - Top-level menu entries keyed by label.
     * @param {Object} [menuObj.options] - Display options (position, class, etc.).
     * @returns {string} HTML string for the complete menu structure.
     *
     * @example
     * {
     *   menu: {
     *     "File": {
     *       children: {
     *         "Open":  { id: "open",  click: fn },
     *         "Save":  { id: "save",  click: fn },
     *         "---":   {},                        // separator
     *         "Exit":  { id: "exit",  click: fn }
     *       }
     *     },
     *     "Edit": {
     *       children: {
     *         "Undo":  { id: "undo",  click: fn, shortcut: "Ctrl+Z" },
     *         "---":   {},
     *         "Cut":   { id: "cut",   click: fn },
     *         "Copy":  { id: "copy",  click: fn },
     *         "--- 2": {},
     *         "Paste": { id: "paste", click: fn }
     *       }
     *     }
     *   }
     * }
     */
    function createMenuList(menuObj) {
        if (!menuObj || !menuObj.menu) return "";

        function createList(obj, isSubmenu = false, level = 0) {
            const ulClass = isSubmenu ? "submenu" : "wm-menu";
            let ulHtml = `<ul class="${ulClass}">`;

            for (const key in obj) {
                const item = obj[key];

                // Separator: key starts with "---" or item is the string "---" or { separator: true }
                if (key.startsWith("---") || item === "---" || (item && item.separator)) {
                    ulHtml += `<li class="menu-separator"></li>`;
                    continue;
                }

                let liClass = "menu-item";
                if (!isSubmenu) liClass += " level-0";
                if (item.children) liClass += " has-submenu";

                let handlerAttr = "";
                if (item.click) {
                    const currentId = `handler_${windowId}_${handlerId++}`;
                    clickHandlers[currentId] = item.click;
                    handlerAttr = ` data-click-ref="${currentId}"`;
                }

                // Add right attribute if it exists
                const rightAttr = item.right
                    ? ` data-right="${item.right}"`
                    : "";

                ulHtml += `<li class="${liClass}"${handlerAttr}${rightAttr}>`;
                ulHtml += `<div class="wm-item-row"><div class="wm-title">`;

                if (item.icon) {
                    ulHtml += `<div class="wm-icon">${item.icon}</div>`;
                }

                ulHtml += `<div class="wm-r10"> ${key} </div></div>`;

                if (level > 0 && item.children) {
                    ulHtml += `<div class="wm-icon arrow"><svg class="wm-item-svg"><use href="#ic-arrow-right"></use></svg></div>`;
                }

                if (item.shortcut) {
                    ulHtml += `<div class="shortcut">(${item.shortcut})</div>`;
                }

                ulHtml += `</div>`;

                if (item.children) {
                    ulHtml += createList(item.children, true, level + 1);
                }

                ulHtml += `</li>`;
            }

            return ulHtml + `</ul>`;
        }

        return createList(menuObj.menu);
    }

    function cssRule(prop, val, allowInitial = false) {
        if (val === undefined || val === "") return "";
        if (val === false) return allowInitial ? `${prop}: initial;` : "";
        return `${prop}: ${val};`;
    }

    // Generate menu HTML if menu exists
    if (menu && menu.menu) {
        menuHTML = createMenuList(menu);

        if (menu?.options?.colors) {
            const c = {
                main: menu.options.colors.main || {},
                submenu: menu.options.colors.submenu || {}
            };
            app.addProgramCSS(
                id,
                `window-menu-theme-${windowId}`,
                `
                /* Main menu */
                .window#${windowId}-win .menu-container .wm-menu {
                    ${cssRule(
                    "background-color",
                    c.main.background
                )}
                    ${cssRule("color", c.main.text)}
                }

                .window#${windowId}-win .menu-container .wm-menu > .menu-item {
                    ${cssRule("color", c.main.text)}
                }

                .window#${windowId}-win .menu-container .wm-menu > .menu-item:hover {
                    ${cssRule("background-color", c.main.hover)}
                }

                .window#${windowId}-win .menu-container .wm-menu .wm-icon svg {
                    ${cssRule("fill", c.main.iconFill)}
                }

                .window#${windowId}-win .menu-container .wm-menu .shortcut {
                    ${cssRule("color", c.main.shortcutColor)}
                }

                /* Submenu */
                .window#${windowId}-win .menu-container .wm-menu .submenu {
                    ${cssRule(
                    "background",
                    c.submenu.background
                )}
                    ${cssRule("color", c.submenu.text)}
                    ${cssRule(
                    "border-radius",
                    c.submenu.borderRadius,
                    true
                )}
                    ${cssRule(
                    "box-shadow",
                    c.submenu.boxShadow,
                    true
                )}
                    ${cssRule(
                    "padding",
                    c.submenu.padding,
                    true
                )}
                }

                .window#${windowId}-win .menu-container .wm-menu .submenu .menu-item {
                    ${cssRule(
                    "border-radius",
                    c.submenu.menuitemBorderRadius,
                    true
                )}
                }

                .window#${windowId}-win .menu-container .wm-menu .submenu .menu-item:hover {
                    ${cssRule(
                    "background-color",
                    c.submenu.hover
                )}
                    ${cssRule("color", c.submenu.textHover)}
                    transition: none;
                }

                .window#${windowId}-win .menu-container .wm-menu .submenu .wm-icon svg {
                    ${cssRule("fill", c.submenu.iconFill)}
                }

                .window#${windowId}-win .menu-container .wm-menu .submenu .shortcut {
                    ${cssRule("color", c.submenu.shortcutColor)}
                }
            `
            );
        }
    }

    // Function to attach menu event listeners
    function attachMenuEvents(winId) {
        const winElement = document.getElementById(`${winId}-win`);
        if (!winElement) return;

        const openSubmenus = new Set();

        let menuInteractionLocked = false;

        function showSubmenu(submenu, anchorEl, isTopLevel) {
            if (!submenu._menuParent) submenu._menuParent = submenu.parentElement;
            submenu._anchorEl   = anchorEl;
            submenu._isTopLevel = isTopLevel;
            const rect = anchorEl.getBoundingClientRect();
            submenu.style.position = "fixed";
            submenu.style.zIndex = "99999";
            if (isTopLevel) {
                submenu.style.top  = rect.bottom + "px";
                submenu.style.left = rect.left   + "px";
            } else {
                submenu.style.top  = rect.top   + "px";
                submenu.style.left = rect.right + "px";
            }
            submenu.classList.add("wm-floating");
            document.body.appendChild(submenu);
            submenu.style.display = "block";
            openSubmenus.add(submenu);
            // Clamp to viewport after paint
            requestAnimationFrame(() => {
                const smRect = submenu.getBoundingClientRect();
                if (smRect.right > window.innerWidth) {
                    submenu.style.left = isTopLevel
                        ? (rect.right - smRect.width) + "px"
                        : (rect.left  - smRect.width) + "px";
                }
                if (smRect.bottom > window.innerHeight) {
                    submenu.style.top = isTopLevel
                        ? (rect.top    - smRect.height) + "px"
                        : (rect.bottom - smRect.height) + "px";
                }
            });
        }

        function hideSubmenu(submenu) {
            submenu.style.display = "none";
            submenu.classList.remove("wm-floating");
            openSubmenus.delete(submenu);
            if (submenu._menuParent && !submenu._menuParent.contains(submenu)) {
                submenu._menuParent.appendChild(submenu);
            }

            void submenu.offsetHeight;
            void document.body.offsetHeight;
        }

        function hideAllSubmenus() {
            openSubmenus.forEach(sm => hideSubmenu(sm));

            const strays = document.querySelectorAll(".submenu.wm-floating");
            strays.forEach((sm) => {
                sm.style.display = "none";
                sm.classList.remove("wm-floating");
                void sm.offsetHeight; // force immediate repaint - see hideSubmenu's own comment
            });
            void document.body.offsetHeight;
        }

        // Close submenus on resize; reposition floating submenus during drag
        $(winElement).on("resizestart.menu-" + winId, hideAllSubmenus);
        $(winElement).on("drag.menu-" + winId, function () {
            openSubmenus.forEach(function (sm) {
                if (!sm._anchorEl) return;
                const r = sm._anchorEl.getBoundingClientRect();
                if (sm._isTopLevel) {
                    sm.style.top  = r.bottom + "px";
                    sm.style.left = r.left   + "px";
                } else {
                    sm.style.top  = r.top   + "px";
                    sm.style.left = r.right + "px";
                }
            });
        });

        // Handle click events for menu items
        const menuItems = winElement.querySelectorAll(".menu-item");
        menuItems.forEach((item) => {
          try {
            // Prevent mousedown from stealing focus/selection from inputs inside the window.
            item.addEventListener("mousedown", function (e) {
                e.preventDefault();
            });

            const clickRef = item.getAttribute("data-click-ref");

            if (clickRef) {
                item.addEventListener("click", function (e) {
                    e.stopPropagation();

                    if (typeof app.setActiveWindow === "function") app.setActiveWindow(winId);

                    menuInteractionLocked = true;

                    try {
                        const handler = clickHandlers[clickRef];
                        if (typeof handler === "function") {
                            handler();
                        }
                    } catch (error) {
                        console.error("Error executing menu click handler:", error);
                    }
                    hideAllSubmenus();

                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            menuInteractionLocked = false;
                        });
                    });
                });
                item.removeAttribute("data-click-ref");
            }

            // Handle submenu toggle for items with children
            if (item.classList.contains("has-submenu")) {
                const submenu = item.querySelector(".submenu");
                const isTopLevel = item.classList.contains("level-0");

                if (submenu) submenu.style.display = "none";

                item.addEventListener("click", function (e) {
                    if (!submenu) return;
                    e.stopPropagation();

                    if (typeof app.setActiveWindow === "function") app.setActiveWindow(winId);

                    if (submenu.style.display === "block") {
                        hideSubmenu(submenu);
                    } else {
                        // Close any other open top-level submenus first
                        if (isTopLevel) hideAllSubmenus();
                        showSubmenu(submenu, item, isTopLevel);
                    }
                });


                if (!isTopLevel && item.closest(".submenu")) {
                    let hideTimer = null;
                    const cancelHide = () => {
                        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                    };
                    const scheduleHide = () => {
                        cancelHide();
                        hideTimer = setTimeout(() => {
                            if (submenu) hideSubmenu(submenu);
                            hideTimer = null;
                        }, 250);
                    };

                    item.addEventListener("mouseenter", function () {
                        if (!submenu) return;
                        if (menuInteractionLocked) {
                            cancelHide();
                            return;
                        }
                        cancelHide();
                        showSubmenu(submenu, item, false);
                    });
                    item.addEventListener("mouseleave", scheduleHide);

                    if (submenu) {
                        submenu.addEventListener("mouseenter", cancelHide);
                        submenu.addEventListener("mouseleave", scheduleHide);
                    }
                }
            }
          } catch (error) {
            console.error("Error wiring up menu item, skipping it (rest of the menu is unaffected):", error, item);
          }
        });

        // ── Keyboard navigation (ARIA menubar pattern) ──────────────────
        // Every item is tabindex="-1" - deliberately NOT part of the
        // window's normal Tab order (this is a skip-navigation target, see
        // Tab+M in components/keynav.js, not something tabbed through
        // linearly). Arrow keys move focus once inside; Enter/Space
        // re-enters the exact same click handler already wired above
        // (item.click()) rather than duplicating its logic. Reuses this
        // closure's own showSubmenu/hideSubmenu/hideAllSubmenus so keyboard
        // and mouse interaction share one source of truth for what's open.
        const allMenuItems = Array.from(menuItems);
        allMenuItems.forEach((i) => i.setAttribute("tabindex", "-1"));

        function siblingsOf(item) {
            return Array.from(item.parentElement.children).filter((el) => el.classList.contains("menu-item"));
        }
        // submenu._anchorEl (set by showSubmenu above) is the only reliable
        // way back up a level once a submenu has been reparented onto
        // document.body - .closest() up the live DOM won't reach the
        // window anymore at that point.
        function parentItemOf(item) {
            const sm = item.closest(".submenu");
            return sm ? sm._anchorEl || null : null;
        }
        // Takes the submenu element itself, not its (former) parent item -
        // showSubmenu() reparents it onto document.body, so by the time this
        // runs, `item.querySelector(":scope > .submenu")` would find nothing.
        function firstChildOf(submenuEl) {
            return submenuEl ? submenuEl.querySelector(":scope > .menu-item") : null;
        }
        function exitMenuNav() {
            hideAllSubmenus();
            winElement.dispatchEvent(new CustomEvent("sandstorm:menu-exit"));
        }

        // Bound on document (not winElement) and filtered via allMenuItems -
        // showSubmenu() reparents open submenus onto document.body, so once
        // a submenu is open, its items are no longer descendants of
        // winElement and a listener bound there would stop receiving their
        // keydown events entirely. Namespaced like the click listener below,
        // for the same reason: no explicit cleanup on window close (an
        // already-accepted characteristic of that listener, not new here).
        $(document).on("keydown.menu-" + winId, function (e) {
            const item = e.target && e.target.closest ? e.target.closest(".menu-item") : null;
            if (!item || !allMenuItems.includes(item)) return;

            const isTopLevel = item.classList.contains("level-0");
            const hasSubmenu = item.classList.contains("has-submenu");
            const submenu = hasSubmenu ? item.querySelector(":scope > .submenu") : null;

            if (e.key === "ArrowRight") {
                e.preventDefault();
                if (isTopLevel) {
                    // If a submenu was already open, moving between top-level
                    // items keeps that "menu is engaged" state going - the
                    // newly-focused item's own submenu opens too, replacing
                    // the old one (standard menu-bar behavior). If nothing
                    // was open, Right/Left just moves focus along the bar.
                    const wasOpen = openSubmenus.size > 0;
                    const sibs = siblingsOf(item);
                    const next = sibs[(sibs.indexOf(item) + 1) % sibs.length];
                    if (wasOpen) hideAllSubmenus();
                    next?.focus();
                    if (wasOpen && next && next.classList.contains("has-submenu")) {
                        const nextSubmenu = next.querySelector(":scope > .submenu");
                        if (nextSubmenu) showSubmenu(nextSubmenu, next, true);
                    }
                } else if (hasSubmenu && submenu) {
                    showSubmenu(submenu, item, false);
                    firstChildOf(submenu)?.focus();
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (isTopLevel) {
                    const wasOpen = openSubmenus.size > 0;
                    const sibs = siblingsOf(item);
                    const prev = sibs[(sibs.indexOf(item) - 1 + sibs.length) % sibs.length];
                    if (wasOpen) hideAllSubmenus();
                    prev?.focus();
                    if (wasOpen && prev && prev.classList.contains("has-submenu")) {
                        const prevSubmenu = prev.querySelector(":scope > .submenu");
                        if (prevSubmenu) showSubmenu(prevSubmenu, prev, true);
                    }
                } else {
                    const parent = parentItemOf(item);
                    const parentSubmenu = item.closest(".submenu");
                    if (parentSubmenu) hideSubmenu(parentSubmenu);
                    parent?.focus();
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (isTopLevel && hasSubmenu && submenu) {
                    hideAllSubmenus();
                    showSubmenu(submenu, item, true);
                    firstChildOf(submenu)?.focus();
                } else if (!isTopLevel) {
                    const sibs = siblingsOf(item);
                    sibs[(sibs.indexOf(item) + 1) % sibs.length]?.focus();
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!isTopLevel) {
                    const sibs = siblingsOf(item);
                    sibs[(sibs.indexOf(item) - 1 + sibs.length) % sibs.length]?.focus();
                }
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (hasSubmenu && submenu) {
                    showSubmenu(submenu, item, isTopLevel);
                    firstChildOf(submenu)?.focus();
                } else {
                    item.click();
                    exitMenuNav();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                exitMenuNav();
            }
        });

        // Close all submenus when clicking outside any menu
        $(document).on("click.menu-" + winId, function (e) {
            if (!$(e.target).closest(".menu-container, .submenu").length) {
                hideAllSubmenus();
            }
        });
    }

    (function () {
        const ws = app.desktop.getWorkspaceRect();
        const wNum = parseInt(width,  10);
        const hNum = parseInt(height, 10);
        if (!isNaN(wNum) && !String(width).includes('%')  && wNum > ws.width)  width  = ws.width  + 'px';
        if (!isNaN(hNum) && !String(height).includes('%') && hNum > ws.height) height = ws.height + 'px';
    })();

    const marginBottom = 10;
    const windowList = 43;

    let contentHTML = "";

    let numericHeight = parseInt(height, 10);
    let styleHeight = `height: max(${numericHeight - (marginBottom + windowList)
        }px, calc(100% - ${marginBottom + windowList}px))`;

    // Build content HTML depending on whether there's a menu and its position.
    // 'window-title' renders the menu inside .window-header instead (see below),
    // so content-wrapper here is just the plain content block.
    if (hasMenu && !menuInTitle) {
        contentHTML = `
            <div class="content-wrapper ${menuPosition}-menu-position" style="${styleHeight}">
                ${menuPosition === "top" ||
                menuPosition === "left"
                ? `<div class="menu-container ${menuPosition} ${menuClass}">${menuHTML}</div><div class="content">${body}</div>`
                : `<div class="content">${body}</div><div class="menu-container ${menuPosition} ${menuClass}">${menuHTML}</div>`
            }
            </div>`;
        this.resetMainMenu();
    } else if (hasMenu && menuInTitle) {
        contentHTML = `<div class="content" style="${styleHeight}">${body}</div>`;
        this.resetMainMenu();
    } else {
        // No menu present — just a simple content block
        contentHTML = `<div class="content" style="${styleHeight}">${body}</div>`;
    }

    // Build the window HTML
    const windowHTML = `
    <div class="window pid-${id} ${single} ${mode} ${cssclass}" ${eventIdAttr} id="${windowId}-win" style="width: ${width}; height: ${height}; opacity: 0; transform: scale(1); position: absolute; top: 0; left: 0; transition: opacity 1s ease-out, width 400ms ease-out, height 400ms ease-out;">
        <div class="window-list">
            <div class="window-header${menuInTitle ? " menu-in-title" : ""}">
                ${windowIcon
            ? `
                    <div class="icon">
                        ${icontype === "svg"
                ? `<svg title="${taskbarIcon}"><use href="${icon}"></use></svg>`
                : `<img src="${icon}" title="${title}" />`
            }
                        <div class="control-menu">
                            ${controls.minimize
                ? `<div class="minimize ctm-row"><div class="ctm-title" title="${_(
                    "Minimize"
                )}"><span style="margin-right: 10px;"><svg><use href="#ic-bts-min"></use></svg></span> <span>${_(
                    "Minimize"
                )}</span></div></div>`
                : ""
            }
                            ${resizable && controls.maximize
                ? `<div class="maximize ctm-row"><div class="ctm-title" title="${_(
                    "Maximize"
                )}"><span style="margin-right: 10px;"><svg><use href="#ic-bts-maximize"></use></svg></span> <span>${_(
                    "Maximize"
                )}</span></div></div>`
                : ""
            }
                            ${controls.close
                ? `<div class="close ctm-row"><div class="ctm-title" title="${_(
                    "Close"
                )}"><span style="margin-right: 10px;"><svg><use href="#ic-bts-close"></use></svg></span> <span>${_(
                    "Close"
                )}</span></div></div>`
                : ""
            }
                        </div>
                    </div>`
            : ""
        }
                <div class="title"${titleHidden ? ' style="display:none;"' : ''}>${title}</div>
                ${menuInTitle
            ? `<div class="menu-container ${menuPosition} ${menuClass}">${menuHTML}</div>`
            : ""}
            </div>
            ${options.headerButtons
            ? `<div class="window-header-group">${options.headerButtons}</div>`
            : ""}
            <div class="controls">
                ${menuMobileIcon
            ? `<div class="menu-mobile" title="${_(
                "Menu"
            )}"><svg><use href="#ic-menu"></use></svg></div>`
            : ""
        }
                ${controls.minimize
            ? `<div class="minimize" title="${_(
                "Minimize"
            )}"><svg><use href="#ic-bts-min"></use></svg></div>`
            : ""
        }
                ${resizable && controls.maximize
            ? `<div class="maximize" title="${_(
                "Maximize"
            )}"><svg><use href="#ic-bts-maximize"></use></svg></div>`
            : ""
        }
                ${controls.close
            ? `<div class="close" title="${_(
                "Close"
            )}"><svg><use href="#ic-bts-close"></use></svg></div>`
            : ""
        }
            </div>
        </div>
        ${contentHTML}
    </div>`;

    // Add the window to the DOM
    document.body.insertAdjacentHTML("beforeend", windowHTML);

    // Initialize menu after DOM insertion
    if (hasMenu) {
        setTimeout(() => attachMenuEvents(windowId), 0);
    }

    if (hasMenu && menuInTitle && menuMobileIcon) {
        setTimeout(() => {
            const winEl = document.getElementById(`${windowId}-win`);
            if (!winEl) return;

            const headerEl = winEl.querySelector('.window-header');
            const iconEl = winEl.querySelector('.window-header .icon');
            const controlMenu = iconEl && iconEl.querySelector('.control-menu');
            const menuEl = winEl.querySelector('.window-header > .menu-container');
            if (!headerEl || !iconEl || !controlMenu || !menuEl) return; // no icon to overflow into — stay inline

            const naturalWidth = headerEl.scrollWidth;
            let collapsed = false;
            let separator = null;

            function collapseMenu() {
                if (collapsed) return;
                collapsed = true;
                menuEl.classList.add('in-overflow');
                separator = document.createElement('div');
                separator.className = 'compact-separator';
                separator.dataset.overflowMenu = '1';
                controlMenu.appendChild(separator);
                controlMenu.appendChild(menuEl);
            }

            function expandMenu() {
                if (!collapsed) return;
                collapsed = false;
                menuEl.classList.remove('in-overflow');
                headerEl.appendChild(menuEl);
                if (separator) { separator.remove(); separator = null; }
            }

            const ro = new ResizeObserver(() => {
                if (!winEl.isConnected) { ro.disconnect(); return; }
                const available = headerEl.clientWidth;
                if (naturalWidth > available && !collapsed) collapseMenu();
                else if (naturalWidth <= available && collapsed) expandMenu();
            });
            ro.observe(headerEl);
        }, 0);
    }

    if (app.exists("app.desktop.startmenu.hide")) {
        app.desktop.startmenu.hide();
    }

    app.ui.windows.functions.addResizeListener();

    // On mobile viewport: apply column layout immediately when window opens
    // (skip maximized windows — their layout is handled by CSS)
    if (window.innerWidth <= app.config.local.breakpoints.mobile && mode !== 'maximized' && typeof app.desktop.responsiveArrange === 'function') {
        app.desktop.responsiveArrange();
    }

    // Mobile menu toggle
    if (menuMobileIcon) {
        const menuMobileButton = document.querySelector(
            `#${windowId}-win .menu-mobile`
        );
        const menuContainer = document.querySelector(
            `#${windowId}-win .menu-container`
        );

        if (menuMobileButton && menuContainer) {
            menuMobileButton.addEventListener("click", function (e) {
                e.stopPropagation();
                menuContainer.style.display =
                    menuContainer.style.display === "none" ? "block" : "none";
            });
        }
    }

    // Optional: Clean up click handlers when window is closed
    const closeButton = document.querySelector(`#${windowId}-win .close`);
    if (closeButton) {
        closeButton.addEventListener("click", function () {
            // Clear all click handlers associated with this window
            Object.keys(clickHandlers).forEach((key) => {
                if (key.includes(`handler_${windowId}_`)) {
                    delete clickHandlers[key];
                }
            });
        });
    }

    // ── Compact mode: hide menu-container and expose items via icon ──────────
    if (compactMenuOpt !== undefined && compactMenuOpt !== false) {
        setTimeout(() => {
            const winEl       = document.getElementById(`${windowId}-win`);
            if (!winEl) return;

            const menuContainer = winEl.querySelector('.menu-container');
            const iconEl        = winEl.querySelector('.window-header .icon');
            const controlMenu   = iconEl && iconEl.querySelector('.control-menu');

            // Build flat list of compact items
            let compactItems = [];

            if (Array.isArray(compactMenuOpt)) {
                compactItems = compactMenuOpt;
            } else if (compactMenuOpt === true && menu && menu.menu) {
                (function extractLeafs(obj, breadcrumb) {
                    for (const [key, val] of Object.entries(obj)) {
                        if (key.startsWith('---')) continue;
                        if (typeof val.click === 'function') {
                            compactItems.push({
                                text: breadcrumb ? breadcrumb + ' › ' + key : key,
                                icon: val.icon || '',
                                click: val.click
                            });
                        } else if (val.children) {
                            extractLeafs(val.children, breadcrumb ? breadcrumb + ' › ' + key : key);
                        }
                    }
                })(menu.menu, '');
            }

            let isCompact = false;

            function _ghostIcon() {
                if (!iconEl) return;
                const svgEl = iconEl.querySelector('svg');
                const imgEl = iconEl.querySelector('img');
                const ref   = svgEl || imgEl || iconEl;
                const rect  = ref.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const ghost = document.createElement('span');
                ghost.style.cssText =
                    'position:fixed;pointer-events:none;z-index:99999;' +
                    `left:${rect.left}px;top:${rect.top}px;` +
                    `width:${rect.width}px;height:${rect.height}px;` +
                    'opacity:0.55;transform:scale(1);display:block;' +
                    'transform-origin:center center;';
                if (svgEl) {
                    const useEl = svgEl.querySelector('use');
                    const href  = useEl ? (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '') : '';
                    const vb    = svgEl.getAttribute('viewBox') || `0 0 ${rect.width} ${rect.height}`;
                    ghost.innerHTML = `<svg width="${rect.width}" height="${rect.height}" viewBox="${vb}" style="display:block;"><use href="${href}"></use></svg>`;
                } else if (imgEl) {
                    ghost.innerHTML = `<img src="${imgEl.src}" style="width:100%;height:100%;object-fit:contain;">`;
                } else {
                    const cs = getComputedStyle(ref);
                    ghost.style.backgroundImage    = cs.backgroundImage;
                    ghost.style.backgroundSize     = 'contain';
                    ghost.style.backgroundRepeat   = 'no-repeat';
                    ghost.style.backgroundPosition = 'center';
                }
                document.body.appendChild(ghost);
                requestAnimationFrame(() => {
                    ghost.style.transition = 'transform 0.45s ease-out, opacity 0.45s ease-out';
                    ghost.style.transform  = 'scale(2.4)';
                    ghost.style.opacity    = '0';
                    setTimeout(() => ghost.remove(), 500);
                });
            }

            function enterCompact() {
                if (isCompact) return;
                isCompact = true;
                winEl.classList.add('toolbar-compact');
                _ghostIcon();

                if (menuContainer) {
                    const h = menuContainer.scrollHeight;
                    menuContainer.style.transition = 'none';
                    menuContainer.style.overflow   = 'hidden';
                    menuContainer.style.maxHeight  = h + 'px';
                    menuContainer.style.opacity    = '1';
                    menuContainer.offsetHeight;  // force reflow to commit starting state
                    menuContainer.style.transition = 'max-height 0.22s ease, opacity 0.18s ease';
                    menuContainer.style.maxHeight  = '0';
                    menuContainer.style.opacity    = '0';
                    setTimeout(() => {
                        menuContainer.style.display    = 'none';
                        menuContainer.style.maxHeight  = '';
                        menuContainer.style.opacity    = '';
                        menuContainer.style.transition = '';
                        menuContainer.style.overflow   = '';
                    }, 230);
                }

                if (!controlMenu || compactItems.length === 0) return;

                const sep = document.createElement('div');
                sep.className = 'compact-separator';
                sep.dataset.compact = '1';
                controlMenu.appendChild(sep);

                compactItems.forEach(item => {
                    if (item.separator) return;
                    const row = document.createElement('div');
                    row.className = 'compact-item ctm-row';
                    row.dataset.compact = '1';
                    const iconHTML = item.icon
                        ? `<span style="margin-right:8px;display:inline-flex;align-items:center"><svg style="width:14px;height:14px"><use href="${item.icon}"></use></svg></span>`
                        : '';
                    row.innerHTML = `<div class="ctm-title">${iconHTML}<span>${item.text || ''}</span></div>`;
                    if (typeof item.click === 'function') {
                        row.addEventListener('click', e => {
                            e.stopPropagation();
                            item.click();
                            controlMenu.classList.remove('show');
                        });
                    }
                    controlMenu.appendChild(row);
                });
            }

            function exitCompact() {
                if (!isCompact) return;
                isCompact = false;
                winEl.classList.remove('toolbar-compact');
                _ghostIcon();

                if (controlMenu) {
                    controlMenu.querySelectorAll('[data-compact="1"]').forEach(el => el.remove());
                }

                if (menuContainer) {
                    menuContainer.style.display    = '';
                    menuContainer.style.transition = 'none';
                    menuContainer.style.overflow   = 'hidden';
                    menuContainer.style.maxHeight  = '0';
                    menuContainer.style.opacity    = '0';
                    menuContainer.offsetHeight;  // force reflow to commit starting state
                    const h = menuContainer.scrollHeight;
                    menuContainer.style.transition = 'max-height 0.22s ease, opacity 0.18s ease';
                    menuContainer.style.maxHeight  = h + 'px';
                    menuContainer.style.opacity    = '1';
                    const onEnd = () => {
                        menuContainer.style.maxHeight  = '';
                        menuContainer.style.overflow   = '';
                        menuContainer.style.opacity    = '';
                        menuContainer.style.transition = '';
                    };
                    menuContainer.addEventListener('transitionend', onEnd, { once: true });
                }
            }

            const ro = new ResizeObserver(([entry]) => {
                if (!winEl.isConnected) { ro.disconnect(); return; }
                const w = entry.contentRect.width;
                if (w < compactThreshold && !isCompact) enterCompact();
                else if (w >= compactThreshold && isCompact) exitCompact();
            });

            ro.observe(winEl);
        }, 0);
    }
}
