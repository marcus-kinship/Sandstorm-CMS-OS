/**
 * @file css.js
 * @description Runtime CSS management utilities for the Sandstorm OS kernel.
 *
 * Patches `globalThis.app` with six methods that read from and write to the
 * two shared `<style>` elements used by Sandstorm:
 * - `#s_css` — the primary stylesheet; manages named CSS blocks delimited by
 *   comment sentinels (`/* identifier *‌/ … /* end-identifier *‌/`).
 * - `#cssVariables` — a `:root {}` block used exclusively for CSS custom
 *   properties.
 *
 * Loaded as a side-effect ES module during the DOMContentLoaded boot sequence
 * in `sandstorm.gen.js` — `globalThis.app` must already exist.
 *
 * @module ui/css
 */

const app = globalThis.app;

/** @type {Map<string, Set<string>>} Maps programId → set of CSS block identifiers added for that program. */
const _programCSSRegistry = new Map();

/**
 * Normalises a CSS custom property name by ensuring it starts with `--`.
 *
 * @private
 * @param {string} name - Raw property name (e.g. `"theme-color"` or
 *   `"--theme-color"`).
 * @returns {string} Name with `--` prefix (e.g. `"--theme-color"`).
 */
function _normalizeName(name) {
    return name.startsWith("--") ? name : `--${name}`;
}

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 *
 * @memberof app
 * @param {string} identifier - The string to escape.
 * @returns {string} Regex-safe version of the input.
 *
 * @example
 * app.escapeRegex("my.block");  // "my\\.block"
 */
app.escapeRegex = function (identifier) {
    return identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Removes a named CSS block from `#s_css`.
 *
 * A block is delimited by:
 * ```
 * /* identifier *‌/
 *   … CSS …
 * /* end-identifier *‌/
 * ```
 * If no matching block is found the method logs a warning and returns silently.
 *
 * @memberof app
 * @param {string} identifier - The block identifier used when the CSS was
 *   injected via {@link app.addCSS}.
 * @returns {void}
 *
 * @example
 * app.removeCSS("desktop-icons");
 */
app.removeCSS = function (identifier) {
    const style = document.getElementById("s_css");
    if (!style) {
        this.dev.log(`No style element found for removal of ${identifier}.`, "Core");
        return;
    }
    const safeId = this.escapeRegex(identifier);
    const regex = new RegExp(
        `\\s*\\/\\*\\s*${safeId}\\s*\\*\\/[\\s\\S]*?\\/\\*\\s*end-${safeId}\\s*\\*\\/\\s*`, "g"
    );
    const before = style.textContent;
    const after = before.replace(regex, "");
    if (before !== after) {
        style.textContent = after;
        this.dev.log(`CSS block for ${identifier} removed.`, "Core");
    } else {
        this.dev.log(`No CSS block for ${identifier} found to remove.`, "Core");
    }
};

/**
 * Injects a named CSS block and registers it under a program id so it can be
 * bulk-removed when the program exits.
 *
 * Internally calls {@link app.addCSS} and stores the identifier in the program
 * CSS registry. Safe to call multiple times — duplicate identifiers are ignored
 * by `addCSS` and the registry deduplicates via a `Set`.
 *
 * @memberof app
 * @async
 * @param {string}  programId   - The program id that owns this CSS block.
 * @param {string}  identifier  - Unique name for the CSS block.
 * @param {string}  css         - CSS string, or a file URL when `path=true`.
 * @param {boolean} [path=false] - When `true`, `css` is treated as a URL to fetch.
 * @returns {Promise<void>}
 *
 * @example
 * await app.addProgramCSS("calc", "calc-theme", ".calc-btn { color: red; }");
 * await app.addProgramCSS("calc", "calc-style", "components/calc/style.css", true);
 */
app.addProgramCSS = async function (programId, identifier, css, path = false) {
    if (!_programCSSRegistry.has(programId)) {
        _programCSSRegistry.set(programId, new Set());
    }
    _programCSSRegistry.get(programId).add(identifier);
    await this.addCSS(identifier, css, path);
};

/**
 * Removes all CSS blocks that were registered for a program via
 * {@link app.addProgramCSS}, then clears the program's registry entry.
 *
 * Called automatically by the window close path when a program's last window
 * is destroyed. Can also be called manually for early cleanup.
 *
 * @memberof app
 * @param {string} programId - The program id whose CSS should be removed.
 * @returns {void}
 *
 * @example
 * app.removeProgramCSS("calc");
 */
app.removeProgramCSS = function (programId) {
    const identifiers = _programCSSRegistry.get(programId);
    if (!identifiers || identifiers.size === 0) return;
    for (const id of identifiers) {
        this.removeCSS(id);
    }
    _programCSSRegistry.delete(programId);
    this.dev.log(`All CSS removed for program '${programId}'.`, "Core");
};

/**
 * Injects a named CSS block into `#s_css`, optionally fetching the CSS from
 * a file first.
 *
 * Blocks are wrapped in comment sentinels so they can be found and removed
 * later by {@link app.removeCSS}. Duplicate blocks (same identifier) are
 * silently ignored.
 *
 * When `path` is `true` the `css` argument is treated as a URL; the file is
 * fetched with `fetch()` and its text content is used as the CSS string.
 *
 * @memberof app
 * @async
 * @param {string}  identifier   - Unique name for this CSS block (used by
 *   {@link app.removeCSS} to locate the block later).
 * @param {string}  css          - CSS string, or a file URL when `path=true`.
 * @param {boolean} [path=false] - When `true`, `css` is treated as a URL to
 *   fetch rather than a raw CSS string.
 * @returns {Promise<void>}
 *
 * @example
 * // Inline CSS string
 * await app.addCSS("my-theme", ".button { color: red; }");
 *
 * // Load from file
 * await app.addCSS("desktop-icons", "sandstorm/components/desktop/icons.css", true);
 */
app.addCSS = async function (identifier, css, path = false) {
    let style = document.getElementById("s_css");
    if (!style) {
        style = document.createElement("style");
        style.id = "s_css";
        document.head.appendChild(style);
    }
    const safeId = this.escapeRegex(identifier);
    const existing = style.textContent;
    const existsRegex = new RegExp(`\\/\\*\\s*${safeId}\\s*\\*\\/`);
    if (existsRegex.test(existing)) {
        this.dev.log(`CSS block for ${identifier} already exists.`, "Core");
        return;
    }
    if (path) {
        try {
            const res = await fetch(css);
            if (!res.ok) throw new Error(`Failed to load CSS: ${css}`);
            css = await res.text();
        } catch (err) {
            console.error(`Error loading CSS "${css}":`, err);
            return;
        }
    }
    const block = `
                /* ${identifier} */
                ${css}
                /* end-${identifier} */
                `.trim() + "\n\n";
    style.textContent += block;
    this.dev.log(`CSS block for ${identifier} added.`, "Core");
};

/**
 * Sets or updates a CSS custom property inside `#cssVariables`.
 *
 * The `#cssVariables` `<style>` element holds a single `:root {}` block.
 * Each variable is wrapped in a comment for human readability and for later
 * removal via {@link app.removeCSSVariable}. The value is also cached in
 * `app.config.local.cssVariables`.
 *
 * The `--` prefix is added automatically if absent.
 *
 * @memberof app
 * @param {string} name  - CSS variable name (e.g. `"theme-color"` or
 *   `"--theme-color"`).
 * @param {string} value - Value string (e.g. `"#3498db"` or `"12px"`).
 * @returns {void}
 *
 * @example
 * app.setCSSVariable("theme-color", "#3498db");
 * // => adds/updates --theme-color: #3498db; in :root {}
 */
app.setCSSVariable = function (name, value) {
    if (typeof name !== "string" || typeof value !== "string") {
        app.dev.warn("setCSSVariable: Invalid parameters", { name, value }, "Core");
        return;
    }
    name = _normalizeName(name);
    let styleTag = document.getElementById("cssVariables");
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "cssVariables";
        styleTag.innerHTML = ":root {\n/* CSS Variables Start */\n/* CSS Variables End */\n}";
        document.head.appendChild(styleTag);
        app.dev.log("Created <style> tag for CSS variables.", "Core");
    }
    let cssContent = styleTag.innerHTML;
    const variablePattern = new RegExp(`(${name}:\\s*)([^;]+)(;)`, "g");
    if (cssContent.includes(name + ":")) {
        cssContent = cssContent.replace(variablePattern, `$1${value}$3`);
        app.dev.log(`Updated CSS variable: ${name}`, "Core");
    } else {
        const defaultComment = `/* ${name.replace("--", "")} */`;
        const newVariableBlock = `${defaultComment}\n    ${name}: ${value};\n`;
        cssContent = cssContent.replace("/* CSS Variables End */", `${newVariableBlock}\n/* CSS Variables End */`);
        app.dev.log(`Added CSS variable: ${name}`, "Core");
    }
    styleTag.innerHTML = cssContent;
    document.documentElement.style.setProperty(name, value);
    app.config.local.cssVariables = app.config.local.cssVariables || {};
    app.config.local.cssVariables[name] = value;
};

