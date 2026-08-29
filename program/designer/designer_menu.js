/**
 * @file designer/designer_menu.js
 * @description Component system for the sidebar #designerMenuList. Lazy-
 * loaded by `designer.js`'s `start()` once the window's DOM (#designerMenu,
 * #designerMenuList, #designerMenuHeader) already exists.
 *
 * Exports `init(app)` — sets up `app.designer.menu`:
 *  - add(options)   — register/replace an item, returns its id
 *  - remove(id)      — unregister an item
 *  - get(id)          — read an item's current data
 *  - list()            — all items, sorted
 *
 * `options`: { id, sort, type: 'icon'|'html', icon: {type:'svg'|'img', value},
 * title, click, submenu }. `submenu` is an array of the same shape minus
 * `sort`/`type` (each entry: { id, title, icon, click }).
 *
 * An item with both `submenu` and its own top-level `click` fires that
 * `click` once, immediately, the moment its flyout is opened (first click on
 * the icon) — the submenu still opens right after, letting a sub-item be
 * picked instead if the default isn't what's wanted. Closing an
 * already-open flyout (clicking the same icon again) never re-fires it.
 * This is how the Text Tool icon (designer.js) defaults to Normal Text on a
 * single click while Wave/Vertical stay one submenu-pick away.
 *
 * No hardcoded items — everything (including the two example entries
 * designer.js registers) goes through `add()`. Click handling is delegated
 * off #designerMenuList, not bound per-item, so re-rendering never needs to
 * re-bind anything.
 *
 * Also wires the existing #designerMenuHeader arrow icon to toggle
 * #designerSidebar between a 1-column (icons stacked) and 2-column (icon
 * grid) layout.
 *
 * @module program/designer/designer_menu
 */

const items = new Map(); // id -> item data
let listEl = null;
let openSubmenuEl = null;
let openSubmenuForId = null;

function iconHTML(icon) {
    if (!icon) return '';
    if (icon.type === 'img') return `<img src="${icon.value}">`;
    return `<svg><use href="${icon.value}"></use></svg>`;
}

function itemHTML(item) {
    if (item.type === 'html') {
        return `<li class="designer-menu-item designer-menu-item-html" data-menu-id="${item.id}" title="${item.title || ''}">${item.html || ''}</li>`;
    }
    return (
        `<li class="designer-menu-item" data-menu-id="${item.id}" title="${item.title || ''}">` +
        iconHTML(item.icon) +
        (item.submenu?.length ? `<span class="designer-menu-caret"></span>` : '') +
        `</li>`
    );
}

function list() {
    return [...items.values()].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

function render() {
    if (!listEl) return;
    listEl.innerHTML = list().map(itemHTML).join('');
}

function add(options) {
    if (!options || !options.id) return null;
    items.set(options.id, {
        id: options.id,
        sort: options.sort ?? 0,
        type: options.type || 'icon',
        icon: options.icon || null,
        title: options.title || options.id,
        click: typeof options.click === 'function' ? options.click : null,
        html: options.html || '',
        submenu: Array.isArray(options.submenu) ? options.submenu : null,
        toolIds: Array.isArray(options.toolIds) ? options.toolIds : null
    });
    render();
    return options.id;
}

function remove(id) {
    if (!items.has(id)) return false;
    items.delete(id);
    if (openSubmenuForId === id) closeSubmenu();
    render();
    return true;
}

function get(id) {
    return items.get(id) || null;
}

/**
 * Highlights whichever top-level item's `toolIds` includes `toolId`
 * (clearing the highlight on every other item). Called by
 * `app.designer.setActiveTool()` whenever the active tool changes.
 */
function setActiveTool(toolId) {
    if (!listEl) return;
    items.forEach(item => {
        const active = Array.isArray(item.toolIds) && item.toolIds.includes(toolId);
        listEl.querySelector(`[data-menu-id="${item.id}"]`)?.classList.toggle('designer-menu-item-active', active);
    });
}

function closeSubmenu() {
    openSubmenuEl?.remove();
    openSubmenuEl = null;
    openSubmenuForId = null;
}

function openSubmenu(item, anchorEl) {
    closeSubmenu();

    const rect = anchorEl.getBoundingClientRect();
    const el = document.createElement('ul');
    el.className = 'designer-menu-submenu';
    el.style.top = rect.top + 'px';
    el.style.left = rect.right + 'px';
    el.innerHTML = item.submenu.map(sub => {
        const icon = typeof sub.icon === 'string' ? { type: 'svg', value: sub.icon } : sub.icon;
        const dragAttrs = sub.draggable
            ? ` data-block-type="${sub.blockType || sub.id}"` + (sub.props ? ` data-block-props='${JSON.stringify(sub.props)}'` : '')
            : '';
        const dragClass = sub.draggable ? ' designer-palette-item' : '';
        return `<li class="designer-menu-subitem${dragClass}" data-submenu-id="${sub.id}"${dragAttrs}>${iconHTML(icon)}<span>${sub.title || sub.id}</span></li>`;
    }).join('');

    el.addEventListener('click', e => {
        const subEl = e.target.closest('[data-submenu-id]');
        if (!subEl) return;
        const sub = item.submenu.find(s => s.id === subEl.dataset.submenuId);
        if (sub?.draggable) return;
        closeSubmenu();
        if (sub && typeof sub.click === 'function') sub.click();
    });

    document.body.appendChild(el);
    openSubmenuEl = el;
    openSubmenuForId = item.id;

    el.querySelectorAll('.designer-palette-item').forEach(dragEl => {
        $(dragEl).draggable({
            helper: 'clone',
            revert: 'invalid',
            revertDuration: 150,
            appendTo: 'body',
            zIndex: 100000,
            cursorAt: { left: 10, top: 10 },
            scroll: false,
            stop: () => closeSubmenu()
        });
    });

    requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth) el.style.left = (rect.left - r.width) + 'px';
        if (r.bottom > window.innerHeight) el.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
    });
}

