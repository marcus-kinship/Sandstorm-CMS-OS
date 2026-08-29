/**
 * @file cursor/motion.js
 * @description The Motion Engine — a single requestAnimationFrame loop that
 * NEVER calls `getComputedStyle` and never touches the DOM directly. Each
 * frame it only computes numbers from `state.js` and emits `positionchange`
 * via `events.js`; `renderer.js` is the only thing that actually moves the
 * overlay element.
 *
 * Two distinct motion contexts, per the spec:
 * - **Continuous follow** (no explicit move in progress): exponential
 *   smoothing of the rendered position toward `state.getTarget()` (the raw
 *   pointer position), strength controlled by the "smoothness" setting —
 *   the same technique `sandstorm/components/svg-morph.js`'s `app.svg.morph()`
 *   already uses elsewhere in this OS.
 * - **Explicit `move(x,y,{duration,easing})`**: a fixed-duration tween from
 *   wherever the cursor currently is to the target, using one of the named
 *   easings below — a genuinely different context from continuous
 *   following, so it gets its own code path rather than being force-fit
 *   into the smoothing factor.
 *
 * @module components/cursor/motion
 */

import { emit } from './events.js';
import * as state from './state.js';

const SMOOTHING_FACTORS = { none: 1, low: 0.35, medium: 0.2, high: 0.1 };

const EASINGS = {
    direct: () => 1,
    smooth: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    ease:   t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), // alias used by the spec's own `easing:"ease"` example
    easein:  t => t * t * t,
    easeout: t => 1 - Math.pow(1 - t, 3),
    elastic: t => {
        if (t === 0 || t === 1) return t;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    spring: t => 1 - Math.cos(t * Math.PI * 4.5) * Math.exp(-t * 6),
};

let _current = { x: 0, y: 0 };
let _lastEmitted = null;  // last position actually broadcast — lets the tick loop go quiet once converged
let _moveStart = null;     // { x, y } — where the cursor was when the current explicit move began
let _moveStartTime = 0;
let _rafId = null;
let _running = false;

const EPSILON = 0.02;

function _tick(now) {
    if (!_running) return;

    const followEl = state.getFollowTarget();
    if (followEl && followEl.isConnected) {
        const r = followEl.getBoundingClientRect();
        state.setTarget(r.left + r.width / 2, r.top + r.height / 2);
    } else if (followEl) {
        state.setFollowTarget(null);
    }

    const target = state.getTarget();
    const moveOptions = state.getMoveOptions();

    if (moveOptions) {
        if (_moveStart === null) {
            _moveStart = { ..._current };
            _moveStartTime = now;
        }
        const { duration = 300, easing = 'smooth' } = moveOptions;
        const elapsed = now - _moveStartTime;
        const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        const ease = EASINGS[(easing || 'smooth').toLowerCase()] || EASINGS.smooth;
        const eased = ease(t);

        _current = {
            x: _moveStart.x + (target.x - _moveStart.x) * eased,
            y: _moveStart.y + (target.y - _moveStart.y) * eased,
        };

        if (t >= 1) {
            state.setTarget(target.x, target.y, null); // move finished — hand back to continuous-follow mode
            _moveStart = null;
        }
    } else {
        _moveStart = null;
        const smoothness = state.getSettings()?.smoothness || 'medium';
        const factor = SMOOTHING_FACTORS[smoothness] ?? SMOOTHING_FACTORS.medium;
        _current = {
            x: _current.x + (target.x - _current.x) * factor,
            y: _current.y + (target.y - _current.y) * factor,
        };
    }

    const dx = _lastEmitted ? _current.x - _lastEmitted.x : Infinity;
    const dy = _lastEmitted ? _current.y - _lastEmitted.y : Infinity;
    if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON) {
        _lastEmitted = { ..._current };
        emit('positionchange', { ..._current });
    }
    _rafId = requestAnimationFrame(_tick);
}

export function start() {
    if (_running) return;
    _running = true;
    _rafId = requestAnimationFrame(_tick);
}

export function stop() {
    _running = false;
    if (_rafId !== null) cancelAnimationFrame(_rafId);
    _rafId = null;
}

/** Snaps the internal rendered position immediately (no tween) — used when
 *  the engine is (re)enabled or the cursor is unhidden, so it doesn't glide
 *  in from a stale `(0,0)`. */
export function snapTo(x, y) {
    _current = { x, y };
    _moveStart = null;
    _lastEmitted = { ..._current };
    emit('positionchange', { ..._current });
}

export function getCurrentPosition() {
    return { ..._current };
}
