/**
 * @file modules.js
 * @description Dynamic module and program loader for the Sandstorm OS kernel.
 *
 * Patches `globalThis.app` with four methods that handle all runtime
 * JavaScript imports. Every import is first validated by
 * {@link app.validateDomain} before `import()` is called, ensuring the
 * security perimeter is never bypassed.
 *
 * Import hierarchy:
 * - {@link app.importFile}    — plain side-effect import (no module object returned)
 * - {@link app.includeModule} — ES module import, returns the module object
 * - {@link app.includeProgram}— structured program import; calls `setup()` and
 *   registers the program via `app.program.add()`
 *
 * Loaded as a side-effect ES module during the DOMContentLoaded boot sequence
 * in `sandstorm.gen.js` — `globalThis.app` must already exist.
 *
 * @module core/modules
 */

const app = globalThis.app;

/**
 * Records one successful load into `app.config.local.loadedModules` — a
 * flat, append-only list every loader in this file feeds (`importFile`,
 * `includeModule`, `includeProgram`), unlike `app.config.local.importFiles`
 * (only `importFile`'s own description->path map, used by `isImported`).
 * Exists so any UI (e.g. Task Manager's "Information" tab, `program/
 * taskmanager/taskmanager.js`) can show a single combined picture of every
 * file loaded this session — core system files, program entry files, and
 * every lazy sub-module a program pulls in later (e.g. Designer's own ~40
 * `includeModule` files, none of which `importFiles` ever tracked).
 *
 * @private
 * @param {string} path - Full URL or path as passed to the loader.
 * @param {"file"|"module"|"program"} kind - Which loader recorded this.
 */
function recordLoadedModule(path, kind) {
    if (!app.config.local.loadedModules) app.config.local.loadedModules = [];
    const url = new URL(path, window.location.href);
    const relativePath = url.pathname.replace(/^.*?(sandstorm\/|res\/|program\/|components\/)/, "$1");
    app.config.local.loadedModules.push({ path: relativePath, kind, loadedAt: Date.now() });
}

/**
 * Checks whether a file has already been imported in this session.
 *
 * Accepts either the description key or the relative path stored by
 * {@link app.importFile} in `app.config.local.importFiles`.
 *
 * @memberof app
 * @param {string} descriptionOrPath - The description label or relative path
 *   to look up.
 * @returns {boolean} `true` if the file has been imported; `false` otherwise.
 *
 * @example
 * app.isImported("ui.js");                        // true after first import
 * app.isImported("sandstorm/components/ui.js");   // also true
 */
app.isImported = function (descriptionOrPath) {
    const imports = this.config.local.importFiles || {};
    if (imports[descriptionOrPath]) return true;
    return Object.values(imports).includes(descriptionOrPath);
};

/**
 * Dynamically imports a JavaScript file as a side-effect (no module object
 * is returned) and records the import in `app.config.local.importFiles`.
 *
 * If the file was already imported the call is a no-op. The path is validated
 * by {@link app.validateDomain} before the native `import()` runs.
 *
 * @memberof app
 * @async
 * @param {string} path - Absolute or relative URL of the script to import.
 * @param {string} [description] - Human-readable label used as the registry
 *   key and in log messages. Defaults to the filename without `.js` extension.
 * @returns {Promise<null>} Always resolves to `null`.
 * @throws {Error} If security validation fails or if the import itself throws.
 *
 * @example
 * await app.importFile(
 *   app.config.local.ComponentsRoot + "ui.js",
 *   "ui.js"
 * );
 */
app.importFile = async function (path, description) {
    if (!description) description = path.split("/").pop().replace(/\.js$/, "");
    if (this.isImported(description) || this.isImported(path)) {
        this.dev.log(`${description} already imported, skipping.`, "Core");
        return null;
    }
    if (!this.validateDomain(path)) {
        throw new Error(`Import blocked: Security validation failed for ${path}`);
    }
    try {
        await import(path);
        this.dev.log(`${description} loaded successfully`, "Core");
        if (!this.config.local.importFiles) this.config.local.importFiles = {};
        const url = new URL(path, window.location.href);
        let relativePath = url.pathname.replace(/^.*?(sandstorm\/|res\/|program\/|components\/)/, "$1");
        this.config.local.importFiles[description] = relativePath;
        recordLoadedModule(path, "file");
    } catch (error) {
        this.dev.error(`Failed to load ${description}: ${error.message}`, "Core");
        throw error;
    }
    return null;
};

