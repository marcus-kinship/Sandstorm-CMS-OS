/**
 * @file store.js
 * @description Window object store and active-window management for Sandstorm.
 *
 * Patches `globalThis.app` with:
 * - {@link app.store} — a `WeakMap`-backed registry that associates DOM window
 *   elements with their runtime window objects. Using a `WeakMap` ensures
 *   entries are garbage-collected automatically when elements leave the DOM.
 * - {@link app.setActiveWindow} — promotes a window element to the foreground
 *   and synchronises z-index state across all open windows.
 *
 * Loaded as a side-effect ES module during the DOMContentLoaded boot sequence
 * in `sandstorm.gen.js` — `globalThis.app` must already exist.
 *
 * @module state/store
 */

const app = globalThis.app;

/**
 * Internal `WeakMap` used by {@link app.store}.
 * Keys are `.window` DOM elements; values are the associated window objects.
 * Declared at module scope so it persists for the lifetime of the page.
 * @private
 * @type {WeakMap<Element, Object>}
 */
const windowStore = new WeakMap();

/**
 * @namespace app.store
 * @description
 * `WeakMap`-backed registry for associating DOM window elements with their
 * runtime window data objects. Entries are garbage-collected automatically
 * when the corresponding element is removed from the DOM.
 *
 * @example
 * const winEl = document.querySelector('.window');
 * app.store.set(winEl, { id: "calc", title: "Calculator" });
 * const data = app.store.get(winEl);  // { id: "calc", title: "Calculator" }
 * app.store.remove(winEl);
 */
app.store = {

    /**
     * Associates a DOM window element with a window data object.
     *
     * @memberof app.store
     * @param {Element} windowElement - The `.window` DOM element to use as key.
     * @param {Object}  windowobj     - The window data object to store.
     * @returns {void}
     */
    set: function (windowElement, windowobj) {
        if (!windowElement || !windowobj) return;
        windowStore.set(windowElement, windowobj);
    },

    /**
     * Retrieves the window data object for a given DOM element.
     *
     * @memberof app.store
     * @param {Element} windowElement - The DOM element whose data to retrieve.
     * @returns {Object|null} The stored window object, or `null` if not found
     *   or if the element is falsy.
     */
    get: function (windowElement) {
        if (!windowElement) return null;
        return windowStore.get(windowElement);
    },

    /**
     * Removes the entry for a given DOM element from the store.
     *
     * @memberof app.store
     * @param {Element} windowElement - The DOM element whose entry to remove.
     * @returns {void}
     */
    remove: function (windowElement) {
        if (!windowElement) return;
        windowStore.delete(windowElement);
    }
};

/**
 * Promotes the specified window to the foreground (active state).
 *
 * Steps performed:
 * 1. Removes `.active` from all `.window` elements.
 * 2. Adds `.active` to `#<windowId>-win`.
 * 3. Updates `app.config.local.activeWindowId`.
 * 4. Calls `app.ui.windows.functions.getOrder` with `applyZ: true` to
 *    recompute sequential z-indices so the active window is always on top.
 * 5. Iterates all windows and persists their new z-index values into
 *    `app.program.setWindowZindex` so the program layer stays in sync.
 *
 * @memberof app
 * @param {string} windowId - The logical window ID (without the `-win` suffix),
 *   e.g. `"calc-abc123"`.
 * @returns {void}
 *
 * @example
 * app.setActiveWindow("calc-abc123");
 */
app.setActiveWindow = function (windowId) {
    $(".window").removeClass("active");
    $(`#${windowId}-win`).addClass("active");
    this.config.local.activeWindowId = windowId;

    app.ui.windows.functions.getOrder({
        applyZ: true,
        baseZ: 5000,
        returnElements: false
    });

    $(".window").each((i, element) => {
        const $element = $(element);
        const elementId = $element.attr('id');
        const classList = $element.attr('class').split(' ');
        const pidClass = classList.find(cls => cls.startsWith('pid-'));
        if (pidClass) {
            const programId = pidClass.substring(4);
            const currentZindex = $element.css('z-index');
            const wId = elementId.endsWith('-win') ? elementId.slice(0, -4) : elementId;
            if (currentZindex && currentZindex !== 'auto') {
                try {
                    app.program.setWindowZindex(programId, wId, parseInt(currentZindex, 10));
                } catch (error) {
                    app.dev.warn(`Could not update z-index for window ${elementId} in program ${programId}: ${error.message}`, "Program");
                }
            }
        }
    });
};
