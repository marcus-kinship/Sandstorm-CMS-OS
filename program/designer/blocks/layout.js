/**
 * @file designer/blocks/layout.js
 * @description "layout" block — a container whose `layout.mode` controls
 * child arrangement (`flex`/`grid`/`flow`/`absolute`, see core/style.js).
 * Distinct from "container" only in intent — same rendering, but a "layout"
 * node is meant to actually declare a flex/grid mode rather than just group
 * children in normal flow.
 * @module program/designer/blocks/layout
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('layout', {
    defaults: { layout: { mode: 'flex', direction: 'row', gap: 0 } },
    render(node, childHTMLs) {
        return `<div class="db-node db-layout" data-node-id="${node.id}" style="${buildStyle(node)}">${childHTMLs.join('')}</div>`;
    }
});
