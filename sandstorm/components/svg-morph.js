/**
 * @file components/svg-morph.js
 * @description SVG path morph engine — Level 2 of the animated-icon roadmap.
 *
 * Adds two functions to the existing `app.svg` namespace (safe to do after
 * svg.js's `app.lock('svg.*', ...)` — that only locks svg.js's own existing
 * keys `global`/`private` against reassignment, it doesn't seal the object,
 * so new keys can still be added):
 *
 *   app.svg.morphPath(from, middle, to, t) → string
 *     Pure interpolation, no DOM. Computes the `d` string at progress `t`
 *     (0-1) between 2 keyframes (pass `middle: null`) or 3. Useful while
 *     building an icon's initial HTML string, before any element exists to
 *     bind a live controller to.
 *
 *   app.svg.morph(opts) → controller
 *     A live, retargetable morph bound to one SVG element. Unlike a fixed
 *     tween, calling `.to()` again before the previous call finished
 *     smoothly redirects from wherever the animation currently is — needed
 *     for hover-driven icons where the pointer can enter/leave rapidly.
 *
 *     opts.element    - SVGElement or CSS selector (required)
 *     opts.from       - path 'd' at progress 0                  (required)
 *     opts.middle     - path 'd' at progress 0.5, or null/omit for a
 *                       straight 2-point morph
 *     opts.to         - path 'd' at progress 1                  (required)
 *     opts.progress   - initial progress, default 0
 *     opts.smoothing  - ease-toward-target factor per frame (0-1),
 *                       default 0.18. Higher = snappier.
 *     opts.duration   - alternative to `smoothing`: approximate ms to reach
 *                       ~99% of the way to a new target at 60fps.
 *
 *     controller.to(progress, onDone?)  - animate toward a new target (0-1)
 *     controller.set(progress)          - jump instantly, no animation
 *     controller.stop()                 - cancel the in-flight animation
 *     controller.progress               - current progress (getter)
 *     controller.element                - the bound element (getter)
 *
 * All keyframe path strings must share the same command structure (same
 * path, different coordinates) — only the numeric values are interpolated;
 * everything else is copied verbatim from `from`.
 *
 * @example
 * // One-shot: closed → half → open over ~400ms
 * const ctrl = app.svg.morph({ element: flapEl, from: closed, middle: half, to: open, duration: 400 });
 * ctrl.to(1);
 *
 * @example
 * // Interactive hover (see explorer.js's folder icon for the full version)
 * const ctrl = app.svg.morph({ element: flapEl, from: closed, middle: half, to: open, progress: 0.5 });
 * el.addEventListener('mouseenter', () => ctrl.to(1));
 * el.addEventListener('mouseleave', () => ctrl.to(0.5));
 *
 * @module components/svg-morph
 */
(function (app) {

    function numsOf(d) {
        return (d.match(/-?[0-9]*\.?[0-9]+/g) || []).map(Number);
    }

    function templateOf(d) {
        return d.replace(/-?[0-9]*\.?[0-9]+/g, "~");
    }

    function build(template, arr) {
        let i = 0;
        return template.replace(/~/g, () => arr[i++].toFixed(2));
    }

    function lerpArr(a, b, t) {
        const out = new Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
        return out;
    }

    // Builds a pathAt(t) closure over pre-parsed keyframe numbers, shared by
    // both morphPath() (one-off) and morph() (repeated every frame).
    function makeInterpolator(from, middle, to) {
        const template = templateOf(from);
        const nFrom = numsOf(from);
        const nTo   = numsOf(to);
        const nMid  = middle ? numsOf(middle) : null;
        return function pathAt(t) {
            t = Math.max(0, Math.min(1, t));
            const arr = nMid
                ? (t <= 0.5 ? lerpArr(nFrom, nMid, t / 0.5) : lerpArr(nMid, nTo, (t - 0.5) / 0.5))
                : lerpArr(nFrom, nTo, t);
            return build(template, arr);
        };
    }

    app.svg.morphPath = function (from, middle, to, t) {
        return makeInterpolator(from, middle, to)(t);
    };

    app.svg.morph = function (opts) {
        const element = typeof opts.element === 'string' ? document.querySelector(opts.element) : opts.element;
        if (!element) {
            app.dev.warn('app.svg.morph: element not found', opts, 'SVG');
            return null;
        }

        const pathAt = makeInterpolator(opts.from, opts.middle, opts.to);
        const smoothing = opts.smoothing ?? (opts.duration ? 1 - Math.pow(0.01, (1000 / 60) / opts.duration) : 0.18);

        let progress = opts.progress ?? 0;
        let target   = progress;
        let raf       = null;
        let onDone    = null;

        function apply(t) { element.setAttribute('d', pathAt(t)); }
        apply(progress);

        function frame() {
            progress += (target - progress) * smoothing;
            if (Math.abs(target - progress) < 0.002) {
                progress = target;
                apply(progress);
                raf = null;
                if (onDone) { const cb = onDone; onDone = null; cb(); }
                return;
            }
            apply(progress);
            raf = requestAnimationFrame(frame);
        }

        function go() {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(frame);
        }

        const controller = {
            to(newTarget, done) {
                target = Math.max(0, Math.min(1, newTarget));
                onDone = typeof done === 'function' ? done : null;
                go();
                return controller;
            },
            set(newProgress) {
                progress = target = Math.max(0, Math.min(1, newProgress));
                if (raf) { cancelAnimationFrame(raf); raf = null; }
                apply(progress);
                return controller;
            },
            stop() {
                if (raf) { cancelAnimationFrame(raf); raf = null; }
                return controller;
            },
            get progress() { return progress; },
            get element() { return element; },
        };
        return controller;
    };

})(window.app = window.app || {});
