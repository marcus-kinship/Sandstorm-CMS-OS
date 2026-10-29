/**
 * @file wordlight/viewer.js
 * @description PDF rendering for Word light, on top of PDF.js.
 *
 * Security (KRAVSPEC_WORD_LIGHT.md S-01–S-06):
 *  - PDF parsing runs in PDF.js's own Web Worker (res/js/pdfjs/
 *    pdf.worker.min.mjs) — no access to the page, `app`, Explorer or keys.
 *  - Pages are drawn with `page.render()` onto a canvas only. PDF.js's
 *    scripting sandbox is never loaded, so embedded JavaScript, open
 *    actions and form calculations cannot run; `isEvalSupported: false`
 *    keeps PDF.js itself from compiling fonts with `eval`/`new Function`.
 *  - XFA is disabled, standard fonts come from res/js/pdfjs/standard_fonts
 *    (no network), and no CMap URL is set, so nothing is fetched remotely.
 *  - Text is made selectable with PDF.js's TextLayer: transparent text
 *    spans over the canvas, built from the page's text content only.
 *  - Link annotations become plain anchors only for http(s)/mailto URLs,
 *    opened in a new tab with `noopener` after a click. Everything else
 *    (javascript:, file:, launch actions, attachments) is ignored.
 *
 * @module program/wordlight/viewer
 */

const PDFJS_URL   = new URL('../../res/js/pdfjs/pdf.min.mjs', import.meta.url).href;
const WORKER_URL  = new URL('../../res/js/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const FONTS_URL   = new URL('../../res/js/pdfjs/standard_fonts/', import.meta.url).href;

let _pdfjs = null;

/** Lazy-loads PDF.js once per page session. */
export async function loadPdfJs() {
    if (_pdfjs) return _pdfjs;
    _pdfjs = await import(PDFJS_URL);
    _pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    return _pdfjs;
}

/**
 * Opens PDF bytes with the safe option set. The bytes are copied first:
 * PDF.js transfers (detaches) the buffer it is given to its worker.
 * @param {Uint8Array} bytes
 * @returns {Promise<Object>} PDFDocumentProxy
 */
export async function openPdf(bytes) {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
        data:                 bytes.slice(),
        isEvalSupported:      false,
        enableXfa:            false,
        standardFontDataUrl:  FONTS_URL,
        useSystemFonts:       false,
        disableFontFace:      false,
        stopAtErrors:         false,
    });
    return task.promise;
}

/**
 * Word light's own attachments (see save.js) — the pristine original and
 * the editable block data — if this PDF was saved by Word light.
 * @returns {Promise<{original: Uint8Array, blocks: Array, ocr: Object}|null>}
 */
export async function readWordLightData(pdf) {
    let attachments = null;
    try { attachments = await pdf.getAttachments(); } catch { return null; }
    if (!attachments) return null;
    const files = Object.values(attachments);
    const orig  = files.find(a => a.filename === 'wordlight-original.pdf');
    const data  = files.find(a => a.filename === 'wordlight-blocks.json');
    if (!orig || !data) return null;
    try {
        const json = JSON.parse(new TextDecoder().decode(data.content));
        if (!Array.isArray(json.blocks)) return null;
        return { original: new Uint8Array(orig.content), blocks: json.blocks, ocr: json.ocr || {} };
    } catch {
        return null;
    }
}

const SAFE_LINK = /^(https?:|mailto:)/i;

/**
 * Builds the page stack inside `container` and renders pages lazily as they
 * scroll into view. Each page gets a `.wl-layer` element for the editing
 * layer (layer.js) on top of the canvas.
 *
 * @param {HTMLElement} container - scrolling workspace
 * @param {Object} pdf - PDFDocumentProxy
 * @param {Object} hooks - { onPageLayer(pageInfo), onCurrentPage(num) }
 */
