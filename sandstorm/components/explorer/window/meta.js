/**
 * @file explorer/window/meta.js
 * @description Right-hand meta/details panel. Two mutually-exclusive modes,
 * switched by core.js's updateMain() based on state.searchQuery:
 * - No search: single-selection details (icon, name, type-specific fields,
 *   per-extension widget extras from `app.explorer.metaPanel`), or a
 *   multi-selection summary (grouped icon or a type-filter list for mixed
 *   selections). Driven by row-click handlers (rows.js) and box-select
 *   (toolbar.js) calling `updateMeta()` directly — unchanged from before
 *   search took over this panel.
 * - Search active: `updateSearchMeta()` instead renders an ASCII tree of
 *   every match's full path (ancestor chain down to the searched folder,
 *   then the branching match tree beneath it), so the user can see exactly
 *   where in the tree each hit lives without needing exp-meta's normal
 *   selection role.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes (aside from the search-tree mode, added later).
 *
 * @module components/explorer/window/meta
 */
import { EXT_COLOR } from './state.js';
import { node, breadcrumb } from './fsutil.js';
import { extIcon, fileIcon, animatedFolderIcon } from './icons.js';
import { searchMatches } from './search.js';

/**
 * Recursively wraps every text node under `el` in its own <span class="exp-meta-char">`,
 * so a per-character stagger animation (driven by the --c custom property,
 * see explorer.css's span.exp-meta-char rule) can play across them. Marked
 * with a dedicated class — rows.js content already contains real structural
 * spans (.exp-meta-label/.exp-meta-value) that must survive the unwrap in
 * `_typeIn` untouched.
 *
 * @param {Element} el
 * @returns {void}
 */
function _wrapCharacters(el) {
    Array.from(el.childNodes).forEach(child => {
        if (child.nodeType === 1) {
            _wrapCharacters(child);
        } else if (child.nodeType === 3) {
            if (!child.nodeValue.trim()) return;
            const frag = document.createDocumentFragment();
            [...child.nodeValue].forEach(ch => {
                const span = document.createElement('span');
                span.className = 'exp-meta-char';
                span.textContent = ch;
                frag.appendChild(span);
            });
            child.replaceWith(frag);
        }
    });
}

/**
 * Plays the character-stagger "type in" animation over `el`'s current
 * content, then unwraps the .exp-meta-char spans back to plain text once it
 * finishes (any other markup, e.g. .exp-meta-label/.exp-meta-value, is left
 * exactly as-is).
 *
 * Cancels any pending unwrap from a previous call on the same element —
 * needed because a fast run of selection changes can call this again
 * before the prior element's timeout fires; without cancelling, that stale
 * timeout would later unwrap the spans mid-animation for whatever content
 * has since replaced it. `el._typeInTimer` is plain per-element state,
 * same pattern as `extraEl._widgetCleanups` above.
 *
 * @param {Element} el
 * @returns {void}
 */
function _typeIn(el) {
    if (!el) return;
    if (el._typeInTimer) { clearTimeout(el._typeInTimer); el._typeInTimer = null; }
    if (!el.textContent) return;

    _wrapCharacters(el);
    const spans = el.querySelectorAll('span.exp-meta-char');
    spans.forEach((span, i) => span.style.setProperty('--c', i));
    const duration = 1000 + Math.max(0, spans.length - 1) * 15;
    el._typeInTimer = setTimeout(() => {
        el.querySelectorAll('span.exp-meta-char').forEach(span => {
            span.replaceWith(document.createTextNode(span.textContent));
        });
        el.normalize();
        el._typeInTimer = null;
    }, duration);
}

/**
 * Fades `el` in from transparent — used for .exp-meta-icon, which swaps
 * markup wholesale on every selection change rather than getting the
 * per-character treatment the text fields get.
 *
 * @param {Element} el
 * @returns {void}
 */
function _fadeIn(el) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '0';
    void el.offsetWidth; // force reflow so the transition below actually animates
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '1';
}

