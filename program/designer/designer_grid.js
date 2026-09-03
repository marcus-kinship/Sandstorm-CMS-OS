/**
 * @file designer/designer_grid.js
 * @description Design-time **Grid System** overlay for the Designer canvas,
 * plus the show/hide state for the ruler and the (existing) guide lines.
 *
 * The grid is a pure overlay: a single `#designerGridOverlay` div positioned
 * over `#designerCanvasBody`, `pointer-events:none`, drawn entirely with
 * layered `repeating-linear-gradient` backgrounds. It never touches the
 * `Document`/`Node` tree, so `core/parser.js`'s `serialize()` never sees it —
 * the grid is not saved/published with the page. It also never affects any
 * element's layout or hit-testing.
 *
 * Ruler + guide *mechanics* live in `designer_ruler.js` and are untouched
 * here — this module only adds two toggle classes on `#designerCanvas`
 * (`hide-ruler` / `hide-guides`) and the CSS behind them.
 *
 * State is one object persisted to a single `localStorage` key for the
 * whole Designer (same pattern as `designer_gradients_panel.js` /
 * `designer_color_history.js` — Designer has no per-file identity, and
 * `app.config` is not persistent). Gap and size each carry their own unit
 * (`gapUnit` / `widthUnit` / `heightUnit` — px / % / rem / em / vw·vh); a
 * top-level `profile` names an applied preset (`GRID_PROFILES`, e.g. 960.gs)
 * or `custom` once any field is hand-edited.
 *
 * @module program/designer/designer_grid
 */

const STORAGE_KEY = 'sandstorm.designer.grid';

const DEFAULTS = {
    columns: { show: false, gap: 16, gapUnit: 'px', width: 80, widthUnit: 'px', color: '#FF0000', opacity: 50 },
    rows:    { show: false, gap: 16, gapUnit: 'px', height: 80, heightUnit: 'px', color: '#FF0000', opacity: 50 },
    profile: 'custom',
    rulerHidden: false,
    guidesHidden: false
};

/**
 * Named presets. Applying one fills the column width + gap (+ units) and turns
 * columns on; any manual field edit afterwards snaps the profile back to
 * `custom`. 960.gs: 12·60+20 / 16·40+20 / 24·30+10 all total 960px.
 */
const GRID_PROFILES = {
    custom:   { label: _('Custom') },
    '960-12': { label: '960.gs — 12', columns: { width: 60, widthUnit: 'px', gap: 20, gapUnit: 'px' } },
    '960-16': { label: '960.gs — 16', columns: { width: 40, widthUnit: 'px', gap: 20, gapUnit: 'px' } },
    '960-24': { label: '960.gs — 24', columns: { width: 30, widthUnit: 'px', gap: 10, gapUnit: 'px' } },
    'baseline-8': { label: _('8px baseline'), rows: { height: 1, heightUnit: 'px', gap: 7, gapUnit: 'px' } }
};

/** px / % / rem / em / vw|vh — accepted units. */
const UNIT_RE = /^(px|%|rem|em|vw|vh)$/;

/** Back-compat: an earlier build stored one `unit` per section. */
function migrateSection(sec, sizeUnitKey) {
    if (!sec || typeof sec !== 'object') return {};
    if (typeof sec.unit === 'string') {
        if (sec.gapUnit == null) sec.gapUnit = sec.unit;
        if (sec[sizeUnitKey] == null) sec[sizeUnitKey] = sec.unit;
        delete sec.unit;
    }
    return sec;
}

let _state = null;
let _overlayEl = null;
let _ro = null;

// ── persistence ──────────────────────────────────────────────────────────

function load() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return clone(DEFAULTS);
        const parsed = JSON.parse(raw);
        return {
            columns: { ...DEFAULTS.columns, ...migrateSection(parsed.columns, 'widthUnit') },
            rows:    { ...DEFAULTS.rows,    ...migrateSection(parsed.rows, 'heightUnit') },
            profile: (typeof parsed.profile === 'string' && parsed.profile in GRID_PROFILES) ? parsed.profile : 'custom',
            rulerHidden:  !!parsed.rulerHidden,
            guidesHidden: !!parsed.guidesHidden
        };
    } catch (error) {
        console.warn('[designer_grid] localStorage load failed:', error);
        return clone(DEFAULTS);
    }
}

