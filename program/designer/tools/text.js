/**
 * @file designer/tools/text.js
 * @description The Text Tool — creates or edits text content in place on
 * the canvas. One of five peer tools — see program/designer/NOTES.md's
 * "Tool separation" section: this tool's only document mutation is a
 * `text` node's own `props.value` (editing existing text), or inserting a
 * brand-new `text` node *inside* a non-text element (creating text where
 * there wasn't any) — it never touches `flexBasis`, never reparents an
 * existing node, and never converts a node into a splitter.
 *
 * Gated behind `app.designer.activeTool === 'text'` (a deliberate sidebar
 * switch, same as Split/Move) — editing text in place needs to be an
 * explicit mode so an ordinary click elsewhere (Select tool) doesn't
 * accidentally start rewriting a paragraph.
 *
 * Rule, on every click while active:
 *  - Clicked node is already a `type: 'text'` node → enter edit mode on it
 *    directly, placing the caret at the clicked point.
 *  - Clicked node is anything else (container, button, splitter pane, ...)
 *    → insert a new empty `text` node (tag `p`) *inside* it, then enter
 *    edit mode on that new node immediately.
 *
 * @module program/designer/tools/text
 */

const EXIT_KEYS_CTRL_ENTER = true; // Ctrl+Enter also exits edit mode, in addition to blur

let activeEditEl = null;
let activeEditNode = null;
let activeEditBefore = null; // node.props.value at the moment editing started

let currentMode = 'normal';

let pendingStyle = {};

let pendingTag = 'p';

/** Places the caret at the clicked (x, y) inside `el`, best-effort. */
function placeCaretAt(el, clientX, clientY) {
    let range = null;
    if (typeof document.caretRangeFromPoint === 'function') {
        range = document.caretRangeFromPoint(clientX, clientY);
    } else if (typeof document.caretPositionFromPoint === 'function') {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
        }
    }
    if (!range || !el.contains(range.startContainer)) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    range.collapse(true);
    sel.addRange(range);
}

function enterTextEdit(el, node, clickEvent) {
    if (activeEditEl && activeEditEl !== el) exitTextEdit();

    activeEditEl = el;
    activeEditNode = node;
    activeEditBefore = node.props.value ?? '';

    el.contentEditable = 'true';
    el.classList.add('db-text-editing');
    el.focus();

    if (clickEvent) placeCaretAt(el, clickEvent.clientX, clickEvent.clientY);

    app.designer.selection?.select(node.id, 'text-edit-start');

    el.addEventListener('blur', exitTextEdit, { once: true });
    el.addEventListener('keydown', onEditKeydown);
}

function onEditKeydown(e) {
    if (EXIT_KEYS_CTRL_ENTER && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        activeEditEl?.blur(); // triggers exitTextEdit via the blur listener
    }
}

function exitTextEdit() {
    if (!activeEditEl) return;
    const el = activeEditEl, node = activeEditNode, before = activeEditBefore;
    el.removeEventListener('keydown', onEditKeydown);
    el.contentEditable = 'false';
    el.classList.remove('db-text-editing');
    activeEditEl = null;
    activeEditNode = null;
    activeEditBefore = null;

    const after = el.textContent ?? '';
    if (after === before) return; // nothing actually changed — no history entry, no re-render

    const applyValue = (value) => {
        node.props.value = value;
        app.designer.render();
        app.designer.selection?.select(node.id, 'text-edit');
    };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({
            type:  'text.edit',
            title: _('Changed text'),
            do()   { applyValue(after); },
            undo() { applyValue(before); },
            redo() { applyValue(after); }
        });
    } else {
        applyValue(after);
    }
}

function bindPointerHandling() {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return;

    $(canvasBody).on('click', '.db-node', function (e) {
        if (app.designer.activeTool !== 'text') return;
        e.stopPropagation();

        const doc = app.designer.getDocument();
        const node = doc?.find(this.dataset.nodeId);
        if (!doc || !node) return;

        if (node.type === 'text') {
            enterTextEdit(this, node, e);
            return;
        }

        const textMode = currentMode;
        const tag = pendingTag;
        const initialStyle = { ...pendingStyle }; // captured now, same reasoning as textMode above
        let newNode = null;
        let insertedId = null;
        const doInsert = (data) => { newNode = doc.insertNode(data, node.id, 'inside'); insertedId = newNode.id; app.designer.render(); };

        const session = app.designer.win?.history;
        if (session) {
            session.execute({
                type:  'node.create',
                title: _('Inserted') + ' text',
                do()   { doInsert({ type: 'text', props: { tag, value: '', textMode }, style: { ...initialStyle } }); },
                undo() { if (insertedId) { doc.removeNode(insertedId); app.designer.render(); } },
                redo() { doInsert({ type: 'text', props: { tag, value: '', textMode }, style: { ...initialStyle }, id: insertedId }); }
            });
        } else {
            doInsert({ type: 'text', props: { tag, value: '', textMode }, style: { ...initialStyle } });
        }

        const newEl = document.querySelector(`#designerCanvasBody [data-node-id="${newNode.id}"]`);
        if (newEl) enterTextEdit(newEl, newNode, null);
    });
}

function injectCSS() {
    if (document.getElementById('designer-text-tool-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-text-tool-style';
    style.textContent = `
        .designer-text-mode .db-node:hover { outline: 2px dashed #4da3ff; outline-offset: -2px; cursor: text; }
        .db-text-editing { outline: 2px solid #4da3ff !important; outline-offset: -2px; cursor: text; }
    `;
    document.head.appendChild(style);
}

/**
 * Activates the Text Tool in the given mode. Always (re-)activates —
 * unlike the old setActive(), a second call never toggles back to Select;
 * picking a mode from the Text Tool's own submenu is the only way in, and
 * re-picking the same or a different mode while already in the Text Tool
 * just switches modes in place, the same idempotent-re-click behavior
 * every other submenu-driven tool (Rows/Columns, Container/Form variants)
 * already has.
 * @param {'normal'|'wave'|'vertical'} [mode]
 */
function activate(mode = 'normal') {
    const canvasBody = document.getElementById('designerCanvasBody');
    if (!canvasBody) return null;

    currentMode = mode;
    canvasBody.style.cursor = 'text';
    canvasBody.classList.add('designer-text-mode');

    const wasAlreadyText = app.designer.activeTool === 'text';
    app.designer.setActiveTool('text');
    if (wasAlreadyText) $(document).trigger('designer-tool-changed', ['text']);

    return 'text';
}

export function init(app) {
    injectCSS();
    bindPointerHandling();

    app.designer = app.designer || {};
    app.designer.textTool = {
        activate,
        isActive: () => app.designer.activeTool === 'text',
        get mode() { return currentMode; },
        getPendingStyle: () => pendingStyle,
        setPendingStyle(property, value) {
            if (value === undefined) delete pendingStyle[property]; else pendingStyle[property] = value;
        },
        getPendingTag: () => pendingTag,
        setPendingTag(tag) { pendingTag = tag || 'p'; }
    };

    $(document).on('designer-tool-changed', (e, toolId) => {
        if (toolId !== 'text' && activeEditEl) exitTextEdit();
    });
}
