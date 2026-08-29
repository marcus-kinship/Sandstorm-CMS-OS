/**
 * @file mediaplayer/setup.js
 * @description Boot-time registration for the Media Player program.
 *
 * Builds the entire `app.mediaplayer` API, SVG icons, program registration,
 * the always-visible "now playing" taskbar status icon (with its overlay),
 * and the Explorer meta-panel inline audio widget — all boot-critical,
 * independent of whether the Media Player window itself is ever opened.
 * The window factory lives in `mediaplayer.js`, lazy-loaded by
 * `app.program.open()` the first time the user actually opens the program.
 *
 * Supports both audio (`mp3 ogg wav flac aac m4a opus wma`) and
 * video (`mp4 webm ogv m4v mov`) formats via `mediaplayer_api.js`.
 *
 * @module program/mediaplayer/setup
 */

const _AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a', 'opus', 'wma'];
const _VIDEO_EXTS = ['mp4', 'webm', 'ogv', 'm4v', 'mov'];

export async function setup(os) {

    if (!window.app)            window.app = {};
    if (!window.app.mediaplayer) window.app.mediaplayer = {};

    const mp = window.app.mediaplayer;
    mp._instances   = mp._instances   || {};
    mp._setupQueue  = mp._setupQueue  || [];
    mp._activeId    = mp._activeId    || null;

    // ── SVG icons ─────────────────────────────────────────────────────────────

    os.svg.global.load({ id: 'ic-mp',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M12 3v9.28A4 4 0 1 0 14 16V3h-2zm-2 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-play',
        viewBox: '0 0 24 24',
        content: `<path fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M7 5.5L18 12 7 18.5V5.5z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-pause',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-prev',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-next',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-stop',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M6 6h12v12H6z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-vol',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-mute',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-repeat',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-shuffle',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>`
    });
    os.svg.global.load({ id: 'ic-mp-list',
        viewBox: '0 0 24 24',
        content: `<path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>`
    });

    // ── Program info ──────────────────────────────────────────────────────────

    os.program.addInfo("mediaplayer", {
        name:        () => _("Media Player"),
        version:     "1.0",
        owner:       "Sandstorm",
        description: () => _("Play audio and video files"),
        icontype:    "svg",
        icon:        "#ic-mp-play",
        taskbar:     true,
        startmenu:   true,
        multistart:  true,
        main:        "start",
        autorun:     false,
        desktop:     true,
        file:        "mediaplayer/mediaplayer.js", // Lazy-loaded by app.program.open() on first launch
        root:        "program",
        openWith: [
            ..._AUDIO_EXTS.map(ext => ({
                ext, icon: '#ic-mp-play', icontype: 'svg',
                label:       ext.toUpperCase() + ' ' + _('Audio'),
                description: ext.toUpperCase() + _(' audio file')
            })),
            ..._VIDEO_EXTS.map(ext => ({
                ext, icon: '#ic-mp-play', icontype: 'svg',
                label:       ext.toUpperCase() + ' ' + _('Video'),
                description: ext.toUpperCase() + _(' video file')
            }))
        ]
    });

    // ── Global CSS (overlay + status icon animation) ──────────────────────────

    if (!$('#mp-overlay-styles').length) {
        const _s = document.createElement('style');
        _s.id = 'mp-overlay-styles';
        _s.textContent = `
        @keyframes mp-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .mpStatusIcon.mp-playing svg { animation:mp-pulse 2s ease-in-out infinite; }

        .mp-overlay { padding:10px 14px 14px; min-width:280px; min-height:170px; color:#fff; display:flex; flex-direction:column; }
        .mp-ov-list { overflow-y:auto; max-height:calc(5 * 52px); margin-bottom:8px; }
        .mp-ov-item { display:flex; align-items:center; gap:8px; cursor:default; border-radius:6px; min-height:34px; background-color:#ffffff00; transition:background-color 1s ease; }
        .mp-ov-item:hover { background-color:var(--theme-backgruondcolorc); animation:fadeInOut 3s ease infinite; animation-delay:1s; }
        .mp-ov-item.mp-ov-active { background-color:var(--theme-backgruondcolorc); padding-left:6px; }

        .mp-ov-item-play { flex-shrink:0; background:none; border:none; color:#fff; padding:5px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s; }
        .mp-ov-item-play:hover { background:rgba(255,255,255,0.12); }
        .mp-ov-item-info { flex:1; min-width:0; }
        .mp-ov-item-title { font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right: 7px; }
        .mp-ov-item-artist { font-size:10px; opacity:0.55; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mp-ov-prog { margin-left: 7px; margin-right: 10px; height:4px; background:rgba(255,255,255,0.15); border-radius:4px; margin-top:10px; margin-bottom:10px; position:relative; overflow:hidden; }
        .mp-ov-prog-fill { position:absolute; left:0; top:0; bottom:0; background:rgba(255,255,255,0.72); border-radius:4px; pointer-events:none; transition:width 0.25s linear; }
        .mp-ov-ctrl { display:flex; align-items:center; justify-content:center; gap:4px; }
        .mp-ov-ctrl button { background:none; border:none; color:#fff; padding:6px 8px; border-radius:7px; display:flex; align-items:center; justify-content:center; transition:background 0.2s; }
        .mp-ov-ctrl button:hover { background:rgba(255,255,255,0.1); }
        .mp-ov-ctrl button svg { width:20px; height:20px; }
        .mp-ov-ctrl .mp-ov-lg svg { width:28px; height:28px; }
        .mp-ov-vol { display:flex; align-items:center; gap:8px; margin-top:8px; margin-right: 7px; }
        .mp-ov-vol button { background:none; border:none; color:#fff; padding:4px; border-radius:5px; display:flex; align-items:center; justify-content:center; }
        .mp-ov-vol button svg { width:16px; height:16px; }
        .mp-ov-vol input[type=range] { flex:1; accent-color:rgba(255,255,255,0.85); height:3px; }
        .mp-ov-status { font-size:10px; opacity:0.38; text-align:center; margin-top:6px; letter-spacing:0.04em; text-transform:uppercase; }
        .statusicons .mpStatusIcon { color: white; }
        `;
        document.head.appendChild(_s);
    }

    // ── Overlay methods merged into app.mediaplayer ───────────────────────────

    Object.assign(mp, {

        _getActive() {
            const id = this._activeId;
            return (id && this._instances[id]) ? this._instances[id] : null;
        },

        overlayHTML() {
            const activeId   = this._activeId;
            const activeInst = this._instances[activeId];
            const s          = activeInst?.state;
            const pct        = (s && s.duration > 0) ? Math.round((s.currentTime / s.duration) * 100) : 0;
            const playing    = s?.status === 'playing';
            const muted      = s?.muted;
            const vol        = s?.volume ?? 1;
            const status     = s?.status || 'stopped';

            const multiPlayer = Object.keys(this._instances).length > 1;
            const listHtml = Object.entries(this._instances).map(([id, inst]) => {
                const is = inst.state;
                const t  = is?.title  || _('No media');
                const ar = is?.artist || '';
                const ip = is?.status === 'playing';
                return `<div class="mp-ov-item${multiPlayer && id === activeId ? ' mp-ov-active' : ''}" data-mp-id="${id}">
                    <button class="mp-ov-item-play" data-mp-id="${id}" title="${ip ? _('Pause') : _('Play')}">
                        <svg width="16" height="16"><use href="${ip ? '#ic-mp-pause' : '#ic-mp-play'}"/></svg>
                    </button>
                    <div class="mp-ov-item-info">
                        <div class="mp-ov-item-title">${app.util.escapeHtml(t)}</div>
                        ${ar ? `<div class="mp-ov-item-artist">${app.util.escapeHtml(ar)}</div>` : ''}
                    </div>
                </div>`;
            }).join('');

            const ctrlHtml = activeInst ? `
                <div class="mp-ov-prog" id="mpOvProg">
                    <div class="mp-ov-prog-fill" style="width:${pct}%"></div>
                </div>
                <div class="mp-ov-ctrl">
                    <button id="mpOvPrev" title="${_('Previous')}"><svg><use href="#ic-mp-prev"/></svg></button>
                    <button id="mpOvPlay" class="mp-ov-lg" title="${playing ? _('Pause') : _('Play')}">
                        <svg><use href="${playing ? '#ic-mp-pause' : '#ic-mp-play'}"/></svg>
                    </button>
                    <button id="mpOvNext" title="${_('Next')}"><svg><use href="#ic-mp-next"/></svg></button>
                </div>
                <div class="mp-ov-vol">
                    <button id="mpOvMute" title="${_('Mute')}">
                        <svg><use href="${muted ? '#ic-mp-mute' : '#ic-mp-vol'}"/></svg>
                    </button>
                    <input type="range" id="mpOvVol" min="0" max="1" step="0.02" value="${vol}">
                </div>
                <div class="mp-ov-status">${_(status.charAt(0).toUpperCase() + status.slice(1))}</div>
            ` : `<div class="mp-ov-status">${_('No media playing')}</div>`;

            return `<div class="mp-overlay">
                <div class="mp-ov-list">${listHtml}</div>
                ${ctrlHtml}
            </div>`;
        },

        // Re-render the overlay's content in place and re-run toggleWindow.js's
        // sizing/alignment logic via the handle returned from toggle.window()
        // (see the mpStatusIcon click handler below) — needed because the
        // panel uses height:"auto" and overlayHTML()'s rendered height changes
        // with the track list / active controls.
        _refreshOverlay() {
            const ov = $('#mpOverlay')[0];
            if (!ov) return;
            ov.innerHTML = this.overlayHTML();
            this._overlayHandle?.reposition();
            setTimeout(() => this.bindOverlay(), 10);
        },

        bindOverlay() {
            const mp   = this;
            const inst = this._getActive();

            // Instance list: click row to switch active player
            document.querySelectorAll('.mp-ov-item').forEach(row => {
                const id = row.dataset.mpId;
                row.addEventListener('click', e => {
                    e.stopPropagation();
                    if (e.target.closest('.mp-ov-item-play')) return;
                    const prev = mp._getActive();
                    if (prev?._overlayInterval) { clearInterval(prev._overlayInterval); prev._overlayInterval = null; }
                    mp._activeId = id;
                    mp.updateStatusIcon();
                    mp._refreshOverlay();
                });
            });

            // Per-row play/pause buttons
            document.querySelectorAll('.mp-ov-item-play').forEach(btn => {
                const id = btn.dataset.mpId;
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    if (mp._activeId !== id) {
                        const prev = mp._getActive();
                        if (prev?._overlayInterval) { clearInterval(prev._overlayInterval); prev._overlayInterval = null; }
                        mp._activeId = id;
                    }
                    mp._instances[id]?.togglePlay?.();
                    mp._refreshOverlay();
                });
            });

            // Active player controls
            const playBtn   = $('#mpOvPlay')[0];
            const prevBtn   = $('#mpOvPrev')[0];
            const nextBtn   = $('#mpOvNext')[0];
            const muteBtn   = $('#mpOvMute')[0];
            const volSlider = $('#mpOvVol')[0];
            const progBar   = $('#mpOvProg')[0];

            function _refresh() { mp._refreshOverlay(); }
            if (playBtn) playBtn.addEventListener('click', e => { e.stopPropagation(); inst?.togglePlay(); _refresh(); });
            if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); inst?.prev();       _refresh(); });
            if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); inst?.next();       _refresh(); });
            if (muteBtn) muteBtn.addEventListener('click', e => { e.stopPropagation(); inst?.toggleMute(); _refresh(); });
            if (volSlider) volSlider.addEventListener('input', e => { e.stopPropagation(); inst?.setVolume(parseFloat(e.target.value)); });
            if (progBar && inst) {
                progBar.addEventListener('click', e => {
                    e.stopPropagation();
                    const rect = progBar.getBoundingClientRect();
                    inst.seekPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
                });
            }

            // Live tick: active progress + all row play/pause icons
            if (inst) {
                if (inst._overlayInterval) clearInterval(inst._overlayInterval);
                inst._overlayInterval = setInterval(() => {
                    const ov = $('#mpOverlay')[0];
                    if (!ov) { clearInterval(inst._overlayInterval); return; }
                    const fill = ov.querySelector('.mp-ov-prog-fill');
                    if (fill && inst.state?.duration > 0)
                        fill.style.width = Math.round((inst.state.currentTime / inst.state.duration) * 100) + '%';
                    ov.querySelectorAll('.mp-ov-item-play').forEach(btn => {
                        const id  = btn.dataset.mpId;
                        const ip  = mp._instances[id]?.state?.status === 'playing';
                        const use = btn.querySelector('use');
                        if (use) use.setAttribute('href', ip ? '#ic-mp-pause' : '#ic-mp-play');
                    });
                    const statusEl = ov.querySelector('.mp-ov-status');
                    if (statusEl) {
                        const status = inst.state?.status || 'stopped';
                        statusEl.textContent = _(status.charAt(0).toUpperCase() + status.slice(1));
                    }
                    const playUse = ov.querySelector('#mpOvPlay use');
                    if (playUse) {
                        playUse.setAttribute('href', inst.state?.status === 'playing' ? '#ic-mp-pause' : '#ic-mp-play');
                    }
                }, 250);
            }
        },

        updateStatusIcon() {
            const inst   = this._getActive();
            const iconEl = document.querySelector('.statusicons .mpStatusIcon');
            if (!iconEl) return;
            const playing = inst?.state?.status === 'playing';
            iconEl.classList.toggle('mp-playing', playing);
            const use = iconEl.querySelector('use');
            if (use) use.setAttribute('href', playing ? '#ic-mp-pause' : '#ic-mp-play');
        }
    });

    // ── Status icon ───────────────────────────────────────────────────────────

    // ── Explorer meta panel: compact inline audio player ─────────────────────

    app.addProgramCSS('mediaplayer-meta', 'Media Player Meta Widget', `
        .mp-meta-widget { padding:6px 0 2px; border-top:1px solid rgba(255,255,255,0.08); margin-top:8px; width:100%; }
        .exp-meta-extra { width:100%; }
        .mp-meta-widget-label { font-size:9px; opacity:0.38; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:5px; }
        .mp-meta-prog { height:3px; background:rgba(255,255,255,0.12); border-radius:3px; margin:6px 0 2px; cursor:pointer; position:relative; }
        .mp-meta-prog-fill { position:absolute; left:0; top:0; bottom:0; background:rgba(255,255,255,0.6); border-radius:3px; transition:width 0.1s linear; pointer-events:none; }
        .mp-meta-ctrl { display:flex; align-items:center; gap:2px; }
        .mp-meta-ctrl button { background:none; border:none; color:rgba(255,255,255,0.7); cursor:pointer; padding:4px 5px; border-radius:5px; display:flex; align-items:center; justify-content:center; transition:background 0.15s; }
        .mp-meta-ctrl button:hover { background:rgba(255,255,255,0.1); color:#fff; }
        .mp-meta-ctrl button svg { width:16px; height:16px; }
        .mp-meta-time { font-size:10px; opacity:0.38; margin-left:auto; padding-right:2px; }
        .mp-meta-no-src { font-size:10px; opacity:0.32; padding:3px 0 2px; }
    `);

    // Ensure the registry exists even if explorer.js hasn't run setup() yet
    if (!window.app.explorer) window.app.explorer = {};
    if (!window.app.explorer.metaPanel) {
        window.app.explorer.metaPanel = {
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
    }
    app.explorer.metaPanel.register({
        id:   'mp-compact',
        exts: _AUDIO_EXTS,
            render(path, entry) {
                const hasSrc = !!entry.url;
                return `<div class="mp-meta-widget" data-widget-id="mp-compact">
                    <div class="mp-meta-widget-label">${_('Preview')}</div>
                    ${hasSrc
                        ? `<div class="mp-meta-prog"><div class="mp-meta-prog-fill" style="width:0%"></div></div>
                           <div class="mp-meta-ctrl">
                               <button class="mp-meta-play-btn" title="${_('Play')}"><svg><use href="#ic-mp-play"/></svg></button>
                               <button class="mp-meta-stop-btn" title="${_('Stop')}"><svg><use href="#ic-mp-stop"/></svg></button>
                               <span class="mp-meta-time">0:00</span>
                           </div>`
                        : `<div class="mp-meta-no-src">${_('No preview available')}</div>`}
                </div>`;
            },
            bind(el, path, entry) {
                if (!entry.url) return null;

                const audio   = new Audio(entry.url);
                const playBtn = el.querySelector('.mp-meta-play-btn');
                const stopBtn = el.querySelector('.mp-meta-stop-btn');
                const fill    = el.querySelector('.mp-meta-prog-fill');
                const timeEl  = el.querySelector('.mp-meta-time');
                const progBar = el.querySelector('.mp-meta-prog');
                let iv = null;

                const metaId   = 'explorer-meta-' + Date.now();
                const filename = path.split('/').pop();

                function _fmtTime(sec) {
                    if (!sec || !isFinite(sec)) return '0:00';
                    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
                    return `${m}:${s.toString().padStart(2, '0')}`;
                }
                function _tick() {
                    if (fill)   fill.style.width = (audio.duration > 0 ? (audio.currentTime / audio.duration * 100) : 0) + '%';
                    if (timeEl) timeEl.textContent = _fmtTime(audio.currentTime);
                    const inst = app.mediaplayer._instances[metaId];
                    if (inst) {
                        inst.state.currentTime = audio.currentTime;
                        inst.state.duration    = audio.duration || 0;
                    }
                }
                function _setIcon(playing) {
                    if (playBtn) playBtn.innerHTML = playing
                        ? `<svg><use href="#ic-mp-pause"/></svg>`
                        : `<svg><use href="#ic-mp-play"/></svg>`;
                }
                function _register(status) {
                    app.mediaplayer._instances[metaId] = {
                        state: {
                            title: filename, artist: '', status,
                            currentTime: audio.currentTime,
                            duration: audio.duration || 0,
                            volume: audio.volume, muted: audio.muted
                        },
                        togglePlay() {
                            const inst = app.mediaplayer._instances[metaId];
                            if (audio.paused) {
                                audio.play().catch(() => {});
                                _setIcon(true);
                                if (!iv) iv = setInterval(_tick, 250);
                                if (inst) inst.state.status = 'playing';
                            } else {
                                audio.pause();
                                _setIcon(false);
                                clearInterval(iv); iv = null;
                                if (inst) inst.state.status = 'paused';
                            }
                            app.mediaplayer.updateStatusIcon();
                        },
                        prev() {}, next() {},
                        stop() {
                            audio.pause();
                            audio.currentTime = 0;
                            _setIcon(false);
                            clearInterval(iv); iv = null;
                            _tick();
                            _unregister();
                        },
                        setVolume(v)  { audio.volume = v; const i = app.mediaplayer._instances[metaId]; if (i) i.state.volume = v; },
                        toggleMute()  { audio.muted = !audio.muted; const i = app.mediaplayer._instances[metaId]; if (i) i.state.muted = audio.muted; },
                        seekPct(pct)  { if (audio.duration) audio.currentTime = pct * audio.duration; }
                    };
                    const cur = app.mediaplayer._activeId;
                    if (!cur || !app.mediaplayer._instances[cur]) app.mediaplayer._activeId = metaId;
                    app.mediaplayer.updateStatusIcon();
                }
                function _unregister() {
                    delete app.mediaplayer._instances[metaId];
                    if (app.mediaplayer._activeId === metaId) {
                        const ids = Object.keys(app.mediaplayer._instances);
                        app.mediaplayer._activeId = ids.length ? ids[ids.length - 1] : null;
                    }
                    app.mediaplayer.updateStatusIcon();
                }

                playBtn?.addEventListener('click', () => {
                    if (audio.paused) {
                        audio.play().catch(() => {});
                        _setIcon(true);
                        iv = setInterval(_tick, 250);
                        _register('playing');
                    } else {
                        audio.pause();
                        _setIcon(false);
                        clearInterval(iv); iv = null;
                        if (app.mediaplayer._instances[metaId])
                            app.mediaplayer._instances[metaId].state.status = 'paused';
                        app.mediaplayer.updateStatusIcon();
                    }
                });
                stopBtn?.addEventListener('click', () => {
                    audio.pause();
                    audio.currentTime = 0;
                    _setIcon(false);
                    clearInterval(iv); iv = null;
                    _tick();
                    _unregister();
                });
                progBar?.addEventListener('click', e => {
                    if (!audio.duration) return;
                    const r = progBar.getBoundingClientRect();
                    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
                    _tick();
                });
                audio.addEventListener('ended', () => {
                    _setIcon(false);
                    clearInterval(iv); iv = null;
                    _tick();
                    _unregister();
                });

                return () => {
                    audio.pause();
                    audio.src = '';
                    clearInterval(iv); iv = null;
                    _unregister();
                };
            }
        });

    os.language.registerRefresh("mediaplayer-overlay", () => {
        app.mediaplayer._refreshOverlay();
        const iconEl = document.querySelector(".mpStatusIcon");
        if (iconEl) iconEl.title = _("Media Player");
    });
    await os.language.loadProgram("mediaplayer");

    app.desktop.taskbar.setStatusIcon({
        id:    "mpStatusIcon",
        class: "icon mpStatusIcon",
        svg:   "#ic-mp-play",
        title: _("Media Player"),
        order: 2,
        contextmenu(e) {
            const mp    = app.mediaplayer;
            const insts = Object.values(mp._instances);
            const anyPlaying = insts.some(i => i.state?.status === 'playing');
            insts.forEach(inst => {
                const s = inst.state?.status;
                if (anyPlaying ? s === 'playing' : s === 'paused') inst.togglePlay?.();
            });
            mp.updateStatusIcon();
        },
        click(e) {
            const handle = app.ui.toggle.window({
                windowId:     "#mpOverlay",
                iconSelector: ".mpStatusIcon",
                gap:          10,
                width:        "300px",
                height:       "auto",
                body() {
                    return app.mediaplayer.overlayHTML();
                }
            });

            app.mediaplayer._overlayHandle = handle;
            if (handle) app.mediaplayer.bindOverlay();
        }
    });
}
