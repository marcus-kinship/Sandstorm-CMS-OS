/**
 * @file fonts.js
 * @description Core font registry for Sandstorm OS.
 *
 * Registers `app.fonts` — a single place any program can register, look up,
 * or remove a font by name, instead of each program keeping its own
 * hardcoded font list (Designer's text toolbar and Notepad's font picker
 * both read from this same registry via `get()`). Pre-populates a curated
 * set of 32 standard web-safe + common web-font names at boot (no network
 * load needed — they're already available through the OS/browser or, for
 * the web-font names, loaded on demand by whichever program actually
 * applies one — see `program/notepad/notepad_data.js`'s `loadGF()`, a
 * Notepad-internal loading detail unrelated to this shared name list), so
 * callers have real content immediately; more fonts (including real
 * webfonts loaded from a URL via the FontFace API) can be registered later
 * by any program calling `app.fonts.set(...)`.
 *
 * @module components/fonts
 *
 * @example
 * app.fonts.set({ name: 'Inter', url: '/fonts/inter.woff2' })
 *   .then(() => console.log('Inter is ready to use'))
 *   .catch(err => console.warn('rejected:', err));
 * app.fonts.get();           // → [{name:'Arial',...}, {name:'Georgia',...}, ...] sorted by name
 * app.fonts.get('Arial');    // → {name:'Arial', url:null, config:{}, fontFace:null}
 * app.fonts.remove('Inter');
 */
