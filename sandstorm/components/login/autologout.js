/**
 * @file login/autologout.js
 * @description Auto-logout idle timer, configured via index.html's
 * loginProgram boot step (`autoLogout: "never"` or a number of seconds of
 * inactivity — see index.html's own comment on that config object).
 *
 * Deliberately separate from login.js's own auto-LOCK idle timer
 * (os.login.settings.get().timeout, user-editable in Control Panel): that
 * one re-shows the login screen but keeps the session (open windows) alive.
 * This one ends the session outright — the same confirmRunning() +
 * window.location.reload() path the Start Menu's manual "Log Off" already
 * uses — so a boot-config timeout and a Control Panel timeout can't be
 * confused for the same setting.
 *
 * Three conditions block the warning from ever appearing, re-checked right
 * as the timeout is about to be reached: media (video/audio) playing
 * anywhere in the OS, a running program tagged `category: 'game'`, and an
 * active API-granted pause (see `pause()` below). None of them reset the
 * timer — they just defer it, re-checking every 5s — so genuine inactivity
 * still counts from when it actually started, not from whenever the block
 * happened to lift.
 *
 * @module components/login/autologout
 */

let _os = null;
let _active = false;
let _timer = null;
let _countdownOpen = false;
let _countdownTeardown = null; // set while the warning dialog is open, so pause() can dismiss it
let _pauseTokens = new Set();  // unique tokens, not programIds — multiple concurrent pauses stack safely
let _allowedProgramIds = new Set(); // session-only consent cache for pause() — see pause()'s own comment

