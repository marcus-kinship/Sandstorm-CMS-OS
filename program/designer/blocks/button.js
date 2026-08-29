/**
 * @file designer/blocks/button.js
 * @description "button" block — `node.props.label` rendered as a `<button>`.
 * @module program/designer/blocks/button
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('button', {
    defaults: { props: { label: 'Button' } },
    render(node) {
        return `<button class="db-node db-button" data-node-id="${node.id}" style="${buildStyle(node)}">${app.util.escapeHtml(node.props?.label || 'Button')}</button>`;
    }
});