(function (app) {

    /** @type {Map<string, {name:string, url:string|null, config:object, fontFace:FontFace|null}>} */
    const _fonts = new Map();

    const FONT_EXTENSIONS = ['woff', 'woff2', 'ttf', 'otf'];
    const FONT_CONTENT_TYPES = [
        'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
        'application/font-woff', 'application/x-font-ttf', 'application/vnd.ms-fontobject',
        'application/octet-stream' // many static hosts mislabel fonts this way — treated as "unverifiable", not "wrong"
    ];
    // Types a font URL should never legitimately have — a successful HEAD
    // response reporting one of these is treated as a real rejection (e.g.
    // a .js file renamed with a .woff extension, or a URL that 404s into an
    // HTML error page). Anything else unrecognized is left alone: this is a
    // best-effort check, not a full allowlist enforcement.
    const CLEARLY_WRONG_CONTENT_TYPES = ['text/html', 'text/javascript', 'application/javascript', 'application/json'];

    function extensionOf(url) {
        const clean = String(url || '').split(/[?#]/)[0];
        const match = clean.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : '';
    }

    /**
     * Best-effort URL validation before handing a font off to `FontFace`.
     * Rejects immediately (no network) for an obviously-wrong extension.
     * Otherwise does a HEAD request and only rejects on a *successfully
     * read* Content-Type that's clearly not a font — a blocked/failed HEAD
     * (CORS, network error, server doesn't support HEAD, ...) is not
     * treated as a rejection, since plenty of legitimate font CDNs behave
     * that way; `FontFace.load()` itself remains the final authority.
     * @param {string} url
     * @returns {Promise<void>} Resolves if the URL is acceptable to try loading.
     */
    function validateFontUrl(url) {
        const ext = extensionOf(url);
        if (!FONT_EXTENSIONS.includes(ext)) {
            const msg = `app.fonts: rejected URL "${url}" — expected one of .${FONT_EXTENSIONS.join('/.')}, got "${ext || '(no extension)'}"`;
            app.dev.error(msg);
            return Promise.reject(new Error(msg));
        }

        return fetch(url, { method: 'HEAD' })
            .then(res => {
                const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
                if (type && CLEARLY_WRONG_CONTENT_TYPES.includes(type)) {
                    const msg = `app.fonts: rejected URL "${url}" — server reports Content-Type "${type}", not a font`;
                    app.dev.error(msg);
                    return Promise.reject(new Error(msg));
                }
                // Recognized font type, generic octet-stream, or anything
                // else unrecognized-but-not-clearly-wrong — proceed either way.
            })
            .catch(err => {
                if (err instanceof Error && CLEARLY_WRONG_CONTENT_TYPES.some(t => err.message.includes(t))) throw err; // our own rejection above — propagate
                app.dev.warn(`app.fonts: HEAD request for "${url}" failed (CORS/network) — proceeding to FontFace.load() anyway`, err);
                // swallow — not treated as rejection
            });
    }

    /**
     * Registers a font by name. Always returns a Promise, whether or not
     * `url` is given, so callers never need to branch on which kind of
     * registration they made. If `url` is given, it's validated (see
     * `validateFontUrl`) and then loaded via the `FontFace` API and added
     * to `document.fonts` — the returned Promise resolves once the font is
     * actually usable. A name-only registration (no `url` — used for all
     * 32 pre-registered boot fonts, already available through the OS/
     * browser) resolves immediately, no network involved.
     * @param {Object} options
     * @param {string} options.name
     * @param {string} [options.url]
     * @param {Object} [options.config] - FontFace descriptors (style, weight, unicodeRange, ...).
     * @returns {Promise<{name:string,url:string|null,config:object,fontFace:FontFace|null}>}
     */
    function set({ name, url, config = {} } = {}) {
        if (!name) {
            app.dev.error('app.fonts.set: name is required');
            return Promise.reject(new Error('app.fonts.set: name is required'));
        }

        if (!url) {
            const entry = { name, url: null, config, fontFace: null };
            _fonts.set(name, entry);
            return Promise.resolve(entry);
        }

        return validateFontUrl(url).then(() => {
            const entry = { name, url, config, fontFace: null };
            try {
                const fontFace = new FontFace(name, `url(${url})`, config);
                entry.fontFace = fontFace;
                return fontFace.load().then(loaded => {
                    document.fonts.add(loaded);
                    _fonts.set(name, entry);
                    return entry;
                }).catch(err => {
                    app.dev.warn(`app.fonts: failed to load "${name}" from ${url}`, err);
                    throw err;
                });
            } catch (err) {
                app.dev.warn(`app.fonts: invalid font descriptor for "${name}"`, err);
                return Promise.reject(err);
            }
        });
    }

    /**
     * @param {string} [name] - Omit to get every registered font.
     * @returns {Array|Object|null} All entries (sorted by name) when `name`
     * is omitted; a single entry or `null` when given.
     */
    function get(name) {
        if (name === undefined) {
            return [..._fonts.values()].sort((a, b) => a.name.localeCompare(b.name));
        }
        return _fonts.get(name) || null;
    }

    /**
     * Unregisters a font and removes its `FontFace` from `document.fonts`
     * if it had one. Deliberately does not walk existing documents to clear
     * out now-dangling `fontFamily` references — those just fall back to
     * the browser's default font, same as any other missing font-family.
     * @param {string} name
     * @returns {boolean} True if a font by that name was registered.
     */
    function remove(name) {
        const entry = _fonts.get(name);
        if (!entry) return false;
        if (entry.fontFace) document.fonts.delete(entry.fontFace);
        _fonts.delete(name);
        return true;
    }

    // Standard web-safe fonts + common web-font names shared with Notepad's
    // own picker (program/notepad/notepad_data.js) — name-only, no url/
    // FontFace load. The web-font names (Roboto, Open Sans, ...) aren't
    // preloaded here; Notepad's own loadGF() fetches their actual stylesheet
    // on demand when one is applied — a rendering detail separate from this
    // shared "which names exist" list.
    [
        'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact',
        'Lucida Console', 'Palatino Linotype', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
        'Verdana', 'Helvetica', 'Geneva', 'Monaco', 'Monospace',
        'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro', 'Oswald', 'Raleway',
        'Ubuntu', 'PT Sans', 'Nunito', 'Merriweather', 'Playfair Display', 'Noto Sans',
        'Josefin Sans', 'Poppins', 'Quicksand'
    ].forEach(name => set({ name }));

    app.fonts = { set, get, remove };
    app.lock('fonts.*', { writable: false, configurable: false });
})(window.app = window.app || {});
