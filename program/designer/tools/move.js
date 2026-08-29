/**
 * @file designer/tools/move.js
 * @description The Move Tool — drags a node out of its current parent and
 * drops it inside a different one, changing its position in the tree. One
 * of three peer tools — see program/designer/NOTES.md's "Tool separation"
 * section: this tool's only document mutation is `Document.removeNode` +
 * `Document.insertNode` of the *same* node instance (reparenting); it never
 * creates a new node, never changes any node's own `flexBasis` (that's
 * tools/resize.js), and never converts a node into a splitter (that's
 * tools/split.js).
 *
 * Unlike Resize, Move is gated behind `app.designer.activeTool === 'move'`
 * — picking up and reparenting a node is a much higher-consequence action
 * than adjusting a split ratio, so it needs a deliberate tool switch first
 * (the sidebar's "Move" icon) rather than being ambient.
 *
 * A node can only be picked up if `rules/element_capabilities.js` marks it
 * `movable`. A drop target is valid if it isn't the dragged node itself and
 * isn't one of the dragged node's own descendants (dropping a node inside
 * its own child would create a cycle).
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the object model (needs `app.designer.getDocument()`/`render()`).
 *
 * @module program/designer/tools/move
 */

import { isMovable } from '../rules/element_capabilities.js';

let infoEl = null;
let isDragging = false;

function ensureInfo() {
    const el = document.createElement('div');
    el.className = 'db-move-draginfo';
    document.body.appendChild(el);
    return el;
}

function updateInfo(ev, nodeName, targetName) {
    if (!infoEl) infoEl = ensureInfo();
    infoEl.style.display = 'block';
    infoEl.textContent = targetName ? `${nodeName} → ${targetName}` : `${nodeName}`;

    const OFFSET = 14;
    const rect = infoEl.getBoundingClientRect();
    let left = ev.clientX + OFFSET;
    let top = ev.clientY + OFFSET;
    if (left + rect.width > window.innerWidth) left = ev.clientX - OFFSET - rect.width;
    if (top + rect.height > window.innerHeight) top = ev.clientY - OFFSET - rect.height;
    infoEl.style.left = left + 'px';
    infoEl.style.top = top + 'px';
}

function hideInfo() {
    if (infoEl) infoEl.style.display = 'none';
}

/** True if `targetId` is `nodeId` itself, or inside `nodeId`'s own subtree. */
function wouldCreateCycle(doc, nodeId, targetId) {
    if (nodeId === targetId) return true;
    const node = doc.find(nodeId);
    return !!node?.find(targetId);
}

function bindPointerHandling() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    let draggedEl = null;
    let targetEl = null;

    function clearTargetHighlight() {
        targetEl?.classList.remove('db-move-drop-target');
        targetEl = null;
    }

    canvasBody.addEventListener('mousemove', (e) => {
        if (app.designer.activeTool !== 'move' || isDragging) return;
        const el = e.target.closest('.db-node');
        if (!el) { document.body.style.cursor = ''; return; }
        const doc = app.designer.getDocument();
        const node = doc?.find(el.dataset.nodeId);
        document.body.style.cursor = isMovable(node) ? 'grab' : 'not-allowed';
    });

    canvasBody.addEventListener('mousedown', (e) => {
        if (app.designer.activeTool !== 'move') return;
        const el = e.target.closest('.db-node');
        if (!el) return;

        const doc = app.designer.getDocument();
        const node = doc?.find(el.dataset.nodeId);
        if (!node || !isMovable(node)) return;

        e.preventDefault();
        e.stopPropagation();
        startDrag(doc, node, el, e);
    });

    function startDrag(doc, node, el, downEvent) {
        isDragging = true;
        draggedEl = el;
        draggedEl.classList.add('db-move-dragging-source');
        document.body.style.cursor = 'grabbing';
        updateInfo(downEvent, node.name);

        function onMove(ev) {
            const hoverEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.db-node');
            const hoverId = hoverEl?.dataset.nodeId;
            const valid = hoverEl && hoverEl !== draggedEl && !wouldCreateCycle(doc, node.id, hoverId);

            if (targetEl && targetEl !== hoverEl) clearTargetHighlight();
            if (valid) {
                targetEl = hoverEl;
                targetEl.classList.add('db-move-drop-target');
            }

            updateInfo(ev, node.name, valid ? (doc.find(hoverId)?.name || hoverId) : null);
        }

        function onUp(ev) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            draggedEl?.classList.remove('db-move-dragging-source');
            hideInfo();
            isDragging = false;

            const hoverEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.db-node');
            const targetId = hoverEl?.dataset.nodeId;
            clearTargetHighlight();

            if (!targetId || wouldCreateCycle(doc, node.id, targetId)) return;

            const oldParent = doc.root.findParentOf(node.id);
            if (!oldParent) return;
            const oldParentId = oldParent.id;
            const oldIndex = oldParent.children.findIndex(c => c.id === node.id);

            const doMove = () => {
                if (!doc.removeNode(node.id)) return;
                doc.insertNode(node, targetId, 'inside');
            };
            const undoMove = () => {
                doc.removeNode(node.id);
                const p = doc.find(oldParentId);
                if (!p) return;
                const sibling = p.children[oldIndex];
                sibling ? doc.insertNode(node, sibling.id, 'before') : doc.insertNode(node, oldParentId, 'inside');
            };
            const afterMove = () => {
                app.designer.render();
                app.designer.selection?.select(node.id, 'moved');
            };

            const session = app.designer.win?.history;
            if (session) {
                session.execute({
                    type:  'node.move',
                    title: _('Moved') + ' ' + node.type + ' → ' + (doc.find(targetId)?.name || targetId),
                    do()   { doMove(); afterMove(); },
                    undo() { undoMove(); afterMove(); },
                    redo() { doMove(); afterMove(); }
                });
            } else {
                doMove();
                afterMove();
            }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}

function injectCSS() {
    if (document.getElementById('designer-move-tool-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-move-tool-style';
    style.textContent = `
        .db-move-dragging-source { opacity: 0.4; }
        .db-move-drop-target { outline: 2px dashed #22c55e; outline-offset: -2px; }
        .db-move-draginfo {
            position: fixed;
            display: none;
            pointer-events: none;
            z-index: 9600;
            background: #24272b;
            color: #fff;
            font-size: 11px;
            line-height: 1.4;
            border-radius: 4px;
            padding: 5px 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

function setActive() {
    if (app.designer.activeTool === 'move') {
        app.designer.setActiveTool('select');
        return null;
    }
    app.designer.setActiveTool('move');
    return 'move';
}

export function init(app) {
    injectCSS();
    bindPointerHandling();

    app.designer = app.designer || {};
    app.designer.moveTool = {
        activate: setActive,
        isActive: () => app.designer.activeTool === 'move',
        isDragging: () => isDragging
    };
}
