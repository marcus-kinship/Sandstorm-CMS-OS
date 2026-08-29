/**
 * @file utils.js
 * @description General-purpose utility methods for the Sandstorm OS kernel.
 *
 * Patches `globalThis.app` with helper functions covering document metadata,
 * user profile data, menu construction, and server-side access control.
 *
 * Loaded as a side-effect ES module during the DOMContentLoaded boot sequence
 * in `sandstorm.gen.js` — `globalThis.app` must already exist.
 *
 * @module core/utils
 */

const app = globalThis.app;

/**
 * Sets the browser tab/window title.
 *
 * @memberof app
 * @param {string} title - New title string. Falls back to
 *   `"Welcome to Sandstorm"` when falsy.
 * @returns {void}
 *
 * @example
 * app.setTitle("My App");
 * app.setTitle("");  // => "Welcome to Sandstorm"
 */
app.setTitle = function (title) {
    document.title = title || "Welcome to Sandstorm";
};

/**
 * Returns the current browser tab/window title.
 *
 * @memberof app
 * @returns {string} Current value of `document.title`.
 *
 * @example
 * const t = app.getTitle(); // "Sandstorm"
 */
app.getTitle = function () {
    return document.title;
};

/**
 * Sets the favicon (browser tab icon).
 *
 * Locates an existing `<link rel="icon">` element in `<head>` and updates
 * its `href`. Creates the element if it does not exist.
 *
 * @memberof app
 * @param {string} url - URL of the favicon image (PNG, SVG, ICO, etc.).
 * @returns {void}
 *
 * @example
 * app.setFavicon("res/images/favicon.png");
 */
app.setFavicon = function (url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.href = url;
};

/**
 * Builds a nested `<ul>` menu element from a plain object tree.
 *
 * Each key in `data` becomes a `<li>` text node. If the corresponding value
 * is a non-empty, non-array object the method recurses to create a nested
 * `<ul>` as a submenu.
 *
 * @memberof app
 * @param {Object} data - Plain object describing the menu structure.
 *   Keys are item labels; values are either sub-objects (submenu) or anything
 *   else (leaf node, no submenu rendered).
 * @returns {HTMLUListElement} The constructed `<ul>` element.
 *
 * @example
 * const menu = app.createMenu({
 *   File: { New: {}, Open: {}, Save: {} },
 *   Edit: { Copy: {}, Paste: {} }
 * });
 * document.body.appendChild(menu);
 */
app.createMenu = function (data) {
    if (!data || typeof data !== "object") return document.createElement("ul");
    const ul = document.createElement("ul");
    for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        const li = document.createElement("li");
        li.textContent = key;
        if (data[key] && typeof data[key] === "object" && !Array.isArray(data[key]) && Object.keys(data[key]).length > 0) {
            li.appendChild(app.createMenu(data[key]));
        }
        ul.appendChild(li);
    }
    return ul;
};

/**
 * Derives the logged-in user's initials from `app.config.user.profile`.
 *
 * Combines the first character of `name` and `lastname`, both uppercased.
 * Returns an empty string when either field is missing or the profile is not
 * yet populated.
 *
 * @memberof app
 * @returns {string} Two-character initials (e.g. `"ML"`), or `""` on failure.
 *
 * @example
 * // app.config.user.profile = { name: "Marcus", lastname: "Larsson" }
 * app.getUserInitials(); // => "ML"
 */
app.getUserInitials = function () {
    if (!app.config?.user?.profile) return "";
    const { name, lastname } = app.config.user.profile;
    if (!name || !lastname) return "";
    return `${name[0].toUpperCase()}${lastname[0].toUpperCase()}`;
};

/**
 * Checks whether the current user has permission to perform an action on a
 * named object by sending a POST request to the server.
 *
 * Resolves to `true` (granted), `false` (denied), or an error message string
 * (network problem). Times out after 5 seconds.
 *
 * @memberof app
 * @param {string} objectName - The resource being accessed (e.g.
 *   `"controlpanel"`).
 * @param {string} action - The action to check (e.g. `"view"`, `"edit"`).
 * @returns {Promise<boolean|string>}
 *   - `true` — access granted.
 *   - `false` — access denied.
 *   - `string` — localised error message (timeout or connection failure).
 *
 * @example
 * const ok = await app.hasAccess("controlpanel", "view");
 * if (ok === true) { ... }
 */
app.hasAccess = function (objectName, action) {
    return new Promise((resolve) => {
        $.ajax({
            url: app.config.local.hasAccessLink,
            type: "POST",
            data: { object: objectName, action: action },
            timeout: 5000,
            success: function (response) {
                resolve(response.accessGranted ? true : false);
            },
            error: function (jqXHR, textStatus) {
                if (textStatus === "timeout") {
                    resolve(_("Request timed out. Please check your internet connection."));
                } else {
                    resolve(_("Unable to connect to the server."));
                }
            }
        });
    });
};

/**
 * Convenience wrapper around {@link app.hasAccess} that logs the result and
 * normalises the return value to `true`, `false`, or the raw error string.
 *
 * @memberof app
 * @async
 * @param {string} object - The resource being accessed.
 * @param {string} action - The action to check.
 * @returns {Promise<boolean|string>} `true`, `false`, or an error string.
 *
 * @example
 * if (await app.checkAccess("controlpanel", "edit")) {
 *   // render the edit UI
 * }
 */
app.checkAccess = async function (object, action) {
    try {
        const result = await app.hasAccess(object, action);
        if (result === true) {
            if (app.config.local.dev) app.dev.log("Access granted", "Core");
            return true;
        } else if (result === false) {
            if (app.config.local.dev) app.dev.log("Access denied", "Core");
            return false;
        } else {
            if (app.config.local.dev) app.dev.log(`Error: ${result}`, "Core");
            return result;
        }
    } catch (error) {
        if (app.config.local.dev) app.dev.log(`Unexpected error: ${error}`, "Core");
        return false;
    }
};
