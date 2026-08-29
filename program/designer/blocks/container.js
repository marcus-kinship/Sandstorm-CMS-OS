/**
 * @file designer/blocks/container.js
 * @description "container" block — a plain wrapper that just renders its
 * children. Also the registry's fallback for any unrecognized node type.
 * @module program/designer/blocks/container
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('container', {
    defaults: { layout: { mode: 'flow' } },
    render(node, childHTMLs) {
        return `<div class="db-node db-container" data-node-id="${node.id}" style="${buildStyle(node)}">${childHTMLs.join('')}</div>`;
    }
});
