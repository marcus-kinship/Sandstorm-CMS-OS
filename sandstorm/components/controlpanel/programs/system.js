/**
 * @file controlpanel/programs/system.js
 * @description Manifest for the "Taskbar" and "About Sandstorm" panels.
 *
 * Boot-loaded — only registers the launcher-tile SVG icons + the
 * `front`/`searchItems` metadata `os.controlpanel.add()` needs synchronously.
 * The actual settings UI (dep-loading, `render`) lives in the sibling
 * `system.content.js`, loaded on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/system
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-taskbar',
        viewBox: '0 0 24 24',
        content: `<rect fill="none" stroke="white" stroke-width="2" x="2" y="7" width="20" height="10" rx="2"/><rect fill="white" x="4.5" y="10.5" width="2" height="3" rx="0.8"/><rect fill="white" x="8.5" y="10.5" width="4" height="3" rx="0.8"/><rect fill="white" x="15" y="10.5" width="3" height="3" rx="0.8"/><rect fill="white" x="18.5" y="10.5" width="1.5" height="3" rx="0.8"/>`
    });

    os.svg.global.load({
        id: 'ic-cp-about',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>`
    });

    // ── Taskbar tab ──────────────────────────────────────────────────────────

    os.controlpanel.add({
        front: {
            name:     'taskbar',
            icon:     '#ic-cp-taskbar',
            type:     'svg',
            label:    () => _('Taskbar'),
            keywords: ['taskbar', 'position', 'top', 'bottom', 'left', 'right', 'lock']
        },
        panel: {
            id:   'taskbar',
            name: () => _('Taskbar'),
            searchItems: [
                { id: 'taskbar-position-wrap', label: () => _('Taskbar position'),     keywords: ['taskbar', 'position', 'bottom', 'top', 'left', 'right', 'dock'] },
                { id: 'taskbar-lock-wrap',     label: () => _('Lock taskbar position'), keywords: ['taskbar', 'lock', 'locked', 'position', 'fixed'] },
                { id: 'taskbar-clock-wrap',    label: () => _('Clock display'),         keywords: ['taskbar', 'clock', 'time', 'digital', 'analog', 'hide'] },
                { id: 'taskbar-timefmt-wrap',  label: () => _('Time format'),           keywords: ['taskbar', 'clock', 'time', '12', '24', 'hour', 'am', 'pm'] },
            ],
            contentPath: 'controlpanel/programs/system.content.js',
            renderExport: 'renderTaskbar',
        }
    });

    // ── About tab ────────────────────────────────────────────────────────────

    os.controlpanel.add({
        front: {
            name:     'about',
            icon:     '#ic-cp-about',
            type:     'svg',
            label:    () => _('About Sandstorm'),
            keywords: ['about', 'sandstorm', 'version', 'system', 'info', 'information'],
            order:    999,
            pinBottom: true,
            action:   async () => {
                const mod = await os.includeModule(os.config.local.ComponentsRoot + 'ui/win.js');
                if (mod?.start) mod.start(os);
            }
        },
        panel: {
            id:   'about',
            name: () => _('About Sandstorm'),
            searchItems: [
                { id: 'about-version',  label: () => _('Version'),    keywords: ['version', 'sandstorm', 'build', 'about'] },
                { id: 'about-platform', label: () => _('Platform'),   keywords: ['platform', 'os', 'operating system', 'windows', 'mac', 'linux'] },
                { id: 'about-lang',     label: () => _('Language'),   keywords: ['language', 'locale', 'browser language'] },
                { id: 'about-screen',   label: () => _('Screen'),     keywords: ['screen', 'resolution', 'display', 'size'] },
                { id: 'about-cpu',      label: () => _('CPU cores'),  keywords: ['cpu', 'cores', 'processor', 'hardware'] },
                { id: 'about-ua',       label: () => _('User Agent'), keywords: ['user agent', 'browser', 'ua'] },
            ],
            contentPath: 'controlpanel/programs/system.content.js',
            renderExport: 'renderAbout',
        }
    });
}

export function start() {}