function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
    catch (error) { console.warn('[designer_grid] localStorage save failed:', error); }
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ── colour helper ────────────────────────────────────────────────────────

function unit(u) { return UNIT_RE.test(u) ? u : 'px'; }

/**
 * One repeating-linear-gradient band layer: a coloured band of `size sizeUnit`,
 * then a transparent `gap gapUnit` before it repeats. Gap and size carry their
 * own units, so the repeat length is a `calc()` (valid for px too, safe for
 * mixed units like `calc(60px + 5%)`).
 */
function bandGradient(direction, color, size, sizeUnit, gap, gapUnit) {
    const w = Math.max(0, +size || 0);
    const g = Math.max(0, +gap || 0);
    const band = `${w}${unit(sizeUnit)}`;
    const period = `calc(${w}${unit(sizeUnit)} + ${g}${unit(gapUnit)})`;
    return `repeating-linear-gradient(${direction}, ${color} 0, ${color} ${band}, transparent ${band}, transparent ${period})`;
}

function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return `rgba(255,0,0,${alpha})`;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ── one-time CSS ─────────────────────────────────────────────────────────

function ensureCSS() {
    if (document.getElementById('designer-grid-css')) return;
    const s = document.createElement('style');
    s.id = 'designer-grid-css';
    s.textContent = `
        #designerGridOverlay { position: absolute; pointer-events: none; z-index: 1; }
        #designerCanvas.hide-ruler #designerRulerRow,
        #designerCanvas.hide-ruler #rulerLeft { display: none !important; }
        #designerCanvas.hide-guides #designerCanvasContent .designer-guide { display: none !important; }
    `;
    document.head.appendChild(s);
}

// ── overlay geometry + drawing ───────────────────────────────────────────

function ensureOverlay() {
    const content = document.getElementById('designerCanvasContent');
    if (!content) return null;
    if (_overlayEl && _overlayEl.parentNode === content) return _overlayEl;

    _overlayEl = document.createElement('div');
    _overlayEl.id = 'designerGridOverlay';
    // Sibling of #designerCanvasBody inside the position:relative content box —
    // NOT a child of the body, whose innerHTML the renderer rebuilds.
    content.appendChild(_overlayEl);
    return _overlayEl;
}

/** Match the overlay's box to #designerCanvasBody's box within the content box. */
function syncGeometry() {
    const content = document.getElementById('designerCanvasContent');
    const body = document.getElementById('designerCanvasBody');
    const el = ensureOverlay();
    if (!content || !body || !el) return;
    el.style.left   = body.offsetLeft + 'px';
    el.style.top    = body.offsetTop + 'px';
    el.style.width  = body.offsetWidth + 'px';
    el.style.height = body.offsetHeight + 'px';
}

function paint() {
    const el = ensureOverlay();
    if (!el) return;

    const layers = [];
    const c = _state.columns;
    const r = _state.rows;

    if (c.show) {
        const col = hexToRgba(c.color, Math.max(0, Math.min(100, +c.opacity || 0)) / 100);
        layers.push(bandGradient('to right', col, c.width, c.widthUnit, c.gap, c.gapUnit));
    }
    if (r.show) {
        const col = hexToRgba(r.color, Math.max(0, Math.min(100, +r.opacity || 0)) / 100);
        layers.push(bandGradient('to bottom', col, r.height, r.heightUnit, r.gap, r.gapUnit));
    }

    el.style.backgroundImage = layers.join(', ');
    el.style.display = layers.length ? 'block' : 'none';
    syncGeometry();
}

