/**
 * @file designer/tools/colorpickup.js
 * @description The Color Pickup Tool — one of the Designer Menu's sidebar
 * tools, same shape as `tools/select.js`/`tools/move.js` (gated by
 * `app.designer.activeTool`, broadcasting via `designer_objectmodel.js`'s
 * `'designer-tool-changed'`).
 *
 * The Designer's actual design surface (`#designerCanvasBody`) is a plain
 * DOM div tree (`canvas/renderer.js` builds it via `innerHTML`), not a
 * bitmap `<canvas>` — the only real `<canvas>` elements in this program are
 * the rulers and, now, the Color Picker Window's own Color Map/hue-slider
 * canvases. So this tool is a one-shot action, not a persistent click-to-
 * sample mode over the canvas: activating it immediately invokes the native
 * `window.EyeDropper` (Chromium-only, feature-detected) to sample any
 * on-screen pixel, then reverts to the Cursor tool — the same UX as a real
 * OS eyedropper. `pickFromCanvas()` stays a lower-level utility used
 * internally by `designer_color_picker_window.js`'s own canvases.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * `designer_color_history.js`/`designer_color_element.js`/
 * `designer_color_picker_window.js`.
 *
 * @module program/designer/tools/colorpickup
 */

import { normalizeColor } from '../core/color.js';

function pickFromCanvas(canvasEl, x, y) {
    if (!canvasEl?.getContext) return null;
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width, h = canvasEl.height;
    if (w === 0 || h === 0) return null;
    const px = Math.min(Math.max(Math.round(x), 0), w - 1);
    const py = Math.min(Math.max(Math.round(y), 0), h - 1);
    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    return normalizeColor({ r, g, b, a: a / 255 });
}

/** Hides any active modal-dialog overlay (`sandstorm/components/ui/
 *  window-modal.js`'s `lockWindowLayer` — a dimming `.modal-overlay` div
 *  painted over the parent window while a dialog, e.g. this Color Picker
 *  itself, is open) for the duration of the eyedropper pick. Without this,
 *  EyeDropper samples the overlay's own dim tint instead of the real
 *  content underneath whenever the cursor crosses over the parent window.
 *  Returns a restore() callback — always call it, success or cancel. */
function hideModalOverlays() {
    const overlays = document.querySelectorAll('.modal-overlay');
    const prevVisibility = new Map();
    overlays.forEach(el => {
        prevVisibility.set(el, el.style.visibility);
        el.style.visibility = 'hidden';
    });
    return () => overlays.forEach(el => { el.style.visibility = prevVisibility.get(el) ?? ''; });
}

function pickFromScreen() {
    if (!window.EyeDropper) return Promise.resolve(null);

    const restoreOverlays = hideModalOverlays();
    const eyeDropper = new window.EyeDropper();
    return eyeDropper.open()
        .then(result => {
            restoreOverlays();
            const color = normalizeColor(result.sRGBHex);
            app.designer.colorPickupTool.currentColor = color;
            $(document).trigger('designer-color-picked', [color]);
            return color;
        })
        .catch(() => { restoreOverlays(); return null; });
}

function deactivate() {
    if (app.designer.activeTool === 'colorpicker') app.designer.setActiveTool('select');
}

function activate() {
    app.designer.setActiveTool('colorpicker');
    pickFromScreen()
        .then(color => { if (color) app.designer.sidebarColorGroup?.setPrimary(color, 'eyedropper'); })
        .finally(deactivate);
}

export function init(app) {
    app.designer = app.designer || {};
    app.designer.colorPickupTool = { activate, deactivate, pickFromCanvas, pickFromScreen, currentColor: null };
}
