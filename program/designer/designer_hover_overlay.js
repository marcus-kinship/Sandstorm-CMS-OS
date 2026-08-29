/**
 * @file designer/designer_hover_overlay.js
 * @description Two independent floating tags over #designerCanvasBody:
 *  - a *selection* tag, tied to `app.designer.selection` (designer_selection.js,
 *    the single source of truth for "which node is selected") — persistent,
 *    only changes when the selection itself changes.
 *  - a *hover* tag, tied purely to mouseover — transient, shown for
 *    whatever's currently under the cursor.
 *
 * They're deliberately separate elements so both can be visible at once:
 * e.g. select a child, then hover its parent — the child keeps its own
 * (solid) selection tag while the parent gets its own (lighter) hover tag
 * alongside it, instead of one tag "jumping" between the two and only ever
 * showing one at a time. Hovering the *same* node that's already selected
 * just skips showing a redundant second tag on top of the first.
 *
 * Being visible at once means they can also land on the exact same spot —
 * a child that's the first/only content of its parent shares its parent's
 * own top-left corner, so computeTagPosition (which only looks at the one
 * element it's positioning for) produces identical coordinates for both.
 * avoidTagOverlap nudges the second tag down by its own height whenever
 * that happens.
 *
 * Each tag also gets a min-height + outline on its node (via CSS :hover, no
 * JS needed for that part) so empty/collapsed nodes are still visible and
 * clickable.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * designer_selection.js (needs `app.designer.selection`).
 *
 * @module program/designer/designer_hover_overlay
 */

let selectionTagEl = null;
let selectionTagNodeId = null;

let hoverTagEl = null;
let hoverTagNodeId = null;

const TAG_HEIGHT = 20;
const TAG_GAP = 4;

function nodeTypeOf(el) {
    const m = el.className.match(/\bdb-node\b.*?\bdb-([a-z]+)\b/);
    return m ? m[1] : 'node';
}

function hideSelectionTag(reason = 'unknown') {
    if (!selectionTagEl) return;
    app.dev.log(`hideSelectionTag reason=${reason}`, 'Designer');
    selectionTagEl.remove();
    selectionTagEl = null;
    selectionTagNodeId = null;
}

function hideHoverTag(reason = 'unknown') {
    if (!hoverTagEl) return;
    app.dev.log(`hideHoverTag reason=${reason}`, 'Designer');
    hoverTagEl.remove();
    hoverTagEl = null;
    hoverTagNodeId = null;
}

/**
 * Where a tag should sit relative to `el`, without ever mutating `el`'s
 * own layout — a pure overlay (`position:fixed` on `document.body`, see
 * showSelectionTag/showHoverTag), never reserved space inside the node
 * itself. Floats just above the node's own top edge when there's room in
 * the canvas viewport; falls back to just below the node's own bottom edge
 * when there isn't (e.g. the node sits right at the top of a scrolled
 * canvas) — but only if *that* still fits inside the visible canvas
 * viewport too. A node taller than the viewport itself (e.g. a root-level
 * splitter filling the whole canvas) has a bottom edge that can sit right
 * at or past the viewport's own bottom, so "below" needs the same
 * room-check "above" already got — falling back further to overlapping the
 * node's own top-left corner (clamped to the viewport) rather than ever
 * pushing the tag out past the visible canvas, let alone the window
 * itself. See NOTES.md for the reasoning.
 * @param {Element} el
 * @returns {{left: number, top: number}}
 */
function computeTagPosition(el) {
    const rect = el.getBoundingClientRect();
    const contentRect = document.getElementById('designerCanvasContent')?.getBoundingClientRect();
    const contentTop = contentRect?.top ?? 0;
    const contentBottom = contentRect?.bottom ?? window.innerHeight;

    if (rect.top - contentTop >= TAG_HEIGHT) return { left: rect.left, top: rect.top - TAG_HEIGHT };

    const below = rect.bottom + TAG_GAP;
    if (below + TAG_HEIGHT <= contentBottom) return { left: rect.left, top: below };

    return { left: rect.left, top: Math.max(rect.top, contentTop) };
}

