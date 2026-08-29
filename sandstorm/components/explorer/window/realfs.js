/**
 * @file explorer/window/realfs.js
 * @description Central seam for everything Explorer's "/RealStorage" mount
 * talks to the real server-side filesystem through — the JSAPI gateway at
 * app.config.local.jsapiLink (see site/demo/jsapi/demo_jsapi.class.php).
 * fileops.js, dragdrop.js, and core.js all stay unaware of the JSAPI's
 * action names/shapes; they only ever call the functions exported here.
 *
 * Everything under "/RealStorage" in the client-side `_fs` tree is a CACHE
 * of what the server actually has, populated lazily (ensureRealFolderLoaded)
 * rather than eagerly at boot — the real storage tree can be arbitrarily
 * deep/large, unlike the small hardcoded simulated tree.
 *
 * @module components/explorer/window/realfs
 */
import { node } from './fsutil.js';

/**
 * Converts an Explorer-space path under /RealStorage into the path the
 * server's file.* actions expect (relative to their own storage root,
 * empty string for the root itself).
 *
 * @param {string} path
 * @returns {string}
 */
function toServerRelPath(path) {
    if (path === '/RealStorage') return '';
    return path.replace(/^\/RealStorage\//, '');
}

/**
 * Ensures `path` (a folder under /RealStorage) has been populated from the
 * real backend at least once. Safe to call repeatedly/concurrently — reuses
 * the same in-flight promise instead of firing duplicate requests when
 * called again (e.g. rapid double-navigation, dragdrop's tree click racing
 * navigate()) before the first fetch resolves.
 *
 * On failure, leaves the node unloaded (so a later retry is possible) and
 * logs via app.dev.error rather than throwing — callers (core.js/
 * dragdrop.js) render whatever's already there rather than needing their
 * own try/catch for every navigation.
 *
 * @param {Object} state
 * @param {string} path
 * @returns {Promise<void>}
 */
export function ensureRealFolderLoaded(state, path) {
    const n = node(path);
    if (!n || n.type !== 'folder') return Promise.resolve();
    if (n._loaded) return Promise.resolve();
    if (n._loadPromise) return n._loadPromise;

    n._loading = true;
    n._loadPromise = (async () => {
        try {
            const result = await app.api.post(app.config.local.jsapiLink, {
                action: 'file.list',
                data: { path: toServerRelPath(path) }
            });
            const children = {};
            (result.data || []).forEach(entry => {
                children[entry.name] = entry.type === 'folder'
                    ? { type: 'folder', children: {} }
                    : { type: 'file', size: entry.size, modified: entry.modified, ext: entry.ext };
            });
            n.children = children;
            n._loaded = true;
        } catch (e) {
            app.dev.error(`realfs: failed to load "${path}": ${e.message}`, 'Explorer');
        } finally {
            n._loading = false;
            n._loadPromise = null;
        }
    })();

    return n._loadPromise;
}

/**
 * Reads a real file's content. Rejects (propagated from app.api.post) if
 * the file doesn't exist, exceeds the server's 1 MiB read cap, or any
 * other server-side refusal — callers should catch/`.fail()` this the same
 * way they already do for other app.api calls.
 *
 * @param {string} path - Explorer-space path under /RealStorage
 * @returns {Promise<string>} file content
 */
export async function realRead(path) {
    const result = await app.api.post(app.config.local.jsapiLink, {
        action: 'file.read',
        data: { path: toServerRelPath(path) }
    });
    return result.data.content;
}

/**
 * Creates or overwrites a real file. Rejects on failure (size cap, missing
 * parent directory, target is a folder, etc.) — caller mutates `_fs` only
 * after this resolves, never optimistically.
 *
 * @param {string} path - Explorer-space path under /RealStorage
 * @param {string} content
 * @returns {Promise<{path: string, size: string}>}
 */
export async function realWrite(path, content) {
    const result = await app.api.post(app.config.local.jsapiLink, {
        action: 'file.write',
        data: { path: toServerRelPath(path), content }
    });
    return result.data;
}

/**
 * Deletes a single real file (folders are refused server-side — no
 * recursive delete this phase). Rejects on failure.
 *
 * @param {string} path - Explorer-space path under /RealStorage
 * @returns {Promise<void>}
 */
export async function realDelete(path) {
    await app.api.post(app.config.local.jsapiLink, {
        action: 'file.delete',
        data: { path: toServerRelPath(path) }
    });
}
