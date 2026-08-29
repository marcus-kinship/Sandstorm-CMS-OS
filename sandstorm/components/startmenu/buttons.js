/**
 * @file startmenu/buttons.js
 * @description Start-menu logoff/help button registration and binding —
 * `logoffButton`/`helpButton` (public, called as `app.desktop.startmenu`
 * methods) plus the private wiring they rely on: `_bindMenuButton`,
 * `_bindAllButtons` (called from `core.js`'s `build()`), the logoff flyout
 * menu builder, and its positioning helper.
 *
 * Split out of the original monolithic startmenu.js — moved verbatim, no
 * logic changes.
 *
 * @module components/startmenu/buttons
 */
import { _buttons, isLogoffButtonSet, markLogoffButtonSet, isHelpButtonSet, markHelpButtonSet } from './state.js';

/** @type {boolean} */
let _logoffMenuHandlerAdded = false;

/**
 * Bind the logoff button.
 * @param {string} fnName - Optional app function name to call on click
 */
export function logoffButton(config) {
    markLogoffButtonSet();

    // Support both old string format and new config object
    if (typeof config === 'string') {
        if (!_buttons.some(b => b.id === "ic-logoff")) {
            _buttons.push({ id: "ic-logoff", fnName: config });
        }
    } else if (typeof config === 'object') {
        if (!_buttons.some(b => b.id === "ic-logoff")) {
            _buttons.push({ id: "ic-logoff", fnName: config });
        }
    } else {
        // Default behavior

        if (!_buttons.some(b => b.id === "ic-logoff")) {
            _buttons.push({ id: "ic-logoff", fnName: null });
        }
    }
}

/**
 * Bind the help button.
 * @param {string} fnName - Optional app function name to call on click
 */
export function helpButton(fnName) {
    markHelpButtonSet();
    if (!_buttons.some(b => b.id === "ic-helped")) {
        _buttons.push({ id: "ic-helped", fnName });
    }
}

/**
 * Binds a button by ID and configures either:
 * - a custom logoff menu (if `fnName` is an object with menu configuration), or
 * - a standard function call using a string reference to app.* functions.
 *
 * @param {string} id - The ID of the element to bind.
 * @param {string|Object} fnName - A string pointing to an app function or a configuration object for the logoff menu.
 */
function _bindMenuButton(id, fnName) {
    const el = $('#' + id)[0];
    if (!el) return;

    // SPECIAL CASE — LOGOFF MENU BUTTON
    if (id === "ic-logoff" && typeof fnName === "object" && fnName !== null && fnName.menuItem) {
        const config = fnName;
        let menuElement = null;

        const toggleMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Create menu only once
            if (!menuElement) {
                menuElement = createLogoffMenu(config);
                menuElement.dataset.menuOwner = id;
                document.body.appendChild(menuElement);
            }

            // Toggle visibility
            menuElement.classList.toggle("show");

            // Reposition on open
            if (menuElement.classList.contains("show")) {
                positionMenu(menuElement, el, config.direction || "top");
            }
        };

        // Left click
        el.onclick = toggleMenu;

        // Right click
        el.addEventListener("contextmenu", toggleMenu);

        // ONE global outside-click handler (handles both left and right clicks)
        if (!_logoffMenuHandlerAdded) {
            const closeMenus = (e) => {
                const menus = document.querySelectorAll(".logoff-menu.show");
                menus.forEach(menu => {
                    const owner = $('#' + menu.dataset.menuOwner)[0];
                    if (owner && !owner.contains(e.target) && !menu.contains(e.target)) {
                        menu.classList.remove("show");
                    }
                });
            };

            // Listen for both click and contextmenu events
            document.addEventListener("click", closeMenus);
            document.addEventListener("contextmenu", closeMenus);

            _logoffMenuHandlerAdded = true;
        }

        return;
    }

    // DEFAULT: Normal button with function-string fallback
    el.onclick = () => {

        // STRING FUNCTION LOOKUP — e.g. "ui.alert" resolves to app.ui.alert()
        if (typeof fnName === "string") {
            const parts = fnName.split(".");
            let fn = app;

            for (const part of parts) {
                fn = (fn && fn[part]) ? fn[part] : null;
                if (!fn) break;
            }

            // If resolved function exists, execute it
            if (typeof fn === "function") {
                if (fn.constructor.name === "AsyncFunction") {
                    fn(id).catch(console.error);
                } else {
                    fn(id);
                }
                return;
            }
        }

        // FALLBACK: logoff button — check running programs, reload on confirm
        if (id === "ic-logoff") {
            const running = app.program.getRunning();
            app.program.confirmRunning(() => { window.location.reload(); }, _("Logoff"), running);
            return;
        }

        const button = _buttons.find(b => b.id === id);
        if (button && button.fnName !== null || button.fnName !== undefined) {
            app.ui.alert({
                title: _("Help"),
                body: () => `<p style="margin-top: 13px;">${_("This feature is not yet configured.")}</p>`,
                confirm: _("OK"),
                onConfirm: async () => { await app.ui.windows.functions.closeActiveWindow(); },
                width: "380px",
                height: "180px"
            });
        }
    };
}

