/**
 * @file designer/tools/resize.js
 * @description The Resize Tool — drags the seam between two adjacent
 * splitter panes to change their split ratio. One of three peer tools —
 * see program/designer/NOTES.md's "Tool separation" section; each owns a
 * distinct, non-overlapping responsibility:
 *
 *  - Select: which node is selected. Never touches structure or geometry.
 *  - Split:  creates/restructures splitter nodes (tools/split.js,
 *            `app.designer.convertToRowSplitter`/`convertToColumnSplitter`).
 *            Sets each new pane's *initial* flexBasis, but never revisits
 *            it afterward.
 *  - Resize: changes an *existing* pane's `props.flexBasis` only. Never
 *            creates, removes, or reparents a node.
 *
 * Unlike Select/Split, Resize is ambient rather than gated behind
 * `app.designer.activeTool` — hovering within HIT_DISTANCE of any pane
 * boundary makes it draggable regardless of which tool is currently active,
 * the same way a resize handle in Figma/Photoshop stays live under the
 * cursor no matter what tool is selected. A boundary is only draggable when
 * *both* adjacent panes are resizable (rules/element_capabilities.js) —
 * dragging couldn't move just one side's edge anyway.
 *
 * blocks/splitter.js renders panes directly adjacent (no
 * `.db-splitter-handle` divider element) — this file treats the seam as a
 * boundary rather than an object: it detects the pointer's distance from a
 * pane boundary (purely from `getBoundingClientRect`, re-derived on every
 * mousemove) and starts/updates the resize from there. Graphics (hover/drag
 * guide lines) are separate, optional, floating overlays — not the thing
 * being dragged.
 *
 * Delegated on `#designerCanvasBody` (bound once — the canvas replaces its
 * entire innerHTML on every render, so nothing here needs a live reference
 * to any specific pane element to persist across renders).
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the object model (needs `app.designer.getDocument()`/`render()`).
 *
 * @module program/designer/tools/resize
 */

import { isResizable } from '../rules/element_capabilities.js';

const MIN_PERCENT = 10;
const MAX_PERCENT = 90;
const HIT_DISTANCE = 5; // px on each side of the seam -> ~10px total hit zone
const MIN_HEIGHT_PX = 40;
const HANDLE_OFFSET = 10;
const HANDLE_HIT_RADIUS = 8;
const HANDLE_SIZE = 16;

let hoverLineEl = null;
let dragLineEl = null;
let dragInfoEl = null;
let childHandleCircleEl = null; // px-mode trailing edge only — see ensureCircle/showTrailingHandles
let rootHandleCircleEl = null;
let isDragging = false;

const CURSOR_VERTICAL = 'row-resize';

function ensureLine(variant) {
    const el = document.createElement('div');
    el.className = `db-splitter-${variant}-line`;
    document.body.appendChild(el);
    return el;
}

function ensureDragInfo() {
    const el = document.createElement('div');
    el.className = 'db-splitter-draginfo';
    el.innerHTML =
        '<div class="db-splitter-draginfo-names"><span class="a"></span><span class="db-splitter-draginfo-sep"></span><span class="b"></span></div>' +
        '<div class="db-splitter-draginfo-sizes"></div>';
    document.body.appendChild(el);
    return el;
}

function updateDragInfo(el, ev, nameA, nameB, pxA, pxB, percentA, percentB) {
    el.style.display = 'block';
    el.querySelector('.db-splitter-draginfo-names .a').textContent = nameA;
    const sepEl = el.querySelector('.db-splitter-draginfo-sep');
    const bEl = el.querySelector('.db-splitter-draginfo-names .b');
    if (nameB == null) {
        sepEl.style.display = 'none';
        bEl.style.display = 'none';
        el.querySelector('.db-splitter-draginfo-sizes').textContent = `${Math.round(pxA)} px`;
    } else {
        sepEl.style.display = '';
        bEl.style.display = '';
        bEl.textContent = nameB;
        el.querySelector('.db-splitter-draginfo-sizes').textContent = percentA == null
            ? `${Math.round(pxA)} px | ${Math.round(pxB)} px`
            : `${Math.round(pxA)} px (${Math.round(percentA)}%) | ${Math.round(pxB)} px (${Math.round(percentB)}%)`;
    }

    const OFFSET = 14;
    const rect = el.getBoundingClientRect();
    const bounds = getCanvasVisibleBounds();
    let left = ev.clientX + OFFSET;
    let top = ev.clientY + OFFSET;
    if (left + rect.width > Math.min(window.innerWidth, bounds.right)) left = ev.clientX - OFFSET - rect.width;
    if (top + rect.height > Math.min(window.innerHeight, bounds.bottom)) top = ev.clientY - OFFSET - rect.height;
    left = Math.max(bounds.left, Math.min(left, bounds.right - rect.width));
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - rect.height));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

