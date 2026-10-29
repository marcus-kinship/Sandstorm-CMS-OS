/**
 * @file wordlight/save.js
 * @description Writing Word light documents with pdf-lib.
 *
 * Save model (KRAVSPEC_WORD_LIGHT.md 7.3, option a):
 *  - Blocks are burned onto the pages so every PDF reader shows them.
 *  - Comments become real PDF Text annotations (visible in the comment
 *    panel of Adobe Reader / Edge) instead of being burned in.
 *  - The pristine original and the block data are embedded as attachments
 *    (`wordlight-original.pdf`, `wordlight-blocks.json`), so reopening the
 *    file in Word light shows the original with the blocks editable again.
 *    The original is always the untouched one, so repeated saves don't grow.
 *
 * Text uses pdf-lib's standard fonts (WinAnsi: Latin-1, so å/ä/ö work).
 * `measure()` and `wrapText()` are shared with layer.js so the line breaks
 * on screen are exactly the ones written to the PDF.
 *
 * @module program/wordlight/save
 */

const PDFLIB_URL = new URL('../../res/js/pdf-lib/pdf-lib.esm.min.js', import.meta.url).href;

let _lib = null;
let _metricsDoc = null;
const _metricFonts = {};
const _charsets = {};

export async function loadPdfLib() {
    if (!_lib) _lib = await import(PDFLIB_URL);
    return _lib;
}

/** pdf-lib StandardFonts name for a block's font settings. */
function fontName(lib, family, bold, italic) {
    const F = lib.StandardFonts;
    if (family === 'times')   return bold && italic ? F.TimesRomanBoldItalic : bold ? F.TimesRomanBold : italic ? F.TimesRomanItalic : F.TimesRoman;
    if (family === 'courier') return bold && italic ? F.CourierBoldOblique : bold ? F.CourierBold : italic ? F.CourierOblique : F.Courier;
    return bold && italic ? F.HelveticaBoldOblique : bold ? F.HelveticaBold : italic ? F.HelveticaOblique : F.Helvetica;
}

/**
 * Distance from the top of a line box (line-height 1.2) to the baseline, in
 * em, for the browser fonts layer.js displays (Arial / Times New Roman /
 * Courier New — metric-compatible with Helvetica / Times / Courier).
 */
export const BASELINE = { helvetica: 0.9465, times: 0.9375, courier: 0.8665 };
export const LINE_HEIGHT = 1.2;
export const CSS_FONT = {
    helvetica: 'Helvetica, Arial, sans-serif',
    times:     '"Times New Roman", Times, serif',
    courier:   '"Courier New", Courier, monospace',
};

/** Loads metrics for the font a block uses (call before measure/wrapText). */
export async function prepareFont(family, bold, italic) {
    const lib = await loadPdfLib();
    if (!_metricsDoc) _metricsDoc = await lib.PDFDocument.create();
    const name = fontName(lib, family, bold, italic);
    if (!_metricFonts[name]) {
        _metricFonts[name] = await _metricsDoc.embedFont(name);
        _charsets[name] = new Set(_metricFonts[name].getCharacterSet());
    }
    return name;
}

function metricFont(block) {
    const lib = _lib;
    return _metricFonts[fontName(lib, block.font, block.bold, block.italic)];
}

/** Replaces characters the standard font can't encode with "?". */
export function sanitize(text, block) {
    const set = _charsets[fontName(_lib, block.font, block.bold, block.italic)];
    if (!set) return text;
    let out = '';
    for (const ch of text) out += ch === '\n' || set.has(ch.codePointAt(0)) ? ch : '?';
    return out;
}

export function measure(text, block) {
    return metricFont(block).widthOfTextAtSize(text, block.size);
}

/**
 * Greedy word wrap at `width` points using the PDF font's own metrics.
 * Explicit newlines are kept; words longer than a line are broken.
 * @returns {string[]}
 */
export function wrapText(text, block, width) {
    const lines = [];
    const fits = s => measure(s, block) <= width;
    for (const para of sanitize(text, block).split('\n')) {
        let line = '';
        let wrapped = false;
        for (const token of para.split(/(\s+)/).filter(Boolean)) {
            const isSpace = /^\s+$/.test(token);
            if (isSpace && !line && wrapped) continue;   // no leading space after a wrap
            if (fits(line + token)) { line += token; continue; }
            if (isSpace) { lines.push(line); line = ''; wrapped = true; continue; }
            if (line.trim()) { lines.push(line.replace(/\s+$/, '')); line = ''; wrapped = true; }
            if (fits(token)) { line = token; continue; }
            // A single word wider than the line: break it by characters
            for (const ch of token) {
                if (line && !fits(line + ch)) { lines.push(line); line = ch; wrapped = true; }
                else line += ch;
            }
        }
        lines.push(line.replace(/\s+$/, ''));
    }
    return lines;
}

/** Share of rectangle `a` (PDF points) that lies inside rectangle `b`. */
function overlapRatio(a, b) {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.max(1e-6, (a[2] - a[0]) * (a[3] - a[1]));
}

