/**
 * @file designer/canvas/droppable.js
 * @description Makes #designerCanvasBody (and every rendered .db-node inside
 * it) a jQuery UI Droppable target for `.designer-palette-item`-tagged drag
 * sources (designer_menu.js's own draggable submenu entries, e.g. Container/
 * Form's variants). On drop, builds a DROP ACTION exactly matching the spec
 * shape —
 * `{ action:'insert', source, target, position }` — and hands it to
 * `app.designer.applyDropAction()`; this file never touches the Document
 * tree itself, only computes *where* the drop landed.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, like
 * the other UI-wiring modules — unlike core/canvas/renderer.js it needs
 * `app` and DOM/jQuery UI, so it isn't statically imported into
 * designer_objectmodel.js.
 *
 * @module program/designer/canvas/droppable
 */

const CONTAINER_LIKE = new Set(['container', 'form', 'layout', 'custom', 'splitter']);

function nodeTypeOf(el) {
    const m = el.className.match(/\bdb-node\b.*?\bdb-([a-z]+)\b/);
    return m ? m[1] : null;
}

function computeDropAction(sourceType, dropTargetEl, extraProps) {
    const base = { action: 'insert', source: sourceType, props: extraProps || undefined };

    if (!dropTargetEl || dropTargetEl.id === 'designerCanvasBody') {
        return { ...base, target: null, position: 'inside' };
    }

    const targetId = dropTargetEl.dataset.nodeId;
    const type = nodeTypeOf(dropTargetEl);
    if (type && CONTAINER_LIKE.has(type)) {
        return { ...base, target: targetId, position: 'inside' };
    }
    return { ...base, target: targetId, position: 'after' };
}

let placeholderEl = null;

function hidePlaceholder() {
    placeholderEl?.remove();
    placeholderEl = null;
}

function showPlaceholder(targetEl, position) {
    if (!placeholderEl) {
        placeholderEl = document.createElement('div');
        document.body.appendChild(placeholderEl);
    }

    const viewport = document.getElementById('designerCanvasContent')?.getBoundingClientRect();
    const rect = targetEl.getBoundingClientRect();

    if (position === 'inside') {
        let left = rect.left, top = rect.top, right = rect.right, bottom = rect.bottom;
        if (viewport) {
            left   = Math.max(left, viewport.left);
            top    = Math.max(top, viewport.top);
            right  = Math.min(right, viewport.right);
            bottom = Math.min(bottom, viewport.bottom);
        }
        if (right <= left || bottom <= top) { hidePlaceholder(); return; }

        placeholderEl.className = 'db-drop-placeholder db-drop-placeholder-inside';
        placeholderEl.style.left   = left + 'px';
        placeholderEl.style.top    = top + 'px';
        placeholderEl.style.width  = (right - left) + 'px';
        placeholderEl.style.height = (bottom - top) + 'px';
    } else {
        let left = rect.left, right = rect.right;
        const y = rect.bottom;
        if (viewport) {
            left  = Math.max(left, viewport.left);
            right = Math.min(right, viewport.right);
            if (y < viewport.top || y > viewport.bottom || right <= left) { hidePlaceholder(); return; }
        }

        placeholderEl.className = 'db-drop-placeholder db-drop-placeholder-line';
        placeholderEl.style.left   = left + 'px';
        placeholderEl.style.top    = y + 'px';
        placeholderEl.style.width  = (right - left) + 'px';
        placeholderEl.style.height = '0';
    }
}

function bindDroppable(containerEl) {
    const targets = [containerEl, ...containerEl.querySelectorAll('.db-node')];

    targets.forEach(el => {
        const $el = $(el);
        if ($el.data('ui-droppable')) $el.droppable('destroy');

        $el.droppable({
            accept: '.designer-palette-item',
            greedy: true,
            tolerance: 'pointer',
            over: function () {
                const isRoot = el.id === 'designerCanvasBody';
                const type = nodeTypeOf(el);
                const position = (isRoot || (type && CONTAINER_LIKE.has(type))) ? 'inside' : 'after';
                showPlaceholder(el, position);
            },
            out: function () {
                hidePlaceholder();
            },
            drop: function (event, ui) {
                event.stopPropagation();
                hidePlaceholder();
                const sourceType = ui.draggable.data('block-type');
                if (!sourceType) return;
                const extraProps = ui.draggable.data('block-props');
                const action = computeDropAction(sourceType, el, extraProps);
                app.designer.applyDropAction(action);
            }
        });
    });
}

function injectCSS() {
    if (document.getElementById('designer-droppable-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-droppable-style';
    style.textContent = `
        .db-drop-placeholder { position: fixed; z-index: 99997; pointer-events: none; }
        .db-drop-placeholder-inside { outline: 2px dashed #4da3ff; outline-offset: -2px; background-color: rgba(77,163,255,0.15); border-radius: 2px; }
        .db-drop-placeholder-line { border-top: 2px solid #4da3ff; box-shadow: 0 0 4px rgba(77,163,255,0.8); }
        .designer-palette-item.ui-draggable-dragging {
            opacity: 0.95;
            z-index: 100000;
            background: linear-gradient(144deg, rgba(37,37,37,0.95) 0%, rgba(10,10,10,0.92) 100%);
            border-radius: 5px;
            box-shadow: 1px 1px 6px rgba(0,0,0,0.5);
        }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody || !app.designer) return;

    injectCSS();
    app.designer._registerRenderHook(bindDroppable);
    bindDroppable(canvasBody);
}