/**
 * Updates the meta panel to reflect the current selection.
 *
 * Callers (rows.js's row click, toolbar.js's box-select) resolve selection
 * details and call this directly without knowing whether a search is
 * active — clicking a search-result row still goes through here. Redirect
 * to the search tree in that case so the panel doesn't flip away from it
 * just because the user clicked one of the results it's showing.
 *
 * @param {Object} state
 * @param {string} name
 * @param {Object} entry
 * @returns {void}
 */
export function updateMeta(state, name, entry) {
    if (state.searchQuery.trim()) { updateSearchMeta(state); return; }
    if (!state.winRoot) return;
    const icon    = state.winRoot.querySelector('.exp-meta-icon');
    const nameEl  = state.winRoot.querySelector('.exp-meta-name');
    const rows    = state.winRoot.querySelector('.exp-meta-rows');
    const extraEl = state.winRoot.querySelector('.exp-meta-extra');
    if (!icon || !nameEl || !rows) return;
    icon.classList.remove('exp-meta-icon-thumb');

    function _clearExtra() {
        if (!extraEl) return;
        (extraEl._widgetCleanups || []).forEach(fn => { try { fn(); } catch(e) {} });
        extraEl._widgetCleanups = [];
        extraEl.innerHTML = '';
    }
    function _renderExtra(path, fileEntry) {
        _clearExtra();
        if (!extraEl || !fileEntry?.ext) return;
        const ext     = fileEntry.ext.toLowerCase();
        const widgets = app.explorer.metaPanel?._getWidgets(ext) || [];
        if (!widgets.length) return;
        extraEl.innerHTML = widgets.map(w => {
            try { return w.render(path, fileEntry); } catch(e) { return ''; }
        }).join('');
        extraEl._widgetCleanups = [];
        widgets.forEach(w => {
            if (typeof w.bind !== 'function') return;
            const el = extraEl.querySelector(`[data-widget-id="${w.id}"]`);
            if (!el) return;
            try {
                const cleanup = w.bind(el, path, fileEntry);
                if (typeof cleanup === 'function') extraEl._widgetCleanups.push(cleanup);
            } catch(e) {}
        });
    }

    if (state.selection.size === 0) { icon.innerHTML = ''; nameEl.textContent = ''; rows.innerHTML = ''; _clearExtra(); return; }

    if (state.selection.size > 1) {
        // ── Multi-selection ───────────────────────────────────────────
        const entries = [...state.selection].map(p => {
            const parts = p.split('/');
            return { name: parts[parts.length - 1], entry: node(p) };
        }).filter(x => x.entry);

        // Group by type
        const folders = entries.filter(x => x.entry.type === 'folder');
        const files   = entries.filter(x => x.entry.type === 'file');
        const extMap  = {};
        files.forEach(({ entry: e }) => {
            const k = e.ext || '?';
            extMap[k] = (extMap[k] || 0) + 1;
        });
        const types = Object.keys(extMap);
        const mixedTypes = types.length > 1 || (folders.length > 0 && files.length > 0);

        nameEl.textContent = `${state.selection.size} ${_('items selected')}`;

        if (!mixedTypes) {
            // All same type — show group icon
            if (folders.length > 0) {
                const closedFolder = animatedFolderIcon(state, { type: 'folder', children: {} }, 80, 0);
                icon.innerHTML = closedFolder + `<span style="margin-left:-40px;opacity:0.6;display:inline-flex;">${closedFolder}</span>`;
            } else {
                const ext = types[0] || '?';
                icon.innerHTML = extIcon(ext, 80) + `<span style="margin-left:-40px;opacity:0.6;display:inline-flex;">` + extIcon(ext, 80) + `</span>`;
            }
            rows.innerHTML = `<div class="exp-meta-row"><span class="exp-meta-label">${_('Count')}</span><span class="exp-meta-value">${state.selection.size}</span></div>`;
        } else {
            // Mixed types — type filter list
            icon.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24"><path fill="rgba(255,255,255,0.5)" d="M4 6h16v2H4zm4 5h8v2H8zm3 5h2v2h-2z"/></svg>`;
            const typeRows = [];
            if (folders.length > 0) {
                typeRows.push({ key: '__folder', label: _('Folders'), count: folders.length,
                    icon: `<svg width="14" height="14" style="color:#fbbf24"><use href="#ic-folder"></use></svg>` });
            }
            types.forEach(ext => {
                const color = EXT_COLOR[ext] || 'rgba(255,255,255,0.4)';
                typeRows.push({ key: ext, label: ext.toUpperCase(), count: extMap[ext], icon: extIcon(ext, 14) });
            });
            rows.innerHTML = `
                <div class="exp-meta-row"><span class="exp-meta-label">${_('Filter by type')}</span></div>
                ${typeRows.map(t => `
                    <button class="exp-meta-type-btn" data-type="${t.key}" style="display:flex;align-items:center;gap:6px;width:100%;background:none;border:none;color:rgba(255,255,255,0.7);font-size:11px;padding:4px 0;cursor:pointer;border-radius:4px;text-align:left;">
                        ${t.icon}
                        <span style="flex:1;">${t.label}</span>
                        <span style="opacity:0.5;">${t.count}</span>
                    </button>`).join('')}`;
            rows.querySelectorAll('.exp-meta-type-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    this.classList.toggle('exp-meta-type-active');
                    const activeTypes = new Set([...rows.querySelectorAll('.exp-meta-type-btn.exp-meta-type-active')].map(b => b.dataset.type));
                    if (activeTypes.size === 0) return;
                    // Filter selection to only active types
                    const newSel = [...state.selection].filter(p => {
                        const e = node(p);
                        if (!e) return false;
                        if (e.type === 'folder') return activeTypes.has('__folder');
                        return activeTypes.has(e.ext || '?');
                    });
                    state.selection = new Set(newSel);
                    state.winRoot.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.toggle('exp-selected', state.selection.has(r.dataset.path)));
                });
                btn.addEventListener('mouseover', function() { this.style.color = '#fff'; });
                btn.addEventListener('mouseout',  function() { if (!this.classList.contains('exp-meta-type-active')) this.style.color = 'rgba(255,255,255,0.7)'; });
            });
        }
        _clearExtra();
        _fadeIn(icon);
        _typeIn(nameEl);
        _typeIn(rows);
        return;
    }

    // ── Single selection ──────────────────────────────────────────────
    const isFolder = entry.type === 'folder';
    const isThumbnail = !isFolder && !!entry.url && app.program?.extInfo?.[entry.ext]?.thumbnail === true;
    const rawIcon = isFolder
        ? animatedFolderIcon(state, entry, 80, Object.keys(entry.children || {}).length > 0 ? 1 : 0)
        : fileIcon(entry, isThumbnail ? 200 : 80, 'contain');
    icon.innerHTML = rawIcon;
    if (isThumbnail) icon.classList.add('exp-meta-icon-thumb');
    nameEl.textContent = name;
    const fields = [];
    if (!isFolder) {
        if (entry.size)     fields.push([_('Size'),     entry.size]);
        if (entry.ext)      fields.push([_('Type'),     entry.ext.toUpperCase()]);
        if (entry.modified) fields.push([_('Modified'), entry.modified]);
    } else {
        const count = entry.children ? Object.keys(entry.children).length : 0;
        fields.push([_('Type'), _('Folder')]);
        fields.push([_('Items'), String(count)]);
    }
    rows.innerHTML = fields.map(([label, value]) => `
        <div class="exp-meta-row">
            <span class="exp-meta-label">${label}</span>
            <span class="exp-meta-value">${value}</span>
        </div>`).join('');

    if (!isFolder) {
        const selPath = [...state.selection][0];
        _renderExtra(selPath, entry);
    } else {
        _clearExtra();
    }

    _fadeIn(icon);
    _typeIn(nameEl);
    _typeIn(rows);
    if (extraEl && extraEl.innerHTML) _typeIn(extraEl);
}

