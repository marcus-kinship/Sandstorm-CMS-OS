/**
 * @file controlpanel/programs/system.content.js
 * @description Taskbar settings and "About Sandstorm" panel content —
 * lazy-loaded on first open of either panel via `system.js`'s
 * `panel.contentPath`.
 *
 * `setup(os)` is limited to deps — never `os.controlpanel.add()` or any
 * other boot-only registration, which lives exclusively in the manifest.
 *
 * @module components/controlpanel/programs/system.content
 */

export async function setup(os) {
    await app.ui.ensureLoaded(os, ['dropmenu', 'check']);
}

export function renderTaskbar(os) {
    const tbCfg  = os.desktop?.taskbar?.config || {};
    const pos    = (tbCfg.position || 'taskbar-bottom').replace('taskbar-', '');
    const locked = tbCfg.positionLock !== false;
    const clockMode = tbCfg.clockDisplayMode || 'digital';
    const timeFormat = tbCfg.clockTimeFormat || '24';

    const posOpts = [
        { value: 'bottom', label: _('Bottom') },
        { value: 'top',    label: _('Top')    },
        { value: 'left',   label: _('Left')   },
        { value: 'right',  label: _('Right')  },
    ];

    const clockOpts = [
        { value: 'digital',       label: '00:00:00' },
        { value: 'digital-short', label: '00:00'    },
        { value: 'analog',        label: _('Analog') },
        { value: 'hidden',        label: _('Hide')   },
    ];

    const timeFormatOpts = [
        { value: '24', label: _('24-hour') },
        { value: '12', label: _('12-hour (AM/PM)') },
    ];

    const layout = {
        container: {
            className: 'cp-customizer',
            style: 'margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:100%;box-sizing:border-box;',
            subs: [{
                block: {
                    style: 'max-width:1024px;width:100%;',
                    subs: [
                        { block: { className: 'h1', html: _('Taskbar') } },
                        { block: { className: 'p',  html: _('Configure taskbar position and behavior') } },
                        { block: { className: 'line' } },
                        { block: {
                            id: 'taskbar-position-wrap',
                            style: 'display:contents;',
                            search: { label: () => _('Taskbar position'), keywords: ['taskbar', 'position', 'bottom', 'top', 'left', 'right', 'dock'] },
                            subs: [ os.ui.label(_('Position'), 'cp-tb-position', os.ui.dropmenu({ id: 'cp-tb-position', options: posOpts, selected: pos })) ]
                        }},
                        { block: { className: 'line' } },
                        { block: {
                            id: 'taskbar-lock-wrap',
                            style: 'display:contents;',
                            search: { label: () => _('Lock taskbar position'), keywords: ['taskbar', 'lock', 'locked', 'position', 'fixed'] },
                            subs: [ os.ui.label(_('Lock taskbar position'), 'cp-tb-lock', os.ui.check({ id: 'cp-tb-lock', checked: locked })) ]
                        }},
                        { block: { className: 'line' } },
                        { block: {
                            id: 'taskbar-clock-wrap',
                            style: 'display:contents;',
                            search: { label: () => _('Clock display'), keywords: ['taskbar', 'clock', 'time', 'digital', 'analog', 'hide'] },
                            subs: [ os.ui.label(_('Clock display'), 'cp-tb-clock', os.ui.dropmenu({ id: 'cp-tb-clock', options: clockOpts, selected: clockMode })) ]
                        }},
                        { block: { className: 'line' } },
                        { block: {
                            id: 'taskbar-timefmt-wrap',
                            style: 'display:contents;',
                            search: { label: () => _('Time format'), keywords: ['taskbar', 'clock', 'time', '12', '24', 'hour', 'am', 'pm'] },
                            subs: [ os.ui.label(_('Time format'), 'cp-tb-timefmt', os.ui.dropmenu({ id: 'cp-tb-timefmt', options: timeFormatOpts, selected: timeFormat })) ]
                        }},
                    ],
                },
            }],
        },
    };

    const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'taskbar' }).render();

    setTimeout(() => {
        os.ui.dropmenu?.initAll();

        const taskbarid = window.$ ? $('#' + os.desktop.taskbar.config.options.id) : null;

        $('#cp-tb-position').on('change', function () {
            const newPosition = 'taskbar-' + this.value;
            os.desktop.taskbar.config.position = newPosition;

            if (taskbarid?.length) {
                taskbarid.css('transition', 'none');
                taskbarid
                    .removeClass('taskbar-left taskbar-right taskbar-top taskbar-bottom')
                    .addClass(newPosition);

                if (taskbarid.hasClass('taskbar-left') || taskbarid.hasClass('taskbar-right')) {
                    os.desktop.taskbar.config.clockOverflowActive = false;
                    clearInterval(os.desktop.taskbar.config.clockInterval);
                    os.desktop.taskbar.config.clockInterval = os.desktop.taskbar.analogClock();
                } else {
                    os.desktop.taskbar.setClockDisplay(os.desktop.taskbar.config.clockDisplayMode);
                }

                os.desktop.taskbar.adjustWindowsPosition(taskbarid);
                os.desktop.taskbar.adjustFullWindowsPosition(taskbarid);
                taskbarid.css('transition', '0.9s 0.8s, opacity 1800ms');
                os.desktop.taskbar.sort.sortableTaskIcons();
            }
        });

        $('#cp-tb-lock').on('change', function () {
            const isChecked = this.checked;
            os.desktop.taskbar.config.positionLock = isChecked;
            if (taskbarid?.length) {
                if (isChecked) {
                    os.desktop.taskbar.removeMove(taskbarid);
                } else {
                    os.desktop.taskbar.addMove(taskbarid);
                }
            }
        });

        $('#cp-tb-clock').on('change', function () {
            os.desktop.taskbar.setClockDisplay(this.value);
        });

        $('#cp-tb-timefmt').on('change', function () {
            os.desktop.taskbar.config.clockTimeFormat = this.value;
            os.desktop.taskbar.setClockDisplay(os.desktop.taskbar.config.clockDisplayMode);
        });
    }, 0);

    return html;
}

export function renderAbout(os) {
    const ua  = navigator.userAgent;
    const os_ = /Win/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : 'Unknown';

    const infoRow = os.ui.infoRow;

    const layout = {
        container: {
            style: 'padding:28px;overflow-y:auto;height:100%;box-sizing:border-box;',
            subs: [{
                block: {
                    style: 'max-width:640px;',
                    subs: [
                        { block: { className: 'h1', html: 'Sandstorm' } },
                        { block: { className: 'p',  html: _('System information') } },
                        { block: { className: 'line' } },
                        infoRow('about-version',  _('Version'),    '1.0',                                                      ['version', 'sandstorm', 'build', 'about']),
                        infoRow('about-platform', _('Platform'),   os_,                                                        ['platform', 'os', 'operating system', 'windows', 'mac', 'linux']),
                        infoRow('about-lang',     _('Language'),   navigator.language || '—',                                  ['language', 'locale', 'browser language']),
                        infoRow('about-screen',   _('Screen'),     `${screen.width} × ${screen.height} px`,                   ['screen', 'resolution', 'display', 'size']),
                        infoRow('about-cpu',      _('CPU cores'),  String(navigator.hardwareConcurrency || '—'),               ['cpu', 'cores', 'processor', 'hardware']),
                        infoRow('about-ua',       _('User Agent'), `<span style="font-size:10px;word-break:break-all;">${ua}</span>`, ['user agent', 'browser', 'ua'])
                    ]
                }
            }]
        }
    };

    return os.ui.body(layout, { programid: 'controlpanel', panelId: 'about' }).render();
}
