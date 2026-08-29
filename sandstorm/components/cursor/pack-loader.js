/**
 * @file cursor/pack-loader.js
 * @description Loads a cursor pack's manifest + real `.svg` asset files and
 * registers each one via `os.svg.global.load` (the same sprite-registration
 * primitive every other icon in this OS uses — see `sandstorm/components/svg.js`).
 *
 * Only `"standard"` (`cursor/packs/standard/`) has real assets in this pass.
 * Modern/Minimal/Retro/Custom are Control Panel placeholders — requesting
 * any of them here falls back to `"standard"` rather than silently
 * pretending to have distinct art.
 *
 * @module components/cursor/pack-loader
 */

const AVAILABLE_PACKS = new Set(['standard']);

function _packBase(packName) {
    return app.config.local.ComponentsRoot + `cursor/packs/${packName}/`;
}

/**
 * Parses a fetched `.svg` file's text into `{ viewBox, content }` — pulling
 * the root `viewBox` attribute and the root element's inner markup, so
 * `os.svg.global.load({id, viewBox, content})` gets exactly the shape it
 * expects from a real standalone SVG file on disk.
 */
function _parseSVGFile(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (doc.querySelector('parsererror')) {
        throw new Error('SVG parse error');
    }
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') {
        throw new Error('not a valid SVG document');
    }
    return {
        viewBox: root.getAttribute('viewBox') || '0 0 24 24',
        content: root.innerHTML,
    };
}

/**
 * @param {string} packName
 * @returns {Promise<{name:string, cursors:Array<{id:string,file:string,anchor:string}>}>}
 *   The manifest actually used (after any fallback), for `renderer.js` to
 *   build its anchor lookup from.
 */
export async function loadPack(packName) {
    const effectivePack = AVAILABLE_PACKS.has(packName) ? packName : 'standard';
    if (effectivePack !== packName) {
        app.dev?.warn?.(`[cursor/pack-loader] pack "${packName}" has no real assets yet — falling back to "standard"`, 'Cursor');
    }

    const base = _packBase(effectivePack);
    const manifestModule = await import(base + 'manifest.js');
    const manifest = manifestModule.default;

    await Promise.all(manifest.cursors.map(async ({ id, file }) => {
        const res = await fetch(base + file);
        if (!res.ok) {
            app.dev?.error?.(`[cursor/pack-loader] failed to fetch ${file} (${res.status})`, 'Cursor');
            return;
        }
        const text = await res.text();
        const { viewBox, content } = _parseSVGFile(text);
        app.svg.global.load({ id, viewBox, content });
    }));

    return manifest;
}

export function availablePacks() {
    return [...AVAILABLE_PACKS];
}