/**
 * Retrieves one or all CSS custom property values from the cache.
 *
 * When `name` is provided only that variable's cached value is returned.
 * When `name` is omitted a shallow copy of the entire cache is returned.
 *
 * @memberof app
 * @param {string} [name] - Variable name (with or without `--` prefix).
 *   Omit to retrieve all variables.
 * @returns {string|Object<string,string>|null}
 *   - `string` — value of the named variable, or `null` if not set.
 *   - `Object`  — all cached variables when `name` is omitted.
 *
 * @example
 * app.getCSSVariables("theme-color");  // "#3498db"
 * app.getCSSVariables();               // { "--theme-color": "#3498db", ... }
 */
app.getCSSVariables = function (name) {
    if (name) {
        name = _normalizeName(name);
        return app.config.local.cssVariables?.[name] || null;
    }
    return { ...app.config.local.cssVariables };
};

/**
 * Removes a CSS custom property from `#cssVariables` and the cache.
 *
 * Uses a regex to strip the variable's comment block and declaration from the
 * `#cssVariables` element's `innerHTML`. Also deletes the entry from
 * `app.config.local.cssVariables`.
 *
 * Does nothing if the variable is not in the cache.
 *
 * @memberof app
 * @param {string} name - Variable name (with or without `--` prefix).
 * @returns {void}
 *
 * @example
 * app.removeCSSVariable("--theme-color");
 * app.removeCSSVariable("theme-color");  // prefix added automatically
 */
app.removeCSSVariable = function (name) {
    name = _normalizeName(name);
    if (!app.config.local.cssVariables?.[name]) return;
    let styleTag = document.getElementById("cssVariables");
    if (styleTag) {
        const variableComment = `/* ${name} */`;
        const regex = new RegExp(`\\s*${variableComment}[\\s\\S]*?${name}: [^;]*;`, "g");
        styleTag.innerHTML = styleTag.innerHTML.replace(regex, "");
        app.dev.log(`Removed CSS variable: ${name}`, "Core");
    }
    delete app.config.local.cssVariables[name];
};
