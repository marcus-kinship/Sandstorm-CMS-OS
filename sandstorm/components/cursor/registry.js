/**
 * @file cursor/registry.js
 * @description Dynamic runtime registry backing `Cursor.register({id, svg,
 * aliases})` — lets plugin-style code add custom cursor types without
 * touching the static `cursor-map.js`. Not used by anything shipped in this
 * pass (no built-in cursor calls `register`), but the API supports it from
 * day one per the spec.
 *
 * `detect.js`'s resolver checks this registry after the static
 * `CURSOR_MAP`, so a registered alias (e.g. `"brush"`) can shadow nothing —
 * it only ever matches a CSS `cursor` value that wasn't already handled by
 * the built-in map.
 *
 * @module components/cursor/registry
 */

const _byId = new Map();     // internal cursor id -> { id, symbolId }
const _aliasToId = new Map(); // alias string (e.g. a CSS cursor value or custom name) -> internal cursor id

/**
 * @param {Object} def
 * @param {string} def.id - Internal cursor id, e.g. `"cursor-paintbrush"`.
 * @param {string} def.svg - Raw SVG markup for the symbol (registered via `os.svg.global.load`).
 * @param {string} [def.viewBox="0 0 24 24"]
 * @param {string[]} [def.aliases] - Extra lookup keys `detect.js`/`resolveRegistered` will also match on.
 * @returns {string} The registered `id`, for convenience.
 */
export function register(def) {
    const { id, svg, viewBox = '0 0 24 24', aliases = [] } = def;
    if (!id || !svg) {
        app.dev?.error?.('[cursor/registry] register() requires both id and svg', 'Cursor');
        return null;
    }
    app.svg.global.load({ id, viewBox, content: svg });
    _byId.set(id, { id, symbolId: id });
    for (const alias of aliases) _aliasToId.set(alias, id);
    return id;
}

/**
 * @param {string} key - A CSS cursor value or a custom alias/id.
 * @returns {string|null}
 */
export function resolveRegistered(key) {
    if (_byId.has(key)) return key;
    return _aliasToId.get(key) || null;
}

export function list() {
    return [..._byId.keys()];
}
