/**
 * @file fotoviewer/fotoviewer.js
 * @description Photo Viewer program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program (directly or via a double-clicked image file in Explorer) —
 * registration (icon + metadata + openWith) lives in `setup.js`.
 * Exports `start(os, win)` (window creation with image display, zoom, and navigation).
 *
 * @module program/fotoviewer/fotoviewer
 */
import { IMG_EXTS } from './setup.js';

export function start(os) {

    const _initPath  = app.fotoviewer?._pendingPath  || null;
    const _initEntry = app.fotoviewer?._pendingEntry || null;
    if (app.fotoviewer) { app.fotoviewer._pendingPath = null; app.fotoviewer._pendingEntry = null; }
    app.dev.log(`start: initPath="${_initPath}"`, 'Fotoviewer');

    const instanceId    = 'fotoviewer-' + Date.now();
    const _initFilename = _initPath
        ? _('Photo Viewer') + ' — ' + app.util.escapeHtml(_initPath.split('/').pop())
        : _('Photo Viewer');

    os.ui.windowStart('fotoviewer', {
        id:         instanceId,
        title:      _initFilename,
        windowIcon: true,
        resizable:  true,
        width:      '900px',
        height:     '600px',

        body(windowobj) {
            const winId = windowobj?.windowId || instanceId;

            setTimeout(() => {
                const winEl = $(`#${winId}-win`)[0];
                if (!winEl) return;

                const content = winEl.querySelector('.content, .content-wrapper') || winEl;
                content.style.position      = 'relative';
                content.style.display       = 'flex';
                content.style.flexDirection = 'column';
                content.style.margin        = '0';
                content.style.padding       = '0';
                content.style.boxSizing     = 'border-box';
                content.style.background    = '';


                // ── Navigation state ───────────────────────────────────────────
                let _files    = [];
                let _fIndex   = -1;
                let _currentFilename = null;
                let _playing  = false;
                let _playTimer = null;
                let _mHeld = false, _mouseInCanvas = false, _mPanLX = 0, _mPanLY = 0;
                const SLIDE_DELAY = 4000;

                // ── FS helpers ─────────────────────────────────────────────────
                function _fsNode(path) {
                    if (!app.explorer?._fs) return null;
                    if (path === '/') return app.explorer._fs['/'];
                    const parts = path.replace(/^\//, '').split('/');
                    let node = app.explorer._fs['/'];
                    for (const part of parts) {
                        if (!node?.children?.[part]) return null;
                        node = node.children[part];
                    }
                    return node;
                }

                function _loadFolder(folderPath) {
                    const node = _fsNode(folderPath);
                    if (!node?.children) { _files = []; _fIndex = -1; return; }
                    _files = Object.entries(node.children)
                        .filter(([, e]) => e.type === 'file' && IMG_EXTS.has((e.ext || '').toLowerCase()))
                        .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                        .map(([name, entry]) => ({
                            name,
                            path: folderPath === '/' ? '/' + name : folderPath + '/' + name,
                            entry
                        }));
                }

                // ── Inject spinner keyframe once ───────────────────────────────
                if (!$('#fv-spin-kf').length) {
                    const s = document.createElement('style');
                    s.id = 'fv-spin-kf';
                    s.textContent = '@keyframes fv-spin{to{transform:rotate(360deg)}}';
                    document.head.appendChild(s);
                }

                // ── Canvas ─────────────────────────────────────────────────────
                const canvas = document.createElement('div');
                canvas.style.cssText = 'flex:1;min-height:0;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;cursor:default;user-select:none;';

                const img = document.createElement('img');
                img.draggable    = false;
                img.style.cssText = 'pointer-events:none;transform-origin:center center;max-width:none;max-height:none;display:none;flex-shrink:0;';
                canvas.appendChild(img);

                // ── Spinner ────────────────────────────────────────────────────
                const spinner = document.createElement('div');
                spinner.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:20;';
                spinner.innerHTML = '<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.15);border-top-color:#fff;border-radius:50%;animation:fv-spin 0.7s linear infinite;"></div>';

                // ── Empty state ────────────────────────────────────────────────
                const emptyState = document.createElement('div');
                emptyState.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:16px;';

                const _emptyLabel = document.createElement('div');
                _emptyLabel.style.cssText = 'color:rgba(255,255,255,0.35);font-size:13px;margin-bottom:6px;';
                _emptyLabel.textContent = _('Drag an image or folder here, or choose:');

                const _OPEN_BTN_BG = 'linear-gradient(144deg,var(--theme-backgruondcolora,rgba(37,37,37,0.3)) 0%,var(--theme-backgruondcolorb,rgba(10,10,10,0.2)) 47%)';

                function _mkOpenBtn(svgPath, label, onClick) {
                    const b = document.createElement('button');
                    b.style.cssText = [
                        'background:' + _OPEN_BTN_BG + ';border:none;',
                        'box-shadow:1px 1px 1px #ffffff29,-1px -1px 1px #ffffff29;',
                        'color:#fff;border-radius:10px;padding:16px 28px;cursor:default;',
                        'display:flex;flex-direction:column;align-items:center;gap:10px;',
                        'font-size:13px;min-width:120px;transition:background-color 1s ease;',
                    ].join('');
                    b.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24">${svgPath}</svg>${label}`;
                    b.addEventListener('mouseenter', () => {
                        b.style.background      = 'var(--theme-backgruondcolorc)';
                        b.style.animation       = 'fadeInOut 3s ease infinite';
                        b.style.animationDelay  = '1s';
                    });
                    b.addEventListener('mouseleave', () => {
                        b.style.background     = _OPEN_BTN_BG;
                        b.style.animation      = '';
                        b.style.animationDelay = '';
                    });
                    b.addEventListener('click', onClick);
                    return b;
                }

                const _emptyRow = document.createElement('div');
                _emptyRow.style.cssText = 'display:flex;gap:14px;';
                _emptyRow.appendChild(_mkOpenBtn(
                    '<path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>',
                    _('Open File'),
                    async () => {
                        const path = await app.explorer.windows.fileDialog({ mode: 'open', types: [...IMG_EXTS], parentId: winId });
                        if (!path) return;
                        const node = _fsNode(path);
                        if (!node) return;
                        const folderPath = path.split('/').slice(0, -1).join('/') || '/';
                        _loadFolder(folderPath);
                        _fIndex = _files.findIndex(f => f.path === path);
                        if (_fIndex < 0) _fIndex = 0;
                        _loadImage(path, node);
                    }
                ));
                _emptyRow.appendChild(_mkOpenBtn(
                    '<path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>',
                    _('Open Folder'),
                    async () => {
                        const folderPath = await app.explorer.windows.fileDialog({ mode: 'folder', parentId: winId });
                        if (!folderPath) return;
                        _loadFolder(folderPath);
                        if (_files.length > 0) { _fIndex = 0; _loadImage(_files[0].path, _files[0].entry); }
                    }
                ));
                emptyState.appendChild(_emptyLabel);
                emptyState.appendChild(_emptyRow);

                // ── Bottom bar ─────────────────────────────────────────────────
                const overlayBot = document.createElement('div');
                overlayBot.style.cssText = [
                    'flex-shrink:0;height:52px;padding:0 10px;',
                    'width:350px;margin:4px auto 0;margin-top:8px;border-radius:52px;',
                    'background:var(--theme-backgruondcolorc, rgba(0,0,0,0.4));',
                    'display:none;align-items:center;justify-content:center;gap:4px;',
                ].join('');

                // Zoom controls (left group)
                const _zoomLabel = document.createElement('span');
                _zoomLabel.style.cssText = 'color:rgba(255,255,255,0.75);font-size:11px;min-width:36px;text-align:center;flex-shrink:0;';
                _zoomLabel.textContent = '100%';

                function _mkSmBtn(svgPath, title, onClick) {
                    const b = document.createElement('button');
                    b.className = 'aero-button';
                    b.style.cssText = 'padding:0;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
                    b.title = title;
                    b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24">${svgPath}</svg>`;
                    b.addEventListener('mousedown', e => e.stopPropagation());
                    b.addEventListener('click', onClick);
                    return b;
                }

                const _zoomOutBtn = _mkSmBtn('<path fill="currentColor" d="M19 13H5v-2h14v2z"/>', _('Zoom Out'), () => _doZoom(_scale * 0.8, null, null));
                const _zoomInBtn  = _mkSmBtn('<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>', _('Zoom In'), () => _doZoom(_scale * 1.25, null, null));
                const _fitBtn     = _mkSmBtn('<path fill="currentColor" d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/>', _('Fit'), () => _fitToWindow());
                overlayBot.appendChild(_zoomOutBtn);
                overlayBot.appendChild(_zoomLabel);
                overlayBot.appendChild(_zoomInBtn);
                overlayBot.appendChild(_fitBtn);

                // Divider between zoom group and nav
                const _div1 = document.createElement('div');
                _div1.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.18);margin:0 6px;flex-shrink:0;';
                overlayBot.appendChild(_div1);

                // Nav buttons (center group — WMP style)
                const _btnPrev = document.createElement('button');
                _btnPrev.className = 'aero-button';
                _btnPrev.style.cssText = 'padding:0;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
                _btnPrev.title   = _('Previous');
                _btnPrev.disabled = true;
                _btnPrev.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>';
                _btnPrev.addEventListener('mousedown', e => e.stopPropagation());
                _btnPrev.addEventListener('click', _navPrev);

                const _btnPlay = document.createElement('button');
                _btnPlay.className = 'aero-button';
                _btnPlay.style.cssText = 'padding:0;width:42px;height:42px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
                _btnPlay.title    = _('Play Slideshow');
                _btnPlay.disabled = true;
                _btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><div class="after pulse"></div>';
                _btnPlay.addEventListener('mousedown', e => e.stopPropagation());
                _btnPlay.addEventListener('click', _navTogglePlay);

                const _btnNext = document.createElement('button');
                _btnNext.className = 'aero-button';
                _btnNext.style.cssText = 'padding:0;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
                _btnNext.title    = _('Next');
                _btnNext.disabled = true;
                _btnNext.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>';
                _btnNext.addEventListener('mousedown', e => e.stopPropagation());
                _btnNext.addEventListener('click', _navNext);

                overlayBot.appendChild(_btnPrev);
                overlayBot.appendChild(_btnPlay);
                overlayBot.appendChild(_btnNext);

                // Divider between nav and menu
                const _div2 = document.createElement('div');
                _div2.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.18);margin:0 6px;flex-shrink:0;';
                overlayBot.appendChild(_div2);

                // Menu button (right)
                const _menuBtn = _mkSmBtn(
                    '<path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>',
                    _('Menu'), () => {}
                );
                app.ui.contextMenu(_menuBtn, {
                    callback: () => {
                        const currentFile = _fIndex >= 0 ? _files[_fIndex] : null;
                        const items = [
                            {
                                title: _('Open File'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>',
                                callback: async () => {
                                    const path = await app.explorer.windows.fileDialog({ mode: 'open', types: [...IMG_EXTS], parentId: winId });
                                    if (!path) return;
                                    const node = _fsNode(path);
                                    if (!node) return;
                                    const folderPath = path.split('/').slice(0, -1).join('/') || '/';
                                    _loadFolder(folderPath);
                                    _fIndex = _files.findIndex(f => f.path === path);
                                    if (_fIndex < 0) _fIndex = 0;
                                    _loadImage(path, node);
                                }
                            },
                            {
                                title: _('Open Folder'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
                                callback: async () => {
                                    const folderPath = await app.explorer.windows.fileDialog({ mode: 'folder', parentId: winId });
                                    if (!folderPath) return;
                                    _loadFolder(folderPath);
                                    if (_files.length > 0) { _fIndex = 0; _loadImage(_files[0].path, _files[0].entry); }
                                }
                            },
                            {
                                title: _('Fit to Window'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/></svg>',
                                callback: () => _fitToWindow()
                            },
                            {
                                title: _('Zoom In'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
                                callback: () => _doZoom(_scale * 1.25, null, null)
                            },
                            {
                                title: _('Zoom Out'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>',
                                callback: () => _doZoom(_scale * 0.8, null, null)
                            },
                        ];
                        if (currentFile) {
                            items.push({
                                title: _('Properties'),
                                icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
                                callback: () => app.explorer?.windows?.dialog?.attributes?.({ path: currentFile.path, entry: currentFile.entry })
                            });
                        }
                        return items;
                    }
                });
                _menuBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const rect = _menuBtn.getBoundingClientRect();
                    _menuBtn.dispatchEvent(new MouseEvent('contextmenu', {
                        bubbles: true, cancelable: true,
                        clientX: rect.left, clientY: rect.top - 4,
                    }));
                });
                overlayBot.appendChild(_menuBtn);

                canvas.appendChild(spinner);
                canvas.appendChild(emptyState);
                content.appendChild(canvas);
                content.appendChild(overlayBot);

                // ── Live language switch ───────────────────────────────────────
                const _langToken = 'fotoviewer-' + winId;
                os.language.registerRefresh(_langToken, () => {
                    _zoomOutBtn.title = _('Zoom Out');
                    _zoomInBtn.title  = _('Zoom In');
                    _fitBtn.title     = _('Fit');
                    _btnPrev.title    = _('Previous');
                    _btnPlay.title    = _playing ? _('Pause') : _('Play Slideshow');
                    _btnNext.title    = _('Next');
                    _menuBtn.title    = _('Menu');
                    _emptyLabel.textContent = _('Drag an image or folder here, or choose:');
                    const titleEl = winEl.querySelector('.window-header .title');
                    if (titleEl) titleEl.textContent = _currentFilename
                        ? _('Photo Viewer') + ' — ' + _currentFilename
                        : _('Photo Viewer');
                });
                windowobj?.on?.('close', () => os.language.unregisterRefresh(_langToken));

                // ── Zoom / pan state ───────────────────────────────────────────
                let _scale    = 1;
                let _tx       = 0;
                let _ty       = 0;
                let _dragging = false;
                let _dragSX   = 0, _dragSY = 0, _dragTx = 0, _dragTy = 0;

                function _applyTransform() {
                    if (!img.naturalWidth) return;
                    img.style.transform = `translate(${_tx}px, ${_ty}px) scale(${_scale})`;
                    _zoomLabel.textContent = Math.round(_scale * 100) + '%';
                    canvas.style.cursor = _dragging ? 'grabbing' : (_scale > 1 ? 'grab' : 'default');
                }

                function _doZoom(newScale, cx, cy) {
                    newScale = Math.max(0.05, Math.min(50, newScale));
                    if (cx !== null && cy !== null) {
                        const ratio = newScale / _scale;
                        _tx = cx * (1 - ratio) + _tx * ratio;
                        _ty = cy * (1 - ratio) + _ty * ratio;
                    }
                    _scale = newScale;
                    _applyTransform();
                }

                function _fitToWindow() {
                    if (!img.naturalWidth || !img.naturalHeight) return;
                    const cw = canvas.clientWidth;
                    const ch = canvas.clientHeight;
                    _scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1);
                    _tx = 0; _ty = 0;
                    _applyTransform();
                }

                // ── State transitions ──────────────────────────────────────────
                function _showEmpty() {
                    app.dev.log('showEmpty', 'Fotoviewer');
                    _currentFilename = null;
                    img.style.display        = 'none';
                    emptyState.style.display = 'flex';
                    spinner.style.display    = 'none';
                    overlayBot.style.display = 'none';
                    const titleEl = winEl.querySelector('.window-header .title');
                    if (titleEl) titleEl.textContent = _('Photo Viewer');
                    _updateNav();
                }

                function _showSpinner() {
                    img.style.display        = 'none';
                    emptyState.style.display = 'none';
                    spinner.style.display    = 'flex';
                }

                function _loadImage(path, entry) {
                    const src = (entry && entry.url) ? entry.url : (path || '');
                    app.dev.log(`loadImage: "${path}" src="${src}"`, 'Fotoviewer');
                    if (!src) { _showEmpty(); return; }
                    _showSpinner();
                    _scale = 1; _tx = 0; _ty = 0;
                    const fname    = path.split('/').pop();
                    _currentFilename = fname;
                    const winTitle = _('Photo Viewer') + ' — ' + fname;
                    const titleEl  = winEl.querySelector('.window-header .title');
                    if (titleEl) titleEl.textContent = winTitle;
                    img.onload = () => {
                        app.dev.log(`img.onload: ${img.naturalWidth}×${img.naturalHeight}`, 'Fotoviewer');
                        spinner.style.display    = 'none';
                        emptyState.style.display = 'none';
                        img.style.display        = 'block';
                        overlayBot.style.display = 'flex';
                        _fitToWindow();
                        _updateNav();
                    };
                    img.onerror = () => { app.dev.log(`img.onerror: "${src}"`, 'Fotoviewer'); spinner.style.display = 'none'; };
                    img.src = src;
                    if (img.complete && img.naturalWidth) img.onload();
                }

                // ── Navigation ─────────────────────────────────────────────────
                function _updateNav() {
                    const hasFiles = _files.length > 0;
                    const atStart  = _fIndex <= 0;
                    const atEnd    = _fIndex >= _files.length - 1;
                    _btnPrev.disabled = !hasFiles || atStart;
                    _btnNext.disabled = !hasFiles || atEnd;
                    _btnPlay.disabled = !hasFiles;
                }

                function _navPrev() {
                    if (_fIndex > 0) {
                        _fIndex--;
                        _loadImage(_files[_fIndex].path, _files[_fIndex].entry);
                    }
                }

                function _navNext() {
                    if (_fIndex < _files.length - 1) {
                        _fIndex++;
                        _loadImage(_files[_fIndex].path, _files[_fIndex].entry);
                    }
                }

                function _navTogglePlay() {
                    _playing = !_playing;
                    if (_playing) {
                        _btnPlay.title   = _('Pause');
                        _btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><div class="after pulse"></div>';
                        _playTimer = setInterval(() => {
                            if (_files.length === 0) { _navTogglePlay(); return; }
                            _fIndex = (_fIndex + 1) % _files.length;
                            _loadImage(_files[_fIndex].path, _files[_fIndex].entry);
                        }, SLIDE_DELAY);
                    } else {
                        clearInterval(_playTimer);
                        _btnPlay.title   = _('Play Slideshow');
                        _btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><div class="after pulse"></div>';
                    }
                }

                // ── Drag to pan ────────────────────────────────────────────────
                canvas.addEventListener('mousedown', e => {
                    if (e.button !== 0) return;
                    if (e.target.closest('button')) return;
                    _dragging = true;
                    _dragSX = e.clientX; _dragSY = e.clientY;
                    _dragTx = _tx; _dragTy = _ty;
                    canvas.style.cursor = 'grabbing';
                    e.preventDefault();
                });

                function _onMove(e) {
                    if (_mHeld && _mouseInCanvas && img.naturalWidth) {
                        _tx += e.clientX - _mPanLX;
                        _ty += e.clientY - _mPanLY;
                        _applyTransform();
                    } else if (_dragging && winEl.isConnected) {
                        _tx = _dragTx + (e.clientX - _dragSX);
                        _ty = _dragTy + (e.clientY - _dragSY);
                        _applyTransform();
                    }
                    _mPanLX = e.clientX;
                    _mPanLY = e.clientY;
                }

                canvas.addEventListener('mouseenter', e => { _mouseInCanvas = true;  _mPanLX = e.clientX; _mPanLY = e.clientY; });
                canvas.addEventListener('mouseleave', () => { _mouseInCanvas = false; });

                function _onUp() {
                    if (!_dragging) return;
                    _dragging = false;
                    canvas.style.cursor = _scale > 1 ? 'grab' : 'default';
                }

                document.addEventListener('mousemove', _onMove);
                document.addEventListener('mouseup', _onUp);

                // ── Wheel zoom ─────────────────────────────────────────────────
                canvas.addEventListener('wheel', e => {
                    e.preventDefault();
                    const rect = canvas.getBoundingClientRect();
                    const cx = e.clientX - rect.left - rect.width  / 2;
                    const cy = e.clientY - rect.top  - rect.height / 2;
                    _doZoom(_scale * (e.deltaY < 0 ? 1 / 1.15 : 1.15), cx, cy);
                }, { passive: false });

                // ── Drop from explorer ─────────────────────────────────────────
                content.addEventListener('mouseup', () => {
                    const dragged = [...document.querySelectorAll('.dd-dragging[data-path]')];
                    if (!dragged.length) return;
                    const path = dragged[0].dataset.path;
                    if (!path) return;
                    const node = _fsNode(path);
                    app.dev.log(`drop: "${path}" nodeType="${node?.type}"`, 'Fotoviewer');
                    if (!node) return;
                    if (node.type === 'folder') {
                        _loadFolder(path);
                        app.dev.log(`drop folder: ${_files.length} images found`, 'Fotoviewer');
                        if (_files.length > 0) { _fIndex = 0; _loadImage(_files[0].path, _files[0].entry); }
                    } else if (IMG_EXTS.has((node.ext || '').toLowerCase())) {
                        const folderPath = path.split('/').slice(0, -1).join('/') || '/';
                        _loadFolder(folderPath);
                        _fIndex = _files.findIndex(f => f.path === path);
                        if (_fIndex < 0) _fIndex = 0;
                        _loadImage(path, node);
                    } else {
                        app.dev.log(`drop: ext "${node.ext}" not in IMG_EXTS — ignored`, 'Fotoviewer');
                    }
                });

                // ── Keyboard ───────────────────────────────────────────────────
                function _onKey(e) {
                    if (!winEl.isConnected) { document.removeEventListener('keydown', _onKey); return; }
                    if (!winEl.classList.contains('active')) return;
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); _navPrev(); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); _navNext(); }
                    if (e.key === ' ')          { e.preventDefault(); _navTogglePlay(); }
                    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); _doZoom(_scale * 1.25, null, null); }
                    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); _doZoom(_scale * 0.8, null, null); }
                    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); _fitToWindow(); }
                    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
                        _mHeld = true;
                        canvas.style.cursor = 'grab';
                    }
                }
                function _onKeyUp(e) {
                    if (!winEl.isConnected) { document.removeEventListener('keyup', _onKeyUp); return; }
                    if (e.key === 'm' || e.key === 'M') {
                        _mHeld = false;
                        if (!_dragging) canvas.style.cursor = _scale > 1 ? 'grab' : 'default';
                    }
                }
                document.addEventListener('keydown', _onKey);
                document.addEventListener('keyup', _onKeyUp);

                // ── Resize refit ───────────────────────────────────────────────
                const _resizeObs = new ResizeObserver(() => {
                    if (img.naturalWidth) _fitToWindow();
                });
                _resizeObs.observe(canvas);

                // ── Cleanup ────────────────────────────────────────────────────
                const _obs = new MutationObserver(() => {
                    if (!winEl.isConnected) {
                        document.removeEventListener('mousemove', _onMove);
                        document.removeEventListener('mouseup', _onUp);
                        document.removeEventListener('keydown', _onKey);
                        document.removeEventListener('keyup', _onKeyUp);
                        clearInterval(_playTimer);
                        _resizeObs.disconnect();
                        _obs.disconnect();
                    }
                });
                _obs.observe(winEl.parentElement || document.body, { childList: true, subtree: false });

                // ── Initial state ──────────────────────────────────────────────
                if (_initPath) {
                    app.dev.log(`init: loading "${_initPath}"`, 'Fotoviewer');
                    const folderPath = _initPath.split('/').slice(0, -1).join('/') || '/';
                    _loadFolder(folderPath);
                    app.dev.log(`init: folder="${folderPath}" images=${_files.length}`, 'Fotoviewer');
                    _fIndex = _files.findIndex(f => f.path === _initPath);
                    if (_fIndex < 0 && _files.length > 0) _fIndex = 0;
                    _loadImage(_initPath, _initEntry);
                } else {
                    app.dev.log('init: no path — showing empty state', 'Fotoviewer');
                    _showEmpty();
                }

            }, 0);

            return '';
        }
    });
}