/**
 * Re-renders exp-meta from the current selection — the same resolution
 * rows.js's click handler and toolbar.js's box-select already do. Used by
 * core.js to restore the normal selection view the moment a search ends
 * (see state._metaSearchActive).
 *
 * @param {Object} state
 * @returns {void}
 */
export function refreshMetaFromSelection(state) {
    if (state.selection.size === 1) {
        const p = [...state.selection][0];
        const parts = p.split('/');
        const entry = node(p);
        if (entry) { updateMeta(state, parts[parts.length - 1], entry); return; }
    }
    updateMeta(state, '', null); // handles 0 and >1 — both branches read state.selection directly
}

/**
 * Groups search matches into a nested {segment: {__children, __entry}} tree,
 * keyed by each match's path relative to state.path (the searched folder).
 *
 * @param {Object} state
 * @param {{name: string, path: string, entry: Object}[]} matches
 * @returns {Object}
 */
function _buildRelativeMatchTree(state, matches) {
    const root = {};
    matches.forEach(m => {
        const rel  = state.path === '/' ? m.path.slice(1) : m.path.slice(state.path.length + 1);
        const segs = rel.split('/').filter(Boolean);
        let cur = root;
        segs.forEach((seg, i) => {
            if (!cur[seg]) cur[seg] = { __children: {} };
            if (i === segs.length - 1) cur[seg].__entry = m.entry;
            cur = cur[seg].__children;
        });
    });
    return root;
}

