/**
 * @file load.js
 * @description System bootstrap and resource loader for Sandstorm OS.
 *
 * Registers `app.load` — the entry point that orchestrates the full startup sequence.
 *
 * Responsibilities:
 * - `system(config)`: deep-merge config, show loading screen, import system files,
 *   load external resources, load programs, handle login flow, run startup steps,
 *   trigger autorun programs and emit lifecycle events.
 * - `reloadStartSequence()`: re-run the startup steps without the login step.
 * - Loading screen management: `setLoadingScreen`, `removeLoadingScreen`, `updateLoadingScreen`.
 * - File utilities: `resources`, `loadFile`, `preloadImage`, `addSVG`.
 *
 * Also exports the module-private helper `replaceGradientIds` for SVG symbol deduplication.
 *
 * @module components/load
 *
 * @example
 * await app.load.system({
 *   title: "My OS",
 *   programs: [{ path: "calc/calc.js" }],
 *   start: [
 *     [{ loginProgram: "login/login.js" }],
 *     ["desktop.setBackgroundImage", { image: "wallpaper/bg.jpg" }]
 *   ]
 * });
 */
(function (app) {

    // Private configuration for the system loading screen
    let _systemConfig = {
        title: "Sandstorm",
        favicon: "",
        loadingScreen: {
            loaderHTML: `<span class="loader"></span>`,
            loaderCSS: `
            .loader {
                width: 48px;
                height: 48px;
                border: 5px solid #FFF;
                border-bottom-color: transparent;
                border-radius: 50%;
                display: block;
                margin: auto;
                box-sizing: border-box;
                animation: rotation 1s linear infinite;
            }
            @keyframes rotation {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `,
            title: "Loading...",
            id: "load-screen",
            backgroundColor: "#000000",
            disableClickThrough: true,
            zIndex: 10999,
            // JS files to be loaded in order
            systemfiles: [
                // ComponentsRoot
                { file: "config.js", description: "config.js", root: "components" },
                // Core font registry — app.fonts.set/get/remove. No dependencies;
                // pre-registers a handful of standard web-safe fonts at boot.
                { file: "fonts.js", description: "fonts.js", root: "components" },
                // Notification system core — app.notifications.notify/dismiss/
                // settings/programPref. No dependencies; boot-loaded (not lazy)
                // so any program can emit notifications from its own setup().
                // The taskbar bell icon + popup panel are separate UI wiring,
                // registered later via notifications/setup.js (see `programs`
                // below), once the taskbar's own DOM actually exists.
                { file: "notifications/index.js", description: "notifications/index.js", root: "components" },
                // Central undo/redo engine — used by program.js's open() (creates
                // a program's history session) and ui/window.js's WindowElement
                // (exposes it as win.history), both of which load later.
                { file: "historyManager.js", description: "historyManager.js", root: "components" },
                { file: "ui.js", description: "ui.js", root: "components" },
                { file: "api.js", description: "api.js", root: "components" },
                { file: "util.js", description: "util.js", root: "components" },
                { file: "body.js", description: "body.js", root: "components" },
                { file: "ui/capsLock.js", description: "capsLock.js", root: "components" },
                { file: "ui/caret.js", description: "caret.js", root: "components" },
                { file: "ui/calendar.js", description: "calendar.js", root: "components" },
                { file: "ui/window.js",         description: "window.js",         root: "components" },
                { file: "ui/window-modal.js",   description: "window-modal.js",   root: "components" },
                { file: "ui/toggleWindow.js", description: "toggleWindow.js", root: "components" },
                { file: "ui/sidopanel.js", description: "sidopanel.js", root: "components" },
                { file: "menu.js", description: "menu.js", root: "components" },
                // svg.js must load before desktop.js — desktop.js calls
                // app.svg.global.load(...) at module top level (not inside a
                // deferred setup/start hook), so app.svg has to exist already.
                { file: "svg.js", description: "svg.js", root: "components" },
                // Adds app.svg.morph()/morphPath() as new keys on the (already
                // partially-locked) app.svg namespace — must load after svg.js.
                { file: "svg-morph.js", description: "svg-morph.js", root: "components" },
                // Cursor Engine — boot-loaded (not lazy) so the SVG overlay is live
                // from first paint, same as ui/caret.js. Must load after svg.js/
                // svg-morph.js: its own top-level await registers the active pack's
                // SVGs via app.svg.global.load(...) before the module finishes.
                { file: "cursor/index.js", description: "cursor/index.js", root: "components" },
                { file: "desktop.js", description: "desktop.js", root: "components" },
                { file: "desktop/icons.js", description: "icons.js", root: "components" },
                { file: "program.js", description: "program.js", root: "components" },
                { file: "taskbar/config.js", description: "taskbar/config.js", root: "components" },
                { file: "taskbar/overflow.js", description: "taskbar/overflow.js", root: "components" },
                { file: "taskbar/menu.js", description: "taskbar/menu.js", root: "components" },
                { file: "taskbar/sort.js", description: "taskbar/sort.js", root: "components" },
                { file: "taskbar/index.js", description: "taskbar/index.js", root: "components" },
                { file: "startmenu.js", description: "startmenu.js", root: "components" },
                // Tab+S/M/I skip-navigation shortcuts - needs app.desktop.startmenu
                // (Tab+S) to already exist, so it loads right after startmenu.js.
                { file: "keynav.js", description: "keynav.js", root: "components" },
                // Hold-Shift+W window switcher - only touches app.desktop.taskbar/
                // app.setActiveWindow inside event-handler bodies (evaluated at
                // trigger time, long after boot), so load order here isn't load-
                // bearing; placed alongside the other global keyboard-shortcut module.
                { file: "windowswitcher.js", description: "windowswitcher.js", root: "components" },

                // ResourcesRoot
                { file: "js/jquery-3.7.1.min.js", description: "jquery-3.7.1.min.js", root: "resources" },
                { file: "js/jquery-ui.min.js", description: "jquery-ui.min.js", root: "resources" },
                { file: "js/jquery.ui.touch-punch.min.js", description: "jquery.ui.touch-punch.min.js", root: "resources" },
                { file: "js/sortable.min.js", description: "sortable.min.js", root: "resources" },
            ],


            // Other resources (CSS, images, external scripts)
            files: [
                "res/css/jquery-ui/jquery-ui.css",
                "svgs.js",
            ],

            // Programs to be loaded
            programs: [
                { path: "networkmonitor/setup.js", root: "components" },
                { path: "notifications/setup.js", root: "components" },
                // Update readiness agent — builds app.updates (readiness /
                // handoff / panel). After notifications (for notify()), before
                // controlpanel (whose update.js manifest augments app.updates).
                { path: "updates/index.js", root: "components" },
                { path: "explorer/setup.js", root: "components" },
                { path: "recyclebin/setup.js", root: "components" },
                { path: "controlpanel/controlpanel.js", root: "components" },
                // Language system must load after controlpanel so it can call
                // app.controlpanel.add() during its own setup().
                { path: "language/language.js", root: "components" },
                // Global search — providers read app.explorer/app.program.controlpanel,
                // so this loads after both, though nothing actually calls
                // app.search.query() until the user types in the Start Menu.
                { path: "search/index.js", root: "components" },
                // Responsive Window Layout — self-initializes its resize
                // listener/MutationObserver here (before the start sequence
                // below ever creates a window), replacing desktop.js's old
                // lazy-on-first-window-creation trigger.
                { path: "responsivelayout/index.js", root: "components" },
                // User programs
                { path: "fotoviewer/setup.js" },
            ],

            // Controlpanel extension modules — loaded after programs via includeModule,
            // so they can call app.controlpanel.add() without needing program registration.
            controlpanelPrograms: [
                { path: "controlpanel/programs/customized.js" },
                { path: "controlpanel/programs/system.js" },
                { path: "controlpanel/programs/users.js" },
                { path: "controlpanel/programs/core.js" },
                { path: "controlpanel/programs/update.js" },
                { path: "controlpanel/programs/program.js" },
                { path: "controlpanel/programs/cursor.js" },
                { path: "controlpanel/programs/security.js" },
                { path: "controlpanel/programs/notifications.js" },
                { path: "controlpanel/programs/responsivelayout.js" },
                { path: "login/login.controlpanel.js" },
            ]
        },
        // startup process
        start: []

    }

    /**
     * @namespace app.dom
     * @description Small DOM-readiness helper shared across the startup
     * sequence (see `system()` and `reloadStartSequence()` below, which both
     * need to pause until a `#selector` argument's element exists).
     *
     * Backed by a single, lazily-created MutationObserver observing
     * `document.body` — reused across every pending wait instead of each
     * caller spinning up its own observer. The observer tears itself down
     * once nothing is waiting anymore, and is recreated on demand.
     */
    app.dom = {};

    // selector -> Set<{ resolve }> — waiters currently pending for that
    // selector; a single mutation batch can resolve several at once.
    const _domWaiters = new Map();
    let _domObserver = null;

    function _domObserverEnsure() {
        if (_domObserver) return;
        _domObserver = new MutationObserver(() => {
            for (const [selector, waiters] of _domWaiters) {
                const el = document.querySelector(selector);
                if (!el) continue;
                waiters.forEach(w => w.resolve(el));
                _domWaiters.delete(selector);
            }
            if (!_domWaiters.size) _domObserverTeardown();
        });
        _domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function _domObserverTeardown() {
        if (!_domObserver) return;
        _domObserver.disconnect();
        _domObserver = null;
    }

    /**
     * Resolves once `selector` matches an element in the document (checked
     * immediately, then on every subsequent DOM mutation), or after
     * `timeout` ms elapse — whichever comes first.
     *
     * @param {string} selector - CSS selector to wait for.
     * @param {Object} [opts]
     * @param {number} [opts.timeout=5000] - Max time to wait, in ms. `0` (or
     *   any non-positive value) disables the fallback entirely — the call
     *   then waits purely on the MutationObserver above for as long as it
     *   takes, never resolving `null`. Use this only when the selector is
     *   guaranteed to eventually exist and there's no meaningful "give up"
     *   point (e.g. a DOM node created once boot finally reaches it, which
     *   may be gated behind real user interaction like a login screen) —
     *   for anything else, keep a real timeout as a safety valve.
     * @returns {Promise<Element|null>} The matched element, or `null` on timeout.
     */
    app.dom.waitFor = function (selector, { timeout = 5000 } = {}) {
        const existing = document.querySelector(selector);
        if (existing) return Promise.resolve(existing);

        return new Promise(resolve => {
            _domObserverEnsure();
            let waiters = _domWaiters.get(selector);
            if (!waiters) { waiters = new Set(); _domWaiters.set(selector, waiters); }

            const waiter = {
                resolve(el) {
                    clearTimeout(timer);
                    resolve(el);
                }
            };
            waiters.add(waiter);

            const timer = timeout > 0 ? setTimeout(() => {
                waiters.delete(waiter);
                if (!waiters.size) _domWaiters.delete(selector);
                if (!_domWaiters.size) _domObserverTeardown();
                resolve(null);
            }, timeout) : null;
        });
    };

    app.lock('dom.*', { writable: false, configurable: false });

    /**
     * @namespace app.icons
     * @description Registry of icon names available in Sandstorm's Font
     * Awesome subset (`res/icons/sandstorm.css`, one font file —
     * `fa-solid-900.woff2` — instead of the full ~390 KB Font Awesome
     * package). Not a loader — just a lookup so callers can tell a
     * genuinely missing icon apart from one that will silently render
     * blank. Update `available` alongside `sandstorm.css` whenever an icon
     * rule is added or removed there.
     *
     * Defined here (not in `widgets/input.js`, the actual `sandstorm.css`
     * consumer) because `load.js` is guaranteed to be loaded — `input.js`
     * is an on-demand widget, not part of the boot `systemfiles` list.
     *
     * @example
     * app.icons.has("folder"); // false — not in the subset yet
     * app.icons.has("user");   // true
     */
    app.icons = {
        available: [
            "user",
            "unlock",
            "eye",
            "eye-slash",
            "scissors",
            "copy",
            "paste",
            "key",
            "earth-americas",
        ],
        /**
         * @param {string} name - Icon name without the `fa-` prefix, e.g. `"user"`.
         * @returns {boolean}
         */
        has(name) {
            return this.available.includes(name);
        }
    };

    app.lock('icons.*', { writable: false, configurable: false });

    /**
     * Resolves a `loadingScreen`-shaped config's `systemfiles` and
     * `programs` entries into full URLs, using the exact same root-lookup
     * rules as the sequential import loops in `system()` (`ComponentsRoot` /
     * `ProgramRoot` / `ResourcesRoot`). Private — only used to build the
     * preload URL list below, kept as its own function so the mapping logic
     * exists in exactly one place.
     *
     * @param {Object} loadingScreen - `_systemConfig.loadingScreen` (or
     *   equivalent) with `systemfiles` and/or `programs` arrays.
     * @returns {string[]} Resolved URLs, systemfiles first.
     */
    function _resolveBootUrls(loadingScreen) {
        const urls = [];

        for (const { file, root } of loadingScreen.systemfiles || []) {
            let base;
            switch (root) {
                case "components": base = app.config.local.ComponentsRoot; break;
                case "program":    base = app.config.local.ProgramRoot; break;
                case "resources":  base = app.config.local.ResourcesRoot; break;
                default:           base = "";
            }
            urls.push(base + file);
        }

        for (const p of loadingScreen.programs || []) {
            const root = p.root || "program";
            const base = root === "components" ? app.config.local.ComponentsRoot : app.config.local.ProgramRoot;
            urls.push(base + p.path);
        }

        return urls;
    }

    /**
     * Warms the browser's module cache for a list of URLs by injecting
     * `<link rel="modulepreload">` for each — fetches, parses, and compiles
     * in parallel in the background without executing any top-level module
     * code. Duplicate URLs (already preloaded, or already present as a
     * `<link>`) are skipped silently. Private — internal to `system()`'s
     * preload phase, not part of the public `app.load` surface.
     *
     * This does not replace the sequential `import()` calls that follow —
     * it only removes network latency from in front of them, so execution
     * order (and the implicit dependency ordering many systemfiles rely on)
     * is unaffected.
     *
     * @param {string[]} urls
     * @returns {void}
     */
    function _preloadModules(urls) {
        const head = document.head;
        (urls || []).forEach(url => {
            if (!url) return;
            if (head.querySelector(`link[rel="modulepreload"][href="${CSS.escape(url)}"]`)) return;
            const link = document.createElement('link');
            link.rel = 'modulepreload';
            link.href = url;
            head.appendChild(link);
        });
    }

    app.load = {
      
        /**
       * System Initialization Method
       * 
       * This asynchronous method handles the complete system bootstrap process including:
       * - Configuration merging and validation
       * - Loading screen display and management
       * - System file imports
       * - External resource loading
       * - Program initialization
       * - Login workflow integration
       * - Startup sequence execution
       * 
       * @param {Object} config - Configuration object to merge with system defaults
       * @param {string} [config.title] - Application title to set after loading
       * @param {string} [config.favicon] - Favicon URL to set after loading
       * @param {Array} [config.programs] - Array of program definitions to load (shorthand for loadingScreen.programs)
       * @param {Array} [config.start] - Startup sequence array containing function calls and login program definitions
       * @param {Object} [config.loadingScreen] - Loading screen specific configuration
       * @param {string} [config.loadingScreen.title] - Title shown on loading screen
       * @param {string} [config.loadingScreen.loaderHTML] - HTML content for the loader animation
       * @param {string} [config.loadingScreen.loaderCSS] - CSS styles for the loader
       * @param {string} [config.loadingScreen.backgroundColor] - Background color of loading screen
       * @param {boolean} [config.loadingScreen.disableClickThrough] - Prevent clicks during loading
       * @param {number} [config.loadingScreen.zIndex] - Z-index of loading screen overlay
       * @param {Array} [config.loadingScreen.programs] - Array of program definitions to load
       * @param {Array} [config.loadingScreen.systemfiles] - Array of system files to import
       * @param {Array} [config.loadingScreen.files] - Array of external resources to load
       * 
       * @async
       * @returns {Promise<void>}
       * @throws {Error} If critical modules fail to load
       * 
       * @example
       * // Basic usage with programs and startup sequence
       * await app.load.system({
       *   title: "Sandstorm",
       *   programs: [
       *     { path: "/gui/gui.js" },
       *     { path: "/calc/calc.js" }
       *   ],
       *   start: [
       *     // Login program (blocks until authentication completes)
       *     [{ loginProgram: "login.js" }],
       *     
       *     // Set desktop background
       *     ["desktop.setBackgroundImage", {
       *       image: "wallpaper/huacachina-4173731_1920.jpg",
       *       size: "cover",
       *       repeat: "no-repeat",
       *       position: "center center"
       *     }],
       *     
       *     // Initialize context menu
       *     ["desktop.contextMenuInit", "body", {
       *       zIndex: 10000,
       *       classes: "",
       *       seltaget: false
       *     }],
       *     
       *     // Create start button
       *     ["desktop.startmenu.startbutton", {
       *       shortcut: "s+m",
       *       id: "bts-start",
       *       content: `<svg><use href="#ic-bts-start"></use></svg>`,
       *       title: "Start"
       *     }]
       *   ]
       * });
       */
        async system(config = {}) {
            try {

                // CONFIGURATION MERGING

                /**
                 * Deep merge the provided configuration with system defaults.
                 * Loading screen configuration is merged recursively to preserve
                 * nested properties while allowing overrides.
                 */
                _systemConfig = {
                    ..._systemConfig,
                    ...config,
                    loadingScreen: {
                        ..._systemConfig.loadingScreen,
                        ...(config.loadingScreen || {})
                    }
                };

                if (config.user) {
                    app.config.user = config.user;
                }

                /**
                 * Merge program lists from both base configuration and provided config.
                 * This allows adding programs without overwriting existing ones.
                 * 
                 * Programs can be specified in two ways:
                 * 1. config.programs (shorthand) - recommended for cleaner configuration
                 * 2. config.loadingScreen.programs (explicit path)
                 * 
                 * Both arrays are combined to create the final program list.
                 */
                const basePrograms = _systemConfig.loadingScreen.programs || [];
                const extraPrograms = (config.loadingScreen?.programs || config.programs) || [];
                const allPrograms = [...basePrograms, ...extraPrograms];
                const _seen = new Set();
                _systemConfig.loadingScreen.programs = allPrograms.filter(p => {
                    const key = (p.root || 'program') + ':' + p.path;
                    if (_seen.has(key)) return false;
                    _seen.add(key);
                    return true;
                });


                // PRELOAD PHASE — see NOTES.md for why this isn't a full
                // parallel-init rewrite.
                _preloadModules(_resolveBootUrls(_systemConfig.loadingScreen));


                // LOADING SCREEN DISPLAY

                /**
                 * Display the loading screen overlay while system resources are being loaded.
                 * The loading screen:
                 * - Provides visual feedback during initialization
                 * - Prevents user interaction until system is ready
                 * - Shows customizable HTML/CSS loader animation
                 */
                app.load.setLoadingScreen({
                    title: _systemConfig.loadingScreen.title,
                    contentArray: [
                        { type: "html", content: _systemConfig.loadingScreen.loaderHTML },
                        { type: "css", content: _systemConfig.loadingScreen.loaderCSS },
                    ],
                    backgroundColor: _systemConfig.loadingScreen.backgroundColor,
                    disableClickThrough: _systemConfig.loadingScreen.disableClickThrough,
                    zIndex: _systemConfig.loadingScreen.zIndex,
                });


                // SYSTEM FILE IMPORTS

                /**
                 * Import critical system files required for core application functionality.
                 * 
                 * System files typically include:
                 * - UI frameworks and utilities
                 * - Desktop environment components
                 * - Window management systems
                 * - Menu and navigation systems
                 * - Third-party libraries (jQuery, jQuery UI, etc.)
                 * 
                 * Each file is loaded sequentially with error handling to ensure
                 * non-critical failures don't halt the entire boot process.
                 */
                for (let { file, description, root } of _systemConfig.loadingScreen.systemfiles) {
                    // Determine the base folder dynamically based on the "root" property
                    let path;
                    switch (root) {
                        case "components":
                            path = app.config.local.ComponentsRoot + file;
                            break;
                        case "program":
                            path = app.config.local.ProgramRoot + file;
                            break;
                        case "resources":
                            path = app.config.local.ResourcesRoot + file;
                            break;
                        default:
                            path = file; // fallback if no root is specified
                    }

                    // Import the file using importFile
                    // importFile handles logging, error reporting, and storing the path in app.config.local.importFiles
                    await app.importFile(path, description);
                }

                // EXTERNAL RESOURCE LOADING

                /**
                 * Load external resources (CSS files, fonts, SVG sprites, etc.) if specified.
                 * Resources are loaded asynchronously for better performance.
                 * 
                 * Supported resource types:
                 * - Stylesheets (.css)
                 * - JavaScript files (.js)
                 * - SVG sprite files
                 * - External CDN resources
                 */
                if (Array.isArray(_systemConfig.loadingScreen.files) && _systemConfig.loadingScreen.files.length > 0) {
                    console.log("Loading external resources...");
                    await app.load.resources(_systemConfig.loadingScreen.files);
                    console.log("All resources loaded!");
                }


                // PROGRAM LOADING

                /**
                 * Load all programs defined in the configuration.
                 * 
                 * Programs are applications or modules that extend system functionality.
                 * Each program definition can include:
                 * - path: File path to the program module
                 * - root: Base directory for the program (defaults to "program")
                 * 
                 * Programs are loaded sequentially to maintain dependency order.
                 * 
                 * Example program definitions:
                 * { path: "/gui/gui.js" }                              // Uses default root
                 * { path: "controlpanel/panel.js", root: "components" } // Custom root
                 */
                const programsToLoad = _systemConfig.loadingScreen.programs;
   
                for (const programInfo of programsToLoad) {
                    const root = programInfo.root || "program";
                    app.dev.log(`Including program from root "${root}": ${programInfo.path}`, "Program");
                    await app.includeProgram(programInfo.path, root);
                }

                // CONTROLPANEL EXTENSION MODULES
                // These register tiles via app.controlpanel.add() but are not
                // regular programs — load them via includeModule + manual setup call
                // to avoid the addInfo/program.add requirement of includeProgram.
                // Controlpanel extensions are independent — load them in parallel
                const cpExtPrograms = _systemConfig.loadingScreen.controlpanelPrograms || [];
                await Promise.allSettled(cpExtPrograms.map(async ({ path: cpPath }) => {
                    const cpFull = app.config.local.ComponentsRoot + cpPath;
                    try {
                        app.dev.log(`Loading CP extension: ${cpPath}`, "Load");
                        const cpMod = await app.includeModule(cpFull);
                        if (cpMod && typeof cpMod.setup === 'function') {
                            if (cpMod.setup.constructor.name === 'AsyncFunction') {
                                await cpMod.setup(app);
                            } else {
                                cpMod.setup(app);
                            }
                            app.dev.log(`CP extension loaded: ${cpPath}`, "Load");
                        }
                    } catch (cpErr) {
                        app.dev.error(`Failed to load CP extension ${cpPath}: ${cpErr?.message}`, "Load");
                    }
                }));

                // BOOT API CLEANUP
                // Remove functions that are only valid during the boot phase so
                // runtime-loaded programs cannot extend boot-only registries.
                // Replace boot-only APIs with a warning no-op instead of delete
                // — calling code gets a clear message rather than a silent crash
                if (app.controlpanel) {
                    const _warn = name => () => app.dev.warn(`${name} is only available during boot`, "Load");
                    if (typeof app.controlpanel.add === "function") {
                        app.controlpanel.add = _warn("controlpanel.add");
                        app.dev.log("Boot cleanup: locked app.controlpanel.add", "Load");
                    }
                    if (typeof app.controlpanel.addMenuItem === "function") {
                        app.controlpanel.addMenuItem = _warn("controlpanel.addMenuItem");
                        app.dev.log("Boot cleanup: locked app.controlpanel.addMenuItem", "Load");
                    }
                }

                if (app.exists('app.desktop.taskbar.addProgramsToTaskbar')) {
                    // Register programs for Taskbar
                    app.desktop.taskbar.addProgramsToTaskbar();
                }
                /**
                 * Initialize the UI tooltip system.
                 * This enables hover tooltips throughout the application.
                 */
                app.ui.tooltip.init();
                /**
                 * Initialize the aero-button mouse-following glow.
                 */
                app.ui.aeroGlow.init();


                // LOADING SCREEN — stays up through the whole `start:` sequence
                // below (wallpaper → icons → taskbar) regardless of whether a
                // login step is present. It used to be removed right here
                // whenever there was no login program — exposing the exact
                // same "wallpaper still loading, icons/taskbar already built"
                // reveal-order bug login.js's own path had, just with no login
                // step to blame it on. The `start:` loop's own fallback below
                // (`if (document.getElementById(...)) removeLoadingScreen()`)
                // already removes it — with the same fade — once every step
                // (including `desktop.setBackgroundImage`, which now genuinely
                // awaits the image being loaded+decoded) has actually finished,
                // so nothing extra is needed here for either case.
                const hasLoginProgram =
                    Array.isArray(_systemConfig.start) &&
                    _systemConfig.start.some(step => Array.isArray(step) && step[0]?.loginProgram);
                app.dev.log(
                    hasLoginProgram
                        ? "Login program detected — keeping loading screen until login completes."
                        : "No login program — keeping loading screen until the start: sequence completes.",
                    "Start"
                );

                // APPLICATION METADATA SETUP

                /**
                 * Set the application title (document.title) if specified in configuration.
                 * Only executes if setTitle function exists in app namespace.
                 * This updates the browser tab/window title.
                 */
                if (typeof _systemConfig.title === 'string' && typeof app.setTitle === 'function') {
                    app.setTitle(_systemConfig.title);
                }

                /**
                 * Set the favicon if specified in configuration.
                 * Only executes if setFavicon function exists in app namespace.
                 * This updates the icon shown in the browser tab.
                 */
                if (typeof _systemConfig.favicon === 'string' && _systemConfig.favicon !== '' && typeof app.setFavicon === 'function') {
                    app.setFavicon(_systemConfig.favicon);
                }

                // STARTUP SEQUENCE EXECUTION

                /**
                 * Execute the startup sequence defined in configuration.
                 * 
                 * The startup sequence is an array where each element can be:
                 * 
                 * 1. Login Program:
                 *    [{ loginProgram: "path/to/login.js" }]
                 *    - Blocks sequence until authentication completes
                 *    - Uses cryptographic key for secure resume mechanism
                 * 
                 * 2. Function Call:
                 *    ["functionPath", arg1, arg2, ...]
                 *    - Executes app.functionPath(arg1, arg2, ...)
                 *    - Supports both sync and async functions
                 *    - Automatically prefixes with "app." if needed
                 * 
                 * Examples:
                 * ["desktop.setBackgroundImage", { image: "bg.jpg", size: "cover" }]
                 * ["desktop.taskbar.setTaskIcon", { id: "explorer", svg: "#ic-explorer" }]
                 * ["desktop.startmenu.startbutton", { id: "bts-start", title: "Start" }]
                 * 
                 * Special features:
                 * - Callback strings are automatically resolved to functions
                 * - DOM element selectors (starting with #) trigger wait-for-element logic
                 * - Each step is logged with index for debugging
                 */
                if (Array.isArray(_systemConfig.start) && _systemConfig.start.length > 0) {
                    for (let i = 0; i < _systemConfig.start.length; i++) {
                        const step = _systemConfig.start[i];

                        // Step formats:
                        //   ["functionPath", ...args]                       — standard
                        //   [{ call: "functionPath", critical: true }, ...]  — critical (throws on failure)
                        //   [{ loginProgram: "path" }]                       — login
                        let functionPath, args, isCritical = false;
                        if (step[0] && typeof step[0] === 'object' && step[0].call) {
                            functionPath = step[0].call;
                            isCritical   = step[0].critical === true;
                            args         = step.slice(1);
                        } else {
                            [functionPath, ...args] = step;
                        }

                        app.dev.log(`[${i}] About to run: ${functionPath}`, "Start");

                        // LOGIN PROGRAM HANDLING

                        /**
                         * Handle login program if this step is a login definition.
                         * 
                         * Login workflow:
                         * 1. Generate a unique cryptographic key (UUID)
                         * 2. Create a resume callback bound to this specific key
                         * 3. Load and start the login program with key and resume function
                         * 4. Pause startup sequence until resume() is called with correct key
                         * 5. Continue to next step once authentication completes
                         * 
                         * Security:
                         * - Private key ensures only the login module can resume
                         * - Resume can only be called once (guarded by 'resumed' flag)
                         * - Invalid resume attempts are logged and ignored
                         */
                        if (Array.isArray(step) && step[0] && step[0].loginProgram) {
                            const loginPath = step[0].loginProgram;
                            app.dev.log(`[${i}] Login program: ${loginPath}`, "Start");

                            try {
                                const privateKey = crypto.randomUUID();
                                let resolveLogin;
                                const loginPromise = new Promise(r => { resolveLogin = r; });

                                const resume = (key) => {
                                    if (key === privateKey) {
                                        app.dev.log(`[${i}] Login approved, continuing startup sequence...`, "Start");
                         
                                        resolveLogin();
                                    } else {
                                        app.dev.warn(`[${i}] Invalid resume call ignored!`);
                                    }
                                };

                                const loginModule = await app.includeProgram(loginPath, "components");
                                if (loginModule && typeof loginModule.start === "function") {
                                    // step[0] is the whole loginProgram config object
                                    // (e.g. { loginProgram, background, apiAddress })
                                    // — forwarded as-is so index.html stays the single
                                    // source of truth for this data, not duplicated
                                    // as a hardcoded literal inside login.js itself.
                                    const isAsyncLogin = loginModule.start.constructor.name === "AsyncFunction";
                                    if (isAsyncLogin) {
                                        await loginModule.start(app, privateKey, resume, step[0]);

                                    } else {
                                        loginModule.start(app, privateKey, resume, step[0]);
                                    }



                                }


                                app.load.removeLoadingScreen();

                                // Blocks until resume() is called — no polling
                                await loginPromise;

                                // Check if there are more steps after login
                                const remainingSteps = _systemConfig.start.slice(i + 1);
                                const hasMoreSteps = remainingSteps.some(
                                    s => !(Array.isArray(s) && s[0]?.loginProgram)
                                );

                              // If there are more steps — show the loading screen again while they are running.
                              // Use blur mode so the wallpaper stays visible instead of going solid black.
                                if (hasMoreSteps) {
                                    app.load.setLoadingScreen({
                                        title: _systemConfig.loadingScreen.title,
                                        contentArray: [
                                            { type: "html", content: _systemConfig.loadingScreen.loaderHTML },
                                            { type: "css", content: _systemConfig.loadingScreen.loaderCSS },
                                        ],
                                        backgroundColor: 'rgba(0,0,0,0.45)',
                                        blur: 14,
                                        disableClickThrough: _systemConfig.loadingScreen.disableClickThrough,
                                        zIndex: _systemConfig.loadingScreen.zIndex,
                                    });
                                }

                                continue;
                            } catch (e) {
                                app.dev.error(`[${i}] Error during login:`, e, "Start");
                                continue;
                            }
                        }

                        // LOADING SCREEN REMOVAL — [{ removeLoadingScreen: true }]
                        //
                        // Placed explicitly by the caller's own `start:` array right
                        // after whatever step needs to finish painting *before* the
                        // loading screen fades away — normally straight after
                        // `desktop.setBackgroundImage` (which now genuinely awaits the
                        // wallpaper being loaded+decoded). Steps after this one
                        // (icon.init, taskbar.build, …) then run against an already
                        // *visible* background, with the loading screen's own fade-out
                        // transition already finished — instead of running hidden
                        // behind an opaque overlay and only being revealed once already
                        // fully built. That used to make taskbar.build()'s own slide-in
                        // + staggered icon fade-in animation play out completely
                        // unseen — it'd finish behind the black screen, and the
                        // "reveal" was just the overlay disappearing to show an
                        // already-settled taskbar, not the taskbar's own entrance.
                        //
                        // A safety-net removal still runs once after the whole `start:`
                        // loop finishes (below), in case a config never places this step.
                        if (Array.isArray(step) && step[0] && step[0].removeLoadingScreen) {
                            app.dev.log(`[${i}] Removing loading screen`, "Start");
                            await app.load.removeLoadingScreen();
                            app.dev.log(`[${i}] Loading screen fade-out finished`, "Start");
                            continue;
                        }

                        // FUNCTION PATH RESOLUTION

                        try {
                            /**
                             * Normalize function path by adding "app." prefix if missing.
                             * This allows both "desktop.taskbar.build" and "app.desktop.taskbar.build"
                             * to work correctly.
                             */
                            // Restrict execution to app namespace only — never from global window
                            const normalizedPath = (typeof functionPath === "string" && !functionPath.startsWith("app."))
                                ? "app." + functionPath
                                : functionPath;

                            const resolvedParts = normalizedPath.replace(/^app\./, '').split('.');
                            const functionName  = resolvedParts.pop();
                            const context       = resolvedParts.reduce((o, k) => o?.[k], globalThis.app);
                            const fn            = context?.[functionName];

                            // Validate that the resolved path points to an actual function
                            if (typeof fn !== "function") {
                                app.dev.error(`[${i}] ${functionPath} is not a function`, "Start");
                                continue;
                            }

                            // CALLBACK STRING RESOLUTION (restricted to app namespace)
                            args = args.map(arg => {
                                if (arg && typeof arg === "object" && typeof arg.callback === "string") {
                                    const cbParts = arg.callback.replace(/^app\./, '').split('.');
                                    const cbName  = cbParts.pop();
                                    const cbCtx   = cbParts.reduce((o, k) => o?.[k], globalThis.app);
                                    const cbFn    = cbCtx?.[cbName];
                                    if (typeof cbFn === "function") {
                                        arg.callback = cbFn.bind(cbCtx);
                                    } else {
                                        app.dev.error(`[${i}] ${arg.callback} is not a valid callback`, "Start");
                                    }
                                }
                                return arg;
                            });

                            // DOM ELEMENT WAITING

                            /**
                             * Wait for DOM elements to exist before proceeding.
                             * 
                             * If any argument is a string starting with "#" (CSS selector),
                             * wait for that element to appear in the DOM before executing the function.
                             * 
                             * This is crucial for functions that manipulate specific DOM elements,
                             * as it ensures those elements exist before the function runs.
                             * 
                             * Features:
                             * - Uses requestAnimationFrame for efficient polling
                             * - 5-second timeout to prevent infinite waiting
                             * - Continues even if timeout occurs (with warning)
                             * 
                             * Example:
                             * ["desktop.contextMenuInit", "#taskbar", { options }]
                             * Will wait for #taskbar element to exist before calling the function.
                             */
                            for (const arg of args) {
                                if (typeof arg === "string" && arg.startsWith("#")) {
                                    app.dev.log(`[${i}] Waiting for element: ${arg}`, "Start");
                                    const found = await app.dom.waitFor(arg);
                                    if (!found) app.dev.warn(`[${i}] Timeout waiting for ${arg}`, "Start");
                                    app.dev.log(`[${i}] Done waiting for: ${arg}`, "Start");
                                }
                            }

                            // FUNCTION EXECUTION

                            /**
                             * Execute the resolved function with proper context and arguments.
                             * 
                             * The function is called with:
                             * - Correct 'this' context (using .call)
                             * - All resolved arguments spread as parameters
                             * 
                             * Async functions are awaited to ensure sequential execution.
                             * Sync functions are called normally.
                             * 
                             * This ensures the startup sequence maintains proper order,
                             * even when mixing sync and async operations.
                             */
                            const isAsync = fn.constructor.name === "AsyncFunction";
                            app.dev.log(`[${i}] ${functionPath} is ${isAsync ? "async" : "sync"}`, "Start");

                            if (isAsync) {
                                await fn.call(context, ...args);
                            } else {
                                fn.call(context, ...args);
                            }

                            app.dev.log(`[${i}] Finished: ${functionPath}`, "Start");
                            if (typeof _systemConfig.title === 'string' && typeof app.setTitle === 'function') {
                                app.setTitle(_systemConfig.title);
                            }

                        } catch (e) {
                            app.dev.error(`[${i}] Failed to execute ${functionPath}:`, e, "Start");
                            if (isCritical) throw e; // critical steps stop boot
                        }
                    }
                }

                if (document.getElementById(_systemConfig.loadingScreen.id ?? 'load-screen')) {

                    app.load.removeLoadingScreen();
                }

                // Signal that startup sequence is done
                app.lifecycle.emit("startup-complete");

                // AUTORUN PROGRAMS
                // Let deferred $(function(){}) callbacks (e.g. taskbar.build) complete
                // before checking for the startmenu DOM. jQuery 3 defers already-ready
                // handlers to the next macrotask via setTimeout(0).
                await new Promise(r => setTimeout(r, 0));

                // See NOTES.md — animation-timing fallback before autorun.
                const animMs = app.desktop?.taskbar?.config?.animate ?? 0;
                if (animMs > 0) await app.sleep(animMs);

                for (const [id, programData] of app.program.entries()) {
                    if (programData.autorun === true) {
                        app.dev.log(`Autorun: launching program "${id}"`, "Load");
                        try {
                            // Route through open() rather than getMain()+invoke: open()
                            // lazy-loads info.file first for programs split into
                            // setup.js + a lazy main file (e.g. Designer), which only
                            // export their main function (e.g. `start`) from the lazy
                            // file, not from setup.js. getMain() alone would fail for
                            // those since only setup.js has run by boot time.
                            await app.program.open(id);
                            app.dev.log(`Autorun: "${id}" started.`, "Load");
                        } catch (e) {
                            app.dev.error(`Autorun: failed to start "${id}":`, e, "Load");
                        }
                    }
                }

                app.lifecycle.emit("ready");

            } catch (error) {

                // CRITICAL ERROR HANDLING

                /**
                 * If any critical error occurs during the loading process,
                 * display a user-friendly error overlay with diagnostic information.
                 * 
                 * This is a last-resort error handler that should only trigger
                 * for unrecoverable failures like:
                 * - Critical system files missing
                 * - Invalid configuration structure
                 * - Network failures preventing resource loading
                 * 
                 * The error overlay informs the user that manual intervention
                 * (developer assistance) is required.
                 */
                app.dev.error("Error occurred while loading modules.", "Program");
                showErrorOverlay({
                    title: `Oh no 😱`,
                    errorMessage: `Critical error: Unable to load required modules. Please get a monkey developer 🐒.`,
                    exit: `Invalid value detected in URL. CMS loading stopped.`,
                    className: "ErrorOverlaymodules",
                });
            }
        },

        /**
         * Re-executes the startup sequence stored in `_systemConfig.start`, skipping
         * any login-program steps.  Useful for re-applying wallpaper, taskbar config, etc.
         * after a settings change without performing a full page reload.
         *
         * @async
         * @function reloadStartSequence
         * @memberof app.load
         * @returns {Promise<void>}
         */
        reloadStartSequence: async function () {
            const config = _systemConfig;
            if (!config.start || !Array.isArray(config.start)) return;

            for (let i = 0; i < config.start.length; i++) {
                const step = config.start[i];

                // Skippa login program helt
                if (Array.isArray(step) && step[0]?.loginProgram) {
                    app.dev.log(`Skipping login program: ${step[0].loginProgram}`, "ReloadStart");
                    continue; // gå till nästa steg
                }

                // Vanliga funktioner
                try {
                    let [functionPath, ...args] = step;
                    if (typeof functionPath === "string" && !functionPath.startsWith("app.")) {
                        functionPath = "app." + functionPath;
                    }

                    const parts = functionPath.split('.');
                    const functionName = parts.pop();
                    const context = parts.reduce((o, k) => o?.[k], window);
                    const fn = context?.[functionName];
                    if (typeof fn !== "function") continue;

                    // Callback-resolving
                    args = args.map(arg => {
                        if (arg && typeof arg === "object" && typeof arg.callback === "string") {
                            const cbParts = arg.callback.split(".");
                            const cbFn = cbParts.reduce((o, k) => o?.[k], window);
                            if (typeof cbFn === "function") arg.callback = cbFn.bind(context);
                        }
                        return arg;
                    });

                    // Vänta på DOM-element
                    for (const arg of args) {
                        if (typeof arg === "string" && arg.startsWith("#")) {
                            await app.dom.waitFor(arg);
                        }
                    }

                    // Kör funktionen
                    const isAsync = fn.constructor.name === "AsyncFunction";
                    if (isAsync) await fn.call(context, ...args);
                    else fn.call(context, ...args);

                } catch (err) {
                    app.dev.log(`[${i}] Failed:`, err,"ReloadStart");
                }
            }
        },

        /**
         * Displays a loading screen with customizable options.
         * @param {Object} options - The configuration object for the loading screen.
         * @param {string} [options.title] - The title to set temporarily for the loading screen.
         * @param {string} [options.id='load-screen'] - The ID for the loading screen element.
         * @param {Array} [options.contentArray] - An array of content objects to add to the loading screen. Each object should have a `type` and `content`.
         * @param {string} [options.backgroundColor='rgba(255, 255, 255, 0.8)'] - The background color for the loading screen.
         * @param {boolean} [options.disableClickThrough=false] - Whether to disable click-through on the loading screen.
         * @param {number} [options.zIndex=11999] - The z-index for the loading screen.
         */
        async setLoadingScreen(options = {}) {
            // When blur mode is active the wallpaper must remain visible behind the overlay,
            // so we intentionally skip overriding html/body backgrounds.
            if (!options.blur) {
                document.documentElement.style.background = options.backgroundColor || '#283869';
                if (document.body) document.body.style.background = options.backgroundColor || '#283869';
            }

            const {
                title = '',
                id = 'load-screen',
                contentArray = [],
                backgroundColor = 'rgba(255, 255, 255, 0.8)',
                disableClickThrough = false,
                zIndex = 11999
            } = options;

            // Check if the loading screen already exists
            // (sandstorm.gen.js creates it early at DOMContentLoaded — skip silently)
            let existingOverlay = document.getElementById(id);
            if (existingOverlay) return;

            // Create the overlay element for the loading screen
            let overlay = document.createElement('div');
            overlay.id = id;
            overlay.className = "loading-screen ls-bg-in"; // bg visible immediately, no fade-in
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = backgroundColor;
            overlay.style.display = 'flex';
            overlay.style.justifyContent = 'center';
            overlay.style.alignItems = 'center';
            overlay.style.cursor = "wait";
            overlay.style.zIndex = zIndex;
            overlay.style.pointerEvents = disableClickThrough ? 'none' : 'auto';

            if (options.blur) {
                const blurPx = typeof options.blur === 'number' ? options.blur : 14;
                overlay.style.backdropFilter         = `blur(${blurPx}px)`;
                overlay.style.webkitBackdropFilter   = `blur(${blurPx}px)`;
            }

            if (title) {
                overlay.dataset.previousTitle = app.getTitle?.() ?? '';
                app.setTitle(title);
            }

            // Phase-transition CSS (always injected — not overridable by loaderCSS)
            const phaseStyle = document.createElement('style');
            phaseStyle.id = 'loadcss-phase';
            phaseStyle.textContent = `
                .loading-screen { opacity: 0; transition: opacity 0.3s ease-out; }
                .loading-screen.ls-bg-in { opacity: 1; }
                .ls-spinner-wrap { opacity: 0; transition: opacity 0.1s ease-out; }
                .ls-spinner-wrap.ls-spin-in { opacity: 1; }
                .ls-spinner-wrap.ls-spin-out { opacity: 0; transition: opacity 0.3s ease-out; }
            `;
            document.head.appendChild(phaseStyle);

            // Spinner wrapper — content lives here so it can be faded independently
            const spinnerWrap = document.createElement('div');
            spinnerWrap.className = 'ls-spinner-wrap';

            // Add content to the loading screen
            if (contentArray.length > 0) {
                const style = document.createElement('style');
                style.id = 'loadcss';
                document.head.appendChild(style);

                contentArray.forEach(item => {
                    let element;
                    if (item.type === 'html') {
                        element = document.createElement('div');
                        element.innerHTML = item.content;
                    } else if (item.type === 'css') {
                        style.textContent += item.content;
                        return;
                    } else {
                        app.dev.warn(`Unsupported content type: ${item.type}`, "Load");
                        return;
                    }
                    spinnerWrap.appendChild(element);
                });
            }

            overlay.appendChild(spinnerWrap);
            document.body.appendChild(overlay);

            // Fade in spinner only — bg is already visible (ls-bg-in set before appendChild)
            requestAnimationFrame(() => requestAnimationFrame(() => {
                spinnerWrap.classList.add('ls-spin-in');
            }));
        },

        /**
         * Hides the loading screen with an optional fade-out effect.
         * @param {Object} options - The configuration object for hiding the loading screen.
         * @param {string} [options.id='load-screen'] - The ID of the loading screen to remove.
         * @param {number} [options.duration=1000] - The duration of the fade-out effect in milliseconds.
         * @param {string} [options.cssClass='fade-out'] - The CSS class to apply for the fade-out effect.
         * @returns {Promise<void>} Resolves once the fade-out has actually finished
         *   (transitionend, or the 700ms safety fallback) and the overlay is removed
         *   from the DOM — not merely once it's been told to start fading. Callers
         *   that don't care can ignore the return value, same as before; the
         *   `start:` sequence's own `[{ removeLoadingScreen: true }]` step awaits
         *   it so whatever runs next (icon/taskbar entrance animations) doesn't
         *   start until the black screen has actually visually cleared.
         */
        removeLoadingScreen(options = {}) {
            const { id = 'load-screen' } = options;

            const overlay = document.getElementById(id);
            if (!overlay) return Promise.resolve();

            if (overlay.dataset.previousTitle !== undefined) {
                app.setTitle(overlay.dataset.previousTitle);
            }

            // Immediately unblock interaction — animation is cosmetic, blocking is critical.
            overlay.style.pointerEvents = 'none';
            overlay.style.cursor = 'default';

            // setLoadingScreen() painted a solid-color inline `background` on
            // <html>/<body> as a white-flash safety net for the moment before
            // any real background exists. Clearing it here, before the fade
            // starts, lets whatever applyBackgroundCss() already put in the
            // stylesheet (setBackgroundImage runs — and is awaited — before
            // this step, by the `start:` sequence's own contract; see the
            // comment above the `[{ removeLoadingScreen: true }]` handling)
            // show through *underneath* the overlay immediately. Clearing it
            // only in _cleanupAndRemove (at fade END) left that inline color
            // masking the real wallpaper for the entire 0.8s fade — the
            // overlay's opacity was genuinely animating smoothly the whole
            // time, but revealing nothing but flat color, then the actual
            // wallpaper snapped in instantly the moment cleanup ran. That
            // snap — not the overlay's own transition — was the "hård" cut.
            //
            // Only safe to clear early when a real background is already
            // painted underneath — the login flow's own removeLoadingScreen()
            // call (above, right after the login program starts) can fire
            // before desktop.setBackgroundImage has ever run, and clearing
            // this early there would expose the raw unstyled page for the
            // whole login screen, i.e. the exact white flash this color
            // exists to prevent. _cleanupAndRemove still clears it
            // unconditionally at fade END as a fallback for that case.
            // Can't detect this via getComputedStyle(body).backgroundImage —
            // the inline mask being cleared *is* what's suppressing that
            // computed value, so it always reads 'none' while still masked.
            // desktop.js's applyBackgroundCss() injects its rule into the
            // shared #s_css stylesheet under this exact identifier comment
            // (see ui/css.js's addCSS) — checking for that marker directly
            // reflects whether the real background rule exists, independent
            // of whatever's currently masking it.
            const hasRealBackground = document.getElementById('s_css')?.textContent.includes('Apply background CSS to the document body') === true;
            if (hasRealBackground) {
                document.documentElement.style.removeProperty('background');
                document.body.style.removeProperty('background');
            }

            let _resolve;
            const _promise = new Promise(r => { _resolve = r; });

            let _done = false;
            const _cleanupAndRemove = () => {
                if (_done) return;
                _done = true;
                document.documentElement.style.removeProperty('background');
                if (document.body) document.body.style.removeProperty('background');
                overlay.remove();
                document.getElementById('loadcss')?.remove();
                document.getElementById('loadcss-phase')?.remove();

                // The loading overlay (and its own cursor:wait, or whatever
                // busy/working cursor a program launched during boot left
                // pinned — see program.js's open()) is gone — force the
                // Cursor Engine to re-check what's actually under the
                // pointer now. detect.js only re-resolves reactively on a
                // pointermove to a DIFFERENT element (see its own
                // _lastElement cache), so if the mouse hasn't moved since
                // this overlay's cursor last changed, nothing would
                // otherwise trigger a re-check — the system would look
                // "ready" but the cursor would silently keep showing
                // busy/working until the user happened to move the mouse.
                if (app.exists("app.cursor.systemSet")) app.cursor.systemSet(null);
                _resolve();
            };

            // Fade bg using inline style — reliable regardless of class/stylesheet state.
            // void offsetHeight flushes styles so the transition fires from the correct value.
            // Same opacity 0.8s ease-out as desktop.js's wakeUp() (the black
            // flash shown when the browser tab/window regains focus) — this
            // black overlay and that one should read as the same single
            // animation. This used to fade the spinner out first (its own
            // fixed 0.3s, from sandstorm.gen.js's phase CSS — unaffected by
            // whatever duration was set here) and only *then* start fading
            // the background — a two-stage "snap, then slow fade" that felt
            // harsh no matter what this duration was, since the visible
            // snap was always the spinner's fixed 0.3s, never this one.
            // Fading the overlay itself instead — spinner included, as its
            // child — is one continuous animation, same as wakeUp()'s single
            // div fade; nothing needs its own separate transition anymore.
            const _fadeBg = () => {
                overlay.style.transition = 'opacity 0.8s ease-out';
                void overlay.offsetHeight;
                overlay.style.opacity = '0';
                overlay.addEventListener('transitionend', function _h(e) {
                    if (e.target !== overlay) return;
                    overlay.removeEventListener('transitionend', _h);
                    _cleanupAndRemove();
                });
            };
            _fadeBg();

            // Safety fallback — if transitionend never fires, force-remove.
            // Comfortably past the 0.8s bg fade (plus the up-to-0.3s spinner
            // fade that can precede it) so it never preempts the real
            // transition under normal conditions — a safety valve, not the
            // expected path.
            setTimeout(_cleanupAndRemove, 1400);

            return _promise;
        },

        /**
         * Updates the loading screen with new CSS or other modifications.
         * @param {Object} config - The configuration object for updating the loading screen.
         * @param {string} [config.id='load-screen'] - The ID of the loading screen to update.
         * @param {string} [config.css] - Additional CSS to add or update.
         * @param {boolean} [config.replaceCss=false] - If true, replaces all existing CSS instead of appending.
         * @param {string} [config.backgroundColor] - New background color for the loading screen.
         * @param {string} [config.cursor] - New cursor style for the loading screen.
         * @param {number} [config.zIndex] - New z-index for the loading screen.
         * @param {Array} [config.contentArray] - New content to add to the loading screen.
         * @param {boolean} [config.clearContent=false] - If true, clears existing content before adding new content.
         * @param {Object} [config.instyle] - Inline style object for applying CSS classes and properties.
         * @param {string} [config.instyle.class] - CSS class to add to the loading screen.
         * @param {number} [config.instyle.duration] - Duration for transitions in milliseconds.
         * @param {number} [config.instyle.zIndex] - Z-index value.
         * @param {string} [config.instyle.backgroundColor] - Background color.
         * @param {string} [config.instyle.cursor] - Cursor style.
         * @param {string} [config.instyle.opacity] - Opacity value.
         */
        updateLoadingScreen(config = {}) {
            const {
                id = 'load-screen',
                css = '',
                replaceCss = false,
                backgroundColor,
                cursor,
                zIndex,
                contentArray = [],
                clearContent = false,
                instyle = {}
            } = config;

            // Get the loading screen element
            const overlay = document.getElementById(id);
            if (!overlay) {
                app.dev.warn('Load screen not found. Cannot update.', "Load");
                return;
            }

            // Update CSS if provided
            if (css) {
                let styleElement = document.getElementById('loadcss');

                if (!styleElement) {
                    styleElement = document.createElement('style');
                    styleElement.id = 'loadcss';
                    document.head.appendChild(styleElement);
                }

                if (replaceCss) {
                    styleElement.textContent = css;
                } else {
                    styleElement.textContent += css;
                }
            }

            // Handle instyle object
            if (Object.keys(instyle).length > 0) {
                // Add CSS class if provided
                if (instyle.class) {
                    overlay.classList.add(instyle.class);
                }

                // Set transition duration if provided
                if (instyle.duration !== undefined) {
                    overlay.style.transition = `all ${instyle.duration}ms ease`;
                }

                // Apply other style properties
                if (instyle.zIndex !== undefined) {
                    overlay.style.zIndex = instyle.zIndex;
                }

                if (instyle.backgroundColor) {
                    overlay.style.backgroundColor = instyle.backgroundColor;
                }

                if (instyle.cursor) {
                    overlay.style.cursor = instyle.cursor;
                }

                if (instyle.opacity !== undefined) {
                    overlay.style.opacity = instyle.opacity;
                }
            }

            // Update inline styles if provided (fallback to direct properties)
            if (backgroundColor && !instyle.backgroundColor) {
                overlay.style.backgroundColor = backgroundColor;
            }

            if (cursor && !instyle.cursor) {
                overlay.style.cursor = cursor;
            }

            if (zIndex !== undefined && instyle.zIndex === undefined) {
                overlay.style.zIndex = zIndex;
            }

            // Update content if provided
            if (contentArray.length > 0) {
                if (clearContent) {
                    overlay.innerHTML = '';
                }

                const styleElement = document.getElementById('loadcss');

                contentArray.forEach(item => {
                    let element;

                    if (item.type === 'html') {
                        element = document.createElement('div');
                        element.innerHTML = item.content;
                        overlay.appendChild(element);
                    } else if (item.type === 'css') {
                        if (styleElement) {
                            styleElement.textContent += item.content;
                        } else {
                            const newStyle = document.createElement('style');
                            newStyle.id = 'loadcss';
                            newStyle.textContent = item.content;
                            document.head.appendChild(newStyle);
                        }
                    } else {
                        app.dev.warn(`Unsupported content type: ${item.type}`, "Load");
                    }
                });
            }
        },


        /**
         * Loads a list of resources such as CSS, JS, and image files.
         * @param {Array<string>} files - An array of file paths to load.
         * @param {Function} [beforeLoad] - A callback function to execute before loading the resources.
         * @param {Function} [afterLoad] - A callback function to execute after loading the resources.
         */
        async resources(files, beforeLoad, afterLoad) {
            if (typeof beforeLoad === 'function') beforeLoad();

            let promises = files.map(file => this.loadFile(file));
            try {
                await Promise.all(promises);
                if (typeof afterLoad === 'function') afterLoad();
            } catch (error) {
                app.dev.error(`Error loading files: ${error}`, "Load");
            }
        },

        /**
         * Removes `<script>`/`<link>`/`<img>` elements previously injected by
         * `app.load.resources()` — matched by their `src`/`href` equalling
         * the given file path. Elements of unsupported types (per `loadFile`)
         * were never inserted, so there's nothing to remove for those.
         * @param {Array<string>} files - The same file paths passed to `resources()`.
         */
        removeResources(files = []) {
            files.forEach(file => {
                document.querySelectorAll('script[src], link[href], img[src]').forEach(el => {
                    if (el.getAttribute('src') === file || el.getAttribute('href') === file) el.remove();
                });
            });
        },

        /**
         * Loads an individual file based on its type.
         * @param {string} file - The file path to load.
         * @returns {Promise} - A promise that resolves when the file is successfully loaded, or rejects if the file fails to load.
         */
        loadFile(file) {
            return new Promise((resolve, reject) => {
                let element;
                if (file.endsWith('.js')) {
                    element = document.createElement('script');
                    element.src = file;
                    element.async = true;
                } else if (file.endsWith('.css')) {
                    element = document.createElement('link');
                    element.href = file;
                    element.rel = 'stylesheet';
                } else if (file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.gif')) {
                    element = document.createElement('img');
                    element.src = file;
                } else {
                    app.dev.warn(`Unsupported file type for file: ${file}`, "Load");
                    resolve(); // Resolve immediately for unsupported types
                    return;
                }

                element.onload = () => {
                    app.dev.log(`${file} loaded successfully.`, "Load");
                    resolve();
                };
                element.onerror = () => {
                    app.dev.warn(`Failed to load ${file}`, "Load");
                    reject(`Failed to load ${file}`);
                };

                document.head.appendChild(element);
            });
        },

        /**
        * Preloads an image by creating an Image object and setting its source.
        * @param {string} url - The URL of the image to preload.
        * @returns {Promise} - A promise that resolves with the Image object when the image is successfully loaded, or rejects with an error if the image fails to load.
        */
        preloadImage(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(new Error(`Failed to preload image: ${url}`));
                img.src = url;
            });
        },

        /**
         * Low-level SVG symbol injection. Prefer app.svg.global.load() or
         * app.svg.private.load(), which add ownership tracking and lifecycle
         * management on top of this primitive.
         *
         * Adds a single SVG symbol to the document.
         * @param {Object} svg - An object representing the SVG symbol to add.
         * The object should have id, viewBox, and content properties.
         */
       addSVG: function (svg) {

        // Validate input early
        if (!svg || !svg.id) {
            app.dev.error('SVG missing id or is invalid', svg);
            return;
        }

        if (!svg.content) {
            app.dev.error('SVG content is missing.', svg.id);
            return;
        }

        // Reject embedded JavaScript — <script> elements, on*="" event
        // handler attributes, and javascript: URIs all execute once the
        // symbol lands in the live document, regardless of how it got
        // there (even the innerHTML fallback below doesn't neutralize
        // on* attributes, since those are just standard DOM attributes).
        // All three checks are case-insensitive (/i) AND run again against
        // a numeric-HTML-entity-decoded copy of the content — a classic
        // filter bypass is spelling it "&#x6A;avascript:" / "&#106;vascript:"
        // etc., which the browser decodes back to plain "javascript:" once
        // the attribute value is parsed, same as if it were never encoded.
        if (containsInlineScript(svg.content)) {
            app.dev.warn('SVG rejected — JavaScript is not allowed:', svg.id);
            return;
        }

        // Ensure svg#data exists
        let svgData = document.querySelector('svg#data');

        if (!svgData) {
            svgData = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgData.setAttribute('id', 'data');
            svgData.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svgData.style.display = 'none';
            document.body.appendChild(svgData);
        }

        // Prevent duplicate symbols
        if (svgData.querySelector(`#${svg.id}`)) {
            app.dev.warn('SVG already exists:', svg.id);
            return;
        }

        // Create symbol
        const symbolElement = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
        symbolElement.setAttribute('id', svg.id);
        symbolElement.setAttribute('viewBox', svg.viewBox || '0 0 100 100');

        // Replace gradient IDs safely
        const modifiedContent = replaceGradientIds(svg.content, svg.id);

        // Basic SVG sanity check (not strict, but useful). Includes `text`
        // (and `tspan`) — program/designer/setup.js's ic-designer-tag/font/
        // fontweight icons render a glyph (¶, "Aa", "B") via <text> with no
        // path/rect/etc. at all, which is entirely valid SVG but tripped
        // this heuristic's false-positive "might be malformed" warning on
        // every boot even though the icon loads and renders correctly.
        const isProbablySvg =
            /<(path|g|circle|rect|polygon|line|polyline|svg|text|tspan)/.test(modifiedContent);

        if (!isProbablySvg) {
            app.dev.warn('SVG might be malformed:', svg.id);
        }

        // Parse SVG safely (instead of innerHTML injection issues)
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
                `<svg xmlns="http://www.w3.org/2000/svg">${modifiedContent}</svg>`,
                'image/svg+xml'
            );

            const parsedSvg = doc.documentElement;

            // Import nodes safely into real DOM
            Array.from(parsedSvg.childNodes).forEach(node => {
                symbolElement.appendChild(document.importNode(node, true));
            });

        } catch (err) {
            app.dev.error('SVG parse failed:', svg.id, err);

            // fallback (last resort)
            symbolElement.innerHTML = modifiedContent;
        }

        // Append to sprite
        svgData.appendChild(symbolElement);
    },

    /**
     * Low-level SVG symbol removal — the counterpart to addSVG(). Prefer
     * app.svg.global.unload() or app.svg.private.unload(), which keep
     * ownership bookkeeping in sync with the DOM.
     * @param {string} id - The id of the <symbol> to remove.
     * @returns {boolean} True if a symbol was found and removed.
     */
    removeSVG: function (id) {
        // getElementById avoids treating id as a CSS selector — a plain
        // querySelector(`#${id}`) breaks on ids containing `:`, `.`, etc.
        // Safe here because symbol ids are required to be globally unique.
        const symbol = document.getElementById(id);
        if (!symbol) return false;
        symbol.remove();
        return true;
    },

    };
        app.lock('load.*', { writable: false, configurable: false });
})(window.app = window.app || {});

