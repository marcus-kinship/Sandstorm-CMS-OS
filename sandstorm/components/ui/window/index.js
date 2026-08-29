/**
 * @file window/index.js
 * @description Assembler for the window-management split. This is the only
 * module allowed to import from more than one sibling — every other
 * window/*.js file only imports from window/state.js (see each file's own
 * header comment for the exact dependency graph). Reassembles the exact
 * same `app.ui.windows`/`app.ui.windowStart`/`app.ui.window`/`app.ui.layer`/
 * `app.ui.alert`/`app.ui.prompt`/`app.ui.confirm`/`app.ui.button` shape the
 * original monolithic window.js built, then applies the same
 * `app.lock("ui.window.*", ...)` call at the end — preserved byte-for-byte,
 * including its pre-existing lock-path quirk (see below).
 *
 * @module components/ui/window/index
 */

import { event, removeEvent, trigger } from './state.js';

import {
    fadeOut, getOrder,
    setMainMenu, getMainMenu, resetMainMenu,
    updateTitle, rename, windowIcon,
    getAllWindowId, getTitle,
    contextmenuToggle, contextmenuCopyTitle,
    body,
} from './menu-body.js';

import {
    closeProgramWindows, closeWindow, closeActiveWindow, closeAll, closeThisWindow, close,
    maximize, minimize, minimizeNow,
    contextmenuMaximize,
} from './lifecycle.js';

import {
    pauseResize, resumeResize, pauseDrag, resumeDrag,
    position, draggable, placeholder, resizable,
    addResizeListener, removeResizeListener,
    adjust,
} from './dragresize.js';

import {
    windowStart, window as windowFn, layer, alert, prompt, confirm, button,
} from './dialogs.js';

import * as snapZones from './snap-zones.js';

(function (app) {
    app.ui = Object.assign(app.ui || {}, {
        windows: {
            resizeListenerAdded: false,
            event,
            removeEvent,
            trigger,

            functions: {
                fadeOut,
                getOrder,
                setMainMenu,
                getMainMenu,
                resetMainMenu,
                updateTitle,
                rename,
                windowIcon,
                getAllWindowId,
                getTitle,
                closeProgramWindows,
                closeWindow,
                closeActiveWindow,
                closeAll,
                closeThisWindow,
                close,
                maximize,
                minimize,
                minimizeNow,
                contextmenu: {
                    toggle: contextmenuToggle,
                    maximize: contextmenuMaximize,
                    copyTitle: contextmenuCopyTitle,
                },
                body,
                pauseResize,
                resumeResize,
                pauseDrag,
                resumeDrag,
                position,
                draggable,
                placeholder,
                resizable,
                addResizeListener,
                removeResizeListener,
            },

            adjust,
        },
        windowStart,
        window: windowFn,
        layer,
        alert,
        prompt,
        confirm,
        button,
    });

    app.lock("ui.window.*", { writable: false, configurable: false });

    initSnapShortcuts(app);
})((window.app = window.app || {})); // Skapa app-objektet om det inte redan finns

