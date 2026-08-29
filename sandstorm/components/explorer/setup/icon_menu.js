/**
 * @file explorer/setup/icon_menu.js
 * @description Boot-safe, shared icon rendering (`app.explorer.icon.forEntry`)
 * and the file-operation context-menu catalog (`app.explorer.buildContextMenu`)
 * used by callers that can't wait for the lazy-loaded explorer.js — chiefly
 * the desktop icon layer.
 *
 * Exported `registerIconMenu(os)`, called once from explorer/setup/index.js
 * — must run after explorer/setup/core.js (`registerCore`).
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes.
 *
 * @module components/explorer/setup/icon_menu
 */

/**
 * Registers `app.explorer.icon` and `app.explorer.buildContextMenu`.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerIconMenu(os) {
    // ── app.explorer.icon — shared, boot-safe icon rendering ────────────────────
    const _genericFileIconSvg = '<svg viewBox="0 0 24 24" style="color:rgba(255,255,255,0.55)"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h6v6h6v10H6z"/></svg>';

    // .svg is rejected as a raw <img> icon source — even though browsers
    // already sandbox <img>-loaded SVG against script execution, this is a
    // deliberate blanket policy (not just an exploit fix): any registered
    // icontype:'img' path must be a raster image. Real SVG icons go through
    // the sanitized app.load.addSVG() sprite/symbol system (icontype:'svg'
    // or a '#id' reference) instead.
    function _isSvgPath(path) {
        return /\.svg$/i.test(String(path || '').split(/[?#]/)[0]);
    }

    const _imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
    app.explorer.isImageExt = ext => _imageExts.has(String(ext || '').toLowerCase());

    app.explorer.icon = {
        /**
         * @param {{type:string, ext?:string, target?:string}} entry
         * @param {number} [size] - Optional explicit width/height.
         * @returns {string} Icon markup — the folder-tab glyph for folders,
         *   the owning program's registered `extInfo` icon for files, the
         *   target program's own icon for shortcuts, or a generic fallback.
         */
        forEntry(entry, size) {
            const dim = size ? ` width="${size}" height="${size}"` : '';
            if (entry?.type === 'folder') {
                return `<svg viewBox="0 0 1525 1134"${dim}><use href="#ic-folder-tab"></use></svg>`;
            }
            if (entry?.type === 'shortcut') {
                const info = app.program?.getInfo?.(entry.target);
                if (info?.icon) {
                    if (info.icontype === 'svg' || info.icon.startsWith('#')) {
                        return `<svg aria-hidden="true" focusable="false"${dim}><use href="${info.icon}"></use></svg>`;
                    }
                    if (_isSvgPath(info.icon)) {
                        app.dev.warn(`Rejected .svg as an <img> icon path (icontype:'img') for shortcut target "${entry.target}":`, info.icon);
                        return _genericFileIconSvg;
                    }
                    return `<img src="${info.icon}" alt="" draggable="false"${size ? ` width="${size}" height="${size}"` : ''}>`;
                }
                return _genericFileIconSvg;
            }
            const ext = (entry?.ext || '').toLowerCase();
            const ei  = app.program?.extInfo?.[ext];
            if (ei?.icon) {
                if (ei.icontype === 'svg' || ei.icon.startsWith('#')) {
                    return `<svg aria-hidden="true" focusable="false"${dim}><use href="${ei.icon}"></use></svg>`;
                }
                if (_isSvgPath(ei.icon)) {
                    app.dev.warn(`Rejected .svg as an <img> icon path (icontype:'img') for extInfo["${ext}"]:`, ei.icon);
                    return _genericFileIconSvg;
                }
                return `<img src="${ei.icon}" alt="" draggable="false"${size ? ` width="${size}" height="${size}"` : ''}>`;
            }
            return _genericFileIconSvg;
        }
    };

    // ── app.explorer.buildContextMenu(paths, opts) ───────────────────────────────
    const _iconCopy = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    const _iconCut  = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"/></svg>';
    app.explorer.buildContextMenu = function(paths, opts = {}) {
        paths = [].concat(paths).filter(Boolean);
        if (!paths.length) return [];
        const single = paths.length === 1 ? paths[0] : null;
        const entry  = single ? app.explorer._getNode(single) : null;
        const items  = [];

        if (single && entry) {
            const isFolder   = entry.type === 'folder';
            const isShortcut = entry.type === 'shortcut';
            items.push({
                title: _('Open'),
                icon:  '<svg width="14" height="14"><use href="#ic-apps"></use></svg>',
                callback() {
                    if (isShortcut) app.shortcut.launch(single);
                    else if (isFolder) app.explorer.open(single);
                    else app.explorer.openFile(single, entry);
                }
            });
            items.push({
                title: _('Rename'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
                callback() {
                    if (typeof opts.onRename === 'function') opts.onRename(single, entry);
                }
            });
        }

        const clickedPath  = opts.clickedPath || single;
        const clickedEntry = clickedPath ? app.explorer._getNode(clickedPath) : null;
        if (clickedEntry && clickedEntry.type !== 'folder' && clickedEntry.type !== 'shortcut'
            && app.explorer.isImageExt(clickedEntry.ext) && clickedEntry.url) {
            items.push({
                title: _('Set as desktop background'),
                icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v12H4V4zm2 2v8h12V6H6zm2 10h8v2H8v-2zM8.5 8.5l2 2.5 2.5-3 3 4H7l1.5-3.5z"/></svg>',
                callback() {
                    const current = (app.desktop.backgroundOptions || []).slice(-1)[0] || {};
                    app.desktop.setBackgroundImage({
                        image: clickedEntry.url,
                        size: current.size,
                        repeat: current.repeat,
                        position: current.position,
                        color: current.color,
                        blur: current.blur,
                    });
                }
            });
        }

        items.push({ title: _('Copy'), icon: _iconCopy, callback() { app.explorer.copy(paths); } });
        items.push({ title: _('Cut'),  icon: _iconCut,  callback() { app.explorer.cut(paths); } });
        items.push({
            title: _('Copy path'), icon: _iconCopy,
            callback() {
                app.util.copyToClipboard(paths.join('\n'), {
                    successBody: paths.length > 1 ? paths.length + ' ' + _('paths') : paths[0]
                });
            }
        });
        items.push({
            title: _('Delete'),
            icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
            callback() { paths.forEach(p => app.explorer.remove(p)); }
        });

        if (single && entry) {
            items.push({
                title: _('Properties'),
                icon:  '<svg width="14" height="14"><use href="#ic-info"></use></svg>',
                callback() {
                    if (entry.type === 'shortcut') {
                        app.explorer.shortcutEditor.open({ mode: 'edit', path: single });
                        return;
                    }
                    app.explorer.windows.dialog.attributes({ path: single, entry });
                }
            });
        }

        return items;
    };
}
