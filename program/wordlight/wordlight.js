/**
 * @file wordlight/wordlight.js
 * @description Word light program window — view and block-edit PDF files
 * (KRAVSPEC_WORD_LIGHT.md). Lazy-loaded by `app.program.open()`;
 * registration lives in `setup.js`.
 *
 * Layout follows a classic word-processor shape: ribbon tabs (File, Home,
 * Insert, Review, View), a page-thumbnail navigation pane on the left, the
 * document on a grey workspace, a comments pane on the right and a status
 * bar with page count and zoom.
 *
 * Files are only read and written through the Explorer API
 * (`readFileBytes`/`writeFileBytes`, `windows.select.file`/`save.file`).
 * Rendering is in viewer.js (PDF.js, scripting off), the editing layer in
 * layer.js and writing in save.js (pdf-lib).
 *
 * @module program/wordlight/wordlight
 */
import { openPdf, readWordLightData, createViewer, renderThumb } from './viewer.js';
import { createLayer } from './layer.js';
import { buildPdf } from './save.js';
import { recognizePage, imageRegions } from './ocr.js';
import { movePage, insertBlank, deletePage, rotatePage, importPages, extractPages, printPages } from './pages.js';

const ICONS = {
    open:      'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
    save:      'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z',
    saveas:    'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7v-2H5V5h10v4H5v2h10.6L21 5.6V7l-4-4zm4.7 10.3-1-1a1 1 0 0 0-1.4 0L14 17.6V20h2.4l5.3-5.3a1 1 0 0 0 0-1.4z',
    download:  'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
    close:     'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
    undo:      'M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 20.2 16l2.4-.8A10.5 10.5 0 0 0 12.5 8z',
    redo:      'M18.4 10.6A10.5 10.5 0 0 0 1.4 15.2l2.4.8a8 8 0 0 1 12.8-3.6L13 16h9V7l-3.6 3.6z',
    select:    'M7 2v18l5-5 3.5 7 2.5-1.2-3.5-7H21z',
    text:      'M5 4v3h5.5v12h3V7H19V4z',
    image:     'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z',
    cover:     'M3 5h18v14H3z',
    comment:   'M21 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4v4l5-4h7a1 1 0 0 0 1-1V4z',
    highlight: 'M6 14l3 3v4h6v-4l3-3V9H6v5zm5-12h2v3h-2zM3.5 5.9 4.9 4.5 7 6.6 5.6 8zm13.5.7 2.1-2.1 1.4 1.4L18.4 8z',
    zoomin:    'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14zM12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z',
    zoomout:   'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14zM7 9h5v1H7z',
    fitwidth:  'M3 5v14h2V5H3zm16 0v14h2V5h-2zM7 11v2h3v2l3-3-3-3v2H7zm10 2v-2h-3V9l-3 3 3 3v-2h3z',
    fitpage:   'M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm0 2h14v14H5V5zm2 2v3h2V9h1V7H7zm7 0v2h1v1h2V7h-3zM7 14v3h3v-2H9v-1H7zm8 0v1h-1v2h3v-3h-2z',
    actual:    'M3 5v14h18V5H3zm16 12H5V7h14v10zM7 9h2v6H7zm4 0h2v2h-2zm0 4h2v2h-2zm4-4h2v6h-2z',
    pages:     'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
    comments:  'M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 4V4a1 1 0 0 1 1-1zm3 5v2h10V8H7zm0 4v2h7v-2H7z',
    alignleft: 'M3 4h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3z',
    aligncenter:'M3 4h18v2H3zm3 4h12v2H6zm-3 4h18v2H3zm3 4h12v2H6z',
    alignright:'M3 4h18v2H3zm6 4h12v2H9zm-6 4h18v2H3zm6 4h12v2H9z',
    trash:     'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    replace:   'M4 4h11v2H4V4zm0 4h7v2H4V8zm0 4h5v2H4v-2zm11.6-3.4 1.4-1.4 3.8 3.8-1.4 1.4-1-1-5.4 5.4V16h-2.2v-2.2l5.4-5.4-.6-.8zM4 18h16v2H4v-2z',
    autocolor: 'M12 3a9 9 0 1 0 0 18 1.5 1.5 0 0 0 1.1-2.5 1.5 1.5 0 0 1 1.1-2.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
    scan:      'M3 5a2 2 0 0 1 2-2h3v2H5v3H3V5zm13-2h3a2 2 0 0 1 2 2v3h-2V5h-3V3zM3 16h2v3h3v2H5a2 2 0 0 1-2-2v-3zm16 0h2v3a2 2 0 0 1-2 2h-3v-2h3v-3zM7 8h10v2H7zm0 3h10v2H7zm0 3h6v2H7z',
    print:     'M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-1-9H6v4h12V3z',
    pageadd:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 12h-3v3h-2v-3H8v-2h3V9h2v3h3v2zm-3-5V3.5L18.5 9H13z',
    pagebefore:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13l4-4 4 4h-3v5h-2v-5H8z',
    pageafter: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm3 5-4 4-4-4h3V9.5h2V14h3z',
    pageexport:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-1 2 4 4h-3v4h-2v-4H8l4-4z',
    pageimport:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-1 10-4-4h3v-4h2v4h3l-4 4z',
    rotate:    'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
    selectall: 'M3 5h2V3a2 2 0 0 0-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2a2 2 0 0 0-2-2zM5 21v-2H3a2 2 0 0 0 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8a2 2 0 0 0 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2zM7 17h10V7H7v10z',
    copy:      'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
    hruler:'M2 8h20v8H2V8zm2 2v4h16v-4h-1v2h-1v-2h-2v2h-1v-2h-2v3h-1v-3h-2v2H9v-2H7v2H6v-2H4z',
    vruler:    'M8 2h8v20H8V2zm2 2v16h4v-1h-2v-1h2v-2h-2v-1h2v-2h-3v-1h3V9h-2V8h2V6h-2V5h2V4h-4z',
    scanall:   'M4 6h2v14h12v2H6a2 2 0 0 1-2-2V6zm4-4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 4v2h8V6h-8zm0 4v2h8v-2h-8zm0 4v2h5v-2h-5z',
};

const svg = name => `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${ICONS[name]}"/></svg>`;
const esc = s => app.util.escapeHtml(String(s ?? ''));

function bigBtn(cmd, icon, label, extra = '') {
    return `<button class="aero-button wl-btn wl-big" data-cmd="${cmd}" type="button" ${extra}>${svg(icon)}<span>${esc(label)}</span><div class="after"></div></button>`;
}
function smallBtn(cmd, icon, label, extra = '') {
    return `<button class="aero-button wl-btn wl-small" data-cmd="${cmd}" type="button" title="${esc(label)}" ${extra}>${svg(icon)}<div class="after"></div></button>`;
}
/** A ribbon group: one row of controls; the group name is its tooltip. */
function group(label, body) {
    return `<div class="wl-group" title="${esc(label)}"><div class="wl-group-body">${body}</div></div>`;
}

