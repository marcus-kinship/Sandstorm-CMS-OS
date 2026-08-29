/**
 * @file mediaplayer/mediaplayer_data.js
 * @description Media player window UI builder for Sandstorm OS.
 *
 * Exports `data(os, win)` — builds the full media player window UI and wires
 * all playback events. Called by `mediaplayer.js` `start()` after the window
 * shell is in the DOM. Uses `mediaplayer_api.js` classes for playback control.
 *
 * @module program/mediaplayer/mediaplayer_data
 */

const _AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a', 'opus', 'wma']);
const _VIDEO_EXTS = new Set(['mp4', 'webm', 'ogv', 'm4v', 'mov']);
const _MEDIA_EXTS = new Set([..._AUDIO_EXTS, ..._VIDEO_EXTS]);

function _fmt(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function _fsNode(path) {
    if (!app.explorer?._fs) return null;
    if (path === '/') return app.explorer._fs['/'];
    const parts = path.replace(/^\//, '').split('/');
    let node = app.explorer._fs['/'];
    for (const p of parts) {
        if (!node?.children?.[p]) return null;
        node = node.children[p];
    }
    return node;
}


// ── Entry point ───────────────────────────────────────────────────────────────

export function data(os) {

    const setup = (app.mediaplayer._setupQueue || []).shift() || {};
    const { instanceId, _initPath, _initEntry } = setup;
    if (!instanceId) return;

    const root = jQuery(`#${instanceId}-root`)[0];
    if (!root) return;

    os.addCSS('mediaplayer', os.config.local.ProgramRoot + 'mediaplayer/mediaplayer.css', true);

    // ── State ─────────────────────────────────────────────────────────────────

    const state = {
        playlist:    [],
        currentIndex: -1,
        repeat:      false,
        shuffle:     false,
        volume:      1,
        muted:       false,
        status:      'stopped',
        type:        null,
        title:       '',
        artist:      '',
        album:       '',
        artSrc:      '',
        currentTime: 0,
        duration:    0
    };

    // ── Build DOM ─────────────────────────────────────────────────────────────

    root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    // Body (media + playlist)
    const body = document.createElement('div');
    body.className = 'mp-body';

    const mediaArea = document.createElement('div');
    mediaArea.className = 'mp-media';

    // Video element
    const video = document.createElement('video');
    video.className = 'mp-video';
    mediaArea.appendChild(video);

    // Audio display (art + metadata)
    const audioDisplay = document.createElement('div');
    audioDisplay.className = 'mp-audio-display';
    audioDisplay.innerHTML = `
        <div class="mp-art" id="${instanceId}-art">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3v9.28A4 4 0 1 0 14 16V3h-2zm-2 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
        </div>
        <div class="mp-meta">
            <div class="mp-track-title"  id="${instanceId}-title">${_('No media')}</div>
            <div class="mp-track-artist" id="${instanceId}-artist"></div>
            <div class="mp-track-album"  id="${instanceId}-album"></div>
        </div>
    `;
    mediaArea.appendChild(audioDisplay);

    // Empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'mp-empty mp-active';
    emptyState.innerHTML = `
        <div class="mp-empty-label">${_('Drag & drop files or folders here, or open:')}</div>
        <div class="mp-empty-row">
            <button class="mp-open-btn" id="${instanceId}-btn-file">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                ${_('Open File')}
            </button>
            <button class="mp-open-btn" id="${instanceId}-btn-folder">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                ${_('Open Folder')}
            </button>
        </div>
        <div class="mp-drop-hint">${_('Supports') + ': MP3, MP4, OGG, WAV, FLAC, WEBM, MKV…'}</div>
    `;
    mediaArea.appendChild(emptyState);

    // Playlist sidebar
    const playlist = document.createElement('div');
    playlist.className = 'mp-playlist mp-hidden';
    playlist.innerHTML = `
        <div class="mp-pl-header">
            <span>${_('Playlist')}</span>
            <button class="mp-btn mp-pl-header-add" id="${instanceId}-pl-add" title="${_('Add file')}">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
        </div>
        <div id="${instanceId}-pl-list"></div>`;

    body.appendChild(mediaArea);
    body.appendChild(playlist);

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'mp-timeline';
    timeline.innerHTML = `
        <div class="mp-prog-wrap" id="${instanceId}-prog">
            <div class="mp-prog-fill"  id="${instanceId}-fill"  style="width:0%"></div>
            <div class="mp-prog-thumb" id="${instanceId}-thumb"></div>
        </div>
        <div class="mp-times">
            <span id="${instanceId}-cur">0:00</span>
            <span id="${instanceId}-dur">0:00</span>
        </div>
    `;

    // Controls bar
    const controls = document.createElement('div');
    controls.className = 'mp-controls';
    controls.innerHTML = `
        <button class="mp-btn" id="${instanceId}-shuf" title="${_('Shuffle')}">
            <svg><use href="#ic-mp-shuffle"/></svg>
        </button>
        <button class="mp-btn" id="${instanceId}-prev" title="${_('Previous')}">
            <svg><use href="#ic-mp-prev"/></svg>
        </button>
        <button class="mp-btn mp-btn-lg" id="${instanceId}-play" title="${_('Play')}">
            <svg><use href="#ic-mp-play"/></svg>
        </button>
        <button class="mp-btn" id="${instanceId}-stop" title="${_('Stop')}">
            <svg><use href="#ic-mp-stop"/></svg>
        </button>
        <button class="mp-btn" id="${instanceId}-next" title="${_('Next')}">
            <svg><use href="#ic-mp-next"/></svg>
        </button>
        <button class="mp-btn" id="${instanceId}-rep" title="${_('Repeat')}">
            <svg><use href="#ic-mp-repeat"/></svg>
        </button>
        <div class="mp-sep"></div>
        <div class="mp-vol">
            <button class="mp-btn" id="${instanceId}-mute" title="${_('Mute')}">
                <svg><use href="#ic-mp-vol"/></svg>
            </button>
            <input type="range" class="mp-vol-slider" id="${instanceId}-vol" min="0" max="1" step="0.02" value="1">
        </div>
        <div class="mp-sep"></div>
        <button class="mp-btn" id="${instanceId}-list" title="${_('Playlist')}">
            <svg><use href="#ic-mp-list"/></svg>
        </button>
    `;

    root.appendChild(body);
    root.appendChild(timeline);
    root.appendChild(controls);

    // Hidden Audio element
    const audio = new Audio();

    // ── DOM refs ──────────────────────────────────────────────────────────────

    const $  = id => document.getElementById(`${instanceId}-${id}`);
    const progWrap   = $('prog');
    const progFill   = $('fill');
    const progThumb  = $('thumb');
    const curTimeEl  = $('cur');
    const durTimeEl  = $('dur');
    const playBtn    = $('play');
    const prevBtn    = $('prev');
    const nextBtn    = $('next');
    const stopBtn    = $('stop');
    const repBtn     = $('rep');
    const shufBtn    = $('shuf');
    const muteBtn    = $('mute');
    const volSlider  = $('vol');
    const plListEl   = $('pl-list');
    const listBtn    = $('list');
    const titleEl    = $('title');
    const artistEl   = $('artist');
    const albumEl    = $('album');
    const artEl      = $('art');

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _media() { return state.type === 'video' ? video : audio; }

    function _setStatus(s) {
        state.status = s;
        app.mediaplayer.updateStatusIcon();
    }

    function _updatePlayBtn() {
        const playing = state.status === 'playing';
        playBtn.innerHTML = playing
            ? '<svg><use href="#ic-mp-pause"/></svg>'
            : '<svg><use href="#ic-mp-play"/></svg>';
        playBtn.title = playing ? _('Pause') : _('Play');
    }

    function _updateProgress() {
        const el  = _media();
        const cur = el.currentTime || 0;
        const dur = el.duration    || 0;
        state.currentTime = cur;
        state.duration    = dur;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        progFill.style.width  = pct + '%';
        if (progThumb) progThumb.style.left = `calc(${pct}% )`;
        curTimeEl.textContent = _fmt(cur);
        durTimeEl.textContent = _fmt(dur);
    }

    function _updateMeta() {
        const name = state.playlist[state.currentIndex]?.name || '';
        if (titleEl)  titleEl.textContent  = state.title  || name.replace(/\.[^.]+$/, '') || _('Unknown');
        if (artistEl) artistEl.textContent = state.artist || '';
        if (albumEl)  albumEl.textContent  = state.album  || '';
    }

    function _updateWindowTitle() {
        const winEl = root.closest('[id$="-win"]');
        if (!winEl) return;
        const t = winEl.querySelector('.window-header .title');
        if (t) t.textContent = _('Media Player') + (state.title ? ' — ' + state.title : '');
    }

    function _showState(s) {
        emptyState.classList.toggle('mp-active',   s === 'empty');
        audioDisplay.classList.toggle('mp-active', s === 'audio');
        video.classList.toggle('mp-active',        s === 'video');
    }

    function _updatePlaylistUI() {
        if (!plListEl) return;
        plListEl.innerHTML = state.playlist.map((item, i) => `
            <div class="mp-pl-item${i === state.currentIndex ? ' mp-pl-active' : ''}" data-index="${i}">
                <span class="mp-pl-num">${i + 1}</span>
                <div class="mp-pl-info">
                    <div class="mp-pl-name">${app.util.escapeHtml(item.name)}</div>
                </div>
                <span class="mp-pl-dur">${item.duration ? _fmt(item.duration) : ''}</span>
                <button class="mp-btn mp-pl-remove" data-remove="${i}" title="${_('Remove')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        `).join('');

        plListEl.querySelectorAll('.mp-pl-item').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.closest('.mp-pl-remove')) return;
                state.currentIndex = parseInt(el.dataset.index, 10);
                _loadCurrent();
            });
        });
        plListEl.querySelectorAll('.mp-pl-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                removeTrack(parseInt(btn.dataset.remove, 10));
            });
        });

        const hasFiles = state.playlist.length >= 1;
        const userHidden = listBtn?.dataset.userHidden === 'true';
        if (listBtn) {
            if (hasFiles && !listBtn.classList.contains('mp-on') && !userHidden) {
                listBtn.classList.add('mp-on');
            }
        }
        playlist.classList.toggle('mp-hidden', !hasFiles || userHidden);
    }

    // ── Load & play ───────────────────────────────────────────────────────────

    function _loadCurrent() {
        const item = state.playlist[state.currentIndex];
        if (!item) { _showState('empty'); return; }

        const ext = (item.ext || '').toLowerCase();
        state.type   = _VIDEO_EXTS.has(ext) ? 'video' : 'audio';
        state.title  = item.name.replace(/\.[^.]+$/, '');
        state.artist = '';
        state.album  = '';
        state.artSrc = '';

        _setStatus('loading');
        _updateMeta();
        _updateWindowTitle();
        _updatePlaylistUI();
        _showState(state.type);

        const el  = _media();
        el.src    = item.entry?.url || item.src || '';
        el.volume = state.volume;
        el.muted  = state.muted;
        el.loop   = state.repeat && state.playlist.length === 1;

        el.onloadedmetadata = () => {
            state.duration = el.duration;
            _updateProgress();
            el.play()
                .then(() => { _setStatus('playing'); _updatePlayBtn(); })
                .catch(() => { _setStatus('paused');  _updatePlayBtn(); });
        };
        el.onerror = () => { _setStatus('stopped'); _updatePlayBtn(); };
    }

    function _fsLoadFolder(folderPath) {
        const node = _fsNode(folderPath);
        if (!node?.children) { state.playlist = []; return; }
        state.playlist = Object.entries(node.children)
            .filter(([, e]) => e.type === 'file' && _MEDIA_EXTS.has((e.ext || '').toLowerCase()))
            .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .map(([name, entry]) => ({
                name,
                ext:      entry.ext || name.split('.').pop(),
                src:      entry.url || '',
                entry,
                duration: 0
            }));
    }

    // ── Control functions ─────────────────────────────────────────────────────

    function togglePlay() {
        if (state.status === 'playing') {
            _media().pause();
            _setStatus('paused');
            _updatePlayBtn();
        } else if (state.playlist.length > 0) {
            if (state.currentIndex < 0) { state.currentIndex = 0; _loadCurrent(); return; }
            _media().play()
                .then(() => { _setStatus('playing'); _updatePlayBtn(); })
                .catch(() => {});
        }
    }

    function stop() {
        const el = _media();
        el.pause();
        el.currentTime = 0;
        _setStatus('stopped');
        _updatePlayBtn();
        _updateProgress();
    }

    function prev() {
        if (!state.playlist.length) return;
        if (_media().currentTime > 3) { _media().currentTime = 0; return; }
        state.currentIndex = Math.max(0, state.currentIndex - 1);
        _loadCurrent();
    }

    function next() {
        if (!state.playlist.length) return;
        if (state.shuffle) {
            let idx = Math.floor(Math.random() * state.playlist.length);
            if (idx === state.currentIndex && state.playlist.length > 1) idx = (idx + 1) % state.playlist.length;
            state.currentIndex = idx;
        } else {
            if (state.currentIndex >= state.playlist.length - 1) {
                if (state.repeat) { state.currentIndex = 0; } else return;
            } else {
                state.currentIndex++;
            }
        }
        _loadCurrent();
    }

    function toggleRepeat() {
        state.repeat = !state.repeat;
        repBtn.classList.toggle('mp-on', state.repeat);
    }

    function toggleShuffle() {
        state.shuffle = !state.shuffle;
        shufBtn.classList.toggle('mp-on', state.shuffle);
    }

    function toggleMute() {
        state.muted  = !state.muted;
        _media().muted = state.muted;
        muteBtn.innerHTML = state.muted
            ? '<svg><use href="#ic-mp-mute"/></svg>'
            : '<svg><use href="#ic-mp-vol"/></svg>';
    }

    function setVolume(v) {
        state.volume   = v;
        _media().volume = v;
        if (volSlider) volSlider.value = v;
    }

    function seekPct(pct) {
        const el = _media();
        if (el.duration) el.currentTime = pct * el.duration;
    }

    function closeMedia() {
        stop();
        state.playlist     = [];
        state.currentIndex = -1;
        state.type         = null;
        state.title        = '';
        state.artist       = '';
        _showState('empty');
        _updatePlaylistUI();
        _updateWindowTitle();
    }

    async function addFile() {
        if (!app.explorer?.windows?.fileDialog) return;
        const winEl    = root.closest('[id$="-win"]');
        const parentId = winEl?.id?.replace('-win', '') || instanceId;
        const path = await app.explorer.windows.fileDialog({ mode: 'open', types: [..._MEDIA_EXTS], parentId });
        if (!path) return;
        const node = _fsNode(path);
        if (!node) return;
        const name = path.split('/').pop();
        const ext  = (node.ext || name.split('.').pop()).toLowerCase();
        if (!_MEDIA_EXTS.has(ext)) return;
        if (!state.playlist.some(f => f.entry === node)) {
            state.playlist.push({ name, ext, src: node.url || '', entry: node, duration: 0 });
        }
        _updatePlaylistUI();
    }

    function removeTrack(index) {
        if (index < 0 || index >= state.playlist.length) return;
        state.playlist.splice(index, 1);
        if (state.playlist.length === 0) { closeMedia(); return; }
        if (index < state.currentIndex) {
            state.currentIndex--;
        } else if (index === state.currentIndex) {
            if (state.currentIndex >= state.playlist.length) state.currentIndex = state.playlist.length - 1;
            _loadCurrent();
            return;
        }
        _updatePlaylistUI();
    }

    async function openFile() {
        if (!app.explorer?.windows?.fileDialog) return;
        const winEl   = root.closest('[id$="-win"]');
        const parentId = winEl?.id?.replace('-win', '') || instanceId;
        const path = await app.explorer.windows.fileDialog({ mode: 'open', types: [..._MEDIA_EXTS], parentId });
        if (!path) return;
        const node = _fsNode(path);
        if (!node) return;
        const folderPath = path.split('/').slice(0, -1).join('/') || '/';
        _fsLoadFolder(folderPath);
        state.currentIndex = state.playlist.findIndex(f => f.entry === node);
        if (state.currentIndex < 0) {
            state.playlist.unshift({ name: path.split('/').pop(), ext: node.ext || path.split('.').pop(), src: node.url || '', entry: node, duration: 0 });
            state.currentIndex = 0;
        }
        _loadCurrent();
    }

    async function openFolder() {
        if (!app.explorer?.windows?.fileDialog) return;
        const winEl   = root.closest('[id$="-win"]');
        const parentId = winEl?.id?.replace('-win', '') || instanceId;
        const folderPath = await app.explorer.windows.fileDialog({ mode: 'folder', parentId });
        if (!folderPath) return;
        _fsLoadFolder(folderPath);
        if (state.playlist.length > 0) { state.currentIndex = 0; _loadCurrent(); }
    }

    // ── Wire up controls ──────────────────────────────────────────────────────

    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    stopBtn.addEventListener('click', stop);
    repBtn?.addEventListener('click', toggleRepeat);
    shufBtn?.addEventListener('click', toggleShuffle);
    muteBtn.addEventListener('click', toggleMute);
    if (volSlider) volSlider.addEventListener('input', e => setVolume(parseFloat(e.target.value)));

    if (listBtn) {
        listBtn.addEventListener('click', () => {
            const open = !listBtn.classList.contains('mp-on');
            listBtn.classList.toggle('mp-on', open);
            listBtn.dataset.userHidden = open ? '' : 'true';
            playlist.classList.toggle('mp-hidden', !open || state.playlist.length < 1);
        });
    }

    $('pl-add')?.addEventListener('click', addFile);
    $('btn-file')?.addEventListener('click', openFile);
    $('btn-folder')?.addEventListener('click', openFolder);

    // ── Progress scrub ────────────────────────────────────────────────────────

    let _scrubbing = false;
    if (progWrap) {
        progWrap.addEventListener('mousedown', e => {
            _scrubbing = true;
            const rect = progWrap.getBoundingClientRect();
            seekPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        });
        document.addEventListener('mousemove', e => {
            if (!_scrubbing) return;
            const rect = progWrap.getBoundingClientRect();
            seekPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        });
        document.addEventListener('mouseup', () => { _scrubbing = false; });
    }

    // ── Media element events ──────────────────────────────────────────────────

    function _onTimeUpdate() { _updateProgress(); }
    function _onEnded() {
        _setStatus('ended');
        if (state.repeat && state.playlist.length === 1) { _media().play(); return; }
        if (state.currentIndex < state.playlist.length - 1 || state.repeat) { next(); return; }
        _updatePlayBtn();
    }
    function _onPlay()  { _setStatus('playing'); _updatePlayBtn(); }
    function _onPause() { _setStatus('paused');  _updatePlayBtn(); }

    audio.addEventListener('timeupdate', _onTimeUpdate);
    audio.addEventListener('ended',      _onEnded);
    audio.addEventListener('play',       _onPlay);
    audio.addEventListener('pause',      _onPause);
    video.addEventListener('timeupdate', _onTimeUpdate);
    video.addEventListener('ended',      _onEnded);
    video.addEventListener('play',       _onPlay);
    video.addEventListener('pause',      _onPause);

    // ── Drag-drop from Explorer ───────────────────────────────────────────────

    const winContainer = root.closest('[id$="-win"]') || root;
    winContainer.addEventListener('mouseup', () => {
        const dragged = [...document.querySelectorAll('.dd-dragging[data-path]')];
        if (!dragged.length) return;
        const path = dragged[0].dataset.path;
        if (!path) return;
        const node = _fsNode(path);
        if (!node) return;
        if (node.type === 'folder') {
            _fsLoadFolder(path);
            if (state.playlist.length > 0) { state.currentIndex = 0; _loadCurrent(); }
        } else if (_MEDIA_EXTS.has((node.ext || '').toLowerCase())) {
            const folderPath = path.split('/').slice(0, -1).join('/') || '/';
            _fsLoadFolder(folderPath);
            state.currentIndex = state.playlist.findIndex(f => f.entry === node);
            if (state.currentIndex < 0) { state.playlist.unshift({ name: path.split('/').pop(), ext: node.ext || '', src: node.url || '', entry: node, duration: 0 }); state.currentIndex = 0; }
            _loadCurrent();
        }
    });

    // ── Keyboard ──────────────────────────────────────────────────────────────

    function _onKey(e) {
        const w = root.closest('[id$="-win"]');
        if (!w?.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT') return;
        if (e.key === ' ')          { e.preventDefault(); togglePlay(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        if (e.key === 'm' || e.key === 'M') toggleMute();
    }
    document.addEventListener('keydown', _onKey);

    // Focus → set as active instance
    winContainer.addEventListener('mousedown', () => {
        app.mediaplayer._activeId = instanceId;
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────

    function _cleanup() {
        stop();
        audio.src = '';
        video.src = '';
        audio.removeEventListener('timeupdate', _onTimeUpdate);
        audio.removeEventListener('ended',      _onEnded);
        audio.removeEventListener('play',       _onPlay);
        audio.removeEventListener('pause',      _onPause);
        video.removeEventListener('timeupdate', _onTimeUpdate);
        video.removeEventListener('ended',      _onEnded);
        video.removeEventListener('play',       _onPlay);
        video.removeEventListener('pause',      _onPause);
        document.removeEventListener('keydown', _onKey);
        if (app.mediaplayer._instances[instanceId]?._overlayInterval)
            clearInterval(app.mediaplayer._instances[instanceId]._overlayInterval);
    }

    // ── Register instance ─────────────────────────────────────────────────────

    app.mediaplayer._instances[instanceId] = {
        state,
        togglePlay, stop, prev, next,
        toggleRepeat, toggleShuffle,
        toggleMute, setVolume, seekPct,
        openFile, addFile, openFolder, closeMedia, removeTrack,
        _cleanup,
        _updateWindowTitle,
        _updateMeta
    };
    app.mediaplayer._activeId = instanceId;

    // ── Initial media ─────────────────────────────────────────────────────────

    if (_initPath) {
        const node = _initEntry || _fsNode(_initPath);
        if (node) {
            const folderPath = _initPath.split('/').slice(0, -1).join('/') || '/';
            _fsLoadFolder(folderPath);
            state.currentIndex = state.playlist.findIndex(f => f.entry === node);
            if (state.currentIndex < 0) {
                state.playlist.unshift({
                    name:     _initPath.split('/').pop(),
                    ext:      node.ext || _initPath.split('.').pop(),
                    src:      node.url || '',
                    entry:    node,
                    duration: 0
                });
                state.currentIndex = 0;
            }
            _loadCurrent();
        }
    }
}
