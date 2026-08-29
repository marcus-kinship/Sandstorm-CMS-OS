/**
 * @file designer/designer_color_picker_window.js
 * @description The Color Picker Window — a modal dialog styled with the OS's
 * own native component classes (`.aero-button`, `.def` inputs, `.h1`/`.p`/
 * `.line`/`.cp-*` typography from `controlpanel/tabs.css`, radio.js's
 * `.ss-radio-label`/`.ss-radio-indicator`/`.after`/pulse contract) instead of
 * bespoke CSS, laid out to match Photoshop's advanced picker: a 2D map +
 * vertical axis slider, New/Current comparison swatches, radio-selectable
 * HSB/Lab value rows that actually remap what the map/slider represent,
 * plain RGB/CMYK rows, a Hex field, and a web-safe-colors toggle.
 * `app.designer.colorPicker.open({elementId, color}) →
 * Promise<{r,g,b,a,hex}|undefined>` (undefined = cancelled).
 *
 * `app.ui.radio` is NOT boot-loaded — see its own source
 * (`sandstorm/components/ui/radio.js`) and real call sites
 * (`controlpanel/programs/users.js:664-665`): the caller must
 * `app.includeModule(...)` then call `mod.setup(app)` itself. `init(app)`
 * below kicks that off once; `open()` awaits it so the dialog's markup never
 * renders before `app.ui.radio` exists. The per-channel radio buttons are
 * hand-built using radio.js's own `.ss-radio-label`/`.ss-radio-indicator`/
 * `.after`/`data-radio-name`/`data-radio-value` contract (confirmed against
 * `radio.js`'s source) rather than via `app.ui.radio()`'s HTML-string
 * generator — that function always lays items out in one horizontal
 * `.ss-radio-group` row, which doesn't fit a compact "radio + label + input
 * + unit" value-row grid. `app.ui.radio.bind()`/`.getValue()` still work on
 * hand-built markup since they only look for those classes/attributes, not
 * for HTML produced by `app.ui.radio()` itself. The "Web colors only"
 * toggle reuses the same `.ss-radio-indicator`/`.after`/pulse classes for
 * visual consistency, but isn't part of any `app.ui.radio()` group — it's a
 * single on/off control, driven by its own click handler rather than
 * `app.ui.radio.bind()` (which would otherwise also pick it up, since that
 * function's own click handling only avoids `.ss-radio-label`, which this
 * toggle deliberately doesn't use).
 *
 * Dialog lifecycle (pending descriptor + `state.close` as the single
 * resolution point, `setTimeout(0)` before `openDialog`, reusing the
 * registered `'designer'` program id) is unchanged from the original
 * version of this file — only `renderHTML`/`wireDialog`'s internals changed.
 *
 * Color model: a single canonical `{r,g,b}` (0-255 each) plus a separate
 * `alpha` (0-1) is the one source of truth. Every input path — map/slider
 * drag, any text field edit, the eyedropper, a history-strip click, "New"/
 * "Current" — converts to `{r,g,b}` and calls `applyRGB()`, which redraws
 * the map/slider and re-derives every other field fresh from that RGB.
 * Nothing keeps parallel HSB/Lab state that could drift out of sync.
 *
 * Axis remap (`axisMode`): one of `'h'|'s'|'v'` (HSB group) or `'l'|'la'|'lb'`
 * (Lab group — named to avoid clashing with alpha `a`). Selecting a radio
 * changes which of the 6 channels is the vertical slider and which two are
 * the 2D map's x/y — exactly like Photoshop's own picker. Dragging either
 * the map or the slider just samples the actual rendered pixel via
 * `app.designer.colorPickupTool.pickFromCanvas()` and applies it directly —
 * since the map/slider are drawn to show "what the color would be at this
 * point," the sampled pixel already *is* the answer, no inverse math needed
 * on the apply side (only the forward per-mode draw functions and the
 * marker-position fractions need mode-specific math).
 *
 * @module program/designer/designer_color_picker_window
 */