/**
 * Renders a nested match tree as `tree`-style ASCII lines (├──/└──/│).
 *
 * @param {Object} nodeDict
 * @param {string} prefix
 * @returns {string[]}
 */
function _renderMatchTreeLines(nodeDict, prefix) {
    const keys = Object.keys(nodeDict);
    const lines = [];
    keys.forEach((key, i) => {
        const isLast = i === keys.length - 1;
        lines.push(prefix + (isLast ? '└── ' : '├── ') + key);
        const childKeys = Object.keys(nodeDict[key].__children);
        if (childKeys.length) {
            lines.push(..._renderMatchTreeLines(nodeDict[key].__children, prefix + (isLast ? '    ' : '│   ')));
        }
    });
    return lines;
}

/**
 * Builds the full ASCII tree text for the search-meta panel: the ancestor
 * chain from Home down to the searched folder (state.path), then the
 * branching match tree hanging off it.
 *
 * @param {Object} state
 * @param {{name: string, path: string, entry: Object}[]} matches
 * @returns {string}
 */
function _renderSearchTree(state, matches) {
    const crumbs = breadcrumb(state.path);
    const lines  = [crumbs[0].name];
    let prefix = '';
    for (let i = 1; i < crumbs.length; i++) {
        lines.push(prefix + '└── ' + crumbs[i].name);
        prefix += '    ';
    }
    lines.push(..._renderMatchTreeLines(_buildRelativeMatchTree(state, matches), prefix));
    return lines.join('\n');
}

/**
 * Renders exp-meta as a search-results tree instead of selection details.
 * Called from core.js's updateMain() whenever state.searchQuery is
 * non-empty — takes over the panel entirely regardless of what row (if
 * any) is currently selected.
 *
 * @param {Object} state
 * @returns {void}
 */
export function updateSearchMeta(state) {
    if (!state.winRoot) return;
    const icon    = state.winRoot.querySelector('.exp-meta-icon');
    const nameEl  = state.winRoot.querySelector('.exp-meta-name');
    const rows    = state.winRoot.querySelector('.exp-meta-rows');
    const extraEl = state.winRoot.querySelector('.exp-meta-extra');
    if (!icon || !nameEl || !rows) return;
    if (extraEl) { (extraEl._widgetCleanups || []).forEach(fn => { try { fn(); } catch(e) {} }); extraEl._widgetCleanups = []; extraEl.innerHTML = ''; }

    const query   = state.searchQuery.trim();
    const matches = searchMatches(state, query);

    icon.innerHTML = `<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`;
    nameEl.textContent = query;

    if (matches.length === 0) {
        const scope = breadcrumb(state.path).map(c => c.name).join(' / ');
        rows.innerHTML = `
            <div class="exp-meta-row"><span class="exp-meta-label">${_('Searching in')}</span><span class="exp-meta-value">${app.util.escapeHtml(scope)}</span></div>
            <div class="exp-meta-row" style="opacity:0.5;margin-top:8px;">${_('No results found')}</div>`;
        return;
    }

    rows.innerHTML = `<pre class="exp-meta-search-tree">${app.util.escapeHtml(_renderSearchTree(state, matches))}</pre>`;
}
