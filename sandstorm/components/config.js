/**
 * @file config.js
 * @description Namespaced key-value configuration store for Sandstorm components.
 *
 * Provides a lightweight, namespace-scoped store built on `Map`. Each
 * namespace (e.g. `"desktop"`, `"taskbar"`) has its own inner `Map` so key
 * names never collide between modules.
 *
 * Extends the pre-existing `app.config` object (defined in `sandstorm.gen.js`)
 * with `set`, `get`, `has`, `update`, and `remove` methods.
 *
 * @module components/config
 *
 * @example
 * // Store and retrieve icon dimensions
 * app.config.set("desktop", "iconWidth",  40);
 * app.config.set("desktop", "iconHeight", 40);
 *
 * app.config.get("desktop", "iconWidth");   // 40
 * app.config.has("desktop", "iconWidth");   // true
 *
 * app.config.update("desktop", "iconWidth", 48);
 * app.config.remove("desktop", "iconWidth");
 */
(function (app) {

    /**
     * Root store: maps namespace strings to inner `Map<key, value>` instances.
     * @private
     * @type {Map<string, Map<string, *>>}
     */
    const _store = new Map();

    /**
     * Returns (or lazily creates) the inner `Map` for a given namespace.
     *
     * @private
     * @param {string} namespace - Namespace identifier.
     * @returns {Map<string, *>} The namespace's inner map.
     */
    function _ns(namespace) {
        if (!_store.has(namespace)) _store.set(namespace, new Map());
        return _store.get(namespace);
    }

    app.config = app.config || {};

    /**
     * Stores a value under `namespace.key`.
     *
     * @memberof app.config
     * @param {string} namespace - Namespace (e.g. `"desktop"`, `"taskbar"`).
     * @param {string} key       - Key within the namespace.
     * @param {*}      value     - Value to store (any type).
     * @returns {void}
     *
     * @example
     * app.config.set("desktop", "iconWidth", 40);
     */
    app.config.set = function (namespace, key, value) { _ns(namespace).set(key, value); };

    /**
     * Retrieves the value stored at `namespace.key`.
     *
     * @memberof app.config
     * @param {string} namespace - Namespace to look up.
     * @param {string} key       - Key within the namespace.
     * @returns {*} The stored value, or `undefined` if not found.
     *
     * @example
     * app.config.get("desktop", "iconWidth"); // 40
     */
    app.config.get = function (namespace, key) {
        const m = _store.get(namespace);
        return m ? m.get(key) : undefined;
    };

    /**
     * Checks whether `namespace.key` has a stored value.
     *
     * @memberof app.config
     * @param {string} namespace - Namespace to look up.
     * @param {string} key       - Key within the namespace.
     * @returns {boolean} `true` if the entry exists.
     *
     * @example
     * app.config.has("desktop", "iconWidth"); // true
     */
    app.config.has = function (namespace, key) {
        const m = _store.get(namespace);
        return m ? m.has(key) : false;
    };

    /**
     * Updates (or creates) the value at `namespace.key`. Functionally
     * identical to {@link app.config.set}; provided as a semantic alias for
     * read–modify–write operations.
     *
     * @memberof app.config
     * @param {string} namespace - Namespace to update.
     * @param {string} key       - Key within the namespace.
     * @param {*}      value     - New value.
     * @returns {void}
     *
     * @example
     * app.config.update("desktop", "iconWidth", 48);
     */
    app.config.update = function (namespace, key, value) { _ns(namespace).set(key, value); };

    /**
     * Removes the entry at `namespace.key`. Does nothing if the namespace or
     * key does not exist.
     *
     * @memberof app.config
     * @param {string} namespace - Namespace containing the key.
     * @param {string} key       - Key to remove.
     * @returns {void}
     *
     * @example
     * app.config.remove("desktop", "iconWidth");
     */
    app.config.remove = function (namespace, key) {
        const m = _store.get(namespace);
        if (m) m.delete(key);
    };

})(window.app = window.app || {});
