/**
 * @file startmenu/search.js
 * @description Wires the Start Menu's search box (`#q-search`) to
 * `app.search.query()` — debounced input, a race-guard token so a slow
 * earlier query can never overwrite a faster later one, keyboard navigation
 * (ArrowUp/Down/Enter/Escape) with real ARIA state
 * (`role="combobox"`/`"listbox"`/`"option"`, `aria-activedescendant`), and
 * dispatching the highlighted result's action via `search/actions.js`.
 *
 * Exported functions are plain (non-arrow) so `this` resolves to
 * `app.desktop.startmenu` when called as its method (see
 * `startmenu/index.js`), matching `core.js`'s own convention.
 *
 * @module components/startmenu/search
 */
import { runAction } from '../search/actions.js';
import { recordOpen } from '../search/recent.js';

const DEBOUNCE_MS = 100;

let _results = [];
let _activeIndex = -1;
let _requestToken = 0;
let _debounceTimer = null;

function _rowId(i) {
    return `ms-search-row-${i}`;
}

/**
 * Reads the results grid's actual current column count from its computed
 * `grid-template-columns` (a space-separated track list — one value per
 * column), rather than hardcoding a number that would drift out of sync
 * with startmenu.css's `@media (max-width: 320px)` 1-column collapse.
 * @returns {number}
 */
function _getColumns() {
    const results = document.getElementById('ms-search-results');
    if (!results) return 1;
    const tracks = getComputedStyle(results).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    return Math.max(1, tracks.length);
}

/**
 * Renders a result set into `#ms-search-results` and resets the active
 * (highlighted) row to the first one.
 * @param {Array} results - `SearchResult[]` from `app.search.query()`.
 */
export function renderSearchResults(results) {
    const container = document.getElementById('ms-search-results');
    if (!container) return;

    _results = results || [];
    _activeIndex = _results.length ? 0 : -1;

    container.innerHTML = _results.length
        ? _results.map((r, i) => `
            <div class="search-result-row${i === 0 ? ' active' : ''}"
                 id="${_rowId(i)}" role="option" aria-selected="${i === 0}"
                 data-index="${i}">
                <svg class="search-result-icon" width="20" height="20"><use href="${r.icon?.value || '#ic-search'}"></use></svg>
                <div class="search-result-text">
                    <div class="search-result-title">${app.util.escapeHtml(r.title)}</div>
                    <div class="search-result-subtitle">${app.util.escapeHtml(r.subtitle || '')}</div>
                </div>
            </div>
        `).join('')
        : `<div class="search-result-empty">${_('No results found')}</div>`;

    _syncActiveDescendant();
}

function _syncActiveDescendant() {
    const input = document.getElementById('q-search');
    if (!input) return;
    input.setAttribute('aria-activedescendant', _activeIndex >= 0 ? _rowId(_activeIndex) : '');
}

function _setActive(index) {
    const container = document.getElementById('ms-search-results');
    const rows = container?.querySelectorAll('.search-result-row');
    if (!rows?.length) return;

    _activeIndex = Math.max(0, Math.min(index, rows.length - 1));
    rows.forEach((row, i) => {
        const isActive = i === _activeIndex;
        row.classList.toggle('active', isActive);
        row.setAttribute('aria-selected', String(isActive));
    });
    rows[_activeIndex]?.scrollIntoView({ block: 'nearest' });
    _syncActiveDescendant();
}

/** Clears the search box back to its default (empty, Apps tab visible) state. */
function _resetSearch() {
    const input = document.getElementById('q-search');
    if (input) input.value = '';
    _requestToken++; // invalidate any in-flight query
    _results = [];
    _activeIndex = -1;
    _showResults(false);
}

function _activateResult(index) {
    const result = _results[index];
    if (!result) return;
    recordOpen(result.id);
    runAction(result.action);
    app.desktop.startmenu.hide();
    _resetSearch();
}

/**
 * Sizes `#ms-search-results` to reach the bottom of `.rightmain` — mirrors
 * `core.js`'s `calculateMenuHeight()` (JS-computed, since `.rightmain` is
 * `display:block`, not a flex column `#ms-search-results` could just
 * `flex:1` inside). A fixed CSS max-height left the box short of the menu's
 * actual bottom edge on anything but the exact viewport height it was
 * eyeballed against.
 */
function _sizeResults() {
    const results = document.getElementById('ms-search-results');
    const rightmain = document.querySelector('.rightmain');
    if (!results || !rightmain || results.style.display === 'none') return;

    const available = rightmain.getBoundingClientRect().bottom - results.getBoundingClientRect().top;
    results.style.maxHeight = Math.max(120, Math.floor(available) - 8) + 'px';
}

function _showResults(show) {
    const tabs = document.getElementById('ms-tabs-container');
    const results = document.getElementById('ms-search-results');
    const input = document.getElementById('q-search');
    if (tabs) tabs.style.display = show ? 'none' : '';
    if (results) results.style.display = show ? '' : 'none';
    if (input) input.setAttribute('aria-expanded', String(show));
    if (show) _sizeResults();
}

async function _runQuery(word) {
    const token = ++_requestToken;
    const results = await app.search.query(word);
    if (token !== _requestToken) return; // stale — a newer query is already in flight
    renderSearchResults(results);
}

/**
 * Binds `#q-search`'s input/keydown handlers. Idempotent — safe to call
 * more than once (guarded via a dataset flag) even though `build()` only
 * calls it once per boot today.
 */
export function wireSearch() {
    const input = document.getElementById('q-search');
    if (!input || input.dataset.searchWired) return;
    input.dataset.searchWired = 'true';

    window.addEventListener('resize', () => _sizeResults());

    input.addEventListener('input', () => {
        const word = input.value.trim();
        clearTimeout(_debounceTimer);

        if (!word) {
            _requestToken++; // invalidate any in-flight query
            _results = [];
            _activeIndex = -1;
            _showResults(false);
            return;
        }

        _showResults(true);
        _debounceTimer = setTimeout(() => _runQuery(word), DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
        if (!_results.length && e.key !== 'Escape') return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                _setActive(_activeIndex + _getColumns());
                break;
            case 'ArrowUp':
                e.preventDefault();
                _setActive(_activeIndex - _getColumns());
                break;
            case 'ArrowRight':
                e.preventDefault();
                _setActive(_activeIndex + 1);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                _setActive(_activeIndex - 1);
                break;
            case 'Enter':
                e.preventDefault();
                _activateResult(_activeIndex >= 0 ? _activeIndex : 0);
                break;
            case 'Escape':
                e.preventDefault();
                _resetSearch();
                break;
        }
    });

    document.getElementById('ms-search-results')?.addEventListener('click', (e) => {
        const row = e.target.closest('.search-result-row');
        if (!row) return;
        _activateResult(Number(row.dataset.index));
    });
}
