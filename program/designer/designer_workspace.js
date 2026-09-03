/**
 * @file designer/designer_workspace.js
 * @description Show/hide + collapse state for the Designer's two sidebars —
 * the "Workspace layout" the View menu drives.
 *
 * State model (only the three fields below are persisted — one localStorage
 * key, same pattern as `designer_grid.js`):
 *   { leftHidden, rightHidden, rightCollapsed }
 *
 * `rightHidden` and `rightCollapsed` are INDEPENDENT: `toggleRight()` only
 * flips `rightHidden`, never touching the collapse state, so
 * `collapsed → hide → show` lands back on collapsed and
 * `expanded → hide → show` lands back on expanded.
 *
 * On top of the manual state there is a RESPONSIVE rule keyed to the Designer
 * window's own width (a ResizeObserver on the window root, NOT the browser
 * viewport — the window is often not maximised):
 *   - > 1024px : the manual state
 *   - ≤ 1024px : right dock forced collapsed
 *   - ≤ 450px  : right dock forced hidden
 * Breakpoint transitions never write to localStorage — resizing back up
 * restores the user's saved choice exactly.
 *
 * The actual collapsed-vs-expanded rendering lives in `designer_dock.js`
 * (`setCollapsed`/`isCollapsed`/`closeFlyout`); this module only computes the
 * effective state and calls into it with `{ silent:true }`. The dock's
 * `designer-dock-collapsed` event fires ONLY from its own header button, so
 * the listener here only ever runs for a genuine user toggle.
 *
 * Loaded last in `designer.js`'s dock chain (needs `app.designer.dock`).
 *
 * @module program/designer/designer_workspace
 */

const STORAGE_KEY = 'sandstorm.designer.workspace';

const COLLAPSE_BP = 1024;
const HIDE_BP = 450;

const DEFAULTS = { leftHidden: false, rightHidden: false, rightCollapsed: false };

let _state = null;
let _ro = null;

function load() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            leftHidden:     !!parsed.leftHidden,
            rightHidden:    !!parsed.rightHidden,
            rightCollapsed: !!parsed.rightCollapsed
        };
    } catch (error) {
        console.warn('[designer_workspace] localStorage load failed:', error);
        return { ...DEFAULTS };
    }
}

function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
    catch (error) { console.warn('[designer_workspace] localStorage save failed:', error); }
}

// The Designer window's current content width (falls back to viewport).
function winWidth() {
    const el = window.app.designer.win?.el?.[0] || document.querySelector('.window.pid-designer');
    return el ? el.getBoundingClientRect().width : window.innerWidth;
}

/** What the current width, on its own, is forcing — read by the dock header. */
function forced() {
    const w = winWidth();
    return { hidden: w <= HIDE_BP, collapsed: w > HIDE_BP && w <= COLLAPSE_BP };
}

function effectiveRightHidden()    { return _state.rightHidden || winWidth() <= HIDE_BP; }
function effectiveRightCollapsed() {
    return !effectiveRightHidden() && (_state.rightCollapsed || winWidth() <= COLLAPSE_BP);
}

// Hide via a class, not `style.display` — the template sets `display:flex` on
// #designerProperties inline, and clearing it with `style.display=''` would
// leave it `block` and break panel stacking. Collapsing to `width:0` +
// `overflow:hidden` (rather than `display:none`) also keeps the change
// animatable — the width/flex-basis transitions on the two columns do the
// rest. #designerSidebar already has an inline `transition: width 150ms` so
// only #designerProperties (via designer_dock.js) needed its own.
function ensureCSS() {
    if (document.getElementById('designer-workspace-style')) return;
    const s = document.createElement('style');
    s.id = 'designer-workspace-style';
    s.textContent = `
        #designerSidebar.designer-ws-hidden,
        #designerProperties.designer-ws-hidden {
            width: 0 !important; min-width: 0 !important;
            overflow: hidden !important; border: 0 !important;
        }
    `;
    document.head.appendChild(s);
}

function applyLeft() {
    document.getElementById('designerSidebar')?.classList.toggle('designer-ws-hidden', _state.leftHidden);
}

function applyRight() {
    const hidden = effectiveRightHidden();
    document.getElementById('designerProperties')?.classList.toggle('designer-ws-hidden', hidden);

    // Drive the dock's own render (idempotent; silent so it never loops back
    // into the collapse listener / a save).
    window.app.designer.dock?.setCollapsed?.(effectiveRightCollapsed(), { silent: true });

    if (hidden) window.app.designer.dock?.closeFlyout?.();
}

function apply() { ensureCSS(); applyLeft(); applyRight(); }

// ── public API ───────────────────────────────────────────────────────────

function toggleLeft() {
    _state.leftHidden = !_state.leftHidden;
    applyLeft();
    save();
}

// Only ever flips rightHidden — the collapse state is left exactly as it was.
function toggleRight() {
    _state.rightHidden = !_state.rightHidden;
    applyRight();
    save();
}

export function init(app) {
    if (!document.getElementById('designerProperties')) return;

    _state = load();
    apply();

    // The dock header button is the ONLY source of this event (silent calls
    // above don't fire it) → this only runs on a real user collapse/expand.
    $(document).on('designer-dock-collapsed', (_e, isCollapsed) => {
        _state.rightCollapsed = !!isCollapsed;
        save();
    });

    // Re-apply the effective (manual + responsive) state whenever the Designer
    // window changes size. `applyRight()` is cheap + idempotent, so this is a
    // leading-edge throttle (not a debounce): it adapts *progressively* while
    // the window animates/drags across a breakpoint instead of only settling
    // ~half a second after it stops. `setCollapsed` no-ops unless the state
    // actually flips, so the in-between ticks cost nothing.
    const target = app.designer.win?.el?.[0] || document.querySelector('.window.pid-designer');
    if (target && 'ResizeObserver' in window) {
        let last = 0, trailing = null;
        const tick = () => { last = Date.now(); applyRight(); };
        _ro = new ResizeObserver(() => {
            const now = Date.now();
            if (now - last >= 60) { tick(); }
            else { clearTimeout(trailing); trailing = setTimeout(tick, 60); }
        });
        _ro.observe(target);
    }

    app.designer.workspace = {
        toggleLeft,
        toggleRight,
        isLeftHidden:  () => !!_state.leftHidden,
        isRightHidden: () => !!_state.rightHidden,
        getState: () => ({ ..._state }),
        _forced: forced
    };
}