import {
    normalizeColor, rgbaString, rgbToHsv, hsvToRgb,
    rgbToLab, labToRgb, rgbToCmyk, cmykToRgb, nearestWebSafeRgb
} from './core/color.js';

const MAP_SIZE = 200;
const SLIDER_W = 18;

const HSB_META = { h: { label: 'N', unit: '°' }, s: { label: 'M', unit: '%' }, v: { label: 'I', unit: '%' } };
const LAB_META = { l: { label: 'L', unit: '' }, la: { label: 'a', unit: '' }, lb: { label: 'b', unit: '' } };

let _pending = null;
let _uiReady = null;

function dpr() { return window.devicePixelRatio || 1; }

function sizeCanvas(canvas, cssW, cssH) {
    const d = dpr();
    canvas.width  = cssW * d;
    canvas.height = cssH * d;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
}

// ── Drawing ──────────────────────────────────────────────────────────────

/** Fast path for the default H-mode map: hue is fixed, S/V is a closed-form
 *  white-gradient × black-gradient composition — no need to pay the
 *  per-pixel cost the other 5 modes require. */
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

/** The other 5 modes need true per-pixel color (hue varies non-linearly
 *  across the map, or Lab's a/b plane needs gamut-clamped conversion). */
function drawMapGeneric(canvas, computeRGB) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let py = 0; py < h; py++) {
        const yFrac = py / (h - 1);
        for (let px = 0; px < w; px++) {
            const rgb = computeRGB(px / (w - 1), yFrac);
            const i = (py * w + px) * 4;
            data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b; data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}

/** A 1D strip never needs per-pixel accuracy — a handful of gradient stops
 *  looks smooth regardless of mode. */
function drawSliderGeneric(canvas, computeRGB) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const STOPS = 16;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= STOPS; i++) {
        const frac = i / STOPS;
        const rgb = computeRGB(frac);
        grad.addColorStop(frac, `rgb(${rgb.r},${rgb.g},${rgb.b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

// ── Axis-remap engine ───────────────────────────────────────────────────
// hsv: {h:0-360, s:0-1, v:0-1}. lab: {l:0-100, a:-128..127, b:-128..127}.
// Map y and slider fractions follow one convention throughout: 0 = the
// "top"/"start" of that axis's range, matching how drawSliderGeneric builds
// its gradient (stop 0 = canvas y=0) and how the map's y=0 row is drawn first.

function labAxisFrac(v) { return Math.min(1, Math.max(0, (v + 128) / 255)); }
function labAxisFromFrac(f) { return f * 255 - 128; }

function mapComputeRGB(mode, hsv, lab) {
    switch (mode) {
        case 's': return (x, y) => hsvToRgb({ h: x * 360, s: hsv.s, v: 1 - y });
        case 'v': return (x, y) => hsvToRgb({ h: x * 360, s: 1 - y, v: hsv.v });
        case 'l': return (x, y) => labToRgb({ l: lab.l, a: labAxisFromFrac(x), b: labAxisFromFrac(1 - y) });
        case 'la': return (x, y) => labToRgb({ l: x * 100, a: lab.a, b: labAxisFromFrac(1 - y) });
        case 'lb': return (x, y) => labToRgb({ l: x * 100, a: labAxisFromFrac(1 - y), b: lab.b });
        default: return () => ({ r: 0, g: 0, b: 0 }); // 'h' uses drawMapHue instead
    }
}

function sliderComputeRGB(mode, hsv, lab) {
    switch (mode) {
        case 'h': return frac => hsvToRgb({ h: frac * 360, s: 1, v: 1 });
        case 's': return frac => hsvToRgb({ h: hsv.h, s: frac, v: hsv.v });
        case 'v': return frac => hsvToRgb({ h: hsv.h, s: hsv.s, v: frac });
        case 'l': return frac => labToRgb({ l: frac * 100, a: lab.a, b: lab.b });
        case 'la': return frac => labToRgb({ l: lab.l, a: labAxisFromFrac(frac), b: lab.b });
        case 'lb': return frac => labToRgb({ l: lab.l, a: lab.a, b: labAxisFromFrac(frac) });
    }
}

/** Where to draw the map marker / slider tick for the *current* color under
 *  the given mode — the inverse of the tables above, needed only for
 *  positioning the indicator (applying a drag never needs this — see the
 *  file header comment). */
function getAxisFractions(mode, hsv, lab) {
    switch (mode) {
        case 'h': return { slider: hsv.h / 360, mapX: hsv.s, mapY: 1 - hsv.v };
        case 's': return { slider: hsv.s, mapX: hsv.h / 360, mapY: 1 - hsv.v };
        case 'v': return { slider: hsv.v, mapX: hsv.h / 360, mapY: 1 - hsv.s };
        case 'l': return { slider: lab.l / 100, mapX: labAxisFrac(lab.a), mapY: 1 - labAxisFrac(lab.b) };
        case 'la': return { slider: labAxisFrac(lab.a), mapX: lab.l / 100, mapY: 1 - labAxisFrac(lab.b) };
        case 'lb': return { slider: labAxisFrac(lab.b), mapX: lab.l / 100, mapY: 1 - labAxisFrac(lab.a) };
    }
}

// ── Markup ───────────────────────────────────────────────────────────────

function radioLabel(groupName, value, active) {
    return (
        `<label class="ss-radio-label${active ? ' active' : ''}" data-radio-name="${groupName}" data-radio-value="${value}">` +
        `<span class="ss-radio-indicator"><div class="after${active ? ' pulse' : ''}"></div></span>` +
        `</label>`
    );
}

function valueRow({ radioGroup, radioValue, active, label, inputClass, unit = '', width = 50 }) {
    return (
        `<div class="dcp-value-row">` +
        (radioGroup ? radioLabel(radioGroup, radioValue, active) : `<span class="dcp-value-row-spacer"></span>`) +
        `<span class="dcp-value-label">${label}</span>` +
        `<input type="number" class="def ${inputClass}" style="width:${width}px;">` +
        `<span class="dcp-value-unit">${unit}</span>` +
        `</div>`
    );
}

function historySwatchesHTML() {
    const swatch = c => `<span class="dcp-history-swatch" data-hex="${c.hex}" title="${c.hex}" style="background-color:${c.hex};"></span>`;
    const recent = app.designer.colorHistory?.list() ?? [];
    const favs   = app.designer.colorHistory?.listFavorites() ?? [];
    return recent.concat(favs).map(swatch).join('');
}

function renderHTML(color, dialogId) {
    const alphaMountId = 'dcp-alpha-' + dialogId;

    return `
        <div class="cp-tab-content designer-color-picker-root">
            <div class="dcp-main-row">
                <div class="dcp-map-col">
                    <div class="dcp-map-canvases">
                        <canvas class="dcp-map" width="${MAP_SIZE}" height="${MAP_SIZE}"></canvas>
                        <canvas class="dcp-axis-slider" width="${SLIDER_W}" height="${MAP_SIZE}"></canvas>
                    </div>
                    <label class="dcp-websafe-row">
                        <span class="dcp-websafe-toggle">
                            <span class="ss-radio-indicator"><div class="after"></div></span>
                        </span>
                        <span>${_('Web colors only')}</span>
                    </label>
                      <div class="dcp-alpha-row">                    
                <span class="cp-label">${_('Alpha')}</span>
                <div class="dcp-alpha-mount" id="${alphaMountId}"></div>
                <span class="dcp-alpha-value">${Math.round(color.a * 100)}%</span>
            </div>

                </div>

                <div class="dcp-swatch-col">
                    <div class="dcp-swatch-header">
                        <div class="dcp-label" style="width: 70px; text-align: center; margin-bottom: 4px;">${_('New')}</div>
                        <div class="dcp-swatch-new-mount"></div>
                        <div class="dcp-swatch-current-mount"></div>
                        <div class="dcp-label" style="width: 70px; text-align: center; margin-bottom: 8px; margin-top: 4px;">${_('Current')}</div>
                    </div>
                    ${valueRow({ radioGroup: 'dcp-axis-hsb', radioValue: 'h', active: true,  label: HSB_META.h.label, inputClass: 'dcp-h', unit: HSB_META.h.unit })}
                    ${valueRow({ radioGroup: 'dcp-axis-hsb', radioValue: 's', active: false, label: HSB_META.s.label, inputClass: 'dcp-s', unit: HSB_META.s.unit })}
                    ${valueRow({ radioGroup: 'dcp-axis-hsb', radioValue: 'v', active: false, label: HSB_META.v.label, inputClass: 'dcp-v', unit: HSB_META.v.unit })}
                    <input type="hidden" class="ss-radio-hidden" name="dcp-axis-hsb" value="h">
                    <div class="dcp-group-sep"></div>
                    ${valueRow({ label: 'R', inputClass: 'dcp-r' })}
                    ${valueRow({ label: 'G', inputClass: 'dcp-g' })}
                    ${valueRow({ label: 'B', inputClass: 'dcp-b' })}
                    <div class="dcp-value-row">
                        <span class="dcp-value-row-spacer"></span>
                        <span class="dcp-value-label">#</span>
                        <input type="text" class="def dcp-hex" style="width:84px;" value="${color.hex}">
                    </div>
                </div>
                <div class="dcp-values-col">
                 <div class="dcp-footer">
                  <button type="button" class="aero-button xs confirm dcp-ok">${_('OK')}<div class="after pulse"></div></button>
                <button type="button" class="aero-button xs dcp-cancel">${_('Cancel')}</button>
                <button type="button" class="aero-button xs dcp-eyedropper" title="${_('Pick from screen')}">${_('Eyedropper')}</button>
            </div>
                    ${valueRow({ radioGroup: 'dcp-axis-lab', radioValue: 'l',  active: false, label: LAB_META.l.label,  inputClass: 'dcp-labl', unit: LAB_META.l.unit })}
                    ${valueRow({ radioGroup: 'dcp-axis-lab', radioValue: 'la', active: false, label: LAB_META.la.label, inputClass: 'dcp-laba', unit: LAB_META.la.unit })}
                    ${valueRow({ radioGroup: 'dcp-axis-lab', radioValue: 'lb', active: false, label: LAB_META.lb.label, inputClass: 'dcp-labb', unit: LAB_META.lb.unit })}
                    <input type="hidden" class="ss-radio-hidden" name="dcp-axis-lab" value="">
                    <div class="dcp-group-sep"></div>
         
                    ${valueRow({ label: 'C', inputClass: 'dcp-c', unit: '%' })}
                    ${valueRow({ label: 'M', inputClass: 'dcp-m', unit: '%' })}
                    ${valueRow({ label: 'Y', inputClass: 'dcp-y', unit: '%' })}
                    ${valueRow({ label: 'K', inputClass: 'dcp-k', unit: '%' })}
 

                </div>
            </div>
        </div>
    `;
}

// ── Dialog wiring ────────────────────────────────────────────────────────

function wireDialog(root, initialColor, dialogId, { setResult, close }) {
    let canonicalRGB = { r: initialColor.r, g: initialColor.g, b: initialColor.b };
    let alpha = initialColor.a;
    let axisMode = 'h';
    let websafe = false;
    const originalColor = { ...canonicalRGB };

    const mapCanvas    = root.querySelector('.dcp-map');
    const sliderCanvas = root.querySelector('.dcp-axis-slider');
    const hexInput = root.querySelector('.dcp-hex');
    const rInput = root.querySelector('.dcp-r'), gInput = root.querySelector('.dcp-g'), bInput = root.querySelector('.dcp-b');
    const hInput = root.querySelector('.dcp-h'), sInput = root.querySelector('.dcp-s'), vInput = root.querySelector('.dcp-v');
    const labLInput = root.querySelector('.dcp-labl'), labAInput = root.querySelector('.dcp-laba'), labBInput = root.querySelector('.dcp-labb');
    const cInput = root.querySelector('.dcp-c'), mInput = root.querySelector('.dcp-m'), yInput = root.querySelector('.dcp-y'), kInput = root.querySelector('.dcp-k');
    const alphaValueEl = root.querySelector('.dcp-alpha-value');
    const websafeToggle = root.querySelector('.dcp-websafe-toggle');
    const eyedropperBtn = root.querySelector('.dcp-eyedropper');

    sizeCanvas(mapCanvas, MAP_SIZE, MAP_SIZE);
    sizeCanvas(sliderCanvas, SLIDER_W, MAP_SIZE);
    if (!window.EyeDropper) { eyedropperBtn.disabled = true; eyedropperBtn.style.opacity = '0.38'; }

    const newSwatch = app.designer.colorElement.create({
        color: rgbaString({ ...canonicalRGB, a: alpha }), width: 70, height: 32, onClick: () => {}
    });
    root.querySelector('.dcp-swatch-new-mount').appendChild(newSwatch.el);

    const currentSwatch = app.designer.colorElement.create({
        color: rgbaString({ ...originalColor, a: alpha }), width: 70, height: 32,
        onClick: () => applyRGB(originalColor)
    });
    root.querySelector('.dcp-swatch-current-mount').appendChild(currentSwatch.el);

    function current() {
        return normalizeColor({ ...canonicalRGB, a: alpha });
    }

    function repaint() {
        const hsv = rgbToHsv(canonicalRGB);
        const lab = rgbToLab(canonicalRGB);
        const frac = getAxisFractions(axisMode, hsv, lab);

        if (axisMode === 'h') drawMapHue(mapCanvas, hsv.h);
        else drawMapGeneric(mapCanvas, mapComputeRGB(axisMode, hsv, lab));
        drawSliderGeneric(sliderCanvas, sliderComputeRGB(axisMode, hsv, lab));

        const d = dpr();
        const mctx = mapCanvas.getContext('2d');
        mctx.beginPath();
        mctx.arc(frac.mapX * mapCanvas.width, frac.mapY * mapCanvas.height, 5 * d, 0, Math.PI * 2);
        mctx.strokeStyle = '#fff'; mctx.lineWidth = 2 * d; mctx.stroke();

        const sctx = sliderCanvas.getContext('2d');
        sctx.strokeStyle = '#fff'; sctx.lineWidth = 2 * d;
        sctx.strokeRect(0, frac.slider * sliderCanvas.height - 2 * d, sliderCanvas.width, 4 * d);
    }

    function syncFields() {
        const hsv = rgbToHsv(canonicalRGB);
        const lab = rgbToLab(canonicalRGB);
        const cmyk = rgbToCmyk(canonicalRGB);

        newSwatch.setColor(rgbaString({ ...canonicalRGB, a: alpha }));
        hexInput.value = current().hex;
        rInput.value = canonicalRGB.r; gInput.value = canonicalRGB.g; bInput.value = canonicalRGB.b;
        hInput.value = Math.round(hsv.h); sInput.value = Math.round(hsv.s * 100); vInput.value = Math.round(hsv.v * 100);
        labLInput.value = Math.round(lab.l); labAInput.value = Math.round(lab.a); labBInput.value = Math.round(lab.b);
        cInput.value = Math.round(cmyk.c); mInput.value = Math.round(cmyk.m); yInput.value = Math.round(cmyk.y); kInput.value = Math.round(cmyk.k);
    }

    function applyRGB(rgb) {
        canonicalRGB = websafe ? nearestWebSafeRgb(rgb) : { r: rgb.r, g: rgb.g, b: rgb.b };
        repaint();
        syncFields();
    }

    function setAxisMode(mode) {
        axisMode = mode;
        repaint();
    }

    // ── Map / slider dragging ───────────────────────────────────────────
    function bindDrag(canvas, onSample) {
        let dragging = false;
        const pick = e => {
            const rect = canvas.getBoundingClientRect();
            const d = dpr();
            const x = Math.round((e.clientX - rect.left) * d);
            const y = Math.round((e.clientY - rect.top) * d);
            const sample = app.designer.colorPickupTool.pickFromCanvas(canvas, x, y);
            if (sample) onSample(sample);
        };
        let raf = null;
        const schedule = e => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = null; pick(e); });
        };
        canvas.addEventListener('pointerdown', e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
        canvas.addEventListener('pointermove', e => { if (dragging) schedule(e); });
        canvas.addEventListener('pointerup', () => { dragging = false; });
    }
    bindDrag(mapCanvas, applyRGB);
    bindDrag(sliderCanvas, applyRGB);

    // ── Radio groups (hand-built markup, real app.ui.radio bind/getValue) ─
    app.ui.radio.bind(root);
    function clearGroup(name) {
        root.querySelectorAll(`.ss-radio-label[data-radio-name="${name}"]`).forEach(l => {
            l.classList.remove('active');
            l.querySelector('.after')?.classList.remove('pulse');
        });
    }
    $(root).on('click', '.ss-radio-label[data-radio-name="dcp-axis-hsb"]', function () {
        clearGroup('dcp-axis-lab');
        setAxisMode(this.dataset.radioValue);
    });
    $(root).on('click', '.ss-radio-label[data-radio-name="dcp-axis-lab"]', function () {
        clearGroup('dcp-axis-hsb');
        setAxisMode(this.dataset.radioValue);
    });

    // ── Text field edits ──────────────────────────────────────────────────
    $(hexInput).on('change', () => {
        const parsed = normalizeColor(hexInput.value);
        alpha = parsed.a;
        applyRGB(parsed);
    });
    $([rInput, gInput, bInput]).on('input', () => {
        applyRGB({ r: +rInput.value || 0, g: +gInput.value || 0, b: +bInput.value || 0 });
    });
    $([hInput, sInput, vInput]).on('input', () => {
        applyRGB(hsvToRgb({ h: +hInput.value || 0, s: (+sInput.value || 0) / 100, v: (+vInput.value || 0) / 100 }));
    });
    $([labLInput, labAInput, labBInput]).on('input', () => {
        applyRGB(labToRgb({ l: +labLInput.value || 0, a: +labAInput.value || 0, b: +labBInput.value || 0 }));
    });
    $([cInput, mInput, yInput, kInput]).on('input', () => {
        applyRGB(cmykToRgb({ c: +cInput.value || 0, m: +mInput.value || 0, y: +yInput.value || 0, k: +kInput.value || 0 }));
    });

    websafeToggle.addEventListener('click', () => {
        websafe = !websafe;
        websafeToggle.classList.toggle('active', websafe);
        websafeToggle.querySelector('.after')?.classList.toggle('pulse', websafe);
        if (websafe) applyRGB(canonicalRGB); // snap immediately
    });

    // ── Eyedropper / history ────────────────────────────────────────────
    eyedropperBtn.addEventListener('click', () => {
        app.designer.colorPickupTool.pickFromScreen().then(result => { if (result) applyRGB(result); });
    });
    $(root).on('click', '.dcp-history-swatch', function () {
        applyRGB(normalizeColor(this.dataset.hex));
    });

    // ── Alpha (app.ui.slider) ──────────────────────────────────────────
    app.ui.slider({
        min: 0, max: 100, step: 1, tooltip: true,
        handle1: { start: Math.round(alpha * 100) },
        onUpdate: v => {
            alpha = (v.handle1 ?? 0) / 100;
            alphaValueEl.textContent = Math.round(alpha * 100) + '%';
            newSwatch.setColor(rgbaString({ ...canonicalRGB, a: alpha }));
        }
    }, `#dcp-alpha-${dialogId}`);

    // ── OK / Cancel ─────────────────────────────────────────────────────
    root.querySelector('.dcp-ok').addEventListener('click', () => {
        const result = current();
        $(document).trigger('designer-color-picked', [result]);
        setResult(result);
    });
    root.querySelector('.dcp-cancel').addEventListener('click', () => close());

    repaint();
    syncFields();
}

function injectCSS() {
    if (document.getElementById('designer-color-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-color-picker-style';
    style.textContent = `
        .designer-color-picker-root { display: flex; flex-direction: column; gap: 10px; padding: 14px; color: #fff; font-size: 11px; }
        .dcp-main-row { display: flex; gap: 14px; align-items: flex-start; }
        .dcp-map-col { display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; }
        .dcp-map-canvases { display: flex; gap: 6px; }
        .dcp-map, .dcp-axis-slider { display: block; border-radius: 3px; cursor: crosshair; touch-action: none; }

        .dcp-swatch-col { display: flex; flex-direction: column; width: 110px; flex: 0 0 auto; gap: 2px; }
        .dcp-swatch-new-mount, .dcp-swatch-current-mount { margin-bottom: 0px; }
        .dcp-swatch-new-mount .designer-color-element,
        .dcp-swatch-current-mount .designer-color-element {cursor: default; }
        .dcp-websafe-row { display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 0px 0; cursor: default; }
        .dcp-websafe-toggle { display: inline-flex; }
        .dcp-websafe-toggle:hover .ss-radio-indicator { box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.2); }
        .dcp-websafe-toggle.active .ss-radio-indicator { box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.22); }

        .dcp-values-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .dcp-value-row { display: flex; align-items: center; gap: 6px; height: 22px; }
        .dcp-value-row-spacer { width: 18px; flex: 0 0 auto; }
        .dcp-value-label { width: 12px; flex: 0 0 auto; opacity: 0.75; }
        .designer-color-picker-root .ss-radio-indicator { width: 13px; height: 16px; border-radius: 16px; margin-left: 5px; }
        .dcp-value-row input.def { padding: 3px 6px; min-height: 0; -moz-appearance: textfield; }
        .dcp-value-row input.def::-webkit-outer-spin-button,
        .dcp-value-row input.def::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .dcp-value-unit { width: 14px; flex: 0 0 auto; opacity: 0.6; }
        .dcp-group-sep { height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0; }

        .dcp-alpha-row { display: flex; align-items: center; gap: 10px; }
        .dcp-alpha-mount { flex: 1; }
        .dcp-alpha-value { width: 34px; text-align: right; }

        .dcp-history { display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; }
        .dcp-history-swatch { width: 18px; height: 18px; border-radius: 3px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); }
        .dcp-history-swatch:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6); }

        .dcp-footer { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin-bottom: 26px }
        .dcp-footer button { flex-shrink: 0; }
    `;
    document.head.appendChild(style);
}

function open(options = {}) {
    return _uiReady.then(() => new Promise(resolve => {
        _pending = { resolve, options };

        app.ui.windowStart('designer', {
            id: 'designer',
            title: _('Color Picker'),
            windowIcon: true,
            resizable: false,
            width: '550px',
            height: '370px',
            body(windowobj) {
                const captured = _pending;
                _pending = null;
                if (!captured) return '';

                const initialColor = normalizeColor(captured.options.color ?? '#ff0000');
                let pendingResult;

                const parentId = captured.options.parentId || app.designer.win?.windowId || 'designer';
                const dialogId = windowobj.windowId;

                windowobj.state.close(() => {
                    captured.resolve(pendingResult);
                    if (parentId) app.windows.closeDialog(dialogId);
                });

                setTimeout(() => {
                    app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: captured.options.dialogTitle || _('Color Picker') });
                }, 0);

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.designer-color-picker-root');
                    if (!root) return;
                    wireDialog(root, initialColor, dialogId, {
                        setResult: v => { pendingResult = v; windowobj.close(); },
                        close: () => windowobj.close()
                    });
                }, 0);

                return renderHTML(initialColor, dialogId);
            }
        });
    }));
}

export function init(app) {
    injectCSS();
    app.designer = app.designer || {};
    app.designer.colorPicker = { open };

    loadUiDeps(app);
}

/** Lazy-loads app.ui.radio (not boot-loaded — see file header comment) and
 *  adds tabs.css for the .h1/.p/.line/.cp-label typography this dialog
 *  reuses. `open()` awaits `_uiReady` so its markup never renders before
 *  app.ui.radio is ready. */
function loadUiDeps(app) {
    app.addCSS?.('cp-tabs', app.config.local.ComponentsRoot + 'controlpanel/tabs.css', true);

    _uiReady = app.ui?.radio
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/radio.js').then(mod => mod?.setup?.(app));
}