/**
 * The designer canvas's own visible (scrolled) viewport — #designerCanvasContent,
 * not #designerCanvasBody (which can itself be far larger than what's
 * currently scrolled into view). Guide lines and the drag-info tooltip are
 * position:fixed on document.body, outside the canvas's own DOM subtree, so
 * nothing about the canvas's own overflow:hidden ever constrains them —
 * every one of their on-screen positions/extents needs to be clamped to
 * this rect explicitly instead.
 */
function getCanvasVisibleBounds() {
    const el = document.getElementById('designerCanvasContent');
    return el ? el.getBoundingClientRect() : { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
}

function positionLine(el, isColumns, boundary, crossMin, crossMax) {
    const bounds = getCanvasVisibleBounds();
    if (isColumns) {
        el.style.left = Math.max(bounds.left, Math.min(boundary, bounds.right)) + 'px';
        el.style.top = Math.max(crossMin, bounds.top) + 'px';
        el.style.height = (Math.min(crossMax, bounds.bottom) - Math.max(crossMin, bounds.top)) + 'px';
        el.style.width = ''; // thickness stays CSS-controlled
    } else {
        el.style.top = Math.max(bounds.top, Math.min(boundary, bounds.bottom)) + 'px';
        el.style.left = Math.max(crossMin, bounds.left) + 'px';
        el.style.width = (Math.min(crossMax, bounds.right) - Math.max(crossMin, bounds.left)) + 'px';
        el.style.height = ''; // thickness stays CSS-controlled
    }
}

function showLine(el, isColumns, boundary, crossMin, crossMax) {
    el.style.display = 'block';
    positionLine(el, isColumns, boundary, crossMin, crossMax);
}

function hideLine(el) {
    if (el) el.style.display = 'none';
}

/**
 * The px-mode trailing edge's child/root disambiguation used to be shown as
 * a second guide line offset from the pane's own border — reported live as
 * reading like a duplicate/unclear border rather than two distinct handles.
 * Replaced with two small circle handles instead: the border stays exactly
 * as rendered elsewhere (untouched), and a circle is added above it (child)
 * and one below it (root), each independently positioned and tagged via
 * dataset.resizeTarget so their meaning is visually unambiguous.
 */
function ensureCircle(target) {
    const el = document.createElement('div');
    el.className = 'db-splitter-handle-circle';
    el.dataset.resizeTarget = target; // "child" | "root"
    document.body.appendChild(el);
    return el;
}

function showCircle(el, x, y, active) {
    el.style.display = 'block';
    el.classList.toggle('db-splitter-handle-circle-active', !!active);
    const bounds = getCanvasVisibleBounds();
    el.style.left = Math.max(bounds.left, Math.min(x, bounds.right)) + 'px';
    el.style.top = Math.max(bounds.top, Math.min(y, bounds.bottom)) + 'px';
}

function hideCircle(el) {
    if (el) el.style.display = 'none';
}

function hideTrailingHandles() {
    hideCircle(childHandleCircleEl);
    hideCircle(rootHandleCircleEl);
}

/**
 * Both handles' own Y — child above the last pane's own bottom edge, root
 * below the splitter's own bottom edge. Same Y math as findBoundaryAt's own
 * hit zones, kept in sync so the circle always sits exactly on the point
 * that's actually draggable. X follows the cursor's own horizontal position
 * (clamped to the relevant element's own width) rather than staying fixed
 * at the center — the circle should appear right under the mouse as it
 * moves left/right within the border, not sit at a static point the user
 * then has to move the mouse to reach.
 */
function computeTrailingHandlePositions(splitterEl, lastPaneEl, mouseX) {
    const splitterRect = splitterEl.getBoundingClientRect();
    const lastRect = lastPaneEl.getBoundingClientRect();
    const clamp = (x, min, max) => Math.max(min, Math.min(x, max));
    return {
        child: { x: clamp(mouseX, lastRect.left, lastRect.right), y: lastRect.bottom - HANDLE_OFFSET },
        root: { x: clamp(mouseX, splitterRect.left, splitterRect.right), y: splitterRect.bottom + HANDLE_OFFSET }
    };
}

/**
 * Finds the splitter boundary (if any) within HIT_DISTANCE of the given
 * viewport point. Checks every splitter currently in the canvas, smallest
 * (most deeply nested) first, so a nested splitter's own seam always wins
 * over an ancestor splitter's when their areas overlap.
 */
function findBoundaryAt(clientX, clientY) {
    const splitters = Array.from(document.querySelectorAll('#designerCanvasBody .db-splitter'))
        .map(el => ({ el, rect: el.getBoundingClientRect() }))
        .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));

    for (const { el: splitterEl, rect: splitterRect } of splitters) {
        if (clientX < splitterRect.left - HIT_DISTANCE || clientX > splitterRect.right + HIT_DISTANCE ||
            clientY < splitterRect.top - HIT_DISTANCE || clientY > splitterRect.bottom + HANDLE_OFFSET + HANDLE_HIT_RADIUS) continue;

        const isColumns = splitterEl.classList.contains('column');
        const isPxRows = !isColumns && getComputedStyle(splitterEl).display !== 'flex';
        const panes = Array.from(splitterEl.children).filter(c => c.classList.contains('db-splitter-pane'));

        for (let i = 0; i < panes.length - 1; i++) {
            const rectA = panes[i].getBoundingClientRect();
            const rectB = panes[i + 1].getBoundingClientRect();
            const boundary = isColumns ? (rectA.right + rectB.left) / 2 : (rectA.bottom + rectB.top) / 2;
            const pos = isColumns ? clientX : clientY;
            const cross = isColumns ? clientY : clientX;
            const crossMin = isColumns ? Math.min(rectA.top, rectB.top) : Math.min(rectA.left, rectB.left);
            const crossMax = isColumns ? Math.max(rectA.bottom, rectB.bottom) : Math.max(rectA.right, rectB.right);

            if (Math.abs(pos - boundary) <= HIT_DISTANCE && cross >= crossMin && cross <= crossMax) {
                return { splitterEl, paneElA: panes[i], paneElB: panes[i + 1], isColumns, isPxRows, isTrailingEdge: false, boundary, crossMin, crossMax };
            }
        }

        if (isPxRows && panes.length > 0) {
            const lastPane = panes[panes.length - 1];
            const lastRect = lastPane.getBoundingClientRect();
            const childHandleY = lastRect.bottom - HANDLE_OFFSET;
            const rootHandleY = splitterRect.bottom + HANDLE_OFFSET;

            if (Math.abs(clientY - childHandleY) <= HANDLE_HIT_RADIUS && clientX >= lastRect.left && clientX <= lastRect.right) {
                return { splitterEl, paneElA: lastPane, paneElB: null, isColumns: false, isPxRows: true, isTrailingEdge: false, boundary: childHandleY, crossMin: lastRect.left, crossMax: lastRect.right };
            }
            if (Math.abs(clientY - rootHandleY) <= HANDLE_HIT_RADIUS && clientX >= splitterRect.left && clientX <= splitterRect.right) {
                return { splitterEl, paneElA: lastPane, paneElB: null, isColumns: false, isPxRows: true, isTrailingEdge: true, boundary: rootHandleY, crossMin: splitterRect.left, crossMax: splitterRect.right };
            }
        }
    }
    return null;
}