/**
 * Nudges `pos` down by one tag's height if it would land on top of
 * `otherEl`'s tag — happens whenever the hovered/selected node's own
 * top-left corner coincides with an ancestor's or descendant's (the common
 * case: a first/only child with no margin sits at exactly its parent's own
 * top-left), since computeTagPosition only looks at the one element it's
 * positioning for, not at what else is already on screen.
 * @param {{left: number, top: number}} pos
 * @param {Element|null} otherEl
 * @returns {{left: number, top: number}}
 */
function avoidTagOverlap(pos, otherEl) {
    if (!otherEl) return pos;
    const otherRect = otherEl.getBoundingClientRect();
    const overlaps = Math.abs(pos.top - otherRect.top) < TAG_HEIGHT && Math.abs(pos.left - otherRect.left) < otherRect.width;
    if (!overlaps) return pos;
    return { left: pos.left, top: pos.top + TAG_HEIGHT + TAG_GAP };
}

/**
 * The tags are `position:fixed` on `document.body` — outside the Designer
 * window element entirely, so they never inherit its stacking context. A
 * hardcoded z-index (the old fixed 9000) meant they kept rendering *above
 * every other window*, even one the user had just brought to front over a
 * backgrounded Designer. Deriving it from the Designer window's own live
 * z-index instead means the tags only ever sit just above Designer itself,
 * like any other in-window UI would. Clamped just under app.ui.tooltip's
 * `.ui-tooltip` (z-index 9999) — same ceiling the original hardcoded value
 * respected — in case a window z-index ever gets unexpectedly high.
 * @returns {Element|null}
 */
function designerWindowEl() {
    return document.getElementById('designerCanvasBody')?.closest('.window') || null;
}

function currentTagZIndex() {
    const winEl = designerWindowEl();
    const z = winEl ? parseInt(winEl.style.zIndex, 10) : NaN;
    return Math.min((Number.isFinite(z) ? z : 8999) + 1, 9998);
}

/**
 * Whether it's safe to show the tags at all right now. Every real window
 * gets a sequential *integer* z-index (menu-body.js's getOrder()), so
 * `designerZ + 1` (currentTagZIndex above) is only guaranteed to sit above
 * Designer's own content — it can just as easily land exactly on whatever
 * window is stacked immediately above Designer (e.g. Designer at 5000, a
 * window that just stole focus at 5001: a dead tie, whose visual winner
 * then depends on DOM insertion order rather than intent). A fractional
 * offset (e.g. +0.5) was tried and doesn't work — CSS `z-index` only
 * accepts integers, so the browser silently drops a fractional value
 * (confirmed live: `.style.zIndex` came back as `""`, not "5000.5"),
 * falling straight back to whatever the stylesheet's own z-index says.
 * Simplest correct fix: only ever show the tags while Designer's own
 * window is the frontmost/active one (`.active`, the same class every
 * window in this OS gets when it holds focus) — there's nothing above an
 * active window by definition, so `+1` is always safe in that case, and
 * there's no reason to show Designer-specific overlays floating above
 * whatever other window the user is now actually looking at otherwise.
 */
function isDesignerWindowActive() {
    const winEl = designerWindowEl();
    return !!winEl && winEl.classList.contains('active');
}

/**
 * Builds one floating tag for `el`. `variant` is 'selection' or 'hover' —
 * only changes the CSS class (visual weight) and which delete-callback/kind
 * of log line it uses; the positioning logic is identical for both.
 */
function buildTag(el, variant) {
    const type = nodeTypeOf(el);
    let pos = computeTagPosition(el);
    pos = avoidTagOverlap(pos, variant === 'hover' ? selectionTagEl : hoverTagEl);

    const el2 = document.createElement('div');
    el2.className = variant === 'selection' ? 'db-hover-tag db-hover-tag-selection' : 'db-hover-tag db-hover-tag-preview';
    el2.style.left = pos.left + 'px';
    el2.style.top = pos.top + 'px';
    el2.style.zIndex = currentTagZIndex();
    el2.style.display = isDesignerWindowActive() ? '' : 'none';
    el2.innerHTML = `<span class="db-hover-tag-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>`;

    if (variant === 'selection') {
        el2.innerHTML += `<span class="db-hover-tag-clear" title="${_('Delete')}">&times;</span>`;
        el2.querySelector('.db-hover-tag-clear').addEventListener('click', e => {
            e.stopPropagation();
            const doc = app.designer.getDocument();
            if (!doc) return;

            const nodeId = el.dataset.nodeId;
            const parent = doc.root.findParentOf(nodeId);
            if (!parent) return;
            const index = parent.children.findIndex(c => c.id === nodeId);
            if (index === -1) return;
            const parentId  = parent.id;
            const nodeJson  = parent.children[index].toJSON();

            const doDelete = () => {
                doc.removeNode(nodeId);
                if (app.designer.selection.get() === nodeId) app.designer.selection.clear('deleted');
                app.designer.render();
            };
            const doRestore = () => {
                const p = doc.find(parentId);
                if (!p) return;
                const sibling = p.children[index];
                sibling ? doc.insertNode(nodeJson, sibling.id, 'before') : doc.insertNode(nodeJson, parentId, 'inside');
                app.designer.render();
            };

            const session = app.designer.win?.history;
            if (session) {
                session.execute({
                    type:  'node.delete',
                    title: _('Deleted') + ' ' + type,
                    do()   { doDelete(); },
                    undo() { doRestore(); },
                    redo() { doDelete(); }
                });
            } else {
                doDelete();
            }
        });
    }

    return el2;
}

