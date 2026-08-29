/**
 * @file explorer/setup/core.js
 * @description Foundational `app.explorer` API: clipboard (copy/cut/paste),
 * `open()`, the meta-panel widget registry, the context-menu registry (+ its
 * "New" submenu), the shared virtual filesystem (`_fs`, loaded from
 * filesystem.json), the active-instance registry, `_getNode`, and
 * `_refreshAll` (repaints every open Explorer window + syncs desktop icons).
 *
 * Everything here is boot-critical infrastructure other `explorer/setup/*.js`
 * modules (and other programs entirely — recyclebin, desktop icons, notepad,
 * mediaplayer, …) build on via the public `app.explorer.*` surface.
 *
 * Exported `registerCore(os)`, called once from explorer/setup/index.js —
 * must run before any other explorer/setup/*.js `register*(os)` call, since
 * they all read/write `app.explorer._getNode`/`_fs`/`_refreshAll` etc.
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes.
 *
 * @module components/explorer/setup/core
 */

/**
 * Registers the foundational `app.explorer` API.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerCore(os) {
    // ── app.explorer public API ────────────────────────────────────────────────
    app.explorer = app.explorer || {};
    Object.assign(app.explorer, {
        clipboard:    { items: [], mode: null },
        _os:          os,
        _pendingPath: null,
        copy(paths)   {
            this.clipboard = { items: [].concat(paths), mode: 'copy' };
            app.dev.log(`Copy ${[].concat(paths).length} item(s): ${[].concat(paths).join(', ')}`, 'Explorer');
        },
        cut(paths)    {
            this.clipboard = { items: [].concat(paths), mode: 'cut' };
            app.dev.log(`Cut ${[].concat(paths).length} item(s): ${[].concat(paths).join(', ')}`, 'Explorer');
        },
        paste(destPath, onDone) {
            if (!this.clipboard.items.length) return;
            const { items, mode } = this.clipboard;
            app.dev.log(`Paste (${mode}) ${items.length} item(s) → ${destPath}`, 'Explorer');
            if (mode === 'cut') this.clipboard = { items: [], mode: null };
            if (typeof onDone === 'function')
                onDone(items.map(p => ({ path: p, name: (p + '').split('/').pop() })), destPath, mode);
        },
        open(address) {
            this._pendingPath = address || null;
            app.program.open('explorer');
        },
        getClipboard() { return { mode: this.clipboard.mode, items: [...this.clipboard.items] }; },
    });

    /**
     * Meta panel widget API. Other programs call
     * `app.explorer.metaPanel.register(opts)` in their `setup()` to inject
     * a compact widget into the right-hand meta sidebar when a matching
     * file extension is selected in Explorer.
     * @typedef {Object} MetaPanelWidgetOpts
     * @property {string} id - Unique widget id.
     * @property {string[]|'*'} exts - File extensions (lowercase) or '*' for all.
     * @property {function(string, Object): string} render - Returns HTML;
     *   must include `data-widget-id="${id}"`.
     * @property {function(Element, string, Object): (function(): void)|void} [bind] -
     *   Called after HTML is injected. Return a cleanup function (or nothing).
     */
    app.explorer.metaPanel = app.explorer.metaPanel || {
        _widgets: [],
        register(opts) {
            if (this._widgets.some(w => w.id === opts.id)) return;
            this._widgets.push(opts);
        },
        _getWidgets(ext) {
            return this._widgets.filter(w =>
                w.exts === '*' || (Array.isArray(w.exts) && w.exts.includes(ext))
            );
        }
    };

    // ── app.explorer.contextMenu public API ────────────────────────────────────
    app.explorer.contextMenu = {
        _entries: [],
        add(val, sort) {
            this._entries.push({ sort: sort ?? 0, val });
            this._entries.sort((a, b) => a.sort - b.sort);
        },
        _build() {
            return this._entries
                .map(e => typeof e.val === 'function' ? e.val() : e.val)
                .filter(Boolean);
        }
    };

    app.explorer.contextMenu.submenu = {
        new: {
            _entries: [],
            add({ icon = '', text = '', alt = '', fn } = {}) {
                this._entries.push({ icon, title: text, alt, callback: fn });
            },
            _build() { return [...this._entries]; }
        }
    };

    // ── Shared filesystem (loaded from filesystem.json via api.js) ──────────────
    app.explorer._fs = { '/': { type: 'folder', children: {} } };
    app.api.get(os.config.local.ComponentsRoot + 'explorer/filesystem.json')
        .success(data => {
            if (data?.['/']?.children) app.explorer._fs['/'].children = data['/'].children;
            app.desktop?.icon?.syncFsShortcuts?.();
            app.desktop?.icon?.refreshFs?.();
        });

    // ── Active instance registry ──────────────────────────────────────────────
    app.explorer._instances = [];
    app.explorer._activeStartInlineNewFolder = null;

    // ── Shared node lookup ────────────────────────────────────────────────────
    app.explorer._getNode = function(path) {
        const fs = app.explorer._fs;
        if (!fs) return null;
        if (path === '/') return fs['/'];
        const parts = path.split('/').filter(Boolean);
        let cur = fs['/'];
        for (const p of parts) {
            if (!cur?.children?.[p]) return null;
            cur = cur.children[p];
        }
        return cur;
    };

    // ── Refresh all open Explorer windows ─────────────────────────────────────
    app.explorer._refreshAll = function(focusPath) { _explorerUpdateAll(focusPath); };

    function _explorerUpdateAll(focusPath) {
        app.explorer._instances = app.explorer._instances.filter(
            inst => inst.root && document.contains(inst.root));
        app.explorer._instances.forEach(inst => {
            if (focusPath && inst.currentPath() === focusPath) {
                inst.navigate(focusPath); // re-navigate = full refresh of that folder
            } else {
                inst.update(); // refresh current view (tree, footer, etc.)
            }
        });
        app.desktop?.icon?.refreshFs?.();
    }
}
