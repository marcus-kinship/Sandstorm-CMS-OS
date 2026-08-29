/**
 * @file designer/designer_tabs.js
 * @description Tab bar for #tabbsTitle. Lazy-loaded by `designer.js`'s
 * `start()` once the window's DOM (#tabbsTitle) already exists.
 *
 * Exports `init(app)` — renders the tab bar and exposes the API on
 * `app.designer.tabs`:
 *  - add(title)      — creates a new tab, makes it active, returns its id
 *  - close(id)        — removes a tab (activates a neighbor if it was active)
 *  - activate(id)      — switches the active tab
 *  - sort (internal)   — jQuery mousedown/mousemove drag-to-reorder, bound
 *                          once in init(); reordering updates the tab array
 *                          to match the dragged DOM order on drop.
 *
 * @module program/designer/designer_tabs
 */

const state = { tabs: [], activeId: null, nextId: 1 };

function render() {
    const $container = $('#tabbsTitle');
    if (!$container.length) return;

    $container.empty();
    state.tabs.forEach(tab => {
        const $tab = $(
            `<div class="designer-tab" data-tab-id="${tab.id}">` +
            `<span class="designer-tab-label">${tab.title}</span>` +
            `<span class="designer-tab-close">&times;</span>` +
            `</div>`
        );
        $tab.toggleClass('active', tab.id === state.activeId);
        $container.append($tab);
    });
}

// Fires 'designer-tab-added'/'designer-tab-activated'/'designer-tab-closed'
// on `document` (jQuery custom events) — lets designer_objectmodel.js attach
// a Document to each tab without this module needing to know that system
// exists at all.

function add(title) {
    const id = state.nextId++;
    state.tabs.push({ id, title: title || _('Untitled') });
    state.activeId = id;
    render();
    $(document).trigger('designer-tab-added', [id]);
    $(document).trigger('designer-tab-activated', [id]);
    return id;
}

function close(id) {
    const idx = state.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    state.tabs.splice(idx, 1);
    const wasActive = state.activeId === id;
    if (wasActive) {
        const neighbor = state.tabs[idx] || state.tabs[idx - 1];
        state.activeId = neighbor ? neighbor.id : null;
    }
    render();
    $(document).trigger('designer-tab-closed', [id]);
    if (wasActive && state.activeId) $(document).trigger('designer-tab-activated', [state.activeId]);
}

function activate(id) {
    if (!state.tabs.some(t => t.id === id)) return;
    state.activeId = id;
    render();
    $(document).trigger('designer-tab-activated', [id]);
}

// Drag a tab left/right to reorder it — jQuery mousedown/mousemove/mouseup,
// no external sortable library. On drop, state.tabs is resynced to match
// whatever order the drag left the DOM in.
function bindSort() {
    const container = document.getElementById('tabbsTitle');
    if (!container) return;

    $(container).on('mousedown', '.designer-tab', function (e) {
        if ($(e.target).hasClass('designer-tab-close')) return;
        e.preventDefault();

        const id = Number($(this).data('tab-id'));
        activate(id);
        const $tab = $(container).children(`[data-tab-id="${id}"]`);
        if (!$tab.length) return;

        function move(ev) {
            const $siblings = $(container).children('.designer-tab').not($tab);
            let $after = null;
            $siblings.each(function () {
                const rect = this.getBoundingClientRect();
                if (ev.clientX < rect.left + rect.width / 2) { $after = $(this); return false; }
            });
            if ($after) $tab.insertBefore($after);
            else $tab.appendTo(container);
        }

        function up() {
            const order = $(container).children('.designer-tab').map(function () {
                return Number($(this).data('tab-id'));
            }).get();
            state.tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            $(document).off('mousemove', move).off('mouseup', up);
        }

        $(document).on('mousemove', move).on('mouseup', up);
    });

    $(container).on('click', '.designer-tab-close', function (e) {
        e.stopPropagation();
        close(Number($(this).closest('.designer-tab').data('tab-id')));
    });

    $(container).on('click', '.designer-tab', function () {
        activate(Number($(this).data('tab-id')));
    });
}

function injectCSS() {
    if (document.getElementById('designer-tabs-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-tabs-style';
    style.textContent = `
        .designer-tab { display:flex; align-items:center; gap:6px; height:100%; padding:0 10px; font-size:11px; color:rgba(255,255,255,0.6); cursor:pointer; user-select:none; border-right:1px solid rgba(255,255,255,0.08); }
        .designer-tab.active { color:#ffffff; background-color:rgba(0,0,0,0.15); }
        .designer-tab-close { opacity:0.5; }
        .designer-tab-close:hover { opacity:1; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    if (!document.getElementById('tabbsTitle')) return;

    injectCSS();
    bindSort();

    if (!app.designer) app.designer = {};
    app.designer.tabs = { add, close, activate };

    add(_('Untitled') + ' 1');
  
}
