/**
 * @file designer/designer_gradients_panel.js
 * @description Owns the Properties panel's "Gradients" title-bar tab — a
 * flat tab alongside Properties/Color/Swatches/Patterns (`designer_boxmodel_
 * panel.js` owns the tab strip itself and dispatches straight to this file's
 * own `renderInto`, not through designer_color_history.js — see that file's
 * own header comment for why this is a flat tab, not a nested sub-tab, per
 * direct feedback). Owns a small saved-gradient library — `{id, type, angle,
 * stops:[{color,pos}]}` — persisted to `window.localStorage` (same try/
 * catch + STORAGE_KEY pattern every other persisted panel in this program
 * uses, e.g. designer_color_history.js's own `HISTORY_KEY`/`FAVORITES_KEY`).
 *
 * `renderInto(container)` renders a grid of gradient-preview tiles (shared
 * `.dch-asset-grid`/`.dch-asset-tile` classes from designer_color_history.js
 * so Swatches/Gradients/Patterns read as one visual family) plus an "add"
 * tile; clicking a tile opens the same add/edit dialog pre-filled for that
 * gradient (adjust or remove), clicking "add" opens it blank. The dialog
 * uses the exact `_pending`/`windowStart`/`state.close`/two-`setTimeout`
 * skeleton `designer_border_dialog.js`/`designer_sides_dialog.js` both
 * already use. `renderInto` records its own container so a save/delete can
 * refresh in place via `refresh()`, without depending on any other file.
 *
 * First run seeds the library from `EXAMPLE_GRADIENTS` (a fixed set of
 * preset color combinations) — per direct feedback ("saknar exempelar över
 * övertoningar"), an empty grid with only a "+" tile didn't read as a real
 * preset library the way a reference tool's own Gradients panel does. The
 * seed only ever applies once: `load()` seeds+persists it the first time
 * `STORAGE_KEY` is completely absent from `localStorage`, so deleting a
 * preset (or adding your own) afterward sticks — it does not reappear on
 * the next reload the way a "merge defaults back in every load" approach
 * would.
 *
 * Lazy-loaded on first visit to the Gradients tab (see designer_boxmodel_
 * panel.js's `renderLazyTab`) — not part of `designer.js`'s eager boot chain.
 *
 * @module program/designer/designer_gradients_panel
 */

const STORAGE_KEY = 'designer.color.gradients';

// Seeded into the library on first run only — see this file's own header
// comment. `g('id', type, angle, [[color,pos], ...])` keeps each entry to
// one line; ids are stable strings (not the timestamp-based ones
// defaultGradient() mints for a new blank entry) so they don't collide with
// anything a user adds afterward.
function g(id, type, angle, stops) {
    return { id, type, angle, stops: stops.map(([color, pos]) => ({ color, pos })) };
}
const EXAMPLE_GRADIENTS = [
    g('ex-grayscale',   'linear', 90,  [['#000000', 0], ['#ffffff', 100]]),
    g('ex-silver',      'linear', 90,  [['#e8e8e8', 0], ['#8f8f8f', 50], ['#e8e8e8', 100]]),
    g('ex-sky',         'linear', 180, [['#4da3ff', 0], ['#bfe0ff', 100]]),
    g('ex-ocean',       'linear', 135, [['#0f2f4f', 0], ['#1f6f8f', 50], ['#5fd0c8', 100]]),
    g('ex-forest',      'linear', 90,  [['#1f4d2b', 0], ['#5fae4f', 100]]),
    g('ex-lime',        'linear', 90,  [['#8ce676', 0], ['#e8f7a1', 100]]),
    g('ex-sunset',      'linear', 90,  [['#ff7a45', 0], ['#ffd75e', 50], ['#ff5e8e', 100]]),
    g('ex-fire',        'linear', 90,  [['#ffd75e', 0], ['#ff7a45', 50], ['#c0392b', 100]]),
    g('ex-berry',       'linear', 90,  [['#c0392b', 0], ['#8e2de2', 100]]),
    g('ex-orchid',      'linear', 135, [['#ff5e8e', 0], ['#c04cff', 100]]),
    g('ex-gold',        'linear', 90,  [['#fff3c4', 0], ['#d4a017', 100]]),
    g('ex-slate',       'linear', 90,  [['#3d3a1f', 0], ['#1f3340', 100]]),
    g('ex-rainbow',     'linear', 90,  [['#ff3b3b', 0], ['#ffd75e', 25], ['#8ce676', 50], ['#4da3ff', 75], ['#c04cff', 100]]),
    g('ex-radial-glow', 'radial', 0,   [['#ffffff', 0], ['#4da3ff', 100]]),
    g('ex-radial-heat', 'radial', 0,   [['#ffd75e', 0], ['#c0392b', 100]]),
    g('ex-radial-dusk', 'radial', 0,   [['#ff5e8e', 0], ['#2d1b4e', 100]])
];

