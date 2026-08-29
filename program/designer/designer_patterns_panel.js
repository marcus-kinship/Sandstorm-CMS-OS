/**
 * @file designer/designer_patterns_panel.js
 * @description Owns the Properties panel's "Patterns" title-bar tab — a
 * flat tab alongside Properties/Color/Swatches/Gradients (`designer_
 * boxmodel_panel.js` owns the tab strip itself and dispatches straight to
 * this file's own `renderInto`, not through designer_color_history.js — see
 * that file's own header comment for why this is a flat tab, not a nested
 * sub-tab, per direct feedback). Same saved-preset/add/adjust/remove CRUD
 * shape as designer_gradients_panel.js's own Gradients tab, but each preset
 * is built from a small fixed library of CSS pattern *recipes*
 * (checkerboard/stripes/dots/grid) parametrized by size + one or two
 * colors — no image uploads, per explicit user choice (an `AskUserQuestion`
 * was asked specifically because no "pattern" concept existed anywhere in
 * this codebase yet; the user picked "Färdiga CSS-mönster" — predefined CSS
 * patterns — over an uploaded-image-tile system that would have needed new
 * storage plumbing). All rendered via `repeating-linear-gradient`/
 * `repeating-conic-gradient` background CSS, same technique a real OS's own
 * pattern fills use — no `<img>`/file involved anywhere.
 *
 * Saved presets — `{id, recipe, size, colorA, colorB}` — persist to
 * `window.localStorage` (same try/catch + STORAGE_KEY pattern every other
 * persisted panel in this program uses). `renderInto(container)` records
 * its own container so a save/delete can refresh in place via `refresh()`,
 * without depending on any other file.
 *
 * First run seeds the library from `EXAMPLE_PATTERNS` (a handful of preset
 * recipe/size/color combinations) — same "empty grid didn't read as a real
 * preset library" feedback and same once-only seeding behavior as designer_
 * gradients_panel.js's own `EXAMPLE_GRADIENTS` (see that file's own header
 * comment for the exact seeding rule).
 *
 * Lazy-loaded on first visit to the Patterns tab (see designer_boxmodel_
 * panel.js's `renderLazyTab`) — not part of `designer.js`'s eager boot chain.
 *
 * @module program/designer/designer_patterns_panel
 */

const STORAGE_KEY = 'designer.color.patterns';

const RECIPES = {
    checkerboard: {
        label: () => _('Checkerboard'),
        needsColorB: true,
        css: (size, a, b) =>
            `repeating-conic-gradient(${a} 0% 25%, ${b} 0% 50%) 0 0 / ${size}px ${size}px`
    },
    stripes: {
        label: () => _('Stripes'),
        needsColorB: true,
        css: (size, a, b) =>
            `repeating-linear-gradient(45deg, ${a} 0, ${a} ${size / 2}px, ${b} ${size / 2}px, ${b} ${size}px)`
    },
    dots: {
        label: () => _('Dots'),
        needsColorB: true,
        css: (size, a, b) =>
            `radial-gradient(circle, ${a} ${size * 0.18}px, transparent ${size * 0.18}px) 0 0 / ${size}px ${size}px, ${b}`
    },
    grid: {
        label: () => _('Grid'),
        needsColorB: true,
        css: (size, a, b) =>
            `linear-gradient(${a} 1px, transparent 1px) 0 0 / ${size}px ${size}px, ` +
            `linear-gradient(90deg, ${a} 1px, transparent 1px) 0 0 / ${size}px ${size}px, ${b}`
    }
};

