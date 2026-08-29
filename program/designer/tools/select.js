/**
 * @file designer/tools/select.js
 * @description The "Cursor" sidebar tool — the default tool (`app.designer.
 * activeTool === 'select'`, set by designer_objectmodel.js). Clicking an
 * existing element on the canvas selects it instead of inserting or
 * splitting anything; other tools (e.g. tools/split.js) only act on a click
 * when *they're* the active tool, so this coexists with them on the same
 * delegated click listener without conflict. One of three peer tools —
 * see program/designer/NOTES.md's "Tool separation" section.
 *
 * Owns no selection state of its own — `app.designer.selection`
 * (designer_selection.js) is the single source of truth for "which node is
 * selected." This file only (a) tells it about clicks, and (b) reacts to
 * its broadcast by drawing/clearing the blue `.db-selected` outline. It also
 * owns whether that outline is shown at all — `setOutlineVisible`/
 * `outlineVisible`, toggled from designer_toolbar.js's Cursor bar checkbox —
 * a display-only preference independent of the selection itself.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * designer_selection.js (needs `app.designer.selection`).
 *
 * @module program/designer/tools/select
 */

import { isSelectable } from '../rules/element_capabilities.js';

function applySelectedClass(id) {
    document.querySelectorAll('.db-node.db-selected').forEach(n => n.classList.remove('db-selected'));
    if (!id) return;
    document.querySelector(`#designerCanvasBody [data-node-id="${id}"]`)?.classList.add('db-selected');
}

let outlineVisible = true;

function applyOutlineVisibility() {
    document.getElementById('designerCanvasBody')?.classList.toggle('db-hide-selection-outline', !outlineVisible);
}

function setOutlineVisible(v) {
    outlineVisible = !!v;
    applyOutlineVisibility();
}

function injectCSS() {
    if (document.getElementById('designer-select-tool-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-select-tool-style';
    style.textContent = `
        .db-hide-selection-outline .db-node.db-selected { outline: none; }
    `;
    document.head.appendChild(style);
}

/** Selects a node by id from outside the canvas (e.g. the Layers panel) —
 *  switches to the Cursor tool first, so the selection sticks the same way
 *  a canvas click would leave it. */
function selectById(id, reason = 'external') {
    app.designer.setActiveTool('select');
    app.designer.selection.select(id, reason);
}

function bindCanvasClick() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    $(canvasBody).on('click', '.db-node', function (e) {
        if (app.designer.activeTool !== 'select') return;
        const node = app.designer.getDocument()?.find(this.dataset.nodeId);
        if (!isSelectable(node)) return;
        e.stopPropagation();
        app.designer.selection.select(this.dataset.nodeId, 'click');
    });

    // Clicking the bare canvas (not a node) deselects.
    $(canvasBody).on('click', function (e) {
        if (app.designer.activeTool !== 'select') return;
        if (e.target === canvasBody) app.designer.selection.clear('canvas-click');
    });

    app.designer._registerRenderHook(() => applySelectedClass(app.designer.selection.get()));
}

export function init(app) {
    injectCSS();
    bindCanvasClick();

    app.designer = app.designer || {};
    app.designer.selectTool = {
        activate: () => app.designer.setActiveTool('select'),
        clearSelection: () => app.designer.selection.clear('select-tool'),
        selectById,
        getSelectedId: () => app.designer.selection.get(),
        outlineVisible: () => outlineVisible,
        setOutlineVisible
    };

    app.designer.setActiveTool('select');

    $(document).on('designer-selection-changed', (e, id) => applySelectedClass(id));
}
