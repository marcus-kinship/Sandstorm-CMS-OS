/**
 * @file designer/tools/split.js
 * @description The "Splitter" sidebar tool — unlike the other block types,
 * splitting isn't something you drag onto the canvas; you pick a direction
 * (rows/columns) from the sidebar's Splitter submenu, the cursor becomes a
 * scissors + orientation mark, and clicking an existing element on the
 * canvas converts it into a splitter in place (see
 * `app.designer.convertToRowSplitter`/`convertToColumnSplitter`,
 * designer_objectmodel.js) — same id, same position in the tree, its old
 * content becomes the first pane. One of three peer tools — see
 * program/designer/NOTES.md's "Tool separation" section: this tool only
 * creates/restructures nodes and sets a *new* pane's initial flexBasis; it
 * never revisits an existing pane's ratio (that's tools/resize.js) and
 * never reparents a node (that's tools/move.js).
 *
 * Rows and columns are handled by fully separate functions end-to-end
 * (cursor, percent-from-click, split, add-pane, and the object-model
 * conversion they call into) rather than one function parameterized by
 * `direction` — a prior bug fix aimed at rows-only regressed columns
 * because the two shared a code path. Only the thin dispatchers
 * (bindCanvasClick's click handler, setActive) still branch on direction,
 * since picking *which* pair of functions to call isn't splitting logic
 * itself.
 *
 * "Add Pane or Split?" is only asked when clicking a pane whose *parent*
 * splitter already runs the same direction being applied — that's the only
 * genuinely ambiguous case (both choices would produce a same-direction
 * splitter). A different direction than the parent's is unambiguous (always
 * a nested split) and skips the dialog entirely. "Add Pane" always adds a
 * sibling in the clicked node's *parent* splitter, regardless of whether
 * the clicked node itself has children — it must never add children inside
 * the clicked node itself, which is what "Split" is for.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the object model (needs `app.designer.getDocument()`/`render()`).
 * designer.js wires the sidebar menu's Rows/Columns clicks to
 * `app.designer.splitTool.activate(direction)`.
 *
 * @module program/designer/tools/split
 */

import { isSplittable } from '../rules/element_capabilities.js';

/** @returns {'rows'|'columns'|null} Derived from app.designer.activeTool — see NOTES.md. */
function currentDirection() {
    const t = app.designer.activeTool;
    return t === 'split-rows' ? 'rows' : t === 'split-columns' ? 'columns' : null;
}

const ROWS_CURSOR_ALIAS = 'cell';
const COLUMNS_CURSOR_ALIAS = 'copy';
let _customCursorsRegistered = false;

// fill="currentColor" + a subtle dark outline is this engine's own house
// style for a cursor glyph that has to read against any background (see
// cursor/packs/standard/crosshair.svg) — the original artwork's flat
// black-only strokes were designed for a native OS cursor image (rendered
// once, seen once), not this reusable overlay convention, so it's adjusted
// here to match every other registered cursor rather than copied verbatim.
function registerCustomCursors() {
    if (_customCursorsRegistered || !app.cursor?.register) return;
    _customCursorsRegistered = true;

    try {
        const scissors =
            `<g fill="none" stroke="currentColor" stroke-width="1.6">` +
                `<circle cx="6" cy="7" r="2.4"/><circle cx="6" cy="19" r="2.4"/>` +
                `<path d="M7.8 8.6 22 20M7.8 17.4 22 6"/>` +
            `</g>`;
        const markStyle = `font-size="13" font-weight="bold" fill="currentColor" stroke="rgba(0,0,0,0.55)" stroke-width="0.5" paint-order="stroke"`;

        app.cursor.register({
            id: 'cursor-designer-split-rows',
            viewBox: '0 0 28 28',
            svg: `${scissors}<text x="14" y="26" ${markStyle}>-</text>`,
            aliases: [ROWS_CURSOR_ALIAS]
        });
        app.cursor.register({
            id: 'cursor-designer-split-columns',
            viewBox: '0 0 28 28',
            svg: `${scissors}<text x="14" y="26" ${markStyle}>|</text>`,
            aliases: [COLUMNS_CURSOR_ALIAS]
        });
    } catch (error) {
        console.error('Error registering Designer split-tool cursors:', error);
    }
}

