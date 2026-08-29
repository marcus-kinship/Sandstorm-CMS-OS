/**
 * @file designer/designer_dock.js
 * @description Core dock-panel registry and renderer for #designerProperties.
 * Lazy-loaded by `designer.js`'s `start()` once the window's DOM exists.
 * Drag-reorder and resize are wired separately by `designer_dock_sortable.js`
 * and `designer_dock_resizable.js` — this file only owns panel data + render.
 *
 * Exports `init(app)` — sets up `app.designer.dock`:
 *  - add(options)       — register/replace a panel, returns its id
 *  - remove(id)          — unregister a panel
 *  - get(id)              — read a panel's current data
 *  - list()                — all panels, sorted
 *  - update(id, options)    — merge new options into a panel
 *  - sort()                  — re-render honoring current `sort` values
 *  - show(id)                 — scroll a panel into view and flash it
 *  - saveLayout()               — returns [{id, sort, width}, ...], also cached
 *  - loadLayout(data)            — applies a previously saved layout
 *
 * `options` per panel: { id, sort, title, width, minWidth, maxWidth, html,
 * draggable = true, resizable = true }.
 *
 * @module program/designer/designer_dock
 */

const panels = new Map();      // id -> panel data
const renderHooks = [];         // fn(containerEl) — called after every render; sortable/resizable register here
let containerEl = null;

function panelHTML(p) {
    return (
        `<div class="designer-dock-panel" data-dock-id="${p.id}">` +
        (p.draggable
            ? `<div class="designer-dock-title">` +
              `<span class="dock-drag-handle" title="${_('Drag to reorder')}">&#8942;&#8942;</span>` +
              `<span class="dock-title">${p.title}</span>` +
              `<button class="dock-close" title="${_('Close')}">&times;</button>` +
              `</div>`
            : `<div class="designer-dock-title designer-dock-title-fixed">` +
              `<span class="dock-title">${p.title}</span>` +
              `<button class="dock-close" title="${_('Close')}">&times;</button>` +
              `</div>`) +
        `<div class="designer-dock-content">${p.html || ''}</div>` +
        `</div>`
    );
}

function list() {
    return [...panels.values()].sort((a, b) => a.sort - b.sort);
}

function render() {
    if (!containerEl) return;
    const ordered = list();
    containerEl.innerHTML = ordered.map(panelHTML).join('');

    ordered.forEach(p => {
        const el = containerEl.querySelector(`[data-dock-id="${p.id}"]`);
        if (!el) return;
        el.querySelector('.dock-close')?.addEventListener('click', () => remove(p.id));
    });

    renderHooks.forEach(fn => fn(containerEl));
}

function add(options) {
    if (!options || !options.id) return null;
    if (panels.has(options.id)) return update(options.id, options);

    const maxSort = panels.size ? Math.max(...list().map(p => p.sort)) : 0;
    panels.set(options.id, {
        id: options.id,
        title: options.title || options.id,
        sort: options.sort ?? (maxSort + 10),
        width: options.width ?? 300,
        minWidth: options.minWidth ?? 150,
        maxWidth: options.maxWidth ?? 600,
        html: options.html || '',
        draggable: options.draggable !== false,
        resizable: options.resizable !== false
    });
    render();
    return options.id;
}

function remove(id) {
    if (!panels.has(id)) return false;
    panels.delete(id);
    render();
    return true;
}

function get(id) {
    return panels.get(id) || null;
}

function update(id, options) {
    const p = panels.get(id);
    if (!p) return null;
    Object.assign(p, options);
    render();
    return p;
}

function sortPanels() {
    render();
}

function show(id) {
    const p = panels.get(id);
    if (!p) return;
    render();
    requestAnimationFrame(() => {
        const el = containerEl?.querySelector(`[data-dock-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('dock-flash');
        setTimeout(() => el.classList.remove('dock-flash'), 600);
    });
}

function saveLayout() {
    const data = list().map(p => ({ id: p.id, sort: p.sort, width: p.width }));
    app.config.set('designer', 'dockLayout', data);
    return data;
}

function loadLayout(data) {
    if (!Array.isArray(data)) return;
    data.forEach(entry => {
        const p = panels.get(entry.id);
        if (p) Object.assign(p, entry);
    });
    render();
}

function injectCSS() {
    if (document.getElementById('designer-dock-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-dock-style';
    style.textContent = `
        .designer-dock-panel { display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.08); }
        .designer-dock-title { display:flex; align-items:center; gap:6px; height:28px; padding:0 8px; font-size:11px; color:#ffffff; background-color:rgba(0,0,0,0.15); cursor:default; user-select:none; }
        .designer-dock-title-fixed { cursor:default; }
        .dock-drag-handle { cursor:grab; opacity:0.5; letter-spacing:-2px; }
        .dock-drag-handle:active { cursor:grabbing; }
        .dock-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dock-close { background:none; border:none; color:#ffffff; opacity:0.6; cursor:pointer; font-size:14px; line-height:1; padding:2px 4px; }
        .dock-close:hover { opacity:1; }
        .designer-dock-content { padding:8px; font-size:11px; color:rgba(255,255,255,0.8); }
        .designer-dock-panel.dock-flash { animation: designer-dock-flash 600ms ease; }
        @keyframes designer-dock-flash { 0%, 100% { background-color: transparent; } 30% { background-color: rgba(255,255,255,0.12); } }
        .designer-dock-drop-placeholder { border:1px dashed rgba(255,255,255,0.35); background-color:rgba(255,255,255,0.05); margin: 2px 0; box-sizing:border-box; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    containerEl = document.getElementById('designerProperties');
    if (!containerEl) return;

    injectCSS();

    app.designer = app.designer || {};
    app.designer.dock = {
        add, remove, get, list, update,
        sort: sortPanels,
        show,
        saveLayout, loadLayout,
        _registerRenderHook(fn) { renderHooks.push(fn); }
    };

    render();
}