/**
 * Global "W + Arrow" (and Numpad-direction alias) Snap Layout keyboard
 * shortcuts for the active window. Bound to "W" (held) + Arrow rather than
 * the real Meta/Super key — per direct decision: Alt and the real Windows/
 * Super key are both already reserved (the host OS itself typically
 * intercepts a real Super+Arrow combo before it ever reaches this browser
 * tab at all, so binding to the literal key was a dead end regardless of
 * in-app conflicts).
 *
 * Per direct spec (numpad-direction mnemonic, 7/8/9 top row etc.):
 *   - W+Left / W+4        → snap to left half
 *   - W+Right / W+6       → snap to right half
 *   - W+Up / W+8 / W+5    → maximize (idempotent — a no-op if already
 *                            maximized, restores-in-place if minimized)
 *   - W+Down / W+2        → restore if maximized, un-snap if snapped,
 *                            minimize if already floating, no-op if already
 *                            minimized
 *   - W+Left+Up   / W+7   → top-left quarter (25%)
 *   - W+Left+Down / W+1   → bottom-left quarter
 *   - W+Right+Up  / W+9   → top-right quarter
 *   - W+Right+Down/ W+3   → bottom-right quarter
 * The three-key chords work by tracking whether Left/Right is *still
 * physically held* when Up/Down is pressed (`leftDown`/`rightDown` below) —
 * press-and-hold W+Left (snaps to the half immediately, matching W+Left
 * alone), then without releasing anything, tap Up/Down to refine into that
 * side's corresponding quarter. This replaced an earlier version that
 * inferred "currently a half" from the window's own recorded `snap.slots`
 * data instead of physically-held keys — per direct feedback, quarters are
 * now reached via an explicit chord (or a single Numpad digit), not as a
 * second, separate press after the fact.
 *
 * "W held"/"Left held"/"Right held" are tracked as plain keydown/keyup
 * state (not modifier bits the browser exposes, unlike shiftKey/ctrlKey/
 * altKey/metaKey) — all reset on window blur too, since a keyup can be
 * missed entirely if focus leaves the page while a key is physically still
 * down.
 *
 * "W+1".."W+9" work from the plain top-row digit keys, not just a physical
 * numpad — most keyboards (laptops especially) don't have one at all.
 * `event.key` is already just the digit string "1".."9" for both the top
 * row and a numpad key with NumLock on, so checking it directly covers
 * both; `event.code` (`"Numpad7"` etc., always identifies the physical key
 * regardless of NumLock state) is only still needed as a fallback for a
 * numpad key pressed with NumLock *off*, where `.key` would otherwise be
 * "Home"/"End"/etc. instead of a digit.
 *
 * Reuses snap-zones.js's own resolve/commit pipeline (this file is the one
 * place in the window/*.js split allowed to import more than one sibling —
 * see this file's own header comment) rather than duplicating any rect
 * math — a synthetic mouseY/side pair stands in for a live drag position,
 * since resolveSnapTarget() only knows how to band-detect half-vs-quarter
 * from a Y coordinate, not from an explicit "I want a quarter" request.
 *
 * @param {Object} app
 */
