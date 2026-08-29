/**
 * @file language/language.js
 * @description Language and localization system for Sandstorm OS.
 *
 * ES module that registers `app.language` — the runtime translation API.
 * Exports `setup(os)` (SVG icon + program registration + API initialization)
 * and `start(os, win)` (language settings window).
 *
 * Provides the global `_()` helper which forwards to `app.language.translate()`.
 * Locale files are fetched on demand and cached in `_loaded` to avoid
 * redundant network requests.
 *
 * Boot order: Loads after controlpanel so it can register a settings sidebar item.
 * Boot cleanup: `app.controlpanel.addMenuItem` is removed by load.js after all
 * programs have loaded.
 *
 * @module components/language/language
 */

// ── Installed language metadata ────────────────────────────────────────────
const _LANG_META = {
    en: { name: "English",  nativeName: "English", iso: "ENG", rtl: false },
    sv: { name: "Swedish",  nativeName: "Svenska",  iso: "SWE", rtl: false }
};

// ── Module-level state ─────────────────────────────────────────────────────
let _os;
const _loaded = {}; // tracks which OS-level locale files have been fetched

const _loadedProgram = {};
const _registeredPrograms = new Set();

const _refreshHandlers = new Map();

let _addLanguageWindowOpen = false;

// ══════════════════════════════════════════════════════════════════════════
//  SETUP  (async, awaited by includeProgram during boot)
// ══════════════════════════════════════════════════════════════════════════
export async function setup(os) {
    _os = os;

    // ── 0. Register SVG icon ──────────────────────────────────────────────
    os.svg.global.load({
        id: "ic-language",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.9 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.66-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>`
    });

    // ── 1. Register as background system program ───────────────────────────
    os.program.addInfo("language", {
        name:        "Language System",
        version:     "1.0",
        owner:       "System",
        description: "Language and localization",
        icontype:    "svg",
        icon:        "#ic-language",
        taskbar:     false,
        startmenu:   false,
        multistart:  false,
        main:        "start",
        programtype: "system",
        autorun:     false
    });

    // ── 2. Build app.language namespace ───────────────────────────────────
    os.language = {

        /** Load user's saved language (called once during boot). */
        async load() {
            _applyData("en", await _fetchLocale("en"));

            const saved = os.config.user.settings.language || "en";
            if (saved !== "en" && _LANG_META[saved]) {
                _applyData(saved, await _fetchLocale(saved));
            }
            _activate(saved, true);
        },

        /**
         * Switch to a language — fetches locale file if not yet cached.
         * Also re-fetches every registered program's OWN locale file for
         * this language (see loadProgram()) — a program registered while
         * the user was on English hasn't necessarily ever had its Swedish
         * file fetched, so that has to happen here too, not just at the
         * program's own setup() time.
         * @param {string} langCode
         * @param {{ silent?: boolean }} [opts]
         */
        async set(langCode, opts = {}) {
            if (!_LANG_META[langCode]) {
                os.dev.warn(`Language "${langCode}" is not installed.`, "Language");
                return false;
            }
            if (!_loaded[langCode]) {
                _applyData(langCode, await _fetchLocale(langCode));
            }
            if (langCode !== "en") {
                for (const programId of _registeredPrograms) {
                    await _loadProgramLocale(programId, langCode);
                }
            }
            _activate(langCode);
            return true;
        },

        /**
         * Loads a program's own locale file for the CURRENT active language
         * and registers it so future set() calls also refresh it for that
         * program. English is never fetched — translate()'s own fallback to
         * the raw key already covers it for free, since every `_()` call's
         * literal argument IS the English text. Always registers the
         * programId even on a 404/fetch failure (the program may simply not
         * have a translation for the currently active language yet) — the
         * program must stay in `_registeredPrograms` so a LATER set('sv')
         * still tries to fetch its Swedish file.
         *
         * IMPORTANT: `programId` here must be the program's own FOLDER name
         * under `program/` (e.g. "calc"), NOT necessarily the id it
         * registers via `os.program.addInfo(id, ...)` — those two differ
         * for several programs in this codebase (the `calc` folder
         * registers as `"calculator"`). The fetch path is always
         * `ProgramRoot + programId + '/lang/<code>.json'`, which must match
         * the real folder on disk regardless of what id `addInfo` used.
         * @param {string} programId  the program's folder name under program/
         */
        async loadProgram(programId) {
            _registeredPrograms.add(programId);
            const lang = this.get();
            if (lang !== "en") {
                await _loadProgramLocale(programId, lang);
            }
        },

        /**
         * Registers a callback to re-run whenever the active language
         * changes (see _activate()) — the idiomatic use is registering once
         * per open window (in its body(windowobj) callback) and
         * unregistering on windowobj.on('close', ...), mirroring the
         * existing controlpanel/program.js Task Manager panel's own
         * register/cleanup pattern for its own interval.
         * @param {string} token  unique per registration (e.g. a windowId)
         * @param {Function} fn
         */
        registerRefresh(token, fn) {
            _refreshHandlers.set(token, fn);
        },

        /** Removes a previously registered refresh callback. */
        unregisterRefresh(token) {
            _refreshHandlers.delete(token);
        },

        /** Returns the current ISO 639-1 language code. */
        get() {
            return globalThis.currentLanguage || "en";
        },

        /** Translate a key — falls back to English, then the raw key. */
        translate(key) {
            const lang = this.get();
            const t    = globalThis.translations || {};
            return t[lang]?.[key] ?? t["en"]?.[key] ?? key;
        },

        /**
         * Add translations for a language programmatically.
         * @param {string} langCode
         * @param {Object} data  key→value map
         */
        add(langCode, data) {
            if (!globalThis.translations[langCode]) {
                globalThis.translations[langCode] = {};
            }
            Object.assign(globalThis.translations[langCode], data);
            os.config.local.translations = globalThis.translations;
        },

        /** Returns an array of installed language metadata objects. */
        getInstalled() {
            return Object.entries(_LANG_META).map(([code, meta]) => ({ code, ...meta }));
        }
    };

    // ── 3. Wire global _() to this module ─────────────────────────────────
    globalThis.__translate = (key) => os.language.translate(key);

    // ── 4. Load language data (async, awaited) ────────────────────────────
    await os.language.load();

    // ── 4b. Shell live-refresh ─────────────────────────────────────────────
    os.language.registerRefresh("shell-taskbar-startmenu", () => {
        const setAttr = (sel, attr, text) => {
            const el = document.querySelector(sel);
            if (el) el[attr] = text;
        };
        setAttr("#showDesktopBtn", "title", _("Show desktop"));
        setAttr("#ic-helped",      "title", _("Help"));
        setAttr("#ic-logoff",      "title", _("Logoff"));
        setAttr("#q-search",       "placeholder", _("Search"));
    });

    // ── 4c. Taskbar pinned-icon names ──────────────────────────────────────
    os.language.registerRefresh("shell-taskbar-pinned-icon-names", () => {
        const icons = os.desktop?.taskbar?.config?.taskIcons;
        if (!Array.isArray(icons)) return;
        for (const icon of icons) {
            if (!icon.programid) continue;
            const info = os.program.getInfo(icon.programid);
            if (!info) continue;
            icon.name = info.name; // keep config.taskIcons itself in sync too
            const el = document.getElementById(icon.id);
            const child = el?.querySelector("svg, img");
            if (!child) continue;
            child.setAttribute("title", info.name);
            if (child.tagName === "IMG") child.setAttribute("alt", info.name);
        }
    });

    // ── 4c2. Desktop icon names ─────────────────────────────────────────────
    os.language.registerRefresh("shell-desktop-icon-names", () => {
        document.querySelectorAll(".desktop-icon[data-program]").forEach(el => {
            const programId = el.getAttribute("data-program");
            const info = os.program.getInfo(programId);
            if (!info) return;
            const label = el.querySelector(".desktop-icon-label");
            if (label) label.textContent = app.util.truncate(info.name, 12);
            const tipParts = [info.name];
            if (info.version)     tipParts.push(_("Version")     + ": " + info.version);
            if (info.description) tipParts.push(_("Description") + ": " + info.description);
            el.title = tipParts.join("\n");
        });
    });

    // ── 4d. Start Menu tabs — full rebuild ─────────────────────────────────
    os.language.registerRefresh("shell-startmenu-tabs", () => {
        const tabConfig = os.desktop?.startmenu?.options?.tabConfig;
        if (!tabConfig?.config || !Array.isArray(tabConfig.tabs)) return;
        const { config, tabs } = tabConfig;
        const $tabsContainer = $(config.tabsContainerId);
        const $iconsContainer = $(config.iconsContainerId);
        if (!$tabsContainer.length || !$iconsContainer.length) return;
        const activeIndex = $tabsContainer.children(".active").index();
        $tabsContainer.empty();
        $iconsContainer.empty();
        app.ui.tabs(config, { default: activeIndex >= 0 ? activeIndex : 0, tabs });
    });

    // ── 5. Inject CSS ─────────────────────────────────────────────────────
    _injectCSS();

    // ── 6. Register taskbar status icon ───────────────────────────────────
    os.desktop.taskbar.setStatusIcon({
        id:    "languageIcon",
        class: "icon text-icon",
        text:  _LANG_META[os.language.get()].iso,
        style: "color:#ffffff;font-size:11px;;",
        title: "Language",
        click(e) {
            os.ui.toggle.window({
                windowId:     "#languageMenu",
                iconSelector: ".text-icon",
                gap:          10,
                width:        "250px",
                height:       "200px",
                class:        "language-toggle-window",
                body() {
                    return _menuHTML();
                }
            });

            setTimeout(() => _bindMenuEvents(), 0);
        }
    });

    // ── 7. Register Language tab in controlpanel launcher ────────────────
    if (typeof os.controlpanel?.add === "function") {
        os.controlpanel.add({
            front: {
                name:     'language',
                icon:     '#ic-language',
                type:     'svg',
                label:    () => _('Language'),
                keywords: ['language', 'locale', 'translation', 'lang']
            },
            panel: {
                id:   'language',
                name: () => _('Language'),
                searchItems: [
                    { id: 'lang-add-btn-wrap', label: () => _('Add Language'), keywords: ['add', 'language', 'new', 'locale', 'install'] },
                ],
                render() {
                    setTimeout(_bindPanelEvents, 0);
                    return _panelHTML();
                }
            }
        });
    }

    // ── 8. Expose standalone controlpanel window opener ───────────────────
    if (os.controlpanel?.window) {
        os.controlpanel.window.language = () => {
            os.program.controlpanel.open('language');
            os.controlpanel.window.main();
        };
    }

}

// ══════════════════════════════════════════════════════════════════════════
//  START  (entry point if user opens Language from start menu)
// ══════════════════════════════════════════════════════════════════════════
export function start() {
    _openWindow();
}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — language loading & activation
// ══════════════════════════════════════════════════════════════════════════

async function _fetchLocale(langCode) {
    if (_loaded[langCode]) return {};
    const path = _os.config.local.ComponentsRoot + `language/locales/${langCode}.json`;
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        _loaded[langCode] = true;
        return json[langCode] ?? json;
    } catch (e) {
        _os.dev.warn(`Could not load locale "${langCode}": ${e.message}`, "Language");
        _loaded[langCode] = true;
        return {};
    }
}

/**
 * Fetches one program's own locale file for one language and merges it into
 * the same shared `globalThis.translations` table `_applyData` writes to —
 * _() doesn't care which file a key came from, so a program's translations
 * are looked up exactly the same way the OS-level ones are. Cache-keyed by
 * `${langCode}:${programId}`, NOT by langCode alone (see `_loadedProgram`'s
 * own comment) — a 404 here is a normal "this program has no translation
 * for this language yet", not an error worth surfacing loudly.
 */
async function _loadProgramLocale(programId, langCode) {
    const cacheKey = `${langCode}:${programId}`;
    if (_loadedProgram[cacheKey]) return;
    _loadedProgram[cacheKey] = true;
    const path = _os.config.local.ProgramRoot + `${programId}/lang/${langCode}.json`;
    try {
        const res = await fetch(path);
        if (!res.ok) return; // no translation file for this program+language yet
        const json = await res.json();
        _applyData(langCode, json[langCode] ?? json);
    } catch (e) {
        _os.dev.warn(`Could not load "${programId}" locale "${langCode}": ${e.message}`, "Language");
    }
}

function _applyData(langCode, data) {
    if (!globalThis.translations)          globalThis.translations = {};
    if (!globalThis.translations[langCode]) globalThis.translations[langCode] = {};
    Object.assign(globalThis.translations[langCode], data);
    _os.config.local.translations = globalThis.translations;
}

function _activate(langCode, silent = false) {
    globalThis.currentLanguage        = langCode;
    _os.config.local.currentLanguage  = langCode;
    _os.config.user.settings.language = langCode;

    const iso = _LANG_META[langCode]?.iso ?? langCode.toUpperCase();

    // Update taskbar text icon (updates config + live DOM)
    _os.desktop?.taskbar?.updateStatusIconText?.("languageIcon", iso);

    // Fallback: direct DOM update if taskbar method is unavailable
    if (typeof _os.desktop?.taskbar?.updateStatusIconText !== "function") {
        const el = $("#languageIcon")[0];
        if (el) el.textContent = iso;
    }

    if (!silent) {
        document.dispatchEvent(new CustomEvent("languageChanged", {
            detail: { lang: langCode, meta: _LANG_META[langCode] }
        }));

        for (const fn of Array.from(_refreshHandlers.values())) {
            try { fn(); } catch (e) { _os.dev.warn(`Refresh handler failed: ${e.message}`, "Language"); }
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — toggle-window menu content
// ══════════════════════════════════════════════════════════════════════════

function _menuHTML() {
    const installed = _os.language.getInstalled();
    const current   = _os.language.get();

    const items = installed.map(l => `
        <div class="lm-item${l.code === current ? " lm-active" : ""}" data-lang="${l.code}">
            <span class="lm-check">${l.code === current ? "✓" : ""}</span>
            <span class="lm-info">
                <span class="lm-native">${app.util.escapeHtml(l.nativeName)}</span>
                <span class="lm-eng">${app.util.escapeHtml(l.name)}</span>
            </span>
            <span class="lm-iso">${app.util.escapeHtml(l.iso)}</span>
        </div>`).join("");

    return `
        <div class="lm-wrap">
            <div class="lm-header">${_("Language")}</div>
            <div class="lm-list">${items}</div>
            <div class="lm-sep"></div>
            <div class="lm-more" id="lm-more-btn">${_("More settings")}</div>
        </div>`;
}

function _bindMenuEvents() {
    const menu = $("#languageMenu")[0];
    if (!menu || menu._bound) return;
    menu._bound = true;

    menu.addEventListener("click", async function (e) {
        const item = e.target.closest(".lm-item[data-lang]");
        if (item) {
            e.stopPropagation();
            const lang = item.dataset.lang;
            $("#languageMenu").remove();
            try { await _os.language.set(lang); } catch (_) {}
            return;
        }
        if (e.target.closest("#lm-more-btn")) {
            $("#languageMenu").remove();
            _openWindow();
        }
    });
}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — controlpanel panel content
// ══════════════════════════════════════════════════════════════════════════

function _panelHTML() {
    const installed = _os.language.getInstalled();
    const current   = _os.language.get();

    const langRowNodes = installed.map(l => {
        const active = l.code === current;
        return {
            block: {
                id: `lang-row-${l.code}`,
                style: 'display:contents;',
                search: { label: () => `${l.nativeName} — ${l.name}`, keywords: [l.code, l.iso.toLowerCase(), l.name.toLowerCase(), l.nativeName.toLowerCase(), 'language'] },
                html: `<div class="lp-row${active ? ' lp-active' : ''}" data-lang="${l.code}">
                    <span class="lp-radio-indicator${active ? ' active' : ''}">
                        <div class="after${active ? ' pulse' : ''}"></div>
                    </span>
                    <div class="lp-info">
                        <span class="lp-native">${app.util.escapeHtml(l.nativeName)}</span>
                        <span class="lp-eng">${app.util.escapeHtml(l.name)}</span>
                    </div>
                    <span class="lp-iso">${app.util.escapeHtml(l.iso)}</span>
                    ${active ? `<span class="lp-badge">${_('Active')}</span>` : ''}
                </div>`
            }
        };
    });

    const layout = {
        container: {
            style: 'margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;',
            subs: [{
                block: {
                    style: 'min-width:575px;max-width:1024px;width:100%;',
                    subs: [
                        { block: { className: 'h1', html: _('Language') } },
                        { block: { className: 'p',  html: _('Language settings') } },
                        { block: { className: 'line' } },
                        { block: {
                            style: 'display:flex;justify-content:flex-end;margin-bottom:8px;',
                            subs: [{
                                block: {
                                    id: 'lang-add-btn-wrap',
                                    style: 'display:contents;',
                                    search: { label: () => _('Add Language'), keywords: ['add', 'language', 'new', 'locale', 'install'] },
                                    html: `<button class="aero-button m" id="lp-add-lang-btn">
                                        <div class="after pulse"></div>${_('Add Language')}
                                    </button>`
                                }
                            }]
                        }},
                        { block: { className: 'lp-list', subs: langRowNodes } }
                    ]
                }
            }]
        }
    };

    return _os.ui.body(layout, { programid: 'controlpanel', panelId: 'language' }).render();
}

function _bindPanelEvents() {
    document.querySelectorAll(".lp-row[data-lang]").forEach(row => {
        row.addEventListener("click", async () => {
            const lang = row.dataset.lang;
            if (row.classList.contains("lp-active")) return;
            await _os.language.set(lang);
            const cp = $("#cp-tab-content")[0];
            if (cp) { cp.innerHTML = _panelHTML(); _bindPanelEvents(); }
        });
    });

    $("#lp-add-lang-btn").on("click", e => {
        e.stopPropagation();
        _openAddLanguageDialog();
    });
}

function _openAddLanguageDialog() {
    if (_addLanguageWindowOpen) return;
    _addLanguageWindowOpen = true;

    const uid = 'add-lang-' + Date.now();
    try {
        _os.ui.windowStart('controlpanel', {
            id: uid,
            title: _('Add Language'),
            width: '400px',
            height: '330px',
            resizable: false,
            body(windowobj) {
                windowobj?.on?.('close', () => { _addLanguageWindowOpen = false; });

                setTimeout(() => {
                    const root = windowobj?.el?.[0];
                    if (!root) return;

                    root.querySelector('#add-lang-cancel')?.addEventListener('click', e => {
                        e.stopPropagation();
                        windowobj?.close?.();
                    });

                    root.querySelector('#add-lang-save')?.addEventListener('click', e => {
                        e.stopPropagation();
                        const code       = root.querySelector('#al-code')?.value?.trim().toLowerCase();
                        const name       = root.querySelector('#al-name')?.value?.trim();
                        const nativeName = root.querySelector('#al-native')?.value?.trim();
                        const iso        = root.querySelector('#al-iso')?.value?.trim().toUpperCase();

                        if (!code || !name || !nativeName || !iso) {
                            _os.ui?.alert?.({ title: _('Error'), message: _('All fields are required'), confirm: _('OK') });
                            return;
                        }
                        if (_LANG_META[code]) {
                            _os.ui?.alert?.({ title: _('Error'), message: _('Language code already exists'), confirm: _('OK') });
                            return;
                        }

                        _LANG_META[code] = { name, nativeName, iso, rtl: false };
                        _os.language.add(code, {});
                        windowobj?.close?.();

                        const cp = $('#cp-tab-content')[0];
                        if (cp) { cp.innerHTML = _panelHTML(); _bindPanelEvents(); }
                    });
                }, 0);

                return `
                <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
                    <div class="input-def">
                        <input type="text" id="al-code" placeholder=" " maxlength="10">
                        <label>${_('Language Code')} &nbsp;en, sv, fr …</label>
                    </div>
                    <div class="input-def">
                        <input type="text" id="al-name" placeholder=" ">
                        <label>${_('Name')} &nbsp;English, French …</label>
                    </div>
                    <div class="input-def">
                        <input type="text" id="al-native" placeholder=" ">
                        <label>${_('Native Name')} &nbsp;Svenska, Français …</label>
                    </div>
                    <div class="input-def">
                        <input type="text" id="al-iso" placeholder=" " maxlength="3">
                        <label>${_('ISO Code')} &nbsp;ENG, SWE, FRA …</label>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
                        <button class="aero-button m" id="add-lang-cancel">
                            <div class="after"></div>${_('Cancel')}
                        </button>
                        <button class="aero-button m" id="add-lang-save">
                            <div class="after pulse"></div>${_('Add')}
                        </button>
                    </div>
                </div>`;
            }
        });
    } catch (err) {
        _addLanguageWindowOpen = false;
        _os.ui?.alert?.({ title: _('Error'), message: String(err?.message || err), confirm: _('OK') });
    }
}

function _openWindow() {
    _os.program.controlpanel.open('language');
    _os.controlpanel.window.main();
}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — CSS
// ══════════════════════════════════════════════════════════════════════════

function _injectCSS() {
    _os.addCSS("language-system", `


/* ── Language toggle-window (uses .toggleWindow base from ui/toggleWindow.js) */
.language-toggle-window {
    overflow: hidden;
}

.lm-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #fff;
}
.lm-header {
    padding: 10px 14px 8px;
    font-size: 10px;
    font-weight: 700;
    color: var(--theme-fontcolor);
    text-transform: uppercase;
    letter-spacing: 0.07em;
}
.lm-list {
    flex: 1;
    overflow-y: auto;
}
.lm-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: default;
    user-select: none;
    transition: background 0.12s;
    border-radius: 6px;
    margin: 0 4px;
}
.lm-item:hover  {  background-color: var(--theme-backgruondcolorc);}
.lm-active      { color: var(--theme-fontcolor); }
.lm-check       { width: 14px; font-size: 12px; flex-shrink: 0; }
.lm-info        { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.lm-native      { font-size: 13px; font-weight: 500; }
.lm-eng         { font-size: 10px; var(--theme-fontcolor); }
.lm-iso         {
    font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
    color: var(--theme-fontcolor);
    flex-shrink: 0;
}
.lm-sep         { height: 1px;margin: 4px 8px; }
.lm-more {
    padding: 8px 14px;
    cursor: default;
    font-size: 12px;
    color: var(--theme-fontcolor);

    transition: background 0.12s, color 0.12s;
    border-radius: 6px;
    margin: 0 4px 4px;
}
.lm-more:hover { background-color: var(--theme-backgruondcolorc);}

/* ── Language control-panel panel ────────────────────────────────────── */
.lp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 16px;
}
.lp-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--theme-backgruondcolora, #00000040);
    transition: background 0.15s;
    cursor: default;
    user-select: none;
}
.lp-row:not(.lp-active):hover {
    background-color: var(--theme-backgruondcolorc, #00000040);
    animation: fadeInOut 3s ease infinite;
    animation-delay: 1s;
}
.lp-active { background: var(--theme-backgruondcolorc, #00000040) !important; }
.lp-radio-indicator {
    position: relative;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(
        to top,
        rgb(53 53 53 / 50%) 1%,
        rgb(53 53 53 / 50%) 12%,
        rgb(0 0 0 / 50%) 33%,
        rgb(0 0 0 / 50%) 50%,
        rgb(39 39 39 / 50%) 51%,
        rgb(104 104 104 / 50%) 100%
    );
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.12);
    overflow: hidden;
    flex-shrink: 0;
    transition: box-shadow 0.2s;
}
.lp-radio-indicator.active {
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.22);
}
.lp-radio-indicator .after {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, 40%);
    width: 9px;
    height: 9px;
    border-radius: 50%;
    filter: blur(4px);
    background: var(--background-radial);
    opacity: 0;
    transition: 0.5s ease;
}
.lp-radio-indicator .after.pulse {
    animation: pulse 3s infinite;
}
.lp-info   { display: flex; flex-direction: column; flex: 1; }
.lp-native { font-size: 14px; font-weight: 500; color: #fff; }
.lp-eng    { font-size: 12px; color: rgba(255,255,255,0.5); }
.lp-iso {
    font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
    color: var(--theme-fontcolor);
    background: rgba(255,255,255,0.08);
    padding: 2px 8px;
    border-radius: 4px;
}
.lp-active .lp-native,
.lp-active .lp-eng,
.lp-active .lp-badge { color: var(--theme-fontcolor); }
.lp-badge  { font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 600; }
`);
}
