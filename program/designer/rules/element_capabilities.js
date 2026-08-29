/**
 * @file designer/rules/element_capabilities.js
 * @description Per-node-type capability defaults, gating what each canvas
 * tool (Select/Split/Resize/Move — program/designer/tools/) is allowed to
 * do to a given node. Plain ES module, no `app` dependency — imported
 * directly by the tool files that need it, same as core/document.js.
 * @module program/designer/rules/element_capabilities
 */

/**
 * @typedef {Object} Capabilities
 * @property {boolean} selectable - Can become the current selection.
 * @property {boolean} movable - Can be dragged to a different parent (Move Tool).
 * @property {boolean} resizable - Can have its own flexBasis changed as one
 *   side of a splitter boundary (Resize Tool).
 * @property {boolean} splittable - Can be converted into a splitter (Split Tool).
 */

/** @type {Capabilities} */
const DEFAULT_CAPABILITIES = { selectable: true, movable: true, resizable: true, splittable: true };

/** @type {Object<string, Capabilities>} */
const TYPE_CAPABILITIES = {
    button: { ...DEFAULT_CAPABILITIES, resizable: false, splittable: false },
    form: { ...DEFAULT_CAPABILITIES, resizable: false, splittable: false },
    text: { ...DEFAULT_CAPABILITIES, splittable: false },
    image: { ...DEFAULT_CAPABILITIES, splittable: false },
    splitter: { ...DEFAULT_CAPABILITIES, splittable: false },
};

/**
 * @param {import('../core/document.js').Node|null|undefined} node
 * @returns {Capabilities} `node`'s effective capabilities — its type's
 *   defaults, overridden by any per-instance `node.props.capabilities`
 *   (lets one specific node be locked/unlocked without a new block type).
 */
export function capabilitiesOf(node) {
    if (!node) return { ...DEFAULT_CAPABILITIES };
    const byType = TYPE_CAPABILITIES[node.type] || DEFAULT_CAPABILITIES;
    return { ...byType, ...(node.props?.capabilities || {}) };
}

export function isSelectable(node) { return capabilitiesOf(node).selectable; }
export function isMovable(node) { return capabilitiesOf(node).movable; }
export function isResizable(node) { return capabilitiesOf(node).resizable; }
export function isSplittable(node) { return capabilitiesOf(node).splittable; }
