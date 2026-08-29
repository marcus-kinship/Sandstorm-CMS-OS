/**
 * @file explorer/window/search.js
 * @description Search-filter-panel predicate logic and the whole-filesystem
 * name search used by both the side-panel tree search and the main-list
 * search-results view.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * @module components/explorer/window/search
 */
import { EXT_CATEGORY_MAP } from './state.js';
import { parseSizeToBytes, node as getNode } from './fsutil.js';

/**
 * @param {Object} state
 * @returns {boolean} True if any search filter chip is currently active.
 */
export function hasActiveFilters(state) {
    return state.searchFilters.types.length > 0 || !!state.searchFilters.date || !!state.searchFilters.size;
}

/**
 * @param {Object} state
 * @param {Object} entry
 * @returns {boolean} True if `entry` passes the currently active search filters.
 */
export function matchesSearchFilters(state, entry) {
    if (entry.type === 'folder') return true; // folders always shown, filters only constrain files
    if (state.searchFilters.types.length > 0) {
        const cat = EXT_CATEGORY_MAP[(entry.ext || '').toLowerCase()];
        if (!state.searchFilters.types.includes(cat)) return false;
    }
    if (state.searchFilters.date) {
        if (!entry.modified) return false;
        const days = { today: 1, week: 7, month: 30 }[state.searchFilters.date];
        const modified = new Date(entry.modified);
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - (days - 1));
        if (modified < cutoff) return false;
    }
    if (state.searchFilters.size) {
        const bytes = parseSizeToBytes(entry.size);
        if (state.searchFilters.size === 'small' && !(bytes < 1024 * 1024)) return false;
        if (state.searchFilters.size === 'medium' && !(bytes >= 1024 * 1024 && bytes <= 100 * 1024 * 1024)) return false;
        if (state.searchFilters.size === 'large' && !(bytes > 100 * 1024 * 1024)) return false;
    }
    return true;
}

/**
 * Recursively scans the current folder (state.path) and its subfolders for
 * name matches — not the whole filesystem.
 *
 * @param {Object} state
 * @param {string} query
 * @returns {{name: string, path: string, entry: Object}[]}
 */
export function searchMatches(state, query) {
    const val = query.trim().toLowerCase();
    const matches = [];
    const root = getNode(state.path);
    if (!root) return matches;
    (function scan(path, node) {
        if (!node.children) return;
        for (const [name, entry] of Object.entries(node.children)) {
            const p = path === '/' ? '/' + name : path + '/' + name;
            if (name.toLowerCase().includes(val) && matchesSearchFilters(state, entry)) matches.push({ name, path: p, entry });
            if (entry.children) scan(p, entry);
        }
    })(state.path, root);
    return matches;
}

/**
 * Clears the active search query and resets the search UI.
 *
 * @param {Object} state
 * @returns {void}
 */
export function clearSearch(state) {
    if (!state.searchQuery) return;
    state.searchQuery = '';
    const input = state.winRoot?.querySelector('.exp-hdr-search');
    if (input) input.value = '';
    const searchWrap = state.winRoot?.querySelector('.exp-side-search-wrap');
    searchWrap?.classList.remove('exp-search-open');
}