/**
 * Rewrites IDs and references in the SVG content to avoid conflicts
 * @param {string} content - SVG innerHTML
 * @param {string} prefix - A prefix to make all IDs unique (usually the symbol ID)
 * @returns {string} - Modified SVG content with updated IDs
 */
function replaceGradientIds(content, prefix) {
    const idRegex = /id="([^"]+)"/g;
    const urlRegex = /url\(#([^)]+)\)/g;

    // Map old ids to new unique ids (based on prefix)
    const idMap = {};
    content = content.replace(idRegex, (match, id) => {
        const newId = `${prefix}_${id}`;
        idMap[id] = newId;
        return `id="${newId}"`;
    });

    // Update all url(#...) references to point to new IDs
    content = content.replace(urlRegex, (match, id) => {
        const newId = idMap[id] || `${prefix}_${id}`; // fallback if not already in idMap
        return `url(#${newId})`;
    });

    return content;
}

/**
 * Decodes numeric HTML character references (`&#106;`, `&#x6A;`) — the
 * standard way attackers spell out "javascript:" or "on..." to slip past a
 * plain-text filter, since the browser decodes them right back to the
 * literal characters once it parses the attribute value.
 * @param {string} str
 * @returns {string}
 */
function decodeNumericEntities(str) {
    return str
        .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/**
 * @param {string} content - Raw SVG markup to scan.
 * @returns {boolean} True if a <script> element, on*="" event handler
 * attribute, or javascript: URI is present — checked against both the raw
 * content and a numeric-entity-decoded copy (case-insensitively) so
 * hex/decimal-encoded obfuscation doesn't slip through.
 */
function containsInlineScript(content) {
    const check = s =>
        /<script[\s>]/i.test(s) ||
        /\son\w+\s*=/i.test(s) ||
        /javascript\s*:/i.test(s);

    return check(content) || check(decodeNumericEntities(content));
}