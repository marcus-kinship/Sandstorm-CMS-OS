/**
 * @file taskbar/core.js
 * @description Small taskbar leftovers that didn't belong in any other
 * sibling module: the icon-menu helper, the `options()` config validator
 * (must be called before `build()`), and the generic context-menu
 * pass-through.
 *
 * Registers `app.desktop.taskbar.{icon, options, contextMenu}` — same
 * IIFE-extends convention as the other taskbar/*.js sibling modules.
 * Loaded via `taskbar/index.js`'s side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/core
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Icon utility helpers.
         * @namespace app.desktop.taskbar.icon
         */
        icon: {
            /**
             * Opens a UI menu for a taskbar icon.
             * @param {Object} menu - Menu descriptor passed to `app.ui.menu.create`.
             */
            menu: function (menu) {
                app.ui.menu.create(menu);
            }
        },

        /**
         * Stores and validates the taskbar configuration options.
         * Must be called before `build()`.
         * @param {Object}   options
         * @param {string}   options.id       - DOM id for the taskbar element.
         * @param {string}   options.position - "bottom" | "top" | "left" | "right"
         * @param {number}   options.height
         * @param {number}   options.width
         * @param {string}   options.button   - Dot-path to the start-button factory, e.g. "app.desktop.startmenu.build"
         * @param {string}   options.css      - Extra CSS class or identifier.
         * @param {string}   options.context  - Context-menu selector / config.
         */
        options: function (options) {
            this.config.options = options || {};

            const requiredProperties = [
                "id",
                "position",
                "height",
                "width",
                "button",
                "css",
                "context",
            ];

            for (const prop of requiredProperties) {
                if (!(prop in this.config.options)) {
                    console.error(`Options are missing the required property '${prop}'.`);
                    return;
                }
            }
        },

        /**
         * Registers a context menu on a selector via the global UI helper.
         * @param {string}   selector - CSS selector for the target element(s).
         * @param {Object[]} items    - Menu item descriptors accepted by `app.ui.contextMenu`.
         * @param {number}   zIndex   - z-index for the menu element.
         */
        contextMenu: function (selector, items, zIndex) {
            app.ui.contextMenu(selector, items, zIndex);
        }

    });

})((window.app = window.app || {}));
