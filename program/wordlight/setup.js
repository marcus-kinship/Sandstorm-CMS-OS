/**
 * @file wordlight/setup.js
 * @description Boot-time registration for Word light — Sandstorm's document
 * program for viewing and block-editing PDF files (see KRAVSPEC_WORD_LIGHT.md).
 *
 * Registers the program's icon, metadata, and the `.pdf` `openWith` file-type
 * association only — all boot-cheap. The window logic lives in
 * `wordlight.js`, lazy-loaded by `app.program.open()` the first time the user
 * opens the program (from the Start menu, or via a double-clicked PDF in
 * Explorer/on the desktop, which routes through the same `openWith` handler
 * and leaves the path in `app.wordlight._pendingPath`). PDF.js and pdf-lib
 * are only loaded once a document is actually opened.
 *
 * @module program/wordlight/setup
 */
export async function setup(os) {

    // Own icon: a document with text lines and a pen — no third-party marks
    os.svg.global.load({
        id: 'ic-wordlight',
        viewBox: '0 0 24 24',
        content: `<path fill="#3b78c4" d="M5 2h9l5 5v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
<path fill="#9cc3f0" d="M14 2l5 5h-4a1 1 0 0 1-1-1z"/>
<rect fill="#fff" x="6" y="9" width="9" height="1.4" rx=".7"/>
<rect fill="#fff" x="6" y="12" width="7" height="1.4" rx=".7"/>
<rect fill="#fff" x="6" y="15" width="5" height="1.4" rx=".7"/>
<path fill="#ffd166" d="M20.7 11.3l1 1a1 1 0 0 1 0 1.4l-6.2 6.2-2.6.6.6-2.6 6.2-6.2a1 1 0 0 1 1.4 0z"/>`
    });

    os.program.addInfo('wordlight', {
        name:        'Word light',
        version:     '1.0',
        owner:       'Sandstorm',
        description: () => _('View and annotate PDF documents'),
        icontype:    'svg',
        icon:        '#ic-wordlight',
        taskbar:     false,
        startmenu:   true,
        multistart:  true,
        main:        'start',
        autorun:     false,
        desktop:     false,
        windowIcon:  true,
        historyScope: 'private',
        file:        'wordlight/wordlight.js', // Lazy-loaded by app.program.open() on first launch
        root:        'program',
        openWith: [{
            ext:         'pdf',
            icon:        '#ic-wordlight',
            icontype:    'svg',
            label:       'PDF',
            description: _('PDF document'),
        }]
    });

    await os.language.loadProgram('wordlight');
}
