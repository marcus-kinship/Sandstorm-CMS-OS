/**
 * @file notepad/setup.js
 * @description Boot-time registration for the Notepad program.
 *
 * Registers the program's icon, metadata, `openWith` file-type
 * associations, and the "New Text File" entries in Explorer's and the
 * desktop's New submenus — all boot-critical, independent of whether the
 * Notepad window itself is ever opened. The window logic lives in
 * `notepad.js`, lazy-loaded by `app.program.open()` the first time the
 * user actually opens the program.
 *
 * @module program/notepad/setup
 */
export async function setup(os) {

    os.svg.global.load({
        id: 'notepad',
        viewBox: '0 0 256 347.78464',
        content: `
      <path fill="#dae5e7" d="M 18.800446,6.27812 H 236.94358 C 245.25942,6.27812 252,13.274649 252,21.589876 V 321.6043 c 0,8.57059 -6.74058,15.31212 -15.05642,15.31212 H 18.800446 c -8.059563,0 -14.8004455,-6.74153 -14.8004455,-15.31212 V 21.589876 c 0,-8.315227 6.7408825,-15.311756 14.8004455,-15.311756 z"/>
      <path fill="#165588" d="M 4.0000005,34.401795 V 21.589876 c 0,-8.315227 6.7408825,-15.0560888 15.0561255,-15.0560888 H 236.94358 c 8.31584,0 14.80049,6.7408618 14.80049,15.0560888 v 12.811919 z"/>
      <path fill="#69cbf0" d="m 209.13301,43.492365 h -19.91428 c -3.92183,0 -7.10162,-2.924018 -7.10162,-7.102042 V 7.1019421 C 182.11711,3.1796857 185.2969,0 189.21873,0 h 19.91428 c 4.17739,0 7.1012,3.1796857 7.1012,7.1019421 V 36.390323 c 0,4.178024 -2.92381,7.102042 -7.1012,7.102042 z m -141.471076,0 H 47.747993 c -3.922307,0 -7.102015,-2.924018 -7.102015,-7.102042 V 7.1019421 C 40.645978,3.1796857 43.825686,0 47.747993,0 h 19.913941 c 4.177832,0 7.101813,3.1796857 7.101813,7.1019421 V 36.390323 c 0,4.178024 -2.923981,7.102042 -7.101813,7.102042 z"/>
      <path fill="#53738a" d="M 214.53042,299.44694 H 42.066467 c -2.980825,0 -5.397511,-2.16112 -5.397511,-5.3981 v -1.42121 c 0,-2.72462 2.416686,-5.39676 5.397511,-5.39676 H 214.53042 c 3.23587,0 5.39684,2.67214 5.39684,5.39676 v 1.42121 c 0,3.23698 -2.16097,5.3981 -5.39684,5.3981 z"/>
    `
    });

    os.program.addInfo("notepad", {
        name: () => _("Notepad"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("A simple notepad application for basic text editing."),
        icontype: "svg",
        icon: "#notepad",
        taskbar: true,
        startmenu: true,
        multistart: true,
        main: "start",
        autorun: false,
        file: "notepad/notepad.js", // Lazy-loaded by app.program.open() on first launch
        root: "program",
        openWith: [
            { ext: 'txt',  icon: '#notepad', icontype: 'svg', label: _('Text File'),     description: _('Plain text document') },
            { ext: 'md',   icon: '#notepad', icontype: 'svg', label: _('Markdown'),      description: _('Markdown formatted document') },
            { ext: 'log',  icon: '#notepad', icontype: 'svg', label: _('Log File'),      description: _('Application log file') },
            { ext: 'ini',  icon: '#notepad', icontype: 'svg', label: _('Config File'),   description: _('INI configuration file') },
            { ext: 'cfg',  icon: '#notepad', icontype: 'svg', label: _('Config File'),   description: _('Configuration file') },
            { ext: 'csv',  icon: '#notepad', icontype: 'svg', label: _('CSV'),           description: _('Comma-separated values') },
            { ext: 'json', icon: '#notepad', icontype: 'svg', label: _('JSON'),          description: _('JavaScript Object Notation') },
            { ext: 'xml',  icon: '#notepad', icontype: 'svg', label: _('XML'),           description: _('Extensible Markup Language') },
            { ext: 'html', icon: '#notepad', icontype: 'svg', label: _('HTML'),          description: _('HyperText Markup Language') },
            { ext: 'css',  icon: '#notepad', icontype: 'svg', label: _('CSS'),           description: _('Cascading Style Sheets') },
            { ext: 'js',   icon: '#notepad', icontype: 'svg', label: _('JavaScript'),    description: _('JavaScript source file') },
            { ext: 'ts',   icon: '#notepad', icontype: 'svg', label: _('TypeScript'),    description: _('TypeScript source file') },
        ]
    });

    const _txtIcon = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h6v6h6v10H6zm2-8h8v2H8v-2zm0 4h5v2H8v-2z"/></svg>';

    // ── Register "New Text File" in explorer's New submenu ────────────────────
    app.explorer?.contextMenu?.submenu?.new?.add({
        icon: _txtIcon,
        text: () => _('Text file'),
        alt:  '.txt',
        fn() { app.explorer._activeStartInlineNewFile?.('txt'); }
    });

    // ── Register "New Text File" in desktop background's New submenu ─────────
    app.desktop?.contextMenu?.submenu?.new?.add({
        icon: _txtIcon,
        text: () => _('Text file'),
        alt:  '.txt',
        fn() { app.desktop?.icon?.startInlineNew?.('file', 'txt'); }
    });

    await os.language.loadProgram("notepad");
}