const EXAMPLE_PATTERNS = [
    { id: 'ex-check-classic', recipe: 'checkerboard', size: 16, colorA: '#cccccc', colorB: '#ffffff' },
    { id: 'ex-check-dark',    recipe: 'checkerboard', size: 24, colorA: '#2b2b2b', colorB: '#4a4a4a' },
    { id: 'ex-check-blue',    recipe: 'checkerboard', size: 12, colorA: '#1f3340', colorB: '#4da3ff' },
    { id: 'ex-stripes-warn',  recipe: 'stripes',       size: 16, colorA: '#ffd75e', colorB: '#2b2b2b' },
    { id: 'ex-stripes-soft',  recipe: 'stripes',       size: 20, colorA: '#e8f7a1', colorB: '#8ce676' },
    { id: 'ex-dots-navy',     recipe: 'dots',          size: 18, colorA: '#4da3ff', colorB: '#0f2f4f' },
    { id: 'ex-dots-berry',    recipe: 'dots',          size: 14, colorA: '#ff5e8e', colorB: '#2d1b4e' },
    { id: 'ex-grid-graph',    recipe: 'grid',          size: 20, colorA: 'rgba(255,255,255,0.35)', colorB: '#1f3340' }
];

let patterns = [];
let _pending = null;

function load() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            const seeded = EXAMPLE_PATTERNS.map(x => ({ ...x }));
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
            return seeded;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('[designer_patterns_panel] localStorage load failed:', error);
        return [];
    }
}

function save() {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
    } catch (error) {
        console.warn('[designer_patterns_panel] localStorage save failed:', error);
    }
}

function cssFor(p) {
    const recipe = RECIPES[p.recipe] || RECIPES.checkerboard;
    return recipe.css(p.size, p.colorA, p.colorB);
}

function defaultPattern() {
    return { id: 'p' + Date.now().toString(36), recipe: 'checkerboard', size: 16, colorA: '#cccccc', colorB: '#ffffff' };
}

function list() { return patterns.slice(); }

let currentContainer = null;

function listHTML() {
    const tiles = patterns.map(p =>
        `<span class="dch-asset-tile" data-pattern-id="${p.id}" title="${_('Adjust')}" style="background:${cssFor(p)};"></span>`
    ).join('');
    return `<div class="dch-asset-grid">${tiles}<button type="button" class="dch-asset-add" data-add-pattern title="${_('Add pattern')}">+</button></div>`;
}

function bindList(panelEl) {
    panelEl.querySelectorAll('[data-pattern-id]').forEach(tile => {
        tile.addEventListener('click', () => openDialog(patterns.find(p => p.id === tile.dataset.patternId)));
    });
    panelEl.querySelector('[data-add-pattern]')?.addEventListener('click', () => openDialog(defaultPattern(), { isNew: true }));
}

/** Entry point designer_boxmodel_panel.js calls when its "Patterns" tab is active. */
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
    if (currentContainer && currentContainer.dataset.tab === 'patterns' && document.contains(currentContainer)) {
        renderInto(currentContainer);
    }
}

// ── Add/edit dialog ────────────────────────────────────────────────────────

function dialogHTML(p) {
    const recipeOptions = Object.entries(RECIPES).map(([id, r]) =>
        `<option value="${id}" ${p.recipe === id ? 'selected' : ''}>${r.label()}</option>`
    ).join('');

    return `
        <div class="dpt-root">
            <div class="dpt-preview" style="background:${cssFor(p)};"></div>
            <div class="dpt-row">
                <span>${_('Recipe')}</span>
                <select class="dpt-recipe">${recipeOptions}</select>
            </div>
            <div class="dpt-row">
                <span>${_('Size')}</span>
                <input type="number" class="def dpt-size" min="4" max="96" value="${p.size}">
                <span>px</span>
            </div>
            <div class="dpt-row">
                <span>${_('Color A')}</span>
                <input type="color" class="dpt-color-a" value="${p.colorA}">
            </div>
            <div class="dpt-row dpt-color-b-row">
                <span>${_('Color B')}</span>
                <input type="color" class="dpt-color-b" value="${p.colorB}">
            </div>
            <div class="dpt-footer">
                <button type="button" class="aero-button xs dpt-delete">${_('Delete')}</button>
                <span class="dpt-spacer"></span>
                <button type="button" class="aero-button xs dpt-save">${_('Save')}</button>
                <button type="button" class="aero-button xs dpt-close">${_('Close')}</button>
            </div>
        </div>
    `;
}

