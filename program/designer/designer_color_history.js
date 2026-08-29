/**
 * @file designer/designer_color_history.js
 * @description Owns the data + view for the Properties panel's "Color"
 * title-bar tab (`designer_boxmodel_panel.js` owns the tab strip itself and
 * dispatches to `renderMapInto` — see that file's own header comment).
 *
 * As of 2026-08-25 (follow-up round) this single tab holds three stacked
 * sections, top to bottom:
 *
 *  1. **FG/BG slot pair** (`slotPairHTML`) — a small two-swatch "which one
 *     am I editing" selector, the same visual idea as the reference
 *     Photoshop Color panel's own top-left icon. Reads/writes `app.designer.
 *     sidebarColorGroup` **directly** — the exact same singleton instance
 *     `designer.js` mounts in the left tool column (`#designerSidebarColors`)
 *     — rather than keeping a second, parallel copy of the color state that
 *     could drift out of sync. Clicking a slot makes it `activeSlot` (module
 *     state) **and** opens the full color-picker dialog for it (`app.
 *     designer.colorPicker`) — same default click behavior every other
 *     swatch in this program has. An earlier pass deliberately made this
 *     click *not* open the picker, modeled on how the reference tool splits
 *     that behavior between its toolbox FG/BG icon (opens a picker) and its
 *     Color panel's own mini icon (only switches slots); per direct
 *     feedback that split didn't match what was expected here, so both
 *     behaviors happen together on every click now.
 *  2. **Map + hue slider** (`colorMapHTML`/`bindColorMap`) — a simplified 2D
 *     saturation/value map + vertical hue slider (fixed-hue mode only, no
 *     HSB/Lab axis switching, no RGB/hex fields — deliberately not the full
 *     designer_color_picker_window.js dialog's apparatus). Sized to fill
 *     the tab's available width (measured from its own wrapper at render
 *     time, not a fixed square) and a fixed taller height, per direct
 *     feedback that it should "cover the rest of the panel" rather than sit
 *     in a small fixed corner box. Dragging writes into whichever slot
 *     (`activeSlot`) is currently selected — `sidebarColorGroup.setPrimary`
 *     or `.setSecondary` — and drops the color into Recent on release.
 *  3. **Swatches** (`swatchesHTML`/`bindSwatches`) — recent + favorite
 *     colors, rendered directly beneath the map. This used to be its own
 *     separate title-bar tab; per direct feedback ("under dem ska var dem
 *     färger block finns i Swatches, så att vi kan bort Swatches tabb") it
 *     was folded into this same Color tab so the standalone Swatches tab
 *     could be removed — `designer_boxmodel_panel.js` no longer has a
 *     `swatches` entry in `PROPERTY_TABS` at all.
 *
 * `renderMapInto(container)` is the single entry point designer_boxmodel_
 * panel.js calls when its Color tab is active; it records `container` so
 * this file's own mutations (`add`, `addFavorite`, etc., and the slot-pair's
 * own click handler) can refresh in place via the internal `render()`. That
 * refresh checks `container.dataset.tab === 'map'` (set by designer_
 * boxmodel_panel.js's own render() right before dispatching) rather than
 * just `document.contains(container)` — the container is the dock's
 * persistent `.designer-dock-content` div, shared across every tab, so a
 * plain "is it still in the document" check would stay true even while a
 * *different* tab (e.g. Gradients) is the one actually showing, incorrectly
 * clobbering it. This matters in practice: `add()` can fire from
 * `tools/colorpickup.js`'s eyedropper (`'designer-color-picked'`) whenever
 * that tool is active, regardless of which Properties tab happens to be
 * open at the time.
 *
 * Persisted via `window.localStorage` (not `app.config`, which is an
 * in-memory-only Map with no storage backing — see `program/formbuilder/
 * formbuilder.js`'s `loadFormbuilderState`/`saveFormbuilderState` for the
 * identical try/catch + STORAGE_KEY pattern this file copies).
 *
 * Recent and favorites are independent lists — `add()` only ever touches
 * recents, `addFavorite()`/`removeFavorite()` only ever touch favorites —
 * so favoriting a color doesn't evict it from (or fight over the cap with)
 * the recent list.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, right
 * after the dock system (`dockReady`) — needs to be ready *before*
 * `designer_color_element.js`/`tools/colorpickup.js` load, since both fire
 * `'designer-color-picked'`, which this file listens for to auto-add, and
 * before `designer_boxmodel_panel.js` (loaded much later, in `designer.js`'s
 * final `Promise.all`), which calls `app.designer.colorHistory.
 * renderMapInto`. This file's own slot-pair/drag handling needs `app.
 * designer.sidebarColorGroup` (set up right after this file loads, in the
 * same `dockReady` chain — see `designer.js`) and `app.designer.
 * colorPickupTool` (`tools/colorpickup.js`, loaded shortly after) — both
 * ready well before a user could ever click this tab.
 *
 * @module program/designer/designer_color_history
 */

