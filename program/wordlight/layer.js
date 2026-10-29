/**
 * @file wordlight/layer.js
 * @description Word light's editing layer — the blocks users add on top of
 * PDF pages (KRAVSPEC_WORD_LIGHT.md 5.3). The PDF itself is never edited
 * here; blocks live as plain data and are only written into the file by
 * save.js.
 *
 * Block shape (all coordinates in PDF user-space points, origin bottom-left):
 *   { id, type: 'text'|'highlight'|'cover'|'comment'|'image', page,
 *     rect: [x1, y1, x2, y2],
 *     // text:    text, font ('helvetica'|'times'|'courier'), size, bold,
 *     //          italic, underline, color, align
 *     // highlight: color      cover: fill
 *     // comment: text, author, date      image: imageData (data URL) }
 *
 * Text line breaks are computed with the PDF fonts' own metrics
 * (save.js wrapText), so what is shown is what gets saved.
 *
 * Known limit: placement assumes unrotated pages (/Rotate 0).
 *
 * @module program/wordlight/layer
 */
import { prepareFont, wrapText, measure, LINE_HEIGHT, CSS_FONT } from './save.js';

const FAMILIES = ['helvetica', 'times', 'courier'];
const HISTORY_MAX = 100;
const COMMENT_SIZE = 18;

/**
 * @param {Object} opts
 * @param {Function} opts.getPages   - () => viewer.pages
 * @param {Function} opts.onChange   - called after every block change
 * @param {Function} opts.onSelect   - (block|null)
 * @param {Function} opts.onComment  - (block) a comment was created/clicked
 * @param {Function} opts.author     - () => current user's display name
 * @param {Function} [opts.sampleBackground] - (pageNum, rect) => '#rrggbb'|null
 * @param {Function} [opts.findTextAt] - async (pageInfo, pdfPoint) =>
 *        { text, rect, size?, font? } | null — the text line under a click
 */
