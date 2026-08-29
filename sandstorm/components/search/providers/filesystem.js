/**
 * @file search/providers/filesystem.js
 * @description FileSystemProvider — bounded recursive walk of
 * `app.explorer._fs` by name. Not a call into Explorer's own
 * `window/search.js` (that module lives deep in Explorer's private window
 * module graph) — mirrors its recursive-walk pattern independently against
 * the same public `app.explorer._fs` tree.
 *
 * Explicitly bounded (`MAX_DEPTH`/`MAX_RESULTS`) so a large future tree
 * can't make this provider slow. Matching is case-insensitive throughout
 * (matcher.js). There is no "hidden file" concept anywhere in the current
 * fs model, so none is invented here — every entry is searchable.
 *
 * @module components/search/providers/filesystem
 */
import { bestScoreAcrossTerms } from '../matcher.js';

const MAX_DEPTH = 5;
const MAX_RESULTS = 20;

/**
 * @param {string[]} terms - `matcher.expandQuery()`'s output.
 * @returns {Promise<Array>}
 */
export async function search(terms) {
    const root = app.explorer?._fs?.['/'];
    if (!root) return [];

    const results = [];

    (function walk(node, path, depth) {
        if (results.length >= MAX_RESULTS || depth > MAX_DEPTH || !node?.children) return;

        for (const [name, entry] of Object.entries(node.children)) {
            if (results.length >= MAX_RESULTS) return;

            const childPath = path === '/' ? '/' + name : path + '/' + name;
            const isFolder = entry.type === 'folder';
            const s = bestScoreAcrossTerms(terms, [name]);

            if (s > 0) {
                results.push({
                    id: `file:${childPath}`,
                    title: name,
                    subtitle: isFolder ? _('Folder') : _('File'),
                    icon: { type: 'svg', value: isFolder ? '#ic-folder' : '#ic-file-generic' },
                    type: isFolder ? 'folder' : 'file',
                    score: s,
                    source: 'filesystem',
                    action: { type: 'open-path', target: isFolder ? childPath : path },
                });
            }

            if (isFolder) walk(entry, childPath, depth + 1);
        }
    })(root, '/', 0);

    return results;
}
