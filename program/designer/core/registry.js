/**
 * @file designer/core/registry.js
 * @description Block-type registry — maps a `Node.type` string (e.g.
 * "text", "splitter") to a renderer definition. Block modules under
 * `designer/blocks/` self-register into this on import; nothing here knows
 * about any specific block type.
 *
 * @module program/designer/core/registry
 */

const blocks = new Map();

/**
 * @param {string} type
 * @param {Object} def
 * @param {Object} [def.defaults] - Shape merged into a Node's data when one
 *   of this type is created without explicit layout/props (informational —
 *   callers building a new Node decide whether to apply these).
 * @param {function(Node, string[]): string} def.render - Given a node and
 *   its children's already-rendered HTML (one string per child, in order),
 *   returns this node's own complete HTML (including its wrapper element).
 */
export function registerBlock(type, def) {
    blocks.set(type, def);
}

/** Falls back to the "container" block for an unknown type. */
export function getBlock(type) {
    return blocks.get(type) || blocks.get('container');
}

export function hasBlock(type) {
    return blocks.has(type);
}

export function registeredTypes() {
    return [...blocks.keys()];
}
