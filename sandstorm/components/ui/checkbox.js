/**
 * @file checkbox.js
 * @description Toggle-switch (checkbox) UI component for the Sandstorm UI system.
 *
 * ES module that extends `app.ui` with:
 * - `app.ui.check(config)` — returns an HTML string for a styled toggle switch.
 * - A `{ check: config }` node type for use inside `app.ui.body()` definition trees.
 *
 * CSS for `.switch-def` is injected via `app.addCSS` on first `setup()` call.
 *
 * @module components/ui/checkbox
 *
 * @example
 * // Standalone HTML string
 * const html = app.ui.check({ id: "notifications", checked: true });
 * el.innerHTML = html;
 *
 * @example
 * // Inside a body() definition tree
 * const builder = app.ui.body({
 *   row: { check: { id: "darkmode", checked: false } }
 * });
 * windowEl.innerHTML = builder.render();
 */

/**
 * CSS rules for `.switch-def` toggle switch.
 * Injected once via `app.addCSS('ui-check', _CSS)`.
 * @private
 * @type {string}
 */
const _CSS = `
input[type=checkbox]:not(.switch-def input) {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    flex-shrink: 0;
    cursor: pointer;
    vertical-align: middle;
    position: relative;
    background: linear-gradient(
        to top,
        rgb(53 53 53 / 50%) 1%,
        rgb(0 0 0 / 50%) 50%,
        rgb(39 39 39 / 50%) 51%,
        rgb(104 104 104 / 50%) 100%
    );
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.12);
    transition: box-shadow 0.15s;
}
input[type=checkbox]:not(.switch-def input):hover {
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.22);
}
input[type=checkbox]:not(.switch-def input):checked {
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.28);
}
input[type=checkbox]:not(.switch-def input)::after {
    content: '';
    display: block;
    position: absolute;
    inset: 0;
}
input[type=checkbox]:not(.switch-def input):checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
}

.switch-def {
    position: relative;
    display: inline-block;
    width: 60px;
    height: 30px;
}

.switch-def input {
    opacity: 0;
    width: 0;
    height: 0;
}

.switch-def .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.25);
    border-radius: 30px;
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
    transition: .4s;
}

.switch-def input:checked + .slider {
    background-color: var(--theme-backgruondcolorc, #00000040);
    box-shadow: 1px 1px 1px #ffffff50, -1px -1px 1px #ffffff50;
}

.switch-def .slider:before {
    position: absolute;
    content: "";
    height: 23px;
    width: 23px;
    border-radius: 50%;
    background-color: #ffffff;
    transition: .4s;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
}

.switch-def input:checked + .slider:before {
    transform: translate(30px, -50%);
}
`;

/**
 * Renders an HTML string for a `.switch-def` toggle switch element.
 *
 * @private
 * @param {Object}  config              - Switch configuration.
 * @param {string}  [config.id=""]     - `id` attribute for the `<input>` element.
 * @param {boolean} [config.checked=false] - Initial checked state.
 * @param {string}  [config.className=""]  - Extra CSS classes for the wrapping `<label>`.
 * @returns {string} HTML string for the toggle switch.
 */
function _html(config) {
    const { id = '', checked = false, className = '' } = config;
    const idAttr     = id        ? ` id="${id}"`       : '';
    const classExtra = className ? ` ${className}`     : '';
    return (
        `<label class="switch-def${classExtra}">` +
        `<input type="checkbox"${idAttr}${checked ? ' checked' : ''}>` +
        `<span class="slider"></span>` +
        `</label>`
    );
}

/**
 * Recursively rewrites `{ check: config }` nodes in a `body()` definition
 * tree to `{ html: "<label>…</label>" }` so the base renderer can process them.
 *
 * @private
 * @param {Object} def - A node from a `body()` definition tree.
 * @returns {Object} Patched node (may be a new object or the original).
 */
function _patchDef(def) {
    if (!def || typeof def !== 'object') return def;
    const key = Object.keys(def)[0];
    if (!key) return def;
    if (key === 'check') return { html: _html(def.check) };
    const node = def[key];
    if (node && typeof node === 'object' && Array.isArray(node.subs)) {
        return { [key]: { ...node, subs: node.subs.map(_patchDef) } };
    }
    return def;
}

/**
 * Registers the checkbox component with the Sandstorm application.
 *
 * - Injects the `.switch-def` CSS once via `app.addCSS`.
 * - Adds `app.ui.check(config)` for direct HTML generation.
 * - Wraps `app.ui.body` to transparently handle `{ check: … }` nodes.
 *
 * Called automatically by `app.includeModule` when the file is loaded.
 *
 * @param {Object} app - The global Sandstorm application object.
 * @returns {void}
 */
export function setup(app) {
    if (app.ui?.check) return;

    app.addCSS('ui-check', _CSS);

    /**
     * Generates an HTML string for a toggle switch.
     *
     * @memberof app.ui
     * @param {Object}  config              - Switch configuration.
     * @param {string}  [config.id]         - `id` for the inner `<input>`.
     * @param {boolean} [config.checked]    - Whether the switch starts checked.
     * @param {string}  [config.className]  - Extra CSS classes for the `<label>`.
     * @returns {string} Rendered HTML string.
     */
    app.ui.check = config => _html(config);

    const _orig = app.ui.body;
    if (!_orig) return;

    app.ui.body = function(nodeDef) {
        return _orig.call(app.ui, _patchDef(nodeDef));
    };
}
