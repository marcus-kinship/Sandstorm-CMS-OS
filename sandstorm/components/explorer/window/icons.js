/**
 * @file explorer/window/icons.js
 * @description Row/grid icon rendering: extension color-chip icons, the
 * shortcut/file icon dispatcher, the flat folder glyph, entry sort
 * comparison (folders-first, then by the active sort field), and the
 * animated folder icon (grid view) with its content-preview cascade and
 * hover-morph binding.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. `entryCompare`/`animatedFolderIcon` take `state` (for
 * `sortField`/`sortDir`) as their first parameter instead of closing over
 * free variables.
 *
 * @module components/explorer/window/icons
 */
import { EXT_COLOR, FOLDER_SHAPES, FOLDER_PREVIEW_IMG_EXTS } from './state.js';
import { parseSizeToBytes } from './fsutil.js';

/**
 * Color-chip icon for a file extension (registered program icon if one
 * exists, otherwise a colored abbreviation chip).
 *
 * @param {string} ext
 * @param {number} [size=18]
 * @returns {string}
 */
export function extIcon(ext, size = 18) {
    const ei = app.program?.extInfo?.[ext];
    if (ei?.icon) {
        const icontype = ei.icontype || (ei.icon.startsWith('#') ? 'svg' : 'img');
        if (icontype === 'svg') {
            return `<svg width="${size}" height="${size}" style="flex-shrink:0;"><use href="${ei.icon}"></use></svg>`;
        }
        return `<img src="${ei.icon}" width="${size}" height="${size}" style="flex-shrink:0;object-fit:contain;border-radius:2px;">`;
    }
    const color = EXT_COLOR[ext] || 'rgba(255,255,255,0.4)';
    const fs    = Math.round(size * 0.5);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;font-size:${fs}px;font-weight:700;border-radius:${Math.round(size*0.18)}px;background:${color}22;color:${color};letter-spacing:-0.5px;flex-shrink:0;">${(ext || '?').toUpperCase().slice(0,4)}</span>`;
}

/**
 * Non-folder icon for a list/grid row: a shortcut previews the icon of
 * the program it launches (e.g. Explorer/Mail/Solitaire shortcuts on
 * the Desktop); an image file whose registered extInfo opts into
 * thumbnails (see fotoviewer/setup.js's THUMBNAIL_EXTS, threaded through
 * program.js's openWith auto-registration) shows its own `.url` as a real
 * preview instead of the generic glyph; everything else falls back to the
 * ext-based extIcon().
 *
 * @param {Object} entry
 * @param {number} [size=18]
 * @param {'cover'|'contain'} [fit='cover'] - How a thumbnail fills its box —
 *   'cover' (crop to fill; the row/grid default, matching standard file-
 *   manager thumbnail behavior) or 'contain' (show the whole image
 *   letterboxed; used by the meta panel's larger single-selection preview,
 *   where cropping would hide part of the actual photo).
 * @returns {string}
 */
export function fileIcon(entry, size = 18, fit = 'cover') {
    if (entry.type === 'shortcut' && entry.target) {
        const info = app.program.getInfo(entry.target);
        if (info?.icon) {
            if (info.icontype === 'svg') {
                return `<svg width="${size}" height="${size}" style="flex-shrink:0;"><use href="${info.icon}"></use></svg>`;
            }
            return `<img src="${info.icon}" width="${size}" height="${size}" style="flex-shrink:0;object-fit:contain;border-radius:2px;">`;
        }
    }
    if (entry.url && app.program?.extInfo?.[entry.ext]?.thumbnail) {
        return `<img src="${entry.url}" width="${size}" height="${size}" style="flex-shrink:0;object-fit:${fit};border-radius:${Math.round(size * 0.18)}px;">`;
    }
    return extIcon(entry.ext, size);
}

/**
 * Flat folder glyph (list/tree view).
 *
 * @param {boolean} open
 * @returns {string}
 */
