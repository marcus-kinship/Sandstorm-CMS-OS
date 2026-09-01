/**
 * @file designer/setup.js
 * @description Boot-time registration for the Designer program.
 *
 * Registers the program's icon and metadata only. The window logic lives in
 * `designer.js`, lazy-loaded by `app.program.open()` the first time the
 * user actually opens the program.
 *
 * @module program/designer/setup
 */
export async function setup(os) {
    os.svg.global.load({
        id: 'designer',
        viewBox: '0 0 19 19',
        content: ` <g>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(46, 46, 46)"
 d="M3.1000,-0.000 L15.000,-0.000 C17.209,-0.000 19.000,1.791 19.000,3.1000 L19.000,15.000 C19.000,17.209 17.209,19.000 15.000,19.000 L3.1000,19.000 C1.791,19.000 -0.000,17.209 -0.000,15.000 L-0.000,3.1000 C-0.000,1.791 1.791,-0.000 3.1000,-0.000 Z"/>
<path fill-rule="evenodd"  fill="rgb(255, 255, 255)"
 d="M9.141,7.127 C10.920,7.127 11.809,7.873 11.809,9.364 C11.809,10.952 10.904,11.745 9.095,11.745 L8.598,11.745 L8.598,14.961 C9.026,14.982 9.334,14.993 9.523,14.993 C11.129,14.993 12.441,14.469 13.460,13.421 C14.480,12.374 14.989,11.021 14.989,9.364 C14.989,7.633 14.393,6.262 13.200,5.251 C12.196,4.407 10.808,3.985 9.034,3.985 L4.989,3.985 L4.989,14.928 L8.093,14.928 L8.093,7.127 L9.141,7.127 Z"/>
</g>`
    });

    os.svg.global.load({
        id: 'ic-arrow-double-right',
        viewBox: '0 0 24 24',
        content: `
          <path fill="#fff" transform="translate(-3,0) scale(0.75)" d="M8.59 16.34l4.58-4.59-4.58-4.59L10 5.75l6 6-6 6z"/>
          <path fill="#fff" transform="translate(5,0) scale(0.75)" d="M8.59 16.34l4.58-4.59-4.58-4.59L10 5.75l6 6-6 6z"/>
        `
    });

    os.svg.global.load({
        id: 'ic-designer-file',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 1.5V8h4.5L14 3.5z"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-folder',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M3 5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5z"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-tools',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M21.7 19.3 14.4 12a5 5 0 0 0-6-6.4L11 8.2 8.2 11 5.6 8.4a5 5 0 0 0 6.4 6L19.3 21.7a1 1 0 0 0 1.4 0l1-1a1 1 0 0 0 0-1.4z"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-brush',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M19.4 2.6a2 2 0 0 1 0 2.8L11 13.8l-2.8-2.8 8.4-8.4a2 2 0 0 1 2.8 0zM7 13l3 3-1.5 4.5a2 2 0 0 1-1.6 1.4L2 22l1.1-4.9a2 2 0 0 1 1.4-1.6L7 13z"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-eraser',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M16.24 3.56a2 2 0 0 1 2.83 0l1.37 1.37a2 2 0 0 1 0 2.83L11.6 16.6H6.34L3 13.24l10.9-10.9a2 2 0 0 1 .34.22zM5.5 15.06 8.94 18.5H4a1 1 0 0 1-.83-1.56z"/>`
    });
    os.svg.global.load({
        id: 'ic-layers',
        viewBox: '0 0 24 24',
        content: `
          <path fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" d="M12 3 3 7.5 12 12l9-4.5L12 3z"/>
          <path fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" d="M3 12l9 4.5 9-4.5"/>
          <path fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" d="M3 16.5 12 21l9-4.5"/>
        `
    });

    os.svg.global.load({
        id: 'ic-designer-container',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#fff" stroke-width="1.8"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-form',
        viewBox: '0 0 24 24',
        content: `
          <rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="#fff" stroke-width="1.6"/>
          <path fill="#fff" d="M6 8h12v2H6zM6 12h8v2H6z"/>
        `
    });
    os.svg.global.load({
        id: 'ic-designer-scissors',
        viewBox: '0 0 24 24',
        content: `
          <circle cx="6" cy="6" r="2.4" fill="none" stroke="#fff" stroke-width="1.6"/>
          <circle cx="6" cy="18" r="2.4" fill="none" stroke="#fff" stroke-width="1.6"/>
          <path fill="none" stroke="#fff" stroke-width="1.6" d="M7.8 7.6 20 18M7.8 16.4 20 6"/>
        `
    });
    os.svg.global.load({
        id: 'ic-designer-rows',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="4" width="18" height="7" fill="none" stroke="#fff" stroke-width="1.6"/><rect x="3" y="13" width="18" height="7" fill="none" stroke="#fff" stroke-width="1.6"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-columns',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="4" width="7" height="16" fill="none" stroke="#fff" stroke-width="1.6"/><rect x="14" y="4" width="7" height="16" fill="none" stroke="#fff" stroke-width="1.6"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-cursor',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M5 3v18l4.5-4.5H16z" transform="rotate(-10 12 12)"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-text',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M4 4h16v4h-2V6h-5v14h2v2H9v-2h2V6H6v2H4z"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-text-wave',
        viewBox: '0 0 24 24',
        content: `<path fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" d="M2 16c2.5 0 2.5-8 5-8s2.5 8 5 8 2.5-8 5-8 2.5 8 5 8"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-text-vertical',
        viewBox: '0 0 24 24',
        content: `<rect x="7" y="3" width="3" height="18" fill="#fff"/><rect x="14" y="3" width="3" height="12" fill="#fff"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-align-left',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="5" width="18" height="2" fill="#fff"/><rect x="3" y="11" width="12" height="2" fill="#fff"/><rect x="3" y="17" width="15" height="2" fill="#fff"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-align-center',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="5" width="18" height="2" fill="#fff"/><rect x="6" y="11" width="12" height="2" fill="#fff"/><rect x="4.5" y="17" width="15" height="2" fill="#fff"/>`
    });
    os.svg.global.load({
        id: 'ic-designer-align-right',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="5" width="18" height="2" fill="#fff"/><rect x="9" y="11" width="12" height="2" fill="#fff"/><rect x="6" y="17" width="15" height="2" fill="#fff"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-tag',
        viewBox: '0 0 24 24',
        content: `<text x="12" y="18" font-size="19" font-weight="bold" text-anchor="middle" fill="#fff">&#182;</text>`
    });
    os.svg.global.load({
        id: 'ic-designer-font',
        viewBox: '0 0 24 24',
        content: `<text x="12" y="17" font-size="13" font-family="Georgia, serif" text-anchor="middle" fill="#fff">Aa</text>`
    });
    os.svg.global.load({
        id: 'ic-designer-fontweight',
        viewBox: '0 0 24 24',
        content: `<text x="12" y="18" font-size="17" font-weight="900" text-anchor="middle" fill="#fff">B</text>`
    });
    os.svg.global.load({
        id: 'ic-designer-antialias',
        viewBox: '0 0 24 24',
        content: `<circle cx="9" cy="12" r="6" fill="#fff" opacity="0.4"/><circle cx="15" cy="12" r="6" fill="#fff" opacity="0.9"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-home',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M12 3 3 10v11h6v-6h6v6h6V10z"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-move',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M12 2 8.5 5.5h2.5V10H6.5V7.5L3 11l3.5 3.5V12h4.5v4.5H8.5L12 20l3.5-3.5H13V12h4.5v2.5L21 11l-3.5-3.5V10H13V5.5h2.5z"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-colorpicker',
        viewBox: '0 0 24 24',
        content: `<path fill="#fff" d="M19.23 4.77a2.5 2.5 0 0 0-3.54 0l-2.1 2.1-1-1-1.42 1.42 1 1-8.9 8.9L2 21l3.8-1.27 8.9-8.9 1 1 1.42-1.42-1-1 2.1-2.1a2.5 2.5 0 0 0 0-3.54z"/>`
    });

    os.svg.global.load({
        id: 'ic-designer-grid',
        viewBox: '0 0 24 24',
        content: `<path fill="none" stroke="#fff" stroke-width="1.6" d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>`
    });

    os.program.addInfo("designer", {
        name: () => _("Designer"),
        version: "1.0",
        owner: "Marcus Larsson",
        description: () => _("A simple designer program for creating forms and layouts."),
        icontype: "svg",
        icon: "#designer",
        taskbar: true,
        startmenu: true,
        multistart: false,
        autorun:  true, // auto-start Designer on OS boot
        main: "start",
        file: "designer/designer.js", // Lazy-loaded by app.program.open() on first launch
        root: "program",
        historyOnExit: "clear"
    });

    await os.language.loadProgram("designer");
}