export function createLayer(opts) {
    let blocks = [];
    let tool = 'select';
    let selectedId = null;
    let editing = null;          // { block, textarea, before }
    const undoStack = [];
    const redoStack = [];

    const textDefaults = {
        font: 'helvetica', size: 12, bold: false, italic: false, underline: false,
        color: '#000000', align: 'left',
    };
    const highlightColor = { value: '#ffe14d' };
    const coverFill = { value: '#ffffff' };
    const coverAuto = { value: true };   // cover takes the page's background colour

    // ── Fonts (all 12 standard faces, so rendering stays synchronous) ──────
    async function preload() {
        const jobs = [];
        for (const f of FAMILIES) for (const b of [false, true]) for (const i of [false, true]) jobs.push(prepareFont(f, b, i));
        await Promise.all(jobs);
    }

    // ── History ────────────────────────────────────────────────────────────
    function snapshot() { return JSON.stringify(blocks); }
    function pushHistory(before = snapshot()) {
        undoStack.push(before);
        if (undoStack.length > HISTORY_MAX) undoStack.shift();
        redoStack.length = 0;
    }
    function restore(json) {
        blocks = JSON.parse(json);
        if (!blocks.find(b => b.id === selectedId)) select(null);
        renderAll();
        opts.onChange?.();
    }
    function undo() {
        finishEditing();
        if (!undoStack.length) return;
        redoStack.push(snapshot());
        restore(undoStack.pop());
    }
    function redo() {
        finishEditing();
        if (!redoStack.length) return;
        undoStack.push(snapshot());
        restore(redoStack.pop());
    }
    function changed() {
        renderAll();
        opts.onChange?.();
    }

    // ── Geometry ───────────────────────────────────────────────────────────
    function pageInfo(num) { return opts.getPages()[num - 1]; }

    function toPdf(info, clientX, clientY) {
        const r = info.el.getBoundingClientRect();
        return info.viewport.convertToPdfPoint(clientX - r.left, clientY - r.top);
    }

    function normRect(a, b) {
        return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    }

    function toScreen(info, rect) {
        const [a, b, c, d] = info.viewport.convertToViewportRectangle(rect);
        return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
    }

    function textLines(b) {
        return wrapText(b.text || '', b, b.rect[2] - b.rect[0]);
    }

    /**
     * Recomputes a text block's height from its wrapped lines — or keeps a
     * taller box the user dragged out (`boxHeight`), never shorter than the text.
     */
    function fitTextHeight(b) {
        // Replacement lines grow to the right instead of wrapping
        if (b.autoWidth) {
            const widest = Math.max(0, ...(b.text || '').split(/\n/).map(l => measure(l, b)));
            b.rect[2] = Math.max(b.rect[2], b.rect[0] + widest + 2);
        }
        const n = Math.max(1, textLines(b).length);
        b.rect[1] = b.rect[3] - Math.max(n * b.size * LINE_HEIGHT, b.boxHeight || 0);
    }

    // ── Rendering ──────────────────────────────────────────────────────────
    function renderAll() {
        for (const info of opts.getPages()) renderPage(info);
    }

    function renderPage(info) {
        if (!info?.layer) return;
        bindPage(info);
        // Keep an open text editor in place — removing it would drop focus
        for (const child of [...info.layer.children]) {
            if (!child.classList.contains('wl-editor')) child.remove();
        }
        info.layer.dataset.tool = tool;
        const editor = info.layer.querySelector('.wl-editor');
        for (const b of blocks) {
            if (b.page !== info.num) continue;
            info.layer.insertBefore(blockEl(info, b), editor);
        }
        if (editing && editing.block.page === info.num) positionEditor(info);
    }

    function blockEl(info, b) {
        const el = document.createElement('div');
        el.className = `wl-block wl-${b.type}${b.id === selectedId ? ' selected' : ''}`;
        el.dataset.id = b.id;
        const box = toScreen(info, b.rect);
        const scale = info.viewport.scale;
        Object.assign(el.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });

        if (b.type === 'text') {
            Object.assign(el.style, {
                fontFamily: CSS_FONT[b.font],
                fontSize: (b.size * scale) + 'px',
                lineHeight: String(LINE_HEIGHT),
                fontWeight: b.bold ? '700' : '400',
                fontStyle: b.italic ? 'italic' : 'normal',
                textDecoration: b.underline ? 'underline' : 'none',
                color: b.color,
                textAlign: b.align,
            });
            for (const line of textLines(b)) {
                const ln = document.createElement('div');
                ln.className = 'wl-line';
                ln.textContent = line || ' ';
                el.appendChild(ln);
            }
            if (editing?.block.id === b.id) el.style.visibility = 'hidden';
        } else if (b.type === 'highlight') {
            el.style.background = b.color;
        } else if (b.type === 'cover') {
            el.style.background = b.fill;
        } else if (b.type === 'image') {
            const img = document.createElement('img');
            img.src = b.imageData;
            img.alt = '';
            img.draggable = false;
            el.appendChild(img);
        } else if (b.type === 'comment') {
            el.title = (b.author ? b.author + ': ' : '') + (b.text || '');
            el.innerHTML = '<svg viewBox="0 0 24 24"><path fill="#ffd25c" stroke="#a87b00" stroke-width="1" d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>';
        }

        if (b.id === selectedId && b.type !== 'comment') {
            const h = document.createElement('div');
            h.className = 'wl-handle';
            el.appendChild(h);
        }
        return el;
    }

    // ── Pointer interaction ────────────────────────────────────────────────
    function bindPage(info) {
        if (info.el._wlBound) return;
        info.el._wlBound = true;
        info.el.addEventListener('pointerdown', e => onPointerDown(info, e));
        info.el.addEventListener('dblclick', e => {
            const id = e.target.closest('.wl-block')?.dataset.id;
            const b = blocks.find(x => x.id === id);
            if (b?.type === 'text') startEditing(b);
            else if (b?.type === 'comment') opts.onComment?.(b);
        });
    }

    function onPointerDown(info, e) {
        if (e.button !== 0) return;
        if (e.target.closest('.wl-editor')) return;
        const blockNode = e.target.closest('.wl-block');
        const hit = blockNode ? blocks.find(b => b.id === blockNode.dataset.id) : null;
        finishEditing();

        if (tool === 'select' || (hit && tool !== 'text')) {
            if (!hit) { select(null); return; }
            e.preventDefault();
            select(hit.id);
            if (hit.type === 'comment') opts.onComment?.(hit);
            if (e.target.classList.contains('wl-handle')) startResize(info, hit, e);
            else startMove(info, hit, e);
            return;
        }

        e.preventDefault();
        const start = toPdf(info, e.clientX, e.clientY);

        if (tool === 'text') {
            if (hit?.type === 'text') { select(hit.id); startEditing(hit); return; }
            // As wide as the room to the page's right edge allows (24 pt margin), 60–320 pt
            const room = info.base.viewBox[2] - start[0] - 24;
            const width = Math.max(60, Math.min(320, room));
            const b = {
                id: newId(), type: 'text', page: info.num, text: '',
                ...textDefaults,
                rect: [start[0], start[1] - textDefaults.size * LINE_HEIGHT, start[0] + width, start[1]],
            };
            pushHistory();
            blocks.push(b);
            applyTool('select');
            select(b.id);
            changed();
            startEditing(b, { isNew: true });
            return;
        }

        if (tool === 'comment') {
            const b = {
                id: newId(), type: 'comment', page: info.num, text: '',
                author: opts.author?.() || '', date: new Date().toISOString(),
                rect: [start[0], start[1] - COMMENT_SIZE, start[0] + COMMENT_SIZE, start[1]],
            };
            pushHistory();
            blocks.push(b);
            setTool('select');
            select(b.id);
            changed();
            opts.onComment?.(b, { isNew: true });
            return;
        }

        if (tool === 'highlight' || tool === 'cover') startDrawRect(info, e, start);

        if (tool === 'replace') {
            Promise.resolve(opts.findTextAt?.(info, start)).then(hitLine => {
                if (hitLine) replaceText(info, hitLine);
            });
        }
    }

    /**
     * "Replace text": covers a text line (OCR line or PDF text run) with the
     * page's background colour and puts an editable text block with the
     * same text in the same place — one undo step. Size/font come from the
     * PDF when known; for OCR lines the standard font whose width matches
     * the line best is chosen and the size fitted to the line's width.
     */
    function replaceText(info, line) {
        const [lx1, ly1, lx2, ly2] = line.rect;
        const width = lx2 - lx1, height = ly2 - ly1;
        const pad = Math.max(0.5, height * 0.06);
        const coverRect = [lx1 - pad, ly1 - pad, lx2 + pad, ly2 + pad];
        const fill = opts.sampleBackground?.(info.num, coverRect) || '#ffffff';

        const text = line.text;
        const meta = (font, size) => ({ font, size, bold: false, italic: false });
        let font = line.font;
        let size = line.size;
        if (!font || !size) {
            // OCR: the box spans whatever the letters reach — ascenders (k, f,
            // capitals) and descenders (p, g, j) — so convert height to font
            // size by which of those the line contains.
            const asc = /[A-ZÅÄÖ0-9bdfhklt]/.test(text);
            const desc = /[gjpqy,;]/.test(text);
            const emShare = asc && desc ? 0.95 : asc ? 0.74 : desc ? 0.72 : 0.5;
            const guess = height / emShare;
            // Proportional faces only: a monospace guess from width alone is unreliable
            let best = null;
            for (const fam of ['helvetica', 'times']) {
                const w = measure(text, meta(fam, guess));
                const err = Math.abs(w - width);
                if (!best || err < best.err) best = { fam, err };
            }
            font = font || best.fam;
            // Fit the width, but stay close to the size the height suggests
            const unit = measure(text, meta(font, 1)) || 1;
            size = Math.min(guess * 1.15, Math.max(guess * 0.85, width / unit));
        }
        size = Math.round(size * 2) / 2;
        const blockW = Math.max(width, measure(text, meta(font, size))) + 2;
        // Centre the block's line box on the original line
        const top = ly2 + (size * LINE_HEIGHT - height) / 2;

        const cover = { id: newId(), type: 'cover', page: info.num, fill, rect: coverRect };
        const block = {
            id: newId(), type: 'text', page: info.num, text,
            font, size, bold: false, italic: false, underline: false,
            color: textDefaults.color, align: 'left',
            autoWidth: true,
            rect: [lx1, top - size * LINE_HEIGHT, lx1 + blockW, top],
        };
        pushHistory();
        blocks.push(cover, block);
        applyTool('select');
        select(block.id);
        changed();
        startEditing(block);
    }

    function startDrawRect(info, e, start) {
        const preview = document.createElement('div');
        preview.className = `wl-block wl-${tool} wl-preview`;
        preview.style.background = tool === 'highlight' ? highlightColor.value : coverFill.value;
        info.layer.appendChild(preview);
        const drawTool = tool;

        const move = ev => {
            const box = toScreen(info, normRect(start, toPdf(info, ev.clientX, ev.clientY)));
            Object.assign(preview.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
        };
        const up = ev => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            preview.remove();
            const rect = normRect(start, toPdf(info, ev.clientX, ev.clientY));
            if (rect[2] - rect[0] < 3 || rect[3] - rect[1] < 3) return;
            const b = { id: newId(), type: drawTool, page: info.num, rect };
            if (drawTool === 'highlight') b.color = highlightColor.value;
            else b.fill = (coverAuto.value && opts.sampleBackground?.(info.num, rect)) || coverFill.value;
            pushHistory();
            blocks.push(b);
            // The highlighter stays on for the next line; a cover is usually followed by a text block
            if (drawTool === 'cover') setTool('select');
            select(b.id);
            changed();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    function startMove(info, b, e) {
        const before = snapshot();
        const origin = toPdf(info, e.clientX, e.clientY);
        const startRect = b.rect.slice();
        let moved = false;
        const move = ev => {
            const p = toPdf(info, ev.clientX, ev.clientY);
            const dx = p[0] - origin[0], dy = p[1] - origin[1];
            if (!moved && Math.hypot(dx, dy) < 1) return;
            moved = true;
            b.rect = [startRect[0] + dx, startRect[1] + dy, startRect[2] + dx, startRect[3] + dy];
            renderPage(info);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (moved) { pushHistory(before); opts.onChange?.(); }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    function startResize(info, b, e) {
        e.stopPropagation();
        const before = snapshot();
        // Opposite (top-left on screen) corner stays put
        const box = toScreen(info, b.rect);
        const anchor = info.viewport.convertToPdfPoint(box.left, box.top);
        let moved = false;
        const move = ev => {
            moved = true;
            const p = toPdf(info, ev.clientX, ev.clientY);
            const r = normRect(anchor, p);
            if (r[2] - r[0] < 8) r[2] = r[0] + 8;
            if (r[3] - r[1] < 8) r[1] = r[3] - 8;
            b.rect = r;
            // A manual resize means the user wants this width (and wrapping)
            if (b.type === 'text') {
                b.autoWidth = false;
                b.rect[3] = anchor[1];
                b.boxHeight = Math.max(0, anchor[1] - p[1]);   // dragged height; text sets the minimum
                fitTextHeight(b);
            }
            renderPage(info);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (moved) { pushHistory(before); opts.onChange?.(); }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    // ── Text editing ───────────────────────────────────────────────────────
    function startEditing(b, { isNew = false } = {}) {
        finishEditing();
        const info = pageInfo(b.page);
        if (!info) return;
        const ta = document.createElement('textarea');
        ta.className = 'wl-editor';
        ta.value = b.text || '';
        ta.spellcheck = true;
        editing = { block: b, textarea: ta, before: isNew ? null : snapshot(), isNew };
        info.layer.appendChild(ta);
        renderPage(info);
        ta.addEventListener('input', () => autoGrow(ta));
        ta.addEventListener('keydown', ev => {
            if (ev.key === 'Escape') { ev.preventDefault(); finishEditing(); }
            ev.stopPropagation();   // keep Delete/Ctrl+Z inside the textarea
        });
        ta.addEventListener('blur', () => setTimeout(() => { if (editing?.textarea === ta) finishEditing(); }, 0));
        setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
    }

    function positionEditor(info) {
        const { block: b, textarea: ta } = editing;
        const box = toScreen(info, b.rect);
        const scale = info.viewport.scale;
        if (!ta.isConnected) info.layer.appendChild(ta);
        Object.assign(ta.style, {
            left: box.left + 'px', top: box.top + 'px', width: box.width + 'px',
            fontFamily: CSS_FONT[b.font], fontSize: (b.size * scale) + 'px', lineHeight: String(LINE_HEIGHT),
            fontWeight: b.bold ? '700' : '400', fontStyle: b.italic ? 'italic' : 'normal',
            textDecoration: b.underline ? 'underline' : 'none', color: b.color, textAlign: b.align,
            whiteSpace: b.autoWidth ? 'pre' : 'pre-wrap',
        });
        ta.dataset.minWidth = String(box.width);
        autoGrow(ta);
    }

    function autoGrow(ta) {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
        if (editing?.block.autoWidth) {
            ta.style.width = 'auto';
            ta.style.width = Math.max(Number(ta.dataset.minWidth) || 0, ta.scrollWidth + 2) + 'px';
        }
    }

    function finishEditing() {
        if (!editing) return;
        const { block: b, textarea: ta, before, isNew } = editing;
        editing = null;
        const text = ta.value.replace(/\s+$/, '');
        ta.remove();
        if (!text) {
            // Empty text block: drop it. A brand-new one leaves no undo step.
            if (isNew) undoStack.pop(); else pushHistory(before);
            blocks = blocks.filter(x => x.id !== b.id);
            if (selectedId === b.id) select(null);
        } else if (text !== b.text) {
            if (!isNew) pushHistory(before);
            b.text = text;
            fitTextHeight(b);
        }
        changed();
    }

    // ── Selection & formatting ─────────────────────────────────────────────
    function select(id) {
        if (selectedId === id) return;
        selectedId = id;
        renderAll();
        opts.onSelect?.(selected());
    }

    function selected() {
        return blocks.find(b => b.id === selectedId) || null;
    }

    /** Applies formatting to the selected/edited text block, or to the defaults. */
    function format(patch) {
        const b = editing?.block || selected();
        if (b?.type === 'text') {
            pushHistory();
            Object.assign(b, patch);
            fitTextHeight(b);
            changed();
            if (editing) { positionEditor(pageInfo(b.page)); editing.textarea.focus(); }
        } else if (b?.type === 'highlight' && patch.color) {
            pushHistory(); b.color = patch.color; changed();
        } else {
            // Nothing selected: the choice applies to the next text block
            Object.assign(textDefaults, patch);
        }
        opts.onSelect?.(selected());
    }

    function deleteSelected() {
        const b = selected();
        if (!b) return;
        pushHistory();
        blocks = blocks.filter(x => x.id !== b.id);
        select(null);
        changed();
    }

    function updateBlock(id, patch) {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        pushHistory();
        Object.assign(b, patch);
        changed();
    }

    function removeBlock(id) {
        if (!blocks.find(x => x.id === id)) return;
        pushHistory();
        blocks = blocks.filter(x => x.id !== id);
        if (selectedId === id) select(null);
        changed();
    }

    /**
     * Places an image at most 240 pt wide, centred on `at` (page-relative
     * screen pixels, e.g. the middle of what is visible) or on the page.
     */
    function addImage(dataUrl, naturalW, naturalH, pageNum, at = null) {
        const info = pageInfo(pageNum) || pageInfo(1);
        if (!info) return;
        const w = Math.min(240, naturalW * 0.75, info.base.width * 0.8);
        const h = w * (naturalH / naturalW);
        const [cx, cy] = at
            ? info.viewport.convertToPdfPoint(at.x, at.y)
            : info.viewport.convertToPdfPoint(info.viewport.width / 2, info.viewport.height / 2);
        const b = { id: newId(), type: 'image', page: info.num, imageData: dataUrl, rect: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] };
        pushHistory();
        blocks.push(b);
        setTool('select');
        select(b.id);
        changed();
    }

    function setTool(next) {
        finishEditing();
        applyTool(next);
    }

    /** Switches tool without closing an open text editor. */
    function applyTool(next) {
        tool = next;
        for (const info of opts.getPages()) if (info.layer) info.layer.dataset.tool = tool;
        opts.onTool?.(tool);
    }

    function setBlocks(list) {
        blocks = Array.isArray(list) ? list : [];
        undoStack.length = 0;
        redoStack.length = 0;
        selectedId = null;
        renderAll();
    }

    function focusBlock(id) {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        const info = pageInfo(b.page);
        info?.el.scrollIntoView({ block: 'nearest' });
        select(id);
    }

    return {
        preload, renderPage, renderAll, setBlocks, setTool, select, selected, format,
        deleteSelected, updateBlock, removeBlock, addImage, focusBlock, undo, redo, finishEditing,
        textDefaults, highlightColor, coverFill, coverAuto,
        get blocks() { return blocks; },
        get tool() { return tool; },
        get isEditing() { return !!editing; },
        get canUndo() { return undoStack.length > 0; },
        get canRedo() { return redoStack.length > 0; },
    };
}

function newId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