import { normalizeColor, rgbToHsv, rgbaString } from './core/color.js';

const HISTORY_KEY   = 'designer.color.history';
const FAVORITES_KEY = 'designer.color.favorites';
const MAX_RECENT     = 32;

let recent    = [];
let favorites = [];

let activeSlot = 'primary'; // 'primary' | 'secondary'

let currentContainer = null;

function load(key) {
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`[designer_color_history] localStorage load failed for "${key}":`, error);
        return [];
    }
}

function save(key, list) {
    try {
        window.localStorage.setItem(key, JSON.stringify(list));
    } catch (error) {
        console.warn(`[designer_color_history] localStorage save failed for "${key}":`, error);
    }
}

function add(color) {
    const c = normalizeColor(color);
    recent = [c, ...recent.filter(x => x.hex !== c.hex)].slice(0, MAX_RECENT);
    save(HISTORY_KEY, recent);
    render();
    return c;
}

function remove(color) {
    const hex = normalizeColor(color).hex;
    recent = recent.filter(x => x.hex !== hex);
    save(HISTORY_KEY, recent);
    render();
}

function list() {
    return recent.slice();
}

function clear() {
    recent = [];
    save(HISTORY_KEY, recent);
    render();
}

function isFavorite(color) {
    const hex = normalizeColor(color).hex;
    return favorites.some(x => x.hex === hex);
}

function addFavorite(color) {
    const c = normalizeColor(color);
    if (isFavorite(c)) return;
    favorites = [c, ...favorites];
    save(FAVORITES_KEY, favorites);
    render();
}

function removeFavorite(color) {
    const hex = normalizeColor(color).hex;
    favorites = favorites.filter(x => x.hex !== hex);
    save(FAVORITES_KEY, favorites);
    render();
}

function listFavorites() {
    return favorites.slice();
}

// ── FG/BG slot pair — see this file's own header comment ─────────────────

function activeColor() {
    return activeSlot === 'primary'
        ? app.designer.sidebarColorGroup?.getPrimary?.()
        : app.designer.sidebarColorGroup?.getSecondary?.();
}

function setActiveColor(color, source) {
    app.designer.sidebarColorGroup?.[activeSlot === 'primary' ? 'setPrimary' : 'setSecondary'](color, source);
}

function slotPairHTML() {
    const p = app.designer.sidebarColorGroup?.getPrimary?.() || { r: 0, g: 0, b: 0, a: 1 };
    const s = app.designer.sidebarColorGroup?.getSecondary?.() || { r: 255, g: 255, b: 255, a: 1 };
    return `
        <div class="dch-slot-pair">
            <button type="button" class="dch-slot${activeSlot === 'primary' ? ' active' : ''}" data-slot="primary" title="${_('Foreground')}" style="background-color:${rgbaString(p)};"></button>
            <button type="button" class="dch-slot${activeSlot === 'secondary' ? ' active' : ''}" data-slot="secondary" title="${_('Background')}" style="background-color:${rgbaString(s)};"></button>
        </div>
    `;
}

// Clicking a slot both makes it the active one (same as before) AND opens
// the full color-picker dialog for it — per direct feedback ("jag kan inte
// klick på color pick så fram fönstet gäller båda"), matching how every
// other swatch in this program behaves by default (`app.designer.
// colorElement.create()`'s own un-overridden click handler opens `app.
// designer.colorPicker`) rather than the reference tool's own split
// behavior this file originally modeled the mini icon on.
function bindSlotPair(panelEl) {
    panelEl.querySelectorAll('.dch-slot').forEach(btn => {
        btn.addEventListener('click', () => {
            activeSlot = btn.dataset.slot;
            app.designer.colorPicker?.open({ color: activeColor() })
                .then(result => { if (result) setActiveColor(result, 'picker'); })
                .finally(() => renderMapInto(panelEl));
        });
    });
}

