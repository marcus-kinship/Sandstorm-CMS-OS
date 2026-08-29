/**
 * @file mediaplayer/mediaplayer_api.js
 * @description Media player API for Sandstorm OS.
 *
 * Exports the shared player classes and `PlayerStatus` enum used by
 * `mediaplayer_data.js`:
 * - `PlayerStatus` — playback state constants (`PLAYING`, `PAUSED`, `STOPPED`, …)
 * - `MediaPlayerBase` — abstract base class with shared state and events
 * - `AudioPlayer` — concrete implementation for audio files
 * - `VideoPlayer` — concrete implementation for video files
 *
 * @module program/mediaplayer/mediaplayer_api
 */

export const PlayerStatus = {
    PLAYING:   'playing',
    PAUSED:    'paused',
    STOPPED:   'stopped',
    BUFFERING: 'buffering',
    LOADING:   'loading',
    ENDED:     'ended'
};

// ── Base class ────────────────────────────────────────────────────────────────

export class MediaPlayerBase {
    constructor() {
        this._el        = null;
        this.status     = PlayerStatus.STOPPED;
        this._listeners = {};
    }

    play()   { return this._el?.play(); }
    pause()  { this._el?.pause(); }

    stop() {
        if (this._el) {
            this._el.pause();
            this._el.currentTime = 0;
        }
        this.status = PlayerStatus.STOPPED;
    }

    seek(time) {
        if (this._el && isFinite(time)) this._el.currentTime = time;
    }

    volume(v) {
        if (v === undefined) return this._el?.volume ?? 1;
        if (this._el) this._el.volume = Math.max(0, Math.min(1, v));
        return this._el?.volume ?? 1;
    }

    mute(v) {
        if (!this._el) return;
        this._el.muted = (v === undefined) ? !this._el.muted : Boolean(v);
    }

    getDuration()    { return this._el?.duration    ?? 0; }
    getCurrentTime() { return this._el?.currentTime ?? 0; }

    on(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
        this._el?.addEventListener(event, fn);
    }

    off(event, fn) {
        if (this._listeners[event])
            this._listeners[event] = this._listeners[event].filter(f => f !== fn);
        this._el?.removeEventListener(event, fn);
    }

    destroy() {
        for (const [ev, fns] of Object.entries(this._listeners))
            fns.forEach(fn => this._el?.removeEventListener(ev, fn));
        this._listeners = {};
        if (this._el) { this._el.src = ''; this._el.load(); }
    }
}

// ── Audio player ──────────────────────────────────────────────────────────────

export class AudioPlayer extends MediaPlayerBase {
    constructor() {
        super();
        this._el = document.createElement('audio');
    }

    load(src) {
        this._el.src = src;
        this._el.load();
    }
}

// ── Video player ──────────────────────────────────────────────────────────────

export class VideoPlayer extends MediaPlayerBase {
    constructor(container) {
        super();
        this._el = document.createElement('video');
        this._el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
        if (container) container.appendChild(this._el);
    }

    load(src) {
        this._el.src = src;
        this._el.load();
    }

    fullscreen() {
        if (!this._el) return;
        document.fullscreenElement
            ? document.exitFullscreen()
            : this._el.requestFullscreen?.();
    }
}

// ── Explorer integration ──────────────────────────────────────────────────────

export function openInMediaPlayer(path, entry) {
    if (!window.app?.mediaplayer) return;
    app.mediaplayer._pendingPath  = path;
    app.mediaplayer._pendingEntry = entry || null;
    app.program.open('mediaplayer');
}

// ── Metasidebar integration ───────────────────────────────────────────────────

export function getMetaData() {
    const inst = app.mediaplayer?._getActive?.();
    if (!inst) return null;
    const s = inst.state;
    return {
        title:       s?.title       || '',
        artist:      s?.artist      || '',
        album:       s?.album       || '',
        art:         s?.artSrc      || '',
        status:      s?.status      || PlayerStatus.STOPPED,
        currentTime: s?.currentTime || 0,
        duration:    s?.duration    || 0,
        controls: {
            play:     () => inst.togglePlay?.(),
            pause:    () => inst.togglePlay?.(),
            next:     () => inst.next?.(),
            prev:     () => inst.prev?.(),
            volume:   (v) => inst.setVolume?.(v)
        }
    };
}
