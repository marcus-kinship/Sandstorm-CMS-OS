/**
 * @file wordlight/pages.js
 * @description Page operations for Word light: reorder, insert blank pages,
 * delete, rotate, import pages from another PDF, export pages and print.
 *
 * Page edits change the document itself, so they are applied with pdf-lib to
 * the original (`state.original`) and the result is shown again. Each edit
 * returns the new bytes and a `map`: for every new page, the old page
 * number it came from (or null for a new page). wordlight.js uses the map to
 * move blocks and OCR text along with their pages.
 *
 * Blocks and OCR rects are in PDF user space, which /Rotate does not change,
 * so rotating a page keeps everything on it in place.
 *
 * @module program/wordlight/pages
 */
import { loadPdfLib } from './save.js';
import { openPdf } from './viewer.js';

async function load(bytes) {
    const lib = await loadPdfLib();
    try {
        return { lib, doc: await lib.PDFDocument.load(bytes, { updateMetadata: false }) };
    } catch (error) {
        if (/encrypt/i.test(error?.message || '')) throw new Error(_('Encrypted PDF files cannot be saved.'));
        throw error;
    }
}

const identity = n => Array.from({ length: n }, (_x, i) => i + 1);

/** Moves page `from` so it ends up at position `to` (both 1-based). */
export async function movePage(bytes, from, to) {
    const { doc } = await load(bytes);
    const map = identity(doc.getPageCount());
    if (from === to) return { bytes, map };
    const page = doc.getPage(from - 1);
    doc.removePage(from - 1);
    doc.insertPage(to - 1, page);
    map.splice(to - 1, 0, map.splice(from - 1, 1)[0]);
    return { bytes: await doc.save(), map };
}

/** Inserts a blank page at position `at` (1-based), sized and turned like page `like`. */
export async function insertBlank(bytes, at, like) {
    const { lib, doc } = await load(bytes);
    const ref = doc.getPage(Math.min(Math.max(like, 1), doc.getPageCount()) - 1);
    const { width, height } = ref.getSize();
    const page = doc.insertPage(at - 1, [width, height]);
    page.setRotation(lib.degrees(ref.getRotation().angle));
    const map = identity(doc.getPageCount() - 1);
    map.splice(at - 1, 0, null);
    return { bytes: await doc.save(), map };
}

/** Removes page `num` (1-based). */
export async function deletePage(bytes, num) {
    const { doc } = await load(bytes);
    if (doc.getPageCount() <= 1) throw new Error(_('A document must have at least one page.'));
    doc.removePage(num - 1);
    const map = identity(doc.getPageCount() + 1);
    map.splice(num - 1, 1);
    return { bytes: await doc.save(), map };
}

/** Sets page `num`'s rotation to 0, 90, 180 or 270 degrees (clockwise). */
export async function rotatePage(bytes, num, angle) {
    const { lib, doc } = await load(bytes);
    doc.getPage(num - 1).setRotation(lib.degrees(((angle % 360) + 360) % 360));
    return { bytes: await doc.save(), map: identity(doc.getPageCount()) };
}

/** Inserts every page of `otherBytes` after page `after` (0 = at the start). */
export async function importPages(bytes, otherBytes, after) {
    const { lib, doc } = await load(bytes);
    let other;
    try {
        other = await lib.PDFDocument.load(otherBytes, { updateMetadata: false });
    } catch (error) {
        if (/encrypt/i.test(error?.message || '')) throw new Error(_('Encrypted PDF files cannot be imported.'));
        throw new Error(_('The file is not a valid PDF document.') + ` (${error?.message || error})`);
    }
    const copied = await doc.copyPages(other, other.getPageIndices());
    copied.forEach((page, i) => doc.insertPage(after + i, page));
    const map = identity(doc.getPageCount() - copied.length);
    map.splice(after, 0, ...copied.map(() => null));
    return { bytes: await doc.save(), map, count: copied.length };
}

/** A new PDF holding only pages `nums` (1-based) of `bytes`. */
export async function extractPages(bytes, nums) {
    const { lib, doc } = await load(bytes);
    const out = await lib.PDFDocument.create();
    const copied = await out.copyPages(doc, nums.map(n => n - 1));
    copied.forEach(page => out.addPage(page));
    out.setProducer('Sandstorm Word light (pdf-lib)');
    return out.save();
}

/**
 * Prints pages `nums` (1-based) of `bytes`: each page is rendered to an
 * image at print resolution and printed from a hidden frame, so the result
 * looks the same in every browser (no dependence on a built-in PDF viewer).
 */
export async function printPages(bytes, nums) {
    const pdf = await openPdf(bytes);
    const images = [];
    try {
        for (const num of nums) {
            const page = await pdf.getPage(num);
            const viewport = page.getViewport({ scale: 2 });   // 144 dpi
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push({ src: canvas.toDataURL('image/png'), landscape: viewport.width > viewport.height });
        }
    } finally {
        pdf.destroy();
    }

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const d = frame.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><style>
        @page { margin: 0; }
        html, body { margin: 0; padding: 0; }
        img { display: block; width: 100%; height: auto; page-break-after: always; break-after: page; }
        img:last-child { page-break-after: auto; break-after: auto; }
    </style></head><body>${images.map(i => `<img src="${i.src}">`).join('')}</body></html>`);
    d.close();
    await Promise.all([...d.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    const win = frame.contentWindow;
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500), { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 60000);   // afterprint never fired
}
