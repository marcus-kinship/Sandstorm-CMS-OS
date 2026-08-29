/**
 * @file recyclebin/setup.js
 * @description Boot-time registration for the Recycle Bin program.
 *
 * Registers the program's icons, metadata, and the `app.recyclebin` API —
 * boot-critical, since Explorer's delete/restore operations and the
 * desktop icon's empty/full state depend on it existing even if the
 * Recycle Bin window is never opened. Undo/redo for delete goes through
 * the active Explorer window's `win.history` (see historyManager.js)
 * rather than a bin-local stack — Recyclebin itself never touches
 * `app.historyManager` directly. The window logic lives in
 * `recyclebin.js`, lazy-loaded by `app.program.open()` the first time
 * the user actually opens the program.
 *
 * @module components/recyclebin/setup
 */
export function setup(os) {

    // ── SVG Icons ──────────────────────────────────────────────────────────────

    os.svg.global.load({
        id: 'ic-recyclebin',
        viewBox: '0 0 202 228',
        content: `<g>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter"  fill="#ffffff94"
 d="M112.000,217.000 L21.090,187.640 L0.1000,30.1000 L112.000,68.000 L112.000,217.000 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#ffffffde"
 d="M175.970,194.553 L111.1000,217.090 L111.1000,68.440 L201.000,38.000 L175.970,194.553 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#ffffffd0"
 d="M112.000,68.440 L0.000,30.1000 L86.400,0.440 L201.120,38.520 L112.000,68.440 ZM8.205,30.955 L112.000,65.560 L192.640,38.360 L86.400,3.320 L8.205,30.955 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter"  fill="#ffffff94"
 d="M111.1000,65.560 L85.1000,56.892 L85.1000,3.461 L86.400,3.320 L192.640,38.360 L111.1000,65.560 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter"  fill="#ffffffed"
 d="M86.000,56.892 L8.205,30.955 L86.000,3.461 L86.000,56.892 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#e4e4e4"
 d="M86.240,165.560 L175.1000,194.520 L112.000,217.560 L21.440,187.640 L86.240,165.560 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" fill="#ebebeb"
 d="M175.970,194.553 C175.970,194.553 119.770,214.630 115.1000,215.960 C111.930,217.470 107.680,215.960 107.680,215.960 L21.280,187.640 L21.280,195.960 C21.280,195.960 22.485,198.1000 24.160,199.640 C24.680,199.820 107.680,227.160 107.680,227.160 C107.680,227.160 112.850,228.310 115.1000,227.160 C116.660,226.930 172.960,206.840 172.960,206.840 C172.960,206.840 175.970,205.140 175.970,202.040 C175.970,198.940 175.970,194.553 175.970,194.553 Z"/>
<path fill-rule="evenodd"  stroke="none" stroke-width="0px" stroke-linecap="butt" stroke-linejoin="miter" opacity="0.522" fill="rgb(0, 131, 231)"
 d="M47.820,85.090 C47.820,85.090 56.826,87.513 61.470,88.762 C64.701,89.631 67.373,90.046 69.648,92.254 C71.695,94.302 73.520,97.751 73.923,98.545 C74.327,99.340 77.215,105.391 77.206,105.416 C77.206,105.416 80.376,104.121 81.979,103.479 C81.980,103.498 81.980,103.517 81.981,103.536 C79.085,108.566 76.265,113.463 73.522,118.229 C67.281,116.212 61.205,114.248 55.292,112.337 C55.305,112.307 55.318,112.278 55.331,112.248 C57.067,111.738 58.822,111.223 60.630,110.657 C60.057,109.141 58.835,106.074 57.960,104.236 C52.881,91.790 45.832,84.609 45.832,84.609 L47.820,85.090 ZM41.135,83.714 C45.414,84.851 48.503,88.705 50.696,92.335 C51.311,93.354 52.407,95.041 52.852,95.971 C50.765,100.637 48.733,105.299 46.743,109.749 C41.759,104.718 36.841,99.752 31.989,94.854 C33.992,91.213 36.041,87.491 38.134,83.688 C39.249,83.559 40.121,83.644 41.135,83.714 ZM85.102,122.168 C85.102,122.168 93.281,141.307 93.737,142.253 C93.744,144.598 92.489,145.618 91.762,146.307 C91.182,147.123 87.605,148.944 84.626,148.340 C82.207,147.399 79.812,146.467 77.442,145.544 C74.646,139.483 69.039,127.279 69.039,127.279 L85.102,122.168 ZM22.260,101.941 C30.649,104.685 37.182,106.821 37.182,106.821 L45.889,125.441 L40.535,120.141 C40.535,120.141 37.937,126.868 36.671,130.146 C34.876,129.429 33.096,128.718 31.331,128.013 C28.625,126.372 26.423,123.356 24.982,120.547 C24.540,119.545 24.098,118.542 23.657,117.539 C24.885,114.056 26.136,110.508 27.409,106.898 C25.684,105.237 23.967,103.585 22.260,101.941 ZM65.836,136.507 C65.955,138.435 66.192,142.267 66.192,142.267 L79.760,147.432 C79.760,147.432 84.376,149.390 86.442,149.543 C88.119,149.667 89.585,149.383 90.824,148.857 C92.358,148.387 91.415,149.664 88.639,154.496 C85.995,159.730 83.148,164.810 76.593,164.100 C73.951,163.814 70.482,162.264 67.047,160.803 C67.108,162.780 67.231,166.705 67.231,166.705 C67.231,166.705 64.685,161.380 58.681,148.848 C61.007,144.836 63.392,140.723 65.836,136.507 ZM24.675,122.359 C26.545,124.522 28.337,127.154 30.864,128.731 C37.980,131.498 45.344,134.361 52.966,137.324 C53.319,143.443 53.668,149.470 54.011,155.403 C49.746,153.591 45.561,151.813 41.457,150.070 C40.182,149.202 38.963,147.918 37.962,146.807 C33.620,141.987 31.116,136.691 28.289,130.487 C27.086,127.781 25.881,125.071 24.675,122.359 Z"/>
</g>`
    });

    os.svg.global.load({
        id: 'ic-recyclebin-full',
        viewBox: '0 0 24 24',
        content: '<path fill="currentColor" d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm-4 12H9V8h2v8zm4 0h-2V8h2v8zm2-15H7V6h10v13z"/>'
    });

    // ── Program registration ──────────────────────────────────────────────────

    os.program.addInfo('recyclebin', {
        name:        () => _('Recycle Bin'),
        version:     '1.0',
        owner:       'Sandstorm',
        description: () => _('Stores deleted files and folders'),
        icontype:    'svg',
        icon:        '#ic-recyclebin',
        programtype: 'system',
        taskbar:     false,
        startmenu:   false,
        multistart:  false,
        main:        'start',
        desktop:     true,
        autorun:     false,
        file:        'recyclebin/recyclebin.js', // Lazy-loaded by app.program.open() on first launch
        root:        'components'
    });

    // ── app.recyclebin API ────────────────────────────────────────────────────

    app.recyclebin = {
        _items: [],  // { id, originalPath, parentPath, name, deletedAt, entry }

        // Move paths from the filesystem into the recycle bin
        send(paths) {
            const list = [].concat(paths).filter(Boolean);
            if (!list.length) return;

            let ids = null;
            const doDelete = () => {
                const moved = [];
                list.forEach(path => {
                    const parts      = path.split('/').filter(Boolean);
                    const name       = parts.pop() || '';
                    const parentPath = parts.length ? '/' + parts.join('/') : '/';
                    const parentNode = app.explorer._getNode(parentPath);
                    if (!parentNode?.children?.[name]) return;

                    moved.push({
                        id:           'rb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                        originalPath: path,
                        parentPath,
                        name,
                        deletedAt:    new Date().toISOString().slice(0, 10),
                        entry:        JSON.parse(JSON.stringify(parentNode.children[name]))
                    });
                    delete parentNode.children[name];
                });
                if (!moved.length) { ids = null; return; }
                this._items.push(...moved);
                this._updateIcon();
                app.explorer._refreshAll?.();
                ids = moved.map(m => m.id);
            };

            const session = app.explorer._activeWin?.history;
            if (session) {
                session.execute({
                    title: _('Delete') + ' ' + list.map(p => p.split('/').filter(Boolean).pop() || p).join(', '),
                    do()   { doDelete(); },
                    undo() { if (ids) app.recyclebin.restore(ids); },
                    redo() { doDelete(); }
                });
            } else {
                doDelete();
            }

            if (ids) app.dev.log(`Recyclebin: sent ${ids.length} item(s)`, 'Recyclebin');
        },

        // Restore items from the bin back to their original location
        restore(ids) {
            const targets = ids ? [].concat(ids) : this._items.map(i => i.id);
            const failed  = [];

            targets.forEach(id => {
                const idx = this._items.findIndex(i => i.id === id);
                if (idx === -1) return;
                const item       = this._items[idx];
                const parentNode = app.explorer._getNode(item.parentPath);

                if (!parentNode?.children) { failed.push(item.name); return; }

                let name = item.name;
                if (parentNode.children[name]) name = 'Restored_' + name;

                parentNode.children[name] = item.entry;
                this._items.splice(idx, 1);
            });

            this._updateIcon();
            app.explorer._refreshAll?.();

            if (failed.length) {
                app.ui.alert({
                    title:   _('Restore failed'),
                    message: _('Original location not found for') + ': ' + failed.join(', '),
                    confirm: _('OK')
                });
            }
            app.dev.log(`Recyclebin: restored ${targets.length - failed.length} item(s)`, 'Recyclebin');
        },

        // Permanently remove items from the bin (no filesystem restore)
        deletePermanently(ids) {
            const targets = ids ? [].concat(ids) : this._items.map(i => i.id);
            this._items   = this._items.filter(i => !targets.includes(i.id));
            this._updateIcon();
            app.dev.log(`Recyclebin: permanently deleted ${targets.length} item(s)`, 'Recyclebin');
        },

        // Empty entire bin (with confirmation)
        empty(skipConfirm) {
            if (!this._items.length) {
                app.ui.alert({ title: _('Recycle Bin'), message: _('Recycle Bin is already empty'), confirm: _('OK') });
                return;
            }
            const doEmpty = () => {
                const n    = this._items.length;
                this._items = [];
                this._updateIcon();
                app.dev.log(`Recyclebin: emptied (${n} items)`, 'Recyclebin');
            };
            if (skipConfirm) { doEmpty(); return; }
            app.ui.confirm({
                title:     _('Empty Recycle Bin'),
                message:   _('Permanently delete all') + ' ' + this._items.length + ' ' + _('items') + '?\n' + _('This cannot be undone.'),
                confirm:   _('Empty'),
                cancel:    _('Cancel'),
                onConfirm: doEmpty
            });
        },

        count()  { return this._items.length; },

        // Sync the desktop icon to full/empty state
        _updateIcon() {
            const icon = this._items.length > 0 ? '#ic-recyclebin-full' : '#ic-recyclebin';
            const prog = app.program.getInfo('recyclebin');
            if (prog) prog.icon = icon;
            document.querySelectorAll('.desktop-icon[data-program="recyclebin"] svg use')
                .forEach(el => {
                    el.setAttribute('href', icon);
                    el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', icon);
                });
        }
    };

}
