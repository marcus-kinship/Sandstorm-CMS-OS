/**
 * @file mediaplayer/mediaplayer.js
 * @description Media Player program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icons, metadata, app.mediaplayer API, status
 * icon) lives in `setup.js`.
 * Exports `start(os, win)` (window creation; UI built by `mediaplayer_data.js`).
 *
 * @module program/mediaplayer/mediaplayer
 */
// ── Window factory ────────────────────────────────────────────────────────────

export function start(os) {

    const _initPath  = app.mediaplayer?._pendingPath  || null;
    const _initEntry = app.mediaplayer?._pendingEntry || null;
    if (app.mediaplayer) {
        app.mediaplayer._pendingPath  = null;
        app.mediaplayer._pendingEntry = null;
    }

    const instanceId = 'mediaplayer-' + Date.now();
    app.mediaplayer._setupQueue.push({ instanceId, _initPath, _initEntry });

    const title = _initPath
        ? _('Media Player') + ' — ' + _initPath.split('/').pop()
        : _('Media Player');

    function exec(action) {
        const inst = app.mediaplayer._instances?.[instanceId];
        if (inst && typeof inst[action] === 'function') inst[action]();
    }

    os.ui.windowStart('mediaplayer', {
        id:         instanceId,
        title,
        windowIcon: true,
        resizable:  true,
        width:      '920px',
        height:     '620px',

        body(win) {
            const langToken = "mediaplayer-" + (win.windowId || instanceId);
            os.language.registerRefresh(langToken, () => {
                const inst = app.mediaplayer._instances?.[instanceId];
                inst?._updateWindowTitle?.();
                inst?._updateMeta?.();
            });

            win.state.close(() => {
                os.language.unregisterRefresh(langToken);
                const inst = app.mediaplayer._instances?.[instanceId];
                if (inst) {
                    inst._cleanup();
                    delete app.mediaplayer._instances[instanceId];
                }
                if (app.mediaplayer._activeId === instanceId) {
                    const ids = Object.keys(app.mediaplayer._instances);
                    app.mediaplayer._activeId = ids.length ? ids[ids.length - 1] : null;
                }
                app.mediaplayer.updateStatusIcon();
            });

            setTimeout(() => {
                const winEl  = $(`#${instanceId}-win`)[0];
                if (!winEl) return;
                const iconEl = winEl.querySelector('.window-header .icon');
                const svgEl  = iconEl?.querySelector('svg') || iconEl?.querySelector('img') || iconEl;
                if (svgEl) {
                    if (window.jQuery) $(svgEl).off('click contextmenu');
                    svgEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const $cm = $(svgEl).closest('.icon').find('.control-menu');
                        $('.window .window-list .icon .control-menu').not($cm).removeClass('show');
                        $('.contextMenu').removeClass('show');
                        $cm.toggleClass('show');
                    });
                }
                const _menuItems = () => [
                    { title: _('Open File'),   icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h6v6h6v10H6z"/></svg>', callback: () => exec('openFile') },
                    { title: _('Add File'),    icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>', callback: () => exec('addFile') },
                    { title: _('Open Folder'), icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>', callback: () => exec('openFolder') },
                    { title: _('Close Media'), callback: () => exec('closeMedia') },
                    '---',
                    { title: _('Play / Pause'), icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>', callback: () => exec('togglePlay') },
                    { title: _('Stop'),         icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h12v12H6z"/></svg>', callback: () => exec('stop') },
                    { title: _('Next'),         icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>', callback: () => exec('next') },
                    { title: _('Previous'),     icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>', callback: () => exec('prev') },
                    '---',
                    { title: _('Repeat'),  callback: () => exec('toggleRepeat') },
                    { title: _('Shuffle'), callback: () => exec('toggleShuffle') }
                ];
                const rootEl = $(`#${instanceId}-root`)[0];
                if (rootEl) app.ui.contextMenu(rootEl, { callback: _menuItems });
                if (svgEl)  app.ui.contextMenu(svgEl,  { callback: _menuItems });

                // Show playlist panel by default — remove mp-hidden via instanceId
                const pl = rootEl?.querySelector('.mp-playlist');
                const lb = $(`#${instanceId}-list`)[0];
                if (pl) pl.classList.remove('mp-hidden');
                if (lb) lb.classList.add('mp-on');
            }, 0);

            const ui = {
                section: {
                    id:    `${instanceId}-root`,
                    class: 'mp-root',
                    subs: [
                        {
                            script: {
                                path: 'mediaplayer/mediaplayer_data.js',
                                call: 'data'
                            }
                        }
                    ]
                }
            };
            return os.ui.body(ui).render();
        }
    });
}