function showSelectionTag(el, reason = 'unknown') {
    if (selectionTagNodeId === el.dataset.nodeId) return;
    hideSelectionTag(reason);
    app.dev.log(`showSelectionTag(${el.dataset.nodeId}) reason=${reason}`, 'Designer');

    selectionTagEl = buildTag(el, 'selection');
    document.body.appendChild(selectionTagEl);
    selectionTagNodeId = el.dataset.nodeId;
}

function showHoverTag(el, reason = 'unknown') {
    if (hoverTagNodeId === el.dataset.nodeId) return;
    hideHoverTag(reason);
    app.dev.log(`showHoverTag(${el.dataset.nodeId}) reason=${reason}`, 'Designer');

    hoverTagEl = buildTag(el, 'hover');

    hoverTagEl.addEventListener('mouseleave', e => {
        if (e.relatedTarget?.closest('#designerCanvasBody')) return;
        hideHoverTag('mouseleave-tag');
    });

    document.body.appendChild(hoverTagEl);
    hoverTagNodeId = el.dataset.nodeId;
}

let rowHoverSplitterEl = null;
let lastHoveredEl = null;

/**
 * Toggles db-split-row-hover on the nearest .db-splitter.row ancestor of
 * `el` (or on `el` itself, if it IS one) — CSS then shows the border on
 * every one of its direct pane children (designer_objectmodel.js). Only
 * while Select or a Split direction is the active tool; plain CSS :hover
 * can't express that half of the condition on its own.
 */
function updateRowSplitterHover(el) {
    const toolOk = app.designer.activeTool === 'select' || app.designer.activeTool === 'split-rows' || app.designer.activeTool === 'split-columns';
    const splitterEl = (toolOk && el) ? el.closest('.db-splitter.row') : null;
    if (splitterEl === rowHoverSplitterEl) return;
    if (rowHoverSplitterEl) rowHoverSplitterEl.classList.remove('db-split-row-hover');
    rowHoverSplitterEl = splitterEl;
    if (rowHoverSplitterEl) rowHoverSplitterEl.classList.add('db-split-row-hover');
}

/** Binds hover-tag and click-to-select behavior on the canvas. See NOTES.md. */
function bindHover() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    $(canvasBody).on('mouseover', function (e) {
        if (document.querySelector('.ui-draggable-dragging')) { hideHoverTag('drag-active'); return; }

        const el = e.target.closest('.db-node');
        lastHoveredEl = el;
        updateRowSplitterHover(el);

        if (!el) { hideHoverTag('mouseover-empty-space'); return; }

        if (app.designer.selection.get() === el.dataset.nodeId) { hideHoverTag('hover-matches-selection'); return; }
        showHoverTag(el, 'mousemove');
    });

    $(canvasBody).on('click', '.db-node', function () {
        if (app.designer.activeTool !== 'select') return;
        app.designer.selection.select(this.dataset.nodeId, 'click');
    });
    $(canvasBody).on('click', function (e) {
        if (app.designer.activeTool !== 'select') return;
        if (e.target === canvasBody) app.designer.selection.clear('canvas-click');
    });

    $(canvasBody).on('mouseleave', function (e) {
        if (e.relatedTarget?.closest('.db-hover-tag')) return;
        hideHoverTag('mouseleave-canvas');
        lastHoveredEl = null;
        updateRowSplitterHover(null);
    });

    $(document).on('designer-tool-changed', () => updateRowSplitterHover(lastHoveredEl));
}