/**
 * Finds a plain (non-splitter) node's own bottom edge within HIT_DISTANCE
 * of the given point — the generalized "Node utan barn" case from the
 * Selection Tool resize UX spec: a node that was never split at all
 * previously had NO resize handle of any kind; dragging its own bottom
 * edge now sets its own layout.height directly, the same ↑ "child resize"
 * semantics as an internal splitter boundary. Splitter panes are excluded
 * (already handled, with their own richer child/root disambiguation, by
 * findBoundaryAt above) so the two systems never fight over one element.
 */
function findPlainNodeEdgeAt(clientX, clientY) {
    const dbNodeDepth = (el) => {
        let depth = 0;
        for (let cur = el.parentElement; cur; cur = cur.parentElement) {
            if (cur.classList.contains('db-node')) depth++;
        }
        return depth;
    };

    const nodes = Array.from(document.querySelectorAll('#designerCanvasBody .db-node'))
        .filter(el => !el.classList.contains('db-splitter') && !el.parentElement?.classList.contains('db-splitter-pane'))
        .map(el => ({ el, rect: el.getBoundingClientRect(), depth: dbNodeDepth(el) }))
        .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height) || (b.depth - a.depth));

    for (const { el, rect } of nodes) {
        if (Math.abs(clientY - rect.bottom) <= HIT_DISTANCE && clientX >= rect.left && clientX <= rect.right) {
            return { el, boundary: rect.bottom, crossMin: rect.left, crossMax: rect.right };
        }
    }
    return null;
}

function plainNodeIsResizable(hit) {
    if (!hit) return false;
    const doc = app.designer.getDocument();
    const node = doc?.find(hit.el.dataset.nodeId);
    return !!node;
}

function getNodesForHit(hit) {
    const panes = Array.from(hit.splitterEl.children).filter(c => c.classList.contains('db-splitter-pane'));
    const paneIndex = panes.indexOf(hit.paneElA);

    const doc = app.designer.getDocument();
    const splitterNode = doc?.find(hit.splitterEl.dataset.nodeId);
    return { nodeA: splitterNode?.children[paneIndex], nodeB: hit.paneElB ? splitterNode?.children[paneIndex + 1] : null };
}

/** The splitter node itself — distinct from getNodesForHit's pane nodes, needed for the root sub-zone's own independent layout.height. */
function getSplitterNodeForHit(hit) {
    const doc = app.designer.getDocument();
    return doc?.find(hit.splitterEl.dataset.nodeId);
}

