/**
 * @file notifications/setup.js
 * @description Boot-time UI wiring for the notification system's default
 * clock-area surface (design spec §1-2): the clock itself (`#timeDisplay`) is
 * the click target — no separate bell icon — with a badge dot reflecting
 * `app.notifications.getBadgeState()` ("none" | "info" | "warning").
 *
 * The badge reuses the exact glow-dot look already used for a running
 * program's taskbar icon (`.taskbar-s .runstate > .after` in
 * taskbar/style.css — a blurred `var(--background-radial)` circle under the
 * icon), swapped to a red pulsing gradient for "warning" (which also covers
 * "critical" — the design spec only has two visible badge states).
 *
 * `#timeDisplay` is owned by `taskbar/clock.js`: digital mode rewrites its
 * `textContent` every second and analog mode replaces its `innerHTML` with a
 * `<canvas>` — both wipe any child element, including the badge dot. Rather
 * than touching that shared, timing-sensitive file, a `MutationObserver` on
 * `#timeDisplay` re-appends the dot whenever it's found missing (childList
 * mutations only — updating the dot's own classes doesn't re-trigger it, so
 * this can't loop). When the user hides the clock entirely (Control Panel →
 * Taskbar → Clock display → Hidden), `setClockDisplay()`'s existing
 * `$el.hide()` hides `#timeDisplay` — the badge, as its child, disappears
 * with it for free, no extra wiring needed.
 *
 * The core notify/dismiss/settings API lives in `notifications/index.js` (a
 * boot-loaded systemfile, available before any program runs) — this file
 * only builds the default visual surface on top of it. A program with its
 * own notification surface (e.g. a game's HUD) calls
 * `app.notifications.registerSurface(programId, fn)` instead of relying on
 * this one.
 *
 * @module components/notifications/setup
 */

const _CSS = `
#timeDisplay { position: relative; cursor: default; }
#timeDisplay > .notif-badge-dot {
    display: none;
    position: absolute;
    content: "";
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 13px;
    height: 13px;
    border-radius: 50%;
    filter: blur(3px);
    background: var(--background-radial, radial-gradient(circle, #ffffff 0%, #ffb300 100%));
    animation: fadein 0.4s ease-in-out;
}
#timeDisplay > .notif-badge-dot.show { display: block; }
#timeDisplay > .notif-badge-dot.pulse {
    animation: pulse 3s infinite;
}
#timeDisplay > .notif-badge-dot.warning {
    background: radial-gradient(circle, #ff6b6b 0%, #d90000 100%);
    animation: notif-badge-pulse 1.6s ease-in-out infinite;
}
@keyframes notif-badge-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}
.notif-panel { color: #fff; display: flex; flex-direction: column; max-height: 420px; }
.notif-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.notif-panel-header .h3 { font-size: 13px; margin: 0; }
.notif-panel-list { overflow-y: auto; flex: 1; }
.notif-row { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.notif-row.critical, .notif-row.warning { background: rgba(255,68,68,0.08); }
.notif-row-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; background: #f5c518; }
.notif-row.warning .notif-row-dot, .notif-row.critical .notif-row-dot { background: #ff4444; }
.notif-row-body { flex: 1; min-width: 0; }
.notif-row-title { font-size: 12.5px; font-weight: 600; }
.notif-row-program { font-size: 10.5px; opacity: 0.55; margin-bottom: 2px; }
.notif-row-text { font-size: 11.5px; opacity: 0.8; margin-top: 2px; word-break: break-word; }
.notif-row-dismiss { opacity: 0.5; cursor: default; font-size: 11px; flex-shrink: 0; }
.notif-row-dismiss:hover { opacity: 1; }
.notif-panel-empty { padding: 24px 14px; text-align: center; opacity: 0.55; font-size: 12px; }
.notif-panel-footer { display: flex; justify-content: space-between; padding: 8px 14px; border-top: 1px solid rgba(255,255,255,0.1); }
.notif-panel-footer .aero-button { font-size: 11px; padding: 4px 10px; }
`;

