/**
 * @file designer/designer_objectmodel.js
 * @description Object-model orchestrator — the single lazy-loaded entry
 * point (loaded via `app.includeModule` from `designer.js`'s `start()`, same
 * pattern as every other designer_*.js file) for the whole
 * Document/Node/registry/parser/renderer/blocks system. Internally uses real
 * ES `import`/`export` between `core/`, `canvas/`, and `blocks/` — those are
 * genuine code dependencies, not runtime feature wiring, so they don't go
 * through `app.includeModule` or the `app.designer.*` namespace themselves.
 *
 * Exposes on `app.designer`:
 *  - parser.load(json) / parser.serialize(doc)
 *  - registry.registerBlock(type, def) / registry.getBlock(type)
 *  - newDocument(tabId) / getDocument(tabId?) — per-tab Document, one canvas
 *    render per tab (see the 'designer-tab-*' event wiring below)
 *  - render() — re-render the active tab's Document into #designerCanvasBody
 *  - save() / open() — Explorer file dialogs (app.explorer.windows.save.file
 *    / .select.file, the same API Notepad's Save As/Open use), JSON on disk
 *
 * Each tab (from designer_tabs.js) gets its own Document — switching tabs
 * swaps what the canvas shows. designer_tabs.js has no idea this system
 * exists; it just fires 'designer-tab-added'/'-activated'/'-closed' jQuery
 * events on `document`, which this file listens for.
 *
 * @module program/designer/designer_objectmodel
 */

import { Document, Node } from './core/document.js';
import { registerBlock, getBlock, hasBlock, registeredTypes } from './core/registry.js';
import { load as parserLoad, serialize as parserSerialize } from './core/parser.js';
import { render as renderDocument } from './canvas/renderer.js';

// Side-effect imports — each block self-registers into the registry.
import './blocks/container.js';
import './blocks/text.js';
import './blocks/image.js';
import './blocks/button.js';
import './blocks/form.js';
import './blocks/splitter.js';
import './blocks/layout.js';
import './blocks/custom.js';

function emptyDocument() {
    return new Document(new Node({ type: 'container', name: 'Canvas', layout: { mode: 'flow' } }));
}

/**
 * Whether `nodeId` sits somewhere that already hands its pane a definite,
 * non-floor height for free — i.e. whether a rows splitter placed at
 * `nodeId` can safely use the percentage flexBasis model instead of
 * needing its own px-height block model.
 *
 * Being inside a `display:flex` pane (a columns splitter, or a percent-mode
 * rows splitter) is necessary but NOT sufficient: `align-items:stretch`
 * (the flex default) only stretches a pane to a *definite* cross-size —
 * if that flex chain's own height is itself just auto/content-driven all
 * the way up (nobody in the ancestor chain ever set a real pixel height),
 * every pane's height collapses to its own natural content minimum
 * (min-height:40px for an empty pane) with zero slack, and a nested
 * percentage split has nothing real to redistribute — flexBasis still
 * updates correctly in the data, but the rendered pixels never move.
 * So this walks the *entire* ancestor chain (not just the nearest
 * splitter) looking for an actual height anchor — any ancestor with an
 * explicit `layout.height` or `props.height` — stopping early (false) the
 * moment a px-height rows splitter is crossed, since that's `display:block`
 * and breaks the flex chain regardless of what's further up.
 */
function isInFlexHeightContext(doc, nodeId) {
    let parent = doc.root.findParentOf(nodeId);
    while (parent) {
        if (parent.type === 'splitter' && parent.props?.direction === 'rows') {
            const parentIsPxMode = !parent.children.some(c => c.props?.flexBasis != null);
            if (parentIsPxMode) return false;
        }
        if (parent.layout?.height != null || parent.props?.height != null) return true;
        parent = doc.root.findParentOf(parent.id);
    }
    return false;
}