/**
 * Bind all buttons in the _buttons array
 * This should be called AFTER all buttons have been registered
 */
export function _bindAllButtons() {
    _buttons.forEach(b => {
        _bindMenuButton(b.id, b.fnName);
    });
}

/**
 * Creates the logoff menu DOM structure based on configuration.
 *
 * @param {Object} config - Menu configuration object.
 * @param {Array} config.menuItem - List of menu items.
 * @param {string} [config.class] - Optional custom class for the menu container.
 * @param {number} [config.zindex=8050] - Z-index for the menu.
 * @returns {HTMLElement} The constructed menu element.
 */
function createLogoffMenu(config) {
    const menu = document.createElement("div");
    menu.className = config.class || "logoff-menu";
    menu.style.zIndex = config.zindex || 8050;

    config.menuItem.forEach(item => {
        const menuItem = document.createElement("div");
        menuItem.className = "logoff-menu-item";

        // Icon
        const iconWrapper = document.createElement("div");
        iconWrapper.className = "menu-icon";

        if (item.icon) {
            const iconMatch = item.icon.match(/data-icon='([^']+)'/);
            if (iconMatch) {
                iconWrapper.innerHTML = `<svg><use href="${iconMatch[1]}"></use></svg>`;
            }
        }

        // Text area
        const textWrapper = document.createElement("div");
        textWrapper.className = "menu-text";

        const title = document.createElement("div");
        title.className = "menu-title";
        title.textContent = item.title;
        textWrapper.appendChild(title);

        if (item.alt) {
            const alt = document.createElement("div");
            alt.className = "menu-alt";
            alt.textContent = item.alt;
            textWrapper.appendChild(alt);
        }

        menuItem.appendChild(iconWrapper);
        menuItem.appendChild(textWrapper);

        // Click callback
        menuItem.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof item.callback === "function") {
                item.callback();
            }
            menu.classList.remove("show");
        });

        menu.appendChild(menuItem);
    });

    return menu;
}

/**
 * Positions the logoff menu relative to its button.
 *
 * @param {HTMLElement} menu - The menu element.
 * @param {HTMLElement} button - The button that triggered it.
 * @param {string} direction - Positioning direction: "top", "bottom", "left", "right".
 */
function positionMenu(menu, button, direction) {
    const rect = button.getBoundingClientRect();

    menu.style.top = "auto";
    menu.style.bottom = "auto";
    menu.style.left = "auto";
    menu.style.right = "auto";

    switch (direction.toLowerCase()) {
        case "top":
            menu.style.bottom = (window.innerHeight - rect.top + 10) + "px";
            menu.style.left = rect.left + "px";
            break;

        case "bottom":
            menu.style.top = (rect.bottom + 10) + "px";
            menu.style.left = rect.left + "px";
            break;

        case "left":
            menu.style.top = rect.top + "px";
            menu.style.right = (window.innerWidth - rect.left + 10) + "px";
            break;

        case "right":
            menu.style.top = rect.top + "px";
            menu.style.left = (rect.right + 10) + "px";
            break;

        default:
            menu.style.bottom = (window.innerHeight - rect.top + 10) + "px";
            menu.style.left = rect.left + "px";
            break;
    }
}
