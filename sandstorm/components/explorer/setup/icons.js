/**
 * @file explorer/setup/icons.js
 * @description Explorer boot-time icon/program registration: SVG sprite
 * definitions (folder, folder-open, generic file, per-extension badges,
 * folder-tab, the Explorer program icon itself), the Explorer CSS, and the
 * `os.program.addInfo("explorer", ...)` registration.
 *
 * Exported `registerIcons(os)`, called once from explorer/setup/index.js.
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes.
 *
 * @module components/explorer/setup/icons
 */

/**
 * Registers Explorer's SVG icons, CSS, and program metadata.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerIcons(os) {
    os.svg.global.load({ id: 'ic-folder',      viewBox: '0 0 24 24', content: '<path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>' });
    os.svg.global.load({ id: 'ic-folder-open', viewBox: '0 0 24 24', content: '<path fill="currentColor" d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2zm0 12H4V6h5.17l2 2H20v10z"/>' });

    os.svg.global.load({ id: 'ic-file-generic', viewBox: '0 0 24 24', content: '<path fill="currentColor" d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/>' });

    const _fileTypeIcons = {
        pdf:  'PDF', xlsx: 'XLS', docx: 'DOC',
        exe:  'EXE', zip:  'ZIP', msi:  'MSI', m3u: 'M3U',
    };
    Object.entries(_fileTypeIcons).forEach(([ext, label]) => {
        const id = `ic-file-${ext}`;
        os.svg.global.load({
            id, viewBox: '0 0 24 24',
            content: `<path fill="#e8eaed" d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/><text x="11.5" y="17.5" text-anchor="middle" font-size="6" font-weight="700" font-family="Arial, sans-serif" fill="#3c4043">${label}</text>`
        });
        app.program.extInfo[ext] = { programId: null, icon: `#${id}`, icontype: 'svg', label: null, description: null };
    });

    os.svg.global.load({
        id: 'ic-folder-tab',
        viewBox: '0 0 1525 1134',
        content: `<path fill="rgb(226,158,0)" d="M127.000,0.000 C145.1000,0.000 587.1000,0.000 638.000,0.000 C668.617,6.674 695.606,30.942 722.1000,59.1000 C757.339,96.425 790.616,133.571 816.1000,134.000 C846.250,133.571 1390.000,132.1000 1390.000,132.1000 C1430.869,132.1000 1464.000,166.131 1464.000,207.000 L1464.000,1059.1000 C1464.000,1100.869 1430.869,1133.1000 1390.000,1133.1000 L136.1000,1133.1000 C96.131,1133.1000 62.1000,1100.869 62.1000,1059.1000 L62.1000,63.000 C62.1000,22.131 107.1000,0.000 127.000,0.000 Z"/><path fill="#fbbf24" d="M87.1000,232.000 C98.1000,231.750 628.833,233.333 646.000,233.000 C673.583,233.459 713.500,199.167 730.300,187.488 C768.858,159.907 783.917,139.781 822.000,133.1000 C828.167,133.969 1402.000,133.1000 1402.000,133.1000 C1429.312,133.969 1466.778,172.239 1463.000,199.000 L1468.328,1084.962 C1464.817,1111.061 1441.179,1133.981 1414.1000,1133.1000 L113.000,1133.1000 C86.631,1134.019 61.322,1111.985 56.739,1085.791 L63.000,289.000 C63.000,289.000 62.531,262.750 63.000,251.1000 C63.469,241.250 71.1000,232.250 87.1000,232.000 Z"/>`
    });

    os.svg.global.load({
        id: 'ic-explorer',
        viewBox: '0 0 224 187',
        content: `<g><path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="rgb(226, 158, 0)"
 d="M10.72,0.28 L86.56,0.28 C92.48,0.28 96.97,0.85 101.92,6.36 C101.92,6.36 110.932,15.347 113.76,18.04 C115.86,20.385 118.08,21.28 123.68,21.72 C124.36,21.88 96.64,45.4 96.64,45.4 L0,45.4 L0,10.1 C0,5.08 4.8,0.28 10.72,0.28 Z"/>
<path fill-rule="evenodd" stroke="none" fill="#fbbf24"
 d="M3.36,42.84 C3.36,42.84 47.307,42.84 91.68,42.84 C92.452,42.84 95.381,42.89 97.76,41.08 C103.432,35.633 116.24,22.54 116.96,22.04 C117.68,21.54 117.68,21.4 120.8,21.72 C120.88,21.72 213.12,21.72 213.12,21.72 C219.129,21.72 224,26.591 224,32.6 L224,170.68 C224,176.689 219.129,181.56 213.12,181.56 L10.88,181.56 C4.871,181.56 0,176.689 0,170.68 L0,45.4 C0,43.05 2.951,42.89 3.36,42.84 Z"/>
<path fill-rule="evenodd" stroke="none" fill="#016dc3"
 d="M80,144.28 C80,144.28 79.973,180.533 80,181.4 C79.973,186.427 75.613,187 74.72,187 C71.333,187 45.696,187 42.56,187 C39.16,187 37.36,184.058 37.36,181.45 C37.36,180.522 37.36,118.757 37.36,111.69 C37.36,105.69 43.547,101.53 47.36,101.53 C50.667,101.53 166.747,101.56 175.1,101.56 C184,101.53 186.703,109.593 186.72,111.64 C186.703,119.52 186.734,177.073 186.72,181.4 C186.703,186.467 181.44,187 181.44,187 C181.44,187 151.886,187 149.296,187 C146.064,187 144.01,184.277 143.1,181.4 C144.01,179.646 143.1,144.12 143.1,144.12 L80,144.28 Z"/>
<path fill-rule="evenodd" stroke="none" fill="#108dd9"
 d="M80,144.28 C80,144.28 85.926,150.496 39.785,105.518 C41.933,103.026 45.073,101.53 47.36,101.53 C50.667,101.53 166.747,101.56 176,101.56 C180.062,101.53 183.044,104.201 184.124,105.521 C183.784,105.861 143.1,144.12 143.1,144.12 L80,144.28 Z"/></g>`
    });

    app.addCSS("explorer", "sandstorm/components/explorer/explorer.css", true);

    os.program.addInfo("explorer", {
        name:        () => _("Explorer"),
        version:     "1.0",
        owner:       "Sandstorm",
        description: () => _("A simple File Manager"),
        icontype:    "svg",
        icon:        "#ic-explorer",
        programtype: "system",
        taskbar:     true,
        startmenu:   true,
        multistart:  true,
        main:        "start",
        desktop:     true,
        autorun:     false,
        file:        "explorer/explorer.js", // Lazy-loaded by app.program.open() on first launch
        root:        "components"
    });
}