/**
 * Dynamically imports an ES module and returns its module namespace object.
 *
 * The path is validated by {@link app.validateDomain} (with base-path
 * enforcement) before the native `import()` runs. On failure `null` is
 * returned rather than throwing, so callers can check the result.
 *
 * @memberof app
 * @async
 * @param {string} path - Full URL or path of the ES module to import.
 * @returns {Promise<Object|null>} The module namespace object, or `null` if
 *   security validation or the import itself fails.
 *
 * @example
 * const mod = await app.includeModule(
 *   app.config.local.ComponentsRoot + "controlpanel/programs/core.js"
 * );
 * if (mod?.setup) mod.setup(app);
 */
app.includeModule = async function (path) {
    if (!this.validateDomain(path, null, true)) {
        throw new Error(`Import blocked: Security validation failed for ${path}`);
    }
    try {
        const module = await import(path);
        this.dev.log(`${path} loaded successfully`, "Core");
        recordLoadedModule(path, "module");
        return module;
    } catch (error) {
        this.dev.error("Error importing module:", error, "Core");
        return null;
    }
};

/**
 * Loads a structured Sandstorm program module, calls its `setup()` function,
 * and registers it via `app.program.add()`.
 *
 * A valid program module must export a `setup` function (sync or async).
 * The path is resolved relative to either the program root or the components
 * root depending on the `root` argument, then validated by
 * {@link app.validateDomain}.
 *
 * Prerequisites:
 * - `app.program` must already be loaded (checked via `app.exists`).
 * - `path` must not contain `..` or begin with `/`.
 *
 * @memberof app
 * @async
 * @param {string} path - Relative path to the program file, e.g.
 *   `"calc/calc.js"` or `"explorer/explorer.js"`.
 * @param {""|"program"|"components"} [root=""] - Base directory selector.
 *   - `""` or `"program"` — resolves from `app.config.local.ProgramRoot`.
 *   - `"components"` — resolves from `app.config.local.ComponentsRoot`.
 * @returns {Promise<Object|null>} The module namespace object after `setup()`
 *   has run, or `null` on any failure.
 *
 * @example
 * // Load a user-facing program
 * await app.includeProgram("calc/calc.js");
 *
 * // Load a system component
 * await app.includeProgram("explorer/explorer.js", "components");
 */
app.includeProgram = async function (path, root = "") {
    if (!this.exists("app.program")) {
        globalThis.showErrorOverlay({
            title: `Oh well 😑 ... What were we thinking here?`,
            errorMessage: `I can't handle this program because I need the program module for it.`,
            exit: `Import fails of module. CMS loading stopped.`,
        });
        this.dev.error("You must load the program module before adding a program.", "Core");
        return null;
    }
    let ProgramRoot = "";
    if (root === "" || root === "program") {
        ProgramRoot = this.config.local.ProgramRoot;
    } else if (root === "components") {
        ProgramRoot = this.config.local.ComponentsRoot;
    } else {
        this.dev.error(`Invalid root specified: ${root}. Use 'program' or 'components'.`, "Core");
        return null;
    }
    if (path.includes('..') || path.startsWith('/')) {
        this.dev.error(`Security Error: Invalid path format: ${path}`, "Core");
        return null;
    }
    const fullPath = (ProgramRoot + "/" + path).replace(/([^:]\/)\/+/g, "$1");
    if (!this.validateDomain(fullPath, null, true)) {
        throw new Error(`Import blocked: Security validation failed for ${fullPath}`);
    }
    try {
        const module = await import(fullPath);
        this.dev.log(`${path} loaded successfully`, "Core");
        recordLoadedModule(fullPath, "program");
        if (!module || typeof module !== "object") {
            this.dev.error(`The program ${path} must be a non-null object.`, "Core");
            return null;
        }
        if (typeof module.setup !== "function") {
            this.dev.error(`The program ${path} lacks a valid setup function.`, "Core");
            return null;
        }
        if (module.setup.constructor.name === "AsyncFunction") {
            await module.setup(app);
        } else {
            module.setup(app);
        }
        app.program.add(module);
        return module;
    } catch (error) {
        this.dev.error(`Error importing module: ${fullPath}`, error, "Core");
        return null;
    }
};
