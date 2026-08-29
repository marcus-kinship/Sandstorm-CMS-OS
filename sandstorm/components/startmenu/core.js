/**
 * @file startmenu/core.js
 * @description Start-menu shell lifecycle: initial `options` shape, DOM
 * creation (`init`), the taskbar start button (`startbutton`), open/close
 * (`toggleMenu`/`hide`), adaptive height (`calculateMenuHeight`), and the
 * top-level `build()` that wires tabs, clock, shortcut, resize listener and
 * the logoff/help buttons together.
 *
 * Exported functions (other than `options`) are plain (non-arrow), called as
 * methods of `app.desktop.startmenu` (see startmenu/index.js for the
 * assembly).
 * Split out of the original monolithic startmenu.js — moved verbatim, no
 * logic changes.
 *
 * @module components/startmenu/core
 */
import { isLogoffButtonSet, isHelpButtonSet } from './state.js';
import { _bindAllButtons } from './buttons.js';

// Shared held-key state for multi-key, non-modifier shortcuts like
// options.shortcut="s+m" below. A KeyboardEvent only ever exposes the
// single key that changed (plus boolean ctrl/shift/alt/meta flags) - there
// is no way to read "s" and "m" both being down from one event, so two
// simultaneously-held plain letter keys have to be tracked across events
// instead. Module-wide (every startbutton() instance shares one physical
// keyboard). Cleared on blur since a keyup can be missed entirely if focus
// leaves the page while a key is still physically held - same convention
// as window/index.js's wDown snap-shortcut tracker.
const _heldKeys = new Set();
document.addEventListener("keydown", (e) => { if (e.key) _heldKeys.add(e.key.toLowerCase()); });
document.addEventListener("keyup", (e) => { if (e.key) _heldKeys.delete(e.key.toLowerCase()); });
window.addEventListener("blur", () => _heldKeys.clear());

/**
 * Initial shape of `app.desktop.startmenu.options` — the tab registry
 * config consumed by `app.ui.tabs()` in `build()`.
 */
export const options = {
    tabConfig: {
        config: {
            tabsContainerId: "#ms-tabs-container",
            iconsContainerId: "#ms-icons-container",

        },
        default: 0,
        tabs: []
    }
};

/**
* Function to create and handle a context menu for a given selector or element.
*
* @param {string | HTMLElement} selector - CSS selector or HTML element to attach the context menu to.
* @param {object} options - Configuration object for the context menu.
* @param {Array} options.items - Array of menu item objects with properties like title, icon, and callback.
* @param {function} [options.callback] - Optional callback function that returns items to display in the menu.
* @param {number} [options.zIndex=300] - Z-index for the context menu.
* @param {string} [options.classes=""] - Additional CSS classes to apply to the context menu.
* @param {boolean} [options.seltaget=false] - Flag indicating whether to handle context menu items based on a specific target.
*/
export function contextMenu(selector, options) {
    // Delegate the context menu creation to app.ui.contextMenu
    app.ui.contextMenu(selector, options);
}

/**
 * Updates the profile element with the user's initials.
 *
 * This function retrieves the user's initials from the `app.getUserInitials` method
 * and updates the text content of the `#ms-profile` element with the retrieved value.
 * If no initials are found, the element remains unchanged.
 *
 * @returns {void} - This function does not return a value.
 *
 * @example
 * // Set the profile initials on the page.
 * app.desktop.startmenu.setUserInitials();
 *
 */
export function setUserInitials() {
    const initials = app.getUserInitials();

    // If initials are available, update the #ms-profile element
    if (initials) {
        $("#ms-profile").text(initials);
    }
}

/**
 * Creates a start menu.
 * @param {object} options - Configuration options for the start menu, including:
 *
 * @param {string} options.id - The unique identifier for the start menu. Example: "ms-startmenu".
 * @param {string} options.class - The CSS class or classes for show or hid the start menu. Example: "show".
 *
 */