function _timeoutSeconds() {
    const raw = _os?.login?.bootConfig?.autoLogout;
    if (raw === undefined || raw === null || raw === 'never') return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function _isMediaPlaying() {
    return Array.from(document.querySelectorAll('video, audio'))
        .some(el => !el.paused && !el.ended && el.readyState > 2);
}

function _isGameRunning() {
    const running = app.program.getRunning ? app.program.getRunning() : [];
    return running.some(p => app.program.getInfo?.(p.id)?.category === 'game');
}

function _isBlocked() {
    return _pauseTokens.size > 0 || _isMediaPlaying() || _isGameRunning();
}

function _clear() {
    clearTimeout(_timer);
    _timer = null;
}

function _schedule() {
    _clear();
    const totalSeconds = _timeoutSeconds();
    if (!totalSeconds || !_active) return;

    const warnAt = Math.max(0, totalSeconds - 15);
    _timer = setTimeout(_checkAndWarn, warnAt * 1000);
}

function _checkAndWarn() {
    if (!_active) return;
    if (_isBlocked()) {
        _timer = setTimeout(_checkAndWarn, 5000);
        return;
    }
    _showCountdown();
}

/** Convention-based "who is calling" — same pattern cursor/permission.js
 *  uses (duplicated here rather than cross-imported: unrelated feature,
 *  trivial helper — see cursor/detect.js's own comment on this exact
 *  tradeoff for its NATIVE_HIDDEN_CLASS constant). Returns `null` for a
 *  system-level call (no active program window). */
function _getCallerProgramId() {
    const activeWindow = document.querySelector('.window.active');
    const cls = activeWindow?.getAttribute('class') || '';
    const match = cls.match(/pid-([^\s]+)/);
    return match ? match[1] : null;
}

function _askPauseConsent(programId) {
    return new Promise((resolve) => {
        const uid = 'autologout-consent-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const programName = app.program?.getInfo?.(programId)?.name || programId || _('This program');

        app.ui.window({
            title: _('Pause automatic logout'),
            width: '380px',
            height: '220px',
            windowIcon: true,
            icontype: 'svg',
            icon: '#ic-warning',
            resizable: false,
            controls: { minimize: false, maximize: false, close: false },
            class: 'd-msgwin autologout-consent-dlg',
            left: 'center',
            top: 'center',
            body: () => `
                <div class="m-window d-check" style="flex-direction:column;align-items:flex-start;gap:6px;">
                    <div><strong>${app.util.escapeHtml(programName)}</strong> ${_('wants to temporarily pause automatic logout.')}</div>
                    <div>${_('Only allow this if you trust the program to resume the timer when it no longer needs to.')}</div>
                </div>
                <div class="buttons flex-right" style="display:flex;gap:6px;padding:14px;justify-content:flex-end;">
                    <div id="${uid}-deny" class="aero-button">${_('Deny')}</div>
                    <div id="${uid}-allow" class="aero-button">${_('Allow')}<div class="after pulse"></div></div>
                </div>
            `,
        });

        setTimeout(() => {
            const finish = (allowed) => {
                app.ui.windows.functions.closeActiveWindow();
                resolve(allowed);
            };
            document.getElementById(`${uid}-deny`)?.addEventListener('click', () => finish(false));
            document.getElementById(`${uid}-allow`)?.addEventListener('click', () => finish(true));
        }, 10);
    });
}

function _showCountdown() {
    if (_countdownOpen) return;
    _countdownOpen = true;

    const uid = 'autologout-warn-' + Date.now();
    let remaining = 15;
    let tickTimer = null;

    const teardown = () => {
        clearInterval(tickTimer);
        _countdownOpen = false;
        _countdownTeardown = null;
    };
    _countdownTeardown = teardown;

    const finishLogout = () => {
        teardown();
        app.ui.windows.functions.closeActiveWindow?.();
        const running = app.program.getRunning();
        app.program.confirmRunning(() => { window.location.reload(); }, _('Log Off'), running);
    };

    const cancel = () => {
        teardown();
        app.ui.windows.functions.closeActiveWindow?.();
        _schedule();
    };

    app.ui.window({
        title: _('Automatic logout'),
        width: '360px',
        height: '210px',
        windowIcon: true,
        icontype: 'svg',
        icon: '#ic-warning',
        resizable: false,
        controls: { minimize: false, maximize: false, close: false },
        class: 'd-msgwin autologout-warn-dlg',
        left: 'center',
        top: 'center',
        body: () => `
            <div class="m-window d-check" style="flex-direction:column;align-items:center;gap:10px;text-align:center;">
                <div>${_('You will be automatically logged out in')} <strong id="${uid}-count">15</strong> ${_('seconds due to inactivity.')}</div>
            </div>
            <div class="buttons flex-right" style="display:flex;gap:6px;padding:14px;justify-content:center;">
                <div id="${uid}-cancel" class="aero-button">${_('Stay logged in')}<div class="after pulse"></div></div>
            </div>
        `,
    });

    setTimeout(() => {
        document.getElementById(`${uid}-cancel`)?.addEventListener('click', cancel);

        tickTimer = setInterval(() => {
            if (_isBlocked()) { cancel(); return; }
            remaining -= 1;
            const el = document.getElementById(`${uid}-count`);
            if (el) el.textContent = remaining;
            if (remaining <= 0) finishLogout();
        }, 1000);
    }, 10);
}

/** Called once, right after a successful login (same call site as login.js's
 *  own bindIdleListeners). No-ops harmlessly if autoLogout is "never"/unset. */
export function start(os) {
    _os = os;
    _active = true;
    _schedule();
}

/** Called from performLock() — auto-logout doesn't keep ticking while the
 *  session is locked (nothing to log out FROM at that point); start()
 *  fires again on the next successful login. */
export function stop() {
    _active = false;
    _clear();
    if (_countdownTeardown) _countdownTeardown();
}

/** Wired to the SAME debounced mousemove/keydown/click/touchstart listener
 *  login.js's own resetIdleTimer() uses (see bindIdleListeners) rather than
 *  a second set of document listeners for the same events. Ignored while
 *  the warning dialog is already open — at that point only its own "Stay
 *  logged in" button (or a pause landing mid-countdown) should resolve it,
 *  not an incidental mouse twitch the user may not even be looking at. */
export function reset() {
    if (!_active || _countdownOpen) return;
    _schedule();
}

/**
 * Lets a program temporarily pause auto-logout — e.g. a long-running task
 * with no mouse/keyboard activity of its own to otherwise keep resetting
 * the timer. Gated on user consent: the first call from a given program
 * this session shows an Allow/Deny dialog; the decision is cached in
 * memory only (not persisted across reloads/sessions — a much lower-stakes,
 * situational ask than e.g. cursor/permission.js's cursor-control consent,
 * so it doesn't need that file's full allow-once/allow-always persistence).
 *
 * @returns {Promise<Function|null>} a release function to call when the
 *   program no longer needs the pause, or null if denied/auto-logout isn't
 *   running at all.
 */
export async function pause() {
    if (!_active) return null;

    const programId = _getCallerProgramId();
    if (!_allowedProgramIds.has(programId)) {
        const allowed = await _askPauseConsent(programId);
        if (!allowed) return null;
        _allowedProgramIds.add(programId);
    }

    const token = Symbol(programId || 'system');
    _pauseTokens.add(token);
    _clear();
    if (_countdownTeardown) _countdownTeardown();

    let released = false;
    return function resume() {
        if (released) return; // idempotent — a second call is a no-op, not a double-release bug
        released = true;
        _pauseTokens.delete(token);
        if (_pauseTokens.size === 0 && _active) _schedule();
    };
}
