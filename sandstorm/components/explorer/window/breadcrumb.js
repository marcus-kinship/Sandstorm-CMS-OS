/**
 * @file explorer/window/breadcrumb.js
 * @description Breadcrumb bar rendering, the crumb-click "quick jump into a
 * subfolder" dropdown, and the click-to-edit path input (with folder
 * autocomplete).
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes (the original had two byte-identical `_renderBreadcrumb`
 * declarations — the second silently shadowed the first; only one copy is
 * kept here since they were never different). Each function takes `state`
 * as its first parameter instead of closing over free variables.
 *
 * @module components/explorer/window/breadcrumb
 */
import { FAVORITES } from './state.js';
import { node, pathName, breadcrumb as breadcrumbPath } from './fsutil.js';
import { folderIcon } from './icons.js';
import { navigate } from './core.js';

/**
 * @param {Object} state
 * @returns {string}
 */
export function renderBreadcrumb(state) {
    return breadcrumbPath(state.path).map((c, i, arr) => {
        const last = i === arr.length - 1;
        const icon = i === 0 ? '<svg class="exp-crumb-home-icon" viewBox="0 0 24 24" width="14" height="14"><use href="#ic-folder"></use></svg>' : '';
        return `<span class="exp-crumb${last ? ' active' : ''}" data-path="${app.util.escapeHtml(c.path)}">${icon}${app.util.escapeHtml(c.name)}</span>${!last ? '<span class="exp-crumb-sep">›</span>' : ''}`;
    }).join('');
}

// ── Breadcrumb crumb-click dropdown (quick-jump into a subfolder without
//    navigating through every intermediate crumb) ──────────────────────────

/**
 * @param {string} path
 * @returns {{name: string, path: string}[]} Up to 40 subfolders of `path`.
 */
export function crumbSubfolders(path) {
    const n = node(path);
    if (!n?.children) return [];
    return Object.entries(n.children)
        .filter(([, e]) => e.type === 'folder')
        .sort(([a], [b]) => a.localeCompare(b, 'sv', { sensitivity: 'base' }))
        .slice(0, 40)
        .map(([name]) => ({ name, path: path === '/' ? '/' + name : path + '/' + name }));
}

/**
 * @param {Object} state
 * @returns {void}
 */
export function closeCrumbDropdown(state) {
    document.querySelector('.exp-crumb-dropdown')?.remove();
    state.winRoot?.querySelectorAll('.exp-crumb.exp-crumb-dd-open').forEach(c => c.classList.remove('exp-crumb-dd-open'));
    state.crumbDropdownFor = null;
}

/**
 * @param {Object} state
 * @param {HTMLElement} crumbEl
 * @returns {void}
 */
export function openCrumbDropdown(state, crumbEl) {
    const path = crumbEl.dataset.path;
    const folders = crumbSubfolders(path);
    if (!folders.length) { navigate(state, path); return; }

    closeCrumbDropdown(state);
    crumbEl.classList.add('exp-crumb-dd-open');
    state.crumbDropdownFor = path;

    const dd = document.createElement('div');
    dd.className = 'exp-crumb-dropdown';
    const selfRow = `
        <div class="exp-crumb-dd-row exp-crumb-dd-self" data-path="${app.util.escapeHtml(path)}">
            ${folderIcon(false)}
            <span>${app.util.escapeHtml(pathName(path))}</span>
        </div>
        <div class="exp-crumb-dd-sep"></div>`;
    dd.innerHTML = selfRow + folders.map(f => `
        <div class="exp-crumb-dd-row" data-path="${app.util.escapeHtml(f.path)}">
            ${folderIcon(false)}
            <span>${app.util.escapeHtml(f.name)}</span>
        </div>`).join('');
    document.body.appendChild(dd);

    const winEl = crumbEl.closest('.window');
    const winZ  = winEl ? parseInt(winEl.style.zIndex, 10) : NaN;
    dd.style.zIndex = (isNaN(winZ) ? 1000 : winZ) + 1;

    const rect = crumbEl.getBoundingClientRect();
    let x = rect.left, y = rect.bottom + 4;
    if (x + dd.offsetWidth  > window.innerWidth)  x = window.innerWidth  - dd.offsetWidth  - 10;
    if (y + dd.offsetHeight > window.innerHeight) y = rect.top - dd.offsetHeight - 4;
    dd.style.left = x + 'px';
    dd.style.top  = y + 'px';
    dd.classList.add('show');

    dd.querySelectorAll('.exp-crumb-dd-row').forEach(row => {
        row.addEventListener('click', e => {
            e.stopPropagation();
            navigate(state, row.dataset.path);
            closeCrumbDropdown(state);
        });
    });
}