function cursorForRows() {
    return ROWS_CURSOR_ALIAS;
}

function cursorForColumns() {
    return COLUMNS_CURSOR_ALIAS;
}

// How much of the space the *original* content keeps — read from where
// inside the clicked node the click actually landed (0 = its top/left edge,
// 100 = its bottom/right edge), not a fixed 50/50. Clamped well short of
// 0/100 so a click near an edge doesn't produce a degenerate sliver pane.
function percentFromClickRows(el, event) {
    if (!el || !event) return 50;
    const rect = el.getBoundingClientRect();
    const raw = ((event.clientY - rect.top) / rect.height) * 100;
    return Math.max(10, Math.min(90, raw));
}

function percentFromClickColumns(el, event) {
    if (!el || !event) return 50;
    const rect = el.getBoundingClientRect();
    const raw = ((event.clientX - rect.left) / rect.width) * 100;
    return Math.max(10, Math.min(90, raw));
}

function splitRows(nodeId, event) {
    const doc = app.designer.getDocument();
    if (!doc || !nodeId) return;

    const original = doc.find(nodeId);
    if (!original || original.type === 'splitter') return; // splitting a splitter isn't well-defined yet

    if (!isSplittable(original)) {
        app.ui.alert({
            title: _('Cannot Split'),
            body: () => `<p style="margin:0;line-height:1.5;">${_('This element cannot be split.')}</p>`,
            confirm: _('OK')
        });
        return;
    }

    const originalType = original.type;
    const targetEl = document.querySelector(`#designerCanvasBody [data-node-id="${nodeId}"]`);
    const percent = percentFromClickRows(targetEl, event);

    const before = _snapshotNode(original);
    let after = null;

    const doSplit = () => {
        if (after) { _applyNodeSnapshot(doc, nodeId, after); return; }
        app.designer.convertToRowSplitter(nodeId, percent);
        after = _snapshotNode(doc.find(nodeId));
    };

    const session = app.designer.win?.history;
    const title = _('Split') + ' ' + originalType + ' (' + _('rows') + ', ' + Math.round(percent) + '%/' + Math.round(100 - percent) + '%)';
    if (session) {
        session.execute({
            type:  'node.split',
            title,
            do()   { doSplit(); app.designer.render(); },
            undo() { _applyNodeSnapshot(doc, nodeId, before); app.designer.render(); },
            redo() { doSplit(); app.designer.render(); }
        });
    } else {
        doSplit();
        app.designer.render();
    }
}

function splitColumns(nodeId, event) {
    const doc = app.designer.getDocument();
    if (!doc || !nodeId) return;

    const original = doc.find(nodeId);
    if (!original || original.type === 'splitter') return; // splitting a splitter isn't well-defined yet

    if (!isSplittable(original)) {
        app.ui.alert({
            title: _('Cannot Split'),
            body: () => `<p style="margin:0;line-height:1.5;">${_('This element cannot be split.')}</p>`,
            confirm: _('OK')
        });
        return;
    }

    const originalType = original.type;
    const targetEl = document.querySelector(`#designerCanvasBody [data-node-id="${nodeId}"]`);
    const percent = percentFromClickColumns(targetEl, event);

    const before = _snapshotNode(original);
    let after = null;

    const doSplit = () => {
        if (after) { _applyNodeSnapshot(doc, nodeId, after); return; }
        app.designer.convertToColumnSplitter(nodeId, percent);
        after = _snapshotNode(doc.find(nodeId));
    };

    const session = app.designer.win?.history;
    const title = _('Split') + ' ' + originalType + ' (' + _('columns') + ', ' + Math.round(percent) + '%/' + Math.round(100 - percent) + '%)';
    if (session) {
        session.execute({
            type:  'node.split',
            title,
            do()   { doSplit(); app.designer.render(); },
            undo() { _applyNodeSnapshot(doc, nodeId, before); app.designer.render(); },
            redo() { doSplit(); app.designer.render(); }
        });
    } else {
        doSplit();
        app.designer.render();
    }
}

