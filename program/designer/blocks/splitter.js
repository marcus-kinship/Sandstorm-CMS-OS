/**
 * @file designer/blocks/splitter.js
 * @description "splitter" block — divides its children into panes,
 * side-by-side (`props.direction: 'columns'`) or stacked (`'rows'`), with no
 * handle element between them. Just the block type/renderer — the
 * interactive "drag to split" tool UI is a separate, later step.
 *
 * Two different sizing models, matching how the two directions actually
 * behave rather than forcing both through flexbox:
 *
 *  - columns: each pane's `props.flexBasis` (a percentage) resolves against
 *    the splitter's own width, which a block element gets for free (100%
 *    of its parent) — flexbox is a natural fit here, the main problem
 *    really is horizontal distribution.
 *  - rows, with no ancestor providing a definite height (root-level, or
 *    nested inside another px-height rows splitter — see
 *    designer_objectmodel.js's `isInFlexHeightContext`): plain
 *    block-stacked panes with a real pixel `props.height` once the user has
 *    resized one ("Defined"), or nothing at all beyond `min-height:40px`
 *    before that ("Def" — see NOTES.md). No percentage sizing at all, so
 *    there's no dependency on any ancestor's height — eliminates that whole
 *    bug class at the source instead of working around it.
 *  - rows, nested inside a splitter whose pane IS a flex context (a columns
 *    splitter, or a percent-mode rows splitter): keeps the *original*
 *    flexBasis/flex:1 model unchanged — it already gets a definite height
 *    for free via `.db-splitter-pane > .db-node { flex:1 }`
 *    (designer_objectmodel.js), so there's no bug to fix there and no
 *    reason to touch working code.
 *
 * Detected per-splitter from the data itself (not threaded down as a
 * separate flag): a rows splitter whose panes have no `flexBasis` at all
 * is in px-height mode; one whose panes do (set by convertToRowSplitter's
 * unchanged nested-case branch) keeps the flex/percent rendering.
 *
 * @module program/designer/blocks/splitter
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

registerBlock('splitter', {
    defaults: { props: { direction: 'columns' }, children: [] },
    /**
     * @param {import('../core/document.js').Node} node
     * @param {string[]} childHTMLs
     * @returns {string}
     */
    render(node, childHTMLs) {
        const isRows = node.props?.direction === 'rows';
        const directionClass = isRows ? 'row' : 'column';

        const usesPxHeights = isRows && !node.children.some(c => c.props?.flexBasis != null);
        if (usesPxHeights) {
            const panes = node.children.map((child, i) => {
                const h = child.props?.height;
                const heightStyle = h != null ? `height:${h}px;--db-pane-h:${h}px;` : `--db-pane-h:auto;`;
                return `<div class="db-splitter-pane" style="${heightStyle}min-height:40px;width:100%;box-sizing:border-box;flex:none;">${childHTMLs[i]}</div>`;
            });
            const rootHeightSet = node.layout?.height != null;
            return (
                `<div class="db-node db-splitter ${directionClass} px-mode" data-node-id="${node.id}" ` +
                `style="${buildStyle(node)};display:block;${rootHeightSet ? 'overflow:hidden;' : ''}">` +
                panes.join('') +
                `</div>`
            );
        }

        const flexDirection = isRows ? 'column' : 'row';
        const panes = node.children.map((child, i) => {
            const basis = child.props?.flexBasis;
            const flex = basis ? `0 1 ${basis}` : '1';
            return `<div class="db-splitter-pane" style="flex:${flex};min-width:0;min-height:40px;display:flex;flex-direction:column;">${childHTMLs[i]}</div>`;
        });
        return (
            `<div class="db-node db-splitter ${directionClass}" data-node-id="${node.id}" ` +
            `style="${buildStyle(node)};display:flex;flex-direction:${flexDirection};">` +
            panes.join('') +
            `</div>`
        );
    }
});
