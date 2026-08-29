/**
 * @file sandstorm.gen.js
 * @description Sandstorm OS primary boot script.
 *
 * This is the first script tag loaded by the HTML shell. It is responsible for:
 * - Injecting a dark boot-shield `<style>` synchronously to prevent flash-of-white
 * - Rendering the loading screen at DOMContentLoaded (before any async imports)
 * - Initialising the global `app` object with its core namespace
 * - Defining the global `_()` translation helper that delegates to `app.language.translate()`
 * - Bootstrapping the Sandstorm module loader via dynamic `import()` of `sandstorm/core/modules.js`
 *
 * @module sandstorm.gen
 */
(function (globalThis) {
    globalThis.__sandstormBootMouse = null;
    document.addEventListener('pointermove', function trackBootMouse(e) {
        globalThis.__sandstormBootMouse = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    // Boot shield — inject <style> synchronously so html+body are dark before first paint
    const _bootStyle = document.createElement('style');
    _bootStyle.textContent = 'html,body{background:#000000;margin:0}';
    (document.head || document.documentElement).appendChild(_bootStyle);

    document.addEventListener('DOMContentLoaded', function () {
        if (document.getElementById('load-screen')) return;

        const _phaseStyle = document.createElement('style');
        _phaseStyle.id = 'loadcss-phase';
        _phaseStyle.textContent = `
            .loading-screen{opacity:0;transition:opacity .3s ease-out}
            .loading-screen.ls-bg-in{opacity:1}
            .ls-spinner-wrap{opacity:0;transition:opacity .1s ease-out}
            .ls-spinner-wrap.ls-spin-in{opacity:1}
            .ls-spinner-wrap.ls-spin-out{opacity:0;transition:opacity .3s ease-out}
        `;
        document.head.appendChild(_phaseStyle);

        const _spinCSS = document.createElement('style');
        _spinCSS.id = 'loadcss';
        _spinCSS.textContent = `
            .loader{width:48px;height:48px;border:5px solid #FFF;border-bottom-color:transparent;
            border-radius:50%;display:block;margin:auto;box-sizing:border-box;
            animation:rotation 1s linear infinite}
            @keyframes rotation{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        `;
        document.head.appendChild(_spinCSS);

        const _overlay = document.createElement('div');
        _overlay.id = 'load-screen';
        _overlay.className = 'loading-screen ls-bg-in'; // bg visible immediately, no fade-in
        Object.assign(_overlay.style, {
            position:'fixed', top:'0', left:'0', width:'100%', height:'100%',
            backgroundColor:'#000000', display:'flex',
            justifyContent:'center', alignItems:'center',
            zIndex:'11999', cursor:'wait'
        });

        const _wrap = document.createElement('div');
        _wrap.className = 'ls-spinner-wrap';
        const _inner = document.createElement('div');
        _inner.innerHTML = '<span class="loader"></span>';
        _wrap.appendChild(_inner);
        _overlay.appendChild(_wrap);
        document.body.appendChild(_overlay);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            _wrap.classList.add('ls-spin-in');
        }));
    }, { once: true });

    // List of basic HTML tags to check and add if missing
    const tagsToCheck = [
        {
            tag: "doctype",
            description: "<!DOCTYPE html>",
            check: () => document.doctype && document.doctype.name === "html",
        },
        {
            tag: "html",
            description: "html",
            check: () => document.documentElement?.tagName === "HTML",
            // Never attempt to replace the document root — just validate
        },
        {
            tag: "head",
            description: "head",
            create: () => {
                const el = document.createElement("head");
                document.documentElement.insertBefore(el, document.body ?? null);
            },
        },
        {
            tag: "body",
            description: "body",
            create: () => {
                const el = document.createElement("body");
                document.documentElement.appendChild(el);
            },
        },
        {
            tag: "title",
            description: "title",
            create: () => {
                const el = document.createElement("title");
                document.head.appendChild(el);
            },
        },
        {
            tag: "meta[charset]",
            description: "meta charset",
            create: () => {
                const el = document.createElement("meta");
                el.setAttribute("charset", "UTF-8");
                document.head.appendChild(el);
            },
        },
        {
            tag: 'meta[name="viewport"]',
            description: "meta viewport",
            create: () => {
                const el = document.createElement("meta");
                el.setAttribute("name", "viewport");
                el.setAttribute("content", "width=device-width, initial-scale=1.0");
                document.head.appendChild(el);
            },
        },
        {
            tag: 'meta[http-equiv="Content-Type"]',
            description: "meta content-type",
            create: () => {
                const el = document.createElement("meta");
                el.setAttribute("http-equiv", "Content-Type");
                el.setAttribute("content", "text/html;charset=UTF-8");
                document.head.appendChild(el);
            },
        },
        {
            tag: "style",
            description: "style",
            create: () => {
                const el = document.createElement("style");
                el.id = "s_css";
                document.head.appendChild(el);
            },
        },
    ];

    // ── Private helpers ───────────────────────────────────────────────────────

    // Default language
    globalThis.currentLanguage = "en";
    globalThis.translations = { "en": {} };

    function _(text) {
        if (typeof globalThis.__translate === "function") return globalThis.__translate(text);
        const t = globalThis.translations || {};
        const lang = globalThis.currentLanguage || "en";
        return t[lang]?.[text] ?? t["en"]?.[text] ?? text;
    }
    globalThis._ = _;

    function printf(text, ...args) {
        let i = 0;
        return text.replace(/%[sd]/g, match => {
            if (i >= args.length) return match;
            const value = args[i++];
            if (match === "%d") {
                const n = Number(value);
                return isNaN(n) ? "NaN" : String(n);
            }
            return String(value ?? '');
        });
    }
    globalThis.printf = printf;

    // ── Boot guard — validates DOM before anything else runs ─────────────────

    function bootstrapGuard() {
        if (!document.documentElement || document.documentElement.tagName !== "HTML") {
            throw new Error("Sandstorm: Invalid DOM root — <html> is missing or corrupt. Cannot boot.");
        }
        if (!document.head) {
            const head = document.createElement("head");
            document.documentElement.insertBefore(head, document.body ?? null);
            console.warn("Sandstorm: Missing <head> — created safely.");
        }
        if (!document.body) {
            const body = document.createElement("body");
            document.documentElement.appendChild(body);
            console.warn("Sandstorm: Missing <body> — created safely.");
        }
    }

    // ── Error overlays (exposed on globalThis so sub-modules can use them) ───

    globalThis.showErrorOverlay = function ({ title = "", errorMessage = "", exit = "", className = "ErrorOverlay" }) {
        const overlay = document.createElement('div');
        overlay.className = className;
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: #283869;
            color: white;
            z-index: 19000;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease-out;
        `;
        overlay.innerHTML = `
            <div style="
                max-width:790px;
                width:75%;
                margin:0 auto;
                padding:20px;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
            ">
                <h1 style="font-size:30px;"></h1>
                <p style="font-size:16px;"></p>
            </div>
        `;
        overlay.querySelector('h1').textContent = title;
        overlay.querySelector('p').textContent = errorMessage;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        }));
        if (exit !== "") throw new Error(exit);
    };

    globalThis.removeErrorOverlay = function (element = "") {
        if (element && document.querySelector(element)) {
            const overlay = document.querySelector(element);
            overlay.style.transition = 'opacity 0.3s ease-out';
            overlay.style.opacity = '0';
            overlay.addEventListener('transitionend', () => overlay.remove());
        } else {
            console.error('Element not found or invalid selector.');
        }
    };

    // ── sandstorm() ──────────────────────────────────────────────────────────

    function sandstorm(callback) {
        const base = location.href.substring(0, location.href.lastIndexOf("/") + 1);

        globalThis.app = {
            config: {
                local: {
                    activeWindowId: null,
                    systemFiles: [],
                    currentLanguage: globalThis.currentLanguage || "en",
                    languages: [],
                    translations: globalThis.translations || {},
                    hasAccessLink: base + "/api/js/check/access",
                    jsapiLink: "/demo/api/jsapi",
                    ProgramRoot: base + "program/",
                    ResourcesRoot: base + "res/",
                    ComponentsRoot: base + "sandstorm/components/",
                    breakpoints: {
                        mobile:  700,
                        tablet:  1024,
                        taskbar: 705,
                    },
                    dev: true,
                    allowedExternalDomains: [],
                    allowedBasePaths: [
                        '/sandstorm/',
                        '/res/',
                        '/program/',
                        '/components/'
                    ],
                },
                user: {}
            },

            uuid: function () {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            },

            sleep: function (ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            },

            exists: function (path) {
                const parts = path.split('.');
                let obj = window;
                return parts.every(p => (obj = obj?.[p]) !== undefined);
            },

            registry: {
                _items: new Map(),

                add(name, fn, { parallel = true } = {}) {
                    this._items.set(name, { fn, parallel, status: 'pending' });
                    return this;
                },

                remove(name) {
                    this._items.delete(name);
                    return this;
                },

                has(name) {
                    return this._items.has(name);
                },

                async run() {
                    const parallel = [], sequential = [];
                    for (const [name, item] of this._items) {
                        (item.parallel ? parallel : sequential).push({ name, item });
                    }
                    if (parallel.length) {
                        await Promise.allSettled(
                            parallel.map(({ name, item }) => this._execute(name, item))
                        );
                    }
                    for (const { name, item } of sequential) {
                        await this._execute(name, item);
                    }
                },

                async _execute(name, item) {
                    item.status = 'running';
                    try {
                        await item.fn();
                        item.status = 'done';
                        globalThis.app.dev.log(`Registry: ${name} done`, "Registry");
                    } catch (err) {
                        const is404 = /404|not found|failed to fetch/i.test(err?.message ?? '');
                        item.status = is404 ? 'not-found' : 'failed';
                        globalThis.app.dev.warn(`Registry: ${name} ${item.status} — ${err?.message}`, "Registry");
                    }
                }
            },

            lifecycle: {
                _handlers: Object.create(null),
                on(event, fn) {
                    (this._handlers[event] ??= []).push(fn);
                },
                once(event, fn) {
                    const w = (...a) => { this.off(event, w); fn(...a); };
                    this.on(event, w);
                },
                off(event, fn) {
                    if (!this._handlers[event]) return;
                    this._handlers[event] = this._handlers[event].filter(f => f !== fn);
                },
                emit(event, ...args) {
                    (this._handlers[event] ?? []).slice().forEach(fn => fn(...args));
                }
            },

            // ── dev ──────────────────────────────────────────────────────────
            dev: {
                _currentCategory: "general",

                updateCategory: function (category) {
                    this._currentCategory = category || "general";
                },

                _formatArg: function (arg) {
                    if (arg instanceof HTMLElement) {
                        return arg.id ? `<${arg.tagName.toLowerCase()} id="${arg.id}">` : `<${arg.tagName.toLowerCase()}>`;
                    } else if (Array.isArray(arg)) {
                        return `[${arg.slice(0, 10).map(this._formatArg.bind(this)).join(", ")}${arg.length > 10 ? ", ..." : ""}]`;
                    } else if (arg !== null && typeof arg === "object") {
                        return `{${Object.keys(arg).join(", ")}}`;
                    } else {
                        return String(arg);
                    }
                },

                logIfDev: function (message, logType = "log", category, file, line) {
                    category = category || this._currentCategory;
                    const logEntry = {
                        message: typeof message === "function" ? "[Function]" : message,
                        logType,
                        category,
                        file,
                        line,
                        timestamp: new Date(),
                    };
                    if (!this.logHistory) this.logHistory = [];
                    this.logHistory.push(logEntry);
                    if (typeof message === "function") message();
                },

                _handleArgs: function (args) {
                    args = Array.from(args);
                    let category = this._currentCategory;
                    if (args.length && typeof args[args.length - 1] === "string") {
                        category = args.pop();
                    }
                    args = args.map(this._formatArg.bind(this));
                    return { args, category };
                },

                _parseStack: function () {
                    try {
                        const stack = new Error().stack;
                        if (!stack) return { file: "?", line: "?" };

                        const lines = stack.split("\n").map(l => l.trim()).filter(Boolean);

                        const isV8 = /^Error/.test(lines[0] ?? "");
                        const frame = lines[isV8 ? 3 : 2] ?? "";

                        let m = frame.match(/at\s+(?:.*?\s+\()?([^()]*\.js):(\d+)/);
                        if (m) return { file: m[1].split('/').pop(), line: m[2] };

                        m = frame.match(/@(.*?\.js):(\d+)/);
                        if (m) return { file: m[1].split('/').pop(), line: m[2] };

                        return { file: "?", line: "?" };
                    } catch {
                        return { file: "?", line: "?" };
                    }
                },

                log: function (...args) {
                    if (!globalThis.app.config.local.dev) return;
                    const { args: messages, category } = this._handleArgs(args);
                    const { file, line } = this._parseStack();
                    const message = messages.join(" ");
                    console.log(`[${category}] ${message}  ${file}:${line}`);
                    this.logIfDev(message, "log", category, file, line);
                },

                warn: function (...args) {
                    if (!globalThis.app.config.local.dev) return;
                    const { args: messages, category } = this._handleArgs(args);
                    const { file, line } = this._parseStack();
                    const message = messages.join(" ");
                    console.warn(`[${category}] ${message}  ${file}:${line}`);
                    this.logIfDev(message, "warn", category, file, line);
                },

                error: function (...args) {
                    if (!globalThis.app.config.local.dev) return;
                    const { args: messages, category } = this._handleArgs(args);
                    const { file, line } = this._parseStack();
                    const message = messages.join(" ");
                    console.error(`[${category}] ${message}  ${file}:${line}`);
                    this.logIfDev(message, "error", category, file, line);
                },

                fun: function (fn, ...args) {
                    const category = typeof args[args.length - 1] === "string" ? args.pop() : this._currentCategory;
                    if (typeof fn === "function") {
                        this.logIfDev(fn, "log", category);
                    } else {
                        console.warn("Provided argument is not a function");
                    }
                },

                show: function (...args) {
                    const { args: messages, category } = this._handleArgs(args);
                    console.log(`[ON SCREEN][${category}]`, ...messages);
                    globalThis.showErrorOverlay({
                        title: "Fatal Error",
                        errorMessage: messages.join("\n"),
                        className: `ErrorOverlay${category}`
                    });
                    return this;
                }
            },

            // ── lock ─────────────────────────────────────────────────────────
            lock: function (path, options = { writable: false, configurable: false }, exclusions = []) {
                const parts = path.split(".");
                let current = globalThis.app;
                let wildcardIndex = parts.indexOf("*");

                if (path.includes('not(')) {
                    const exclusionMatch = path.match(/not\(([^)]+)\)/);
                    if (exclusionMatch) {
                        const exclusionList = exclusionMatch[1].split(',').map(item => item.trim());
                        path = path.replace(/not\([^)]+\)/, '');
                        this.lock(path, options, exclusionList);
                        return;
                    }
                }

                if (wildcardIndex !== -1) {
                    for (let i = 0; i < wildcardIndex; i++) {
                        if (!current[parts[i]]) {
                            this.dev.warn(`Path "${parts.slice(0, i + 1).join('.')}" does not exist. Cannot lock wildcard level.`);
                            return;
                        }
                        current = current[parts[i]];
                    }
                    for (const key in current) {
                        if (current.hasOwnProperty(key) && !exclusions.includes(key)) {
                            try {
                                Object.defineProperty(current, key, {
                                    value: current[key],
                                    writable: options.writable || false,
                                    configurable: options.configurable || false
                                });
                                this.dev.log(`Locked wildcard property "${key}" on path "${path}".`, "Core");
                            } catch (e) {
                                this.dev.warn(`Failed to lock property "${key}" on path "${path}".`, "Core");
                            }
                        }
                    }
                    return;
                }

                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        this.dev.warn(`Path "${parts.slice(0, i + 1).join('.')}" does not exist.`, "Core");
                        return;
                    }
                    current = current[parts[i]];
                }

                const lastPart = parts[parts.length - 1];
                if (current[lastPart] !== undefined && !exclusions.includes(lastPart)) {
                    try {
                        Object.defineProperty(current, lastPart, {
                            value: current[lastPart],
                            writable: options.writable || false,
                            configurable: options.configurable || false
                        });
                        this.dev.log(`Locked specific property "${lastPart}" on path "${path}".`, "Core");
                    } catch (e) {
                        this.dev.warn(`Failed to lock property "${lastPart}" on path "${path}".`, "Core");
                    }
                } else {
                    this.dev.warn(`Property "${lastPart}" does not exist on the path "${path}" or is excluded.`, "Core");
                }
            },

            // ── checkAndAddTags ───────────────────────────────────────────────
            checkAndAddTags: function (tags) {
                for (let tagInfo of tags) {
                    if (tagInfo.tag === "doctype") {
                        if (!tagInfo.check()) {
                            this.dev.log(`${tagInfo.description} is missing. Cannot be added dynamically.`, "Core");
                        } else {
                            this.dev.log(`${tagInfo.description} exists.`, "Core");
                        }
                    } else if (tagInfo.tag === "html") {
                        // Never replace the document root — validate only
                        if (!tagInfo.check()) {
                            this.dev.warn("Document root <html> is missing or invalid. Critical DOM error — cannot recover.", "Core");
                        } else {
                            this.dev.log(`${tagInfo.description} exists.`, "Core");
                        }
                    } else if (tagInfo.tag.includes("meta[charset]") && !document.querySelector(tagInfo.tag)) {
                        globalThis.showErrorOverlay({
                            title: `Encoding Error - UTF-8? Never heard of it, huh?`,
                            errorMessage: `Oh sure, just toss a bunch of 1s and 0s at the browser and *hope* it figures out what language you're speaking. Back in my day, we respected our character sets. This isn't some Wild West ASCII nonsense.`,
                            exit: `Missing <meta charset='UTF-8'>. Again. Without it, even our ancient servers don't know whether to speak English, Swedish, or fluent Klingon. CMS has stopped loading - just like my patience.`
                        });
                    } else {
                        if (!document.querySelector(tagInfo.tag)) {
                            this.dev.log(`${tagInfo.description} is missing. Adding to the document...`, "Core");
                            tagInfo.create();
                        } else {
                            this.dev.log(`${tagInfo.description} exists.`, "Core");
                        }
                    }
                }
            },

            // ── preventInvalidUrl ─────────────────────────────────────────────
            preventInvalidUrl: function () {
                function validateHash(hash) {
                    if (!hash || hash === '#') return true;
                    const cleanHash = hash.slice(1);
                    const className = "ErrorOverlayHash";

                    const idMatch = cleanHash.match(/^id=([a-zA-Z0-9_-]+)$/);
                    if (idMatch) return true;

                    if (!cleanHash.includes('/')) {
                        globalThis.showErrorOverlay({
                            title: `Oh no 😱`,
                            errorMessage: `The address is feeling lonely without at least one '/'. Give it some company and fix the link before continuing`,
                            exit: `Invalid value detected in URL. CMS loading stopped.`,
                            className,
                        });
                    }

                    const parts = cleanHash.split('/');
                    for (let i = 0; i < parts.length; i++) {
                        const segment = parts[i];
                        if (!segment) continue;
                        if (i % 2 === 0) {
                            if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
                                globalThis.showErrorOverlay({
                                    title: `Oh no 😱`,
                                    errorMessage: `The address contains an invalid key. Please check and fix the link before continuing.`,
                                    exit: `Invalid value detected in URL. CMS loading stopped.`,
                                    className,
                                });
                            }
                        } else {
                            if (!/^[A-Öa-ö0-9$@!%?\-_½§*:,. "'\s]*$/.test(segment)) {
                                globalThis.showErrorOverlay({
                                    title: "Oh no 😱",
                                    errorMessage: "The address contains an invalid value. Please check and fix the link before continuing.",
                                    exit: `Invalid value detected in URL. CMS loading stopped.`,
                                    className,
                                });
                            }
                        }
                    }
                    return false;
                }

                validateHash(window.location.hash);
                globalThis.app.dev.log("Address is valid. CMS is loading...", "Core");
            },
        };

        // Lock core items that exist synchronously
        [
            "uuid",
            "sleep",
            "exists",
            "lock",
            "checkAndAddTags",
            "preventInvalidUrl",
            "dev.*",
            "config.local.hasAccessLink",
            "config.local.jsapiLink",
            "config.local.ProgramRoot",
            "config.local.ResourcesRoot",
            "config.local.ComponentsRoot",
            "config.local.allowedExternalDomains",
            "config.local.allowedBasePaths",
        ].forEach(lockName => {
            globalThis.app.lock(lockName);
        });

        return new Promise((resolve, reject) => {
            document.addEventListener("DOMContentLoaded", async function () {
                try {
                    // Steg 1 – Load sub-modules (patch app before anything uses them)
                    const subModules = [
                        "./sandstorm/ui/css.js",
                        "./sandstorm/state/store.js",
                        "./sandstorm/core/utils.js",
                        "./sandstorm/core/security.js",
                        "./sandstorm/core/modules.js",
                    ];
                    for (const mod of subModules) {
                        try {
                            await import(mod);
                        } catch (err) {
                            globalThis.app.dev.warn(`Sub-module failed: ${mod} — ${err?.message}`, "Core");
                        }
                    }
                    globalThis.app.dev.log("Sub-modules loaded", "Core");

                    // Steg 2 – Load load.js (depends on includeModule, includeProgram, setTitle, etc.)
                    await import("./sandstorm/components/load.js");
                    globalThis.app.dev.log("load.js loaded successfully", "Core");

                    // Steg 3 – Core init
                    bootstrapGuard();
                    globalThis.app.checkAndAddTags(tagsToCheck);
                    globalThis.app.preventInvalidUrl();
                    await globalThis.app.addCSS("basic", "sandstorm/basic.css", true);

                    // Steg 4 – Event listeners
                    window.addEventListener("offline", function () {
                        globalThis.showErrorOverlay({
                            title: `😱 Houston, we have a little problem`,
                            errorMessage: `It seems our browser has decided to take a break and disconnect itself.`,
                            className: "ErrorOverlayoffline"
                        });
                    });
                    window.addEventListener("online", function () {
                        globalThis.removeErrorOverlay(".ErrorOverlayoffline");
                    });

                    // Steg 5 – Run callback (index.html)
                    const result = await callback(globalThis.app);

                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, { once: true });
        });
    }

    // ── DevTools detection ───────────────────────────────────────────────────

    let overlayVisible = false;

    const showConsoleOverlay = () => {
        if (overlayVisible) return;
        overlayVisible = true;
        app.dev.log("Console has been opened", "System");
        globalThis.showErrorOverlay({
            title: "⚠️ Hi! What do you think you're doing?! 😱 NO GOD! PLEASE NO!!!",
            errorMessage:
                "This console is not a toy. Ah ah ah… you didn't say the magic word.🪄\n\n" +
                "Now… the console is watching you. 👀\n" +
                "One wrong command and… well, let's not find out. 😈"
        });
    };

    const hideConsoleOverlay = () => {
        if (overlayVisible) {
            overlayVisible = false;
            globalThis.removeErrorOverlay('.ErrorOverlay');
        }
    };

    const checkDevTools = () => {
        const threshold = 160;
        const widthDiff = window.outerWidth - window.innerWidth > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;
        return widthDiff || heightDiff;
    };

    setInterval(() => {
        if (checkDevTools()) {
            // showConsoleOverlay();
        } else {
            hideConsoleOverlay();
        }
    }, 500);

    globalThis.s = sandstorm;

})(window);
