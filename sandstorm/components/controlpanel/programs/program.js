/**
 * @file controlpanel/programs/program.js
 * @description Manifest for the Programs manager panel.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content lives in the sibling
 * `program.content.js`, loaded on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/program
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-programs',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>`
    });

    os.controlpanel.add({
        front: {
            name:     'programs',
            icon:     '#ic-cp-programs',
            type:     'svg',
            label:    () => _('Programs'),
            keywords: ['programs', 'apps', 'applications', 'software', 'install', 'uninstall', 'load', 'calc', 'notepad']
        },
        panel: {
            id:   'programs',
            name: () => _('Programs'),
            searchItems: [
                { id: 'programs-load',       label: () => _('Install program'),        keywords: ['load', 'add', 'install', 'program', 'module', 'path', 'js'] },
                { id: 'programs-taskbar',    label: () => _('Taskbar visibility'),     keywords: ['taskbar', 'show', 'hide', 'icon'] },
                { id: 'programs-startmenu',  label: () => _('Start menu visibility'),  keywords: ['startmenu', 'start', 'menu', 'show', 'hide'] },
                { id: 'programs-multistart', label: () => _('Multiple instances'),     keywords: ['multistart', 'multiple', 'instances'] },
                { id: 'programs-remove',     label: () => _('Remove program'),         keywords: ['remove', 'uninstall', 'delete'] },
            ],
            contentPath: 'controlpanel/programs/program.content.js',
            renderExport: 'render',
        }
    });
}

export function start() {}