export function init(options) {
    const menu = document.createElement("div");
    menu.id = options.id || "ms-startmenu"; // Assign an ID to the menu or default to 'ms-startmenu'
    menu.className = "startmenu"; // Assign a class or default to 'show-f'

    // Check the position specified in options, and assign default classes
    if (options.position) {
        switch (options.position) {
            case "bottom":
                menu.classList.add("def-b");
                break;
            case "top":
                menu.classList.add("def-t"); // Use 'def-t' instead of 'def-p'
                break;
            case "left":
                menu.classList.add("def-l");
                break;
            case "right":
                menu.classList.add("def-r");
                break;
            default:
                app.dev.log("No valid position specified", "Startmenu");
        }
    }

    // If an extra class is specified in options, add it as well
    if (options.class) {
        menu.classList.add(options.class);
    }

    app.addCSS('Startmenu', 'sandstorm/components/startmenu.css', true);

    // Define the menu's HTML structure
    menu.innerHTML = `
    <div class="leftmenu">
        <div class="s-row">
            <div id="ms-profile"></div>
        </div>
        <div class="s-row">
            <div class="navbar down startsvg">
                <div class="top">
                    <div class="line"></div>
                    <div id="ms-icons-container">

                    </div>
                </div>
                <div class="bottom">
                    <div class="click blockicon" id="ic-helped" title="${_("Help")}">
                        <svg><use href="#ic-help" /></svg>
                    </div>
                    <div class="click blockicon" id="ic-logoff" title="${_("Logoff")}">
                        <svg><use href="#ic-power" /></svg>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="rightmain">
        <div class="s-row">
            <div class="search">
                <input type="search" placeholder="${_("Search")}" id="q-search"
                    role="combobox" aria-expanded="false" aria-controls="ms-search-results"
                    autocomplete="off" />
                <div class="icon" style="position: absolute; top: 40px; margin-left: 9px">
                    <svg width="15" height="15"><use href="#ic-search" /></svg>
                </div>
            </div>
        </div>
        <div class="s-row"  id="ms-tabs-container">

        </div>
        <div class="s-row" id="ms-search-results" role="listbox" style="display:none;"></div>
    </div>`;

    document.body.appendChild(menu); // Add the menu to the document body

    // Store the menu element in the options object
    app.desktop.startmenu.options.menu = menu;

    app.desktop.startmenu.setUserInitials();

    const msProfile = $('#ms-profile')[0];
    if (msProfile) {

        msProfile.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.app?.users?.openCP) {
                app.users.openCP();
            }
        });
    }

    if (app.exists('app.controlpanel.window.taskbar')) {
        $(".controlpanelbt").click(function () {
            app.controlpanel.window.main();
        });

    } else {
        app.ui.alert();
    }

    // Track if the menu is open
    this.options.isMenuOpen = false;

    // Add event listener for mousemove on the body to detect if mouse leaves the menu area
    document.body.addEventListener("click", (e) => {
        const target = e.target;

        // Check if the menu is open and if the mouse is outside the menu area
        if (
            this.options.isMenuOpen == true &&
            menu.contains(target) == false &&
            this.options.button.contains(target) == false
        ) {
            menu.classList.remove('show-l', 'show-r', 'show-t', 'show-b');
            menu.style.height = '';
            // Hide the menu
            this.options.isMenuOpen = false; // Set the menu to closed
        }
    });

    document.body.addEventListener("contextmenu", (e) => {
        const target = e.target;

        // Check if the menu is open and if the mouse is outside the menu area
        if (
            this.options.isMenuOpen == true &&
            menu.contains(target) == false &&
            this.options.button.contains(target) == false
        ) {
            menu.classList.remove('show-l', 'show-r', 'show-t', 'show-b');
            menu.style.height = '';
            this.options.isMenuOpen = false; // Set the menu to closed
        }
    });

    menu.addEventListener("contextmenu", (e) => {
        e.stopPropagation();
    });

}

/**
 * Creates a start button and binds it to toggle the start menu.
 * @param {object} options - Configuration options for the start button, including:
 * @param {string} options.shortcut - Optional. A keyboard shortcut to activate the start button. Example: 'm'.
 * @param {string} options.id - The unique identifier for the start button. Example: "bts-start".
 * @param {string} options.content - HTML content or SVG to display inside the start button. Example: `<svg><use href="#ic-bts-start"></use></svg>`.
 * @param {string} options.title - Optional. The title text to display as a tooltip for the button. Example: "Start".
 * @param {string} options.style - Optional. Custom inline CSS styles for the start button. Example: `width: 14px; padding-bottom: 6px;`.
 */
export function startbutton(options) {
    const startButton = document.createElement("div");
    startButton.id = options.id || "startButton";
    startButton.className = options.class || "aero-button";
    startButton.style.cssText = (options.style || "") + "; isolation: isolate;";
    startButton.title = options.title || "Start";
    this.options.shortcut = options.shortcut || "";
    if (options.css) {
        startButton.classList.add(...options.css.trim().split(/\s+/));
    }

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = options.content || "Start";
    const afterEl = tempDiv.querySelector(".after");
    if (afterEl) afterEl.remove();
    startButton.innerHTML = tempDiv.innerHTML;

    if (afterEl) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            startButton.appendChild(afterEl);
        }));
    }

    this.options.button = startButton;
}

/**
 * @typedef {Object} MenuOptions
 * @property {HTMLElement} menu - The menu DOM element to toggle.
 * @property {boolean} isMenuOpen - Flag indicating whether the menu is currently open.
 */

/**
 * Toggles the taskbar menu open/closed and adjusts its position
 * based on the taskbar location (left, right, top, bottom).
 *
 * @async
 * @this {Object} - Expects `this.options` to be of type `MenuOptions`.
 */

