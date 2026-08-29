/**
 * @file responsivelayout/engine.js
 * @description The window-arranging engine — moved here verbatim from
 * `desktop.js`'s own `responsiveWindows()` (GRID[n] topology table, the n=2/
 * n=3 special cases, mobile single-column stacking, the `rwRect` diff-cache,
 * the `'responsive-modified'` flag). Same algorithm, unchanged.
 *
 * Gated on `api.isAvailable()` (enabled AND valid config — not just "did
 * this module load"):
 *  - **not available** (disabled, or enabled with an invalid config) → the
 *    engine does nothing at all: no auto-arrange, no position/z-index
 *    touching, ever, regardless of viewport width. `checkWindowSize` forces
 *    `newMode = 'desktop'` in this state, which reuses its own existing
 *    restore-to-stored-position logic to clean up anything a previous
 *    arrange pass left behind. `arrangeWindows` itself also hard-gates on
 *    this so an external direct call (`ui/window/menu-body.js:1029` calls
 *    `app.desktop.responsiveArrange()` on its own) can't bypass it.
 *    An earlier version of this fell back to the untouched
 *    `app.config.local.breakpoints` and kept auto-arranging while
 *    "disabled" — confirmed live to cause a real z-index bug (two windows
 *    swapping stacking order around a resize, not reliably restoring) —
 *    replaced with this hard stop per explicit correction.
 *  - **available** → breakpoints come from `api.getConfig().default.
 *    breakpoints`; after `computeTopology`, any window whose program id has
 *    a saved rect in `api.getResponsiveLayout(currentUserId, tier).rects`
 *    for the resolved tier gets that exact rect substituted before
 *    `fitWindow`/`apply`.
 *
 * Exposes `init(app)` → sets `app.desktop.responsiveWindows`/
 * `responsiveArrange` (same public names `desktop.js` already exposed, so
 * `ui/window/dragresize.js:733` and `ui/window/menu-body.js:1029`'s existing
 * calls don't need to change).
 *
 * @module components/responsivelayout/engine
 */

