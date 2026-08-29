/**
 * @file designer/blocks/custom.js
 * @description "custom" block — escape hatch for raw HTML (`node.props.html`)
 * not covered by another block type, still allowed to hold children.
 * @module program/designer/blocks/custom
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('custom', {
    defaults: { props: { html: '' } },
    render(node, childHTMLs) {
        return `<div class="db-node db-custom" data-node-id="${node.id}" style="${buildStyle(node)}">${node.props?.html || ''}${childHTMLs.join('')}</div>`;
    }
});
