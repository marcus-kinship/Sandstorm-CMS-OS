/**
 * @file designer/designer_layers_panel.js
 * @description One dock panel (`#designerProperties`'s `[data-dock-id="layers"]`)
 * holding two sub-tabs. The tab pair *is* the panel's own title-bar content —
 * it replaces designer_dock.js's plain `.dock-title` text in place (this file
 * overwrites that element directly, since the dock system itself only knows
 * a title as an opaque HTML string) rather than sitting as a second row
 * below a separate "Layers"/"Elements" label, per direct feedback: the tabs
 * themselves are the title, not a duplicate of it. One panel/block, just
 * with two tabbed views inside it — not two separate stacked dock panels:
 *
 *  - **Layers** — a live tree view of the active tab's Document, every node
 *    indented by depth. Clicking an entry selects that node (tools/select.js)
 *    and scrolls it into view in #designerCanvasBody. Step 5 of the Style
 *    Binding rework (per direct feedback): each node with any styling shows
 *    its style *sources* as read-only sub-rows right underneath it (⚡
 *    Inline / 🎨 .class / # id — one row per source, same symbols/colors
 *    designer_boxmodel_panel.js's Properties badges already use) — purely a
 *    visualization of `node.style`/`node.props.classes`/`.id`, the same
 *    model Step 1-4 already built; no new data, no interaction yet.
 *  - **Elements** — a click-to-insert block palette. The primary way to add
 *    a new block to the canvas: designer_toolbar.js's Cursor bar has no
 *    "+ Child"/"+ Before"/"+ After" buttons of its own (Cursor marks up an
 *    existing block, it doesn't build the tree), so this tab is what
 *    replaces them. Owns a small independent registry, `app.designer.
 *    elements.add(id, clickAction, title, sort, icon?)` / `.remove(id)` —
 *    same add/remove-by-id shape every other Designer registry already uses
 *    (designer_menu.js's `app.designer.menu`, designer_dock.js's own panel
 *    registry); `icon` is an optional emoji/glyph string, rendered above the
 *    label in the 3-per-row grid (falls back to a plain ❖ placeholder when
 *    omitted). This file has no opinion on what `clickAction` does; `init()`
 *    below just registers one entry per registered block type (everything
 *    except "splitter", which is an interactive tool, not an insertable
 *    block — see tools/split.js), each inserting itself as a child of the
 *    current selection.
 *
 * Below both sub-tabs sits one shared bottom bar (per a Photoshop Layers-
 * panel reference the user pointed at) with three actions against the
 * current selection, regardless of which sub-tab is open: a "+" that opens
 * an icon dropdown of every registered Elements entry (same registry the
 * Elements sub-tab itself renders — one flyout, no separate list to keep in
 * sync), an "fx" that opens the CSS animation editor
 * (designer_animation_dialog.js, lazy-loaded on first click), and a trash
 * icon that deletes the selected node from its parent.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the dock system (needs the "layers" dock panel's DOM) and the object model
 * (needs `app.designer.getDocument()`/`registry`/`applyDropAction()`/
 * `selection`).
 *
 * @module program/designer/designer_layers_panel
 */

let activeSubTab = 'layers'; // 'layers' | 'elements'

// ── Layers sub-tab ──────────────────────────────────────────────────────