const HUE_SLIDER_W = 14;
const MAP_HEIGHT = 200;
const MAP_MIN_WIDTH = 80;

function dpr() { return window.devicePixelRatio || 1; }

function sizeCanvas(canvas, cssW, cssH) {
    const d = dpr();
    canvas.width  = cssW * d;
    canvas.height = cssH * d;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
}

function drawMapHue(canvas, hue) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);

    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);

    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);
}

function drawHueSlider(canvas) {
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function colorMapHTML() {
    return `
        <div class="dch-map-wrap">
            <canvas class="dch-map" width="200" height="${MAP_HEIGHT}"></canvas>
            <canvas class="dch-hue-slider" width="${HUE_SLIDER_W}" height="${MAP_HEIGHT}"></canvas>
        </div>
    `;
}

function bindColorMap(panelEl) {
    const mapCanvas = panelEl.querySelector('.dch-map');
    const sliderCanvas = panelEl.querySelector('.dch-hue-slider');
    if (!mapCanvas || !sliderCanvas) return;

    const wrapWidth = panelEl.querySelector('.dch-map-wrap')?.getBoundingClientRect().width || 200;
    const mapW = Math.max(MAP_MIN_WIDTH, Math.round(wrapWidth - HUE_SLIDER_W - 6));

    sizeCanvas(mapCanvas, mapW, MAP_HEIGHT);
    sizeCanvas(sliderCanvas, HUE_SLIDER_W, MAP_HEIGHT);
    drawHueSlider(sliderCanvas);

    const initial = normalizeColor(activeColor() || '#ff0000');
    let hue = rgbToHsv(initial).h;
    drawMapHue(mapCanvas, hue);

    function applyColor(rgb) {
        const color = rgbaString({ ...rgb, a: 1 });
        setActiveColor(color, 'map');
        const activeSwatch = panelEl.querySelector('.dch-slot.active');
        if (activeSwatch) activeSwatch.style.backgroundColor = color;
    }

    function bindDrag(canvas, onSample) {
        let dragging = false;
        const pick = e => {
            const rect = canvas.getBoundingClientRect();
            const d = dpr();
            const x = Math.round((e.clientX - rect.left) * d);
            const y = Math.round((e.clientY - rect.top) * d);
            const sample = app.designer.colorPickupTool?.pickFromCanvas(canvas, x, y);
            if (sample) onSample(sample);
        };
        canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
        canvas.addEventListener('pointermove', e => { if (dragging) pick(e); });
        canvas.addEventListener('pointerup', () => {
            dragging = false;
            const c = activeColor();
            if (c) add(c);
        });
    }

    bindDrag(mapCanvas, applyColor);
    bindDrag(sliderCanvas, rgb => {
        hue = rgbToHsv(rgb).h;
        drawMapHue(mapCanvas, hue);
        applyColor(rgb);
    });
}

// ── Swatches — recent + favorites, rendered beneath the map ──────────────

function swatchHTML(color, favorite) {
    return (
        `<span class="designer-color-history-swatch${favorite ? ' designer-color-history-fav' : ''}" ` +
        `data-hex="${color.hex}" title="${color.hex}" style="background-color:${color.hex};">` +
        `<span class="designer-color-history-star" data-fav-toggle>${favorite ? '★' : '☆'}</span>` +
        `</span>`
    );
}

function swatchesHTML() {
    const recentHTML = recent.length
        ? recent.map(c => swatchHTML(c, isFavorite(c))).join('')
        : `<p class="designer-color-history-empty">${_('No recent colors')}</p>`;
    const favHTML = favorites.length
        ? favorites.map(c => swatchHTML(c, true)).join('')
        : `<p class="designer-color-history-empty">${_('No favorites')}</p>`;

    return (
        `<div class="designer-color-history-section">` +
        `<div class="designer-color-history-label">${_('Recent')}</div>` +
        `<div class="designer-color-history-grid">${recentHTML}</div>` +
        `</div>` +
        `<div class="designer-color-history-section">` +
        `<div class="designer-color-history-label">${_('Favorites')}</div>` +
        `<div class="designer-color-history-grid">${favHTML}</div>` +
        `</div>`
    );
}

function bindSwatches(panelEl) {
    $(panelEl).off('click.colorHistory').on('click.colorHistory', '[data-fav-toggle]', function (e) {
        e.stopPropagation();
        const swatch = this.closest('.designer-color-history-swatch');
        const hex = swatch?.dataset.hex;
        if (!hex) return;
        if (isFavorite(hex)) removeFavorite(hex); else addFavorite(hex);
    });

    $(panelEl).off('click.colorHistorySelect').on('click.colorHistorySelect', '.designer-color-history-swatch', function (e) {
        if (e.target.closest('[data-fav-toggle]')) return;
        const hex = this.dataset.hex;
        if (!hex) return;
        $(document).trigger('designer-color-history-select', [normalizeColor(hex)]);
    });
}

// ── Panel shell ────────────────────────────────────────────────────────

/** Entry point designer_boxmodel_panel.js calls when its "Color" tab is active. */
function renderMapInto(container) {
    if (!container) return;
    currentContainer = container;
    container.innerHTML = slotPairHTML() + colorMapHTML() + `<div class="dch-swatches">${swatchesHTML()}</div>`;
    bindSlotPair(container);
    bindColorMap(container);
    bindSwatches(container);
}

// Used by every mutation above to update in place — a no-op unless the
// Color tab is the one actually showing right now (checked via `dataset.
// tab`, not just document presence — see this file's own header comment).
function render() {
    if (currentContainer && currentContainer.dataset.tab === 'map' && document.contains(currentContainer)) {
        renderMapInto(currentContainer);
    }
}

function injectCSS() {
    if (document.getElementById('designer-color-history-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-color-history-style';
    style.textContent = `
        .dch-slot-pair { display: flex; gap: 4px; margin-bottom: 8px; }
        .dch-slot {
            width: 20px; height: 20px; border-radius: 4px; padding: 0; cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3); border: 2px solid transparent;
        }
        .dch-slot:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7); }
        .dch-slot.active { border-color: #4da3ff; }

        .dch-map-wrap { display: flex; gap: 6px; margin-bottom: 10px; }
        .dch-map, .dch-hue-slider { display: block; border-radius: 3px; cursor: crosshair; touch-action: none; }

        .designer-color-history-section + .designer-color-history-section { margin-top: 8px; }
        .designer-color-history-label { font-size: 10px; opacity: 0.6; margin-bottom: 4px; text-transform: uppercase; }
        .designer-color-history-grid { display: flex; flex-wrap: wrap; gap: 4px; }
        .designer-color-history-empty { font-size: 11px; opacity: 0.5; margin: 0; }
        .designer-color-history-swatch { position: relative; width: 20px; height: 20px; border-radius: 4px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); }
        .designer-color-history-swatch:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6); }
        .designer-color-history-star { position: absolute; right: -4px; top: -6px; font-size: 10px; color: rgba(255,255,255,0.5); text-shadow: 0 1px 1px rgba(0,0,0,0.6); }
        .designer-color-history-swatch:hover .designer-color-history-star { color: #ffd75e; }
        .designer-color-history-fav .designer-color-history-star { color: #ffd75e; }

        .dch-asset-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .dch-asset-tile {
            width: 36px; height: 36px; border-radius: 4px; cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); background-size: cover;
        }
        .dch-asset-tile:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6); }
        .dch-asset-add {
            width: 36px; height: 36px; border-radius: 4px; border: 1px dashed rgba(255,255,255,0.3);
            background: rgba(0,0,0,0.15); color: rgba(255,255,255,0.6); font-size: 16px; cursor: pointer;
        }
        .dch-asset-add:hover { color: #ffffff; border-color: rgba(255,255,255,0.6); }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    recent    = load(HISTORY_KEY);
    favorites = load(FAVORITES_KEY);

    injectCSS();

    app.designer = app.designer || {};
    app.designer.colorHistory = {
        add, remove, list, clear,
        addFavorite, removeFavorite, listFavorites, isFavorite,
        renderMapInto
    };

    $(document).on('designer-color-picked', (e, color) => add(color));
}
