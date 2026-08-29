/**
 * @file explorer/window/quicksearch.js
 * @description Type-ahead quick-search — pressing A–Ö/0–9 while an Explorer
 * window is focused selects the first matching item in the CURRENT folder
 * only (never recursive, never other folders). Keys typed within the combine
 * window combine into a longer search string; repeating the exact same
 * single letter after the window instead cycles to the next match for that
 * letter, wrapping back to the first once the last match has been reached.
 * Matching is scoped to `sortedItems(state)` — the same current-folder,
 * current-sort-order list `list.js` renders from — so quick search always
 * reflects exactly what the user sees, never subfolders or the
 * filesystem-wide search results view.
 *
 * @module components/explorer/window/quicksearch
 */
import { sortedItems, loadMoreItems } from './list.js';
import { displayName } from './fsutil.js';
import { updateMeta } from './meta.js';


const TIMEOUT_MS = 500;

/**
 * Resets a window's quick-search state — called whenever the current folder
 * changes, since a search string/position from the old folder has no
 * meaning in the new one.
 *
 * @param {Object} state
 * @returns {void}
 */
export function resetQuickSearch(state) {
    state._qsBuffer = '';
    state._qsMatchIndex = 0;
    state._qsLastKeyTime = 0;
}

/**
 * @param {Object} state
 * @returns {{name: string, path: string, entry: Object}[]} Current-folder
 *   items in display order, as {name, path, entry} for easy matching.
 */
function displayItems(state) {
    const items = sortedItems(state);
    if (!items) return [];
    return items.map(([name, entry]) => {
        const path = state.path === '/' ? '/' + name : state.path + '/' + name;
        return { name: displayName(path, name), path, entry };
    });
}

/**
 * Selects `item` — same selection/meta-panel update a normal row click
 * performs — and makes sure its row actually exists in the (paginated) DOM
 * before scrolling it into view.
 *
 * @param {Object} state
 * @param {{name: string, path: string, entry: Object}} item
 * @param {number} targetIndex - item's index within the current display order.
 * @returns {void}
 */
function selectItem(state, item, targetIndex) {
    if (!state.winRoot) return;

    // The list only renders PAGE items at a time (infinite scroll) — force
    // enough pages in so the target row actually exists before we try to
    // select/scroll to it.
    let guard = 0;
    while (state.renderedCount <= targetIndex && guard < 1000) {
        const before = state.renderedCount;
        loadMoreItems(state);
        if (state.renderedCount === before) break; // no more items left to load
        guard++;
    }

    state.selection.clear();
    state.selection.add(item.path);
    state.shiftAnchor = item.path;

    const rows = state.winRoot.querySelectorAll('.exp-row, .exp-grid-item');
    let target = null;
    rows.forEach(row => {
        const match = row.dataset.path === item.path;
        row.classList.toggle('exp-selected', match);
        if (match) target = row;
    });
    target?.scrollIntoView({ block: 'nearest' });

    updateMeta(state, item.name, item.entry);
}

/**
 * Handles one keydown for Explorer's type-ahead quick search. Returns
 * `true` if the key was consumed (caller should `preventDefault()`),
 * `false` to let it fall through untouched.
 *
 * @param {Object} state
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
export function handleQuickSearchKey(state, e) {
    if (state.searchQuery.trim().length > 0) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.repeat) return false;

    const key = e.key;
    if (key.length !== 1 || /[\/|\\¤#'"½§*=~¨@£$]/.test(key)) return false;

    const items = displayItems(state);
    if (items.length === 0) return true;

    const now = Date.now();

    const withinWindow =
        state._qsBuffer.length > 0 &&
        (now - state._qsLastKeyTime) <= TIMEOUT_MS;

    const isSameSingleLetterRepeat =
        !withinWindow &&
        state._qsBuffer.length === 1 &&
        state._qsBuffer.toLowerCase() === key.toLowerCase();

    if (withinWindow) {

        state._qsBuffer += key;
        state._qsMatchIndex = 0;
    } else if (isSameSingleLetterRepeat) {
   
        state._qsMatchIndex += 1;
    } else {

        state._qsBuffer = key;
        state._qsMatchIndex = 0;
    }

    state._qsLastKeyTime = now;

    const needle = state._qsBuffer.toLowerCase();

    const matches = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) =>
            item.name.toLowerCase().startsWith(needle)
        );

    if (matches.length === 0) return true;

    if (!withinWindow && !isSameSingleLetterRepeat) {
        const selectedPath = state.selection?.size === 1
            ? [...state.selection][0]
            : null;

        if (selectedPath) {
            const selectedIndex = matches.findIndex(
                ({ item }) => item.path === selectedPath
            );

            if (selectedIndex !== -1) {
                if (matches.length === 1) {
                    
                    return true;
                }

                state._qsMatchIndex = selectedIndex + 1;
            }
        }
    }

    state._qsMatchIndex =
        ((state._qsMatchIndex % matches.length) + matches.length)
        % matches.length;

    const { item, index } = matches[state._qsMatchIndex];

    selectItem(state, item, index);

    return true;
}