export function setup(os) {
    os.addCSS('notifications-bell', _CSS);

    os.program.addInfo("notifications", {
        name: () => _("Notifications"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("System notification center"),
        icontype: "svg",
        icon: "#ic-bell",
        taskbar: false,
        startmenu: false,
        multistart: false,
        main: "start",
        programtype: "system",
    });

    function _formatTime(ts) {
        return os.desktop.taskbar.formatClockTime(new Date(ts), "short");
    }

    function _renderPanel() {
        const items = os.notifications.list();
        const rows = items.length
            ? items.map(n => {
                const programName = (n.programId && n.programId !== 'system')
                    ? (os.program?.getInfo?.(n.programId)?.name || n.programId)
                    : _('System');
                return `
                    <div class="notif-row ${n.priority}" data-id="${n.id}">
                        <div class="notif-row-dot"></div>
                        <div class="notif-row-body">
                            <div class="notif-row-program">${os.util.escapeHtml(programName)} · ${_formatTime(n.timestamp)}</div>
                            <div class="notif-row-title">${os.util.escapeHtml(n.title)}</div>
                            ${n.body ? `<div class="notif-row-text">${os.util.escapeHtml(n.body)}</div>` : ''}
                        </div>
                        <div class="notif-row-dismiss" data-dismiss="${n.id}">${_('Dismiss')}</div>
                    </div>
                `;
            }).join('')
            : `<div class="notif-panel-empty">${_('You have no notifications')}</div>`;

        return `
            <div class="notif-panel">
                <div class="notif-panel-header"><div class="h3">${_('Notifications')}</div></div>
                <div class="notif-panel-list">${rows}</div>
                <div class="notif-panel-footer">
                    <div class="aero-button" id="notif-panel-clear">${_('Clear all')}</div>
                    <div class="aero-button" id="notif-panel-settings">${_('Settings')}</div>
                </div>
            </div>
        `;
    }

    /** Re-appends the badge dot if `clock()`/`analogClock()` just wiped `#timeDisplay`'s children. */
    function _ensureBadgeDot() {
        const timeDisplay = document.getElementById('timeDisplay');
        if (!timeDisplay) return null;
        let dot = timeDisplay.querySelector(':scope > .notif-badge-dot');
        if (!dot) {
            dot = document.createElement('div');
            dot.className = 'notif-badge-dot';
            timeDisplay.appendChild(dot);
        }
        return dot;
    }

    function _wireBadge() {
        const dot = _ensureBadgeDot();
        if (!dot) return;
        const badgeState = os.notifications.getBadgeState();
        dot.classList.remove('show', 'warning', 'pulse');
        if (badgeState === 'none') return;
        dot.classList.add('show');
        if (badgeState === 'warning') dot.classList.add('warning');
        else dot.classList.add('pulse');
    }

    os.dom.waitFor('#timeDisplay', { timeout: 0 }).then(function (timeDisplay) {
        if (!timeDisplay) return;

        _wireBadge();
        os.notifications.onChange(_wireBadge);

        new MutationObserver(_wireBadge).observe(timeDisplay, { childList: true });

        timeDisplay.addEventListener('click', function () {
            const handle = os.ui.toggle.window({
                windowId: "#notificationsPanel",
                targetId: "#timeDisplay",
                gap: 10,
                width: "320px",
                height: "auto",
                position: "top right",
                body: function () {
                    os.notifications.markAllSeen();
                    return _renderPanel();
                },
            });

            if (!handle) return; // toggled closed

            const el = handle.element[0];
            el.addEventListener('click', function (e) {
                const dismissId = e.target.closest('[data-dismiss]')?.dataset.dismiss;
                if (dismissId) {
                    os.notifications.dismiss(dismissId);
                    el.innerHTML = _renderPanel();
                    handle.reposition();
                    return;
                }
                if (e.target.closest('#notif-panel-clear')) {
                    os.notifications.clear();
                    el.innerHTML = _renderPanel();
                    handle.reposition();
                    return;
                }
                if (e.target.closest('#notif-panel-settings')) {
                    os.program.open('controlpanel');
                }
            });
        });
    });
}

export function start() { }
