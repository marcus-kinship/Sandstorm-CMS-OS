/**
 * @file designer/canvas/renderer.js
 * @description Walks a Document's tree and renders it into a container
 * element, depth-first, using the block registry for each node's own HTML.
 *
 * @module program/designer/canvas/renderer
 */

import { getBlock } from '../core/registry.js';
import { setActiveStylesheet } from '../core/stylesheet.js';

/** @returns {string} This node's HTML, including its already-rendered children. */
export function renderNode(node) {
    const childHTMLs = (node.children || []).map(renderNode);
    const block = getBlock(node.type);
    return block.render(node, childHTMLs);
}

/**
 * @param {import('../core/document.js').Document} doc
 * @param {HTMLElement} containerEl
 */
export function render(doc, containerEl) {
    if (!doc || !containerEl) return;
    setActiveStylesheet(doc.stylesheet);
    containerEl.innerHTML = renderNode(doc.root);
}