// Captures the mutable fields convertToRowSplitter/convertToColumnSplitter
// overwrite in place, so a split can be undone/redone by swapping between a
// before/after snapshot instead of re-running the conversion (which would
// mint fresh pane ids on every redo). Shared by both directions — this is
// generic node-snapshot bookkeeping, not splitting logic, so there's no
// rows/columns cross-contamination risk here.
function _snapshotNode(node) {
    return { type: node.type, name: node.name, layout: node.layout, style: node.style, props: node.props, children: node.children };
}

function _applyNodeSnapshot(doc, nodeId, snap) {
    const node = doc.find(nodeId);
    if (!node) return;
    node.type = snap.type;
    node.name = snap.name;
    node.layout = snap.layout;
    node.style = snap.style;
    node.props = snap.props;
    node.children = snap.children;
}

// Inserts a new empty pane as a sibling of `nodeId` within its *existing*
// parent splitter — an alternative to splitRows/splitColumns' usual nesting
// (turning the clicked node itself into a nested sub-splitter) for when the
// clicked node is already a pane of a splitter. All panes end up with an
// equal share (e.g. 2 existing 50/50 panes + 1 new one -> 33.33% each)
// rather than trying to guess how the new pane's space should be carved out
// of just one sibling.
function addSiblingPaneRows(nodeId, event) {
    const doc = app.designer.getDocument();
    if (!doc) return;
    const node = doc.find(nodeId);
    if (!node) return;

    const parent = doc.root.findParentOf(nodeId);
    if (!parent || parent.type !== 'splitter') return;

    const parentId = parent.id;
    let insertedId = null;

    const isPxMode = !parent.children.some(c => c.props?.flexBasis != null);

    if (isPxMode) {
        const doAdd = () => {
            const inserted = doc.insertNode(insertedId ? { type: 'container', id: insertedId } : { type: 'container' }, nodeId, 'after');
            insertedId = inserted.id;
        };
        const undoAdd = () => { doc.removeNode(insertedId); };

        const session = app.designer.win?.history;
        const title = _('Added pane') + ' (' + (parent.children.length + 1) + ' ' + _('panes') + ')';
        if (session) {
            session.execute({
                type:  'node.split',
                title,
                do()   { doAdd(); app.designer.render(); },
                undo() { undoAdd(); app.designer.render(); },
                redo() { doAdd(); app.designer.render(); }
            });
        } else {
            doAdd();
            app.designer.render();
        }
        return;
    }

    const priorClickedShare = node.props.flexBasis;
    const clickedShareNum = parseFloat(priorClickedShare) || (100 / parent.children.length);
    const clickedEl = document.querySelector(`#designerCanvasBody [data-node-id="${nodeId}"]`);
    const clickFraction = percentFromClickRows(clickedEl, event) / 100; // 0.1-0.9, clamped
    const keptShare = (clickedShareNum * clickFraction).toFixed(2) + '%';
    const newShare = (clickedShareNum * (1 - clickFraction)).toFixed(2) + '%';

    const doAdd = () => {
        const inserted = doc.insertNode(insertedId
            ? { type: 'container', id: insertedId, props: { flexBasis: newShare } }
            : { type: 'container', props: { flexBasis: newShare } }, nodeId, 'after');
        insertedId = inserted.id;
        const p = doc.find(parentId);
        const clicked = p.children.find(c => c.id === nodeId);
        if (clicked) clicked.props.flexBasis = keptShare;
    };
    const undoAdd = () => {
        doc.removeNode(insertedId);
        const p = doc.find(parentId);
        if (!p) return;
        const clicked = p.children.find(c => c.id === nodeId);
        if (clicked) clicked.props.flexBasis = priorClickedShare;
    };

    const session = app.designer.win?.history;
    const title = _('Added pane') + ' (' + (parent.children.length + 1) + ' ' + _('panes') + ')';
    if (session) {
        session.execute({
            type:  'node.split',
            title,
            do()   { doAdd(); app.designer.render(); },
            undo() { undoAdd(); app.designer.render(); },
            redo() { doAdd(); app.designer.render(); }
        });
    } else {
        doAdd();
        app.designer.render();
    }
}

