/**
 * @file explorer/window/rows.js
 * @description Binds interaction handlers to rendered list/grid rows
 * (click/select, shift/ctrl range & toggle select, double-click to open,
 * right-click context menu, folder-icon hover animation) and to the table
 * column headers (click-to-sort, drag-to-reorder via jQuery UI Sortable).
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * @module components/explorer/window/rows
 */
import { node } from './fsutil.js';
import { bindFolderAnim } from './icons.js';
import { updateMeta } from './meta.js';
import { navigate, openFile, updateMain } from './core.js';
import { rowMenu } from './menus.js';
import { toggleCrumbDropdown } from './breadcrumb.js';

/**
 * Binds click/dblclick/contextmenu handlers to every rendered row/grid item,
 * and crumb click handlers to the breadcrumb.
 *
 * @param {Object} state
 * @returns {void}
 */
export function bindRows(state) {
    if (!state.winRoot) return;
    state.winRoot.querySelectorAll('.exp-anim-folder').forEach(bindFolderAnim);
    state.winRoot.querySelectorAll('.exp-row, .exp-grid-item').forEach(row => {
        const p = row.dataset.path;

        row.addEventListener('click', e => {
            if (e._boxSelectShift) return; // handled by boxSelect shift+click
            const all = () => Array.from(state.winRoot.querySelectorAll('.exp-row, .exp-grid-item'));

            if (e.shiftKey && state.shiftAnchor) {
                // Range select from anchor to clicked row
                const rows  = all();
                const ai    = rows.findIndex(r => r.dataset.path === state.shiftAnchor);
                const ci    = rows.indexOf(row);
                if (ai !== -1 && ci !== -1) {
                    state.selection.clear();
                    rows.forEach(r => r.classList.remove('exp-selected'));
                    rows.slice(Math.min(ai, ci), Math.max(ai, ci) + 1).forEach(r => {
                        state.selection.add(r.dataset.path);
                        r.classList.add('exp-selected');
                    });
                    app.dev.log(`Shift-range select: ${state.selection.size} items`, 'Explorer');
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (state.selection.has(p)) {
                    state.selection.delete(p);
                    row.classList.remove('exp-selected');
                    app.dev.log(`Deselect: ${p} (${state.selection.size} selected)`, 'Explorer');
                } else {
                    state.selection.add(p);
                    row.classList.add('exp-selected');
                    app.dev.log(`Toggle select: ${p} (${state.selection.size} selected)`, 'Explorer');
                }
                state.shiftAnchor = p;
            } else {
                state.selection.clear();
                all().forEach(r => r.classList.remove('exp-selected'));
                state.selection.add(p);
                row.classList.add('exp-selected');
                state.shiftAnchor = p;
                app.dev.log(`Select: ${p}`, 'Explorer');
            }
            // Update meta for last clicked item
            const parts = p.split('/');
            const name  = parts[parts.length - 1];
            const entry = node(p);
            if (entry) updateMeta(state, name, entry);
        });

        row.addEventListener('dblclick', () => {
            if (row.dataset.folder === 'true') { navigate(state, p); return; }
            if (state.isDialog) return;
            openFile(state, p);
        });

        // Right-click context menu
        row.addEventListener('contextmenu', e => {
            e.stopPropagation(); // prevent .exp-main's menu from overriding the row menu
            if (!state.selection.has(p)) {
                state.selection.clear();
                state.winRoot.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.remove('exp-selected'));
                state.selection.add(p);
                row.classList.add('exp-selected');
            }
        });
        app.ui.contextMenu(row, { callback: () => rowMenu(state, p) });
    });
    state.winRoot.querySelectorAll('.exp-crumb').forEach(c => {
        c.addEventListener('click', e => {
            e.stopPropagation();
            if (c.classList.contains('active')) return; // current folder — nothing to jump to
            toggleCrumbDropdown(state, c);
        });
    });
}

// ── Column header: sort click + drag-to-reorder (jQuery UI Sortable) ────────

/**
 * @param {Object} state
 * @returns {void}
 */
export function bindColumnHeaders(state) {
    if (!state.winRoot) return;
    const $tr = $(state.winRoot).find('.exp-table thead tr');
    if (!$tr.length) return;

    if ($tr.hasClass('ui-sortable')) $tr.sortable('destroy');

    let _wasDragged = false;

    $tr.sortable({
        items:       'th[data-col]',
        axis:        'x',
        placeholder: 'exp-col-placeholder',
        helper(event, th) {
            const $h = $('<div class="exp-col-helper"></div>');
            $h.text(th.text()).css({ minWidth: th.outerWidth() });
            return $h;
        },
        start(event, ui) {
            _wasDragged = false;
            ui.placeholder.css({ width: ui.item.outerWidth(), height: ui.item.outerHeight() });
        },
        sort() {
            _wasDragged = true;
        },
        stop(event, ui) {
            if (!_wasDragged) return;
            const newOrder = [];
            $tr.find('th[data-col]').each(function () {
                const key = $(this).data('col');
                const col = state.columns.find(c => c.key === key);
                if (col) newOrder.push(col);
            });
            state.columns = newOrder;
            updateMain(state);
        }
    });

    $tr.find('th[data-col]').off('click.colsort').on('click.colsort', function () {
        if (_wasDragged) return;
        const col = $(this).data('col');
        if (state.sortField === col) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortField = col;
            state.sortDir = 'asc';
        }
        updateMain(state);
    });
}
