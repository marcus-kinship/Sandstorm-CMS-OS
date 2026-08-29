/**
 * @file explorer/window/menus.js
 * @description Context menus: a file/folder row's right-click menu, a tree
 * row's right-click menu, the toolbar Edit-button dropdown, and the global
 * `app.explorer.contextMenu` entries registered on `.exp-main` (Select All,
 * Copy/Cut/Paste, New Folder, Update, Properties, Sort by, New submenu).
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables. `registerContextMenuEntries(state)` is
 * called once per window from window/index.js — see its own docstring for
 * a note on a pre-existing duplicate-registration quirk this preserves.
 *
 * @module components/explorer/window/menus
 */
import { node } from './fsutil.js';
import { navigate, openFile } from './core.js';
import { openMoveStatus } from './dragdrop.js';
import { startInlineNewFolder, startInlineNewFile } from './createitems.js';

const _iconRefresh  = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
const _iconPasteExp = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>';
const _iconCopyExp  = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const _iconCutExp   = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"/></svg>';
const _iconInfoExp  = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';

/**
 * Builds the right-click menu for a file/folder row.
 *
 * @param {Object} state
 * @param {string} path
 * @returns {Array}
 */
export function rowMenu(state, path) {
    const entry    = node(path);
    const isFolder = entry?.type === 'folder';
    const targets  = state.selection.size > 0 ? [...state.selection] : [path];
    const clip     = app.explorer?.clipboard;
    const ext      = isFolder ? null : (entry?.ext || path.split('.').pop() || '').toLowerCase();
    const handlers = ext ? (app.program?.fileHandlers?.[ext] || []) : [];
    app.dev.log(`rowMenu: "${path}" isFolder=${isFolder} ext="${ext}" handlers=${handlers.length}`, 'Explorer');

    const menu = [
        {
            title: _('Open'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>',
            callback() { if (isFolder) navigate(state, path); else if (!state.isDialog) openFile(state, path); }
        },
    ];

    if (!isFolder && !state.isDialog && handlers.length > 0) {
        menu.push({
            title:   _('Open With'),
            icon:    '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
            submenu: handlers.map(h => {
                const info    = app.program.getInfo(h.id) || {};
                const iconHml = info.icon
                    ? `<svg width="14" height="14"><use href="${info.icon}"></use></svg>`
                    : '';
                return {
                    title:    info.name || h.id,
                    icon:     iconHml,
                    callback() { h.fn(path, entry); }
                };
            })
        });
    }

    if (!isFolder && !state.isDialog && app.explorer.isImageExt(ext) && entry?.url) {
        menu.push({
            title: _('Set as desktop background'),
            icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v12H4V4zm2 2v8h12V6H6zm2 10h8v2H8v-2zM8.5 8.5l2 2.5 2.5-3 3 4H7l1.5-3.5z"/></svg>',
            callback() {
                const current = (app.desktop.backgroundOptions || []).slice(-1)[0] || {};
                app.desktop.setBackgroundImage({
                    image: entry.url,
                    size: current.size,
                    repeat: current.repeat,
                    position: current.position,
                    color: current.color,
                    blur: current.blur,
                });
            }
        });
    }

    menu.push(
        { title: _('Copy'), icon: _iconCopyExp, callback() { app.explorer?.copy(targets); } },
        { title: _('Cut'),  icon: _iconCutExp,  callback() { app.explorer?.cut(targets); } },
        {
            title: _('Copy path'), icon: _iconCopyExp,
            callback() {
                app.util.copyToClipboard(targets.join('\n'), {
                    successBody: targets.length > 1 ? targets.length + ' ' + _('paths') : targets[0]
                });
            }
        },
    );

    if (clip?.items?.length) {
        const dest = isFolder ? path : state.path;
        menu.push({
            title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
            icon:  _iconPasteExp,
            callback() {
                app.explorer?.paste(dest, (pi, dp, mode) => {
                    openMoveStatus(state, pi, mode === 'cut' ? _('Clipboard') : _('Clipboard (copy)'), dp, mode);
                });
            }
        });
    }

    menu.push(
        {
            title: _('Select All'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/></svg>',
            callback() {
                const items = state.winRoot?.querySelectorAll('.exp-row, .exp-grid-item');
                if (!items) return;
                items.forEach(r => { state.selection.add(r.dataset.path); r.classList.add('exp-selected'); });
                app.dev.log(`Select All (${state.selection.size} items) in ${state.path}`, 'Explorer');
            }
        },
        {
            title: _('Deselect All'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>',
            callback() {
                const prev = state.selection.size;
                state.selection.clear();
                state.winRoot?.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.remove('exp-selected'));
                app.dev.log(`Deselect All — cleared ${prev} item(s) in ${state.path}`, 'Explorer');
            }
        },
        {
            title: _('Rename'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
            callback() {
                const parts = path.split('/');
                const itemName = parts[parts.length - 1];
                const row = state.winRoot?.querySelector(`.exp-row[data-path="${path}"], .exp-grid-item[data-path="${path}"]`);
                if (!row) return;
                const nameSpan = row.querySelector('td span, span');
                if (!nameSpan) return;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = itemName;
                input.style.cssText = 'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);color:inherit;padding:1px 4px;border-radius:3px;font-size:12px;width:120px;outline:none;';
                nameSpan.replaceWith(input);
                setTimeout(() => {
                    input.focus();
                    input.setSelectionRange(0, input.value.length);
                    requestAnimationFrame(() => app.ui.caret.position.update(input));
                }, 50);
                const commit = () => {
                    const newName = input.value.trim() || itemName;
                    const span = document.createElement('span');
                    span.textContent = newName;
                    input.replaceWith(span);
                    if (newName !== itemName) {
                        const parentPath = parts.slice(0, -1).join('/') || '/';

                        const doRename = (from, to) => {
                            const parentNode = node(parentPath);
                            if (parentNode?.children?.[from]) {
                                parentNode.children[to] = parentNode.children[from];
                                delete parentNode.children[from];
                                app.explorer._refreshAll(parentPath);
                            }
                        };

                        const session = state.win?.history;
                        if (session) {
                            session.execute({
                                title: `${_('Rename')} ${itemName} → ${newName}`,
                                do()   { doRename(itemName, newName); },
                                undo() { doRename(newName, itemName); },
                                redo() { doRename(itemName, newName); }
                            });
                        } else {
                            doRename(itemName, newName);
                        }

                        app.api.post('/api/fs/rename', { path, oldName: itemName, newName })
                            ?.success?.(() => {})?.fail?.(() => {});
                    }
                };
                input.addEventListener('blur', commit);
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                    else if (e.key === 'Escape') { input.value = itemName; input.blur(); }
                });
            }
        },
        {
            title: _('Move to Recycle Bin'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#ic-recyclebin"></use></svg>',
            callback() {
                const sel = state.selection.size > 0 ? [...state.selection] : [path];
                app.recyclebin?.send(sel);
            }
        },
        {
            title: _('Delete permanently'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
            callback() {
                const sel = state.selection.size > 0 ? [...state.selection] : [path];
                app.ui.confirm({
                    title:     _('Delete permanently'),
                    message:   _('This cannot be undone.') + '\n' + _('Delete') + ' ' + sel.length + ' ' + (sel.length === 1 ? _('item') : _('items')) + '?',
                    confirm:   _('Delete'),
                    cancel:    _('Cancel'),
                    onConfirm: () => sel.forEach(p => app.explorer.remove(p, 'sub'))
                });
            }
        },
        {
            title: _('Update'),
            icon:  _iconRefresh,
            callback() { navigate(state, state.path); }
        },
        {
            title: _('Properties'),
            icon:  _iconInfoExp,
            callback() { app.explorer.windows.dialog.attributes({ path, entry }); }
        }
    );

    return menu;
}

/**
 * Builds the right-click menu for a side-panel tree row.
 *
 * @param {Object} state
 * @param {string} path
 * @returns {Array}
 */
export function treeRowMenu(state, path) {
    const clip = app.explorer?.clipboard;

    const menu = [
        {
            title: _('Open'),
            icon: '<svg width="14" height="14"><use href="#ic-folder"></use></svg>',
            callback() { navigate(state, path); }
        },
        { title: _('Copy'), icon: _iconCopyExp, callback() { app.explorer?.copy([path]); } },
        { title: _('Cut'),  icon: _iconCutExp,  callback() { app.explorer?.cut([path]); } },
        { title: _('Copy path'), icon: _iconCopyExp, callback() { app.util.copyToClipboard(path); } },
    ];

    if (clip?.items?.length) {
        menu.push({
            title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
            icon: _iconPasteExp,
            callback() {
                app.explorer?.paste(path, (pi, dp, mode) => {
                    openMoveStatus(state, pi, mode === 'cut' ? _('Clipboard') : _('Clipboard (copy)'), dp, mode);
                });
            }
        });
    }

    const newExtras = app.explorer?.contextMenu?.submenu?.new?._build?.() || [];
    menu.push({
        title: _('New'),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
        submenu: [
            {
                title: _('Folder'),
                icon: '<svg width="14" height="14" style="color:#fbbf24"><use href="#ic-folder"></use></svg>',
                callback() { navigate(state, path); setTimeout(() => startInlineNewFolder(state), 80); }
            },
            {
                title: _('File'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>',
                callback() { navigate(state, path); setTimeout(() => startInlineNewFile(state), 80); }
            },
            ...newExtras
        ]
    });

    return menu;
}

/**
 * Builds the Edit-toolbar-button dropdown (Copy/Cut/Paste/New).
 *
 * @param {Object} state
 * @returns {Array}
 */
export function editToolbarMenu(state) {
    const clip    = app.explorer?.clipboard;
    const targets = state.selection.size > 0 ? [...state.selection] : [];
    const menu    = [];

    if (targets.length) {
        menu.push({ title: _('Copy'), icon: _iconCopyExp, callback() { app.explorer?.copy(targets); } });
        menu.push({ title: _('Cut'),  icon: _iconCutExp,  callback() { app.explorer?.cut(targets); } });
    }

    if (clip?.items?.length) {
        menu.push({
            title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
            icon: _iconPasteExp,
            callback() {
                app.explorer?.paste(state.path, (pi, dp, mode) => {
                    openMoveStatus(state, pi, mode === 'cut' ? _('Clipboard') : _('Clipboard (copy)'), dp, mode);
                });
            }
        });
    }

    const newExtras = app.explorer?.contextMenu?.submenu?.new?._build?.() || [];
    menu.push({
        title: _('New'),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
        submenuClass: 'exp-aero-submenu',
        submenu: [
            {
                title: _('Folder'),
                icon: '<svg width="14" height="14" style="color:#fbbf24"><use href="#ic-folder"></use></svg>',
                callback() { startInlineNewFolder(state); }
            },
            {
                title: _('File'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>',
                callback() { startInlineNewFile(state); }
            },
            ...newExtras
        ]
    });

    return menu;
}

/**
 * Registers this window's entries onto the global, shared
 * `app.explorer.contextMenu` (fires on `.exp-main`, children included).
 * Dynamic items (functions) are evaluated at each right-click so state is
 * always current.
 *
 * PRE-EXISTING QUIRK, preserved as-is: `app.explorer.contextMenu._entries`
 * is one shared array (not per-window), and `.add()` never dedupes by id
 * the way e.g. startmenu.js's `_buttons` does — so opening a second
 * Explorer window (multistart: true) registers a second, duplicate copy of
 * every entry below (each closing over its own window's `state`). This was
 * already true of the original monolithic explorer.js; not fixed here.
 *
 * @param {Object} state
 * @returns {void}
 */
export function registerContextMenuEntries(state) {
    app.explorer.contextMenu.add({
        title: _('Select All'),
        icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/></svg>',
        callback() {
            const items = state.winRoot?.querySelectorAll('.exp-row, .exp-grid-item');
            if (!items) return;
            items.forEach(r => { state.selection.add(r.dataset.path); r.classList.add('exp-selected'); });
        }
    }, -30);

    app.explorer.contextMenu.add(() => {
        if (!state.selection.size) return null;
        return {
            title: _('Deselect All'),
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>',
            callback() {
                state.selection.clear();
                state.winRoot?.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.remove('exp-selected'));
            }
        };
    }, -25);

    app.explorer.contextMenu.add(() => {
        if (!state.selection.size) return null;
        const targets = [...state.selection];
        return { title: _('Copy'), icon: _iconCopyExp, callback() { app.explorer?.copy(targets); } };
    }, -20);
    app.explorer.contextMenu.add(() => {
        if (!state.selection.size) return null;
        const targets = [...state.selection];
        return { title: _('Cut'), icon: _iconCutExp, callback() { app.explorer?.cut(targets); } };
    }, -10);
    app.explorer.contextMenu.add(() => {
        const clip = app.explorer?.clipboard;
        if (!clip?.items?.length) return null;
        return {
            title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
            icon:  _iconPasteExp,
            callback() {
                app.explorer?.paste(state.path, (pi, dp, mode) => {
                    openMoveStatus(state, pi, mode === 'cut' ? _('Clipboard') : _('Clipboard (copy)'), dp, mode);
                });
            }
        };
    }, 0);
    app.explorer.contextMenu.add({
        title: _('New Folder'),
        icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>',
        callback() {
            // Route to whichever explorer window was last interacted with
            app.explorer._activeStartInlineNewFolder?.();
        }
    }, -35);

    app.explorer.contextMenu.add({ title: _('Update'),     icon: _iconRefresh, callback() { navigate(state, state.path); } }, 10);
    app.explorer.contextMenu.add({ title: _('Properties'), icon: _iconInfoExp,  callback() {} }, 20);

    app.explorer.contextMenu.add(() => {
        const fields = [
            { key: 'name',     label: _('Name'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"/></svg>' },
            { key: 'size',     label: _('Size'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M21 6.5l-4-4-4 4 1.41 1.41L16 6.34V10h2V6.34l1.59 1.57L21 6.5zm-9 11l-1.59-1.57L8.5 17.5l-1.41-1.41L11 12.34V10H9v2.34l-1.59-1.57L6 12.5l4 4 4-4-1.41-1.41z"/></svg>' },
            { key: 'type',     label: _('Type'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.9 2 2 2zm-2-12h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9C7.9 3 7 3.9 7 5v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H9V5h10v14zm-8-2h2v-2h-2v2zm-4 0h2v-2H7v2zm8 0h2v-2h-2v2z"/></svg>' },
            { key: 'modified', label: _('Last modified'), icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>' },
        ];
        return {
            title: _('Sort by'),
            icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>',
            submenu: fields.map(({ key, label, icon: fIcon }) => ({
                icon:  fIcon,
                title: label + (state.sortField === key ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : ''),
                alt:   '',
                callback() {
                    if (state.sortField === key) {
                        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        state.sortField = key;
                        state.sortDir = 'asc';
                    }
                    navigate(state, state.path);
                }
            }))
        };
    }, 25);

    app.explorer.contextMenu.add(() => {
        const entries = app.explorer.contextMenu.submenu.new._build();
        if (!entries.length) return null;
        return {
            title: _('New'),
            icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>',
            submenu: entries
        };
    }, 27);
}