function addSiblingPaneColumns(nodeId, event) {
    const doc = app.designer.getDocument();
    if (!doc) return;
    const node = doc.find(nodeId);
    if (!node) return;

    const parent = doc.root.findParentOf(nodeId);
    if (!parent || parent.type !== 'splitter') return;

    const parentId = parent.id;
    let insertedId = null;

    const priorClickedShare = node.props.flexBasis;
    const clickedShareNum = parseFloat(priorClickedShare) || (100 / parent.children.length);
    const clickedEl = document.querySelector(`#designerCanvasBody [data-node-id="${nodeId}"]`);
    const clickFraction = percentFromClickColumns(clickedEl, event) / 100; // 0.1-0.9, clamped
    const keptShare = (clickedShareNum * clickFraction).toFixed(2) + '%';
    const newShare = (clickedShareNum * (1 - clickFraction)).toFixed(2) + '%';

    const doAdd = () => {
        const inserted = doc.insertNode(insertedId
            ? { type: 'container', id: insertedId, props: { flexBasis: newShare } }
            : { type: 'container', props: { flexBasis: newShare } }, nodeId, 'after');
        insertedId = inserted.id;
        const p = doc.find(parentId);
        const clicked = p.children.find(c => c.id === nodeId);
        if (clicked) clicked.props.flexBasis = keptShare;
    };
    const undoAdd = () => {
        doc.removeNode(insertedId);
        const p = doc.find(parentId);
        if (!p) return;
        const clicked = p.children.find(c => c.id === nodeId);
        if (clicked) clicked.props.flexBasis = priorClickedShare;
    };

    const session = app.designer.win?.history;
    const title = _('Added pane') + ' (' + (parent.children.length + 1) + ' ' + _('panes') + ')';
    if (session) {
        session.execute({
            type:  'node.split',
            title,
            do()   { doAdd(); app.designer.render(); },
            undo() { undoAdd(); app.designer.render(); },
            redo() { doAdd(); app.designer.render(); }
        });
    } else {
        doAdd();
        app.designer.render();
    }
}

// ── Dispatch layer ───────────────────────────────────────────────────────
// setActive() and bindCanvasClick() branch on `direction` to pick *which*
// pair of the fully-separate functions above to call — that's tool-mode
// bookkeeping (which cursor, which toolId, which click landed), not
// splitting logic itself, so sharing it carries none of the regression
// risk the split/addSiblingPane/convertTo* functions above were split up
// to avoid.

function setActive(direction) {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return null;

    const toolId = 'split-' + direction; // 'split-rows' | 'split-columns'

    if (app.designer.activeTool === toolId) {
        app.designer.setActiveTool('select'); // back to the default cursor tool
        hideAllHoverUI();
        return null;
    }

    app.designer.setActiveTool(toolId);
    canvasBody.style.cursor = direction === 'rows' ? cursorForRows() : cursorForColumns();
    canvasBody.classList.add('designer-split-mode');
    return direction;
}

const PREVIEW_MIN_PERCENT = 10;
const PREVIEW_MAX_PERCENT = 90;
const PREVIEW_MIN_HEIGHT_PX = 40;

