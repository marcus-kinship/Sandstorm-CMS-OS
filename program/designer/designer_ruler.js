/**
 * @file designer/designer_ruler.js
 * @description Top/left px rulers + draggable guide lines for the Designer
 * canvas. Lazy-loaded by `designer.js`'s `start()` once the window's DOM
 * (the ruler canvases + #designerCanvasContent) already exists.
 *
 * Exports `init(app)`:
 *  - Draws the rulers and keeps them synced to #designerCanvasContent's scroll.
 *  - Hovering the canvas marks the cursor position on both rulers (white).
 *  - Dragging out from a ruler (mouse or touch) creates a guide line (blue)
 *    on #designerCanvasContent; dragging a guide back onto its ruler deletes it.
 *
 * @module program/designer/designer_ruler
 */

const RULER_SIZE     = 20;
const GUIDE_COLOR     = 'blue';
const INDICATOR_COLOR = 'white';
const GUIDE_HIT       = 7; // px-wide grab zone centered on the 1px guide line

const Ruler = {
    minor: 10,  // px between unlabeled ticks
    major: 50,  // px between labeled ticks

    draw(side, opts = {}) {
        const canvas  = document.getElementById(side === 'top' ? 'rulerTop' : 'rulerLeft');
        const content = document.getElementById('designerCanvasContent');
        if (!canvas || !content) return;

        const dpr    = window.devicePixelRatio || 1;
        const length = side === 'top' ? content.clientWidth : content.clientHeight;

        canvas.width  = (side === 'top' ? length : RULER_SIZE) * dpr;
        canvas.height = (side === 'top' ? RULER_SIZE : length) * dpr;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, length, RULER_SIZE);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, side === 'top' ? length : RULER_SIZE, side === 'top' ? RULER_SIZE : length);

        const offset = side === 'top' ? content.scrollLeft : content.scrollTop;
        const start  = Math.floor(offset / this.minor) * this.minor;

        ctx.font         = '9px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'left';

        for (let pos = start; pos < offset + length; pos += this.minor) {
            const isMajor   = pos % this.major === 0;
            const screenPos = Math.round(pos - offset) + 0.5;
            const tickLen   = isMajor ? 8 : 4;

            ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            if (side === 'top') {
                ctx.moveTo(screenPos, RULER_SIZE);
                ctx.lineTo(screenPos, RULER_SIZE - tickLen);
            } else {
                ctx.moveTo(RULER_SIZE, screenPos);
                ctx.lineTo(RULER_SIZE - tickLen, screenPos);
            }
            ctx.stroke();

            if (!isMajor) continue;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            if (side === 'top') {
                ctx.fillText(String(pos), screenPos + 2, RULER_SIZE / 2);
            } else {
                ctx.save();
                ctx.textAlign = 'right';
                ctx.translate(RULER_SIZE / 2, screenPos + 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(String(pos), 0, 0);
                ctx.restore();
            }
        }

        if (opts.indicator != null) {
            const screenPos = Math.round(opts.indicator - offset) + 0.5;
            ctx.strokeStyle = INDICATOR_COLOR;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            if (side === 'top') {
                ctx.moveTo(screenPos, 0);
                ctx.lineTo(screenPos, RULER_SIZE);
            } else {
                ctx.moveTo(0, screenPos);
                ctx.lineTo(RULER_SIZE, screenPos);
            }
            ctx.stroke();
        }
    }
};

function initRulers() {
    const $content = $('#designerCanvasContent');
    if (!$content.length) return;

    const redraw = () => { Ruler.draw('top'); Ruler.draw('left'); };

    redraw();
    $content.on('scroll', redraw);
    $(window).on('resize', redraw);
    new ResizeObserver(redraw).observe($content[0]);
}

function initRulerInteractions() {
    const content = document.getElementById('designerCanvasContent');
    if (!content) return;

    $(content).on('mousemove', function (e) {
        const rect = this.getBoundingClientRect();
        Ruler.draw('top',  { indicator: e.clientX - rect.left + this.scrollLeft });
        Ruler.draw('left', { indicator: e.clientY - rect.top  + this.scrollTop });
    });
    $(content).on('mouseleave', function () {
        Ruler.draw('top');
        Ruler.draw('left');
    });

    bindGuideCreation(document.getElementById('rulerLeft'), 'vertical');
    bindGuideCreation(document.getElementById('rulerTop'),  'horizontal');
}