/**
 * @param {Object} state
 * @param {HTMLElement} crumbEl
 * @returns {void}
 */
export function toggleCrumbDropdown(state, crumbEl) {
    if (state.crumbDropdownFor === crumbEl.dataset.path) { closeCrumbDropdown(state); return; }
    openCrumbDropdown(state, crumbEl);
}

// ── Breadcrumb input handling ─────────────────────────────────────────────

/**
 * @param {Object} state
 * @returns {void}
 */
export function setupBreadcrumbInput(state) {
    if (!state.winRoot) return;
    const breadcrumbEl = state.winRoot.querySelector('.exp-breadcrumb');
    if (!breadcrumbEl) return;

    // Remove existing listeners by cloning
    const newBreadcrumb = breadcrumbEl.cloneNode(true);
    breadcrumbEl.parentNode.replaceChild(newBreadcrumb, breadcrumbEl);

    newBreadcrumb.addEventListener('click', (e) => {
        // Only trigger if clicking directly on breadcrumb container, not on crumbs
        if (e.target.closest('.exp-crumb') || e.target.closest('.exp-breadcrumb-input-wrap')) return;
        showBreadcrumbInput(state);
    });
}

/**
 * @param {Object} state
 * @returns {void}
 */
export function showBreadcrumbInput(state) {
    const breadcrumbEl = state.winRoot.querySelector('.exp-breadcrumb');
    if (!breadcrumbEl) return;

    // Allow autocomplete dropdown to overflow the clipped breadcrumb bar
    breadcrumbEl.style.overflow = 'visible';

    // Store original HTML to restore later
    breadcrumbEl.dataset.originalHtml = breadcrumbEl.innerHTML;

    // Create input wrapper
    breadcrumbEl.innerHTML = `
        <div class="exp-breadcrumb-input-wrap">
            <svg class="exp-breadcrumb-input-icon" viewBox="0 0 24 24" width="14" height="14"><use href="#ic-folder"></use></svg>
            <input type="text" class="exp-breadcrumb-input" value="${state.path}" spellcheck="false" />
            <div class="exp-breadcrumb-autocomplete"></div>
        </div>
    `;

    const input = breadcrumbEl.querySelector('.exp-breadcrumb-input');
    const autocomplete = breadcrumbEl.querySelector('.exp-breadcrumb-autocomplete');

    if (!input) return;

    // Focus and select all
    setTimeout(() => {
        input.focus();
        input.setSelectionRange(0, input.value.length);
    }, 50);

    // Helper: get all folder paths for autocomplete
    function _getAllPaths() {
        const paths = [];
        (function scan(n, currentPath) {
            paths.push(currentPath);
            if (n.children) {
                for (const [name, child] of Object.entries(n.children)) {
                    if (child.type === 'folder') {
                        scan(child, currentPath === '/' ? '/' + name : currentPath + '/' + name);
                    }
                }
            }
        })(app.explorer._fs['/'], '/');
        return paths;
    }

    // Helper: normalize path (remove trailing slashes, double slashes)
    function _normalizePath(p) {
        return '/' + p.split('/').filter(Boolean).join('/');
    }

    // Helper: get parent path
    function _getParentPath(p) {
        const normalized = _normalizePath(p);
        if (normalized === '/') return '/';
        const parts = normalized.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
    }

    // Default suggestions on focus: favorites + root folders + breadcrumb to current path
    function _getDefaultSuggestions() {
        const seen = new Set();
        const result = [];
        const add = p => { if (p && !seen.has(p)) { seen.add(p); result.push(p); } };

        // Favorites
        FAVORITES.forEach(f => add(f.path));

        // Root folder children
        const rootNode = app.explorer._fs['/'];
        if (rootNode?.children) {
            Object.keys(rootNode.children).forEach(name => add('/' + name));
        }

        // Breadcrumb segments of current path
        if (state.path && state.path !== '/') {
            const parts = state.path.split('/').filter(Boolean);
            let cur = '';
            parts.forEach(p => { cur += '/' + p; add(cur); });
        }

        return result.filter(p => p !== state.path);
    }

    // Autocomplete suggestions
    function _getSuggestions(value) {
        const allPaths = _getAllPaths();
        const normalized = _normalizePath(value || '/');
        const lowerValue = normalized.toLowerCase();

        // For an exact folder match, show its children instead of nothing
        const exactNode = allPaths.find(p => p.toLowerCase() === lowerValue);
        if (exactNode) {
            const n = node(exactNode);
            if (n?.children) {
                return Object.keys(n.children)
                    .filter(k => n.children[k].type === 'folder')
                    .map(k => exactNode === '/' ? '/' + k : exactNode + '/' + k)
                    .slice(0, 8);
            }
            return [];
        }

        // Filter paths that start with the input value
        const matches = allPaths
            .filter(p => p.toLowerCase().startsWith(lowerValue) && p !== '/')
            .sort((a, b) => a.length - b.length)
            .slice(0, 8);

        // Also check partial matches (anywhere in path)
        if (matches.length < 5) {
            const partialMatches = allPaths
                .filter(p => p.toLowerCase().includes(lowerValue) &&
                        !p.toLowerCase().startsWith(lowerValue) &&
                        p !== '/' &&
                        p !== normalized)
                .sort((a, b) => a.length - b.length)
                .slice(0, 8 - matches.length);
            matches.push(...partialMatches);
        }

        return matches;
    }

    // Show autocomplete
    function _showAutocomplete(suggestions) {
        if (!autocomplete) return;
        if (suggestions.length === 0) {
            autocomplete.innerHTML = '';
            autocomplete.classList.remove('exp-autocomplete-visible');
            return;
        }

        autocomplete.innerHTML = suggestions.map(s => `
            <div class="exp-autocomplete-item" data-path="${app.util.escapeHtml(s)}">
                <svg width="12" height="12" style="color:#fbbf24;flex-shrink:0;"><use href="#ic-folder"></use></svg>
                <span>${app.util.escapeHtml(s)}</span>
            </div>
        `).join('');

        autocomplete.classList.add('exp-autocomplete-visible');

        // Click handler for autocomplete items
        autocomplete.querySelectorAll('.exp-autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur before click
                const path = item.dataset.path;
                if (path && node(path)) {
                    navigate(state, path);
                    restoreBreadcrumb(state);
                }
            });
        });
    }

    // Input event
    input.addEventListener('input', () => {
        const value = input.value;
        const suggestions = _getSuggestions(value);
        _showAutocomplete(suggestions);
    });

    // Key events
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let value = _normalizePath(input.value);

            // Try the exact path first
            if (node(value)) {
                navigate(state, value);
                restoreBreadcrumb(state);
                return;
            }

            // Try parent path
            const parent = _getParentPath(value);
            if (node(parent)) {
                navigate(state, parent);
                restoreBreadcrumb(state);
                return;
            }

            // Fallback to home
            navigate(state, '/');
            restoreBreadcrumb(state);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            restoreBreadcrumb(state);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const suggestions = _getSuggestions(input.value);
            if (suggestions.length > 0) {
                input.value = suggestions[0];
                _showAutocomplete([]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const first = autocomplete?.querySelector('.exp-autocomplete-item');
            if (first) first.focus();
        }
    });

    // Blur - restore breadcrumb when input loses focus
    input.addEventListener('blur', () => {
        // Delay to allow autocomplete clicks
        setTimeout(() => {
            if (!state.winRoot) return;
            const currentInput = state.winRoot.querySelector('.exp-breadcrumb-input');
            if (currentInput && document.activeElement !== currentInput) {
                restoreBreadcrumb(state);
            }
        }, 150);
    });

    // Focus — show default suggestions (favorites + root + path breadcrumbs)
    input.addEventListener('focus', () => {
        const suggestions = input.value && input.value !== state.path
            ? _getSuggestions(input.value)
            : _getDefaultSuggestions();
        _showAutocomplete(suggestions);
    });
}

/**
 * @param {Object} state
 * @returns {void}
 */
export function restoreBreadcrumb(state) {
    if (!state.winRoot) return;
    const breadcrumbEl = state.winRoot.querySelector('.exp-breadcrumb');
    if (!breadcrumbEl) return;

    // Restore original HTML
    if (breadcrumbEl.dataset.originalHtml) {
        breadcrumbEl.innerHTML = breadcrumbEl.dataset.originalHtml;
        delete breadcrumbEl.dataset.originalHtml;
        breadcrumbEl.style.overflow = '';

        // Re-bind crumb click events
        breadcrumbEl.querySelectorAll('.exp-crumb').forEach(c => {
            c.addEventListener('click', (e) => {
                e.stopPropagation();
                if (c.classList.contains('active')) return; // current folder — nothing to jump to
                toggleCrumbDropdown(state, c);
            });
        });

        // Re-bind breadcrumb click
        setupBreadcrumbInput(state);
    }
}