let previewLineEl = null;   // columns: vertical line following mouse X
let rowPreviewEl = null;    // rows: two-block preview overlay, no line
let splitterInfoEl = null;  // existing-splitter hover info panel
let paneHighlightEl = null; // which pane (of an existing splitter) is under the cursor

/**
 * The designer canvas's own visible (scrolled) viewport — same reasoning
 * as tools/resize.js's own copy of this helper: every overlay this file
 * creates (preview line, row-preview box, info panel) is position:fixed
 * on document.body, entirely outside #designerCanvasBody's DOM subtree, so
 * that element's own overflow:hidden never constrains them — a splitter
 * wider/taller than the visible canvas viewport could otherwise place
 * these outside the canvas entirely (reported live, with a screenshot).
 * Duplicated rather than imported, matching this file's own no-shared-code
 * convention for standalone helpers.
 */
function getCanvasVisibleBounds() {
    const el = document.getElementById('designerCanvasContent');
    return el ? el.getBoundingClientRect() : { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
}

function ensurePreviewLine() {
    if (!previewLineEl) {
        previewLineEl = document.createElement('div');
        previewLineEl.className = 'db-split-preview-line';
        document.body.appendChild(previewLineEl);
    }
    return previewLineEl;
}

function ensureRowPreview() {
    if (!rowPreviewEl) {
        rowPreviewEl = document.createElement('div');
        rowPreviewEl.className = 'db-split-row-preview';
        rowPreviewEl.innerHTML =
            '<div class="db-split-row-preview-half"><span></span></div>' +
            '<div class="db-split-row-preview-half"><span></span></div>';
        document.body.appendChild(rowPreviewEl);
    }
    return rowPreviewEl;
}

function ensureSplitterInfo() {
    if (!splitterInfoEl) {
        splitterInfoEl = document.createElement('div');
        splitterInfoEl.className = 'db-split-info-panel';
        document.body.appendChild(splitterInfoEl);
    }
    return splitterInfoEl;
}

function hideColumnPreview() { if (previewLineEl) previewLineEl.style.display = 'none'; }
function hideRowPreview() { if (rowPreviewEl) rowPreviewEl.style.display = 'none'; }
function hideSplitterInfo() {
    if (splitterInfoEl) splitterInfoEl.style.display = 'none';
    if (paneHighlightEl) { paneHighlightEl.classList.remove('db-split-pane-highlight'); paneHighlightEl = null; }
}
function hideAllHoverUI() { hideColumnPreview(); hideRowPreview(); hideSplitterInfo(); }

/** Vertical blue line at the mouse's current X, spanning the hovered node's own height — columns only, no other preview shape. */
function showColumnPreviewLine(el, event) {
    hideRowPreview();
    hideSplitterInfo();
    const rect = el.getBoundingClientRect();
    const bounds = getCanvasVisibleBounds();
    const line = ensurePreviewLine();
    line.style.display = 'block';
    line.style.left = Math.max(bounds.left, Math.min(event.clientX, bounds.right)) + 'px';
    line.style.top = Math.max(rect.top, bounds.top) + 'px';
    line.style.height = (Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top)) + 'px';
}

/** Two-block mockup over the hovered node — rows only. Deliberately not a line (spec: "no blue line for rows"). */
function showRowPreview(el) {
    hideColumnPreview();
    hideSplitterInfo();
    const rect = el.getBoundingClientRect();
    const bounds = getCanvasVisibleBounds();
    const left = Math.max(rect.left, bounds.left);
    const top = Math.max(rect.top, bounds.top);
    const preview = ensureRowPreview();
    preview.style.display = 'flex';
    preview.style.left = left + 'px';
    preview.style.top = top + 'px';
    preview.style.width = (Math.min(rect.right, bounds.right) - left) + 'px';
    preview.style.height = Math.min(PREVIEW_MIN_HEIGHT_PX * 2, bounds.bottom - top) + 'px';
    const halves = preview.querySelectorAll('.db-split-row-preview-half span');
    halves.forEach(s => { s.textContent = PREVIEW_MIN_HEIGHT_PX + 'px'; });
}