function injectCSS() {
    if (document.getElementById('designer-hover-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-hover-overlay-style';
    style.textContent = `
        .db-node { min-height: 40px; box-sizing: border-box; }
        #designerCanvasBody .db-node:hover:not(.db-selected) { outline: 1px solid rgba(77,163,255,0.6); outline-offset: -1px; }
        .db-hover-tag { position: fixed; z-index: 9000; display: flex; align-items: center; gap: 4px; padding: 1px 2px 1px 5px; background: #4da3ff; color: #fff; font-size: 10px; line-height: 1.6; border: 1px solid rgba(0,0,0,0.15); border-radius: 0 0 4px 0; pointer-events: none; }
        .db-hover-tag-preview { opacity: 0.6; }
        .db-hover-tag-label { pointer-events: none; }
        .db-hover-tag-clear { cursor: pointer; padding: 0 3px; border-radius: 2px; pointer-events: none; }
        body.db-tool-select .db-hover-tag-clear { pointer-events: auto; }
        .db-hover-tag-clear:hover { background: rgba(255,255,255,0.3); }
    `;
    document.head.appendChild(style);
}

function repositionOne(tagEl, nodeId, otherEl) {
    if (!tagEl || !nodeId) return;
    const el = document.querySelector(`#designerCanvasBody [data-node-id="${nodeId}"]`);
    if (!el) return;
    const pos = avoidTagOverlap(computeTagPosition(el), otherEl);
    tagEl.style.left = pos.left + 'px';
    tagEl.style.top = pos.top + 'px';
    tagEl.style.zIndex = currentTagZIndex();
    tagEl.style.display = isDesignerWindowActive() ? '' : 'none';
}

/**
 * Repositions both tags immediately, on demand — for anything that changes
 * a node's own size/position without changing #designerCanvasContent's or
 * #designerCanvasBody's own outer dimensions (which the ResizeObserver
 * below already covers). A splitter-pane resize drag (tools/resize.js) is
 * exactly this: only the dragged pane elements' own style.height changes
 * tick by tick, so nothing here would otherwise notice until the drag ends
 * and a full render() rebuilds the tags from scratch — leaving a visible
 * tag stuck at its pre-drag position for the whole drag. Exposed on
 * `app.designer` so tools outside this file can call it live.
 */
function repositionTags() {
    repositionOne(selectionTagEl, selectionTagNodeId, null);
    repositionOne(hoverTagEl, hoverTagNodeId, selectionTagEl);
}

export function init(app) {
    injectCSS();
    bindHover();

    app.designer.repositionTags = repositionTags;

    $(document).on('designer-selection-changed', (e, id, reason) => {
        if (id) {
            if (hoverTagNodeId === id) hideHoverTag('now-selected');
            const el = document.querySelector(`#designerCanvasBody [data-node-id="${id}"]`);
            if (el) showSelectionTag(el, reason);
        } else {
            hideSelectionTag(reason);
        }
    });

    app.designer._registerRenderHook(() => {
        hideHoverTag('render');
        const id = app.designer.selection.get();
        hideSelectionTag('render');
        if (!id) return;
        const el = document.querySelector(`#designerCanvasBody [data-node-id="${id}"]`);
        if (el) showSelectionTag(el, 'render');
    });

    app.designer._registerRenderHook(() => {
        rowHoverSplitterEl = null;
        lastHoveredEl = null;
    });

    const canvasContent = document.getElementById('designerCanvasContent');
    const canvasBody = document.getElementById('designerCanvasBody');
    if (canvasContent || canvasBody) {
        const ro = new ResizeObserver(repositionTags);
        if (canvasContent) ro.observe(canvasContent);
        if (canvasBody) ro.observe(canvasBody);
    }

    const winEl = designerWindowEl();
    if (winEl) {
        let settleTimer = null;
        const onWindowStyleChange = () => {
            repositionTags();
            clearTimeout(settleTimer);
            settleTimer = setTimeout(repositionTags, 350);
        };
        const styleObserver = new MutationObserver(onWindowStyleChange);
        styleObserver.observe(winEl, { attributes: true, attributeFilter: ['style', 'class'] });
    }
}