export function folderIcon(open) {
    return `<svg width="16" height="16" style="color:${open ? '#facc15' : '#fbbf24'};flex-shrink:0;"><use href="${open ? '#ic-folder-open' : '#ic-folder'}"></use></svg>`;
}

/**
 * Shared by sortedItems() (the real file list) and folderPreviewCandidates()
 * (the folder-icon preview), so a folder's icon always shows the same items
 * — in the same order — that browsing into it would. Folders always sort
 * first; everything else compares by whatever state.sortField/sortDir the
 * user currently has selected.
 *
 * @param {Object} state
 * @param {string} nameA
 * @param {Object} a
 * @param {string} nameB
 * @param {Object} b
 * @returns {number}
 */
export function entryCompare(state, nameA, a, nameB, b) {
    const aIsFolder = a.type === 'folder', bIsFolder = b.type === 'folder';
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    if (state.sortField === 'size') {
        const diff = parseSizeToBytes(a.size) - parseSizeToBytes(b.size);
        return state.sortDir === 'desc' ? -diff : diff;
    }
    if (state.sortField === 'type') {
        const ta = a.ext || '', tb = b.ext || '';
        const cmp = ta.localeCompare(tb, 'sv', { sensitivity: 'base' });
        return state.sortDir === 'desc' ? -cmp : cmp;
    }
    if (state.sortField === 'modified') {
        const cmp = (a.modified || '').localeCompare(b.modified || '');
        return state.sortDir === 'desc' ? -cmp : cmp;
    }
    const cmp = nameA.localeCompare(nameB, 'sv', { sensitivity: 'base' });
    return state.sortDir === 'desc' ? -cmp : cmp;
}

/**
 * Up to 3 of a folder's children, sorted the same way sortedItems()
 * would sort them (see entryCompare) — subfolders are excluded (no
 * ext/url/target of their own).
 *
 * @param {Object} state
 * @param {Object} entry
 * @returns {Array}
 */
export function folderPreviewCandidates(state, entry) {
    if (!entry.children) return [];
    return Object.entries(entry.children)
        .filter(([, child]) => child.type !== 'folder')
        .sort(([nameA, a], [nameB, b]) => entryCompare(state, nameA, a, nameB, b))
        .slice(0, 3)
        .map(([name, child]) => ({
            name,
            type:   child.type,
            target: child.target || null,
            ext:    (child.ext || '').toLowerCase(),
            url:    child.url || null
        }));
}

/**
 * Decides what a folder's preview should show:
 *  - 'image' — one real image thumbnail (first image child with a url)
 *  - 'stack' — up to 3 same-size content icons, cascaded (see folderPreviewHTML)
 *  - 'empty' — nothing to preview
 *
 * @param {Object} state
 * @param {Object} entry
 * @returns {{kind: string, file?: Object, files?: Object[]}}
 */
export function folderPreviewPick(state, entry) {
    const items = folderPreviewCandidates(state, entry);
    if (!items.length) return { kind: 'empty' };

    const image = items.find(f => f.url && FOLDER_PREVIEW_IMG_EXTS.has(f.ext));
    if (image) return { kind: 'image', file: image };

    return { kind: 'stack', files: items };
}

/**
 * One stacked-preview icon — a shortcut's target-program icon, or a
 * file's registered extInfo icon, wrapped in a solid colored circle chip
 * (several registered icons, e.g. Media Player's #ic-mp-play, are drawn
 * white/light for a dark or colored surface and would otherwise vanish
 * against the preview's background). If the file's type has no icon
 * registered anywhere in the system, falls back to the shared generic-
 * file glyph — a real icon already used elsewhere for typeless files —
 * rather than inventing a one-off text abbreviation just for this
 * preview. `layer` positions it in the cascade: each one sits 10% lower
 * and in front of the previous.
 *
 * @param {Object} file
 * @param {number} layer
 * @returns {string}
 */