function readForm(root) {
    return {
        recipe: root.querySelector('.dpt-recipe')?.value || 'checkerboard',
        size: Math.min(96, Math.max(4, parseFloat(root.querySelector('.dpt-size')?.value) || 16)),
        colorA: root.querySelector('.dpt-color-a')?.value || '#cccccc',
        colorB: root.querySelector('.dpt-color-b')?.value || '#ffffff'
    };
}

function rerenderPreview(root, p) {
    const preview = root.querySelector('.dpt-preview');
    if (preview) preview.style.background = cssFor(p);
}

function wireDialog(root, p, { isNew, close }) {
    function currentPattern() { return { ...p, ...readForm(root) }; }
    function onFormChange() { rerenderPreview(root, currentPattern()); }

    root.querySelector('.dpt-recipe')?.addEventListener('change', onFormChange);
    root.querySelector('.dpt-size')?.addEventListener('input', onFormChange);
    root.querySelector('.dpt-color-a')?.addEventListener('input', onFormChange);
    root.querySelector('.dpt-color-b')?.addEventListener('input', onFormChange);

    root.querySelector('.dpt-save')?.addEventListener('click', () => {
        const updated = currentPattern();
        const idx = patterns.findIndex(x => x.id === p.id);
        if (idx === -1) patterns.push(updated); else patterns[idx] = updated;
        save();
        refresh();
        close();
    });

    root.querySelector('.dpt-delete')?.addEventListener('click', () => {
        patterns = patterns.filter(x => x.id !== p.id);
        save();
        refresh();
        close();
    });
    if (isNew) root.querySelector('.dpt-delete').style.display = 'none';

    root.querySelector('.dpt-close')?.addEventListener('click', () => close());
}

function injectDialogCSS() {
    if (document.getElementById('designer-patterns-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-patterns-dialog-style';
    style.textContent = `
        .dpt-root { display: flex; flex-direction: column; gap: 10px; padding: 14px; color: #fff; font-size: 11px; }
        .dpt-preview { height: 60px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2); }
        .dpt-row { display: flex; align-items: center; gap: 8px; }
        .dpt-row > span:first-child { width: 60px; opacity: 0.7; }
        .dpt-size { width: 56px; }
        .dpt-color-a, .dpt-color-b { -webkit-appearance: none; appearance: none; width: 26px; height: 20px; padding: 0; border: none; cursor: pointer; }
        .dpt-color-a::-webkit-color-swatch-wrapper, .dpt-color-b::-webkit-color-swatch-wrapper { padding: 0; }
        .dpt-color-a::-webkit-color-swatch, .dpt-color-b::-webkit-color-swatch { border: none; border-radius: 3px; }
        .dpt-footer { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
        .dpt-spacer { flex: 1; }
    `;
    document.head.appendChild(style);
}

function openDialog(p, { isNew = false } = {}) {
    if (!p) return;
    injectDialogCSS();
    _pending = { p, isNew };

    app.ui.windowStart('designer', {
        id: 'designer',
        title: isNew ? _('Add Pattern') : _('Edit Pattern'),
        windowIcon: true,
        resizable: false,
        width: '240px',
        height: '320px',
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
                app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: isNew ? _('Add Pattern') : _('Edit Pattern') });
            }, 0);

            setTimeout(() => {
                const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                const root = winEl?.querySelector('.dpt-root');
                if (!root) return;
                wireDialog(root, captured.p, { isNew: captured.isNew, close: () => windowobj.close() });
            }, 0);

            return dialogHTML(captured.p);
        }
    });
}

export function init(app) {
    patterns = load();
    app.designer = app.designer || {};
    app.designer.patterns = { list, renderInto, cssFor };
}
