/**
 * @file wordlight/ocr.js
 * @description Text recognition (OCR) for scanned PDF pages with
 * Tesseract.js.
 *
 * Everything is vendored in res/js/tesseract/ (script, worker, the
 * LSTM-only WASM cores with and without SIMD, Swedish + English language
 * data — see VERSION.txt there) and loaded from this server on first use;
 * no CDN is contacted (KRAVSPEC_WORD_LIGHT.md S-03). Page images are
 * recognised locally in the browser — nothing is uploaded anywhere.
 *
 * Output is one entry per recognised line, in PDF user-space points:
 *   { text, rect: [x1, y1, x2, y2] }
 *
 * OCR is a helper for finding text in images — never the basis of viewing
 * or editing (KRAVSPEC_WORD_LIGHT.md 7.0). On pages that already contain
 * real text it only looks at the page's images (imageRegions()).
 *
 * @module program/wordlight/ocr
 */
import { loadPdfJs } from './viewer.js';

const BASE          = new URL('../../res/js/tesseract/', import.meta.url).href;
const TESSERACT_URL = BASE + 'tesseract.min.js';
const WORKER_URL    = BASE + 'worker.min.js';
const CORE_URL      = BASE + 'core';      // picks the SIMD or plain LSTM core itself
const LANG_URL      = BASE + 'lang';      // {swe,eng}.traineddata.gz
const LANGS = 'swe+eng';
const RENDER_SCALE = 2.5;     // ≈180 dpi for an A4 page — good accuracy without huge images
const MIN_CONFIDENCE = 30;    // drop lines Tesseract is mostly guessing at

let _loading = null;
let _worker = null;
let _progress = () => {};

function loadScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_loading) return _loading;
    _loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract.js did not load'));
        s.onerror = () => { _loading = null; reject(new Error(_('Could not load the OCR engine.'))); };
        document.head.appendChild(s);
    });
    return _loading;
}

async function getWorker() {
    if (_worker) return _worker;
    const Tesseract = await loadScript();
    // Every path set explicitly — the library defaults all point at jsDelivr
    _worker = await Tesseract.createWorker(LANGS, 1, {
        workerPath: WORKER_URL,
        corePath:   CORE_URL,
        langPath:   LANG_URL,
        gzip:       true,
        logger:     m => _progress(m),
    });
    return _worker;
}

/**
 * Where a page paints images, in PDF points — from PDF.js's operator list,
 * following save/restore, `cm` transforms and form XObject matrices. Each
 * image fills the unit square of the current transformation matrix.
 * Small images (icons, rules) are ignored.
 * @returns {Promise<number[][]>} rects [x1, y1, x2, y2]
 */
export async function imageRegions(pdfPage) {
    const pdfjs = await loadPdfJs();
    const { OPS, Util } = pdfjs;
    const list = await pdfPage.getOperatorList();
    const stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const out = [];
    for (let i = 0; i < list.fnArray.length; i++) {
        const fn = list.fnArray[i], args = list.argsArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() || ctm;
        else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push(ctm);
            if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = Util.transform(ctm, args[0]);
        }
        else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
            const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(p => Util.applyTransform(p, ctm));
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
            if (rect[2] - rect[0] >= 40 && rect[3] - rect[1] >= 15) out.push(rect);
        }
    }
    return out;
}

/**
 * Recognises the text on one PDF page — the whole page, or only `regions`
 * (PDF-point rects, e.g. from imageRegions()) cropped out of the page image.
 * @param {Object} pdfPage - PDF.js PDFPageProxy
 * @param {Function} onProgress - (fraction 0..1, label) while loading/recognising
 * @param {number[][]|null} [regions]
 * @returns {Promise<Array<{text: string, rect: number[]}>>}
 */
export async function recognizePage(pdfPage, onProgress = () => {}, regions = null) {
    _progress = m => {
        const label = m.status === 'recognizing text' ? 'recognize' : 'load';
        onProgress(typeof m.progress === 'number' ? m.progress : 0, label);
    };
    const worker = await getWorker();

    const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport, annotationMode: 0 }).promise;

    // Whole page, or each region cropped out (offset kept for coordinates)
    const jobs = [];
    if (!regions) {
        jobs.push({ image: canvas, ox: 0, oy: 0 });
    } else {
        for (const rect of regions) {
            const [a, b, c, d] = viewport.convertToViewportRectangle(rect);
            const x = Math.max(0, Math.floor(Math.min(a, c)) - 4), y = Math.max(0, Math.floor(Math.min(b, d)) - 4);
            const w = Math.min(canvas.width, Math.ceil(Math.max(a, c)) + 4) - x;
            const h = Math.min(canvas.height, Math.ceil(Math.max(b, d)) + 4) - y;
            if (w < 20 || h < 10) continue;
            const crop = document.createElement('canvas');
            crop.width = w; crop.height = h;
            crop.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
            jobs.push({ image: crop, ox: x, oy: y });
        }
    }

    const lines = [];
    for (const job of jobs) {
        const { data } = await worker.recognize(job.image);
        for (const line of data.lines || []) {
            const text = (line.text || '').replace(/\s+/g, ' ').trim();
            if (!text || line.confidence < MIN_CONFIDENCE) continue;
            const { x0, y0, x1, y1 } = line.bbox;
            const [ax, ay] = viewport.convertToPdfPoint(x0 + job.ox, y0 + job.oy);
            const [bx, by] = viewport.convertToPdfPoint(x1 + job.ox, y1 + job.oy);
            lines.push({
                text,
                rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
            });
        }
    }
    return lines;
}

/** Frees the Tesseract worker (it holds the WASM engine and language data). */
export async function terminateOcr() {
    const w = _worker;
    _worker = null;
    if (w) await w.terminate();
}