function applyVisibilityClasses() {
    const canvas = document.getElementById('designerCanvas');
    if (!canvas) return;
    canvas.classList.toggle('hide-ruler', !!_state.rulerHidden);
    canvas.classList.toggle('hide-guides', !!_state.guidesHidden);
}

/** Full re-apply: overlay + ruler/guide classes. */
function apply() {
    ensureCSS();
    applyVisibilityClasses();
    paint();
}

// ── public API ───────────────────────────────────────────────────────────

function mergeSection(key, partial) {
    _state[key] = { ..._state[key], ...(partial || {}) };
    // A real value change means the layout is no longer a named profile;
    // just toggling visibility doesn't count.
    if (Object.keys(partial || {}).some(k => k !== 'show')) _state.profile = 'custom';
    apply();
    save();
}

function applyProfile(key) {
    const preset = GRID_PROFILES[key];
    if (!preset) return;
    _state.profile = key;
    if (preset.columns) _state.columns = { ..._state.columns, ...preset.columns, show: true };
    if (preset.rows)    _state.rows    = { ..._state.rows,    ...preset.rows,    show: true };
    apply();
    save();
}

export function init(app) {
    _state = load();
    ensureCSS();

    const attach = () => {
        if (!document.getElementById('designerCanvasContent')) return false;
        ensureOverlay();
        apply();

        // Re-sync the overlay box whenever device-mode resizes #designerCanvasBody
        // (watch the *body*, per the "hover tag devicemode resize" lesson).
        const body = document.getElementById('designerCanvasBody');
        if (body && 'ResizeObserver' in window) {
            _ro?.disconnect();
            _ro = new ResizeObserver(() => syncGeometry());
            _ro.observe(body);
        }
        return true;
    };

    if (!attach()) {
        // Canvas DOM not up yet — retry on the next frames.
        let tries = 0;
        const t = setInterval(() => { if (attach() || ++tries > 40) clearInterval(t); }, 50);
    }

    // _registerRenderHook is installed by designer_objectmodel.js, which loads
    // in parallel with this module — poll briefly until it's available, then
    // re-sync the overlay box after every canvas-level re-render.
    if (app.designer._registerRenderHook) {
        app.designer._registerRenderHook(syncGeometry);
    } else {
        let hookTries = 0;
        const ht = setInterval(() => {
            if (app.designer._registerRenderHook) {
                app.designer._registerRenderHook(syncGeometry);
                clearInterval(ht);
            } else if (++hookTries > 60) {
                clearInterval(ht);
            }
        }, 50);
    }

    app.designer.grid = {
        getState: () => clone(_state),
        setColumns: (partial) => mergeSection('columns', partial),
        setRows:    (partial) => mergeSection('rows', partial),
        setProfile: (key) => applyProfile(key),
        getProfiles: () => Object.entries(GRID_PROFILES).map(([value, p]) => ({ value, label: p.label })),

        isRulerHidden:  () => !!_state.rulerHidden,
        areGuidesHidden: () => !!_state.guidesHidden,
        toggleRuler:  () => { _state.rulerHidden  = !_state.rulerHidden;  apply(); save(); },
        toggleGuides: () => { _state.guidesHidden = !_state.guidesHidden; apply(); save(); },

        // The full resizable settings window. The quick, inline controls now
        // live in the toolbar itself — see designer_toolbar.js's grid bar,
        // toggled by its ▦ button and by the sidebar "View" icon
        // (app.designer.toolbar.toggleGridBar()), same idiom as the Text tool
        // swapping the toolbar to text-formatting controls.
        openDialog: () => {
            if (app.designer.gridDialog?.open) {
                app.designer.gridDialog.open({ parentId: designerWindowId() });
                return;
            }
            app.includeModule(app.config.local.ProgramRoot + 'designer/designer_grid_dialog.js')
                .then(mod => mod?.init?.(app))
                .then(() => app.designer.gridDialog.open({ parentId: designerWindowId() }));
        },

        _apply: apply
    };
}

function designerWindowId() {
    return document.querySelector('.window.pid-designer')?.id?.replace('-win', '') || 'designer';
}
