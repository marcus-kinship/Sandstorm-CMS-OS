/**
 * @file designer/blocks/form.js
 * @description "form" block — a container that renders as a `<form>` (submit
 * suppressed; this is a design canvas, not a live form).
 * @module program/designer/blocks/form
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('form', {
    defaults: { layout: { mode: 'flow' } },
    render(node, childHTMLs) {
        return `<form class="db-node db-form" data-node-id="${node.id}" style="${buildStyle(node)}" onsubmit="return false;">${childHTMLs.join('')}</form>`;
    }
});
