/**
 * @file cursor/packs/standard/manifest.js
 * @description Manifest for the "standard" cursor pack — the only pack with
 * real assets in this pass (Modern/Minimal/Retro/Custom are Control Panel
 * placeholders that fall back to this one — see pack-loader.js).
 *
 * `anchor` tells `renderer.js` how to align the SVG against the raw pointer
 * position: `"top-left"` for directional glyphs whose hotspot is a tip near
 * their own top-left corner (arrow-shaped cursors), `"center"` for
 * symmetric glyphs (resize handles, move, busy, unavailable, text I-beam) — matching
 * real OS cursor hotspot conventions.
 *
 * @module components/cursor/packs/standard/manifest
 */
export default {
    name: 'Standard',
    version: '1.0.0',
    cursors: [
        { id: 'cursor-normal',      file: 'normal.svg',      anchor: 'top-left' },
        { id: 'cursor-alt',         file: 'alt.svg',         anchor: 'top-left' },
        { id: 'cursor-link',        file: 'link.svg',        anchor: 'top-left' },
        { id: 'cursor-handwriting', file: 'handwriting.svg', anchor: 'top-left' },
        { id: 'cursor-text',        file: 'text.svg',        anchor: 'center' },
        { id: 'cursor-help',        file: 'help.svg',        anchor: 'top-left' },
        { id: 'cursor-working',     file: 'working.svg',     anchor: 'top-left' },
        { id: 'cursor-move',        file: 'move.svg',        anchor: 'center' },
        { id: 'cursor-busy',        file: 'busy.svg',        anchor: 'center' },
        { id: 'cursor-unavailable', file: 'unavailable.svg', anchor: 'center' },
        { id: 'cursor-resize-h',    file: 'resize-h.svg',    anchor: 'center' },
        { id: 'cursor-resize-v',    file: 'resize-v.svg',    anchor: 'center' },
        { id: 'cursor-resize-d1',   file: 'resize-d1.svg',   anchor: 'center' },
        { id: 'cursor-resize-d2',   file: 'resize-d2.svg',   anchor: 'center' },
        { id: 'cursor-crosshair',   file: 'crosshair.svg',   anchor: 'center' },
    ],
};
