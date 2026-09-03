/**
 * @file designer/designer_dock.js
 * @description Core dock-panel registry and renderer for #designerProperties.
 * Lazy-loaded by `designer.js`'s `start()` once the window's DOM exists.
 * Drag-reorder and resize are wired separately by `designer_dock_sortable.js`
 * and `designer_dock_resizable.js` — this file only owns panel data + render.
 *
 * Two layout modes:
 *  - **expanded** (default): a header strip with a `>>` collapse toggle, then
 *    the panels stacked vertically in a resizable/reorderable column.
 *  - **collapsed**: `#designerProperties` shrinks to a 40px icon rail (one
 *    icon per panel); clicking an icon opens that panel's real content in a
 *    flyout beside the rail. Only the active panel is in the DOM at a time —
 *    the panel-content modules key off `[data-dock-id="X"] .designer-dock-content`
 *    (found anywhere in the document) so they keep working unchanged; an
 *    inactive panel just has no content node and its render hook early-returns,
 *    exactly as when a panel is removed.
 *
 * `designer_workspace.js` drives collapse from persisted state + a responsive
 * width rule; it only ever calls `setCollapsed(bool, { silent:true })`. The
 * `designer-dock-collapsed` event is fired ONLY by the header button, so the
 * workspace module's listener never loops back into a save on a silent call.
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
 *  - setCollapsed(bool, opts)     — collapse/expand the column (idempotent)
 *  - isCollapsed()                 — current mode
 *  - toggleCollapsed()              — flip mode (user action; fires the event)
 *  - closeFlyout()                   — clear the collapsed-mode flyout
 *
 * `options` per panel: { id, sort, title, icon, width, minWidth, maxWidth,
 * html, draggable = true, resizable = true }.
 *
 * @module program/designer/designer_dock
 */

const panels = new Map();      // id -> panel data
const renderHooks = [];         // fn(containerEl) — called after every render; sortable/resizable register here
let containerEl = null;

let collapsed = false;
let activeId = null;             // collapsed mode: which panel's flyout is open
let flyoutOutsideHandler = null;

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

function panelIconHTML(p) {
    if (p.icon) return `<svg><use href="${p.icon}"></use></svg>`;
    return `<span class="designer-dock-rail-letter">${(p.title || p.id || '?').trim().charAt(0).toUpperCase()}</span>`;
}

// The header strip — a collapse/expand toggle, same idea as the left
// sidebar's #designerMenuHeader. When a responsive breakpoint is what's
// forcing the current state (workspace._forced()), the button is replaced by
// a non-interactive hint — you can't override a breakpoint by hand.
function headerHTML() {
    const forced = window.app.designer.workspace?._forced?.() || {};
    if (forced.collapsed || forced.hidden) {
        return (
            `<div class="designer-dock-header">` +
            `<span class="designer-dock-header-hint" title="${_('Window too narrow')}">&laquo;</span>` +
            `</div>`
        );
    }
    const glyph = collapsed ? '&raquo;' : '&laquo;';
    const title = collapsed ? _('Expand panel') : _('Collapse panel');
    return (
        `<div class="designer-dock-header">` +
        `<button type="button" class="designer-dock-collapse-btn" data-dock-collapse title="${title}">${glyph}</button>` +
        `</div>`
    );
}

function list() {
    return [...panels.values()].sort((a, b) => a.sort - b.sort);
}

function render() {
    if (!containerEl) return;
    const ordered = list();

    containerEl.classList.toggle('designer-dock-collapsed', collapsed);

    if (collapsed) {
        containerEl.innerHTML =
            headerHTML() +
            `<div class="designer-dock-rail">` +
                ordered.map(p =>
                    `<button type="button" class="designer-dock-rail-icon${p.id === activeId ? ' active' : ''}" ` +
                    `data-dock-rail="${p.id}" title="${p.title}">${panelIconHTML(p)}</button>`
                ).join('') +
            `</div>` +
            (activeId && panels.has(activeId)
                ? `<div class="designer-dock-flyout">${panelHTML(get(activeId))}</div>`
                : '');

        bindCollapseHeader();
        bindRail();
        bindFlyout();
    } else {
        detachFlyoutOutside();
        containerEl.innerHTML = headerHTML() + ordered.map(panelHTML).join('');

        ordered.forEach(p => {
            const el = containerEl.querySelector(`[data-dock-id="${p.id}"]`);
            el?.querySelector('.dock-close')?.addEventListener('click', () => remove(p.id));
        });
        bindCollapseHeader();
    }

    renderHooks.forEach(fn => fn(containerEl));
}

function bindCollapseHeader() {
    containerEl.querySelector('[data-dock-collapse]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapsed();
    });
}

function bindRail() {
    containerEl.querySelectorAll('[data-dock-rail]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-dock-rail');
            activeId = (activeId === id) ? null : id;
            render();
        });
    });
}