function bindEvents() {
    $(listEl).on('click', '[data-menu-id]', function (e) {
        const item = items.get($(this).data('menu-id'));
        if (!item) return;

        if (item.submenu?.length) {
            e.stopPropagation();
            if (openSubmenuForId === item.id) { closeSubmenu(); return; }
            if (typeof item.click === 'function') item.click();
            openSubmenu(item, this);
            return;
        }

        closeSubmenu();
        if (typeof item.click === 'function') item.click();
    });


    document.addEventListener('click', (e) => {
        if (!e.target.closest('.designer-menu-submenu') && !e.target.closest('[data-menu-id]')) closeSubmenu();
    }, true);
}

// ── 1-column / 2-column toggle ──────────────────────────────────────────

function bindColumnToggle() {
    const header = document.getElementById('designerMenuHeader');
    const sidebar = document.getElementById('designerSidebar');
    if (!header || !sidebar) return;

    const arrow = header.querySelector('svg');
    let twoColumn = false;

    header.addEventListener('click', () => {
        twoColumn = !twoColumn;
        listEl.classList.toggle('designer-menu-list-2col', twoColumn);
        sidebar.style.width = twoColumn ? '76px' : '40px';
        if (arrow) arrow.style.transform = twoColumn ? 'scaleX(-1)' : '';
        closeSubmenu();
    });
}

function injectCSS() {
    if (document.getElementById('designer-menu-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-menu-style';
    style.textContent = `
        .designer-menu-list { display: flex; flex-direction: column; }
        .designer-menu-list-2col { display: grid; grid-template-columns: repeat(2, 1fr); align-content: start;}
        .designer-menu-item { display: flex; align-items: center; justify-content: center; position: relative; height: 38px; cursor: default; color: rgba(255,255,255,0.75); }
        .designer-menu-item:hover { background-color: rgba(0,0,0,0.15); color: #ffffff; }
        .designer-menu-item.designer-menu-item-active { background-color: var(--theme-backgruondcolorc, #00000040); color: #ffffff;  }
        .designer-menu-item svg { width: 16px; height: 16px; fill: currentColor; }
        .designer-menu-item img { width: 16px; height: 16px; }
        .designer-menu-item-html { height: auto; padding: 4px; }
        .designer-menu-caret { position: absolute; right: 3px; bottom: 3px; width: 5px; height: 5px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); opacity: 0.6; }
        .designer-menu-submenu { position: fixed; list-style: none; margin: 0; padding: 4px; min-width: 160px; background: linear-gradient(144deg, rgba(37,37,37,0.95) 0%, rgba(10,10,10,0.92) 100%); box-shadow: 1px 1px 6px rgba(0,0,0,0.5), 1px 1px 1px #ffffff1a, -1px -1px 1px #ffffff1a; border-radius: 8px; backdrop-filter: blur(10px); z-index: 99999; }
        .designer-menu-subitem { display: flex; align-items: center; gap: 8px; padding: 7px 9px; font-size: 11px; color: #ffffff; border-radius: 5px; cursor: default; white-space: nowrap; }
        .designer-menu-subitem:hover { background-color: rgba(255,255,255,0.1); }
        .designer-menu-subitem svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    listEl = document.getElementById('designerMenuList');
    if (!listEl) return;

    injectCSS();
    bindEvents();
    bindColumnToggle();

    app.designer = app.designer || {};
    app.designer.menu = { add, remove, get, list, setActiveTool };
}