export function init(app) {
    let currentMode = null;

    function api() { return app.responsiveLayout?.api; }

    // ── Grid topology table: explicit layout for n=1..9, sqrt for n≥10
    const GRID = [
        /*0*/ null,
        /*1*/ { cols: 1, rows: 1 },
        /*2*/ { cols: 2, rows: 1 },
        /*3*/ { cols: 2, rows: 2 }, // active expands into full left column
        /*4*/ { cols: 2, rows: 2 },
        /*5*/ { cols: 3, rows: 2 },
        /*6*/ { cols: 3, rows: 2 },
        /*7*/ { cols: 3, rows: 3 },
        /*8*/ { cols: 3, rows: 3 },
        /*9*/ { cols: 3, rows: 3 },
    ];

    function getWindowInfoFromElement($element) {
        let windowId = null;
        let programId = null;
        let classList = $element.attr('class').split(' ');
        for (let className of classList) {
            if (className.startsWith('pid-')) {
                programId = className.replace('pid-', '');
                let elementId = $element.attr('id');
                if (elementId) {
                    windowId = elementId.replace('-win', '');
                    break;
                }
            }
        }
        if (programId === 'sandstormscomponents') {
            return null;
        }
        if (programId && windowId) {
            try {
                return app.program.getWindowInfo(programId, windowId);
            } catch (error) {
                console.warn('Could not retrieve window info for:', programId, windowId, error);
                return null;
            }
        }
        return null;
    }

    function programIdOf($element) {
        const classList = ($element.attr('class') || '').split(' ');
        for (const className of classList) {
            if (className.startsWith('pid-') && className !== 'pid-sandstormscomponents') return className.replace('pid-', '');
        }
        return null;
    }

    function getActiveWindowId(windows) {
        const w = windows.find(w => w.isActive);
        return w ? w.id : null;
    }

    function sortKey(w) {
        return (w.priority * 1e8) + (w.isActive ? 1e6 : 0) + w.zIndex;
    }

    // Effective breakpoints for THIS arrange pass. Only ever consulted while
    // available (see arrangeWindows/checkWindowSize's own gating) — the
    // app.config.local.breakpoints fallback here just covers the harmless
    // boot-time log line below, not any real arrange decision.
    function activeBreakpoints() {
        if (api()?.isAvailable()) return api().getSystemDefaultLayout().breakpoints;
        return app.config.local.breakpoints;
    }

    // Per-tier max column cap — only ever consulted while available (see
    // arrangeWindows' own gate). A tier whose own columnsEnabled flag is off
    // is reported as undefined here (not its stored number),
    // so computeTopology's existing Number.isFinite(maxCols) check skips
    // capping that tier — the number itself is preserved in config for
    // whenever it's re-enabled, just not applied while off.
    function activeColumns() {
        if (!api()?.isAvailable()) return null;
        const { columns, columnsEnabled } = api().getSystemDefaultLayout();
        const effective = {};
        Object.keys(columns || {}).forEach(tier => {
            effective[tier] = columnsEnabled?.[tier] ? columns[tier] : undefined;
        });
        return effective;
    }

    function computeTopology(windows, ws, breakpoints, columns) {
        const n = windows.length;
        if (n === 0) return;

        if (ws.width <= breakpoints.mobile) {
            const cellH = ws.height / n;
            const sorted = [...windows].sort((a, b) => sortKey(b) - sortKey(a));
            sorted.forEach((w, i) => {
                w.cellRect = { x: ws.x, y: ws.y + i * cellH, width: ws.width, height: cellH };
            });
            app.desktop._rwLayoutState = null;
            return;
        }

        const activeId = getActiveWindowId(windows);
        const curIds   = windows.map(w => w.id);
        const prev     = app.desktop._rwLayoutState;
        const sameSet  = prev &&
            prev.ids.length === curIds.length &&
            curIds.every(id => prev.ids.includes(id)) &&
            prev.activeId === activeId;

        let cols, rows, slotMap;
        if (sameSet) {
            ({ cols, rows, slotMap } = prev);
        } else {
            const g = GRID[n] || (() => {
                const c = Math.ceil(Math.sqrt(n));
                return { cols: c, rows: Math.ceil(n / c) };
            })();
            cols = g.cols;
            rows = g.rows;

            if (n >= 4 && columns) {
                const tier = api()?.resolveTier?.(ws.width, breakpoints) ?? 'desktop';
                const maxCols = columns[tier];
                if (Number.isFinite(maxCols) && maxCols >= 1 && cols > maxCols) {
                    cols = maxCols;
                    rows = Math.ceil(n / cols);
                }
            }

            const sorted = [...windows].sort((a, b) => sortKey(b) - sortKey(a));
            slotMap = {};
            sorted.forEach((w, i) => {
                slotMap[w.id] = { col: i % cols, row: Math.floor(i / cols), colSpan: 1, rowSpan: 1 };
            });
        }

        if (n === 2) {
            const [w1, w2] = [...windows].sort((a, b) => sortKey(b) - sortKey(a));
            const totalW = w1.natural.width + w2.natural.width;
            let ratio = totalW > 0 ? w1.natural.width / totalW : 0.5;
            ratio = Math.max(0.2, Math.min(0.8, ratio));
            const width1 = Math.floor(ws.width * ratio);
            const h      = Math.min(Math.max(w1.natural.height, w2.natural.height), ws.height);
            windows.find(w => w.id === w1.id).cellRect = { x: ws.x,          y: ws.y, width: width1,            h };
            windows.find(w => w.id === w2.id).cellRect = { x: ws.x + width1, y: ws.y, width: ws.width - width1, h };
            windows.forEach(w => { if (w.cellRect && w.cellRect.h !== undefined) { w.cellRect.height = w.cellRect.h; delete w.cellRect.h; } });
            app.desktop._rwLayoutState = { ids: curIds, activeId, cols: 2, rows: 1, slotMap };
            return;
        }

        if (n === 3 && activeId) {
            const activeSlot = slotMap[activeId];
            if (activeSlot && activeSlot.col !== 0) {
                const col0Win = windows.find(w => slotMap[w.id] && slotMap[w.id].col === 0 && slotMap[w.id].row === 0);
                if (col0Win) {
                    const tmp = { ...slotMap[col0Win.id] };
                    slotMap[col0Win.id] = { ...slotMap[activeId] };
                    slotMap[activeId]   = tmp;
                }
            }
            slotMap[activeId] = { col: 0, row: 0, colSpan: 1, rowSpan: 2 };
            const others = windows.filter(w => w.id !== activeId).sort((a, b) => sortKey(b) - sortKey(a));
            if (others[0]) slotMap[others[0].id] = { col: 1, row: 0, colSpan: 1, rowSpan: 1 };
            if (others[1]) slotMap[others[1].id] = { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
        }

        const cellW = ws.width  / cols;
        const cellH = ws.height / rows;
        windows.forEach(w => {
            const s = slotMap[w.id] || { col: 0, row: 0, colSpan: 1, rowSpan: 1 };
            w.cellRect = {
                x:      ws.x + s.col * cellW,
                y:      ws.y + s.row * cellH,
                width:  cellW * s.colSpan,
                height: cellH * s.rowSpan
            };
        });

        if (activeId) {
            const activeWin = windows.find(w => w.id === activeId);
            if (activeWin && activeWin.cellRect) {
                windows.forEach(w => {
                    if (w.id !== activeId && w.cellRect.width < w.minW) {
                        w.cellRect    = { ...activeWin.cellRect };
                        w.stackBehind = true;
                    }
                });
            }
        }

        app.desktop._rwLayoutState = { ids: curIds, activeId, cols, rows, slotMap };
    }

    function fitWindow(natural, cell, minW) {
        const NUDGE = 20;
        const ovX = natural.width  - cell.width;
        const ovY = natural.height - cell.height;
        const cx  = cell.x + Math.max(0, (cell.width  - natural.width)  / 2);
        const cy  = cell.y + Math.max(0, (cell.height - natural.height) / 2);
        if (ovX <= 0 && ovY <= 0) return { x: cx, y: cy, width: natural.width, height: natural.height };
        if (ovX > 0 && ovX <= NUDGE && ovY <= 0) return { x: cell.x + cell.width  - natural.width,  y: cy,                                   width: natural.width,  height: natural.height };
        if (ovY > 0 && ovY <= NUDGE && ovX <= 0) return { x: cx,                                     y: cell.y + cell.height - natural.height, width: natural.width,  height: natural.height };
        return { x: cell.x, y: cell.y, width: Math.max(minW, Math.min(natural.width, cell.width)), height: Math.max(60, Math.min(natural.height, cell.height)) };
    }

    function apply(windows, rects) {
        const DELTA = 2;
        windows.forEach((w, i) => {
            const d = rects[i];
            const p = w.$el.data('rwRect');
            const changed = !p ||
                Math.abs(d.x      - p.x)      > DELTA ||
                Math.abs(d.y      - p.y)      > DELTA ||
                Math.abs(d.width  - p.width)  > DELTA ||
                Math.abs(d.height - p.height) > DELTA;
            if (changed) {
                w.$el.css({ position: 'fixed', left: d.x + 'px', top: d.y + 'px', width: d.width + 'px', height: d.height + 'px', zIndex: d.zIndex });
                w.$el.data('responsive-modified', true);
                w.$el.data('rwRect', { x: d.x, y: d.y, width: d.width, height: d.height });
            } else if (w.stackBehind) {
                w.$el.css({ zIndex: d.zIndex });
            }
        });
    }

    // Substitutes a saved rect (from a user's own layout, else the system
    // default, for the resolved tier) over a window's algorithmically
    // computed cellRect, when that window's program has one. Anything
    // without a saved rect keeps its auto-computed cell untouched.
    function applySavedOverrides(windows, ws) {
        const a = api();
        if (!a || !a.isAvailable()) return;
        const breakpoints = a.getSystemDefaultLayout().breakpoints;
        const tier = a.resolveTier(ws.width, breakpoints);
        const { rects } = a.getResponsiveLayout(a.getCurrentUserId(), tier);
        if (!rects || !Object.keys(rects).length) return;

        windows.forEach(w => {
            const progId = programIdOf(w.$el);
            const saved = progId && rects[progId];
            if (saved) {
                w.cellRect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
                w.savedOverride = true;
            }
        });
    }

    function arrangeWindows() {
        if (!api()?.isAvailable()) return;

        const ws = app.desktop.getWorkspaceRect();

        let excludedMaxZ = 0; // maximized windows — zFloor starts ABOVE this (see comment below)
        let lockedMaxZ   = 0; // locked modal dialog/parent pairs — arranged windows must stay BELOW this
        $('.window:visible.maximized').each((_, el) => {
            const z = parseInt(el.style.zIndex, 10) || 0;
            if (z > excludedMaxZ) excludedMaxZ = z;
        });
        const $wins = $('.window:visible:not(.ui-resizable-resizing):not(.ui-draggable-dragging):not(.maximized)')
            .filter((_, el) => {
                if (!app.windows || typeof app.windows.getWindowState !== 'function') return true;
                const id    = el.id.replace(/-win$/, '');
                const state = app.windows.getWindowState(id);
                const locked = state.mode === 'dialog' || state.dialogOpen;
                if (locked) {
                    const z = parseInt(el.style.zIndex, 10) || 0;
                    if (z > lockedMaxZ) lockedMaxZ = z;
                }
                return !locked;
            });
        if ($wins.length === 0) return;

        const windows = $wins.toArray().map(el => {
            const $el  = $(el);
            const info = getWindowInfoFromElement($el);
            return {
                $el,
                id:          $el.attr('id'),
                natural:     { width: info ? info.width : $el.outerWidth(), height: info ? info.height : $el.outerHeight() },
                minW:        parseInt($el.data('minWidth'),      10) || 240,
                priority:    parseInt($el.data('layoutPriority'), 10) || 0,
                isActive:    $el.hasClass('active'),
                zIndex:      parseInt($el.css('z-index'),        10) || 0,
                stackBehind: false,
                cellRect:    null
            };
        });

        const breakpoints = activeBreakpoints();
        const columns = activeColumns();
        computeTopology(windows, ws, breakpoints, columns);
        applySavedOverrides(windows, ws);

        const activeId = getActiveWindowId(windows);
        let zFloor = Math.max(1001, excludedMaxZ + 1);

        if (lockedMaxZ) {
            const ceiling = zFloor + windows.length + 1;
            if (ceiling >= lockedMaxZ) zFloor -= (ceiling - lockedMaxZ + 1);
        }

        let bgZ = zFloor;
        const rects = windows.map((w, i) => {
            const rect   = w.savedOverride ? w.cellRect : fitWindow(w.natural, w.cellRect, w.minW);
            const zIndex = w.id === activeId ? zFloor + windows.length + 1 : w.stackBehind ? zFloor - 2 - i : bgZ--;
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, zIndex };
        });

        apply(windows, rects);
    }

    function checkWindowSize() {
        const width = window.innerWidth;
        let newMode;
        if (!api()?.isAvailable()) {
            newMode = 'desktop';
        } else {
            const breakpoints = activeBreakpoints();
            if (width <= breakpoints.mobile)  newMode = 'mobile';
            else if (width <= breakpoints.tablet) newMode = 'tablet';
            else                    newMode = 'desktop';
        }

        if (newMode !== currentMode) {
            app.dev.log(`Breakpoint: ${currentMode} → ${newMode} (width=${width}px)`, "Desktop");
            if (newMode === 'desktop') {
                $('.window:visible').each(function () {
                    const $win = $(this);
                    if ($win.data('responsive-modified')) {
                        const windowInfo = getWindowInfoFromElement($win);
                        $win.css({ position: 'absolute', left: '', top: '', width: '', height: '', zIndex: '' });
                        if (windowInfo) {
                            $win.css({ position: 'absolute', width: windowInfo.width + 'px', height: windowInfo.height + 'px', left: windowInfo.x + 'px', top: windowInfo.y + 'px', zIndex: windowInfo.zindex });
                        }
                        $win.removeData('responsive-modified');
                        $win.removeData('rwRect');
                    }
                });
                app.desktop._rwLayoutState = null;
                if (typeof this.adjust === 'function') this.adjust();
            } else {
                arrangeWindows();
            }
            currentMode = newMode;
        } else if (newMode !== 'desktop') {
            arrangeWindows();
        }
    }

    const boundCheckWindowSize = checkWindowSize.bind(app.desktop);

    const _bp = activeBreakpoints();
    app.dev.log(`Breakpoints: mobile≤${_bp.mobile}px, tablet≤${_bp.tablet}px`, "Desktop");

    boundCheckWindowSize();

    if (!app.desktop._rwInit) {
        app.desktop._rwInit = true;

        window.addEventListener("resize", boundCheckWindowSize);

        const observer = new MutationObserver((mutations) => {
            let windowsChanged = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && (node.classList.contains('window') || node.querySelector('.window'))) {
                            windowsChanged = true;
                        }
                    });

                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === 1 && (node.classList.contains('window') || node.querySelector('.window'))) {
                            windowsChanged = true;
                        }
                    });
                }
            });

            if (windowsChanged && currentMode !== 'desktop') {
                setTimeout(() => arrangeWindows(), 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    app.desktop.responsiveArrange = arrangeWindows;
    app.responsiveLayout = app.responsiveLayout || {};
    app.responsiveLayout.engine = { arrangeWindows, resolveCurrentTier: () => api()?.resolveTier(window.innerWidth, activeBreakpoints()) };
}
