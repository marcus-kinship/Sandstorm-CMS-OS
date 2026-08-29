/**
 * @file designer/designer_color_element.js
 * @description ColorElementView (a single color swatch) and ColorGroupView
 * (a primary/secondary swatch pair with quick-swap), for use by Properties-
 * style panels or any other Designer UI that needs to show/edit a color.
 *
 * Unlike `app.designer.dock`/`menu`/`selection` (one dock, one menu, one
 * selection per window — singleton registries), swatches are inherently
 * multi-instance, so `colorElement`/`colorGroup` are **factories**:
 * `create(options)` returns a fresh `{el, ...}` instance each call, not a
 * shared registry.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * `designer_color_history.js` (not a hard dependency here, but keeps load
 * order consistent with the rest of the color system) and before
 * `designer_color_picker_window.js` (which itself doesn't depend on this
 * file, but a swatch's default click handler calls `app.designer.colorPicker`,
 * so that module needs to exist by the time a user actually clicks one —
 * true by the time `designer.js`'s full chain finishes).
 *
 * @module program/designer/designer_color_element
 */

import { normalizeColor, rgbaString } from './core/color.js';

function injectCSS() {
    if (document.getElementById('designer-color-element-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-color-element-style';
    style.textContent = `
        .designer-color-element { position: relative; display: inline-block; padding: 0; border: none; cursor: default; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3); overflow: hidden; }
        .designer-color-element:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7); }
        .designer-color-element-checker,
        .designer-color-element-fill { position: absolute; inset: 0; }
        .designer-color-element-checker {
            background-image:
                linear-gradient(45deg, #999 25%, transparent 25%), linear-gradient(-45deg, #999 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #999 75%), linear-gradient(-45deg, transparent 75%, #999 75%);
            background-size: 8px 8px;
            background-position: 0 0, 0 4px, 4px -4px, -4px 0;
            background-color: #ccc;
        }
        .designer-color-group-row { display: inline-flex; align-items: center; gap: 6px; }
        .designer-color-group-row .designer-color-group-secondary { margin-top: 8px; }
        .designer-color-group-primary { z-index: 2;    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29; }
        .designer-color-group-secondary { z-index: 1;    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29; }
        .designer-color-group-swap { background: none; border: none; color: rgba(255,255,255,0.7); cursor: default; font-size: 14px; line-height: 1; padding: 2px; }
        .designer-color-group-swap:hover { color: #fff; }

        .designer-color-group-stacked { position: relative; width: 30px; height: 30px; display: block; }
        .designer-color-group-stacked .designer-color-group-primary { position: absolute; top: 0; left: 0; margin: 0; z-index: 3; }
        .designer-color-group-stacked .designer-color-group-secondary { position: absolute; bottom: 0; right: 0; margin: 0; z-index: 2; }
        .designer-color-group-stacked .designer-color-group-swap {
            position: absolute; top: 0px; right: 0px; width: 11px; height: 9px; z-index: 4;
            background: rgba(0,0,0,0.5);  font-size: 9px;  padding: 0;
        }
        .designer-color-group-reset {
            position: absolute; bottom: 0px; left: 0px; width: 10px; height: 10px; z-index: 1;
            background: linear-gradient(135deg, #000 50%, #fff 50%); border: 1px solid rgba(0,0,0,0.4);
            cursor: default; padding: 0;
        }
        .designer-color-group-reset:hover { border-color: rgba(255,255,255,0.6); }
    `;
    document.head.appendChild(style);
}

/**
 * @param {Object} [options]
 * @param {string|{r,g,b,a}} [options.color='#000000']
 * @param {number|string} [options.width=24]
 * @param {number|string} [options.height=24]
 * @param {string} [options.className]
 * @param {string} [options.id]
 * @param {function(Event, {r,g,b,a,hex}):void} [options.onClick] - Overrides
 *   only the default "open the Color Picker" behavior; `setColor()` still
 *   fires `designer-color-changed` however it ends up being called, so
 *   composed views (ColorGroupView) stay in sync regardless of which path
 *   changed a swatch.
 * @returns {{el:HTMLElement, setColor:function, getColor:function, destroy:function}}
 */
function create(options = {}) {
    const { width = 24, height = 24, className = '', id, onClick } = options;
    let current = normalizeColor(options.color ?? '#000000');

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `designer-color-element ${className}`.trim();
    if (id) el.id = id;
    el.style.width  = typeof width === 'number' ? `${width}px` : width;
    el.style.height = typeof height === 'number' ? `${height}px` : height;

    const checker = document.createElement('span');
    checker.className = 'designer-color-element-checker';
    const fill = document.createElement('span');
    fill.className = 'designer-color-element-fill';
    el.append(checker, fill);

    function paint() {
        fill.style.backgroundColor = rgbaString(current);
    }
    paint();

    function getColor() {
        return { ...current };
    }

    function setColor(next, source = 'api') {
        current = normalizeColor(next);
        paint();
        $(document).trigger('designer-color-changed', [{ color: getColor(), source, id }]);
    }

    function handleClick(e) {
        if (typeof onClick === 'function') { onClick(e, getColor()); return; }
        app.designer.colorPicker?.open({ elementId: id, color: current })
            .then(result => { if (result) setColor(result, 'picker'); });
    }
    el.addEventListener('click', handleClick);

    function destroy() {
        el.removeEventListener('click', handleClick);
        el.remove();
    }

    return { el, setColor, getColor, destroy };
}

/**
 * @param {Object} [options]
 * @param {string|{r,g,b,a}} [options.primary='#000000']
 * @param {string|{r,g,b,a}} [options.secondary='#ffffff']
 * @param {string|{r,g,b,a}} [options.defaultPrimary='#000000'] - What `reset()` restores.
 * @param {string|{r,g,b,a}} [options.defaultSecondary='#ffffff']
 * @param {'row'|'stacked'} [options.layout='row'] - `'stacked'` is the
 *   compact overlapping-squares widget (Photoshop's toolbox foreground/
 *   background swatches) meant for a narrow sidebar column; `'row'` is the
 *   wider side-by-side layout for panels with more horizontal room. Only
 *   `'stacked'` gets the reset-to-defaults corner icon — `'row'` has room
 *   for a real "Reset" control instead if a caller wants one.
 * @returns {{el:HTMLElement, swap:function, reset:function, getPrimary:function, getSecondary:function, setPrimary:function, setSecondary:function, destroy:function}}
 */
function createGroup(options = {}) {
    const layout = options.layout === 'stacked' ? 'stacked' : 'row';
    const defaultPrimary   = options.defaultPrimary   ?? '#000000';
    const defaultSecondary = options.defaultSecondary ?? '#ffffff';
    const swatchSize = layout === 'stacked' ? 16 : 28;

    const primaryView   = create({ color: options.primary   ?? defaultPrimary,   width: swatchSize, height: swatchSize, className: 'designer-color-group-primary' });
    const secondaryView = create({ color: options.secondary ?? defaultSecondary, width: swatchSize, height: swatchSize, className: 'designer-color-group-secondary' });

    const el = document.createElement('div');
    el.className = `designer-color-group designer-color-group-${layout}`;

    const swapBtn = document.createElement('button');
    swapBtn.type = 'button';
    swapBtn.className = 'designer-color-group-swap';
    swapBtn.title = _('Swap colors');
    swapBtn.textContent = '⇄';

    el.append(primaryView.el, swapBtn, secondaryView.el);

    let resetBtn = null;
    if (layout === 'stacked') {
        resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'designer-color-group-reset';
        resetBtn.title = _('Reset colors');
        el.appendChild(resetBtn);
    }

    function swap() {
        const p = primaryView.getColor();
        const s = secondaryView.getColor();
        primaryView.setColor(s, 'swap');
        secondaryView.setColor(p, 'swap');
        $(document).trigger('designer-color-swap', [{ primary: primaryView.getColor(), secondary: secondaryView.getColor() }]);
    }
    swapBtn.addEventListener('click', swap);

    function reset() {
        primaryView.setColor(defaultPrimary, 'reset');
        secondaryView.setColor(defaultSecondary, 'reset');
        $(document).trigger('designer-color-reset', [{ primary: primaryView.getColor(), secondary: secondaryView.getColor() }]);
    }
    resetBtn?.addEventListener('click', reset);

    function destroy() {
        swapBtn.removeEventListener('click', swap);
        resetBtn?.removeEventListener('click', reset);
        primaryView.destroy();
        secondaryView.destroy();
        el.remove();
    }

    return {
        el, swap, reset,
        getPrimary: primaryView.getColor, getSecondary: secondaryView.getColor,
        setPrimary: (c, source) => primaryView.setColor(c, source),
        setSecondary: (c, source) => secondaryView.setColor(c, source),
        destroy
    };
}

export function init(app) {
    injectCSS();

    app.designer = app.designer || {};
    app.designer.colorElement = { create };
    app.designer.colorGroup   = { create: createGroup };
}
