/**
 * @file designer/blocks/image.js
 * @description "image" block — `node.props.src` rendered as an `<img>`.
 * @module program/designer/blocks/image
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('image', {
    defaults: { props: { src: '' }, layout: { mode: 'flow', width: 200, height: 150 } },
    render(node) {
        const src = node.props?.src || '';
        return `<img class="db-node db-image" data-node-id="${node.id}" src="${src}" alt="" style="${buildStyle(node)}">`;
    }
});