function createGuide(orientation) {
    const hit = document.createElement('div');
    hit.className = 'designer-guide designer-guide-' + orientation;
    hit.style.position = 'absolute';
    hit.style.zIndex   = '50';
    if (orientation === 'vertical') {
        hit.style.width  = GUIDE_HIT + 'px';
        hit.style.height = '100%';
        hit.style.top    = '0';
        hit.style.cursor = 'ew-resize';
    } else {
        hit.style.height = GUIDE_HIT + 'px';
        hit.style.width  = '100%';
        hit.style.left   = '0';
        hit.style.cursor = 'ns-resize';
    }

    const line = document.createElement('div');
    line.style.position   = 'absolute';
    line.style.background = GUIDE_COLOR;
    if (orientation === 'vertical') {
        line.style.left   = Math.floor(GUIDE_HIT / 2) + 'px';
        line.style.top    = '0';
        line.style.width  = '1px';
        line.style.height = '100%';
    } else {
        line.style.top    = Math.floor(GUIDE_HIT / 2) + 'px';
        line.style.left   = '0';
        line.style.height = '1px';
        line.style.width  = '100%';
    }
    hit.appendChild(line);

    bindGuideDrag(hit, orientation);
    return hit;
}

function positionGuide(hit, orientation, pos) {
    const half = Math.floor(GUIDE_HIT / 2);
    if (orientation === 'vertical') {
        hit.style.left = (pos - half) + 'px';
    } else {
        hit.style.top = (pos - half) + 'px';
    }
}

function isOverRuler(point, orientation) {
    const rulerEl = document.getElementById(orientation === 'vertical' ? 'rulerLeft' : 'rulerTop');
    if (!rulerEl) return false;
    const r = rulerEl.getBoundingClientRect();
    return orientation === 'vertical' ? point.clientX < r.right : point.clientY < r.bottom;
}

// Shared drag loop used both to reposition an existing guide and to drag a
// brand-new one out from the ruler. Dropping over the guide's own ruler
// (the "-- source" it came from) deletes it instead of placing it.
function dragGuide(guide, orientation, initialEvent) {
    const content = document.getElementById('designerCanvasContent');
    if (!content) return;

    function apply(ev) {
        const point = ev.changedTouches ? ev.changedTouches[0] : (ev.touches ? ev.touches[0] : ev);
        const overRuler = isOverRuler(point, orientation);
        guide.style.opacity = overRuler ? '0.3' : '1';
        if (!overRuler) {
            const rect = content.getBoundingClientRect();
            const pos = orientation === 'vertical'
                ? point.clientX - rect.left + content.scrollLeft
                : point.clientY - rect.top  + content.scrollTop;
            positionGuide(guide, orientation, Math.max(0, pos));
        }
        return overRuler;
    }

    function move(ev) { apply(ev); }

    function end(ev) {
        if (apply(ev)) guide.remove();
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', end);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);

    apply(initialEvent);
}

// Re-grab an already-placed guide to move it, or drag it back onto its
// ruler to delete it.
function bindGuideDrag(guide, orientation) {
    function start(e) {
        e.preventDefault();
        e.stopPropagation();
        dragGuide(guide, orientation, e);
    }
    guide.addEventListener('mousedown', start);
    guide.addEventListener('touchstart', start, { passive: false });
}

// Drag out from the ruler itself to create a new guide.
function bindGuideCreation(rulerEl, orientation) {
    if (!rulerEl) return;

    function start(e) {
        e.preventDefault();
        const content = document.getElementById('designerCanvasContent');
        if (!content) return;

        const guide = createGuide(orientation);
        content.appendChild(guide);
        dragGuide(guide, orientation, e);
    }

    rulerEl.addEventListener('mousedown', start);
    rulerEl.addEventListener('touchstart', start, { passive: false });
}

export function init(app) {
    initRulers();
    initRulerInteractions();
}
