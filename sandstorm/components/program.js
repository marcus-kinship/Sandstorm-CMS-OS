/**
 * @file program.js
 * @description Program registry and lifecycle manager for the Sandstorm OS.
 *
 * Registers `app.program` — the central store that tracks all installed
 * programs and their open windows. Programs are stored in a private `Map`
 * keyed by their string ID.
 *
 * Responsibilities:
 * - Register and retrieve program metadata via `addInfo` / `getInfo`.
 * - Attach the loaded module via `add` (called by `includeProgram`).
 * - Track open windows per program: position, size, z-index, status, title.
 * - Manage program lifecycle: `running`, `success`, `fail`, `abort`, `exit`.
 * - Expose iteration helpers: `keys`, `values`, `entries`, `forEach`.
 *
 * @module components/program
 *
 * @example
 * // Typical usage inside a program module's setup():
 * export function setup(app) {
 *   app.program.addInfo("calc", {
 *     name: "Calculator", version: "1.0", owner: "Sandstorm",
 *     description: "Simple calculator", icontype: "svg",
 *     icon: "#ic-calc", taskbar: true, startmenu: true, main: "start"
 *   });
 * }
 * export function start(app) { ... }
 */
(function (app) {
    // Private variables - using Map for program storage
    let _infoMap = new Map(); // Privat Map för program
    let _sandstormcomponents = [];
    let _exitHandlers = new Map(); // programId -> Function[], run once on exit()

    // Private helper functions - not exposed to global scope

    /**
     * Helper function to validate program existence and get/create window
     * @private
     * @param {string} id - Program ID
     * @param {string} windowId - Window ID
     * @param {boolean} createIfNotExists - Whether to create window if it doesn't exist
     * @returns {Object|null} Object containing program and targetWindow or null if program doesn't exist
     */
    function getOrCreateWindow(id, windowId, createIfNotExists = false) {
        // Check if the program exists
        if (id === "sandstormscomponents") {
            const existingEl = document.querySelector(`.pid-${id}#${windowId}`);
            if (existingEl) {
                app.dev.log(`Using existing DOM window for ${id}.`, "Program");
                return {
                    program: { id: id, windows: [] },
                    targetWindow: { id: windowId, el: existingEl },
                    windows: []
                };
            } else {
                // returnera tomt objekt istället för null
                return { program: null, targetWindow: null, windows: [] };
            }
        }

        if (!_infoMap.has(id)) {
            app.dev.warn(`Program with ID ${id} does not exist. Skipping.`, "Program");
            return null;
        }

        const program = _infoMap.get(id);

        // Ensure windows array exists
        program.windows = program.windows || [];

        // Find the specific window inside the program
        const windows = program.windows;
        let targetWindow = windows.find(win => win.id === windowId);

        // Create window if it doesn't exist and createIfNotExists is true
        if (!targetWindow && createIfNotExists) {
            targetWindow = { id: windowId };
            windows.push(targetWindow);
            app.dev.log(`Created new window with ID ${windowId} in program ${id}.`, "Program");
        } else if (!targetWindow) {
            app.dev.error(`Window with ID ${windowId} does not exist for program ${id}.`, "Window");
            return null; // Return null instead of throwing error
        }

        return {
            program: program,
            targetWindow: targetWindow,
            windows: windows
        };
    }

    /**
     * Helper function to parse and validate numeric values
     * @private
     * @param {*} value - Value to parse
     * @param {string} fieldName - Name of the field for error reporting
     * @param {boolean} fallbackToZero - Whether to fallback to 0 for invalid values
     * @returns {number|null|undefined} 
     *   - Returns number if valid
     *   - Returns null if value is null
     *   - Returns undefined if value is "" (empty string)
     *   - Returns 0 if fallbackToZero is true and value is invalid
     *   - Throws Error if fallbackToZero is false and value is not a valid number
     */
    function parseNumericValue(value, fieldName, fallbackToZero = false) {
        if (value === null) {
            return null;
        }
        if (value === "") {
            return undefined; // Special case: skip this value
        }

        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            if (fallbackToZero) {
                app.dev.warn(`Invalid ${fieldName}: ${value}. Falling back to 0.`, "Program");
                return 0;
            } else {
                throw new Error(`Invalid ${fieldName}: ${value} is not a valid number.`);
            }
        }

        return parsed;
    }

    /**
     * Helper function to safely get window data with proper error handling
     * @private
     * @param {string} id - Program ID
     * @param {string} windowId - Window ID
     * @param {boolean} createIfNotExists - Whether to create window if it doesn't exist
     * @returns {Object} Object containing targetWindow
     * @throws {Error} If window or program not found
     */
    function getWindowDataSafely(id, windowId, createIfNotExists = false) {
        const winData = getOrCreateWindow(id, windowId, createIfNotExists);
        if (!winData) {
            throw new Error(`Program with ID ${id} does not exist.`);
        }
        if (!winData.targetWindow) {
            throw new Error(`Window with ID ${windowId} does not exist for program ${id}.`);
        }
        return winData;
    }

    app.program = {
        lastid: null,

        /**
         * Sets a program's taskbar icon to be visible.
         * 
         * This function only updates the `taskbarDisplay` property
         * and does NOT affect the original `taskbar` setting
         * defined in the program configuration.
         *
         * @function setTaskbarIconDisplayTrue
         * @memberof app.program
         * @param {string} id - The ID of the program to update.
         * 
         * @example
         * app.program.setTaskbarIconDisplayTrue("calculator");
         *
         * @description
         * Use this function to force a program to appear in the taskbar,
         * even if `program.taskbar` is false by default.
         */
        setTaskbarIconDisplayTrue: function (id) {
            let program = this.getInfo(id);
            if (!program) {
                app.dev.error(`Program not found for ID: ${id}`, "Program");
                return;
            }
            program.taskbarDisplay = true;
            app.dev.log(`taskbarDisplay for program ${id} set to TRUE`, "Program");
        },

        /**
         * Sets a program's taskbar icon to be hidden.
         * 
         * This function only updates the `taskbarDisplay` property
         * and does NOT affect the original `taskbar` setting.
         *
         * @function setTaskbarIconDisplayFalse
         * @memberof app.program
         * @param {string} id - The ID of the program to hide.
         * 
         * @example
         * app.program.setTaskbarIconDisplayFalse("solitaire");
         *
         * @description
         * Use this function to hide a program from the taskbar,
         * even if `program.taskbar` is true by default.
         */
        setTaskbarIconDisplayFalse: function (id) {
            let program = this.getInfo(id);
            if (!program) {
                app.dev.error(`Program not found for ID: ${id}`, "Program");
                return;
            }
            program.taskbarDisplay = false;
            app.dev.log(`taskbarDisplay for program ${id} set to FALSE`, "Program");
        },

        /**
         * Get all sandstorm components
         * @returns {Array} All sandstorm components
         */
        getSandstormComponents: function () {
            return _sandstormcomponents;
        },

        /**
         * Get sandstorm component by windowId
         * @param {string} windowId - The windowId to search for
         * @returns {Object|null} The component if found, otherwise null
         */
        getSandstormComponent: function (windowId) {
            return _sandstormcomponents.find(component => component.windowId === windowId) || null;
        },

        /**
         * Add a new Sandstorm component.
         * 
         * If the `sandstormcomponents` array does not exist, it will be created.
         * If `windowId` is not provided or is not a string, a new one will be generated as "sandstormscomponents-N".
         * 
         * @param {string|null} windowId - Optional windowId for the component. If omitted, a new running-number ID is assigned.
         * @param {Object} program - The component object to add.
         * @returns {string} The assigned `windowId` of the newly added component.
         * 
         * @example
         * const id = app.program.addSandstormComponents(null, {name: "WindGenerator", power: 100});
         * console.log(id); // "sandstormscomponents-0" if first element
         */
        addSandstormComponents: function (windowId, program) {
            // Ensure the array exists
            if (!Array.isArray(_sandstormcomponents)) {
                _sandstormcomponents = [];
            }

            // If no windowId is provided or is NOT a string, create one based on the running number
            if (typeof windowId !== "string") {
                const nextNumber = _sandstormcomponents.length;
                windowId = `sandstormscomponents-${nextNumber}`;
            }

            // Merge data and include id + windowId
            const component = Object.assign({}, program, {
                id: _sandstormcomponents.length,
                windowId: windowId
            });

            // Add to the list
            _sandstormcomponents.push(component);

            // Return the assigned windowId
            return windowId;
        },

        /**
         * Remove a Sandstorm component by its windowId.
         * 
         * If the ID is invalid or the array does not exist, this function does nothing.
         * 
         * @param {string} windowId - The windowId of the component to remove.
         * 
         * @example
         * app.program.removeSandstormComponents("sandstormscomponents-0");
         */
        removeSandstormComponents: function (windowId) {
            // Return if the array doesn't exist
            if (!Array.isArray(_sandstormcomponents)) return;

            // Find the component by its windowId
            const index = _sandstormcomponents.findIndex(
                c => c.windowId === windowId
            );

            // Remove the component if found
            if (index !== -1) {
                _sandstormcomponents.splice(index, 1);
            }
        },

        /**
         * Retrieves all program information.
         * @function getAll
         * @memberof app.program
         * @returns {Object} - Returns an object with all programs (converted from Map to object).
         * 
         * @example
         * const allProgramInfo = app.program.getAll();
         * console.log(allProgramInfo);
         */
        getAll() {
            // Convert Map to object for backward compatibility
            const result = {};
            _infoMap.forEach((value, key) => {
                result[key] = value;
            });
            return result;
        },

        /**
         * Adds a program to the program list.
         * 
         * @param {Object} program - The program object to add.
         * @param {function} program.setup - The setup function for initializing the program.
         * 
         * @description 
         * This method adds a program to the internal Map of programs. Before adding, 
         * it checks whether the provided program object contains a valid setup function. 
         * If the setup function is missing or not a function, an error message is logged 
         * to the console, and the program is not added. If successful, a confirmation 
         * message is logged.
         * 
         * @example
         * const myProgram = {
         *     setup: function() {
         *         console.log('Setting up my program...');
         *     }
         * };
         * app.program.add(myProgram);
         * 
         * @returns {void} This method does not return a value.
         */
        fileHandlers: {},
        extInfo: {},
        fileMetaProviders: [],

        addFileMetaProvider: function(fn) {
            if (typeof fn === 'function') this.fileMetaProviders.push(fn);
        },

        add: function (program) {
            // Check if we have a lastid set
            if (this.lastid === null) {
                app.dev.error('No program ID set. You must call addInfo first to set up a program ID.', "Program");
                return;
            }

            // Check if the program contains a valid setup function
            if (typeof program.setup !== 'function') {
                app.dev.error('The program lacks a valid setup function.', "Program");
                this.lastid = null; // Reset lastid on error
                return;
            }

            // Check if the program exists in the Map
            const existingProgram = _infoMap.get(this.lastid);
            if (!existingProgram) {
                app.dev.error(`Program with ID ${this.lastid} not found. Make sure to call addInfo first.`, "Program");
                this.lastid = null; // Reset lastid on error
                return;
            }

            const capturedId = this.lastid;

            // Add the program to the program Map. Stored as a shallow copy, not the
            // raw ES module namespace object — namespace objects are non-extensible,
            // and open() needs to merge a lazily-loaded module's exports onto this
            // later (for programs split into setup.js + a lazy main file).
            Object.assign(existingProgram, {
                program: Object.assign({}, program),
                created: new Date().toISOString()
            });

            this.lastid = null; // Reset lastid after successful addition

            // Auto-register file handlers declared via openWith in addInfo
            const openWith = existingProgram.openWith;
            if (Array.isArray(openWith) && openWith.length) {
                openWith.forEach(item => {
                    const isStr = typeof item === 'string';
                    const key   = (isStr ? item : (item.ext || '')).toLowerCase();
                    if (!key) return;

                    if (!this.fileHandlers[key]) this.fileHandlers[key] = [];
                    this.fileHandlers[key].push({
                        id: capturedId,
                        fn: (path, entry) => {
                            app[capturedId] = app[capturedId] || {};
                            app[capturedId]._pendingPath  = path;
                            app[capturedId]._pendingEntry = entry || null;
                            this.open(capturedId);
                        }
                    });

                    // Store ext metadata from object entries
                    if (!isStr) {
                        const progInfo = _infoMap.get(capturedId) || {};
                        this.extInfo[key] = {
                            programId:   capturedId,
                            icon:        item.icon        ?? progInfo.icon        ?? null,
                            icontype:    item.icontype    ?? (item.icon?.startsWith('#') ? 'svg' : progInfo.icontype ?? null),
                            label:       item.label       ?? null,
                            description: item.description ?? null,
                            // Opt-in flag (see fotoviewer/setup.js's THUMBNAIL_EXTS)
                            // — when true, Explorer shows the entry's own .url as a
                            // real image thumbnail instead of this generic icon.
                            thumbnail:   item.thumbnail   === true,
                        };
                    }
                });
            }
        },

        /**
         * Adds program information to the program info Map.
         *
         * @param {string} id - The unique identifier for the program.
         * @param {Object} data - An object containing the program's information.
         * @param {string} data.name - The name of the program. Example: "Calculator".
         * @param {string} data.version - The version of the program. Example: "1.0".
         * @param {string} data.owner - The owner or creator of the program. Example: "Marcus Larsson".
         * @param {string} data.description - A short description of the program. Example: "Miniräknare" (Calculator in Swedish).
         * @param {string} data.icontype - The type of the icon image. Example: "png".
         * @param {string} data.programtype - The type of the program. Example: "program", "system".
         * @param {string} data.icon - The file path to the program's icon. Example: "program/calc2.png".
         * @param {boolean} data.taskbar - Indicates whether the program should appear in the taskbar. Example: true.
         * @param {boolean} data.startmenu - Indicates whether the program should appear in the start menu. Example: true.
         * @param {boolean} data.multistart - Specifies whether the program allows multiple instances to run. Example: true.
         * @param {string} data.main - The entry point or main function of the program. Example: "start".
         * @param {boolean} [data.autorun=false] - If true, app.load will automatically call the program's main function after all tasks complete. Example: true.
         * @param {boolean} [data.desktop=false] - If true, the program will be added to the desktop. Example: true.
         * @param {'clear'|'keep'} [data.historyOnExit='clear'] - What happens to this program's win.history session when its last (public scope) or its own (private scope) window closes. 'clear' frees it; 'keep' leaves it in app.historyManager so reopening picks up the same undo/redo stack.
         * @param {'public'|'private'} [data.historyScope='public'] - 'public' (default): one win.history session shared by every open window of this program, keyed by programId. 'private': each window gets its own independent session, keyed by windowId — for multistart programs where separate windows shouldn't undo/redo each other's actions.
         *
         * @description This function adds program information to the `infoMap` Map, using the program's ID as the key.
         * Before adding, it checks that the `data` object is valid and contains the necessary properties. If any required property
         * is missing, or if a program with the same ID already exists, it logs an error or warning message to the console.
         * 
         * @example
         * const programData = {
         *     name: "Calculator",
         *     version: "1.0",
         *     owner: "Marcus Larsson",
         *     description: "Miniräknare",
         *     icontype: "png",
         *     programtype: "program",
         *     icon: "program/calc2.png",
         *     taskbar: true,
         *     startmenu: true,
         *     multistart: false,
         *     main: "start"
         * };
         * app.program.addInfo('calc', programData);
         * 
         * @throws {Error} If the data object is not valid or required properties are missing.
         */
        addInfo: function (id, data) {
            // Check if data is a non-null object
            if (typeof data !== 'object' || data === null) {
                app.dev.error('Data must be a non-null object.', "Program");
                return;
            }

            // Check if data contains the necessary properties
            const requiredProperties = ['name', 'version', 'owner', 'description', 'icontype', 'icon', 'taskbar', 'startmenu', 'main'];
            for (const prop of requiredProperties) {
                if (!(prop in data)) {
                    app.dev.error(`Data is missing the property '${prop}'.`, "Program");
                    return;
                }
            }

            // Check if the program already exists in the program Map
            if (_infoMap.has(id)) {
                app.dev.warn(`A program with ID ${id} already exists.`, "Program");
                return;
            }

            // Set programtype to default if undefined or null
            if (data.programtype === undefined || data.programtype === null) {
                data.programtype = "program";
            }

            // Set multistart to false if undefined or null
            if (data.multistart === undefined || data.multistart === null) {
                data.multistart = false;
            }

            // Set taskbar to false if undefined or null
            if (data.taskbar === undefined || data.taskbar === null) {
                data.taskbar = false;
            }

            // Set desktop to false if undefined or null
            if (data.desktop === undefined || data.desktop === null) {
                data.desktop = false;
            }

            // Set autorun to false if undefined or null
            if (data.autorun === undefined || data.autorun === null) {
                data.autorun = false;
            }

            // Support name/description as either a plain string (existing
            // behavior — _() resolves once, here, and is frozen forever) or
            // a thunk `() => _(...)` that re-resolves the current
            // translation on every read instead — same duck-typed pattern
            // os.controlpanel.add() already uses for its own label/name
            // fields (see language.js's `label: () => _('Language')`).
            // Needed because a plain `name: _("Calculator")` call resolves
            // _() exactly once, at addInfo() time, and never updates again
            // on a later language switch — every consumer (Start Menu's
            // Apps grid, Control Panel's Programs panel, taskbar tooltips)
            // reads this same object, so making the field itself live here
            // fixes all of them at once, with no changes needed on their
            // end, AS LONG AS they re-read .name/.description on some
            // later render rather than caching the resolved string
            // themselves (verified true for all of them except taskbar's
            // pinned-icon bake at boot — see addtotaskbar.js's own
            // dedicated languageChanged refresh for that one exception).
            for (const field of ['name', 'description']) {
                if (typeof data[field] === 'function') {
                    const thunk = data[field];
                    Object.defineProperty(data, field, { get: thunk, enumerable: true, configurable: true });
                }
            }

            data.windows = [];
            data.status = "";

            // Add the program to the Map with the ID as the key
            _infoMap.set(id, data);

            // Set lastid AFTER successful validation and addition
            this.lastid = id;

            app.dev.log(`Program ${data.name} (ID: ${id}) has been added.`, "Program");
        },

        /**
         * Retrieves the program information for a given program ID.
         * 
         * @param {string} id - The ID of the program to retrieve.
         * @returns {Object|null} - The program information if found, otherwise null.
         * 
         * @description This function attempts to retrieve the program's details from the `infoMap` Map using the provided program ID.
         * If the program does not exist, an error is logged to the console and `null` is returned. Otherwise, the program's information
         * object is returned.
         * 
         * @example
         * // Retrieve the program information for a program with ID 'calc'
         * const programInfo = app.program.getInfo('calc');
         * if (programInfo) {
         *     console.log('Program Info:', programInfo);
         * }
         */
        getInfo: function (id) {
            const program = _infoMap.get(id);

            // If program is not found, return null
            if (!program) {
                return null;
            } else {
                // Return the program information if found
                return program;
            }
        },

        /**
         * Retrieves the main method of a program and optionally calls it.
         * 
         * @param {string} id - The ID of the program to retrieve and start.
         * @returns {function|null} - The main method of the program if successful, otherwise null.
         * 
         * @description This function attempts to fetch and return the main method of a program, identified by its program ID.
         * It ensures that the program exists, the module is available, and that the main method is a valid function.
         * Additionally, it checks if the program allows multiple instances (via the `multistart` property) and logs
         * whether the program window is already running or has been newly started.
         * 
         * If the program is set to only allow a single instance and a window is already open, the main method is not called again.
         * 
         * @example
         * // Retrieve and call the main method for a program with ID 'calc'
         * const mainMethod = app.program.getMain('calc');
         * if (mainMethod) {
         *     mainMethod();
         * }
         */
        getMain: function (id) {
            // Fetch the program info using the provided ID
            let program = this.getInfo(id);

            // If program doesn't exist, return null
            if (!program) {
                app.dev.error(`Error: Program with id ${id} not found in the list.`, "Program");
                return null;
            }

            // Retrieve the module corresponding to the program
            const module = program?.program;

            // If the module is missing, return null
            if (!module) {
                app.dev.error(`Error: Module for program ${program.name} is missing.`, "Program");
                return null;
            }

            // Get the name of the main method for the program
            const methodName = program.main;

            // Ensure that the method exists and is a function
            if (typeof module[methodName] !== 'function') {
                app.dev.error(`Error: function ${methodName} for program ${program.name} does not exist.`, "Program");
                return null;
            }

            // Get the number of windows associated with the program's ID
            const numWindows = document.querySelectorAll('.pid-' + id).length;

            // If the program allows multiple instances (multistart)
            if (!program.multistart) {
                if (numWindows == 0) {
                    app.dev.log(`Window '${program.name}' (ID: ${id}) has started.`, "Program");
                    return module[methodName];  // Return the main method of the program
                } else {
                    app.dev.log(`Window '${program.name}' (ID: ${id}-0) is already running.`, "Program");
                    return null;
                }
            }

            // For single instance programs, log and return the main method
            app.dev.log(`Window '${program.name}' (${id}) has started.`, "Program");

            return module[methodName];  // Return the main method of the program
        },

        /**
         * Launches a program, lazy-loading its main module first if needed.
         *
         * Programs registered via a small setup.js only export `setup()` (metadata
         * + icon) at boot; the real module (exporting the entry point named by
         * `main`, usually `start`) is dynamically imported here the first time the
         * program is actually opened, via `info.file`/`info.root`. Programs that
         * still export everything from one eagerly-loaded file (not yet migrated
         * to the setup.js split) already have `info.program[info.main]` set right
         * after boot, so this skips the import and behaves exactly like a plain
         * getMain()+invoke — this is what makes the split opt-in per program.
         *
         * This is the single chokepoint all launch surfaces (Start Menu, taskbar,
         * desktop icons, file-handler open) should call instead of doing
         * getMain()+invoke+addToRunningApps inline themselves.
         *
         * `options` is a generic "open context" — not specific to any one
         * caller. `app.shortcut.launch()` is one consumer; future launch
         * surfaces (recent documents, file associations, startmenu params)
         * can use the exact same shape.
         *
         * @param {string} id - The unique identifier of the program.
         * @param {Object} [options] - Optional launch context.
         * @param {*} [options.args] - Arbitrary data stashed on
         *   `app[id]._pendingContext.args` for the program to read (see
         *   {@link consumeContext}) once it starts. Not a permanent store —
         *   auto-cleared next microtask if never read.
         * @param {string} [options.source] - Who initiated this open, e.g. `"shortcut"`.
         * @param {string} [options.shortcutPath] - Set by `app.shortcut.launch()`.
         * @param {Object} [options.window] - Window state to apply to the
         *   window this call creates (ignored if it doesn't create one, e.g.
         *   focusing an already-open single-instance program).
         * @param {"normal"|"maximized"} [options.window.mode] - Resting size.
         * @param {"minimized"} [options.window.start] - If set, the window
         *   spawns hidden/straight into the taskbar instead of visible — no flash.
         * @returns {Promise<void>}
         */
        open: async function (id, options = {}) {
            const info = this.getInfo(id);
            if (!info) {
                app.dev.error(`Program not found for ID: ${id}`, "Program");
                return;
            }

            // "App is starting" feedback: pin the cursor to cursor-working
            // (the arrow+spinner "working in background" glyph, not the
            // fully-blocking cursor-busy hourglass) via the Cursor Engine's
            // ref-counted startWorking()/stopWorking() pair (cursor/api.js)
            // — passive CSS-based detection (the usual mechanism, e.g.
            // desktop/icons.js's 'grabbing' during drag) doesn't reach here
            // reliably: the pointer is almost always sitting over whatever
            // icon/menu-item was just clicked to launch this program, and
            // that element's own explicit `cursor: pointer` CSS wins the
            // cascade over anything set on <body>. Ref-counted specifically
            // because several autorun programs can launch around the same
            // time at boot, each with their own start/stop pair in flight.
            // Also sets the raw CSS value as a native-cursor fallback for
            // when the engine itself is disabled (harmless when it's
            // enabled — renderer.js's own native-hide rule already
            // suppresses it). Deliberately not the permission-gated
            // Cursor.set() API — that exists for a program to control the
            // cursor as its own feature, not for this system-level cue with
            // no single "calling program" to gate against.
            document.body.style.cursor = 'progress';
            if (app.exists("app.cursor.startWorking")) app.cursor.startWorking();

            // Releases the startWorking() call above exactly once. A
            // shared helper instead of repeating the release at every exit
            // point individually — with startWorking()/stopWorking() now
            // ref-counted, calling stopWorking() twice for one
            // startWorking() (e.g. once here AND once from windowStart()
            // for the same launch) would under-count and clear the cursor
            // prematurely, so every call site below funnels through this
            // one _stopped guard instead.
            let _stopped = false;
            const stopWorkingOnce = () => {
                if (_stopped) return;
                _stopped = true;
                if (document.body.style.cursor === 'progress') document.body.style.cursor = '';
                if (app.exists("app.cursor.stopWorking")) app.cursor.stopWorking();
            };

            try {
                // create() is idempotent — safe to call on every open(), including
                // a second window of a multi-instance program reusing the same
                // session. The program itself never calls this; it only ever sees
                // the session via win.history (ui/window.js's WindowElement).
                //
                // Only for historyScope:'public' (the default) — a programId-
                // keyed session shared by every window of this program. The
                // windowId isn't minted yet at this point (windowStart() does
                // that later), so historyScope:'private' sessions can't be
                // created here at all; window.js's windowStart() creates one
                // per window, keyed by windowId, once that id exists.
                if (app.exists("app.historyManager.create") && info.historyScope !== 'private') {
                    app.historyManager.create(id, { historyOnExit: info.historyOnExit });
                }

                const alreadyLoaded = info.program && typeof info.program[info.main] === 'function';
                if (!alreadyLoaded) {
                    if (!info.file) {
                        app.dev.error(`Program ${id} has no 'file' set for lazy loading.`, "Program");
                        stopWorkingOnce(); // no window will ever come from this call
                        return;
                    }
                    const rootBase = (info.root === 'components')
                        ? app.config.local.ComponentsRoot
                        : app.config.local.ProgramRoot;
                    const fullPath = (rootBase + "/" + info.file).replace(/([^:]\/)\/+/g, "$1");
                    app.dev.log(`Lazy-loading program module: ${fullPath}`, "Program");
                    const mod = await app.includeModule(fullPath);
                    if (!mod) {
                        app.dev.error(`Failed to lazy-load program ${id} from ${info.file}`, "Program");
                        stopWorkingOnce();
                        return;
                    }
                    info.program = info.program || {};
                    Object.assign(info.program, mod);
                }

                if (options.args !== undefined || options.source || options.shortcutPath) {
                    app[id] = app[id] || {};
                    const context = {
                        args: options.args ?? null,
                        source: options.source ?? null,
                        shortcutPath: options.shortcutPath ?? null
                    };
                    app[id]._pendingContext = context;
                    // Transient, NOT a permanent state store — nulled automatically
                    // next microtask if the program never reads it (see
                    // app.program.consumeContext). A program that wants to keep the
                    // context longer must copy it out itself before that happens.
                    queueMicrotask(() => {
                        if (app[id]._pendingContext === context) app[id]._pendingContext = null;
                    });
                }

                const main = this.getMain(id);
                if (main == null) {
                    stopWorkingOnce(); // already-running single-instance program — no new window
                    return;
                }
                info.windows = info.windows || [];
                const windowCountBefore = info.windows.length;
                const mainReturn = main(app);

                if (info.windows.length > windowCountBefore) {
                    // main() created a window synchronously (the common
                    // case) — ui/window/dialogs.js's windowStart() owns
                    // releasing the pin from here, exactly when that
                    // window's fade-in finishes (see its own comment).
                    // Calling stopWorkingOnce() here too would double-
                    // release this single startWorking() call and clear
                    // the cursor before the window it's actually for ever
                    // appears — the exact premature-clear bug this was
                    // already fixed for once before.
                } else {
                    // main() didn't create a window synchronously — either
                    // nothing more is coming, or start() is doing async
                    // work and will reach windowStart() itself a moment
                    // later. Deliberately NOT a fixed timeout guess: wait
                    // for start()'s own promise to actually settle (however
                    // long that legitimately takes — a slow network or
                    // heavy init is not a bug), and only then decide. This
                    // is fully decoupled from open()'s own completion below
                    // (options.window handling, addToRunningApps), so it
                    // doesn't change their existing timing.
                    Promise.resolve(mainReturn)
                        .catch(err => app.dev.error(`Program ${id}'s start() rejected: ${err}`, "Program"))
                        .finally(() => {
                            // Still nothing after start() itself is fully
                            // done (resolved, threw, or was always
                            // synchronous and simply never creates a
                            // window) — nothing left to wait for.
                            if (info.windows.length === windowCountBefore) stopWorkingOnce();
                        });
                    // Last-resort safety valve only — covers a start()
                    // whose own promise never settles at all (a hang/bug in
                    // that specific program), not the normal slow-load
                    // path above, which already released the cursor as
                    // soon as start() actually finished. stopWorkingOnce()'s
                    // own _stopped guard makes this a no-op whenever
                    // anything else already handled the release.
                    setTimeout(stopWorkingOnce, 30000);
                }

                if (options.window && info.windows.length > windowCountBefore) {
                    const win = info.windows[info.windows.length - 1];
                    const taskId = win.single ? win.id : id;
                    if (options.window.mode === "maximized") {
                        // Already a direct, idempotent-enough toggle — a freshly
                        // created window is never already maximized, so no new
                        // wrapper is needed here (unlike minimize, see window.js).
                        app.ui.windows.functions.maximize(win.id);
                    }
                    if (options.window.start === "minimized") {
                        app.ui.windows.functions.minimizeNow(win.id, taskId, { instant: true });
                    }
                }

                if (app.exists("app.desktop.startmenu.addToRunningApps")) {
                    app.desktop.startmenu.addToRunningApps(id);
                }
            } catch (err) {
                // Don't leave the cursor stuck in 'progress' forever if
                // something above throws before reaching windowStart().
                stopWorkingOnce();
                throw err;
            }
        },

        /**
         * Reads and clears a program's pending launch context set by
         * {@link open}'s `options.args`/`source`/`shortcutPath`. Optional
         * convenience over reading `app[id]._pendingContext` directly — saves
         * every program from having to remember to null the field itself.
         *
         * @param {string} id - The program's own id (e.g. called from inside
         *   its own `start()` as `app.program.consumeContext("calculator")`).
         * @returns {{args:*, source:string|null, shortcutPath:string|null}|null}
         *
         * @example
         * const ctx = app.program.consumeContext("calculator");
         * if (ctx?.args) { ... }
         */
        consumeContext: function (id) {
            const ctx = app[id]?._pendingContext ?? null;
            if (app[id]) app[id]._pendingContext = null;
            return ctx;
        },

        /**
         * Registers a callback to run once the next time the specified
         * program exits (its last window closes). Used by resource managers
         * (e.g. app.svg.private) to clean up per-program state.
         * @param {number|string} id - The unique identifier of the program.
         * @param {Function} fn - Callback to run on exit.
         */
        onExit: function (id, fn) {
            if (!_exitHandlers.has(id)) _exitHandlers.set(id, []);
            _exitHandlers.get(id).push(fn);
        },

        /**
         * Closes the specified program by resetting its status and running
         * any handlers registered via onExit().
         * @param {number|string} id - The unique identifier of the program.
         */
        exit: function (id) {
            this.setStatus(id, "");
            const handlers = _exitHandlers.get(id);
            if (handlers) {
                handlers.forEach(fn => {
                    try {
                        fn();
                    } catch (err) {
                        app.dev.error(`onExit handler failed for ${id}: ${err}`, "Program");
                    }
                });
                _exitHandlers.delete(id);
            }
        },

        /**
         * Sets the status of the specified program to "running".
         * @param {number|string} id - The unique identifier of the program.
         */
        running: function (id) {
            this.setStatus(id, "running");
        },

        /**
         * Sets the status of the specified program to "success".
         * @param {number|string} id - The unique identifier of the program.
         */
        success: function (id) {
            this.setStatus(id, "success");
        },

        /**
         * Sets the status of the specified program to "fail".
         * @param {number|string} id - The unique identifier of the program.
         */
        fail: function (id) {
            this.setStatus(id, "fail");
        },

        /**
         * Sets the status of the specified program to "abort".
         * @param {number|string} id - The unique identifier of the program.
         */
        abort: function (id) {
            this.setStatus(id, "abort");
        },

        /**
         * Updates the status of a program.
         * @param {number|string} id - The unique identifier of the program.
         * @param {string} value - The status to set.
         */
        setStatus: function (id, value = "") {
            let program = this.getInfo(id);
            if (!program) {
                app.dev.error(`Program not found for ID: ${id}`, "Program");
                return;
            }
            app.dev.log(`Setting program with ID: ${id} to '${value}'`, "Program");
            program.status = value;
        },

        /**
         * Retrieves the current status of a program.
         * @param {number|string} id - The unique identifier of the program.
         * @returns {string|null} The current status of the program or null if not found.
         */
        getStatus: function (id) {
            let program = this.getInfo(id);
            if (!program) {
                return null;
            }
            return program.status;
        },

        /**
         * Removes a window from the program's list of open windows.
         * 
         * @param {string} windowId - The unique identifier of the window to be removed.
         * @param {string} id - The program ID that the window belongs to.
         * 
         * @description This function searches for a window in the program's list of open windows by its unique window ID. 
         * If the window is found, it is removed from the list. This is useful when closing or cleaning up program windows 
         * to ensure that the program's state remains accurate.
         * 
         * @example
         * // Remove a window with ID 'window123' from the program 'program123'
         * app.program.removeWindowInfo('window123', 'program123');
         */
        removeWindowInfo: function (windowId, id) {
            // Skip system components
            if (id === "sandstormscomponents") {
                return;
            }

            // Fetch the program info using the provided ID
            let program = this.getInfo(id);
            if (!program) {
                app.dev.error(`Program not found for ID: ${id}`, "Program");
                return;
            }

            // Find the index of the window with the given windowId
            const winIndex = program.windows.findIndex((win) => win.id === windowId);

            // If the window exists in the list, remove it
            if (winIndex > -1) {
                program.windows.splice(winIndex, 1);
                app.dev.log(`Removed window with ID: ${windowId} from program ID: ${id}`, "Program");
            }

            // If no windows remain, assume the program is closed
            if (program.windows.length === 0) {
                app.dev.log(`No remaining windows for program ID: ${id}. Closing program.`, "Program");
                app.program.exit(id);
            }
        },

        /**
        * Adds a new window to the specified program by ID.
        * 
        * This function checks if the program with the provided ID exists. If it does, 
        * it adds a new window with the specified data. If any required properties 
        * (such as `status`, `left`, or `top`) are missing from the input data, 
        * default values are assigned to ensure the window's layout and state are correctly set.
        *
        * @function
        * @memberof app.program
        * @param {string|number} id - The unique identifier for the program to which the window will be added.
        * @param {string|number} windowId - The unique identifier for the window being added.
        * @param {Object} data - The data object containing the window's properties.
        * @param {string} data.title - The title of the window.
        * @param {string} [data.status="normal"] - The status of the window (e.g., "normal", "minimized", "maximized").
        * @param {boolean} [data.single=false] - Indicates whether the window is part of a group (e.g., tabbed interface).
        * @throws {Error} Throws an error if the program with the given ID does not exist.
        *
        */
        addWindowInfo: function (id, windowId, data) {
            const program = _infoMap.get(id);
            if (!program) {
                app.dev.error(`Program with ID ${id} does not exist.`, "Program");
                throw new Error(`Stop: Program with ID ${id} does not exist.`);
            }

            // Ensure windows array exists
            program.windows = program.windows || [];

            // Set default status if not provided in data
            const status = data.status || "normal";
            const single = data.single || false;

            // Add the new window to the program
            program.windows.push({
                id: windowId,
                title: data.title,
                status: status,
                single: single
            });
        },

        /**
         * Updates the position and size of a window for a specific program.
         *
         * - If a value is "" (empty string), it is ignored and the current value remains unchanged.
         * - If a value is null, it is explicitly set to null (to be handled as a default or reset later).
         * - If a value is a number (or a numeric string), it is parsed and assigned.
         *
         * @param {string} id - The program ID.
         * @param {string} windowId - The ID of the specific window to update.
         * @param {number|string|null} width - New width in pixels, or null, or "" to skip.
         * @param {number|string|null} height - New height in pixels, or null, or "" to skip.
         * @param {number|string|null} x - New X (left) position, or null, or "" to skip.
         * @param {number|string|null} y - New Y (top) position, or null, or "" to skip.
         */
        setWindowPosition: function (id, windowId, width, height, x, y) {
            // 🔹 Hoppa över systemkomponenter direkt
            if (id === "sandstormscomponents") {
                return;
            }

            // 🔹 Hämta fönsterdata på säkert sätt
            const winData = getOrCreateWindow(id, windowId, true);
            if (!winData || !winData.targetWindow) {
                app.dev.warn(`[Program] Could not update position for window ${windowId} in program ${id}: targetWindow missing.`, "Program");
                return;
            }

            const { targetWindow } = winData;

            // 🔹 Hantera numeriska värden med standardinställningar (inga fallbacks)
            const parsedWidth = parseNumericValue(width, "width");
            if (parsedWidth !== undefined) targetWindow.width = parsedWidth;

            const parsedHeight = parseNumericValue(height, "height");
            if (parsedHeight !== undefined) targetWindow.height = parsedHeight;

            const parsedX = parseNumericValue(x, "x position");
            if (parsedX !== undefined) targetWindow.x = parsedX;

            const parsedY = parseNumericValue(y, "y position");
            if (parsedY !== undefined) targetWindow.y = parsedY;
        },

        /**
         * Sets the z-index of a specific window within a program.
         * 
         * @param {string} id - The program ID.
         * @param {string} windowId - The ID of the specific window to update.
         * @param {number|string} zindex - The z-index value to set.
         * @param {boolean} [fallbackToZero=true] - Whether to fallback to 0 for invalid values (default: true).
         * 
         * @throws Will throw an error if zindex is invalid and fallbackToZero is false.
         */
        setWindowZindex: function (id, windowId, zindex, fallbackToZero = true) {
            // Skip system components that have no visible window
            if (id === "sandstormscomponents") {
                return;
            }

            const winData = getOrCreateWindow(id, windowId, true);

            // Safety check for missing window data
            if (!winData || !winData.targetWindow) {
                app.dev.warn(
                    `[Program] Could not update z-index for window ${windowId} in program ${id}: targetWindow missing.`,
                    "Program"
                );
                return;
            }

            const { targetWindow } = winData;

            try {
                // Parse z-index with optional fallback
                const parsedZindex = parseNumericValue(zindex, "z-index", fallbackToZero);

                // Handle empty string case (undefined)
                if (parsedZindex === undefined) {
                    if (fallbackToZero) {
                        targetWindow.zindex = 0;
                        app.dev.log(`Empty z-index for window ${windowId}, set to 0 (fallback)`, "Program");
                    } else {
                        app.dev.error("Z-index cannot be empty", "Program");
                        throw new Error("Z-index is required and cannot be empty");
                    }
                } else {
                    targetWindow.zindex = parsedZindex;
                    app.dev.log(`Set z-index ${parsedZindex} for window ${windowId} in program ${id}`, "Program");
                }
            } catch (error) {
                // If fallbackToZero is true and we got here, it means parseNumericValue threw an error
                if (fallbackToZero) {
                    // Fallback to 0 even for parsing errors
                    targetWindow.zindex = 0;
                    app.dev.warn(`Invalid z-index '${zindex}' for window ${windowId}, falling back to 0`, "Program");
                } else {
                    // Re-throw the error
                    app.dev.error(error.message, "Program");
                    throw error;
                }
            }
        },

        /**
         * Updates the title of a specific window within a program.
         * 
         * This function looks for a window with the given `windowId` within the program identified by `id`.
         * If the window is found, it updates the window's title to the provided `title` value.
         * If the program or the window does not exist, an error is thrown with an appropriate message.
         * 
         * @param {string} id - The identifier of the program that contains the window.
         * @param {string} windowId - The identifier of the window to update.
         * @param {string} title - The new title to set for the window.
         * 
         * @throws {Error} - Throws an error if the program with the given `id` does not exist.
         * @throws {Error} - Throws an error if the window with the given `windowId` does not exist within the program.
         */
        updateWindowTitle: function (id, windowId, title) {
            try {
                const winData = getWindowDataSafely(id, windowId, false);
                winData.targetWindow.title = title;
            } catch (error) {
                app.dev.error(error.message, "Window");
                throw error;
            }
        },

        /**
         * Retrieves information about a specific window within a program.
         * 
         * This function searches for a window with the given `windowId` within the program identified by `id`.
         * If the window is found, the full window object is returned. If either the program or the window does not exist,
         * an error is thrown with an appropriate message.
         * 
         * @param {string} id - The identifier of the program that contains the window.
         * @param {string} windowId - The identifier of the window whose information is to be retrieved.
         * 
         * @returns {Object} - The window object containing details such as `id`, `title`, `status`, etc.
         * 
         * @throws {Error} - Throws an error if the program with the given `id` does not exist.
         * @throws {Error} - Throws an error if the window with the given `windowId` does not exist within the program.
         */
        getWindowInfo: function (id, windowId) {
            try {
                const winData = getWindowDataSafely(id, windowId, false);
                return winData.targetWindow;
            } catch (error) {
                app.dev.error(error.message, "Window");
                throw error;
            }
        },

        /**
         * Retrieves the title of a specific window within a program.
         * 
         * This function searches for a window with the given `windowId` within the program identified by `id`.
         * If the window is found, its title is returned. If either the program or the window does not exist,
         * an error is thrown with an appropriate message.
         * 
         * @param {string} id - The identifier of the program that contains the window.
         * @param {string} windowId - The identifier of the window whose title is to be retrieved.
         * 
         * @returns {string} - The title of the window.
         * 
         * @throws {Error} - Throws an error if the program with the given `id` does not exist.
         * @throws {Error} - Throws an error if the window with the given `windowId` does not exist within the program.
         */
        getWindowTitle: function (id, windowId) {
            try {
                const winData = getWindowDataSafely(id, windowId, false);
                return winData.targetWindow.title;
            } catch (error) {
                app.dev.error(error.message, "Window");
                throw error;
            }
        },

        /**
         * Retrieves the status of a specific window within a program.
         * 
         * This function searches for a window with the given `windowId` within the program identified by `id`.
         * If the window is found, its status is returned. If either the program or the window does not exist,
         * a warning is logged and `null` is returned.
         * 
         * @param {string} id - The identifier of the program that contains the window.
         * @param {string} windowId - The identifier of the window whose status is to be retrieved.
         * 
         * @returns {string|null} - The status of the window (e.g., "normal", "minimized", "maximized"), or `null` if not found.
         */
        getWindowStatus: function (id, windowId) {
            // Skip system components that have no visible window
            if (id === "sandstormscomponents") {
                return null;
            }

            const winData = getOrCreateWindow(id, windowId, false);

            if (!winData || !winData.targetWindow) {
                app.dev.warn(
                    `[Program] Could not get window status for ${windowId} in program ${id}: targetWindow missing.`,
                    "Program"
                );
                return null;
            }

            return winData.targetWindow.status;
        },

        /**
         * Updates the status of a specific window in a program.
         * 
         * @param {string|number} id - The unique identifier for the program containing the window.
         * @param {string|number} windowId - The unique identifier for the window whose status will be updated.
         * @param {string} status - The new status to assign to the window (e.g., "normal", "minimized", "maximized").
         */
        updateWindowStatus: function (id, windowId, status) {
            // Skip system components that have no visible window
            if (id === "sandstormscomponents") {
                return;
            }

            const winData = getOrCreateWindow(id, windowId, false);

            if (!winData || !winData.targetWindow) {
                app.dev.warn(
                    `[Program] Could not update window status for ${windowId} in program ${id}: targetWindow missing.`,
                    "Program"
                );
                return;
            }

            winData.targetWindow.status = status;
            app.dev.log(
                `Window status updated: Program ID ${id}, Window ID ${windowId}, New Status ${status}`,
                "Program"
            );
        },

        /**
         * Retrieves the last window ID for the specified program by ID.
         * If no windows exist, it creates a new array and assigns the first window ID as 0.
         *
         * @function
         * @memberof app.program
         * @param {string|number} id - The unique identifier for the program.
         * @returns {number} - The next available window ID, starting from 0.
         * @throws {Error} Throws an error if the program with the given ID does not exist.
         */
        getLastWindowId: function (id) {
            // Check if the program with the specified ID exists
            const program = _infoMap.get(id);
            if (!program) {
                throw new Error(`Program with ID ${id} does not exist.`);
            }

            // If no windows exist, create a new empty array
            if (!program.windows) {
                program.windows = [];
            }

            // Get the number of windows and return the next available window ID, starting from 0
            const last = program.windows.length;

            // Return the next available ID, which is equal to the number of windows (starting from 0)
            return last;
        },

        /**
         * Removes a program from the Map by its ID.
         * 
         * @param {string} id - The ID of the program to remove.
         * @returns {boolean} - Returns true if the program was removed, false if it didn't exist.
         * 
         * @example
         * const wasRemoved = app.program.remove('calc');
         * if (wasRemoved) {
         *     console.log('Program removed successfully');
         * }
         */
        remove: function (id) {
            return _infoMap.delete(id);
        },

        /**
         * Checks if a program exists in the Map.
         * 
         * @param {string} id - The ID of the program to check.
         * @returns {boolean} - Returns true if the program exists, false otherwise.
         * 
         * @example
         * if (app.program.has('calc')) {
         *     console.log('Calculator program exists');
         * }
         */
        has: function (id) {
            return _infoMap.has(id);
        },

        /**
         * Returns the number of programs in the Map.
         * 
         * @returns {number} - The number of programs.
         * 
         * @example
         * const programCount = app.program.size();
         * console.log(`There are ${programCount} programs installed`);
         */
        size: function () {
            return _infoMap.size;
        },

        /**
         * Clears all programs from the Map.
         * 
         * @example
         * app.program.clear();
         * console.log('All programs have been cleared');
         */
        clear: function () {
            _infoMap.clear();
        },

        /**
         * Returns an iterator for all program IDs in the Map.
         * 
         * @returns {Iterator} - Iterator for program IDs.
         * 
         * @example
         * for (const id of app.program.keys()) {
         *     console.log(`Program ID: ${id}`);
         * }
         */
        keys: function () {
            return _infoMap.keys();
        },

        /**
         * Returns an iterator for all program values in the Map.
         * 
         * @returns {Iterator} - Iterator for program objects.
         * 
         * @example
         * for (const program of app.program.values()) {
         *     console.log(`Program: ${program.name}`);
         * }
         */
        values: function () {
            return _infoMap.values();
        },

        /**
         * Returns an iterator for all [id, program] pairs in the Map.
         * 
         * @returns {Iterator} - Iterator for key-value pairs.
         * 
         * @example
         * for (const [id, program] of app.program.entries()) {
         *     console.log(`ID: ${id}, Program: ${program.name}`);
         * }
         */
        entries: function () {
            return _infoMap.entries();
        },

        /**
         * Executes a callback function for each program in the Map.
         * 
         * @param {Function} callback - Function to execute for each program.
         * @param {*} thisArg - Value to use as `this` when executing callback.
         * 
         * @example
         * app.program.forEach((program, id) => {
         *     console.log(`Program ${id}: ${program.name}`);
         * });
         */
        forEach: function (callback, thisArg) {
            _infoMap.forEach(callback, thisArg);
        },

        /**
         * Returns an array of all currently running non-system programs.
         * Uses the same DOM-first pattern as addToRunningApps in startmenu.js:
         * queries .window elements, extracts pid-* classes, filters out system programs.
         * @returns {{ id: string, name: string, icon: string, icontype: string }[]}
         */
        getRunning: function () {
            const seen = new Set();
            const result = [];
            document.querySelectorAll('.window').forEach(win => {
                win.classList.forEach(cls => {
                    if (!cls.startsWith('pid-')) return;
                    const id = cls.slice(4);
                    if (seen.has(id)) return;
                    seen.add(id);
                    if (id === 'sandstorm_login') return;
                    const info = _infoMap.get(id);
                    if (!info) return;
                    result.push({ id, name: info.name, icon: info.icon, icontype: info.icontype });
                });
            });
            return result;
        },

        confirmRunning: function (onConfirm, title, runningList) {
            const heading = title || _('Logoff');
            const running = Array.isArray(runningList) ? runningList : [];

            if (!running.length) {
                if (typeof onConfirm === 'function') onConfirm();
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'logoff-screen';

            const box = document.createElement('div');
            box.className = 'logoff-screen-box';

            const titleEl = document.createElement('div');
            titleEl.className = 'logoff-screen-title';
            titleEl.textContent = heading;
            box.appendChild(titleEl);

            const sub = document.createElement('div');
            sub.style.cssText = 'font-size:12px;opacity:0.65;text-align:center;margin-top:-10px;';
            sub.textContent = _('The following programs are still running:');
            box.appendChild(sub);

            const list = document.createElement('div');
            list.className = 'logoff-screen-list';
            running.forEach(p => {
                const row = document.createElement('div');
                row.className = 'logoff-screen-row';
                const iconHTML = p.icontype === 'svg'
                    ? `<svg><use href="${p.icon}"></use></svg>`
                    : `<img src="${p.icon}" alt="">`;
                row.innerHTML = iconHTML + `<span>${p.name}</span>`;
                list.appendChild(row);
            });
            box.appendChild(list);

            const actions = document.createElement('div');
            actions.className = 'logoff-screen-actions';

            const btnCancel = document.createElement('button');
            btnCancel.className = 'aero-button';
            btnCancel.innerHTML = _('Cancel');
            btnCancel.onclick = () => {
                overlay.classList.remove('show');
                setTimeout(() => overlay.remove(), 320);
            };

            const btnQuit = document.createElement('button');
            btnQuit.className = 'aero-button';
            btnQuit.innerHTML = _('Log out anyway') + '<div class="after pulse"></div>';
            btnQuit.onclick = () => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                    if (typeof onConfirm === 'function') onConfirm();
                }, 320);
            };

            actions.appendChild(btnCancel);
            actions.appendChild(btnQuit);
            box.appendChild(actions);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('show'));
        },

    };

    app.lock('program.*', { writable: false, configurable: false }, ['lastid']);
})(window.app = window.app || {});