let gradients = [];
let _pending = null;

function load() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            const seeded = EXAMPLE_GRADIENTS.map(x => ({ ...x, stops: x.stops.map(s => ({ ...s })) }));
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
            return seeded;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('[designer_gradients_panel] localStorage load failed:', error);
        return [];
    }
}

function save() {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(gradients));
    } catch (error) {
        console.warn('[designer_gradients_panel] localStorage save failed:', error);
    }
}

function cssFor(g) {
    const stops = g.stops.map(s => `${s.color} ${s.pos}%`).join(', ');
    return g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle}deg, ${stops})`;
}

function defaultGradient() {
    return { id: 'g' + Date.now().toString(36), type: 'linear', angle: 90, stops: [{ color: '#ffffff', pos: 0 }, { color: '#000000', pos: 100 }] };
}

function list() { return gradients.slice(); }

let currentContainer = null;

function listHTML() {
    const tiles = gradients.map(g =>
        `<span class="dch-asset-tile" data-gradient-id="${g.id}" title="${_('Adjust')}" style="background:${cssFor(g)};"></span>`
    ).join('');
    return `<div class="dch-asset-grid">${tiles}<button type="button" class="dch-asset-add" data-add-gradient title="${_('Add gradient')}">+</button></div>`;
}

function bindList(panelEl) {
    panelEl.querySelectorAll('[data-gradient-id]').forEach(tile => {
        tile.addEventListener('click', () => openDialog(gradients.find(g => g.id === tile.dataset.gradientId)));
    });
    panelEl.querySelector('[data-add-gradient]')?.addEventListener('click', () => openDialog(defaultGradient(), { isNew: true }));
}

/** Entry point designer_boxmodel_panel.js calls when its "Gradients" tab is active. */
function renderInto(container) {
    if (!container) return;
    currentContainer = container;
    container.innerHTML = listHTML();
    bindList(container);
}

// Called after a save/delete in the dialog — refreshes this tab's own tile
// grid in place. `currentContainer` is the Properties dock's persistent
// `.designer-dock-content` div, shared across every tab, so it stays
// `document.contains()`-true even while a *different* tab (e.g. Color) is
// the one actually showing — the dialog is a separate OS window that can
// still be open after the user switched tabs underneath it. Checking
// `dataset.tab` (set by designer_boxmodel_panel.js's own render() right
// before dispatching) is what actually tells us this tab is the visible one.
function refresh() {
    if (currentContainer && currentContainer.dataset.tab === 'gradients' && document.contains(currentContainer)) {
        renderInto(currentContainer);
    }
}

// ── Add/edit dialog ────────────────────────────────────────────────────────

function stopRowHTML(stop, i) {
    return `
        <div class="dgr-stop" data-stop-index="${i}">
            <input type="color" class="dgr-stop-color" value="${stop.color}">
            <input type="number" class="def dgr-stop-pos" min="0" max="100" value="${stop.pos}">
            <span class="dgr-stop-pct">%</span>
            <button type="button" class="dgr-stop-remove" title="${_('Remove stop')}">✕</button>
        </div>
    `;
}

function dialogHTML(g) {
    return `
        <div class="dgr-root">
            <div class="dgr-preview" style="background:${cssFor(g)};"></div>
            <div class="dgr-row">
                <label class="dgr-radio"><input type="radio" name="dgr-type" value="linear" ${g.type === 'linear' ? 'checked' : ''}> ${_('Linear')}</label>
                <label class="dgr-radio"><input type="radio" name="dgr-type" value="radial" ${g.type === 'radial' ? 'checked' : ''}> ${_('Radial')}</label>
            </div>
            <div class="dgr-row dgr-angle-row" style="${g.type === 'radial' ? 'display:none;' : ''}">
                <span>${_('Angle')}</span>
                <input type="number" class="def dgr-angle" min="0" max="360" value="${g.angle}">
                <span>°</span>
            </div>
            <div class="dgr-stops">${g.stops.map(stopRowHTML).join('')}</div>
            <button type="button" class="aero-button xs dgr-add-stop">${_('Add Stop')}</button>
            <div class="dgr-footer">
                <button type="button" class="aero-button xs dgr-delete">${_('Delete')}</button>
                <span class="dgr-spacer"></span>
                <button type="button" class="aero-button xs dgr-save">${_('Save')}</button>
                <button type="button" class="aero-button xs dgr-close">${_('Close')}</button>
            </div>
        </div>
    `;
}

function readForm(root) {
    const type = root.querySelector('input[name="dgr-type"]:checked')?.value || 'linear';
    const angle = parseFloat(root.querySelector('.dgr-angle')?.value) || 0;
    const stops = Array.from(root.querySelectorAll('.dgr-stop')).map(row => ({
        color: row.querySelector('.dgr-stop-color')?.value || '#000000',
        pos: Math.min(100, Math.max(0, parseFloat(row.querySelector('.dgr-stop-pos')?.value) || 0))
    }));
    return { type, angle, stops };
}

function rerenderPreview(root, g) {
    const preview = root.querySelector('.dgr-preview');
    if (preview) preview.style.background = cssFor(g);
}

function wireDialog(root, g, { isNew, close }) {
    function currentGradient() {
        return { ...g, ...readForm(root) };
    }

    function onFormChange() {
        rerenderPreview(root, currentGradient());
    }

    root.querySelectorAll('input[name="dgr-type"]').forEach(el => el.addEventListener('change', () => {
        root.querySelector('.dgr-angle-row').style.display = el.value === 'radial' && el.checked ? 'none' : '';
        onFormChange();
    }));
    root.querySelector('.dgr-angle')?.addEventListener('input', onFormChange);

    function bindStopRow(row) {
        row.querySelector('.dgr-stop-color')?.addEventListener('input', onFormChange);
        row.querySelector('.dgr-stop-pos')?.addEventListener('input', onFormChange);
        row.querySelector('.dgr-stop-remove')?.addEventListener('click', () => {
            if (root.querySelectorAll('.dgr-stop').length <= 2) return; // a gradient needs at least 2 stops
            row.remove();
            onFormChange();
        });
    }
    root.querySelectorAll('.dgr-stop').forEach(bindStopRow);

    root.querySelector('.dgr-add-stop')?.addEventListener('click', () => {
        const stopsEl = root.querySelector('.dgr-stops');
        const count = stopsEl.children.length;
        const row = document.createElement('div');
        row.innerHTML = stopRowHTML({ color: '#888888', pos: 50 }, count);
        const el = row.firstElementChild;
        stopsEl.appendChild(el);
        bindStopRow(el);
        onFormChange();
    });

    root.querySelector('.dgr-save')?.addEventListener('click', () => {
        const updated = currentGradient();
        const idx = gradients.findIndex(x => x.id === g.id);
        if (idx === -1) gradients.push(updated); else gradients[idx] = updated;
        save();
        refresh();
        close();
    });

    root.querySelector('.dgr-delete')?.addEventListener('click', () => {
        gradients = gradients.filter(x => x.id !== g.id);
        save();
        refresh();
        close();
    });
    if (isNew) root.querySelector('.dgr-delete').style.display = 'none';

    root.querySelector('.dgr-close')?.addEventListener('click', () => close());
}

function injectDialogCSS() {
    if (document.getElementById('designer-gradients-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-gradients-dialog-style';
    style.textContent = `
        .dgr-root { display: flex; flex-direction: column; gap: 10px; padding: 14px; color: #fff; font-size: 11px; }
        .dgr-preview { height: 40px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2); }
        .dgr-row { display: flex; align-items: center; gap: 8px; }
        .dgr-radio { display: flex; align-items: center; gap: 4px; cursor: pointer; }
        .dgr-angle { width: 56px; }
        .dgr-stops { display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; }
        .dgr-stop { display: flex; align-items: center; gap: 6px; }
        .dgr-stop-color { -webkit-appearance: none; appearance: none; width: 26px; height: 20px; padding: 0; border: none; cursor: pointer; }
        .dgr-stop-color::-webkit-color-swatch-wrapper { padding: 0; }
        .dgr-stop-color::-webkit-color-swatch { border: none; border-radius: 3px; }
        .dgr-stop-pos { width: 48px; }
        .dgr-stop-remove { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; margin-left: auto; }
        .dgr-stop-remove:hover { color: #ff6b6b; }
        .dgr-footer { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
        .dgr-spacer { flex: 1; }
    `;
    document.head.appendChild(style);
}

function openDialog(g, { isNew = false } = {}) {
    if (!g) return;
    injectDialogCSS();
    _pending = { g, isNew };

    app.ui.windowStart('designer', {
        id: 'designer',
        title: isNew ? _('Add Gradient') : _('Edit Gradient'),
        windowIcon: true,
        resizable: false,
        width: '260px',
        height: '340px',
        body(windowobj) {
            const captured = _pending;
            _pending = null;
            if (!captured) return '';

            const parentId = app.designer.win?.windowId || 'designer';
            const dialogId = windowobj.windowId;

            windowobj.state.close(() => {
                if (parentId) app.windows.closeDialog(dialogId);
            });

            setTimeout(() => {
                app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: isNew ? _('Add Gradient') : _('Edit Gradient') });
            }, 0);

            setTimeout(() => {
                const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                const root = winEl?.querySelector('.dgr-root');
                if (!root) return;
                wireDialog(root, captured.g, { isNew: captured.isNew, close: () => windowobj.close() });
            }, 0);

            return dialogHTML(captured.g);
        }
    });
}

export function init(app) {
    gradients = load();
    app.designer = app.designer || {};
    app.designer.gradients = { list, renderInto, cssFor };
}
