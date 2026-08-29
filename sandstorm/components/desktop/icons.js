/**
 * @file icons.js
 * @description Desktop icon manager for the Sandstorm OS environment.
 *
 * Manages program shortcut icons rendered directly on the desktop surface.
 * Icons are arranged in a column-major flex grid: they fill top-to-bottom
 * within a column before wrapping into the next column (left-to-right).
 *
 * Only programs registered with `desktop: true` in their program info object
 * are shown. Icons support:
 * - Double-click / double-tap to launch
 * - Left-button drag (single or multi) to reposition
 * - Right-click / 1-second long-press for a context menu
 * - Ctrl/Cmd+click for multi-selection
 * - Rubber-band box-select on the desktop background
 *
 * Exposes the public namespace {@link app.desktop.icon}.
 *
 * @module desktop/icons
 */
(function (app) {

    // ── Private state ─────────────────────────────────────────────────────────

    /**
     * Ordered list of program IDs currently registered on the desktop.
     * Preserves the insertion order used for rendering.
     * @type {string[]}
     */
    let _icons = [];

    /**
     * Ordered list of filesystem paths (children of `/Desktop`) currently
     * rendered as real desktop icons. Kept in sync with `app.explorer._fs`
     * by {@link refreshFs}.
     * @type {string[]}
     */
    let _fsIcons = [];

    /**
     * Unix timestamp (ms) of the most recently completed drag operation.
     * Used to suppress accidental double-click events that would otherwise
     * fire immediately after a drag ends.
     * @type {number}
     */
    let _lastDragTime = 0;

    /**
     * Set of icon elements that are currently selected.
     * Selection is reflected visually via the `.selected` CSS class.
     * @type {Set<HTMLElement>}
     */
    let _selected = new Set();

    /**
     * Horizontal offset (px) from the left edge of the primary icon to the
     * mouse cursor at the moment `mousedown` fired. Used to position companion
     * icons correctly during a multi-icon drag.
     * @type {number}
     */
    let _mouseOffsetX = 0;

    /**
     * Vertical offset (px) from the top edge of the primary icon to the
     * mouse cursor at the moment `mousedown` fired.
     * @type {number}
     */
    let _mouseOffsetY = 0;

    /**
     * `true` while a multi-icon drag gesture is in progress.
     * Prevents the `mouseup` handler from collapsing the selection prematurely.
     * @type {boolean}
     */
    let _multiDragActive = false;
    let _shiftAnchor     = null; // anchor element for shift+click range selection

    let _desktopSortField = 'name'; // 'name' | 'size' | 'type' | 'modified'
    let _desktopSortDir   = 'asc';  // 'asc'  | 'desc'

    /**
     * `true` once `init()` has finished loading `icons.css`. `addFs`/`refreshFs`
     * can be called at any time from explorer's async fs-load callback — before
     * this flag flips, the `.desktop-icon img, .desktop-icon svg { width:40px;
     * height:40px }` rule isn't in the DOM yet, so icons would briefly render
     * at native/unstyled size. They no-op until `init()` calls `refreshFs()`
     * itself once ready, so nothing is lost — just deferred.
     * @type {boolean}
     */
    let _ready = false;

    // ── Private SVG icon strings ──────────────────────────────────────────────

    /**
     * Inline SVG markup for the Copy action used in context menu items.
     * @type {string}
     */
    const _copyIcon  = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

    /**
     * Inline SVG markup for the Cut action used in context menu items.
     * @type {string}
     */
    const _cutIcon   = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z"/></svg>';

    /**
     * Inline SVG markup for the Paste action used in context menu items.
     * @type {string}
     */
    const _pasteIcon = '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>';

    /**
     * Escapes a value for safe interpolation into a `[attr="..."]` CSS
     * attribute selector (fs paths can contain spaces/parens; this only
     * needs to defang quotes and backslashes).
     * @param {string} v
     * @returns {string}
     */
    function _escAttr(v) {
        return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    // ── Program icon ↔ /Desktop fs mirroring ────────────────────────────────
    // Program-kind desktop icons (add()/remove() below) live only in `_icons`
    // — Explorer's own `/Desktop` view (app.explorer._fs) never contained
    // them, so browsing to /Desktop in Explorer showed none of the real
    // desktop shortcuts (Explorer, Mail, Solitaire, …), only whatever was
    // seeded in filesystem.json. Desktop owns keeping a mirrored
    // type:'shortcut' entry in sync for each one, tagged `autoDesktopIcon`
    // so refreshFs() (kind:'fs' rendering) knows to skip it — the program-
    // kind icon this mirrors is already on screen, and rendering both would
    // duplicate it.
    function _ensureFsMirror(programId) {
        const desktopNode = app.explorer?._getNode?.('/Desktop');
        if (!desktopNode || desktopNode.type !== 'folder') return; // fs not loaded yet — syncFsShortcuts() catches up later
        if (!desktopNode.children) desktopNode.children = {};
        const alreadyMirrored = Object.values(desktopNode.children)
            .some(c => c.type === 'shortcut' && c.autoDesktopIcon && c.target === programId);
        if (alreadyMirrored) return;

        const program  = app.program.getInfo(programId);
        const baseName = program?.name || programId;
        let name = baseName, n = 2;
        while (desktopNode.children[name]) name = `${baseName} (${n++})`;

        desktopNode.children[name] = {
            type: 'shortcut',
            target: programId,
            autoDesktopIcon: true,
            modified: new Date().toISOString().slice(0, 10)
        };
    }

    function _removeFsMirror(programId) {
        const desktopNode = app.explorer?._getNode?.('/Desktop');
        if (!desktopNode?.children) return;
        Object.entries(desktopNode.children).forEach(([name, c]) => {
            if (c.type === 'shortcut' && c.autoDesktopIcon && c.target === programId) {
                delete desktopNode.children[name];
            }
        });
    }

    // Icon markup for a filesystem entry is owned by app.explorer.icon
    // (setup.js) — desktop just renders whatever it returns, so both places
    // stay in sync automatically instead of keeping a second copy here.
    function _fsIconHTML(entry) {
        return app.explorer.icon.forEntry(entry);
    }

    // ── Grid engine ──────────────────────────────────────────────────────────

    const _GCW = 80, _GCH = 80, _GGP = 8, _GPX = 16, _GPY = 16;
    const _gridItems = new Map(); // programId → { col, row, w, h }

    function _gCols() {
        const c = document.querySelector('.desktop-icons');
        return c ? Math.max(1, Math.floor((c.clientWidth  - _GPX * 2 + _GGP) / (_GCW + _GGP))) : 12;
    }
    function _gRows() {
        const c = document.querySelector('.desktop-icons');
        return c ? Math.max(1, Math.floor((c.clientHeight - _GPY * 2 + _GGP) / (_GCH + _GGP))) : 20;
    }
    function _gToPixel(col, row) {
        return { x: _GPX + col * (_GCW + _GGP), y: _GPY + row * (_GCH + _GGP) };
    }
    function _gFromPixel(x, y) {
        return {
            col: Math.max(0, Math.round((x - _GPX) / (_GCW + _GGP))),
            row: Math.max(0, Math.round((y - _GPY) / (_GCH + _GGP)))
        };
    }
    function _gOccupied(col, row, w, h, excludeId) {
        for (const [id, g] of _gridItems) {
            if (id === excludeId) continue;
            if (col < g.col + g.w && col + w > g.col && row < g.row + g.h && row + h > g.row) return id;
        }
        return null;
    }
    function _gFirstFree(w = 1, h = 1) {
        const cols = _gCols(), rows = _gRows();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c <= cols - w; c++) {
                if (!_gOccupied(c, r, w, h, null)) return { col: c, row: r };
            }
        }
        return { col: 0, row: 0 };
    }
    function _gApply(id, col, row, w, h, animate, updateUserPos = false) {
        const old = _gridItems.get(id);
        _gridItems.set(id, {
            col, row, w, h,
            el:      old ? old.el      : null,
            userCol: updateUserPos ? col : (old ? (old.userCol ?? col) : col),
            userRow: updateUserPos ? row : (old ? (old.userRow ?? row) : row)
        });
        const el = document.querySelector(`.desktop-icon[data-icon-id="${_escAttr(id)}"]`);
        if (!el) return;
        const { x, y } = _gToPixel(col, row);
        el.style.width  = (w * _GCW + (w - 1) * _GGP) + 'px';
        el.style.height = (h * _GCH + (h - 1) * _GGP) + 'px';
        if (animate && old) {
            const { x: ox, y: oy } = _gToPixel(old.col, old.row);
            el.style.transition = 'none';
            el.style.transform  = `translate(${ox - x}px,${oy - y}px)`;
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                el.style.transition = 'transform 0.22s ease';
                el.style.transform  = '';
                el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
            }));
        } else {
            if (el.style.transition.includes('transform')) el.style.transition = '';
            el.style.transform = '';
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
        }
    }

    // ── Resize / re-layout ───────────────────────────────────────────────────

    let _resizeTimer = null;

    function _gResize() {
        const cols = _gCols();
        const container = document.querySelector('.desktop-icons');

        const items = [..._gridItems.entries()]
            .map(([id, g]) => ({ id, col: g.col, row: g.row, w: g.w, h: g.h, el: g.el || null, userCol: g.userCol ?? g.col, userRow: g.userRow ?? g.row }))
            .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);

        items.forEach(({ id }) => _gridItems.delete(id));

        for (const item of items) {
            const uCol = item.userCol ?? item.col;
            const uRow = item.userRow ?? item.row;
            const tryCol = Math.min(uCol, Math.max(0, cols - item.w));
            let fCol = tryCol, fRow = uRow;

            if (_gOccupied(fCol, fRow, item.w, item.h, null)) {
                const free = _gFirstFree(item.w, item.h);
                fCol = free.col; fRow = free.row;
            }

            const moved = fCol !== item.col || fRow !== item.row;

            if (item.el) {
                _gridItems.set(item.id, { col: fCol, row: fRow, w: item.w, h: item.h, el: item.el, userCol: uCol, userRow: uRow });
                const { x, y } = _gToPixel(fCol, fRow);
                item.el.style.transition = 'left 0.25s ease, top 0.25s ease';
                item.el.style.left = x + 'px';
                item.el.style.top  = y + 'px';
            } else {
                _gridItems.set(item.id, { col: item.col, row: item.row, w: item.w, h: item.h, el: null, userCol: uCol, userRow: uRow });
                _gApply(item.id, fCol, fRow, item.w, item.h, moved, false);
            }
        }

        if (container) {
            const vals = [..._gridItems.values()];
            if (vals.length) {
                const maxBottom = Math.max(...vals.map(g => g.row + g.h));
                const needed = _GPY + maxBottom * (_GCH + _GGP);
                container.style.overflowY = needed > container.clientHeight ? 'auto' : '';
            }
        }
    }

    // ── Drop indicator ───────────────────────────────────────────────────────

    let _dropIndicator = null;

    function _ensureDropIndicator() {
        const c = document.querySelector('.desktop-icons');
        if (!c) return null;
        if (!_dropIndicator) {
            _dropIndicator = document.createElement('div');
            _dropIndicator.className = 'grid-drop-indicator';
        }
        if (!_dropIndicator.parentElement) c.appendChild(_dropIndicator);
        return _dropIndicator;
    }

    function _showDropIndicator(col, row, w, h) {
        const ind = _ensureDropIndicator();
        if (!ind) return;
        const { x, y } = _gToPixel(col, row);
        ind.style.left   = x + 'px';
        ind.style.top    = y + 'px';
        ind.style.width  = (w * _GCW + (w - 1) * _GGP) + 'px';
        ind.style.height = (h * _GCH + (h - 1) * _GGP) + 'px';
        ind.classList.add('active');
    }

    function _hideDropIndicator() {
        if (_dropIndicator) _dropIndicator.classList.remove('active');
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Removes the `.selected` class from all currently selected icon elements
     * and clears the internal selection set.
     *
     * @returns {void}
     */
    function _clearSelection() {
        const count = _selected.size;
        _selected.forEach(el => el.classList.remove('selected'));
        _selected.clear();
        if (count > 0) app.dev.log(`Deselect all — cleared ${count} icon(s)`, 'Desktop Icons');
    }

    function _selectIcon(el) {
        _clearSelection();
        el.classList.add('selected');
        _selected.add(el);
        app.dev.log(`Select icon: ${el.dataset.iconId}`, 'Desktop Icons');
    }

    function _toggleIcon(el) {
        if (_selected.has(el)) {
            _selected.delete(el);
            el.classList.remove('selected');
            app.dev.log(`Deselect icon: ${el.dataset.iconId}`, 'Desktop Icons');
        } else {
            el.classList.add('selected');
            _selected.add(el);
            app.dev.log(`Toggle select icon: ${el.dataset.iconId}`, 'Desktop Icons');
        }
    }

    /**
     * Returns the `.desktop-icons` flex container, creating and appending it
     * to `<body>` on the first call.
     *
     * @returns {HTMLElement} The container element.
     */
    function _getContainer() {
        let el = document.querySelector(".desktop-icons");
        if (!el) {
            el = document.createElement("div");
            el.className = "desktop-icons";
            document.body.appendChild(el);
        }
        return el;
    }

    /**
     * Whether the real (unclamped) pointer position during an icon drag is
     * currently over an open window rather than the desktop itself. Used to
     * suppress desktop-grid feedback (drop indicator, snap-to-grid
     * placement) while the drag is actually headed for an Explorer window
     * (see explorer/window/dragdrop.js's bindExternalDrop) — `.desktop-icons`
     * covers the full viewport, so a naive "is this point inside the
     * desktop container" check can't distinguish the two on its own.
     *
     * @param {MouseEvent} e - The real mouse event (e.clientX/Y), not a
     *   drag-clamped `ui.position` — jQuery UI's `containment` option keeps
     *   the dragged helper's own position inside `.desktop-icons`, but the
     *   actual cursor is free to move anywhere, including over a window.
     * @returns {boolean}
     */
    function _isOverWindow(e) {
        return !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.window');
    }

    /**
     * Reads the current clipboard from `app.explorer` and pastes any program
     * paths onto the desktop. If the clipboard mode is `'cut'` the clipboard
     * is cleared afterwards.
     *
     * Icons that already exist on the desktop are made visible again (in case
     * they were dimmed by a previous Cut operation). New icons are added via
     * {@link app.desktop.icon.add}.
     *
     * @returns {void}
     */
    function _desktopPaste() {
        const clip = app.explorer?.clipboard;
        if (!clip?.items?.length) return;
        app.dev.log(`Paste (${clip.mode}) ${clip.items.length} item(s) to desktop`, 'Desktop Icons');

        const fsPaths = [];
        clip.items.forEach(path => {
            if (typeof path !== 'string') return;
            if (path.startsWith('/programs/')) {
                const id = path.slice('/programs/'.length);
                const existing = document.querySelector(`.desktop-icon[data-icon-id="${_escAttr(id)}"]`);
                if (existing) existing.style.opacity = '';
                else app.desktop.icon.add(id);
            } else {
                fsPaths.push(path);
            }
        });
        if (fsPaths.length) app.explorer.pasteItems(fsPaths, clip.mode, '/Desktop');

        if (clip.mode === 'cut') app.explorer.clipboard = { items: [], mode: null };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * @namespace app.desktop.icon
     * @description
     * Public API for the Sandstorm desktop icon grid.
     *
     * Typical usage during OS startup:
     * ```js
     * await app.desktop.icon.init();
     * app.desktop.icon.add("calc");
     * app.desktop.icon.orderBy("asc");
     * ```
     */
    app.desktop.icon = {

        /**
         * Adds a desktop icon for the given program.
         *
         * The icon is rendered only when the program's info object contains
         * `desktop: true`. Duplicate registrations are silently ignored.
         * After creating the DOM element the method calls {@link bind} to
         * attach all interaction handlers.
         *
         * @memberof app.desktop.icon
         * @param {string} programId - Unique program identifier as registered
         *   with `app.program`.
         * @param {number} [staggerIndex] - Position in a batch render (boot's
         *   init(), update(), orderBy()) — when given, the icon gets the
         *   same fade-in treatment taskbar/build.js's own entrance animation
         *   uses (a `.fade-hidden`/`.fade-in` class pair + a
         *   `--icon-fade-delay` CSS variable, not an inline transition
         *   string), delayed `staggerIndex * 0.2s` so a batch fades in one
         *   at a time instead of all at once. Omitted for any single icon
         *   added outside a batch (paste, new program install, a resize
         *   relayout repositioning existing icons via _gApply — that path
         *   doesn't call add() at all) — those just appear immediately, no
         *   animation, exactly as before this feature existed.
         * @returns {void}
         *
         * @example
         * app.desktop.icon.add("notepad");
         */
        add: function (programId, staggerIndex) {
            const program = app.program.getInfo(programId);

            if (!program) {
                app.dev.error(`Program "${programId}" not found.`, "Desktop Icon");
                return;
            }

            if (!program.desktop) {
                return;
            }

            const container = _getContainer();

            const iconHTML = program.icontype === "svg"
                ? `<svg aria-hidden="true" focusable="false"><use href="${program.icon}"></use></svg>`
                : `<img src="${program.icon}" alt="" draggable="false">`;

            
            const tip = [program.name];

            const el = document.createElement("div");
            el.className = "desktop-icon";
            el.dataset.iconId = programId;
            el.dataset.kind = 'program';
            el.dataset.program = programId;
            el.dataset.tooltipFollow = '1';
            el.title = tip;
            el.innerHTML = `
                ${iconHTML}
                <span class="desktop-icon-label">${app.util.escapeHtml(app.util.truncate(program.name, 12))}</span>
            `;
            const animated = typeof staggerIndex === 'number';
            if (animated) {
                el.style.setProperty('--icon-fade-delay', `${staggerIndex * 0.2}s`);
                el.classList.add('fade-hidden');
            }
            container.appendChild(el);
            if (animated) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    el.classList.remove('fade-hidden');
                    el.classList.add('fade-in');
                }));
                el.addEventListener('transitionend', function _h(e) {
                    if (e.propertyName !== 'opacity') return;
                    el.removeEventListener('transitionend', _h);
                    el.classList.remove('fade-in', 'fade-hidden');
                });
            }

            if (!_icons.includes(programId)) _icons.push(programId);

            if (!_gridItems.has(programId)) {
                const pos = _gFirstFree(1, 1);
                _gridItems.set(programId, { col: pos.col, row: pos.row, w: 1, h: 1, el: null, userCol: pos.col, userRow: pos.row });
            }
            const g = _gridItems.get(programId);
            const { x, y } = _gToPixel(g.col, g.row);
            el.style.position = 'absolute';
            el.style.left  = x + 'px';
            el.style.top   = y + 'px';
            el.style.width  = _GCW + 'px';
            el.style.height = _GCH + 'px';

            this.bind(programId);

            _ensureFsMirror(programId);
        },

        /**
         * Ensures every currently desktop-visible program has its mirrored
         * `/Desktop` shortcut entry (see {@link _ensureFsMirror}). `add()`
         * already does this for the single program it just rendered, but at
         * boot `add()` can run before `app.explorer._fs` has finished its
         * initial async load (see explorer/setup.js), in which case the
         * mirror silently no-ops — this backfills those once the fs is
         * actually ready.
         *
         * @memberof app.desktop.icon
         * @returns {void}
         */
        syncFsShortcuts: function () {
            _icons.forEach(programId => _ensureFsMirror(programId));
        },

        /**
         * Removes the desktop icon for the given program from the DOM and
         * deregisters it from the internal icon list. Future calls to
         * {@link update} and {@link orderBy} will not include it.
         *
         * @memberof app.desktop.icon
         * @param {string} programId - Unique program identifier.
         * @returns {void}
         *
         * @example
         * app.desktop.icon.remove("notepad");
         */
        remove: function (programId) {
            $(`.desktop-icon[data-program="${programId}"]`).remove();
            _icons = _icons.filter(id => id !== programId);
            _gridItems.delete(programId);
            _removeFsMirror(programId);
        },

        /**
         * Renders a real desktop icon for a filesystem entry (folder or
         * file) that lives directly under `/Desktop`. Unlike program
         * shortcuts, these are backed by `app.explorer._fs` — double-click
         * opens the folder in Explorer (or the file with its registered
         * handler), and the icon disappears again once the entry is gone
         * from the filesystem (see {@link refreshFs}).
         *
         * @memberof app.desktop.icon
         * @param {string} path - Absolute path, e.g. `/Desktop/My folder`.
         * @param {number} [staggerIndex] - Same batch-fade parameter as
         *   add() — see its JSDoc.
         * @returns {void}
         */
        addFs: function (path, staggerIndex) {
            if (!_ready) return; // icons.css not loaded yet — see refreshFs
            const entry = app.explorer?._getNode?.(path);
            if (!entry) return;
            const id = 'fs:' + path;
            if (document.querySelector(`.desktop-icon[data-icon-id="${_escAttr(id)}"]`)) return;

            const container = _getContainer();
            const name = path.split('/').filter(Boolean).pop() || path;

            const el = document.createElement('div');
            el.className = 'desktop-icon';
            el.dataset.iconId = id;
            el.dataset.kind = 'fs';
            el.dataset.fspath = path;
            el.dataset.tooltipFollow = '1';
            el.title = name;
            el.innerHTML = `
                ${_fsIconHTML(entry)}
                <span class="desktop-icon-label">${app.util.escapeHtml(name)}</span>
            `;
            // Same fade-in as add() (program icons) — see its comment.
            const animated = typeof staggerIndex === 'number';
            if (animated) {
                el.style.setProperty('--icon-fade-delay', `${staggerIndex * 0.175}s`);
                el.classList.add('fade-hidden');
            }
            container.appendChild(el);
            if (animated) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    el.classList.remove('fade-hidden');
                    el.classList.add('fade-in');
                }));
                el.addEventListener('transitionend', function _h(e) {
                    if (e.propertyName !== 'opacity') return;
                    el.removeEventListener('transitionend', _h);
                    el.classList.remove('fade-in', 'fade-hidden');
                });
            }

            if (!_fsIcons.includes(path)) _fsIcons.push(path);

            if (!_gridItems.has(id)) {
                const pos = _gFirstFree(1, 1);
                _gridItems.set(id, { col: pos.col, row: pos.row, w: 1, h: 1, el: null, userCol: pos.col, userRow: pos.row });
            }
            const g = _gridItems.get(id);
            const { x, y } = _gToPixel(g.col, g.row);
            el.style.position = 'absolute';
            el.style.left  = x + 'px';
            el.style.top   = y + 'px';
            el.style.width  = _GCW + 'px';
            el.style.height = _GCH + 'px';

            this.bind(id);
        },

        /**
         * Removes the desktop icon for a filesystem path from the DOM and
         * deregisters it. Called by {@link refreshFs} when an entry is no
         * longer under `/Desktop`.
         *
         * @memberof app.desktop.icon
         * @param {string} path
         * @returns {void}
         */
        removeFs: function (path) {
            const id = 'fs:' + path;
            $(`.desktop-icon[data-icon-id="${_escAttr(id)}"]`).remove();
            _fsIcons = _fsIcons.filter(p => p !== path);
            _gridItems.delete(id);
        },

        /**
         * Resyncs the real desktop icons against `/Desktop`'s current
         * children in `app.explorer._fs` — adds icons for new entries,
         * removes icons for entries that are gone (deleted, moved, or
         * renamed away). Cheap no-op diff when nothing changed.
         *
         * Called automatically after every fs-mutating Explorer operation
         * (see `_explorerUpdateAll` in explorer/setup.js) and once the
         * filesystem finishes its initial load.
         *
         * @memberof app.desktop.icon
         * @returns {void}
         */
        refreshFs: function () {
            if (!_ready) return; // icons.css not loaded yet — init() re-syncs once it is
            const desktopNode = app.explorer?._getNode?.('/Desktop');
            if (!desktopNode?.children) return;
            const currentPaths = Object.entries(desktopNode.children)
                .filter(([, c]) => !c.autoDesktopIcon)
                .map(([name]) => '/Desktop/' + name);
            const currentSet = new Set(currentPaths);

            [..._fsIcons].forEach(p => { if (!currentSet.has(p)) this.removeFs(p); });
            currentPaths.forEach(p => { if (!_fsIcons.includes(p)) this.addFs(p); });
        },

        /**
         * Places a placeholder icon with an inline, editable name field —
         * the same "type the name, Enter to create, Escape to cancel" UX
         * Explorer's own grid view uses — instead of a modal prompt.
         * Committing creates the real folder/file via `app.explorer`, which
         * triggers {@link refreshFs} and replaces the placeholder with the
         * real icon in the same grid cell.
         *
         * @memberof app.desktop.icon
         * @param {"folder"|"file"} kind
         * @param {string} [ext="txt"] - Extension to use when `kind==="file"`.
         * @returns {void}
         */
        startInlineNew: function (kind, ext = 'txt') {
            if (document.querySelector('.desktop-icon-new-input')) return;

            const container = _getContainer();
            const pos = _gFirstFree(1, 1);
            const { x, y } = _gToPixel(pos.col, pos.row);

            const el = document.createElement('div');
            el.className = 'desktop-icon';
            el.style.position = 'absolute';
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
            el.style.width  = _GCW + 'px';
            el.style.height = _GCH + 'px';
            el.innerHTML = kind === 'folder'
                ? _fsIconHTML({ type: 'folder' })
                : _fsIconHTML({ type: 'file', ext });
            container.appendChild(el);

            const defaultName = kind === 'folder' ? _('New Folder') : `${_('New file')}.${ext}`;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultName;
            input.className = 'desktop-icon-rename-input desktop-icon-new-input';
            input.style.cssText = 'background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);color:#fff;padding:1px 3px;border-radius:3px;font-size:11px;width:100%;text-align:center;outline:none;margin-top:2px;';
            el.appendChild(input);

            let cancelled = false;
            setTimeout(() => {
                input.focus();
                if (kind === 'folder') {
                    input.setSelectionRange(0, input.value.length);
                } else {
                    const dotIdx = input.value.lastIndexOf('.');
                    input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
                }
                requestAnimationFrame(() => app.ui.caret?.position?.update?.(input));
            }, 30);

            const commit = () => {
                if (cancelled) return;
                app.ui.caret?.hidden?.();
                el.remove();
                let name = input.value.trim().replace(/\//g, '');
                if (!name) return;
                if (kind === 'folder') {
                    app.explorer.newFolder('/Desktop/' + name, 'desktop');
                } else {
                    if (!name.toLowerCase().endsWith('.' + ext)) name = name.replace(/\.[^.]*$/, '') + '.' + ext;
                    app.explorer.newFile('/Desktop/' + name);
                }
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelled = true;
                    app.ui.caret?.hidden?.();
                    el.remove();
                }
            });
        },

        /**
         * Builds the right-click context menu for a filesystem-backed
         * desktop icon (Open, Rename, Cut, Copy, Delete, Properties) — a
         * fixed set, unlike {@link contextMenu} which is extensible for
         * program shortcuts.
         *
         * @memberof app.desktop.icon
         * @param {string} path
         * @returns {Object[]}
         */
        _buildFsContextMenu: function (path) {
            const selectedFsPaths = () => {
                const targets = [..._selected].filter(e => e.dataset.kind === 'fs');
                return targets.length > 0 ? targets.map(e => e.dataset.fspath) : [path];
            };

            return app.explorer.buildContextMenu(selectedFsPaths(), {
                clickedPath: path,
                onRename(renamePath) {
                    const el = document.querySelector(`.desktop-icon[data-icon-id="${_escAttr('fs:' + renamePath)}"]`);
                    const label = el?.querySelector('.desktop-icon-label');
                    if (!label) return;
                    const original = label.textContent;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = original;
                    input.className = 'desktop-icon-rename-input';
                    input.style.cssText = 'background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);color:#fff;padding:1px 3px;border-radius:3px;font-size:11px;width:100%;text-align:center;outline:none;';
                    label.replaceWith(input);
                    setTimeout(() => {
                        input.focus();
                        input.setSelectionRange(0, input.value.length);
                        requestAnimationFrame(() => app.ui.caret.position.update(input));
                    }, 50);
                    const commit = () => {
                        app.ui.caret?.hidden?.();
                        const newName = input.value.trim();
                        if (newName && newName !== original) app.explorer.rename(renamePath, newName);
                        else { const span = document.createElement('span'); span.className = 'desktop-icon-label'; span.textContent = original; input.replaceWith(span); }
                    };
                    input.addEventListener('blur', commit);
                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                        else if (e.key === 'Escape') { input.value = original; input.blur(); }
                    });
                }
            });
        },

        /**
         * Clears all rendered icons and re-renders the full list from the
         * internal `_icons`/`_fsIcons` arrays.
         *
         * Removes icons from both the flex container and any that were
         * previously dragged out to a free position on `<body>`. Existing
         * selection state is cleared before re-rendering.
         *
         * A full re-render like this (also what orderBy() ultimately calls)
         * is a batch, same as boot's init() — every icon gets the same
         * staggered fade-in treatment, continuing the index across program
         * and fs icons so the whole desktop reads as one sequence rather
         * than two separately-numbered ones.
         *
         * @memberof app.desktop.icon
         * @returns {void}
         */
        update: function () {
            _clearSelection();
            const container = _getContainer();
            container.innerHTML = "";

            $("body > .desktop-icon").remove();

            let _staggerIndex = 0;

            const snapshot = [..._icons];
            _icons = [];
            snapshot.forEach(id => this.add(id, _staggerIndex++));

            const fsSnapshot = [..._fsIcons];
            _fsIcons = [];
            fsSnapshot.forEach(p => this.addFs(p, _staggerIndex++));
        },

        /**
         * Sorts the desktop icons by program name and re-renders them.
         *
         * Uses the Swedish locale (`"sv"`) for locale-aware sorting so that
         * Å, Ä, Ö sort after Z as expected.
         *
         * @memberof app.desktop.icon
         * @param {"asc"|"desc"} [direction="asc"]
         *   Sort direction.
         *   - `"asc"`  — A → Ö (default).
         *   - `"desc"` — Ö → A.
         * @returns {void}
         *
         * @example
         * app.desktop.icon.orderBy("asc");
         * app.desktop.icon.orderBy("desc");
         */
        orderBy: function (direction = "asc") {
            _icons.sort((a, b) => {
                const nameA = app.program.getInfo(a)?.name ?? a;
                const nameB = app.program.getInfo(b)?.name ?? b;
                const cmp = nameA.localeCompare(nameB, "sv", { sensitivity: "base" });
                return direction === "desc" ? -cmp : cmp;
            });

            this.update();
        },

        /**
         * Attaches all mouse, touch, drag, and context-menu event handlers to
         * every icon element that matches `programId`.
         *
         * Drag behaviour:
         * - **Single icon selected** — jQuery UI `draggable`. On drop inside
         *   `.desktop-icons` the icon rejoins the flex grid; outside it becomes
         *   `position:absolute` on `<body>`.
         * - **Multiple icons selected** — fully manual drag. On drag-start all
         *   selected icons are pinned to `<body>` as `position:absolute` so they
         *   share the same coordinate system. jQuery UI is cancelled via
         *   `return false` from its `start` callback.
         *
         * Context menu is registered via {@link app.ui.contextMenu} and
         * delegates item building to {@link app.desktop.icon.contextMenu._build}.
         * A 1-second long-press (mouse or touch) also triggers the context menu.
         *
         * @memberof app.desktop.icon
         * @param {string} programId - Unique program identifier.
         * @returns {void}
         */
        bind: function (id) {
            $(`.desktop-icon[data-icon-id="${_escAttr(id)}"]`).each(function () {
                const $el = $(this);
                const el  = this;
                const kind = el.dataset.kind || 'program';

                $el.on("mousedown", function (e) {
                    if (e.button !== 0) return;

                    const r = el.getBoundingClientRect();
                    _mouseOffsetX = e.clientX - r.left;
                    _mouseOffsetY = e.clientY - r.top;

                    if (e.shiftKey && _shiftAnchor) {
                        // Range select from anchor to this icon
                        const all  = Array.from(document.querySelectorAll('.desktop-icon'));
                        const ai   = all.indexOf(_shiftAnchor);
                        const ci   = all.indexOf(el);
                        if (ai !== -1 && ci !== -1) {
                            _clearSelection();
                            all.slice(Math.min(ai, ci), Math.max(ai, ci) + 1).forEach(i => _selectIcon(i));
                        }
                    } else if (e.ctrlKey || e.metaKey) {
                        _toggleIcon(el);
                        _shiftAnchor = el;
                    } else if (!_selected.has(el)) {
                        _selectIcon(el);
                        _shiftAnchor = el;
                    }

                    if (_selected.size > 1) {
                        const startX = e.clientX;
                        const startY = e.clientY;

                        const snaps = [];
                        _selected.forEach(sel => snaps.push({
                            el:   sel,
                            $el:  $(sel),
                            rect: sel.getBoundingClientRect(),
                            w:    sel.offsetWidth
                        }));
                        const primary = snaps.find(s => s.el === el);
                        let dragging = false;

                        /**
                         * Moves all selected icons in lock-step with the pointer.
                         * @param {MouseEvent} eMove
                         */
                        function onMove(eMove) {
                            if (!dragging) {
                                if (Math.abs(eMove.clientX - startX) < 5 &&
                                    Math.abs(eMove.clientY - startY) < 5) return;
                                dragging = _multiDragActive = true;
                                document.body.style.cursor = 'grabbing';
                                snaps.forEach(({ $el: $s, rect, w }) => {
                                    if (!$s.parent().is("body")) {
                                        $s.detach().appendTo("body").css({
                                            position: "absolute",
                                            left: rect.left + 'px',
                                            top:  rect.top  + 'px',
                                            margin: 0,
                                            width: w + 'px',
                                            transform: '',
                                            zIndex: 99999,
                                            pointerEvents: 'none'
                                        });
                                    }
                                });
                                snaps.forEach(({ el: s }) => {
                                    if (s.dataset.kind === 'fs') s.dataset.path = s.dataset.fspath;
                                });
                            }
                            const baseX = eMove.clientX - _mouseOffsetX;
                            const baseY = eMove.clientY - _mouseOffsetY;
                            snaps.forEach(({ $el: $s, rect }) => {
                                $s.css({
                                    left: baseX + (rect.left - primary.rect.left),
                                    top:  baseY + (rect.top  - primary.rect.top)
                                });
                            });
                        }

                        /**
                         * Ends the multi-drag and reattaches icons to the grid if
                         * the pointer was released inside `.desktop-icons`.
                         * @param {MouseEvent} eUp
                         */
                        function onUp(eUp) {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup',   onUp);
                            _multiDragActive = false;
                            document.body.style.cursor = '';
                            if (!dragging) return;
                            _lastDragTime = Date.now();

                            const accepted = new Set([..._selected].filter(sel => sel.dataset.dropAccepted));

                            snaps.forEach(({ el: s }) => { if (s.dataset.kind === 'fs') delete s.dataset.path; });
                            _selected.forEach(sel => delete sel.dataset.dropAccepted);

                            const section = document.querySelector('.desktop-icons');
                            const sr      = section ? section.getBoundingClientRect() : null;
                            const inside  = sr &&
                                eUp.clientX >= sr.left && eUp.clientX <= sr.right &&
                                eUp.clientY >= sr.top  && eUp.clientY <= sr.bottom &&
                                !_isOverWindow(eUp);

                            // Compute grid delta from primary icon's drop position
                            let dc = 0, dr = 0;
                            if (inside && sr && primary) {
                                const primaryId   = primary.el.dataset.iconId;
                                const primaryOldG = _gridItems.get(primaryId);
                                if (primaryOldG) {
                                    const localX = (eUp.clientX - _mouseOffsetX) - sr.left;
                                    const localY = (eUp.clientY - _mouseOffsetY) - sr.top;
                                    const newCell = _gFromPixel(localX, localY);
                                    dc = newCell.col - primaryOldG.col;
                                    dr = newCell.row - primaryOldG.row;
                                }
                            }

                            // Snapshot old positions before any writes
                            const oldPositions = new Map();
                            _selected.forEach(sel => {
                                const sid = sel.dataset.iconId;
                                const g = _gridItems.get(sid);
                                if (g) oldPositions.set(sid, { col: g.col, row: g.row, w: g.w, h: g.h });
                            });

                            accepted.forEach(sel => {
                                $(sel).css('display', 'none');
                                setTimeout(() => {
                                    if (!document.body.contains(sel)) return; // moved for real — removeFs() already cleaned it up
                                    $(sel).css('display', '').detach().appendTo(section || document.body).css({ zIndex: '', pointerEvents: '' });
                                    const sid = sel.dataset.iconId;
                                    const oldG = oldPositions.get(sid);
                                    if (oldG) _gApply(sid, oldG.col, oldG.row, oldG.w, oldG.h, false);
                                }, 3000);
                            });

                            _selected.forEach(sel => {
                                if (accepted.has(sel)) return;
                                $(sel).detach().appendTo(section || document.body).css({ zIndex: '', pointerEvents: '' });
                            });

                            // Apply updated (or restored) grid positions
                            _selected.forEach(sel => {
                                if (accepted.has(sel)) return;
                                const sid = sel.dataset.iconId;
                                const oldG = oldPositions.get(sid);
                                if (!oldG) return;
                                const nc = Math.max(0, Math.min(_gCols() - oldG.w, oldG.col + dc));
                                const nr = Math.max(0, Math.min(_gRows() - oldG.h, oldG.row + dr));
                                _gApply(sid, nc, nr, oldG.w, oldG.h, false);
                            });
                        }

                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup',   onUp);
                    }
                });

                // Collapse multi-selection to this icon on a plain click (no drag)
                $el.on("mouseup", function (e) {
                    if (e.button !== 0) return;
                    if (_multiDragActive) return;
                    if (Date.now() - _lastDragTime < 50) return;
                    if (!e.ctrlKey && !e.metaKey && _selected.size > 1 && _selected.has(el)) {
                        _selectIcon(el);
                    }
                });

                // Double-click launches the program, opens the folder in
                // Explorer, opens the file with its registered handler, or
                // (for a shortcut) launches its target via app.shortcut.launch.
                $el.on("dblclick", function () {
                    if (Date.now() - _lastDragTime < 300) return;
                    if (kind === 'fs') {
                        const path  = el.dataset.fspath;
                        const entry = app.explorer._getNode(path);
                        if (entry?.type === 'folder') app.explorer.open(path);
                        else if (entry?.type === 'shortcut') app.shortcut.launch(path);
                        else app.explorer.openFile(path, entry);
                    } else {
                        app.program.open(id);
                    }
                });

                // Right-click selects the icon then opens the context menu
                el.addEventListener('contextmenu', () => {
                    if (!_selected.has(el)) _selectIcon(el);
                });
                app.ui.contextMenu(el, {
                    callback: () => kind === 'fs'
                        ? app.desktop.icon._buildFsContextMenu(el.dataset.fspath)
                        : app.desktop.icon.contextMenu._build(id)
                });

                // 1-second long-press triggers the context menu (mouse)
                let _pressTimer = null;
                el.addEventListener('mousedown', function (e) {
                    if (e.button !== 0) return;
                    const sx = e.clientX, sy = e.clientY;
                    _pressTimer = setTimeout(() => {
                        if (!_selected.has(el)) _selectIcon(el);
                        el.dispatchEvent(new MouseEvent('contextmenu', {
                            clientX: sx, clientY: sy, bubbles: true, cancelable: true
                        }));
                    }, 1000);
                    const onMove = (me) => {
                        if (Math.abs(me.clientX - sx) > 6 || Math.abs(me.clientY - sy) > 6) {
                            clearTimeout(_pressTimer);
                            document.removeEventListener('mousemove', onMove);
                        }
                    };
                    document.addEventListener('mousemove', onMove);
                    el.addEventListener('mouseup', () => {
                        clearTimeout(_pressTimer);
                        document.removeEventListener('mousemove', onMove);
                    }, { once: true });
                });

                // 1-second long-press triggers the context menu (touch)
                el.addEventListener('touchstart', function (e) {
                    const t = e.touches[0];
                    const sx = t.clientX, sy = t.clientY;
                    _pressTimer = setTimeout(() => {
                        if (!_selected.has(el)) _selectIcon(el);
                        el.dispatchEvent(new MouseEvent('contextmenu', {
                            clientX: sx, clientY: sy, bubbles: true, cancelable: true
                        }));
                    }, 1000);
                    const onMove = (te) => {
                        const tt = te.touches[0];
                        if (Math.abs(tt.clientX - sx) > 6 || Math.abs(tt.clientY - sy) > 6) {
                            clearTimeout(_pressTimer);
                            el.removeEventListener('touchmove', onMove);
                        }
                    };
                    el.addEventListener('touchmove',   onMove,                                               { passive: true });
                    el.addEventListener('touchend',    () => { clearTimeout(_pressTimer); el.removeEventListener('touchmove', onMove); }, { once: true });
                    el.addEventListener('touchcancel', () => { clearTimeout(_pressTimer); el.removeEventListener('touchmove', onMove); }, { once: true });
                }, { passive: true });

                $el.draggable({
                    containment: '.desktop-icons',
                    cursor: 'grabbing',
                    scroll: false,
                    start: function (e, ui) {
                        if (_selected.size > 1) return false;
                        if (!_selected.has(el)) _selectIcon(el);
                        const g = _gridItems.get(id);
                        if (g) _showDropIndicator(g.col, g.row, 1, 1);
                        if (kind === 'fs') el.dataset.path = el.dataset.fspath;
                        _getContainer().classList.add('dragging-icon');
                        el.style.zIndex = '99999';
                        el.style.pointerEvents = 'none';
                    },
                    drag: function (e, ui) {
                        if (_isOverWindow(e)) {
                            _hideDropIndicator();
                            return;
                        }
                        const { col, row } = _gFromPixel(ui.position.left, ui.position.top);
                        const cc = Math.max(0, Math.min(_gCols() - 1, col));
                        const rr = Math.max(0, Math.min(_gRows() - 1, row));
                        _showDropIndicator(cc, rr, 1, 1);
                    },
                    stop: function (e, ui) {
                        const droppedOnWindow = _isOverWindow(e);
                        _hideDropIndicator();
                        _lastDragTime = Date.now();
                        document.body.style.cursor = '';
                        _getContainer().classList.remove('dragging-icon');
                        el.style.zIndex = '';
                        el.style.pointerEvents = '';
                        if (kind === 'fs') delete el.dataset.path;
                        if (droppedOnWindow) {
                            if (el.dataset.dropAccepted) {
                                delete el.dataset.dropAccepted;
                                el.style.display = 'none';
                                setTimeout(() => {
                                    if (!document.body.contains(el)) return; // moved for real — removeFs() already cleaned it up
                                    el.style.display = '';
                                    const g = _gridItems.get(id);
                                    if (g) { const p = _gToPixel(g.col, g.row); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
                                }, 3000);
                                return;
                            }
                            const g = _gridItems.get(id);
                            if (g) { const p = _gToPixel(g.col, g.row); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
                            return;
                        }
                        const { col, row } = _gFromPixel(ui.position.left, ui.position.top);
                        const cc = Math.max(0, Math.min(_gCols() - 1, col));
                        const rr = Math.max(0, Math.min(_gRows() - 1, row));
                        const occupied = _gOccupied(cc, rr, 1, 1, id);
                        if (!occupied) {
                            _gApply(id, cc, rr, 1, 1, false, true);
                        } else {
                            const isIcon = !!document.querySelector(`.desktop-icon[data-icon-id="${_escAttr(occupied)}"]`);
                            if (isIcon) {
                                const myOld = _gridItems.get(id);
                                const otherG = _gridItems.get(occupied);
                                if (myOld && otherG) {
                                    _gApply(occupied, myOld.col, myOld.row, otherG.w, otherG.h, true, false);
                                    _gApply(id, cc, rr, 1, 1, false, true);
                                } else {
                                    const g = _gridItems.get(id);
                                    if (g) { const p = _gToPixel(g.col, g.row); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
                                }
                            } else {
                                // Widget or non-swappable — snap back without touching their position
                                const g = _gridItems.get(id);
                                if (g) { const p = _gToPixel(g.col, g.row); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
                            }
                        }
                    }
                });

            });
        },

        /**
         * Context menu registry for desktop icon right-click menus.
         *
         * Each entry holds a sort value and a `val` that is either a static
         * menu-item object or a function `(programId) => item|null`. Dynamic
         * entries (functions) are evaluated at right-click time so they can
         * reflect current state (selection, clipboard, etc.).
         *
         * @memberof app.desktop.icon
         * @namespace app.desktop.icon.contextMenu
         *
         * @example
         * // Static item
         * app.desktop.icon.contextMenu.add({ title: "Open", callback() { ... } }, 0);
         *
         * // Dynamic item — visible only when a condition is met
         * app.desktop.icon.contextMenu.add(pid => {
         *   if (!someCondition) return null;
         *   return { title: "Do something", callback() { ... } };
         * }, 10);
         */
        contextMenu: {

            /**
             * Internal sorted array of registered entries.
             * Each entry has `{ sort: number, val: Object|Function }`.
             * @type {Array<{sort: number, val: Object|Function}>}
             */
            _entries: [],

            /**
             * Registers a new context menu item (or dynamic item factory).
             *
             * @param {Object|Function} val
             *   A menu-item object `{ title, icon, callback }`, or a function
             *   `(programId: string) => item|null` that is called at open-time.
             *   Return `null` from the function to hide the item conditionally.
             * @param {number} [sort=0] - Sort order (lower = higher in the menu).
             * @returns {void}
             */
            add(val, sort) {
                this._entries.push({ sort: sort ?? 0, val });
                this._entries.sort((a, b) => a.sort - b.sort);
            },

            /**
             * Evaluates all registered entries for the given program and returns
             * a flat array of resolved menu-item objects, with `null` results
             * filtered out.
             *
             * Called by {@link app.ui.contextMenu} each time the menu opens.
             *
             * @param {string} programId - The program ID of the right-clicked icon.
             * @returns {Object[]} Resolved, non-null menu items.
             */
            _build(programId) {
                return this._entries
                    .map(e => typeof e.val === 'function' ? e.val(programId) : e.val)
                    .filter(Boolean);
            },

            submenu: {
                new: {
                    _entries: [],
                    add({ icon = '', text = '', alt = '', fn } = {}) {
                        this._entries.push({ icon, title: text, alt, callback: fn });
                    },
                    _build() { return [...this._entries]; }
                }
            }
        },

        /**
         * Initialises the desktop icon grid.
         *
         * 1. Fetches and injects the icon stylesheet via {@link app.addCSS}
         *    (awaited so the browser has styles before icons are visible).
         * 2. Writes icon dimensions to `app.config`.
         * 3. Iterates all registered programs and calls {@link add} for those
         *    with `desktop: true`.
         * 4. Registers the built-in context menu items (Open, Copy, Cut, Paste,
         *    Properties, Remove from desktop).
         * 5. Registers Copy/Cut/Paste into the desktop background context menu
         *    (`app.desktop.contextMenu`) so they appear on empty-space right-click
         *    only when icons are selected.
         * 6. Enables rubber-band box-select on the desktop background.
         * 7. Clears selection when clicking empty desktop space.
         *
         * Should be called once during the OS startup sequence via
         * `["desktop.icon.init"]` in the `start` array.
         *
         * @memberof app.desktop.icon
         * @async
         * @returns {Promise<void>}
         *
         * @example
         * // In index.html start sequence:
         * ["desktop.icon.init"]
         */
        init: async function () {
            await app.addCSS("desktop-icons", "sandstorm/components/desktop/icons.css", true);
            _ready = true; // icons.css is now in the DOM — addFs/refreshFs may render
            app.config.set('desktop', 'iconWidth', 40);
            app.config.set('desktop', 'iconHeight', 40);

            const programs = app.program.getAll();
            let _bootIconIndex = 0;
            Object.entries(programs).forEach(([id, data]) => {
                if (data.desktop) {
                    this.add(id, _bootIconIndex++);
                }
            });

            // ── Built-in icon context menu items ──────────────────────────────

            /**
             * "Open" — launches the program.
             * @sort 0
             */
            this.contextMenu.add(pid => ({
                title: _('Open'),
                icon:  '<svg width="14" height="14"><use href="#ic-apps"></use></svg>',
                callback() {
                    app.program.open(pid);
                }
            }), 0);

            /**
             * "Copy" — copies the icon path(s) to the explorer clipboard.
             * Targets the current selection if any icons are selected;
             * otherwise targets just the right-clicked icon.
             * @sort 10
             */
            this.contextMenu.add(pid => {
                const targets = _selected.size > 0
                    ? [..._selected].map(el => el.dataset.program).filter(Boolean)
                    : [pid];
                const paths = targets.map(id => '/programs/' + id);
                return {
                    title: _('Copy'),
                    icon:  _copyIcon,
                    callback() {
                        document.querySelectorAll('.desktop-icon').forEach(el => { el.style.opacity = ''; });
                        app.dev.log(`Copy ${paths.length} icon(s): ${paths.join(', ')}`, 'Desktop Icons');
                        app.explorer?.copy(paths);
                    }
                };
            }, 10);

            /**
             * "Cut" — cuts the icon path(s) to the explorer clipboard and dims
             * the affected icons to 35% opacity as a visual indicator.
             * @sort 20
             */
            this.contextMenu.add(pid => {
                const targets = _selected.size > 0
                    ? [..._selected].map(el => el.dataset.program).filter(Boolean)
                    : [pid];
                const paths = targets.map(id => '/programs/' + id);
                return {
                    title: _('Cut'),
                    icon:  _cutIcon,
                    callback() {
                        document.querySelectorAll('.desktop-icon').forEach(el => { el.style.opacity = ''; });
                        app.dev.log(`Cut ${paths.length} icon(s): ${paths.join(', ')}`, 'Desktop Icons');
                        app.explorer?.cut(paths);
                        targets.forEach(id => {
                            const el = document.querySelector(`.desktop-icon[data-program="${id}"]`);
                            if (el) el.style.opacity = '0.35';
                        });
                    }
                };
            }, 20);

            /**
             * "Copy path" — writes the icon's own synthesized virtual path
             * (the same "/programs/<id>" convention Copy/Cut already use)
             * straight to the system clipboard, verbatim — for pasting into
             * code/other tools, not the in-app explorer clipboard.
             * @sort 15
             */
            this.contextMenu.add(pid => {
                const targets = _selected.size > 0
                    ? [..._selected].map(el => el.dataset.program).filter(Boolean)
                    : [pid];
                const paths = targets.map(id => '/programs/' + id);
                return {
                    title: _('Copy path'),
                    icon:  _copyIcon,
                    callback() {
                        app.util.copyToClipboard(paths.join('\n'), {
                            successBody: paths.length > 1 ? paths.length + ' ' + _('paths') : paths[0]
                        });
                    }
                };
            }, 15);

            /**
             * "Paste" — only visible when the explorer clipboard is non-empty.
             * Appends "(move)" label when the clipboard mode is `cut`.
             * @sort 30
             */
            this.contextMenu.add(() => {
                const clip = app.explorer?.clipboard;
                if (!clip?.items?.length) return null;
                return {
                    title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
                    icon:  _pasteIcon,
                    callback: _desktopPaste
                };
            }, 30);

            /**
             * "Rename" — inline rename of the icon label.
             * @sort 35
             */
            this.contextMenu.add(pid => ({
                title: _('Rename'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
                callback() {
                    const el = document.querySelector(`.desktop-icon[data-program="${pid}"]`);
                    const label = el?.querySelector('.desktop-icon-label');
                    if (!label) return;
                    const original = label.textContent;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = original;
                    input.className = 'desktop-icon-rename-input';
                    input.style.cssText = 'background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.45);color:#fff;padding:1px 3px;border-radius:3px;font-size:11px;width:100%;text-align:center;outline:none;';
                    label.replaceWith(input);
                    setTimeout(() => {
                        input.focus();
                        input.setSelectionRange(0, input.value.length);
                        requestAnimationFrame(() => app.ui.caret.position.update(input));
                    }, 50);
                    const commit = () => {
                        app.ui.caret?.hidden?.();
                        const newName = input.value.trim() || original;
                        const span = document.createElement('span');
                        span.className = 'desktop-icon-label';
                        span.title = newName;
                        span.textContent = newName;
                        input.replaceWith(span);
                        const prog = app.program.getInfo(pid);
                        if (prog && newName !== original) {
                            prog.name = newName;
                            app.dev.log(`Rename icon: "${original}" → "${newName}" (${pid})`, 'Desktop Icons');
                            app.api.post('/api/icons/rename', { programId: pid, oldName: original, newName })
                                ?.success?.(() => app.dev.log(`Rename API ok: ${pid}`, 'Desktop Icons'))
                                ?.fail?.(() => app.dev.warn(`Rename API failed: ${pid}`, 'Desktop Icons'));
                        } else if (prog) {
                            prog.name = newName;
                        }
                    };
                    input.addEventListener('blur', commit);
                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                        else if (e.key === 'Escape') { input.value = original; input.blur(); }
                    });
                }
            }), 35);

            /**
             * "Properties" — shows a modal alert with name, version, and
             * description of the program.
             * @sort 40
             */
            this.contextMenu.add(pid => {
                const p = app.program.getInfo(pid);
                return {
                    title: _('Properties'),
                    icon:  '<svg width="14" height="14"><use href="#ic-info"></use></svg>',
                    callback() {
                        app.ui.alert({
                            title:   p?.name || pid,
                            message: `${_('Version')}: ${p?.version || '—'}\n${_('Description')}: ${p?.description || '—'}`,
                            confirm: _('OK')
                        });
                    }
                };
            }, 40);

            /**
             * "Remove from desktop" — calls {@link app.desktop.icon.remove}.
             * @sort 50
             */
            this.contextMenu.add(pid => ({
                title: _('Remove from desktop'),
                icon:  '<svg width="14" height="14"><use href="#ic-bts-close"></use></svg>',
                callback() { app.desktop.icon.remove(pid); }
            }), 50);

            /**
             * "Select All" — selects every desktop icon.
             * @sort 55
             */
            this.contextMenu.add(() => ({
                title: _('Select All'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/></svg>',
                callback() {
                    document.querySelectorAll('.desktop-icon').forEach(el => {
                        _selected.add(el);
                        el.classList.add('selected');
                    });
                    app.dev.log(`Select All icons (${_selected.size})`, 'Desktop Icons');
                }
            }), 55);

            /**
             * "Deselect All" — clears the desktop icon selection.
             * @sort 56
             */
            this.contextMenu.add(() => {
                if (!_selected.size) return null;
                return {
                    title: _('Deselect All'),
                    icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>',
                    callback() { _clearSelection(); }
                };
            }, 56);

            /**
             * "Sort by" — submenu with Name, Size, Type, Last Modified.
             * @sort 57
             */
            this.contextMenu.add(() => {
                const fields = [
                    { key: 'name',     label: _('Name'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"/></svg>' },
                    { key: 'size',     label: _('Size'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M21 6.5l-4-4-4 4 1.41 1.41L16 6.34V10h2V6.34l1.59 1.57L21 6.5zm-9 11l-1.59-1.57L8.5 17.5l-1.41-1.41L11 12.34V10H9v2.34l-1.59-1.57L6 12.5l4 4 4-4-1.41-1.41z"/></svg>' },
                    { key: 'type',     label: _('Type'),          icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.9 2 2 2zm-2-12h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9C7.9 3 7 3.9 7 5v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H9V5h10v14zm-8-2h2v-2h-2v2zm-4 0h2v-2H7v2zm8 0h2v-2h-2v2z"/></svg>' },
                    { key: 'modified', label: _('Last modified'), icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>' },
                ];
                return {
                    title: _('Sort by'),
                    icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>',
                    submenu: fields.map(({ key, label, icon: fIcon }) => ({
                        icon:  fIcon,
                        title: label + (_desktopSortField === key ? (_desktopSortDir === 'asc' ? ' ▲' : ' ▼') : ''),
                        alt:   '',
                        callback() {
                            if (_desktopSortField === key) {
                                _desktopSortDir = _desktopSortDir === 'asc' ? 'desc' : 'asc';
                            } else {
                                _desktopSortField = key;
                                _desktopSortDir = 'asc';
                            }
                            const dir = _desktopSortDir;
                            _icons.sort((a, b) => {
                                const pa = app.program.getInfo(a);
                                const pb = app.program.getInfo(b);
                                let va, vb;
                                if (key === 'type') {
                                    va = pa?.icontype ?? '';
                                    vb = pb?.icontype ?? '';
                                } else {
                                    va = pa?.name ?? a;
                                    vb = pb?.name ?? b;
                                }
                                const cmp = String(va).localeCompare(String(vb), 'sv', { sensitivity: 'base' });
                                return dir === 'desc' ? -cmp : cmp;
                            });
                            app.desktop.icon.update();
                        }
                    }))
                };
            }, 57);

            /**
             * "New" — extensible submenu. Register items via
             * app.desktop.icons.contextMenu.submenu.new.add({icon,text,alt,fn}).
             * Hidden when no entries are registered.
             * @sort 58
             */
            this.contextMenu.add(() => {
                const entries = app.desktop.icon.contextMenu.submenu.new._build();
                if (!entries.length) return null;
                return {
                    title: _('New'),
                    icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>',
                    submenu: entries
                };
            }, 58);

            // ── Desktop background context menu items (Copy / Cut / Paste) ────

            /**
             * Desktop background "Select All" — selects every desktop icon.
             * @sort -5
             */
            app.desktop.buildContextMenuList(-5, "body", () => ({
                title: _('Select All'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/></svg>',
                callback() {
                    document.querySelectorAll('.desktop-icon').forEach(el => {
                        _selected.add(el);
                        el.classList.add('selected');
                    });
                    app.dev.log(`Select All icons via background menu (${_selected.size})`, 'Desktop Icons');
                }
            }));

            /**
             * Desktop background "Deselect All" — always visible.
             * @sort -4
             */
            app.desktop.buildContextMenuList(-4, "body", () => ({
                title: _('Deselect All'),
                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>',
                callback() { _clearSelection(); }
            }));

            /**
             * Desktop background "Copy" — visible only when at least one icon
             * is selected.
             * @sort -3
             */
            app.desktop.buildContextMenuList(-3, "body", () => {
                if (!_selected.size) return null;
                const paths = [..._selected].map(el => el.dataset.kind === 'fs' ? el.dataset.fspath : '/programs/' + el.dataset.program).filter(Boolean);
                return {
                    title: _('Copy'),
                    icon:  _copyIcon,
                    callback() {
                        document.querySelectorAll('.desktop-icon').forEach(el => { el.style.opacity = ''; });
                        app.explorer?.copy(paths);
                    }
                };
            });

            /**
             * Desktop background "Cut" — visible only when at least one icon
             * is selected. Dims the affected icons to 35% opacity.
             * @sort -2
             */
            app.desktop.buildContextMenuList(-2, "body", () => {
                if (!_selected.size) return null;
                const targetIds = [..._selected].map(el => el.dataset.iconId).filter(Boolean);
                const paths     = [..._selected].map(el => el.dataset.kind === 'fs' ? el.dataset.fspath : '/programs/' + el.dataset.program).filter(Boolean);
                return {
                    title: _('Cut'),
                    icon:  _cutIcon,
                    callback() {
                        document.querySelectorAll('.desktop-icon').forEach(el => { el.style.opacity = ''; });
                        app.explorer?.cut(paths);
                        targetIds.forEach(iid => {
                            const el = document.querySelector(`.desktop-icon[data-icon-id="${_escAttr(iid)}"]`);
                            if (el) el.style.opacity = '0.35';
                        });
                    }
                };
            });

            /**
             * Desktop background "Paste" — visible only when the explorer
             * clipboard contains items.
             * @sort -1
             */
            app.desktop.buildContextMenuList(-1, "body", () => {
                const clip = app.explorer?.clipboard;
                if (!clip?.items?.length) return null;
                return {
                    title: _('Paste') + (clip.mode === 'cut' ? ' (' + _('move') + ')' : ''),
                    icon:  _pasteIcon,
                    callback: _desktopPaste
                };
            });

            // ── Rubber-band box-select on the desktop background ──────────────
            app.ui.boxSelect(
                document.body,
                '.desktop-icon',
                (selected, additive) => {
                    if (!additive) _clearSelection();
                    selected.forEach(el => {
                        _selected.add(el);
                        el.classList.add('selected');
                    });
                    if (selected.length > 0) _shiftAnchor = selected[0];
                },
                live => {
                    document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selecting'));
                    live.forEach(el => el.classList.add('selecting'));
                }
            );

            // Clear selection when clicking empty desktop space
            document.body.addEventListener('mousedown', e => {
                if (e.button !== 0) return; // right-click must not clear selection before menu opens
                if (e.target === document.body || e.target.classList.contains('blur-container')) {
                    if (!e.ctrlKey && !e.metaKey) _clearSelection();
                }
            });

            // Resize: re-clamp and scroll
            const _ro = typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => { clearTimeout(_resizeTimer); _resizeTimer = setTimeout(_gResize, 120); })
                : null;
            if (_ro) _ro.observe(_getContainer());
            else window.addEventListener('resize', () => { clearTimeout(_resizeTimer); _resizeTimer = setTimeout(_gResize, 120); });

            // Defensive: render any /Desktop items already available (usually
            // a no-op here — explorer/setup.js hasn't loaded its fs yet at
            // this point in boot — the real sync happens once it does).
            this.refreshFs();

        },

        grid: {
            firstFree(w = 1, h = 1)           { return _gFirstFree(w, h); },
            register(id, col, row, w, h, element) {
                const ex = _gridItems.get(id);
                _gridItems.set(id, { col, row, w, h, userCol: col, userRow: row, el: element !== undefined ? element : (ex ? ex.el : null) });
            },
            unregister(id)                     { _gridItems.delete(id); },
            toPixel(col, row)                  { return _gToPixel(col, row); },
            fromPixel(x, y)                    { return _gFromPixel(x, y); },
            showIndicator(col, row, w, h)      { _showDropIndicator(col, row, w, h); },
            hideIndicator()                    { _hideDropIndicator(); },
            getAt(col, row, w, h, excludeId) {
                const result = [];
                for (const [id, g] of _gridItems) {
                    if (id === excludeId) continue;
                    if (col < g.col + g.w && col + w > g.col && row < g.row + g.h && row + h > g.row)
                        result.push({ id, col: g.col, row: g.row, w: g.w, h: g.h });
                }
                return result;
            },
            applyIcon(id, col, row, w, h, animate) { _gApply(id, col, row, w, h, animate); },
            cellW: _GCW, cellH: _GCH, gap: _GGP, padX: _GPX, padY: _GPY
        }
    };

    // Alias so external code can use app.desktop.icons.contextMenu.submenu.new.add(...)
    app.desktop.icons = app.desktop.icon;

})(window.app = window.app || {});
