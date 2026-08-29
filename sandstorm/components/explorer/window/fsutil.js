/**
 * @file explorer/window/fsutil.js
 * @description Small filesystem-path/entry utilities shared across the
 * Explorer window modules: node lookup, display-name/breadcrumb helpers,
 * row tooltips, and the "1.2 MB" → bytes parser used by both sorting
 * (icons.js) and search filters (search.js).
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes.
 *
 * @module components/explorer/window/fsutil
 */

/**
 * Looks up a virtual-fs node by absolute path.
 *
 * @param {string} path
 * @returns {Object|null}
 */
export function node(path) {
    const fs = app.explorer._fs;
    if (path === '/') return fs['/'];
    const parts = path.split('/').filter(Boolean);
    let cur = fs['/'];
    for (const p of parts) {
        if (!cur.children?.[p]) return null;
        cur = cur.children[p];
    }
    return cur;
}

const KNOWN_FOLDER_NAMES = {
    '/Desktop':   () => _('Desktop'),
    '/Documents': () => _('Documents'),
    '/Downloads': () => _('Downloads'),
    '/Music':     () => _('Music'),
    '/Pictures':  () => _('Pictures'),
    '/Projects':  () => _('Projects'),
};

/**
 * Resolves the display name for a filesystem entry — the translated name
 * for one of the six well-known root folders above, otherwise `rawName`
 * unchanged (arbitrary user files/folders are never translated).
 *
 * @param {string} path - Full path of the entry (e.g. "/Documents").
 * @param {string} rawName - The entry's actual filesystem name.
 * @returns {string}
 */
export function displayName(path, rawName) {
    const thunk = KNOWN_FOLDER_NAMES[path];
    return thunk ? thunk() : rawName;
}

/**
 * Display name for a path — localized "Home" for "/", otherwise the last segment.
 *
 * @param {string} path
 * @returns {string}
 */
export function pathName(path) {
    if (path === '/') return _('Home');
    const raw = path.split('/').filter(Boolean).pop() || path;
    return displayName(path, raw);
}

/**
 * Builds the ordered list of {name, path} breadcrumb segments for a path.
 *
 * @param {string} path
 * @returns {{name: string, path: string}[]}
 */
export function breadcrumb(path) {
    if (path === '/') return [{ name: _('Home'), path: '/' }];
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ name: _('Home'), path: '/' }];
    let cur = '';
    for (const p of parts) {
        cur += '/' + p;
        crumbs.push({ name: displayName(cur, p), path: cur });
    }
    return crumbs;
}

/**
 * Multi-line tooltip text for a row/tree item.
 *
 * @param {string} name
 * @param {Object} entry
 * @returns {string}
 */
export function tooltip(name, entry) {
    const lines = [name];
    if (entry.type === 'folder') {
        lines.push(_('Type') + ': ' + _('Folder'));
        const count = entry.children ? Object.keys(entry.children).length : 0;
        lines.push(_('Items') + ': ' + count);
    } else {
        if (entry.ext)      lines.push(_('Type')     + ': ' + entry.ext.toUpperCase());
        if (entry.size)     lines.push(_('Size')     + ': ' + entry.size);
        if (entry.modified) lines.push(_('Modified') + ': ' + entry.modified);
    }
    return lines.join('\n');
}

/**
 * True for "/RealStorage" itself and anything under it — the single
 * predicate every real-backend-aware call site (navigation, CRUD) branches
 * on to decide whether to talk to the real filesystem backend (realfs.js)
 * or keep today's purely-simulated in-memory behavior.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isRealStoragePath(path) {
    return path === '/RealStorage' || path.startsWith('/RealStorage/');
}

/**
 * Parses the formatted size strings stored on fs entries (e.g. "1.2 MB", "512 KB") back to bytes.
 *
 * @param {string} sizeStr
 * @returns {number}
 */
export function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const m = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(String(sizeStr).trim());
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if (unit === 'GB') return n * 1024 * 1024 * 1024;
    if (unit === 'MB') return n * 1024 * 1024;
    if (unit === 'KB') return n * 1024;
    return n;
}
