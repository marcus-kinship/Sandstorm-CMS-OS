/**
 * @file taskbar/showdesktop.js
 * @description "Show desktop" toggle — the thin 10px strip at the taskbar's
 * far right, right of the clock. First click minimizes every currently
 * visible window; a second click restores exactly the windows that click
 * minimized (any window the user had already minimized by hand beforehand
 * stays minimized) — same convention as the classic Windows show-desktop
 * corner, not a blind restore-all.
 *
 * Registers `app.desktop.taskbar.toggleShowDesktop` — same IIFE-extends
 * convention as the other taskbar/*.js sibling modules. Reuses the exact
 * minimize/restore animation functions a taskbar icon click already uses
 * (`app.desktop.taskbar.functions.animateWindowToTaskbar` /
 * `animateTaskbarToWindow`, see `addtotaskbar.js`) rather than reimplementing
 * window-hide logic, and the same `.window`/`pid-<id>`/`-win` DOM
 * conventions `cursor/permission.js`'s `getCallerProgramId` already relies
 * on elsewhere in the codebase.
 *
 * The click handler is bound via a plain (non-jQuery) delegated listener on
 * `document` at module-load time rather than waiting for `#showDesktopBtn`
 * to exist — `build.js` creates the button inside a macrotask deferred past
 * `startup-complete` (see the notification system's own note on this in
 * `notifications/setup.js`), and delegation sidesteps that race entirely.
 * Plain `addEventListener`, not `$(document).on(...)`, because this module
 * (via `taskbar/index.js`) loads before jQuery does in `load.js`'s boot
 * order — `$` doesn't exist yet at this file's top level.
 *
 * @module components/taskbar/showdesktop
 */
(function (app) {

    let _hidden = [];

    Object.assign(app.desktop.taskbar, {

        /**
         * Toggles "show desktop": minimizes every currently visible window on
         * the first call, restores exactly those windows on the next call.
         */
        toggleShowDesktop: function () {
            const btn = document.getElementById('showDesktopBtn');

            if (_hidden.length) {
                _hidden.forEach(({ windowId, programId }) => {
                    const winEl = $(`#${windowId}-win`);
                    if (!winEl.length || !winEl.hasClass('minimized')) return;
                    app.desktop.taskbar.functions.animateTaskbarToWindow(windowId, programId);
                    $(`#pid-${programId}-task`).addClass('runstate').removeClass('hidstate');
                });
                _hidden = [];
                btn?.classList.remove('active');
                return;
            }

            const toHide = [];
            $('.window').not('.minimized').each(function () {
                const windowId = $(this).attr('id')?.replace('-win', '');
                const match = ($(this).attr('class') || '').match(/pid-([^\s]+)/);
                const programId = match ? match[1] : null;
                if (windowId && programId) toHide.push({ windowId, programId });
            });

            if (!toHide.length) return;

            toHide.forEach(({ windowId, programId }) => {
                app.desktop.taskbar.functions.animateWindowToTaskbar(windowId, programId);
                $(`#pid-${programId}-task`).addClass('hidstate').removeClass('runstate');
            });

            _hidden = toHide;
            btn?.classList.add('active');
        },

    });

    document.addEventListener('click', function (e) {
        if (e.target.closest('#showDesktopBtn')) {
            app.desktop.taskbar.toggleShowDesktop();
        }
    });

})((window.app = window.app || {}));