function bindFlyout() {
    const flyout = containerEl.querySelector('.designer-dock-flyout');
    detachFlyoutOutside();
    if (!flyout) return;

    flyout.querySelector('.dock-close')?.addEventListener('click', () => {
        activeId = null;
        render();
    });

    // Capture phase, and explicitly ignore the flyout / rail / header — a
    // rail-icon click that opens the flyout must not be re-read as "outside"
    // by this very same event and close it again.
    flyoutOutsideHandler = (e) => {
        if (e.target.closest('.designer-dock-flyout') ||
            e.target.closest('.designer-dock-rail') ||
            e.target.closest('.designer-dock-header')) return;
        activeId = null;
        render();
    };
    setTimeout(() => document.addEventListener('click', flyoutOutsideHandler, true), 0);
}

function detachFlyoutOutside() {
    if (flyoutOutsideHandler) {
        document.removeEventListener('click', flyoutOutsideHandler, true);
        flyoutOutsideHandler = null;
    }
}

function add(options) {
    if (!options || !options.id) return null;
    if (panels.has(options.id)) return update(options.id, options);

    const maxSort = panels.size ? Math.max(...list().map(p => p.sort)) : 0;
    panels.set(options.id, {
        id: options.id,
        title: options.title || options.id,
        icon: options.icon || null,
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
    if (activeId === id) activeId = null;
    render();
    return true;
}

function get(id) {
    return panels.get(id) || null;
}

// Only overwrites keys actually present in `options` — a content module that
// re-add()s a panel with just {id,sort,title,html} never clears an `icon` set
// at first registration.
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
    if (collapsed) { activeId = id; render(); return; }
    render();
    requestAnimationFrame(() => {
        const el = containerEl?.querySelector(`[data-dock-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('dock-flash');
        setTimeout(() => el.classList.remove('dock-flash'), 600);
    });
}

function setCollapsed(next, opts = {}) {
    next = !!next;
    if (next === collapsed) return;   // idempotent
    collapsed = next;
    activeId = null;
    render();
    if (!opts.silent) $(document).trigger('designer-dock-collapsed', [collapsed]);
}

function toggleCollapsed() {
    collapsed = !collapsed;
    activeId = null;
    render();
    $(document).trigger('designer-dock-collapsed', [collapsed]);
}

function closeFlyout() {
    if (activeId === null) return;
    activeId = null;
    if (collapsed) render();
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

        /* Smooth collapse/expand + hide — the three states (expanded / 40px
           rail / 0) differ only by width, and #designerProperties keeps
           flex:0 0 auto throughout so its size just follows width.
           Suppressed while the user is actively dragging the resize handle
           (designer_dock_resizable.js toggles the class) so the drag stays 1:1. */
        #designerProperties { transition: width 190ms ease; }
        #designerProperties.designer-dock-resizing { transition: none; }

        /* Header strip — the collapse/expand toggle (light-top / dark-bottom bevel). */
        .designer-dock-header { display:flex; align-items:center; justify-content:flex-start; height:22px; flex:0 0 auto; background-color:rgba(0,0,0,0.3); }
        .designer-dock-collapse-btn, .designer-dock-header-hint {
            width:22px; height:22px; display:flex; align-items:center; justify-content:center;
            background:none; border:none; color:rgba(255,255,255,0.7); cursor:pointer; font-size:13px; line-height:1; padding:0;
        }
        .designer-dock-collapse-btn:hover { color:#ffffff; background-color:rgba(255,255,255,0.08); }
        .designer-dock-header-hint { cursor:default; opacity:0.35; }

        /* Collapsed mode — 40px icon rail + flyout. Only width changes (flex
           stays 0 0 auto) so the transition above animates it. */
        .designer-dock-collapsed { width:40px !important; min-width:40px !important; overflow:visible !important; }
        .designer-dock-rail { display:flex; flex-direction:column; align-items:center; padding:4px 0; gap:2px; }
        .designer-dock-rail-icon {
            width:32px; height:32px; display:flex; align-items:center; justify-content:center;
            background:none; border:none; border-radius:4px; color:rgba(255,255,255,0.7); cursor:pointer;
        }
        .designer-dock-rail-icon:hover { color:#ffffff; background-color:rgba(255,255,255,0.08); }
        .designer-dock-rail-icon.active { color:#ffffff; background-color:var(--theme-backgruondcolorc, #00000040); }
        .designer-dock-rail-icon svg { width:16px; height:16px; fill:currentColor; }
        .designer-dock-rail-letter { font-size:12px; font-weight:600; }
        .designer-dock-flyout {
            position:absolute; right:40px; top:0; width:300px; height:100%;
            overflow-y:auto; z-index:30;
            background-color:var(--theme-backgruondcolord);
            border-left:1px solid rgba(255,255,255,0.15);
            box-shadow:-4px 0 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12);
            animation: designer-dock-flyout-in 150ms ease;
        }
        @keyframes designer-dock-flyout-in { from { transform: translateX(14px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
            #designerProperties { transition: none; }
            .designer-dock-flyout { animation: none; }
        }
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
        setCollapsed, isCollapsed: () => collapsed, toggleCollapsed, closeFlyout,
        _registerRenderHook(fn) { renderHooks.push(fn); }
    };

    render();
}