export async function toggleMenu() {
    /** @type {MenuOptions} */
    var menuOptions = this.options;
    var menu = menuOptions.menu;

    if (menuOptions.isMenuOpen) {
        // Close the menu if already open
        menu.classList.remove('show-l', 'show-r', 'show-t', 'show-b');
        // Remove inline height style to allow CSS transitions to work
        menu.style.height = '';
        menuOptions.isMenuOpen = false;

    } else {
        // Remove previous default classes
        menu.classList.remove('def-l', 'def-r', 'def-t', 'def-b');

        // Detect taskbar position and apply classes accordingly
        if ($('.taskbar-s').hasClass('taskbar-left')) {
            menu.classList.add('def-l', 'show-l');
        } else if ($('.taskbar-s').hasClass('taskbar-right')) {
            menu.classList.add('def-r', 'show-r');
        } else if ($('.taskbar-s').hasClass('taskbar-top')) {
            menu.classList.add('def-t', 'show-t');
        } else if ($('.taskbar-s').hasClass('taskbar-bottom')) {
            menu.classList.add('def-b', 'show-b');
        }

        // Calculate and set the appropriate height AFTER classes are added
        this.calculateMenuHeight();

        // Mark menu as open
        menuOptions.isMenuOpen = true;
    }
}

/**
 * Calculates and sets the appropriate height for the start menu
 * based on available screen space
 */
export function calculateMenuHeight() {
    var menuOptions = this.options;
    const menu = this.options.menu;
    if (!menu) return;


    const maxHeight = 720;
    const margin = 60;
    const availableHeight = window.innerHeight - margin;

    // Calculate the appropriate height
    const calculatedHeight = Math.min(maxHeight, availableHeight);

    // Apply the height to main menu
    menu.style.height = calculatedHeight + 'px';

    // Update leftmenu - använd calculatedHeight istället för fast 720px

    // Set max-height for rightmain to enable scrolling
    const rightMain = menu.querySelector('.rightmain');
    if (rightMain) {
        rightMain.style.maxHeight = calculatedHeight + 'px';
        //rightMain.style.overflowY = 'auto';
    }

    app.dev.log(`Menu height set to: ${calculatedHeight}px (available: ${availableHeight}px)`, "Startmenu");
}

/**
 * Builds and initializes the start button to toggle the start menu.
 */
export function build() {
    var menu = this.options.menu;
    var startButton = this.options.button;
    var shortcut = this.options.shortcut; // Shortcut key combination (e.g. 'Control+S')
    this.extendsTabs();

    app.ui.tabs(this.options.tabConfig.config, {
        default: 0,
        tabs: this.options.tabConfig.tabs
    });
    app.desktop.taskbar.analogClock("msanalogclock", 130, 130);
    app.desktop.taskbar.clock("mstimedigital");

    // Add resize listener to recalculate height when window is resized
    window.addEventListener('resize', () => {
        if (this.options.isMenuOpen) {
            this.calculateMenuHeight();
        }
    });

    // Event listener to toggle via mouse (button)
    startButton.addEventListener("click", (event) => {
        this.toggleMenu();
    });

    // Event listener to toggle via keyboard shortcut
    document.addEventListener("keydown", (event) => {
        if (shortcut) {
            if (event.repeat) return; // ignore OS key-repeat while held - act once per physical press
            const keys = shortcut.split("+");
            const isShortcutPressed = keys.every((key) => {
                switch (key.toLowerCase()) {
                    case "control":
                        return event.ctrlKey;
                    case "shift":
                        return event.shiftKey;
                    case "alt":
                        return event.altKey;
                    default:
                        // _heldKeys (module scope, above) tracks plain keys across
                        // events - event.key alone can only ever match ONE of a
                        // multi-letter combo like "s+m", never both at once.
                        return _heldKeys.has(key.toLowerCase());
                }
            });

            if (isShortcutPressed) {
                event.preventDefault();
                this.toggleMenu();
            }
        }
    });

    // Event listener to hide the menu when clicking outside of it
    document.addEventListener("click", (event) => {
        // Check if the click happened outside the menu and start button
        if (!menu.contains(event.target) && !startButton.contains(event.target)) {
            // Remove all show and def classes to hide the menu
            menu.classList.remove('show-l', 'show-r', 'show-t', 'show-b');
            menu.style.height = '';
            this.options.isMenuOpen = false; // Mark menu as closed
        }
    });



    // ----------------------------------------------------
    // DEFAULT INITIALIZATION FOR HELP AND LOGOFF BUTTONS
    // ----------------------------------------------------

    // If login.js has not already called logoffButton()
    if (!isLogoffButtonSet()) {
        app.desktop.startmenu.logoffButton();
    }

    // If controlpanel.js has not already called helpButton()
    if (!isHelpButtonSet()) {
        app.desktop.startmenu.helpButton();
    }

    _bindAllButtons();
    this.wireSearch();
    // ta bort
  //  this.toggleMenu();


    return startButton;
}
/**
 * Hides the start menu without toggling — unconditionally removes all show classes
 * and clears the inline height style.
 *
 * @function hide
 * @memberof app.desktop.startmenu
 */
export function hide() {
    var menu = this.options.menu;
    // Kontrollera om menu finns
    if (!menu) return;
    // Remove all show and def classes to hide the menu
    menu.classList.remove('show-l', 'show-r', 'show-t', 'show-b');
    this.options.isMenuOpen = false; // Mark menu as closed
    menu.style.height = "";
}