/**
 * Existing-splitter hover info: pane count, every pane's current size,
 * resize limits, and which pane (if any) the cursor is currently over —
 * all shown from a plain hover, no dragging required (a separate, ambient
 * concern from tools/resize.js's own boundary-drag-only info panel).
 */
function showSplitterInfo(splitterNode, splitterEl, event) {
    hideColumnPreview();
    hideRowPreview();

    const direction = splitterNode.props?.direction;
    const isRows = direction === 'rows';
    const isPxMode = isRows && !splitterNode.children.some(c => c.props?.flexBasis != null);

    const paneEls = Array.from(splitterEl.children).filter(c => c.classList.contains('db-splitter-pane'));
    const sizesText = splitterNode.children.map((c, i) => {
        if (isPxMode) return (c.props?.height != null ? c.props.height + 'px' : PREVIEW_MIN_HEIGHT_PX + 'px (' + _('Def') + ')');
        return (parseFloat(c.props?.flexBasis) || 0).toFixed(0) + '%';
    }).join(' | ');
    const limitsText = isPxMode
        ? _('min') + ' ' + PREVIEW_MIN_HEIGHT_PX + 'px'
        : PREVIEW_MIN_PERCENT + '%–' + PREVIEW_MAX_PERCENT + '%';

    let hoveredIndex = -1;
    for (let i = 0; i < paneEls.length; i++) {
        const r = paneEls[i].getBoundingClientRect();
        if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
            hoveredIndex = i;
            break;
        }
    }
    if (paneHighlightEl && paneHighlightEl !== paneEls[hoveredIndex]) {
        paneHighlightEl.classList.remove('db-split-pane-highlight');
        paneHighlightEl = null;
    }
    if (hoveredIndex >= 0) {
        paneHighlightEl = paneEls[hoveredIndex];
        paneHighlightEl.classList.add('db-split-pane-highlight');
    }

    const panel = ensureSplitterInfo();
    panel.style.display = 'block';
    panel.innerHTML =
        `<div class="db-split-info-row"><b>${splitterNode.children.length}</b> ${_('panes')} (${isRows ? _('rows') : _('columns')})</div>` +
        `<div class="db-split-info-row">${_('Sizes')}: ${sizesText}</div>` +
        `<div class="db-split-info-row">${_('Resize limits')}: ${limitsText}</div>` +
        (hoveredIndex >= 0 ? `<div class="db-split-info-row">${_('New split target')}: ${_('pane')} ${hoveredIndex + 1}</div>` : '');

    const OFFSET = 14;
    const bounds = getCanvasVisibleBounds();
    let left = event.clientX + OFFSET;
    let top = event.clientY + OFFSET;
    const pr = panel.getBoundingClientRect();
    if (left + pr.width > Math.min(window.innerWidth, bounds.right)) left = event.clientX - OFFSET - pr.width;
    if (top + pr.height > Math.min(window.innerHeight, bounds.bottom)) top = event.clientY - OFFSET - pr.height;
    left = Math.max(bounds.left, Math.min(left, bounds.right - pr.width));
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - pr.height));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
}

