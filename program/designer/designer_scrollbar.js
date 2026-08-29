/**
 * @file designer/designer_scrollbar.js
 * @description Custom X/Y scrollbars for #designerCanvasContent. Lazy-loaded
 * by `designer.js`'s `start()` once the window's DOM (the scrollbar track +
 * thumb elements below) already exists.
 *
 * Exports `init(app)` — hides the native browser scrollbar on
 * #designerCanvasContent and drives #scrollbarXThumb/#scrollbarYThumb from
 * its real scroll position/extent, in both directions (dragging a thumb
 * scrolls the content; scrolling the content moves the thumb).
 *
 * @module program/designer/designer_scrollbar
 */

const THUMB_MIN      = 20;  // px, so a thumb never shrinks to unusable size
const ARROW_STEP      = 40;  // px scrolled per arrow click
const ARROW_DELAY      = 400; // ms before press-and-hold starts repeating
const ARROW_INTERVAL   = 60;  // ms between repeats while held

function syncThumb(content, track, thumb, axis) {
    const trackSize   = axis === 'y' ? track.clientHeight   : track.clientWidth;
    const viewSize     = axis === 'y' ? content.clientHeight : content.clientWidth;
    const scrollSize   = axis === 'y' ? content.scrollHeight : content.scrollWidth;
    const scrollable   = scrollSize - viewSize;

    if (scrollable <= 0) {
        thumb.style.opacity = '0';
        return;
    }
    thumb.style.opacity = '1';

    const thumbSize   = Math.max(THUMB_MIN, trackSize * (viewSize / scrollSize));
    const maxThumbPos = trackSize - thumbSize;
    const scrollPos    = axis === 'y' ? content.scrollTop : content.scrollLeft;
    const thumbPos     = (scrollPos / scrollable) * maxThumbPos;

    if (axis === 'y') {
        thumb.style.height = thumbSize + 'px';
        thumb.style.top    = thumbPos + 'px';
    } else {
        thumb.style.width = thumbSize + 'px';
        thumb.style.left  = thumbPos + 'px';
    }
}

function bindThumbDrag(content, track, thumb, axis) {
    function start(e) {
        e.preventDefault();
        e.stopPropagation();

        const point0      = e.touches ? e.touches[0] : e;
        const startClient = axis === 'y' ? point0.clientY : point0.clientX;
        const startScroll = axis === 'y' ? content.scrollTop : content.scrollLeft;
        const trackSize   = axis === 'y' ? track.clientHeight : track.clientWidth;
        const thumbSize   = axis === 'y' ? thumb.clientHeight : thumb.clientWidth;
        const viewSize    = axis === 'y' ? content.clientHeight : content.clientWidth;
        const scrollSize  = axis === 'y' ? content.scrollHeight : content.scrollWidth;
        const scrollable  = scrollSize - viewSize;
        const maxThumbPos = trackSize - thumbSize;

        function move(ev) {
            const point = ev.touches ? ev.touches[0] : ev;
            const client = axis === 'y' ? point.clientY : point.clientX;
            const delta  = client - startClient;
            const scrollDelta = maxThumbPos > 0 ? (delta / maxThumbPos) * scrollable : 0;
            if (axis === 'y') content.scrollTop  = startScroll + scrollDelta;
            else               content.scrollLeft = startScroll + scrollDelta;
        }
        function end() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', end);
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);
    }
    thumb.addEventListener('mousedown', start);
    thumb.addEventListener('touchstart', start, { passive: false });
}

// Clicking the track itself (not the thumb) jumps the content so the thumb
// is centered under the click.
function bindTrackClick(content, track, thumb, axis) {
    track.addEventListener('mousedown', e => {
        if (e.target === thumb) return;
        const rect       = track.getBoundingClientRect();
        const trackSize  = axis === 'y' ? track.clientHeight : track.clientWidth;
        const thumbSize  = axis === 'y' ? thumb.clientHeight : thumb.clientWidth;
        const viewSize   = axis === 'y' ? content.clientHeight : content.clientWidth;
        const scrollSize = axis === 'y' ? content.scrollHeight : content.scrollWidth;
        const scrollable = scrollSize - viewSize;
        const clickPos   = axis === 'y' ? (e.clientY - rect.top) : (e.clientX - rect.left);
        const maxThumbPos = trackSize - thumbSize;
        const targetPos   = Math.min(Math.max(0, clickPos - thumbSize / 2), maxThumbPos);
        const ratio       = maxThumbPos > 0 ? targetPos / maxThumbPos : 0;
        if (axis === 'y') content.scrollTop  = ratio * scrollable;
        else               content.scrollLeft = ratio * scrollable;
    });
}

// Arrow buttons at each end of the track: click steps by ARROW_STEP, holding
// down repeats (matching native scrollbar arrow behavior).
function bindArrow(content, axis, dir, el) {
    if (!el) return;

    function step() {
        if (axis === 'y') content.scrollTop  += dir * ARROW_STEP;
        else               content.scrollLeft += dir * ARROW_STEP;
    }

    function start(e) {
        e.preventDefault();
        e.stopPropagation();
        step();
        const delay = setTimeout(() => {
            const interval = setInterval(step, ARROW_INTERVAL);
            end.interval = interval;
        }, ARROW_DELAY);
        end.delay = delay;
    }
    function end() {
        clearTimeout(end.delay);
        clearInterval(end.interval);
        document.removeEventListener('mouseup', end);
        document.removeEventListener('touchend', end);
    }

    el.addEventListener('mousedown', e => {
        start(e);
        document.addEventListener('mouseup', end);
    });
    el.addEventListener('touchstart', e => {
        start(e);
        document.addEventListener('touchend', end);
    }, { passive: false });
}

export function init(app) {
    const content = document.getElementById('designerCanvasContent');
    const trackY  = document.getElementById('scrollbarYTrack');
    const thumbY  = document.getElementById('scrollbarYThumb');
    const trackX  = document.getElementById('scrollbarXTrack');
    const thumbX  = document.getElementById('scrollbarXThumb');
    if (!content || !trackY || !thumbY || !trackX || !thumbX) return;

    if (!document.getElementById('designer-scrollbar-hide-style')) {
        const style = document.createElement('style');
        style.id = 'designer-scrollbar-hide-style';
        style.textContent = '#designerCanvasContent::-webkit-scrollbar { display: none; }';
        document.head.appendChild(style);
    }

    const sync = () => {
        syncThumb(content, trackY, thumbY, 'y');
        syncThumb(content, trackX, thumbX, 'x');
    };

    sync();
    content.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(content);
    const body = document.getElementById('designerCanvasBody');
    if (body) resizeObserver.observe(body);

    bindThumbDrag(content, trackY, thumbY, 'y');
    bindThumbDrag(content, trackX, thumbX, 'x');
    bindTrackClick(content, trackY, thumbY, 'y');
    bindTrackClick(content, trackX, thumbX, 'x');

    bindArrow(content, 'y', -1, document.getElementById('scrollbarYUp'));
    bindArrow(content, 'y',  1, document.getElementById('scrollbarYDown'));
    bindArrow(content, 'x', -1, document.getElementById('scrollbarXLeft'));
    bindArrow(content, 'x',  1, document.getElementById('scrollbarXRight'));
}