/** A boundary is only draggable when its resizable pane(s) allow it — one pane for the trailing edge (either sub-zone), both for an internal boundary. */
function boundaryIsResizable(hit) {
    const { nodeA, nodeB } = getNodesForHit(hit);
    if (!hit.paneElB) return !!nodeA && isResizable(nodeA);
    return !!nodeA && !!nodeB && isResizable(nodeA) && isResizable(nodeB);
}

function bindPointerHandling() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    let hoverInfoTimer = null;
    let hoverInfoPaneA = null; // which boundary the auto-hide timer belongs to
    let hoverOutlinedA = null; // panes currently wearing the hover outline,
    let hoverOutlinedB = null; // so it can be removed when hover moves on

    function hideHoverInfo() {
        if (hoverInfoTimer) { clearTimeout(hoverInfoTimer); hoverInfoTimer = null; }
        hoverInfoPaneA = null;
        if (dragInfoEl) dragInfoEl.style.display = 'none';
    }

    function clearHoverOutline() {
        if (hoverOutlinedA) hoverOutlinedA.classList.remove('db-splitter-pane-dragging');
        if (hoverOutlinedB) hoverOutlinedB.classList.remove('db-splitter-pane-dragging');
        hoverOutlinedA = null;
        hoverOutlinedB = null;
    }

    canvasBody.addEventListener('mousemove', (e) => {
        if (isDragging) return;
        const splitToolActive = !!app.designer.splitTool?.isActive?.();
        const hit = !splitToolActive && findBoundaryAt(e.clientX, e.clientY);
        if (hit && boundaryIsResizable(hit)) {
            document.body.style.cursor = hit.isColumns ? 'col-resize' : CURSOR_VERTICAL;
            app.cursor?.invalidate?.();
            if (hit.isPxRows && !hit.paneElB) {
                hideLine(hoverLineEl);
                if (!childHandleCircleEl) childHandleCircleEl = ensureCircle('child');
                if (!rootHandleCircleEl) rootHandleCircleEl = ensureCircle('root');
                const pos = computeTrailingHandlePositions(hit.splitterEl, hit.paneElA, e.clientX);
                showCircle(childHandleCircleEl, pos.child.x, pos.child.y, !hit.isTrailingEdge);
                showCircle(rootHandleCircleEl, pos.root.x, pos.root.y, hit.isTrailingEdge);
            } else {
                hideTrailingHandles();
                if (!hoverLineEl) hoverLineEl = ensureLine('hover');
                showLine(hoverLineEl, hit.isColumns, hit.boundary, hit.crossMin, hit.crossMax);
            }

            const outlineTargetA = hit.isTrailingEdge ? hit.splitterEl : hit.paneElA;
            if (hoverOutlinedA !== outlineTargetA) {
                clearHoverOutline();
                hoverOutlinedA = outlineTargetA;
                hoverOutlinedB = hit.isTrailingEdge ? null : hit.paneElB;
                hoverOutlinedA.classList.add('db-splitter-pane-dragging');
                if (hoverOutlinedB) hoverOutlinedB.classList.add('db-splitter-pane-dragging');
            }

            if (!dragInfoEl) dragInfoEl = ensureDragInfo();
            const { nodeA, nodeB } = getNodesForHit(hit);
            if (nodeA) {
                if (hit.isTrailingEdge) {
                    const pxRoot = hit.splitterEl.getBoundingClientRect().height;
                    updateDragInfo(dragInfoEl, e, _('Root height'), null, pxRoot, null, null, null);
                } else if (nodeB) {
                    const pxA = hit.isColumns ? hit.paneElA.getBoundingClientRect().width : hit.paneElA.getBoundingClientRect().height;
                    const pxB = hit.isColumns ? hit.paneElB.getBoundingClientRect().width : hit.paneElB.getBoundingClientRect().height;
                    const percentA = parseFloat(nodeA.props.flexBasis) || 0;
                    const percentB = parseFloat(nodeB.props.flexBasis) || 0;
                    updateDragInfo(dragInfoEl, e, nodeA.name, nodeB.name, pxA, pxB, percentA, percentB);
                } else {
                    const pxA = hit.paneElA.getBoundingClientRect().height;
                    updateDragInfo(dragInfoEl, e, nodeA.name, null, pxA, null, null, null);
                }

                if (hoverInfoPaneA !== hit.paneElA) {
                    hoverInfoPaneA = hit.paneElA;
                    if (hoverInfoTimer) clearTimeout(hoverInfoTimer);
                    hoverInfoTimer = setTimeout(hideHoverInfo, 5000);
                }
            }
            return;
        }

        const plainHit = !splitToolActive && findPlainNodeEdgeAt(e.clientX, e.clientY);
        if (plainHit && plainNodeIsResizable(plainHit)) {
            hideTrailingHandles();
            document.body.style.cursor = CURSOR_VERTICAL;
            app.cursor?.invalidate?.(); // see the hover handler's own comment above
            if (!hoverLineEl) hoverLineEl = ensureLine('hover');
            showLine(hoverLineEl, false, plainHit.boundary, plainHit.crossMin, plainHit.crossMax);

            if (hoverOutlinedA !== plainHit.el) {
                clearHoverOutline();
                hoverOutlinedA = plainHit.el;
                hoverOutlinedA.classList.add('db-splitter-pane-dragging');
            }

            if (!dragInfoEl) dragInfoEl = ensureDragInfo();
            const doc = app.designer.getDocument();
            const node = doc?.find(plainHit.el.dataset.nodeId);
            if (node) {
                const px = plainHit.el.getBoundingClientRect().height;
                updateDragInfo(dragInfoEl, e, node.name, null, px, null, null, null);
                if (hoverInfoPaneA !== plainHit.el) {
                    hoverInfoPaneA = plainHit.el;
                    if (hoverInfoTimer) clearTimeout(hoverInfoTimer);
                    hoverInfoTimer = setTimeout(hideHoverInfo, 5000);
                }
            }
        } else {
            document.body.style.cursor = '';
            app.cursor?.invalidate?.(); // see the hover handler's own comment above
            hideLine(hoverLineEl);
            hideTrailingHandles();
            hideHoverInfo();
            clearHoverOutline();
        }
    });

    canvasBody.addEventListener('mouseleave', () => {
        if (isDragging) return;
        document.body.style.cursor = '';
        app.cursor?.invalidate?.(); // see the hover handler's own comment above
        hideLine(hoverLineEl);
        hideTrailingHandles();
        hideHoverInfo();
        clearHoverOutline();
    });

    canvasBody.addEventListener('mousedown', (e) => {
        const hit = findBoundaryAt(e.clientX, e.clientY);
        if (hit && boundaryIsResizable(hit)) {
            e.preventDefault();
            e.stopPropagation();
            startDrag(hit, e);
            return;
        }
        const plainHit = findPlainNodeEdgeAt(e.clientX, e.clientY);
        if (plainHit && plainNodeIsResizable(plainHit)) {
            e.preventDefault();
            e.stopPropagation();
            startDragPlainNode(plainHit, e);
        }
    });

    /**
     * Drag mechanic for a plain (non-splitter) node's own bottom edge —
     * sets node.layout.height directly, the generalized "Node utan barn"
     * case. Same grow/clamp shape as startDragPx below (MIN_HEIGHT_PX
     * floor, no upper bound), just writing to layout.height instead of a
     * splitter pane's props.height, since a plain node has no pane wrapper
     * of its own to carry that.
     */
    function startDragPlainNode(hit, downEvent) {
        const { el } = hit;
        const doc = app.designer.getDocument();
        const node = doc?.find(el.dataset.nodeId);
        if (!node) return;

        if (hoverInfoTimer) { clearTimeout(hoverInfoTimer); hoverInfoTimer = null; }
        hoverInfoPaneA = null;
        hoverOutlinedA = null;
        hoverOutlinedB = null;

        isDragging = true;
        hideLine(hoverLineEl);
        document.body.style.cursor = CURSOR_VERTICAL;
        app.cursor?.invalidate?.(); // see the hover handler's own comment above
        if (!dragLineEl) dragLineEl = ensureLine('drag');
        if (!dragInfoEl) dragInfoEl = ensureDragInfo();
        el.classList.add('db-splitter-pane-dragging');

        const startRect = el.getBoundingClientRect();
        const startHeight = startRect.height;
        const startY = downEvent.clientY;
        const hadExplicitHeight = node.layout?.height != null;
        const beforeHeight = node.layout?.height ?? Math.round(startHeight);
        let pendingHeight = null;

        function onMove(ev) {
            let deltaY = ev.clientY - startY;
            deltaY = Math.max(MIN_HEIGHT_PX - startHeight, deltaY);
            const height = Math.round(startHeight + deltaY);

            el.style.height = height + 'px';
            pendingHeight = height;

            const newRect = el.getBoundingClientRect();
            showLine(dragLineEl, false, newRect.bottom, newRect.left, newRect.right);
            updateDragInfo(dragInfoEl, ev, node.name, null, height, null, null, null);
            app.designer.repositionTags?.();
            app.designer.boxmodelPanel?.previewLiveDimension?.(node.id, 'height', height);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            app.cursor?.invalidate?.(); // see the hover handler's own comment above
            hideLine(dragLineEl);
            if (dragInfoEl) dragInfoEl.style.display = 'none';
            el.classList.remove('db-splitter-pane-dragging');
            isDragging = false;

            if (pendingHeight == null) return;
            const afterHeight = pendingHeight;

            const setHeight = (h) => { node.layout = { ...node.layout, height: h }; };
            const clearHeight = () => { const { height, ...rest } = node.layout || {}; node.layout = rest; };
            const applyAfter = () => setHeight(afterHeight);
            const applyBefore = () => hadExplicitHeight ? setHeight(beforeHeight) : clearHeight();

            const session = app.designer.win?.history;
            if (session) {
                session.execute({
                    type:  'node.resize',
                    title: _('Resized') + ' ' + node.name + ' (' + afterHeight + 'px)',
                    do()   { applyAfter(); app.designer.render(); },
                    undo() { applyBefore(); app.designer.render(); },
                    redo() { applyAfter(); app.designer.render(); }
                });
            } else {
                applyAfter();
                app.designer.render();
            }
        }

        onMove(downEvent);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startDrag(hit, downEvent) {
        const { paneElA, paneElB, isColumns, isPxRows, isTrailingEdge } = hit;
        const { nodeA, nodeB } = getNodesForHit(hit);
        if (!nodeA || (paneElB && !nodeB)) return;

        if (hoverInfoTimer) { clearTimeout(hoverInfoTimer); hoverInfoTimer = null; }
        hoverInfoPaneA = null;
        hoverOutlinedA = null;
        hoverOutlinedB = null;

        isDragging = true;
        hideLine(hoverLineEl);
        hideTrailingHandles();
        document.body.style.cursor = isColumns ? 'col-resize' : CURSOR_VERTICAL;
        app.cursor?.invalidate?.(); // see the hover handler's own comment above
        if (!dragLineEl) dragLineEl = ensureLine('drag');
        if (!dragInfoEl) dragInfoEl = ensureDragInfo();

        if (isPxRows && isTrailingEdge) {
            hit.splitterEl.classList.add('db-splitter-pane-dragging');
            startDragRootHeight();
            return;
        }

        paneElA.classList.add('db-splitter-pane-dragging');
        if (paneElB) paneElB.classList.add('db-splitter-pane-dragging');

        if (isPxRows) { startDragPx(); return; }
        startDragPercent();

        // The root sub-zone's own independent height — deliberately NOT
        // touching paneElA/nodeA (the last pane) at all, per the Selection
        // Tool resize UX spec's own explicit requirement: root and child
        // heights are completely independent once root has an explicit
        // height of its own. A px-mode splitter's children are plain
        // display:block content — they never stretch to fill their
        // parent's own height (only width defaults to 100%), so simply
        // changing the splitter's OWN box height already leaves every
        // child's own height completely untouched for free; the only
        // extra piece needed is overflow:hidden (also set here, mid-drag —
        // blocks/splitter.js applies it permanently once layout.height is
        // Defined, but that only takes effect on the next render) so a
        // child that's currently taller than the new root height gets
        // visually clipped instead of bleeding out past the splitter's own
        // boundary during the live drag itself.
        function startDragRootHeight() {
            const splitterEl = hit.splitterEl;
            const splitterNode = getSplitterNodeForHit(hit);
            if (!splitterNode) { isDragging = false; return; }

            const startRect = splitterEl.getBoundingClientRect();
            const startHeight = startRect.height;
            const startY = downEvent.clientY;
            const hadExplicitHeight = splitterNode.layout?.height != null;
            const beforeHeight = splitterNode.layout?.height ?? Math.round(startHeight);
            let pendingHeight = null;

            splitterEl.style.overflow = 'hidden';

            function onMove(ev) {
                let deltaY = ev.clientY - startY;
                deltaY = Math.max(MIN_HEIGHT_PX - startHeight, deltaY);
                const height = Math.round(startHeight + deltaY);

                splitterEl.style.height = height + 'px';
                pendingHeight = height;

                const newRect = splitterEl.getBoundingClientRect();
                if (!rootHandleCircleEl) rootHandleCircleEl = ensureCircle('root');
                const circleX = Math.max(newRect.left, Math.min(ev.clientX, newRect.right));
                showCircle(rootHandleCircleEl, circleX, newRect.bottom + HANDLE_OFFSET, true);
                updateDragInfo(dragInfoEl, ev, _('Root height'), null, height, null, null, null);
                app.designer.repositionTags?.();
                app.designer.boxmodelPanel?.previewLiveDimension?.(splitterNode.id, 'height', height);
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                app.cursor?.invalidate?.(); // see the hover handler's own comment above
                hideLine(dragLineEl);
                hideTrailingHandles();
                if (dragInfoEl) dragInfoEl.style.display = 'none';
                splitterEl.classList.remove('db-splitter-pane-dragging');
                isDragging = false;

                if (pendingHeight == null) return;
                const afterHeight = pendingHeight;

                const setHeight = (h) => { splitterNode.layout = { ...splitterNode.layout, height: h }; };
                const clearHeight = () => { const { height, ...rest } = splitterNode.layout || {}; splitterNode.layout = rest; };
                const applyAfter = () => setHeight(afterHeight);
                const applyBefore = () => hadExplicitHeight ? setHeight(beforeHeight) : clearHeight();

                const session = app.designer.win?.history;
                if (session) {
                    session.execute({
                        type:  'node.resize',
                        title: _('Resized root height') + ' (' + afterHeight + 'px)',
                        do()   { applyAfter(); app.designer.render(); },
                        undo() { applyBefore(); app.designer.render(); },
                        redo() { applyAfter(); app.designer.render(); }
                    });
                } else {
                    applyAfter();
                    app.designer.render();
                }
            }

            onMove(downEvent);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        // A root-level rows splitter (px-height model, blocks/splitter.js)
        // is a plain block stack, not a fixed-height flex container — there
        // is no combined pool of space to trade between the two panes the
        // way the percent path below has to. Only the dragged pane's own
        // height changes (clamped to its own MIN_HEIGHT_PX floor); the
        // pane below keeps whatever height it already had (Def or Defined)
        // completely untouched and simply shifts down/up in normal block
        // flow — the browser does that for free, nothing to compute. The
        // splitter's own total height grows/shrinks with the drag as a
        // result, same as any other block-stacked content would.
        function startDragPx() {
            const startRectA = paneElA.getBoundingClientRect();
            const startHeightA = startRectA.height;
            const startY = downEvent.clientY;
            const beforeHeightA = nodeA.props.height ?? Math.round(startHeightA);
            let pendingHeightA = null;

            function onMove(ev) {
                let deltaY = ev.clientY - startY;
                deltaY = Math.max(MIN_HEIGHT_PX - startHeightA, deltaY);
                const heightA = Math.round(startHeightA + deltaY);

                paneElA.style.height = heightA + 'px';
                pendingHeightA = heightA;

                const newRectA = paneElA.getBoundingClientRect();
                if (paneElB) {
                    const rectB = paneElB.getBoundingClientRect();
                    showLine(dragLineEl, false, newRectA.bottom, Math.min(newRectA.left, rectB.left), Math.max(newRectA.right, rectB.right));
                    updateDragInfo(dragInfoEl, ev, nodeA.name, nodeB.name, heightA, rectB.height, null, null);
                } else {
                    if (!childHandleCircleEl) childHandleCircleEl = ensureCircle('child');
                    const circleX = Math.max(newRectA.left, Math.min(ev.clientX, newRectA.right));
                    showCircle(childHandleCircleEl, circleX, newRectA.bottom - HANDLE_OFFSET, true);
                    updateDragInfo(dragInfoEl, ev, nodeA.name, null, heightA, null, null, null);
                }
                app.designer.repositionTags?.();
                app.designer.boxmodelPanel?.previewLiveDimension?.(nodeA.id, 'height', heightA);
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                app.cursor?.invalidate?.(); // see the hover handler's own comment above
                hideLine(dragLineEl);
                hideTrailingHandles();
                if (dragInfoEl) dragInfoEl.style.display = 'none';
                paneElA.classList.remove('db-splitter-pane-dragging');
                if (paneElB) paneElB.classList.remove('db-splitter-pane-dragging');
                isDragging = false;

                if (pendingHeightA == null) return;
                const afterHeightA = pendingHeightA;

                const applyHeight = (h) => { nodeA.props.height = h; };

                const session = app.designer.win?.history;
                if (session) {
                    session.execute({
                        type:  'node.resize',
                        title: _('Resized split') + ' (' + afterHeightA + 'px)',
                        do()   { applyHeight(afterHeightA); app.designer.render(); },
                        undo() { applyHeight(beforeHeightA); app.designer.render(); },
                        redo() { applyHeight(afterHeightA); app.designer.render(); }
                    });
                } else {
                    applyHeight(afterHeightA);
                    app.designer.render();
                }
            }

            onMove(downEvent);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        // Column splits, and rows splits nested inside another splitter's
        // own pane (still the original percentage flexBasis model — see
        // blocks/splitter.js's own header comment for why only root-level
        // rows switched to px).
        //
        // Dragging only redistributes space BETWEEN these two adjacent
        // panes — their COMBINED share of the *whole* splitter (which is
        // less than 100% once there's a 3rd+ pane) has to stay fixed while
        // dragging, or the pair would silently grow/shrink relative to
        // every OTHER pane too. Treating the mouse position as a raw 0-100%
        // split (as if A and B owned the entire splitter) pushed the total
        // across all panes past 100% the moment a 3rd pane existed — with
        // flex-grow/shrink both 0 (a fixed percentage, not "share what's
        // left"), that overflow didn't get absorbed anywhere; the untouched
        // last pane just rendered wider than the splitter itself.
        function startDragPercent() {
        const combinedShare = (parseFloat(nodeA.props.flexBasis) || 0) + (parseFloat(nodeB.props.flexBasis) || 0) || 100;
        const beforeFlexBasisA = nodeA.props.flexBasis;
        const beforeFlexBasisB = nodeB.props.flexBasis;
        let pendingPercentA = null;

        function onMove(ev) {
            const rectA = paneElA.getBoundingClientRect();
            const rectB = paneElB.getBoundingClientRect();
            const startEdge = isColumns ? rectA.left : rectA.top;
            const totalSize = isColumns ? (rectA.width + rectB.width) : (rectA.height + rectB.height);
            if (totalSize <= 0) return;

            const pos = isColumns ? ev.clientX : ev.clientY;
            let fraction = (pos - startEdge) / totalSize;
            fraction = Math.max(MIN_PERCENT / 100, Math.min(MAX_PERCENT / 100, fraction));
            const percentA = fraction * combinedShare;
            const percentB = combinedShare - percentA;

            paneElA.style.flex = `0 1 ${percentA.toFixed(2)}%`;
            paneElB.style.flex = `0 1 ${percentB.toFixed(2)}%`;
            pendingPercentA = percentA;

            const newRectA = paneElA.getBoundingClientRect();
            const newRectB = paneElB.getBoundingClientRect();
            const newBoundary = isColumns ? newRectA.right : newRectA.bottom;
            const newCrossMin = isColumns ? Math.min(newRectA.top, newRectB.top) : Math.min(newRectA.left, newRectB.left);
            const newCrossMax = isColumns ? Math.max(newRectA.bottom, newRectB.bottom) : Math.max(newRectA.right, newRectB.right);
            showLine(dragLineEl, isColumns, newBoundary, newCrossMin, newCrossMax);

            const pxA = isColumns ? newRectA.width : newRectA.height;
            const pxB = isColumns ? newRectB.width : newRectB.height;
            updateDragInfo(dragInfoEl, ev, nodeA.name, nodeB.name, pxA, pxB, percentA, percentB);
            app.designer.repositionTags?.();
            const dim = isColumns ? 'width' : 'height';
            app.designer.boxmodelPanel?.previewLiveDimension?.(nodeA.id, dim, pxA);
            app.designer.boxmodelPanel?.previewLiveDimension?.(nodeB.id, dim, pxB);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            app.cursor?.invalidate?.(); // see the hover handler's own comment above
            hideLine(dragLineEl);
            if (dragInfoEl) dragInfoEl.style.display = 'none';
            paneElA.classList.remove('db-splitter-pane-dragging');
            paneElB.classList.remove('db-splitter-pane-dragging');
            isDragging = false;

            if (pendingPercentA == null) return;
            const percentB = combinedShare - pendingPercentA;
            const afterFlexBasisA = pendingPercentA.toFixed(2) + '%';
            const afterFlexBasisB = percentB.toFixed(2) + '%';

            const applyBasis = (a, b) => { nodeA.props.flexBasis = a; nodeB.props.flexBasis = b; };

            const session = app.designer.win?.history;
            if (session) {
                session.execute({
                    type:  'node.resize',
                    title: _('Resized split') + ' (' + Math.round(pendingPercentA) + '%/' + Math.round(percentB) + '%)',
                    do()   { applyBasis(afterFlexBasisA, afterFlexBasisB); app.designer.render(); },
                    undo() { applyBasis(beforeFlexBasisA, beforeFlexBasisB); app.designer.render(); },
                    redo() { applyBasis(afterFlexBasisA, afterFlexBasisB); app.designer.render(); }
                });
            } else {
                applyBasis(afterFlexBasisA, afterFlexBasisB);
                app.designer.render();
            }
        }

        onMove(downEvent);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        }
    }
}

function injectCSS() {
    if (document.getElementById('designer-resize-tool-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-resize-tool-style';
    style.textContent = `
        .db-splitter-hover-line, .db-splitter-drag-line {
            position: fixed;
            display: none;
            pointer-events: none;
            z-index: 9500;
            width: 2px;
            height: 2px;
            background: #4da3ff;
        }
        .db-splitter-pane-dragging { outline: 2px solid #4da3ff; outline-offset: -2px; }
        .db-splitter-handle-circle {
            position: fixed;
            display: none;
            pointer-events: none;
            z-index: 9550;
            box-sizing: border-box;
            width: ${HANDLE_SIZE}px;
            height: ${HANDLE_SIZE}px;
            margin-left: -${HANDLE_SIZE / 2}px;
            margin-top: -${HANDLE_SIZE / 2}px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #4da3ff;
        }
        .db-splitter-handle-circle-active { background: #4da3ff; }
        .db-splitter-draginfo {
            position: fixed;
            display: none;
            pointer-events: none;
            z-index: 9600;
            background: #24272b;
            color: #fff;
            font-size: 11px;
            line-height: 1.4;
            border-radius: 4px;
            padding: 6px 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            white-space: nowrap;
            text-align: center;
        }
        .db-splitter-draginfo-names {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: #4da3ff;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            padding-bottom: 3px;
            margin-bottom: 3px;
        }
        .db-splitter-draginfo-sep { width: 1px; align-self: stretch; background: rgba(255,255,255,0.2); }
        .db-splitter-draginfo-sizes { opacity: 0.85; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();
    bindPointerHandling();

    app.designer = app.designer || {};
    app.designer.resizeTool = {
        /** @returns {boolean} Whether a splitter-pane drag is in progress right now. */
        isDragging: () => isDragging
    };
}