function shellHTML() {
    const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
    return `
    <div class="wl-app wl-nodoc" tabindex="-1">
        <div class="wl-tabs" role="tablist">
            <button class="wl-tab" data-tab="file" type="button">${esc(_('File'))}</button>
            <button class="wl-tab active" data-tab="home" type="button">${esc(_('Home'))}</button>
            <button class="wl-tab" data-tab="insert" type="button">${esc(_('Insert'))}</button>
            <button class="wl-tab" data-tab="page" type="button">${esc(_('Page'))}</button>
            <button class="wl-tab" data-tab="review" type="button">${esc(_('Review'))}</button>
            <button class="wl-tab" data-tab="view" type="button">${esc(_('View'))}</button>
        </div>
        <div class="wl-ribbon">
            <div class="wl-panel" data-panel="file">
                ${group(_('Document'), bigBtn('open', 'open', _('Open')) + bigBtn('save', 'save', _('Save')) + bigBtn('saveas', 'saveas', _('Save As')))}
                ${group(_('Export'), bigBtn('download', 'download', _('Download PDF')))}
                ${group(_('Close'), bigBtn('close', 'close', _('Close')))}
            </div>
            <div class="wl-panel active" data-panel="home">
                ${group(_('Undo'), smallBtn('undo', 'undo', _('Undo') + ' (Ctrl+Z)') + smallBtn('redo', 'redo', _('Redo') + ' (Ctrl+Y)'))}
                ${group(_('Font'), `
                    <div class="wl-row">
                        <select class="def wl-select" data-format="font" title="${esc(_('Font'))}">
                            <option value="helvetica">Helvetica</option>
                            <option value="times">Times</option>
                            <option value="courier">Courier</option>
                        </select>
                        <select class="def wl-select wl-size" data-format="size" title="${esc(_('Font size'))}">
                            ${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="wl-row">
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="bold" type="button" title="${esc(_('Bold'))} (Ctrl+B)"><b>B</b><div class="after"></div></button>
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="italic" type="button" title="${esc(_('Italic'))} (Ctrl+I)"><i>I</i><div class="after"></div></button>
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="underline" type="button" title="${esc(_('Underline'))} (Ctrl+U)"><u>U</u><div class="after"></div></button>
                        <label class="wl-color" title="${esc(_('Font color'))}"><span>A</span><input type="color" data-format="color" value="#000000"></label>
                    </div>`)}
                ${group(_('Paragraph'), `
                    <div class="wl-row">
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="align" data-value="left" type="button" title="${esc(_('Align left'))}">${svg('alignleft')}<div class="after"></div></button>
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="align" data-value="center" type="button" title="${esc(_('Center'))}">${svg('aligncenter')}<div class="after"></div></button>
                        <button class="aero-button wl-btn wl-small wl-toggle" data-format="align" data-value="right" type="button" title="${esc(_('Align right'))}">${svg('alignright')}<div class="after"></div></button>
                    </div>`)}
                ${group(_('Tools'), bigBtn('tool:select', 'select', _('Select')) + bigBtn('tool:text', 'text', _('Text block')))}
            </div>
            <div class="wl-panel" data-panel="insert">
                ${group(_('Blocks'), bigBtn('tool:text', 'text', _('Text block')) + bigBtn('image', 'image', _('Image')))}
                ${group(_('Cover'), bigBtn('tool:cover', 'cover', _('Cover')) + bigBtn('coverauto', 'autocolor', _('Auto color'), `title="${esc(_('Use the background colour of the page'))}"`) + `<label class="wl-color wl-color-big" title="${esc(_('Cover color'))}"><span>${esc(_('Color'))}</span><input type="color" data-color="cover" value="#ffffff"></label>`)}
                ${group(_('Edit'), bigBtn('tool:replace', 'replace', _('Replace text'), `title="${esc(_('Click a line of text to cover it and type new text in its place'))}"`) + bigBtn('tool:select', 'select', _('Select')) + bigBtn('delete', 'trash', _('Delete')))}
            </div>
            <div class="wl-panel" data-panel="page">
                ${group(_('Page'), bigBtn('print', 'print', _('Print')) + bigBtn('pageafter', 'pageadd', _('New page after')) + bigBtn('exportpage', 'pageexport', _('Export page')) + bigBtn('importpages', 'pageimport', _('Import pages')))}
            </div>
            <div class="wl-panel" data-panel="review">
                ${group(_('Comments'), bigBtn('tool:comment', 'comment', _('New comment')) + bigBtn('togglecomments', 'comments', _('Show comments')))}
                ${group(_('Markup'), bigBtn('tool:highlight', 'highlight', _('Highlighter')) + `<label class="wl-color wl-color-big" title="${esc(_('Highlight color'))}"><span>${esc(_('Color'))}</span><input type="color" data-color="highlight" value="#ffe14d"></label>`)}
                ${group(_('Recognize text (OCR)'), bigBtn('ocrpage', 'scan', _('This page')) + bigBtn('ocrall', 'scanall', _('All pages')))}
            </div>
            <div class="wl-panel" data-panel="view">
                ${group(_('Zoom'), bigBtn('zoomin', 'zoomin', _('Zoom in')) + bigBtn('zoomout', 'zoomout', _('Zoom out')) + bigBtn('zoom100', 'actual', '100 %'))}
                ${group(_('Fit'), bigBtn('fitwidth', 'fitwidth', _('Page width')) + bigBtn('fitpage', 'fitpage', _('Whole page')))}
                ${group(_('Show'), bigBtn('togglenav', 'pages', _('Navigation pane')) + bigBtn('togglecomments', 'comments', _('Comments pane')))}
                ${group(_('Ruler'), bigBtn('toggleruler:x', 'hruler', _('Horizontal ruler')) + bigBtn('toggleruler:y', 'vruler', _('Vertical ruler')))}
            </div>
        </div>
        <div class="wl-main">
            <aside class="wl-nav">
                <div class="wl-pane-title">${esc(_('Pages'))}</div>
                <div class="wl-thumbs"></div>
            </aside>
            <div class="wl-docarea">
                <div class="wl-rcorner"></div>
                <canvas class="wl-ruler wl-hruler"></canvas>
                <canvas class="wl-ruler wl-vruler"></canvas>
                <div class="wl-guide" hidden></div>
                <div class="wl-work">
                    <div class="wl-empty">
                        <svg viewBox="0 0 24 24" class="wl-empty-icon"><use href="#ic-wordlight"></use></svg>
                        <div>${esc(_('Open a PDF document to get started.'))}</div>
                        <button class="aero-button wl-empty-open" data-cmd="open" type="button">${esc(_('Open…'))}<div class="after pulse"></div></button>
                    </div>
                </div>
            </div>
            <aside class="wl-comments hidden">
                <div class="wl-pane-title">${esc(_('Comments'))}</div>
                <div class="wl-comment-list"></div>
            </aside>
        </div>
        <div class="wl-status">
            <span class="wl-st-page"></span>
            <span class="wl-st-comments"></span>
            <span class="wl-st-msg"></span>
            <span class="wl-spacer"></span>
            <button class="aero-button xs wl-btn wl-zbtn" data-cmd="zoomout" type="button" title="${esc(_('Zoom out'))}">−<div class="after"></div></button>
            <input class="wl-zoom" type="range" min="25" max="400" step="5" value="100" title="${esc(_('Zoom'))}">
            <button class="aero-button xs wl-btn wl-zbtn" data-cmd="zoomin" type="button" title="${esc(_('Zoom in'))}">+<div class="after"></div></button>
            <span class="wl-st-zoom">100 %</span>
        </div>
        <input type="file" class="wl-img-input" accept="image/png,image/jpeg" hidden>
    </div>`;
}

export function start(os) {
    const initPath = app.wordlight?._pendingPath || null;
    if (app.wordlight) { app.wordlight._pendingPath = null; app.wordlight._pendingEntry = null; }
    app.dev.log(`start: initPath="${initPath}"`, 'Word light');

    const instanceId = 'wordlight-' + Date.now();
    os.addCSS('wordlight', os.config.local.ProgramRoot + 'wordlight/wordlight.css', true);

    os.ui.windowStart('wordlight', {
        id:         instanceId,
        title:      'Word light',
        windowIcon: true,
        resizable:  true,
        width:      '1040px',
        height:     '700px',
        body(windowobj) {
            const winId = windowobj?.windowId || instanceId;
            setTimeout(() => init(os, winId, initPath), 0);
            return shellHTML();
        }
    });
}

function init(os, winId, initPath) {
    const winEl = document.getElementById(`${winId}-win`);
    const root = winEl?.querySelector('.wl-app');
    if (!root) return;
    const $ = sel => root.querySelector(sel);
    const work = $('.wl-work');

    const state = { path: null, name: null, original: null, viewer: null, dirty: false, page: 1, token: 0, busy: false, ocr: {}, ocrRunning: false };

    const layer = createLayer({
        getPages:  () => state.viewer?.pages || [],
        onChange:  () => { setDirty(true); renderComments(); refreshStatus(); pageRedo.length = 0; },
        onSelect:  () => refreshFormat(),
        onComment: (b, opt) => openComment(b, opt),
        onTool:    () => refreshStatus(),
        author:    () => app.config?.user?.profile?.name || _('User'),
        sampleBackground: (num, rect) => state.viewer?.sampleBackground(num, rect) || null,
        findTextAt: (info, p) => findTextAt(info, p),
    });
    const fontsReady = layer.preload();

    // ── Title, status ──────────────────────────────────────────────────────
    function setTitle() {
        const name = state.name || _('Untitled');
        os.ui.windows.functions.updateTitle(winId, `${state.dirty ? '*' : ''}${name} — Word light`);
    }
    function setDirty(d) {
        if (state.dirty === d) return;
        state.dirty = d;
        setTitle();
    }
    function refreshStatus() {
        const total = state.viewer?.numPages || 0;
        $('.wl-st-page').textContent = total ? _('Page') + ` ${state.page} ` + _('of') + ` ${total}` : '';
        const n = layer.blocks.filter(b => b.type === 'comment').length;
        $('.wl-st-comments').textContent = n ? `${n} ` + (n === 1 ? _('comment') : _('comments')) : '';
        const pct = Math.round((state.viewer?.scale || 1) * 100);
        $('.wl-st-zoom').textContent = pct + ' %';
        $('.wl-zoom').value = String(pct);
        root.querySelectorAll('[data-cmd^="tool:"]').forEach(btn => btn.classList.toggle('active', btn.dataset.cmd === 'tool:' + layer.tool));
        root.querySelectorAll('[data-cmd="coverauto"]').forEach(btn => btn.classList.toggle('active', layer.coverAuto.value));
        work.dataset.tool = layer.tool;
        root.querySelectorAll('[data-cmd^="toggleruler:"]').forEach(btn => btn.classList.toggle('active', !!rulers[btn.dataset.cmd.slice(-1)]));
        drawRulers();
    }

    // ── Rulers (cm, as in Word) ────────────────────────────────────────────
    // Grey bands are the margins: header (top), footer (bottom), left and
    // right. Numbers count from the margin edge, outward into the margins
    // too. Drag a band's edge to change that margin.
    const docArea = $('.wl-docarea');
    const guide = $('.wl-guide');
    const rulers = { x: true, y: true };
    const margins = { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 };   // cm
    try {
        const saved = JSON.parse(localStorage.getItem('wordlight.rulers') || 'null');
        if (saved) { rulers.x = !!saved.x; rulers.y = !!saved.y; }
        const m = JSON.parse(localStorage.getItem('wordlight.margins') || 'null');
        if (m) for (const k of Object.keys(margins)) if (Number.isFinite(m[k])) margins[k] = m[k];
    } catch { /* storage unavailable: keep the defaults */ }
    const MARGIN_NAMES = { top: _('Header'), bottom: _('Footer'), left: _('Left margin'), right: _('Right margin') };
    let mouse = null;   // pointer position over the workspace, marked on the rulers
    let drag = null;    // { side, canvas } while a margin edge is dragged

    function toggleRuler(axis) {
        rulers[axis] = !rulers[axis];
        try { localStorage.setItem('wordlight.rulers', JSON.stringify(rulers)); } catch { /* ignore */ }
        refreshStatus();
    }

    /** The current page's box and scale, or null without a document. */
    function rulerPage() {
        const info = state.viewer?.pages[state.page - 1];
        if (!info) return null;
        return {
            rect:  info.el.getBoundingClientRect(),
            perCm: state.viewer.scale * 72 / 2.54,   // PDF.js: 1 pt = 1 CSS px at scale 1
            wCm:   info.base.width / 72 * 2.54,
            hCm:   info.base.height / 72 * 2.54,
        };
    }

    function drawRulers() {
        docArea.classList.toggle('no-hruler', !rulers.x);
        docArea.classList.toggle('no-vruler', !rulers.y);
        const page = rulerPage();
        if (rulers.x) drawRuler($('.wl-hruler'), 'x', page);
        if (rulers.y) drawRuler($('.wl-vruler'), 'y', page);
    }

    /** Ruler-local geometry for one axis: page start/end, text area lo/hi. */
    function rulerGeom(canvas, axis, page) {
        const r = canvas.getBoundingClientRect();
        const horiz = axis === 'x';
        const start = horiz ? page.rect.left - r.left : page.rect.top - r.top;
        const end = start + (horiz ? page.rect.width : page.rect.height);
        const lo = start + (horiz ? margins.left : margins.top) * page.perCm;
        const hi = end - (horiz ? margins.right : margins.bottom) * page.perCm;
        return { r, horiz, start, end, lo, hi };
    }

    function drawRuler(canvas, axis, page) {
        const dpr = window.devicePixelRatio || 1;
        const cr = canvas.getBoundingClientRect();
        const w = Math.round(cr.width), h = Math.round(cr.height);
        if (!w || !h) return;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!page) return;

        const { r, horiz, start, end, lo, hi } = rulerGeom(canvas, axis, page);
        const len = horiz ? w : h, thick = horiz ? h : w;
        const along = (pos, across, l, t) => horiz ? ctx.fillRect(pos, across, l, t) : ctx.fillRect(across, pos, t, l);
        const span = (a, b) => { const x = Math.max(0, a), y = Math.min(len, b); if (y > x) along(x, 2, y - x, thick - 4); };

        // Margins (header, footer, sides) grey, text area white — as Word's ruler band
        ctx.fillStyle = 'rgba(185, 185, 185, 0.92)';
        span(start, end);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        span(lo, hi);
        ctx.fillStyle = '#777';
        for (const edge of [lo, hi]) if (edge >= 0 && edge <= len) along(Math.round(edge) - 0.5, 2, 1, thick - 4);

        // Ticks every 0.25 cm, numbers every cm counted from the top/left margin edge
        const perCm = page.perCm, step = perCm / 4;
        const first = Math.ceil((Math.max(0, start) - lo) / step), last = Math.floor((Math.min(len, end) - lo) / step);
        ctx.fillStyle = '#444';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = first; i <= last; i++) {
            const pos = Math.round(lo + i * step) + 0.5;
            if (pos < start || pos > end) continue;
            if (i % 4 === 0) {
                const n = Math.abs(i / 4);
                if (n === 0 || (perCm < 14 && n % 2)) continue;   // too tight: every other number
                const label = String(n);
                if (horiz) ctx.fillText(label, pos, thick / 2 + 0.5);
                else { ctx.save(); ctx.translate(thick / 2 + 0.5, pos); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
            } else if (step >= 3) {
                const tick = i % 2 ? 3 : 6;
                along(pos - 0.5, (thick - tick) / 2, 1, tick);
            }
        }

        // Pointer position
        if (mouse) {
            const pos = Math.round(horiz ? mouse.x - r.left : mouse.y - r.top) + 0.5;
            if (pos >= 0 && pos <= len) { ctx.fillStyle = '#3b78c4'; along(pos - 0.5, 2, 1, thick - 4); }
        }
    }

    /** The margin edge under the pointer on a ruler (within 4 px), if any. */
    function marginAt(canvas, e) {
        const page = rulerPage();
        if (!page) return null;
        const axis = canvas.classList.contains('wl-hruler') ? 'x' : 'y';
        const g = rulerGeom(canvas, axis, page);
        const pos = g.horiz ? e.clientX - g.r.left : e.clientY - g.r.top;
        if (Math.abs(pos - g.lo) <= 4) return axis === 'x' ? 'left' : 'top';
        if (Math.abs(pos - g.hi) <= 4) return axis === 'x' ? 'right' : 'bottom';
        return null;
    }

    /** Dashed line across the workspace at a margin, with its name and size. */
    function showGuide(side) {
        const page = rulerPage();
        if (!page || !side) { guide.hidden = true; return; }
        const d = docArea.getBoundingClientRect(), wr = work.getBoundingClientRect();
        const vertical = side === 'left' || side === 'right';
        const pos = side === 'left'  ? page.rect.left + margins.left * page.perCm
                  : side === 'right' ? page.rect.right - margins.right * page.perCm
                  : side === 'top'   ? page.rect.top + margins.top * page.perCm
                  :                    page.rect.bottom - margins.bottom * page.perCm;
        guide.hidden = false;
        guide.className = 'wl-guide ' + (vertical ? 'v' : 'h');
        Object.assign(guide.style, vertical
            ? { left: (pos - d.left) + 'px', top: (wr.top - d.top) + 'px', width: '', height: wr.height + 'px' }
            : { top: (pos - d.top) + 'px', left: (wr.left - d.left) + 'px', height: '', width: wr.width + 'px' });
        guide.textContent = `${MARGIN_NAMES[side]}: ${margins[side].toFixed(2).replace('.', ',')} cm`;
    }

    root.querySelectorAll('.wl-ruler').forEach(canvas => {
        canvas.addEventListener('pointermove', e => {
            if (drag?.canvas === canvas) {
                const page = rulerPage();
                if (!page) return;
                const side = drag.side;
                const sizeCm = side === 'left' || side === 'right' ? page.wCm : page.hCm;
                const other = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side];
                const cm = side === 'left'  ? (e.clientX - page.rect.left) / page.perCm
                         : side === 'right' ? (page.rect.right - e.clientX) / page.perCm
                         : side === 'top'   ? (e.clientY - page.rect.top) / page.perCm
                         :                    (page.rect.bottom - e.clientY) / page.perCm;
                // Snap to 0.25 cm and keep at least 1 cm of text area
                margins[side] = Math.min(Math.max(0, Math.round(cm * 4) / 4), sizeCm - margins[other] - 1);
                drawRulers();
                showGuide(side);
                return;
            }
            const side = marginAt(canvas, e);
            canvas.style.cursor = side ? (side === 'left' || side === 'right' ? 'ew-resize' : 'ns-resize') : '';
            canvas.title = side ? MARGIN_NAMES[side] : '';
        });
        canvas.addEventListener('pointerdown', e => {
            const side = e.button === 0 && marginAt(canvas, e);
            if (!side) return;
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            drag = { side, canvas };
            showGuide(side);
        });
        const endDrag = () => {
            if (!drag) return;
            drag = null;
            guide.hidden = true;
            try { localStorage.setItem('wordlight.margins', JSON.stringify(margins)); } catch { /* ignore */ }
        };
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);
    });

    work.addEventListener('scroll', () => drawRulers(), { passive: true });
    work.addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; drawRulers(); });
    work.addEventListener('pointerleave', () => { mouse = null; drawRulers(); });
    new ResizeObserver(() => drawRulers()).observe(work);
    let msgTimer = null;
    function flash(msg) {
        $('.wl-st-msg').textContent = msg;
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => { $('.wl-st-msg').textContent = ''; }, 3000);
    }
    function showError(title, error) {
        app.ui.alert({
            title,
            body: () => `<p style="margin:0;line-height:1.5;">${esc(error?.message || error)}</p>`,
            confirm: _('OK'),
            onConfirm: () => {},   // without a handler the OK button does nothing
        });
    }

    // ── Formatting controls ────────────────────────────────────────────────
    function refreshFormat() {
        const b = layer.selected();
        const src = b?.type === 'text' ? b : layer.textDefaults;
        $('[data-format="font"]').value = src.font;
        $('[data-format="size"]').value = String(src.size);
        $('[data-format="color"]').value = src.color;
        for (const key of ['bold', 'italic', 'underline']) $(`[data-format="${key}"]`).classList.toggle('active', !!src[key]);
        root.querySelectorAll('[data-format="align"]').forEach(btn => btn.classList.toggle('active', btn.dataset.value === src.align));
    }

    // ── Loading ────────────────────────────────────────────────────────────
    async function loadPath(path) {
        try {
            state.busy = true;
            flash(_('Opening…'));
            const bytes = await app.explorer.readFileBytes(path);
            await loadBytes(bytes, path);
        } catch (error) {
            showError(_('Could not open the file'), error);
        } finally {
            state.busy = false;
        }
    }

    async function loadBytes(bytes, path) {
        const token = ++state.token;
        let pdf;
        try {
            pdf = await openPdf(bytes);
        } catch (error) {
            if (error?.name === 'PasswordException') throw new Error(_('Password-protected PDF files are not supported yet.'));
            throw new Error(_('The file is not a valid PDF document.') + ` (${error?.message || error})`);
        }
        let original = bytes;
        let blocks = [];
        let ocr = {};
        const wl = await readWordLightData(pdf);
        if (wl) {
            // Saved by Word light: show the original with the blocks editable again
            await pdf.destroy();
            pdf = await openPdf(wl.original);
            original = wl.original;
            blocks = wl.blocks;
            ocr = wl.ocr || {};
        }
        await fontsReady;
        if (token !== state.token) { pdf.destroy(); return; }

        state.path = path;
        state.name = path ? path.split('/').pop() : null;
        pageUndo.length = 0;
        pageRedo.length = 0;
        if (!(await showDocument(pdf, token, { original, blocks, ocr }))) return;
        state.dirty = true; setDirty(false); setTitle();
        if (blocks.some(b => b.type === 'comment')) $('.wl-comments').classList.remove('hidden');
        flash(state.name ? _('Opened') + ' ' + state.name : '');
        app.dev.log(`Opened ${path} (${state.viewer.numPages} pages, ${blocks.length} blocks)`, 'Word light');
    }

    /**
     * Shows a document in the viewer. Without `keep` it starts at page 1
     * fitted to the width; with `keep: { scale, page }` (after a page edit)
     * it stays at that zoom and page.
     * @returns {Promise<boolean>} false if another load took over meanwhile
     */
    async function showDocument(pdf, token, { original, blocks, ocr, keep = null }) {
        state.viewer?.destroy();
        textCache.clear();
        state.original = original;
        root.classList.remove('wl-nodoc');   // a document is open: show the whole program
        state.page = 1;
        state.viewer = createViewer(work, pdf, {
            onPageLayer:   info => layer.renderPage(info),
            onCurrentPage: n => { state.page = n; refreshStatus(); markThumb(n); },
        });
        await state.viewer.ready;
        if (token !== state.token) return false;
        layer.setBlocks(blocks);
        if (!keep) layer.setTool('select');
        state.ocr = ocr;
        for (const [num, lines] of Object.entries(ocr)) state.viewer.setOcr(Number(num), lines);
        if (keep) {
            state.viewer.setScale(keep.scale);
            const page = Math.min(Math.max(1, keep.page), state.viewer.numPages);
            state.viewer.goTo(page);
            state.page = page;
        } else {
            state.viewer.fitWidth();
        }
        renderComments();
        refreshStatus();
        refreshFormat();
        buildThumbs(pdf, token);
        markThumb(state.page);
        return true;
    }

    // ── Page edits (pages.js) ──────────────────────────────────────────────
    // Each edit replaces the original, so it gets its own undo history; the
    // block history is cleared by it, which keeps Ctrl+Z in the right order
    // (block edits after a page edit are undone first, then the page edit).
    const pageUndo = [], pageRedo = [];
    let pageBusy = false;

    function snapshotDoc() {
        return { original: state.original, blocks: JSON.parse(JSON.stringify(layer.blocks)), ocr: state.ocr, page: state.page };
    }

    async function restoreDoc(snap, goTo = snap.page) {
        const token = ++state.token;
        const pdf = await openPdf(snap.original);
        if (token !== state.token) { pdf.destroy(); return; }
        await showDocument(pdf, token, {
            original: snap.original, blocks: snap.blocks, ocr: snap.ocr,
            keep: { scale: state.viewer?.scale || 1, page: goTo },
        });
        setDirty(true);
    }

    /**
     * Runs a pages.js edit on the original, moves blocks and OCR text along
     * with their pages (`map`: new page → old page number or null) and shows
     * the result at page `goTo(map)`.
     */
    async function pageEdit(edit, goTo) {
        if (!state.original || pageBusy) return;
        layer.finishEditing();
        pageBusy = true;
        try {
            const before = snapshotDoc();
            const { bytes, map } = await edit(state.original);
            const newNum = {};
            map.forEach((old, i) => { if (old) newNum[old] = i + 1; });
            const blocks = layer.blocks.filter(b => newNum[b.page]).map(b => ({ ...b, page: newNum[b.page] }));
            const ocr = {};
            for (const [num, lines] of Object.entries(state.ocr || {})) if (newNum[num]) ocr[newNum[num]] = lines;
            pageUndo.push(before);
            pageRedo.length = 0;
            await restoreDoc({ original: bytes, blocks, ocr }, goTo(map, newNum));
        } catch (error) {
            showError(_('Could not change the pages'), error);
        } finally {
            pageBusy = false;
        }
    }

    async function undoPages(from, to) {
        if (!from.length || pageBusy) return;
        pageBusy = true;
        try {
            to.push(snapshotDoc());
            await restoreDoc(from.pop());
        } catch (error) {
            showError('Word light', error);
        } finally {
            pageBusy = false;
        }
    }

    const insertPageAt = (at, like) => pageEdit(bytes => insertBlank(bytes, at, like), () => at);
    const movePageTo = (from, to) => from !== to && pageEdit(bytes => movePage(bytes, from, to), () => to);
    const removePage = num => pageEdit(bytes => deletePage(bytes, num), map => Math.min(num, map.length));
    const rotatePageTo = (num, angle) => pageEdit(bytes => rotatePage(bytes, num, angle), () => num);

    async function cmdPrint(nums) {
        if (!state.original) return;
        layer.finishEditing();
        try {
            flash(_('Preparing print…'));
            const bytes = await buildPdf(state.original, layer.blocks, state.ocr);
            await printPages(bytes, nums || state.viewer.pages.map(p => p.num));
            flash('');
        } catch (error) {
            showError(_('Could not print'), error);
        }
    }

    async function cmdExportPage(num = state.page) {
        if (!state.original) return;
        layer.finishEditing();
        const path = await app.explorer.windows.save.file({
            types: ['pdf'],
            parentId: winId,
            statusText: _('The program is waiting for the user'),
            dialogTitle: _('Export page'),
        });
        if (!path) return;
        try {
            const full = await buildPdf(state.original, layer.blocks, state.ocr);
            const bytes = await extractPages(full, [num]);
            const target = /\.pdf$/i.test(path) ? path : path + '.pdf';
            await app.explorer.writeFileBytes(target, bytes, 'application/pdf');
            flash(_('Exported') + ' ' + target.split('/').pop());
        } catch (error) {
            showError(_('Could not create the PDF'), error);
        }
    }

    async function cmdImportPages() {
        if (!state.original) return;
        const path = await app.explorer.windows.select.file({
            types: ['pdf'],
            parentId: winId,
            statusText: _('The program is waiting for the user'),
            dialogTitle: _('Import pages'),
        });
        if (!path) return;
        let other;
        try {
            other = await app.explorer.readFileBytes(path);
        } catch (error) {
            showError(_('Could not open the file'), error);
            return;
        }
        const after = state.page;
        await pageEdit(bytes => importPages(bytes, other, after), () => after + 1);
    }

    async function buildThumbs(pdf, token) {
        const box = $('.wl-thumbs');
        box.innerHTML = '';
        const pages = state.viewer.pages;
        for (const info of pages) {
            // A div, not a button: Firefox does not drag buttons
            const item = document.createElement('div');
            item.setAttribute('role', 'button');
            item.tabIndex = 0;
            item.className = 'wl-thumb';
            item.draggable = true;
            item.dataset.page = String(info.num);
            item.innerHTML = `<div class="wl-thumb-img" style="aspect-ratio:${info.base.width}/${info.base.height}"></div><span>${info.num}</span>`;
            item.addEventListener('click', () => state.viewer?.goTo(info.num));
            box.appendChild(item);
        }
        markThumb(1);
        for (const info of pages) {
            if (token !== state.token) return;
            try {
                const canvas = await renderThumb(info.pdfPage);
                box.querySelector(`[data-page="${info.num}"] .wl-thumb-img`)?.appendChild(canvas);
            } catch { /* page failed to render — keep the blank frame */ }
        }
    }

    function markThumb(n) {
        root.querySelectorAll('.wl-thumb').forEach(t => t.classList.toggle('active', t.dataset.page === String(n)));
    }

    // ── Pages pane: drag to reorder, right-click to insert ─────────────────
    const thumbs = $('.wl-thumbs');
    let dragFrom = 0;
    const clearDrop = () => thumbs.querySelectorAll('.drop-before, .drop-after').forEach(t => t.classList.remove('drop-before', 'drop-after'));
    /** Thumbnail under the pointer and whether the drop goes before or after it. */
    function dropTarget(e) {
        const item = e.target.closest('.wl-thumb') || [...thumbs.querySelectorAll('.wl-thumb')].pop();
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return { item, num: Number(item.dataset.page), after: e.clientY > r.top + r.height / 2 };
    }
    thumbs.addEventListener('dragstart', e => {
        const item = e.target.closest('.wl-thumb');
        if (!item || pageBusy) { e.preventDefault(); return; }
        dragFrom = Number(item.dataset.page);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(dragFrom));
        item.classList.add('dragging');
    });
    thumbs.addEventListener('dragover', e => {
        if (!dragFrom) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const t = dropTarget(e);
        clearDrop();
        if (t) t.item.classList.add(t.after ? 'drop-after' : 'drop-before');
    });
    thumbs.addEventListener('dragleave', e => { if (!thumbs.contains(e.relatedTarget)) clearDrop(); });
    thumbs.addEventListener('drop', e => {
        if (!dragFrom) return;
        e.preventDefault();
        const t = dropTarget(e);
        clearDrop();
        const from = dragFrom;
        dragFrom = 0;
        if (!t) return;
        // Position in the list without the dragged page
        let to = t.num + (t.after ? 1 : 0);
        if (from < to) to--;
        movePageTo(from, to);
    });
    thumbs.addEventListener('dragend', () => {
        dragFrom = 0;
        clearDrop();
        thumbs.querySelectorAll('.dragging').forEach(t => t.classList.remove('dragging'));
    });

    const menuIcon = name => `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="${ICONS[name]}"/></svg>`;
    let ctxPage = 0;   // page that was right-clicked (thumbnail or page)
    let ctxSelection = '';
    thumbs.addEventListener('contextmenu', e => {
        ctxPage = Number(e.target.closest('.wl-thumb')?.dataset.page || 0);
    }, true);
    app.ui.contextMenu(thumbs, {
        callback: () => {
            if (!ctxPage || !state.original) return [];
            const num = ctxPage;
            const info = state.viewer?.pages[num - 1];
            return [
                { title: _('New page before'), icon: menuIcon('pagebefore'), callback: () => insertPageAt(num, num) },
                { title: _('New page after'),  icon: menuIcon('pageafter'),  callback: () => insertPageAt(num + 1, num) },
                ...(info ? rotateItems(info) : []),
                { title: _('Delete page'),     icon: menuIcon('trash'),      callback: () => removePage(num) },
            ];
        },
    });

    /**
     * The four rotations as menu rows, the current one ticked. Straight in
     * the menu: a hover submenu closes again when its row is clicked.
     */
    function rotateItems(info) {
        const angle = ((info.pdfPage.rotate || 0) % 360 + 360) % 360;
        return [0, 90, 180, 270].map(a => ({
            title: `${_('Rotate')} ${a}°`,
            icon: menuIcon('rotate'),
            alt: a === angle ? '✓' : '',
            callback: () => { if (a !== angle) rotatePageTo(info.num, a); },
        }));
    }

    // ── Right-click on a page: copy, select, rotate, print ─────────────────
    work.addEventListener('contextmenu', e => {
        ctxPage = Number(e.target.closest('.wl-page')?.dataset.page || 0);
        ctxSelection = String(window.getSelection() || '');
    }, true);
    app.ui.contextMenu(work, {
        exclude: 'textarea, input',
        callback: () => {
            const info = ctxPage && state.viewer?.pages[ctxPage - 1];
            if (!info) return [];
            const num = ctxPage, text = ctxSelection;
            const items = [];
            if (text) items.push({ title: _('Copy'), icon: menuIcon('copy'), alt: 'Ctrl+C', callback: () => navigator.clipboard?.writeText(text).catch(() => {}) });
            items.push(
                { title: _('Select all text'), icon: menuIcon('selectall'), callback: () => selectPageText(info) },
                ...rotateItems(info),
                { title: _('Print page'), icon: menuIcon('print'), callback: () => cmdPrint([num]) },
            );
            return items;
        },
    });

    /** Selects all text on a page (PDF text layer and OCR text). */
    function selectPageText(info) {
        const layers = [info.text, info.ocrEl].filter(el => el?.textContent.trim());
        if (!layers.length) { flash(_('This page has no text to select.')); return; }
        const range = document.createRange();
        range.setStartBefore(layers[0].firstChild || layers[0]);
        const last = layers[layers.length - 1];
        range.setEndAfter(last.lastChild || last);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // ── Saving ─────────────────────────────────────────────────────────────
    async function confirmDiscard() {
        if (!state.dirty) return true;
        return new Promise(resolve => {
            app.ui.confirm({
                title:   'Word light',
                body:    () => `<p style="margin:0;line-height:1.5;">${esc(_('You have unsaved changes. Discard them?'))}</p>`,
                confirm: _('Discard changes'),
                cancel:  _('Cancel'),
                onConfirm: () => resolve(true),
                onCancel:  () => resolve(false),
            });
        });
    }

    async function cmdOpen() {
        if (!(await confirmDiscard())) return;
        const path = await app.explorer.windows.select.file({
            types: ['pdf'],
            parentId: winId,
            statusText: _('The program is waiting for the user'),
            dialogTitle: _('Open'),
        });
        if (path) await loadPath(path);
    }

    async function writeTo(path) {
        if (!state.original) return false;
        layer.finishEditing();
        try {
            flash(_('Saving…'));
            const bytes = await buildPdf(state.original, layer.blocks, state.ocr);
            await app.explorer.writeFileBytes(path, bytes, 'application/pdf');
            state.path = path;
            state.name = path.split('/').pop();
            state.dirty = true; setDirty(false); setTitle();
            flash(_('Saved') + ' ' + state.name);
            return true;
        } catch (error) {
            showError(_('Could not save the file'), error);
            return false;
        }
    }

    async function cmdSave() {
        if (!state.original) return;
        if (!state.path) return cmdSaveAs();
        await writeTo(state.path);
    }

    async function cmdSaveAs() {
        if (!state.original) return;
        const path = await app.explorer.windows.save.file({
            types: ['pdf'],
            parentId: winId,
            statusText: _('The program is waiting for the user'),
            dialogTitle: _('Save As'),
        });
        if (!path) return;
        await writeTo(/\.pdf$/i.test(path) ? path : path + '.pdf');
    }

    async function cmdDownload() {
        if (!state.original) return;
        layer.finishEditing();
        try {
            const bytes = await buildPdf(state.original, layer.blocks, state.ocr);
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = state.name || 'document.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            flash(_('Downloaded') + ' ' + a.download);
        } catch (error) {
            showError(_('Could not create the PDF'), error);
        }
    }

    // ── Comments pane ──────────────────────────────────────────────────────
    function renderComments() {
        const list = $('.wl-comment-list');
        const comments = layer.blocks
            .filter(b => b.type === 'comment')
            .sort((a, b) => a.page - b.page || b.rect[3] - a.rect[3]);
        if (!comments.length) {
            list.innerHTML = `<div class="wl-comment-empty">${esc(_('No comments. Use Review → New comment and click on the page.'))}</div>`;
            return;
        }
        list.innerHTML = comments.map(c => `
            <div class="wl-citem" data-id="${esc(c.id)}">
                <div class="wl-comment-head">
                    <strong>${esc(c.author || _('User'))}</strong>
                    <span>${esc(_('Page'))} ${c.page} · ${esc(new Date(c.date).toLocaleString())}</span>
                    <button class="wl-comment-del" type="button" title="${esc(_('Delete'))}">${svg('trash')}</button>
                </div>
                <textarea class="def wl-comment-text" rows="2" placeholder="${esc(_('Write a comment…'))}">${esc(c.text)}</textarea>
            </div>`).join('');
    }

    function openComment(b, { isNew = false } = {}) {
        $('.wl-comments').classList.remove('hidden');
        renderComments();
        const item = root.querySelector(`.wl-citem[data-id="${CSS.escape(b.id)}"]`);
        if (!item) return;
        root.querySelectorAll('.wl-citem').forEach(c => c.classList.toggle('active', c === item));
        item.scrollIntoView({ block: 'nearest' });
        // After the pointerdown that created it has finished bubbling
        if (isNew) setTimeout(() => item.querySelector('textarea')?.focus(), 0);
    }

    root.addEventListener('focusout', e => {
        const ta = e.target.closest?.('.wl-comment-text');
        if (!ta) return;
        const id = ta.closest('.wl-citem').dataset.id;
        const b = layer.blocks.find(x => x.id === id);
        if (!b) return;
        const text = ta.value.trim();
        if (!text) layer.removeBlock(id);          // an empty comment is dropped
        else if (text !== b.text) layer.updateBlock(id, { text });
    });
    root.addEventListener('click', e => {
        const del = e.target.closest('.wl-comment-del');
        if (del) { layer.removeBlock(del.closest('.wl-citem').dataset.id); return; }
        const item = e.target.closest('.wl-citem');
        if (item && !e.target.closest('textarea')) layer.focusBlock(item.dataset.id);
    });

    // ── Text lines for "Replace text" ──────────────────────────────────────
    // PDF text runs per page (async, cached) and OCR lines, in PDF points.
    const textCache = new Map();      // num -> Promise<lines>
    const textReady = new Map();      // num -> lines, once resolved

    function pageTextItems(info) {
        if (!textCache.has(info.num)) {
            const job = info.pdfPage.getTextContent().then(tc => {
                const lines = [];
                for (const it of tc.items) {
                    if (!it.str || !it.str.trim()) continue;
                    const [a, b, c, d, e, f] = it.transform;
                    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue;   // rotated text: skip
                    const h = Math.abs(d) || it.height || Math.abs(a);
                    const fam = tc.styles[it.fontName]?.fontFamily || '';
                    lines.push({
                        text: it.str,
                        rect: [e, f - h * 0.22, e + it.width, f + h * 0.78],
                        size: h,
                        font: /mono/i.test(fam) ? 'courier' : (/serif/i.test(fam) && !/sans/i.test(fam)) ? 'times' : 'helvetica',
                    });
                }
                textReady.set(info.num, lines);
                return lines;
            }).catch(() => []);
            textCache.set(info.num, job);
        }
        return textCache.get(info.num);
    }

    function hitLine(list, p) {
        return (list || []).find(l => p[0] >= l.rect[0] - 1 && p[0] <= l.rect[2] + 1 && p[1] >= l.rect[1] - 1 && p[1] <= l.rect[3] + 1) || null;
    }

    async function findTextAt(info, p) {
        return hitLine(state.ocr[info.num], p) || hitLine(await pageTextItems(info), p);
    }

    // Dashed outline on the line that "Replace text" would take
    let hoverEl = null;
    work.addEventListener('pointermove', e => {
        if (layer.tool !== 'replace' || !state.viewer) { hoverEl?.remove(); return; }
        const pageEl = e.target.closest('.wl-page');
        const info = pageEl && state.viewer.pages[Number(pageEl.dataset.page) - 1];
        if (!info) { hoverEl?.remove(); return; }
        const r = pageEl.getBoundingClientRect();
        const p = info.viewport.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top);
        const line = hitLine(state.ocr[info.num], p) || hitLine(textReady.get(info.num), p);
        if (!line) { hoverEl?.remove(); return; }
        const [a, b, c, d] = info.viewport.convertToViewportRectangle(line.rect);
        hoverEl = hoverEl || Object.assign(document.createElement('div'), { className: 'wl-hover' });
        Object.assign(hoverEl.style, {
            left: Math.min(a, c) - 2 + 'px', top: Math.min(b, d) - 2 + 'px',
            width: Math.abs(c - a) + 4 + 'px', height: Math.abs(d - b) + 4 + 'px',
        });
        if (hoverEl.parentNode !== pageEl) pageEl.appendChild(hoverEl);
    });
    work.addEventListener('pointerleave', () => hoverEl?.remove());

    // ── OCR (scanned pages and images) ─────────────────────────────────────
    /** Share of rect `a` that lies inside rect `b` (PDF points). */
    function overlapShare(a, b) {
        const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
        const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
        if (w <= 0 || h <= 0) return 0;
        return (w * h) / Math.max(1e-6, (a[2] - a[0]) * (a[3] - a[1]));
    }

    async function runOcr(nums) {
        if (!state.viewer || state.ocrRunning || !nums.length) return;
        state.ocrRunning = true;
        const token = state.token;
        let done = 0, found = 0, skipped = 0;
        try {
            for (const num of nums) {
                const info = state.viewer.pages[num - 1];
                if (!info) continue;
                const progress = (fraction, phase) => {
                    const pct = Math.round(fraction * 100);
                    $('.wl-st-msg').textContent = phase === 'load'
                        ? _('Loading OCR engine…') + ` ${pct} %`
                        : _('Recognizing text') + ` (${_('page')} ${num}) ${pct} %`;
                };
                // Real PDF text is read directly; OCR only fills in what it lacks:
                // the whole page when there is no text, otherwise just its images.
                const pdfText = await pageTextItems(info);
                let lines;
                if (!pdfText.length) {
                    lines = await recognizePage(info.pdfPage, progress);
                } else {
                    const regions = await imageRegions(info.pdfPage);
                    if (!regions.length) { skipped++; continue; }
                    lines = (await recognizePage(info.pdfPage, progress, regions))
                        .filter(l => !pdfText.some(t => overlapShare(l.rect, t.rect) > 0.5));
                }
                if (token !== state.token) return;   // another document was opened
                if (lines.length) {
                    state.ocr[num] = lines;
                    state.viewer.setOcr(num, lines);
                    found += lines.length;
                    setDirty(true);
                }
                done++;
            }
            if (!done && skipped) flash(_('The page already contains text and no images — no OCR needed.'));
            else flash(_('Text recognized') + `: ${found} ` + _('lines'));
        } catch (error) {
            showError(_('Text recognition failed'), error);
        } finally {
            state.ocrRunning = false;
        }
    }

    // ── Commands ───────────────────────────────────────────────────────────
    function setTool(name) {
        layer.setTool(name);
        refreshStatus();
        if (name === 'replace') {
            flash(_('Click a line of text to replace it.'));
            state.viewer?.pages.forEach(p => pageTextItems(p));   // warm the hit-test cache
        }
    }

    const commands = {
        open: cmdOpen,
        save: cmdSave,
        saveas: cmdSaveAs,
        download: cmdDownload,
        close: () => winEl.querySelector('.controls .close')?.click(),
        undo: () => layer.canUndo ? layer.undo() : undoPages(pageUndo, pageRedo),
        redo: () => layer.canRedo ? layer.redo() : undoPages(pageRedo, pageUndo),
        print: () => cmdPrint(),
        pageafter: () => state.original && insertPageAt(state.page + 1, state.page),
        exportpage: () => cmdExportPage(),
        importpages: cmdImportPages,
        delete: () => layer.deleteSelected(),
        image: () => { if (state.original) $('.wl-img-input').click(); },
        zoomin: () => { state.viewer?.setScale(state.viewer.scale * 1.2); refreshStatus(); },
        zoomout: () => { state.viewer?.setScale(state.viewer.scale / 1.2); refreshStatus(); },
        zoom100: () => { state.viewer?.setScale(1); refreshStatus(); },
        fitwidth: () => { state.viewer?.fitWidth(); refreshStatus(); },
        fitpage: () => { state.viewer?.fitPage(); refreshStatus(); },
        togglenav: () => $('.wl-nav').classList.toggle('hidden'),
        togglecomments: () => $('.wl-comments').classList.toggle('hidden'),
        'toggleruler:x': () => toggleRuler('x'),
        'toggleruler:y': () => toggleRuler('y'),
        coverauto: () => { layer.coverAuto.value = !layer.coverAuto.value; refreshStatus(); },
        ocrpage: () => runOcr([state.page]),
        ocrall: () => runOcr(state.viewer ? state.viewer.pages.map(p => p.num) : []),
    };

    function run(cmd) {
        if (cmd.startsWith('tool:')) { if (state.original) setTool(cmd.slice(5)); return; }
        const fn = commands[cmd];
        if (fn) Promise.resolve(fn()).catch(error => showError('Word light', error));
    }

    // Ribbon buttons keep focus where it is (an open text block stays in edit mode)
    root.addEventListener('mousedown', e => {
        if (e.target.closest('.wl-ribbon button, .wl-status button')) e.preventDefault();
    });
    root.addEventListener('click', e => {
        const tab = e.target.closest('.wl-tab');
        if (tab) {
            root.querySelectorAll('.wl-tab').forEach(t => t.classList.toggle('active', t === tab));
            root.querySelectorAll('.wl-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
            return;
        }
        const btn = e.target.closest('[data-cmd]');
        if (btn) { run(btn.dataset.cmd); return; }
        const fmt = e.target.closest('button[data-format]');
        if (fmt) {
            const key = fmt.dataset.format;
            if (key === 'align') layer.format({ align: fmt.dataset.value });
            else {
                const b = layer.selected();
                const src = b?.type === 'text' ? b : layer.textDefaults;
                layer.format({ [key]: !src[key] });
            }
            refreshFormat();
        }
    });
    root.querySelectorAll('select[data-format]').forEach(sel => sel.addEventListener('change', () => {
        layer.format({ [sel.dataset.format]: sel.dataset.format === 'size' ? Number(sel.value) : sel.value });
    }));
    $('[data-format="color"]').addEventListener('input', e => layer.format({ color: e.target.value }));
    $('[data-color="highlight"]').addEventListener('input', e => {
        layer.highlightColor.value = e.target.value;
        if (layer.selected()?.type === 'highlight') layer.updateBlock(layer.selected().id, { color: e.target.value });
    });
    $('[data-color="cover"]').addEventListener('input', e => {
        layer.coverFill.value = e.target.value;
        // Picking a colour means "use this one" — otherwise Auto color would override it
        layer.coverAuto.value = false;
        refreshStatus();
        if (layer.selected()?.type === 'cover') layer.updateBlock(layer.selected().id, { fill: e.target.value });
    });
    $('.wl-zoom').addEventListener('input', e => { state.viewer?.setScale(Number(e.target.value) / 100); refreshStatus(); });

    $('.wl-img-input').addEventListener('change', e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !/^image\/(png|jpeg)$/.test(file.type)) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const at = visibleCenter();
                layer.addImage(String(reader.result), img.naturalWidth, img.naturalHeight, at.page, at.point);
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });

    /** The page under the middle of the workspace, and that spot on it. */
    function visibleCenter() {
        const wr = work.getBoundingClientRect();
        const cx = wr.left + wr.width / 2, cy = wr.top + wr.height / 2;
        for (const p of state.viewer?.pages || []) {
            const r = p.el.getBoundingClientRect();
            if (cy >= r.top && cy <= r.bottom) {
                return { page: p.num, point: { x: Math.min(Math.max(cx - r.left, 0), r.width), y: cy - r.top } };
            }
        }
        return { page: state.page, point: null };
    }

    work.addEventListener('wheel', e => {
        if (!e.ctrlKey || !state.viewer) return;
        e.preventDefault();
        state.viewer.setScale(state.viewer.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        refreshStatus();
    }, { passive: false });

    // Keyboard shortcuts need focus inside the window. On PDF text, take it
    // only once the mouse is released: moving focus during mousedown can
    // cancel the start of a text selection (Firefox).
    work.addEventListener('pointerdown', e => {
        if (e.target.closest('textarea, input, select')) return;
        if (e.target.closest('.textLayer')) {
            window.addEventListener('pointerup', () => {
                if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
            }, { once: true });
            return;
        }
        root.focus({ preventScroll: true });
    });

    // ── Keyboard ───────────────────────────────────────────────────────────
    root.addEventListener('keydown', e => {
        if (e.target.closest('input, select, textarea')) return;
        const ctrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        if (ctrl && key === 's') { e.preventDefault(); run(e.shiftKey ? 'saveas' : 'save'); }
        else if (ctrl && key === 'o') { e.preventDefault(); run('open'); }
        else if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); run('undo'); }
        else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); run('redo'); }
        else if (ctrl && ['b', 'i', 'u'].includes(key)) {
            e.preventDefault();
            const prop = { b: 'bold', i: 'italic', u: 'underline' }[key];
            const b = layer.selected();
            const src = b?.type === 'text' ? b : layer.textDefaults;
            layer.format({ [prop]: !src[prop] });
        }
        else if (key === 'delete' || key === 'backspace') { if (layer.selected()) { e.preventDefault(); run('delete'); } }
        else if (key === 'escape') { setTool('select'); layer.select(null); }
    });

    // ── Unsaved changes guard on window close ──────────────────────────────
    let closing = false;
    winEl.addEventListener('click', e => {
        const btn = e.target.closest('.controls .close, .control-menu .ctm-row.close');
        if (!btn || closing || !state.dirty) return;
        e.stopPropagation();
        e.preventDefault();
        app.ui.confirm({
            title:   'Word light',
            body:    () => `<p style="margin:0;line-height:1.5;">${esc(_('You have unsaved changes in'))} <b>${esc(state.name || _('Untitled'))}</b>. ${esc(_('Close without saving?'))}</p>`,
            confirm: _('Close without saving'),
            cancel:  _('Cancel'),
            // The dialog closes itself (closeActiveWindow) right after this
            // callback — close Word light only once that has happened.
            onConfirm: () => { closing = true; setTimeout(() => btn.click(), 50); },
            onCancel:  () => {},   // without a handler the Cancel button does nothing
        });
    }, true);

    // Free the PDF.js worker once the window is gone
    const gone = new MutationObserver(() => {
        if (winEl.isConnected) return;
        gone.disconnect();
        state.token++;
        state.viewer?.destroy();
    });
    if (winEl.parentNode) gone.observe(winEl.parentNode, { childList: true });

    refreshStatus();
    refreshFormat();
    setTitle();
    if (initPath) loadPath(initPath);
}