export function folderPreviewIconHTML(file, layer) {
    let color = 'rgba(0,0,0,0.35)';
    let inner = `<svg viewBox="0 0 24 24"><use href="#ic-file-generic"></use></svg>`;
    if (file.type === 'shortcut' && file.target) {
        const info = app.program.getInfo(file.target);
        if (info?.icon) {
            inner = info.icontype === 'svg' || info.icon.startsWith('#')
                ? `<svg viewBox="0 0 24 24"><use href="${info.icon}"></use></svg>`
                : `<img src="${info.icon}" alt="">`;
        }
    } else {
        const ext = file.ext;
        const ei  = app.program?.extInfo?.[ext];
        color = EXT_COLOR[ext] || 'rgba(0,0,0,0.35)';
        if (ei?.icon) {
            inner = ei.icontype === 'svg' || ei.icon.startsWith('#')
                ? `<svg viewBox="0 0 24 24"><use href="${ei.icon}"></use></svg>`
                : `<img src="${ei.icon}" alt="">`;
        }
    }
    // Stacking step — see explorer/NOTES.md.
    const pos = `top:${layer * 6}%; z-index:${layer + 1};`;
    return `<span class="exp-folder-chip" style="${pos}">${inner}</span>`;
}

/**
 * @param {{kind: string, file?: Object, files?: Object[]}} pick
 * @returns {string}
 */
export function folderPreviewHTML(pick) {
    if (pick.kind === 'image') return `<img src="${pick.file.url}" alt="">`;
    if (pick.kind === 'stack')  return pick.files.map((f, i) => folderPreviewIconHTML(f, i)).join('');
    return '';
}

/**
 * `forceProgress` overrides the resting open/closed progress that would
 * otherwise be derived from whether the folder has anything to preview
 * (0 = force closed, 1 = force fully open, undefined = half-open when
 * non-empty) — used by the multi-selection group icon (always closed)
 * and the meta panel (fully open only when non-empty). Hover always
 * morphs to fully open regardless of the resting state (see bindFolderAnim),
 * then back to rest on mouseleave.
 *
 * @param {Object} state
 * @param {Object} entry
 * @param {number} size
 * @param {number} [forceProgress]
 * @returns {string}
 */
export function animatedFolderIcon(state, entry, size, forceProgress) {
    const pick = entry.type === 'folder' ? folderPreviewPick(state, entry) : { kind: 'empty' };
    const base = forceProgress !== undefined ? forceProgress : (pick.kind !== 'empty' ? 0.5 : 0);

    return `<span class="exp-anim-folder" data-base="${base}" style="width:${size}px;height:${size}px;font-size:${size}px;">
        <svg class="exp-folder-back" viewBox="0 0 1525 1134"><path fill="rgb(226,158,0)" d="${FOLDER_SHAPES.BODY_D}"/></svg>
        <span class="exp-folder-preview">${pick.kind !== 'empty' ? folderPreviewHTML(pick) : ''}</span>
        <svg class="exp-folder-front" viewBox="0 0 1525 1134"><path class="exp-anim-flap" fill="#fbbf24" d="${app.svg.morphPath(FOLDER_SHAPES.CLOSED_D, FOLDER_SHAPES.HALF_D, FOLDER_SHAPES.OPEN_D, base)}"/></svg>
    </span>`;
}

/**
 * Hover → animate a single .exp-anim-folder's flap between its resting
 * state and fully open, and back. Bound per-item in bindRows() (grid
 * items are recreated on every render, so no delegation/cleanup needed).
 *
 * @param {HTMLElement} root
 * @returns {void}
 */
export function bindFolderAnim(root) {
    const flap = root.querySelector('.exp-anim-flap');
    if (!flap) return;
    const base = parseFloat(root.dataset.base) || 0;
    if (base === 0) return; // empty folders never animate — always closed

    const ctrl = app.svg.morph({
        element: flap,
        from: FOLDER_SHAPES.CLOSED_D,
        middle: FOLDER_SHAPES.HALF_D,
        to: FOLDER_SHAPES.OPEN_D,
        progress: base,
    });
    if (!ctrl) return;

    root.addEventListener('mouseenter', () => ctrl.to(1));
    root.addEventListener('mouseleave', () => ctrl.to(base));
}
