/**
 * @file notepad/notepad_tabs.js
 * @description Per-window tab bar for Notepad — multiple open text
 * documents in one window, shown as a tab strip with a "+" button to add a
 * blank one (matching a reference screenshot of another editor's own tab
 * bar, per direct request).
 *
 * Modeled on `program/designer/designer_tabs.js`'s own tab-state/DOM/
 * click-to-activate/click-to-close pattern, but **instance-scoped** rather
 * than that file's single module-level singleton (`app.designer.tabs`) —
 * Designer only ever has one window (`multistart: false`, `program/
 * designer/setup.js`), so a shared global tab list is safe there. Notepad
 * allows multiple simultaneous windows (`multistart: true`, `program/
 * notepad/setup.js`) — a shared global tab list would leak tabs across
 * separate Notepad windows. `createTabs(win)` returns a fresh, independent
 * `{add, close, activate, ...}` API + state per call, and both its DOM
 * queries and its own custom events are scoped to the passed-in window
 * element (a plain DOM `.window` root) rather than a bare `#id` selector or
 * `document` — matching `notepad_data.js`'s own per-window scoping
 * convention (`document.querySelector(".window.active")`), not designer_
 * tabs.js's document-wide one. Also unlike designer_tabs.js, this file owns
 * no drag-to-reorder — not requested, and Designer's own version needed it
 * for a very different reason (its tabs correspond to full canvas
 * documents users actively reorder); out of scope here unless asked for.
 *
 * Each tab here is a **thin `{id, title}` record only** — same split as
 * designer_tabs.js: this file has zero knowledge of *what* a tab actually
 * contains (a string of editor text, in Notepad's case). The actual
 * per-tab document content is owned entirely by `notepad_data.js`, which
 * listens for this file's `notepad-tab-added`/`notepad-tab-activated`/
 * `notepad-tab-closed` events (jQuery events triggered on the window
 * element itself, `$(win).trigger(...)`, not `$(document).trigger(...)`)
 * the same way `designer_objectmodel.js` listens for designer_tabs.js's
 * own document-wide equivalents.
 *
 * No per-tab "unsaved changes" dot — Notepad doesn't track dirty state
 * anywhere in this codebase yet (confirmed: no `_isDirty`/`markDirty`
 * anywhere in notepad_data.js), so a tab-level indicator would be
 * decorative without real backing data; left out rather than faked.
 *
 * @module program/notepad/notepad_tabs
 */

function tabHTML(tab, isActive) {
    return (
        `<div class="notepad-tab${isActive ? ' active' : ''}" data-tab-id="${tab.id}" title="${app.util.escapeHtml(tab.title)}">` +
        `<span class="notepad-tab-title">${app.util.escapeHtml(tab.title)}</span>` +
        `<span class="notepad-tab-close" data-tab-close title="${_('Close')}">&times;</span>` +
        `</div>`
    );
}

/**
 * @param {HTMLElement} win - the `.window` root element this tab bar
 *   belongs to (same element `notepad_data.js`'s own `data(os)` finds via
 *   `document.querySelector(".window.active")`).
 * @returns {{add:function, close:function, activate:function,
 *   setTitle:function, getActive:function, getTabs:function}}
 */
export function createTabs(win) {
    const $win = $(win);
    const $list = $win.find('.notepad-tabs-list');
    const $addBtn = $win.find('.notepad-tab-add');

    let tabs = [];
    let activeId = null;
    let nextId = 1;

    function render() {
        $list.html(tabs.map(t => tabHTML(t, t.id === activeId)).join(''));
    }

    function add(title) {
        const id = nextId++;
        tabs.push({ id, title: title || _('New document') });
        activeId = id;
        render();
        $win.trigger('notepad-tab-added', [id]);
        $win.trigger('notepad-tab-activated', [id]);
        return id;
    }

    function close(id) {
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        const wasActive = activeId === id;
        tabs.splice(idx, 1);

        if (tabs.length === 0) {
            $win.trigger('notepad-tab-closed', [id]);
            add();
            return;
        }

        if (wasActive) {
            const neighbor = tabs[idx] || tabs[idx - 1];
            activeId = neighbor.id;
        }
        render();
        $win.trigger('notepad-tab-closed', [id]);
        if (wasActive) $win.trigger('notepad-tab-activated', [activeId]);
    }

    function activate(id) {
        if (id === activeId) return;
        if (!tabs.some(t => t.id === id)) return;
        activeId = id;
        render();
        $win.trigger('notepad-tab-activated', [id]);
    }

    function setTitle(id, title) {
        const tab = tabs.find(t => t.id === id);
        if (!tab || tab.title === title) return;
        tab.title = title;
        render();
    }

    function getActive() { return activeId; }
    function getTabs() { return tabs.slice(); }

    $list.off('click.notepadTabs').on('click.notepadTabs', '.notepad-tab', function (e) {
        const id = Number(this.dataset.tabId);
        if (e.target.closest('[data-tab-close]')) { close(id); return; }
        activate(id);
    });
    $addBtn.off('click.notepadTabsAdd').on('click.notepadTabsAdd', () => add());

    add();

    return { add, close, activate, setTitle, getActive, getTabs };
}