export function createViewer(container, pdf, hooks = {}) {
    const pages = [];
    let scale = 1;
    let observer = null;
    let destroyed = false;
    const selectionCleanups = [];

    const stack = document.createElement('div');
    stack.className = 'wl-pages';
    container.innerHTML = '';
    container.appendChild(stack);

    async function init() {
        for (let num = 1; num <= pdf.numPages; num++) {
            const pdfPage = await pdf.getPage(num);
            if (destroyed) return;
            const base = pdfPage.getViewport({ scale: 1 });
            const el = document.createElement('div');
            el.className = 'wl-page';
            el.dataset.page = String(num);
            el.innerHTML = `<canvas class="wl-canvas"></canvas><div class="textLayer"></div><div class="wl-ocr"></div><div class="wl-links"></div><div class="wl-layer"></div>`;
            stack.appendChild(el);
            const info = {
                num, pdfPage, base, el,
                canvas: el.querySelector('canvas'),
                text:   el.querySelector('.textLayer'),
                ocrEl:  el.querySelector('.wl-ocr'),
                links:  el.querySelector('.wl-links'),
                layer:  el.querySelector('.wl-layer'),
                renderedScale: 0, task: null,
                viewport: null, textLayer: null,
                ocr: null,            // OCR lines for this page, see ocr.js
            };
            pages.push(info);
            size(info);
            hooks.onPageLayer?.(info);
        }

        observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const info = pages[Number(entry.target.dataset.page) - 1];
                info.visible = entry.isIntersecting;
                if (entry.isIntersecting) render(info);
            }
        }, { root: container, rootMargin: '400px 0px' });
        pages.forEach(p => observer.observe(p.el));
        container.addEventListener('scroll', onScroll, { passive: true });
    }

    function size(info) {
        info.viewport = info.pdfPage.getViewport({ scale });
        info.el.style.width  = Math.floor(info.viewport.width) + 'px';
        info.el.style.height = Math.floor(info.viewport.height) + 'px';
        // PDF.js's text layer sizes itself from this variable
        info.el.style.setProperty('--scale-factor', String(scale));
    }

    async function render(info) {
        if (info.renderedScale === scale) return;
        info.task?.cancel();
        const dpr = window.devicePixelRatio || 1;
        const vp = info.pdfPage.getViewport({ scale: scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.className = 'wl-canvas';
        canvas.width  = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width  = Math.floor(info.viewport.width) + 'px';
        canvas.style.height = Math.floor(info.viewport.height) + 'px';
        const task = info.pdfPage.render({
            canvasContext: canvas.getContext('2d'),
            viewport: vp,
            annotationMode: 1, // AnnotationMode.ENABLE: draw annotation appearances, no forms/scripts
        });
        info.task = task;
        try {
            await task.promise;
        } catch (error) {
            if (error?.name !== 'RenderingCancelledException') console.warn('Word light render failed:', error);
            return;
        }
        if (info.task !== task) return;
        info.task = null;
        info.canvas.replaceWith(canvas);
        info.canvas = canvas;
        info.renderedScale = scale;
        renderText(info);
        renderOcr(info);
        renderLinks(info);
    }

    const measureCtx = document.createElement('canvas').getContext('2d');

    /**
     * Recognised (OCR) lines as invisible, selectable text — each line is
     * sized to its box: font height from the box, then stretched with
     * scaleX so the selection covers the word images exactly.
     */
    function renderOcr(info) {
        info.ocrEl.innerHTML = '';
        if (!info.ocr?.length) return;
        for (const line of info.ocr) {
            const [a, b, c, d] = info.viewport.convertToViewportRectangle(line.rect);
            const left = Math.min(a, c), top = Math.min(b, d);
            const width = Math.abs(c - a), height = Math.abs(d - b);
            const fontSize = Math.max(4, height * 0.9);
            measureCtx.font = `${fontSize}px sans-serif`;
            const natural = measureCtx.measureText(line.text).width || 1;
            const span = document.createElement('span');
            span.textContent = line.text;
            Object.assign(span.style, {
                left: left + 'px', top: top + 'px',
                fontSize: fontSize + 'px', lineHeight: height + 'px',
                transform: `scaleX(${width / natural})`,
            });
            info.ocrEl.appendChild(span);
            info.ocrEl.appendChild(document.createElement('br'));
        }
    }

    /**
     * Guesses the background colour around `rect` (PDF points) from the
     * rendered page: samples a thin ring just outside the rectangle and
     * returns the most common colour (bucketed, then averaged) as #rrggbb.
     * Text and specks in the ring are outvoted by the paper itself.
     * @returns {string|null} null when the page isn't rendered yet
     */
    function sampleBackground(num, rect) {
        const info = pages[num - 1];
        const canvas = info?.canvas;
        if (!info?.renderedScale || !canvas?.width) return null;
        const k = canvas.width / info.viewport.width;
        const [a, b, c, d] = info.viewport.convertToViewportRectangle(rect);
        const ix1 = Math.min(a, c) * k, ix2 = Math.max(a, c) * k;
        const iy1 = Math.min(b, d) * k, iy2 = Math.max(b, d) * k;
        const pad = Math.max(3, 4 * k);
        const X1 = Math.max(0, Math.floor(ix1 - pad)), Y1 = Math.max(0, Math.floor(iy1 - pad));
        const X2 = Math.min(canvas.width, Math.ceil(ix2 + pad)), Y2 = Math.min(canvas.height, Math.ceil(iy2 + pad));
        if (X2 <= X1 || Y2 <= Y1) return null;
        let data;
        try {
            data = canvas.getContext('2d').getImageData(X1, Y1, X2 - X1, Y2 - Y1).data;
        } catch {
            return null;
        }
        const buckets = new Map();
        const w = X2 - X1;
        for (let i = 0; i < data.length; i += 4) {
            const px = X1 + (i / 4) % w, py = Y1 + Math.floor(i / 4 / w);
            if (px >= ix1 && px <= ix2 && py >= iy1 && py <= iy2) continue;   // ring only
            const key = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3);
            const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
            buckets.set(key, e);
        }
        let best = null;
        for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
        if (!best) return null;
        const hex = v => Math.round(v / best.n).toString(16).padStart(2, '0');
        return '#' + hex(best.r) + hex(best.g) + hex(best.b);
    }

    function setOcr(num, lines) {
        const info = pages[num - 1];
        if (!info) return;
        info.ocr = lines && lines.length ? lines : null;
        renderOcr(info);
    }

    /**
     * Invisible, selectable text positioned over the canvas (PDF.js
     * TextLayer) so text can be selected and copied. Only text strings are
     * placed — nothing from the PDF is executed.
     */
    async function renderText(info) {
        const pdfjs = await loadPdfJs();
        try {
            if (info.textLayer) {
                info.textLayer.update({ viewport: info.viewport });
                return;
            }
            info.textLayer = new pdfjs.TextLayer({
                textContentSource: info.pdfPage.streamTextContent(),
                container: info.text,
                viewport: info.viewport,
            });
            await info.textLayer.render();
            bindSelection(info.text);
        } catch (error) {
            console.warn('Word light text layer failed:', error);
        }
    }

    /**
     * Same trick as PDF.js's own TextLayerBuilder: while a selection drag is
     * in progress, a non-selectable `.endOfContent` element covers the gaps
     * between text runs (CSS `.selecting`), and in Chrome it is moved right
     * after the selection's focus node — so releasing the mouse over empty
     * space doesn't stretch the selection to the end of the page.
     */
    function bindSelection(div) {
        const end = document.createElement('div');
        end.className = 'endOfContent';
        div.appendChild(end);
        div.addEventListener('mousedown', () => div.classList.add('selecting'));
        const reset = () => {
            div.classList.remove('selecting');
            if (end.parentNode !== div || end !== div.lastChild) div.appendChild(end);
        };
        const follow = () => {
            if (!div.classList.contains('selecting')) return;
            const sel = document.getSelection();
            if (!sel?.rangeCount) return;
            const node = sel.focusNode;
            const el = node?.nodeType === 1 ? node : node?.parentElement;
            if (!el || !div.contains(el) || el === end) return;
            const host = el.closest('.textLayer > *');
            if (host && host.nextSibling !== end) host.after(end);
        };
        window.addEventListener('mouseup', reset);
        document.addEventListener('selectionchange', follow);
        selectionCleanups.push(() => {
            window.removeEventListener('mouseup', reset);
            document.removeEventListener('selectionchange', follow);
        });
    }

    async function renderLinks(info) {
        info.links.innerHTML = '';
        let annots = [];
        try { annots = await info.pdfPage.getAnnotations({ intent: 'display' }); } catch { return; }
        for (const a of annots) {
            if (a.subtype !== 'Link' || !a.url || !SAFE_LINK.test(a.url)) continue;
            const [x1, y1, x2, y2] = info.viewport.convertToViewportRectangle(a.rect);
            const link = document.createElement('a');
            link.href = a.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = a.url;
            link.className = 'wl-link';
            Object.assign(link.style, {
                left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px',
                width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px',
            });
            info.links.appendChild(link);
        }
    }

    function onScroll() {
        const mid = container.scrollTop + container.clientHeight / 3;
        let current = 1;
        for (const p of pages) {
            if (p.el.offsetTop <= mid) current = p.num; else break;
        }
        hooks.onCurrentPage?.(current);
    }

    function setScale(next) {
        // Keep the same spot in view while zooming
        const ratio = container.scrollTop / Math.max(1, container.scrollHeight);
        scale = Math.min(4, Math.max(0.25, next));
        for (const p of pages) {
            size(p);
            p.renderedScale = 0;
            renderOcr(p);
            hooks.onPageLayer?.(p);
        }
        container.scrollTop = ratio * container.scrollHeight;
        pages.filter(p => p.visible).forEach(render);
    }

    function fitWidth() {
        const first = pages[0];
        if (!first) return;
        setScale((container.clientWidth - 48) / first.base.width);
    }

    function fitPage() {
        const first = pages[0];
        if (!first) return;
        setScale(Math.min((container.clientWidth - 48) / first.base.width, (container.clientHeight - 32) / first.base.height));
    }

    function goTo(num) {
        const p = pages[num - 1];
        if (p) container.scrollTop = p.el.offsetTop - 12;
    }

    function destroy() {
        destroyed = true;
        observer?.disconnect();
        container.removeEventListener('scroll', onScroll);
        pages.forEach(p => { p.task?.cancel(); p.textLayer?.cancel(); });
        selectionCleanups.forEach(fn => fn());
        pdf.destroy();
    }

    const ready = init();
    return {
        ready, pages, destroy, setScale, fitWidth, fitPage, goTo, setOcr, sampleBackground,
        get scale() { return scale; },
        get numPages() { return pdf.numPages; },
    };
}

/** Renders a small thumbnail of one page into a new canvas. */
export async function renderThumb(pdfPage, width = 110) {
    const base = pdfPage.getViewport({ scale: 1 });
    const vp = pdfPage.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: vp, annotationMode: 1 }).promise;
    return canvas;
}