function initSnapShortcuts(app) {
    let wDown = false;
    let leftDown = false;
    let rightDown = false;

    function isTypingTarget(el) {
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    function taskIdOf(winEl) {
        const cls = Array.from(winEl.classList).find(c => c.startsWith('pid-'));
        return cls ? cls.slice(4) : null;
    }

    function snapHalf($win, windowId, ws, side) {
        if (!snapZones.isSnapAllowed()) return;
        const midY = ws.y + ws.height / 2; // middle band → resolveSnapTarget's own half case
        const target = snapZones.resolveSnapTarget(ws, side, midY, windowId);
        if (target) snapZones.commitSnap($win, windowId, target);
    }

    function snapQuarter($win, windowId, ws, side, vertical) {
        if (!snapZones.isSnapAllowed()) return;
        // Inside snap-zones.js's own CORNER_BAND (0.2) on the requested edge.
        const y = vertical === 'top' ? ws.y + ws.height * 0.1 : ws.y + ws.height * 0.9;
        const target = snapZones.resolveSnapTarget(ws, side, y, windowId);
        if (target) snapZones.commitSnap($win, windowId, target);
    }

    // Idempotent "go to full window" — a no-op if already maximized (Up
    // isn't a toggle here: calling lifecycle.js's maximize() a second time
    // would restore it, which isn't what "still holding Up" should do), and
    // restores-in-place (preserving whatever mode it had, via the taskbar
    // animation's own data('mode')) if currently minimized.
    // Only the *bare* trigger (plain W+Up, or Numpad8/5 with no chord held)
    // goes through here — the explicit direct-jump shortcuts (W+7/9/1/3, or
    // the physical W+Left+Up-style chords) call snapQuarter directly and are
    // unaffected by any of this. Reported live: landing in a 25% quarter via
    // the chord, then pressing plain W+Up right after (chord keys already
    // released), jumped straight to full screen — surprising, and not how
    // real Windows' own Win+Up behaves on an already-snapped window (it
    // escalates half→quarter→maximize using the window's *actual current
    // state*, not "maximize unconditionally unless already maximized").
    function snapMaximize($win, windowId, ws) {
        if ($win.hasClass('minimized')) {
            const taskId = taskIdOf($win[0]);
            if (taskId) app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, taskId);
            return;
        }
        if ($win.hasClass('maximized')) return;

        const slots = $win.data('snap.slots');
        if (slots && slots.length === 2) {
            const side = (slots[0] === 'topLeft' || slots[0] === 'bottomLeft') ? 'left' : 'right';
            snapQuarter($win, windowId, ws, side, 'top');
            return;
        }

        maximize(windowId);
    }

    function snapRestore($win, windowId) {
        if ($win.hasClass('minimized')) return; // already as "down" as it goes

        if ($win.hasClass('maximized')) {
            maximize(windowId); // toggles back to its saved pre-maximize rect
            return;
        }

        const slots = $win.data('snap.slots');
        if (slots && slots.length) {
            snapZones.clearWindowFromAllZones(windowId);
            $win.removeData('snap.slots');
            return;
        }

        const taskId = taskIdOf($win[0]);
        if (taskId) minimizeNow(windowId, taskId);
    }

    const DIGIT_ACTION = {
        '7': (w, id, ws) => snapQuarter(w, id, ws, 'left',  'top'),
        '1': (w, id, ws) => snapQuarter(w, id, ws, 'left',  'bottom'),
        '9': (w, id, ws) => snapQuarter(w, id, ws, 'right', 'top'),
        '3': (w, id, ws) => snapQuarter(w, id, ws, 'right', 'bottom'),
        '4': (w, id, ws) => snapHalf(w, id, ws, 'left'),
        '6': (w, id, ws) => snapHalf(w, id, ws, 'right'),
        '8': (w, id, ws) => snapMaximize(w, id, ws),
        '5': (w, id, ws) => snapMaximize(w, id, ws),
        '2': (w, id) => snapRestore(w, id),
    };

    document.addEventListener('keydown', (e) => {
        // Shift+W is reserved for the window switcher (components/windowswitcher.js)
        // - cede it entirely rather than also arming snap mode, so Shift+W+Arrow
        // never fights with that switcher's own arrow-key cycling.
        if (e.key === 'w' || e.key === 'W') { if (!e.shiftKey) wDown = true; return; }
        if (!wDown) return;

        const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const digit = /^[1-9]$/.test(e.key) ? e.key : (/^Numpad([1-9])$/.exec(e.code)?.[1] ?? null);
        if (!isArrow && !digit) return;
        if (e.repeat) return; // ignore OS key-repeat while held — act once per physical press

        if (isTypingTarget(document.activeElement)) return;

        const $activeWin = $('.window.active');
        if (!$activeWin.length) return;
        const windowId = $activeWin.attr('id')?.replace('-win', '');
        if (!windowId) return;

        e.preventDefault();
        const ws = app.desktop.getWorkspaceRect();

        if (digit) {
            DIGIT_ACTION[digit]?.($activeWin, windowId, ws);
            return;
        }

        if (e.key === 'ArrowLeft')  { leftDown  = true; snapHalf($activeWin, windowId, ws, 'left'); return; }
        if (e.key === 'ArrowRight') { rightDown = true; snapHalf($activeWin, windowId, ws, 'right'); return; }

        if (e.key === 'ArrowUp') {
            if (leftDown)  { snapQuarter($activeWin, windowId, ws, 'left',  'top'); return; }
            if (rightDown) { snapQuarter($activeWin, windowId, ws, 'right', 'top'); return; }
            snapMaximize($activeWin, windowId, ws);
            return;
        }

        if (e.key === 'ArrowDown') {
            if (leftDown)  { snapQuarter($activeWin, windowId, ws, 'left',  'bottom'); return; }
            if (rightDown) { snapQuarter($activeWin, windowId, ws, 'right', 'bottom'); return; }
            snapRestore($activeWin, windowId);
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'W') wDown = false;
        if (e.key === 'ArrowLeft') leftDown = false;
        if (e.key === 'ArrowRight') rightDown = false;
    });

    window.addEventListener('blur', () => { wDown = false; leftDown = false; rightDown = false; });
}
