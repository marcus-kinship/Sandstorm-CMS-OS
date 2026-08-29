/**
 * @file fotoviewer/setup.js
 * @description Boot-time registration for the Photo Viewer program.
 *
 * Registers the program's icon, metadata, and `openWith` file-type
 * associations only — all boot-cheap. The window logic lives in
 * `fotoviewer.js`, lazy-loaded by `app.program.open()` the first time the
 * user actually opens the program (directly, or via a double-clicked image
 * file in Explorer, which routes through the same `openWith` handler).
 *
 * Supported formats: `jpg jpeg png gif webp svg bmp ico tiff tif avif`.
 *
 * Exported so fotoviewer.js (a separate module — lazy-loaded, not imported
 * here) can `import { IMG_EXTS } from './setup.js'` instead of keeping its
 * own separate copy that could drift out of sync with this one.
 *
 * @module program/fotoviewer/setup
 */
export const IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','tif','avif']);

export const THUMBNAIL_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','ico','avif']);

export async function setup(os) {

    os.svg.global.load({
        id: 'ic-fotoviewer',
        viewBox: '0 0 240 206',
        content: `<g>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#cae2f8"
 d="M11.026,0.415 L228.960,0.415 C234.969,0.415 239.840,5.286 239.840,11.295 L239.840,194.865 C239.840,200.874 234.969,205.745 228.960,205.745 L11.026,205.745 C5.017,205.745 0.146,200.874 0.146,194.865 L0.146,11.295 C0.146,5.286 5.017,0.415 11.026,0.415 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#8B5CF6"
 d="M228.198,205.745 L78.266,205.745 C72.530,198.492 73.008,187.941 79.713,181.243 L156.890,104.138 C164.549,97.227 174.824,95.367 183.090,104.125 L239.840,160.702 L239.840,194.103 C239.840,200.533 234.628,205.745 228.198,205.745 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#6366F1"
 d="M11.788,205.745 C5.358,205.745 0.146,200.533 0.146,194.103 L0.146,136.026 L54.855,81.369 C62.514,74.457 72.789,72.597 81.055,81.355 L203.078,203.008 C203.934,203.862 204.686,204.780 205.340,205.745 L11.788,205.745 Z"/>
<path fill-rule="evenodd"  stroke="rgb(0, 0, 0)" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#cae2f8"
 d="M185.570,34.515 C196.632,34.515 205.600,43.482 205.600,54.545 C205.600,65.607 196.632,74.575 185.570,74.575 C174.507,74.575 165.539,65.607 165.539,54.545 C165.539,43.482 174.507,34.515 185.570,34.515 Z"/>
</g>`
    });

    os.program.addInfo("fotoviewer", {
        name:        () => _("Photo Viewer"),
        version:     "1.0",
        owner:       "Sandstorm",
        description: () => _("View images"),
        icontype:    "svg",
        icon:        "#ic-fotoviewer",
        taskbar:     false,
        startmenu:   true,
        multistart:  true,
        main:        "start",
        autorun:     false,
        desktop:     false,
        windowIcon:  true,
        file:        "fotoviewer/fotoviewer.js", // Lazy-loaded by app.program.open() on first launch
        root:        "program",
        openWith:    [...IMG_EXTS].map(ext => ({
            ext,
            icon:        '#ic-fotoviewer',
            icontype:    'svg',
            label:       ext.toUpperCase() + ' Image',
            description: ext.toUpperCase() + _(' image file'),
            thumbnail:   THUMBNAIL_EXTS.has(ext)
        }))
    });

    await os.language.loadProgram("fotoviewer");
}