function injectCSS() {
    if (document.getElementById('designer-objectmodel-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-objectmodel-style';
    style.textContent = `
        .db-node { box-sizing: border-box; }
        .db-splitter-pane > .db-node { width: 100%; flex: 1; min-height: 0; box-sizing: border-box; }
        .db-splitter-pane > .db-node.db-splitter { min-height: auto; }
        .db-splitter.px-mode > .db-splitter-pane > .db-node { flex: none; height: var(--db-pane-h, auto); }
        .db-splitter.row.db-split-row-hover > .db-splitter-pane > .db-node { border: 1px solid rgba(77,163,255,0.6); }
        .db-node.db-selected { outline: 2px solid #4da3ff; outline-offset: -2px; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();

    app.designer = app.designer || {};
    app.designer.parser = { load: parserLoad, serialize: parserSerialize };
    app.designer.registry = { registerBlock, getBlock, hasBlock, registeredTypes };

    const documents = new Map(); // tabId -> Document
    let activeTabId = null;

    const canvasRenderHooks = [];
    app.designer._registerRenderHook = function (fn) { canvasRenderHooks.push(fn); };

    function renderActive() {
        const canvasBody = document.getElementById('designerCanvasBody');
        const doc = documents.get(activeTabId);
        if (!doc || !canvasBody) return;
        renderDocument(doc, canvasBody);
        canvasRenderHooks.forEach(fn => {
            try { fn(canvasBody); } catch (error) { console.error('Error running canvas render hook:', error); }
        });
    }

    app.designer.newDocument = function (tabId) {
        const doc = emptyDocument();
        documents.set(tabId, doc);
        return doc;
    };

    app.designer.getDocument = function (tabId) {
        return documents.get(tabId ?? activeTabId) || null;
    };

    /** Replaces the given (or active) tab's Document and re-renders if it's the active one. */
    app.designer.setDocument = function (doc, tabId) {
        const id = tabId ?? activeTabId;
        documents.set(id, doc);
        if (id === activeTabId) renderActive();
    };

    app.designer.getActiveTabId = () => activeTabId;
    app.designer.render = renderActive;

    app.designer.activeTool = 'select';
    app.designer.setActiveTool = function (toolId) {
        const previousTool = app.designer.activeTool;
        app.designer.activeTool = toolId;
        const canvasBody = document.getElementById('designerCanvasBody');
        if (canvasBody) {
            canvasBody.style.cursor = '';
            canvasBody.classList.remove('designer-split-mode', 'designer-text-mode');
        }
        app.designer.menu?.setActiveTool?.(toolId);

        document.body.classList.toggle('db-tool-select', toolId === 'select');

        if (previousTool !== toolId) $(document).trigger('designer-tool-changed', [toolId, previousTool]);
    };

    /**
     * Converts an existing node into a ROWS splitter *in place* — same id,
     * same position within its own parent (or Document.root, if it has
     * none) — rather than wrapping it from the outside in a new anonymous
     * splitter node. The node's own current identity (type/props/children)
     * becomes a new first pane; a second, empty pane is added alongside it.
     *
     * This is what makes "splitting a node" never touch anything outside
     * that node: the parent's own children array is never read or written,
     * so it doesn't matter whether the target is the document root, a
     * plain node, or already one pane of an existing split — the result is
     * structurally identical either way, and the id the user was pointing
     * at now simply *is* the splitter.
     *
     * Deliberately a full, standalone copy of convertToColumnSplitter below
     * rather than a shared function taking a `direction` param — a rows-only
     * fix here must never be able to regress columns (or vice versa).
     *
     * @param {string} nodeId
     * @param {number} percent - 0-100 share the *first* (moved-content) pane keeps.
     * @returns {boolean} Whether the conversion happened (false if the node
     *   doesn't exist or is already a splitter).
     */
    app.designer.convertToRowSplitter = function (nodeId, percent) {
        const doc = app.designer.getDocument();
        const node = doc?.find(nodeId);
        if (!node || node.type === 'splitter') return false;

        const isNested = isInFlexHeightContext(doc, nodeId);
        const preSplitHeight = node.layout?.height ?? node.props?.height;

        const { height: _unused, width: _unusedWidth, ...pane1Layout } = node.layout || {};
        const { height: _unusedProp, flexBasis: _unusedOuterBasis, ...pane1PropsBase } = node.props || {};

        let pane1, pane2;
        if (isNested) {
            pane1 = new Node({
                type: node.type,
                name: node.name,
                layout: pane1Layout,
                style: node.style,
                props: { ...pane1PropsBase, flexBasis: percent.toFixed(2) + '%' },
                children: node.children
            });
            pane2 = new Node({ type: 'container', props: { flexBasis: (100 - percent).toFixed(2) + '%' } });
        } else {
            const pane1Height = preSplitHeight != null ? Math.max(40, Math.round(preSplitHeight * percent / 100)) : null;
            const pane2Height = preSplitHeight != null ? Math.max(40, preSplitHeight - pane1Height) : null;

            pane1 = new Node({
                type: node.type,
                name: node.name,
                layout: pane1Layout,
                style: node.style,
                props: pane1Height != null ? { ...pane1PropsBase, height: pane1Height } : pane1PropsBase,
                children: node.children
            });
            pane2 = new Node({ type: 'container', props: pane2Height != null ? { height: pane2Height } : {} });
        }

        const outerFlexBasis = node.props?.flexBasis;

        node.type = 'splitter';
        node.name = 'splitter';
        node.props = outerFlexBasis ? { direction: 'rows', flexBasis: outerFlexBasis } : { direction: 'rows' };
        node.children = [pane1, pane2];
        if (isNested) {
            if (preSplitHeight != null) node.layout = { ...node.layout, height: preSplitHeight };
        } else {
            if (node.layout) delete node.layout.height;
        }

        return true;
    };

    /**
     * Converts an existing node into a COLUMNS splitter *in place*. Same
     * behavior and contract as convertToRowSplitter above — see that
     * function's own doc comment — but a standalone copy, not a shared
     * function, for the same reason.
     *
     * @param {string} nodeId
     * @param {number} percent - 0-100 share the *first* (moved-content) pane keeps.
     * @returns {boolean} Whether the conversion happened (false if the node
     *   doesn't exist or is already a splitter).
     */
    app.designer.convertToColumnSplitter = function (nodeId, percent) {
        const doc = app.designer.getDocument();
        const node = doc?.find(nodeId);
        if (!node || node.type === 'splitter') return false;

        const preConvertHeight = node.layout?.height ?? node.props?.height;

        const { height: _preSplitHeight, width: _preSplitWidth, ...pane1Layout } = node.layout || {};
        const { height: _unusedProp, flexBasis: _unusedOuterBasis, ...pane1PropsBase } = node.props || {};
        const pane1 = new Node({
            type: node.type,
            name: node.name,
            layout: pane1Layout,
            style: node.style,
            props: { ...pane1PropsBase, flexBasis: percent.toFixed(2) + '%' },
            children: node.children
        });
        const pane2 = new Node({ type: 'container', props: { flexBasis: (100 - percent).toFixed(2) + '%' } });

        const outerFlexBasis = node.props?.flexBasis;

        node.type = 'splitter';
        node.name = 'splitter';
        node.props = outerFlexBasis ? { direction: 'columns', flexBasis: outerFlexBasis } : { direction: 'columns' };
        node.children = [pane1, pane2];
        if (preConvertHeight != null) {
            node.layout = { ...node.layout, height: preConvertHeight };
        }
        return true;
    };

    /**
     * Applies a DROP ACTION to the active tab's Document and re-renders.
     * @param {Object} action
     * @param {'insert'} action.action - Only 'insert' is implemented so far
     *   (move/delete/copy are a later step).
     * @param {string} action.source - A registered block type, e.g. 'button'.
     * @param {string|null} [action.target] - Node id to insert relative to;
     *   omit/null to insert at the document root.
     * @param {'inside'|'before'|'after'} [action.position='inside']
     * @param {Object} [action.props] - Extra props merged over the block's
     *   own defaults (e.g. a text variant's `{tag:'h1'}` from the sidebar's
     *   draggable submenu items).
     * @returns {import('./core/document.js').Node|null} The inserted node.
     */
    app.designer.applyDropAction = function (action) {
        const doc = app.designer.getDocument();
        if (!doc || !action || action.action !== 'insert') return null;

        const block = getBlock(action.source);
        const nodeData = {
            type: action.source,
            ...(block?.defaults || {}),
            props: { ...(block?.defaults?.props || {}), ...(action.props || {}) }
        };
        const target = action.target || null;
        const position = action.position || 'inside';

        let inserted = null;
        let insertedId = null;
        const doInsert = (data) => {
            inserted = doc.insertNode(data, target, position);
            insertedId = inserted.id;
            renderActive();
            $(document).trigger('designer-node-inserted', [inserted.id]);
        };

        const session = app.designer.win?.history;
        if (session) {
            session.execute({
                type:  'node.create',
                title: _('Inserted') + ' ' + action.source,
                do()   { doInsert(nodeData); },
                undo() { if (insertedId) { doc.removeNode(insertedId); renderActive(); } },
                redo() { doInsert({ ...nodeData, id: insertedId }); }
            });
        } else {
            doInsert(nodeData);
        }
        return inserted;
    };

    $(document).on('designer-tab-added', (e, tabId) => {
        if (!documents.has(tabId)) app.designer.newDocument(tabId);
    });
    $(document).on('designer-tab-activated', (e, tabId) => {
        activeTabId = tabId;
        renderActive();
    });
    $(document).on('designer-tab-closed', (e, tabId) => {
        documents.delete(tabId);
    });

    document.querySelectorAll('#tabbsTitle .designer-tab').forEach(el => {
        const tabId = Number(el.dataset.tabId);
        if (!documents.has(tabId)) app.designer.newDocument(tabId);
        if (el.classList.contains('active')) activeTabId = tabId;
    });
    if (!activeTabId && documents.size) activeTabId = [...documents.keys()][0];
    renderActive();

    // ── Save / Open — Explorer file dialogs, same API Notepad uses ────────

    // Notepad passes its own window instance id as `parentId` so the file
    // dialog knows which window it belongs to/sits above (see
    // notepad_data.js's save/open) — Designer's own calls were missing this
    // entirely, which is what left the dialog without a "layer" relative to
    // the main window. Designer is multistart:false, so there's always at
    // most one `.pid-designer` window.
    function designerWindowId() {
        return document.querySelector('.window.pid-designer')?.id?.replace('-win', '') || null;
    }

    app.designer.save = async function () {
        const doc = app.designer.getDocument();
        if (!doc) return null;

        const path = await app.explorer.windows.save.file({
            types: ['json'],
            parentId: designerWindowId(),
            dialogTitle: _('Save Design')
        });
        if (!path) return null;

        const content = JSON.stringify(parserSerialize(doc), null, 2);
        app.explorer.newFile(path, content);
        app.api.post('/api/fs/write', { path, content });
        return path;
    };

    app.designer.open = async function () {
        const path = await app.explorer.windows.select.file({
            types: ['json'],
            parentId: designerWindowId(),
            dialogTitle: _('Open Design')
        });
        if (!path) return null;

        const node = app.explorer._getNode(path);
        if (!node) return null;

        let content = node.content;
        if (content == null && node.url) {
            content = await fetch(node.url).then(r => r.text());
        }

        const doc = parserLoad(JSON.parse(content));
        app.designer.setDocument(doc);
        return doc;
    };
}