function bindHoverPreview() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    canvasBody.addEventListener('mousemove', (e) => {
        const direction = currentDirection();
        if (!direction) { hideAllHoverUI(); return; }

        const el = e.target.closest('.db-node');
        if (!el) { hideAllHoverUI(); return; }

        const doc = app.designer.getDocument();
        const node = doc?.find(el.dataset.nodeId);
        if (!node) { hideAllHoverUI(); return; }

        const parent = doc.root.findParentOf(node.id);
        const isExistingSplitterContext = node.type === 'splitter' || (parent && parent.type === 'splitter');

        if (isExistingSplitterContext) {
            const splitterNode = node.type === 'splitter' ? node : parent;
            const splitterEl = node.type === 'splitter' ? el : document.querySelector(`#designerCanvasBody [data-node-id="${splitterNode.id}"]`);
            if (splitterEl) showSplitterInfo(splitterNode, splitterEl, e);
            return;
        }

        if (direction === 'columns') showColumnPreviewLine(el, e);
        else showRowPreview(el);
    });

    canvasBody.addEventListener('mouseleave', hideAllHoverUI);
}

function bindCanvasClick() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    $(canvasBody).on('click', '.db-node', function (e) {
        const direction = currentDirection();
        if (!direction) return;
        e.stopPropagation();
        hideAllHoverUI();

        const nodeId = this.dataset.nodeId;
        const doc = app.designer.getDocument();
        const parent = doc?.root.findParentOf(nodeId);

        const split       = direction === 'rows' ? splitRows       : splitColumns;
        const addSibling  = direction === 'rows' ? addSiblingPaneRows : addSiblingPaneColumns;

        if (parent && parent.type === 'splitter' && parent.props.direction === direction) {
            app.ui.confirm({
                title: _('Add Pane or Split?'),
                body: () => `<p style="margin:0;line-height:1.5;">${_('This is already one pane of a split.')}<br>${_('Add another pane alongside it (all panes get an equal share), or split just this pane into a nested layout?')}</p>`,
                confirm: _('Add Pane'),
                cancel: _('Split Pane'),
                onConfirm: () => addSibling(nodeId, e),
                onCancel: () => split(nodeId, e)
            });
            return;
        }

        split(nodeId, e);
    });

    $(document).on('keydown', e => {
        const direction = currentDirection();
        if (e.key === 'Escape' && direction) app.designer.setActiveTool('select'); // toggles off
    });
}

function injectCSS() {
    if (document.getElementById('designer-split-tool-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-split-tool-style';
    style.textContent = `
        .designer-split-mode .db-node:hover { outline: 2px dashed #4da3ff; outline-offset: -2px; }
        .db-split-preview-line {
            position: fixed; display: none; pointer-events: none; z-index: 9500;
            width: 2px; background: #4da3ff;
        }
        /* Deliberately NOT blue (spec: rows preview must not use a line) —
           a neutral overlay + divider instead. */
        .db-split-row-preview {
            position: fixed; display: none; flex-direction: column; pointer-events: none; z-index: 9500;
            background: rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.25);
            box-sizing: border-box; /* width is clamped to the canvas's own visible bounds exactly (showRowPreview) -- content-box's default would add the border on top and overshoot by that amount */
        }
        .db-split-row-preview-half {
            flex: 1; display: flex; align-items: center; justify-content: center;
            border-bottom: 1px dashed rgba(0,0,0,0.3);
        }
        .db-split-row-preview-half:last-child { border-bottom: none; }
        .db-split-row-preview-half span {
            font-size: 10px; color: rgba(0,0,0,0.6); background: rgba(255,255,255,0.7);
            padding: 1px 4px; border-radius: 2px;
        }
        .db-split-info-panel {
            position: fixed; display: none; pointer-events: none; z-index: 9600;
            background: #24272b; color: #fff; font-size: 11px; line-height: 1.5;
            border-radius: 4px; padding: 6px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            white-space: nowrap;
        }
        .db-split-info-row + .db-split-info-row { margin-top: 2px; }
        .db-split-pane-highlight { outline: 2px dashed #4da3ff; outline-offset: -2px; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();
    registerCustomCursors();
    bindCanvasClick();
    bindHoverPreview();

    app.designer = app.designer || {};
    app.designer.splitTool = {
        /** @returns {'rows'|'columns'|null} The direction now active, or null if just deactivated. */
        activate: setActive,
        isActive: currentDirection
    };
}