function nodeLabel(node) {
    if (node.type === 'splitter') {
        return node.props?.direction === 'rows' ? _('Block Row') : _('Block Column');
    }
    return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

const SOURCE_COLOR = { inline: '#e2a53d', class: '#4da3ff', id: '#b06fe0' };

// Read-only visualization of the node's own style-source *references*
// (not resolved values — that's the Properties panel's job) — one row per
// inline/class/id source that actually exists on this node, none at all for
// a plain unstyled node (the common case, so most nodes show nothing extra).
function styleSourceRowsFor(node, depth) {
    const indent = 8 + (depth + 1) * 14;
    const rows = [];

    if (node.style && Object.keys(node.style).length) {
        rows.push(
            `<li class="designer-layer-source-item" style="padding-left:${indent}px;" title="${_('Inline style')}">` +
                `<span class="designer-layer-source-icon" style="color:${SOURCE_COLOR.inline}">⚡</span>` +
                `<span>${_('Inline')}</span>` +
            `</li>`
        );
    }
    (node.props?.classes || []).forEach(cls => {
        rows.push(
            `<li class="designer-layer-source-item" style="padding-left:${indent}px;" title="${_('Class')}">` +
                `<span class="designer-layer-source-icon" style="color:${SOURCE_COLOR.class}">🎨</span>` +
                `<span>.${app.util.escapeHtml(cls)}</span>` +
            `</li>`
        );
    });
    if (node.props?.id) {
        rows.push(
            `<li class="designer-layer-source-item" style="padding-left:${indent}px;" title="${_('ID')}">` +
                `<span class="designer-layer-source-icon" style="color:${SOURCE_COLOR.id}">#</span>` +
                `<span>${app.util.escapeHtml(node.props.id)}</span>` +
            `</li>`
        );
    }
    return rows.join('');
}

// Flat list with indentation via padding-left, not a nested <ul><li><ul> —
// same visual hierarchy, simpler markup.
function layerRowsFor(node, depth) {
    const own = `<li class="designer-layer-item" data-node-id="${node.id}" style="padding-left:${8 + depth * 14}px;">${nodeLabel(node)}</li>`;
    return own + styleSourceRowsFor(node, depth) + node.children.map(c => layerRowsFor(c, depth + 1)).join('');
}

function layersContentHTML() {
    const doc = app.designer.getDocument?.();
    return doc
        ? `<ul class="designer-layer-list">${layerRowsFor(doc.root, 0)}</ul>`
        : `<p>${_('No document')}</p>`;
}

function bindLayersContent(panel) {
    panel.querySelectorAll('.designer-layer-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.nodeId;
            const target = document.querySelector(`[data-node-id="${id}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            app.designer.selectTool?.selectById(id, 'layers-panel');
        });
    });
}

// ── Elements sub-tab ────────────────────────────────────────────────────

const elementEntries = new Map(); // id -> { id, clickAction, title, sort, icon }

function elementList() {
    return [...elementEntries.values()].sort((a, b) => a.sort - b.sort);
}

// 3-per-row icon grid, not a text list — each tile is icon-over-label, same
// idea as the old drag-only "Components" palette's icon+label rows (see this
// file's own header comment) but laid out as a grid instead of a stack.
function elementsContentHTML() {
    const items = elementList();
    if (!items.length) {
        return `<p class="designer-elements-empty">${_('No elements')}</p>`;
    }
    return `<div class="designer-elements-grid">` +
        items.map(item =>
            `<div class="designer-elements-item" data-element-id="${item.id}" title="${item.title}">` +
                `<span class="designer-elements-icon">${item.icon || '❖'}</span>` +
                `<span class="designer-elements-label">${item.title}</span>` +
            `</div>`
        ).join('') +
        `</div>`;
}

function bindElementsContent(panel) {
    panel.querySelectorAll('.designer-elements-item').forEach(el => {
        el.addEventListener('click', () => {
            const entry = elementEntries.get(el.dataset.elementId);
            entry?.clickAction?.();
        });
    });
}

function addElement(id, clickAction, title, sort, icon) {
    if (!id) return null;
    const maxSort = elementEntries.size ? Math.max(...elementList().map(e => e.sort)) : 0;
    elementEntries.set(id, {
        id,
        clickAction: typeof clickAction === 'function' ? clickAction : null,
        title: title || id,
        sort: sort ?? (maxSort + 10),
        icon: icon || null
    });
    render();
    return id;
}

function removeElement(id) {
    if (!elementEntries.has(id)) return false;
    elementEntries.delete(id);
    render();
    return true;
}

function blockLabel(type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Inserts a new block of `type` as a child of the current selection, falling
 * back to the document root when nothing's selected — same "no explicit
 * target" fallback a palette drag would otherwise need. Auto-selects the new
 * node (`applyDropAction`'s own default) — unlike designer_toolbar.js's
 * removed addChild (which used to restore the prior selection instead, for
 * repeated edits against one node), here following the just-inserted node is
 * the whole point of a click-to-insert palette.
 */
function insertBlock(type) {
    const doc = app.designer.getDocument?.();
    const targetId = app.designer.selection?.get?.() || doc?.root?.id;
    if (!targetId) return null;
    return app.designer.applyDropAction({ action: 'insert', source: type, target: targetId, position: 'inside' });
}

const BLOCK_ICONS = {
    container: '📦',
    text: '🔤',
    image: '🖼️',
    button: '🔘',
    form: '📝',
    layout: '📐',
    custom: '⚙️'
};

function registerDefaultElements() {
    const types = (app.designer.registry?.registeredTypes?.() || []).filter(t => t !== 'splitter');
    types.forEach((type, i) => addElement(type, () => insertBlock(type), blockLabel(type), (i + 1) * 10, BLOCK_ICONS[type]));
}

let addMenuEl = null;

function closeAddMenu() {
    addMenuEl?.remove();
    addMenuEl = null;
}

function addMenuHTML() {
    const items = elementList();
    if (!items.length) return `<div class="designer-layers-addmenu-empty">${_('No elements')}</div>`;
    return `<ul class="designer-layers-addmenu">` +
        items.map(item =>
            `<li class="designer-layers-addmenu-item" data-element-id="${item.id}">` +
                `<span class="designer-layers-addmenu-icon">${item.icon || '❖'}</span>` +
                `<span>${item.title}</span>` +
            `</li>`
        ).join('') +
        `</ul>`;
}

function openAddMenu(anchorEl) {
    closeAddMenu();

    const rect = anchorEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'designer-layers-addmenu-wrap';
    el.style.top = (rect.bottom + 4) + 'px';
    el.style.left = rect.left + 'px';
    el.innerHTML = addMenuHTML();
    document.body.appendChild(el);
    addMenuEl = el;

    el.querySelectorAll('.designer-layers-addmenu-item').forEach(item => {
        item.addEventListener('click', () => {
            const entry = elementEntries.get(item.dataset.elementId);
            closeAddMenu();
            entry?.clickAction?.();
        });
    });

    requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth) el.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
        if (r.bottom > window.innerHeight) el.style.top = Math.max(4, rect.top - r.height - 4) + 'px';
    });
}

// ── Bottom bar — shared by both sub-tabs ────────────────────────────────

function selectedNode() {
    const doc = app.designer.getDocument?.();
    const id = app.designer.selection?.get?.();
    return id ? doc?.find(id) : null;
}

function bottomBarHTML() {
    const node = selectedNode();
    const doc = app.designer.getDocument?.();
    const canDelete = !!node && doc?.root?.id !== node.id;
    return (
        `<div class="designer-layers-bottombar">` +
            `<button type="button" class="designer-layers-bottombtn" data-action="add-element" title="${_('Add element')}">` +
                `<svg viewBox="0 0 16 16" width="14" height="14"><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M8 2v12M2 8h12"/></svg>` +
            `</button>` +
            `<button type="button" class="designer-layers-bottombtn designer-layers-fx-btn" data-action="open-animation" title="${_('CSS Animation')}" ${node ? '' : 'disabled'}>fx</button>` +
            `<span class="designer-layers-bottombar-spacer"></span>` +
            `<button type="button" class="designer-layers-bottombtn" data-action="delete-node" title="${_('Delete')}" ${canDelete ? '' : 'disabled'}>` +
                `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M4 4.5h8l-.7 8.8a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4 4.5z"/><path stroke="currentColor" stroke-width="1.2" d="M6.3 2.5h3.4l.5 1.3H5.8zM3 4.5h10M6.5 7v5M9.5 7v5"/></svg>` +
            `</button>` +
        `</div>`
    );
}

function deleteSelectedNode() {
    const doc = app.designer.getDocument?.();
    const id = app.designer.selection?.get?.();
    if (!id || !doc) return;
    const parent = doc.root.findParentOf(id);
    if (!parent) return;

    const node = doc.find(id);
    const idx = parent.children.findIndex(c => c.id === id);

    const doRemove = () => { parent.removeChild(id); app.designer.selection.clear('layers-panel-delete'); app.designer.render(); };
    const undoRemove = () => { parent.insertChild(node, idx); app.designer.render(); };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({ type: 'node.delete', title: _('Deleted') + ' ' + node.type, do: doRemove, undo: undoRemove, redo: doRemove });
    } else {
        doRemove();
    }
}

// Lazy-loaded on first click only, same idiom as designer_boxmodel_panel.js's
// own openBorderDialog — avoids adding designer_animation_dialog.js to
// designer.js's boot chain for a secondary editor most sessions may never open.
function openAnimationDialog() {
    const node = selectedNode();
    if (!node) return;
    if (app.designer.animationDialog?.open) {
        app.designer.animationDialog.open({ node });
        return;
    }
    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_animation_dialog.js')
        .then(mod => mod?.init?.(app))
        .then(() => app.designer.animationDialog.open({ node }));
}

function bindBottomBar(panel) {
    panel.querySelector('[data-action="add-element"]')?.addEventListener('click', function () {
        if (addMenuEl) { closeAddMenu(); return; }
        openAddMenu(this);
    });
    panel.querySelector('[data-action="open-animation"]')?.addEventListener('click', openAnimationDialog);
    panel.querySelector('[data-action="delete-node"]')?.addEventListener('click', deleteSelectedNode);
}

// ── Shared panel shell ──────────────────────────────────────────────────

// Stands in for designer_dock.js's own plain-text `.dock-title` — see this
// file's own header comment. Rendered straight into that element (not into
// `.designer-dock-content`), so its own click handlers are bound separately
// in render() below, scoped to `.dock-title` rather than the content panel.
function titleTabsHTML() {
    return (
        `<button type="button" class="designer-layers-subtab${activeSubTab === 'layers' ? ' active' : ''}" data-subtab="layers">${_('Layers')}</button>` +
        `<button type="button" class="designer-layers-subtab${activeSubTab === 'elements' ? ' active' : ''}" data-subtab="elements">${_('Elements')}</button>`
    );
}

function contentHTML() {
    const listHTML = activeSubTab === 'layers' ? layersContentHTML() : elementsContentHTML();
    return `<div class="designer-layers-list-area">${listHTML}</div>` + bottomBarHTML();
}

// Rewrites both `.dock-title` and `.designer-dock-content` on every call —
// needed even for a same-panel content-only update, since a full dock-level
// re-render (drag-reorder, resize, saveLayout/loadLayout) rebuilds the whole
// panel, title included, from designer_dock.js's own stored (plain, tab-less)
// title string every time; this re-asserts the tab markup right after, same
// reasoning as designer_boxmodel_panel.js's own dock render hook.
function render() {
    const panelRoot = document.querySelector('[data-dock-id="layers"]');
    if (!panelRoot) return;

    const titleEl = panelRoot.querySelector('.dock-title');
    if (titleEl) {
        titleEl.innerHTML = titleTabsHTML();
        titleEl.querySelectorAll('[data-subtab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeSubTab === btn.dataset.subtab) return;
                activeSubTab = btn.dataset.subtab;
                render();
            });
        });
    }

    const panel = panelRoot.querySelector('.designer-dock-content');
    if (!panel) return;
    panel.innerHTML = contentHTML();
    if (activeSubTab === 'layers') bindLayersContent(panel);
    else bindElementsContent(panel);
    bindBottomBar(panel);
}