function hexToRgb(lib, hex) {
    const n = parseInt(String(hex || '#000000').replace('#', ''), 16) || 0;
    return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dataUrlBytes(dataUrl) {
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Builds the PDF to save: original + OCR text (invisible) + burned blocks +
 * comment annotations + Word light attachments.
 * @param {Uint8Array} originalBytes - the untouched original document
 * @param {Array} blocks
 * @param {Object} [ocr] - { [pageNum]: [{ text, rect }] } from ocr.js
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(originalBytes, blocks, ocr = {}) {
    const lib = await loadPdfLib();
    const { PDFDocument, PDFString, PDFHexString, BlendMode } = lib;

    let doc;
    try {
        doc = await PDFDocument.load(originalBytes, { updateMetadata: false });
    } catch (error) {
        if (/encrypt/i.test(error?.message || '')) throw new Error(_('Encrypted PDF files cannot be saved.'));
        throw error;
    }
    const pages = doc.getPages();
    const fonts = {};
    const font = async (b) => {
        const name = fontName(lib, b.font, b.bold, b.italic);
        if (!fonts[name]) fonts[name] = await doc.embedFont(name);
        return fonts[name];
    };

    // OCR: invisible text over the scanned image makes the page searchable
    // and copyable in every PDF reader ("searchable PDF").
    const ocrLines = Object.entries(ocr || {}).filter(([, lines]) => lines?.length);
    if (ocrLines.length) {
        const meta = { font: 'helvetica', bold: false, italic: false, size: 1 };
        await prepareFont('helvetica', false, false);
        const f = await font(meta);
        for (const [num, lines] of ocrLines) {
            const page = pages[Number(num) - 1];
            if (!page) continue;
            const covers = blocks.filter(b => b.type === 'cover' && b.page === Number(num));
            for (const line of lines) {
                // Text replaced via a cover must not stay searchable underneath
                if (covers.some(c => overlapRatio(line.rect, c.rect) > 0.5)) continue;
                const text = sanitize(line.text, meta).trim();
                if (!text) continue;
                const [x1, y1, x2, y2] = line.rect;
                const unit = f.widthOfTextAtSize(text, 1) || 1;
                // Fit the line's width; never taller than its box
                const size = Math.max(1, Math.min((x2 - x1) / unit, (y2 - y1) * 1.1));
                page.drawText(text, { x: x1, y: y1 + (y2 - y1) * 0.2, size, font: f, opacity: 0 });
            }
        }
    }

    for (const b of blocks) {
        const page = pages[b.page - 1];
        if (!page) continue;
        const [x1, y1, x2, y2] = b.rect;
        const w = x2 - x1, h = y2 - y1;

        if (b.type === 'text') {
            await prepareFont(b.font, b.bold, b.italic);
            const f = await font(b);
            const color = hexToRgb(lib, b.color);
            const lines = wrapText(b.text || '', b, w);
            lines.forEach((line, i) => {
                const lw = f.widthOfTextAtSize(line, b.size);
                const x = b.align === 'center' ? x1 + (w - lw) / 2 : b.align === 'right' ? x2 - lw : x1;
                const y = y2 - b.size * (i * LINE_HEIGHT + BASELINE[b.font]);
                if (line) page.drawText(line, { x, y, size: b.size, font: f, color });
                if (b.underline && line) {
                    page.drawLine({ start: { x, y: y - b.size * 0.12 }, end: { x: x + lw, y: y - b.size * 0.12 }, thickness: Math.max(0.5, b.size * 0.06), color });
                }
            });
        } else if (b.type === 'highlight') {
            page.drawRectangle({ x: x1, y: y1, width: w, height: h, color: hexToRgb(lib, b.color), opacity: 0.4, blendMode: BlendMode.Multiply });
        } else if (b.type === 'cover') {
            page.drawRectangle({ x: x1, y: y1, width: w, height: h, color: hexToRgb(lib, b.fill || '#ffffff') });
        } else if (b.type === 'image' && b.imageData) {
            const bytes = dataUrlBytes(b.imageData);
            const img = /^data:image\/png/i.test(b.imageData) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
            page.drawImage(img, { x: x1, y: y1, width: w, height: h });
        } else if (b.type === 'comment') {
            const annot = doc.context.obj({
                Type: 'Annot',
                Subtype: 'Text',
                Rect: [x1, y1, x2, y2],
                Contents: PDFHexString.fromText(b.text || ''),
                T: PDFHexString.fromText(b.author || ''),
                M: PDFString.fromDate(new Date(b.date || Date.now())),
                Name: 'Comment',
                C: [1, 0.82, 0.25],
                F: 4,
                Open: false,
            });
            page.node.addAnnot(doc.context.register(annot));
        }
    }

    // Word light's own data, so the blocks stay editable (F-29)
    await doc.attach(originalBytes, 'wordlight-original.pdf', {
        mimeType: 'application/pdf',
        description: 'Word light: original document',
    });
    const data = new TextEncoder().encode(JSON.stringify({ version: 1, blocks, ocr: ocr || {} }));
    await doc.attach(data, 'wordlight-blocks.json', {
        mimeType: 'application/json',
        description: 'Word light: editable blocks',
    });

    doc.setProducer('Sandstorm Word light (pdf-lib)');
    return doc.save();
}
