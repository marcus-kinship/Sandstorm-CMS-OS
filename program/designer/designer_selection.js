/**
 * @file designer/designer_selection.js
 * @description Single source of truth for "which node is currently
 * selected." Before this file existed, tools/select.js (the blue
 * outline) and designer_hover_overlay.js (the floating tag) each kept their
 * own copy of that answer, updated independently by whichever event each
 * one happened to listen for — a drop inserting a node updated the tag but
 * not the outline, silently splitting the UI's idea of "selected" into two
 * different nodes. This file owns the one id and broadcasts every change;
 * everything else (outline, tag, Layers panel highlight, a future
 * Properties panel, ...) only ever *reacts* to that broadcast, never keeps
 * its own copy.
 *
 * Exposes on `app.designer.selection`:
 *  - select(id, reason) — sets the selection (idempotent if already this id)
 *  - clear(reason)      — clears it (idempotent if already empty)
 *  - get()              — the current id, or null
 *
 * Fires `'designer-selection-changed'` on `document` with `(id, reason)` on
 * every actual change (not on no-op re-selects). `reason` is a short string
 * for `app.dev.log` tracing (e.g. 'click', 'insert', 'layers-panel',
 * 'canvas-click', 'deleted', 'node-removed') — purely diagnostic, nothing
 * branches on it.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the object model (needs `app.designer.getDocument()`/`_registerRenderHook`).
 *
 * @module program/designer/designer_selection
 */

let selectedId = null;

function select(id, reason = 'unknown') {
    if (!id || selectedId === id) return;
    const prev = selectedId;
    selectedId = id;
    app.dev.log(`selection: ${prev ?? '(none)'} -> ${id} (reason=${reason})`, 'Designer');
    $(document).trigger('designer-selection-changed', [id, reason]);
}

function clear(reason = 'unknown') {
    if (!selectedId) return;
    const prev = selectedId;
    selectedId = null;
    app.dev.log(`selection: ${prev} -> (none) (reason=${reason})`, 'Designer');
    $(document).trigger('designer-selection-changed', [null, reason]);
}

export function init(app) {
    app.designer = app.designer || {};
    app.designer.selection = { select, clear, get: () => selectedId };

    app.designer._registerRenderHook(() => {
        if (!selectedId) return;
        const el = document.querySelector(`#designerCanvasBody [data-node-id="${selectedId}"]`);
        if (!el) clear('node-removed');
    });

    $(document).on('designer-node-inserted', (e, nodeId) => select(nodeId, 'insert'));
}