function injectCSS() {
    if (document.getElementById('designer-layers-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-layers-panel-style';
    style.textContent = `
        [data-dock-id="layers"] .dock-title { display: flex; align-items: stretch; gap: 0; overflow: visible; height: 100%; }
        .designer-layers-subtab {
            font-size: 11px; background: transparent; color: rgba(255,255,255,0.55);
            border: none; padding: 0 12px; cursor: pointer; flex: 0 0 auto; height: 100%;
        }
        .designer-layers-subtab:hover { color: #ffffff; }
        .designer-layers-subtab.active { color: #ffffff; font-weight: 600; background: var(--theme-backgruondcolord); }

        .designer-layer-list { list-style: none; margin: 0; padding: 0; }
        .designer-layer-item { padding: 4px 6px; font-size: 11px; cursor: pointer; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .designer-layer-item:hover { background-color: rgba(255,255,255,0.08); }

        .designer-layer-source-item {
            display: flex; align-items: center; gap: 5px; padding: 2px 6px; font-size: 10px;
            color: rgba(255,255,255,0.55); cursor: default; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .designer-layer-source-icon { flex-shrink: 0; font-size: 10px; line-height: 1; }

        .designer-elements-empty { font-size: 11px; opacity: 0.5; margin: 0; }
        .designer-elements-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .designer-elements-item {
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
            padding: 10px 2px; border-radius: 4px; cursor: pointer; text-align: center;
        }
        .designer-elements-item:hover { background-color: rgba(255,255,255,0.08); }
        .designer-elements-icon { font-size: 20px; line-height: 1; }
        .designer-elements-label { font-size: 10px; color: #ffffff; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

        .designer-layers-bottombar { display: flex; align-items: center; gap: 2px; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); }
        .designer-layers-bottombar-spacer { flex: 1; }
        .designer-layers-bottombtn {
            width: 22px; height: 22px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
            background: transparent; border: none; border-radius: 3px; color: rgba(255,255,255,0.6); cursor: pointer;
        }
        .designer-layers-bottombtn:hover { color: #ffffff; background-color: rgba(255,255,255,0.08); }
        .designer-layers-bottombtn:disabled { opacity: 0.3; cursor: default; }
        .designer-layers-bottombtn:disabled:hover { background: transparent; }
        .designer-layers-fx-btn { font-size: 10px; font-style: italic; font-weight: 700; }

        .designer-layers-addmenu-wrap {
            position: fixed; min-width: 160px; max-width: 220px; padding: 4px;
            background: linear-gradient(144deg, rgba(37,37,37,0.95) 0%, rgba(10,10,10,0.92) 100%);
            box-shadow: 1px 1px 6px rgba(0,0,0,0.5), 1px 1px 1px #ffffff1a, -1px -1px 1px #ffffff1a;
            border-radius: 8px; backdrop-filter: blur(10px); z-index: 99999;
        }
        .designer-layers-addmenu { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; }
        .designer-layers-addmenu-empty { font-size: 11px; opacity: 0.6; padding: 6px 8px; }
        .designer-layers-addmenu-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-size: 11px; color: #ffffff; border-radius: 5px; cursor: pointer; white-space: nowrap; }
        .designer-layers-addmenu-item:hover { background-color: rgba(255,255,255,0.1); }
        .designer-layers-addmenu-icon { font-size: 14px; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();

    app.designer.elements = { add: addElement, remove: removeElement };
    registerDefaultElements();

    render();

    app.designer._registerRenderHook(render);

    app.designer.dock?._registerRenderHook(render);

    $(document).on('designer-selection-changed', render);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.designer-layers-addmenu-wrap') && !e.target.closest('[data-action="add-element"]')) closeAddMenu();
    }, true);
}
