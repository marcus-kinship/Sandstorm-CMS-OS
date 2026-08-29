/**
 * @file body.js
 * @description Declarative UI builder (HTML string renderer) for Sandstorm programs.
 *
 * Registers `app.ui.body(uiTree)` which accepts a plain-object UI definition
 * tree and returns a builder instance whose `render()` method produces an HTML
 * string ready to be injected into a program window.
 *
 * Built-in component types: `section`, `row`, `col`, `container`, `inblock`,
 * `block`, `textarea`, `text`, `title 1–6`, `aero-text`, `aero-button`,
 * `aero-button-m`, `menu`, `html`, and `script`.
 *
 * Custom components can be registered at runtime via
 * `app.ui.uiBody.addFunction(name, fn)`.
 *
 * Responsive styles (`mobile`, `tablet`, `desktop` properties) are collected
 * during rendering and injected into a `<style>` tag in `<head>` so no extra
 * DOM pass is needed. DOM event listeners and lazy-loaded scripts are applied
 * via a single `setTimeout` after the outer code inserts the HTML.
 *
 * @module components/body
 *
 * @example
 * const builder = app.ui.body({
 *   section: {
 *     row: { col: { text: { html: "Hello, world!" } } }
 *   }
 * });
 * programEl.innerHTML = builder.render();
 */
/**
 * UI Builder Module - HTML String Version with Script Support
 * @namespace app.ui.uiBody
 */
(function (app) {

    /**
     * Converts a style object to a CSS string.
     * @param {Object|string} styleObj
     * @returns {string}
     */
    function _styleToString(styleObj) {
        if (!styleObj) return '';
        if (typeof styleObj === 'string') return styleObj;
        return Object.entries(styleObj)
            .map(([key, value]) => {
                const cssProperty = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${cssProperty}:${value}`;
            })
            .join(';');
    }

    /**
     * Builds an HTML element string from options.
     * @param {Object} options
     * @param {Object} builder
     * @returns {string}
     */
    function _buildHTMLElement(options, builder) {
        const {
            tagName,
            data,
            baseClasses = [],
            excludeAttrs = ['class', 'className', 'style', 'id', 'subs', 'html', 'textContent', 'events', 'mobile', 'tablet', 'desktop', 'search'],
            selfClosing = false,
            content = '',
            contentBuilder = null
        } = options;

        let html = `<${tagName}`;

        const classes = [...baseClasses];
        if (data.class) classes.push(data.class);
        if (data.className) classes.push(data.className);

        // ── Events ───────────────────────────────────────────────────────────
        if (data.events && data.id && builder) {
            if (!builder.collectedEvents) builder.collectedEvents = [];
            builder.collectedEvents.push({ id: data.id, events: data.events });
        }

        // ── Search index ─────────────────────────────────────────────────────
        if (data.search && builder) {
            if (!builder.searchIndex) builder.searchIndex = [];
            builder.searchIndex.push({ id: data.id || null, ...data.search });
        }

        // ── Responsive: unique class + collected CSS ──────────────────────────
        if ((data.mobile || data.tablet || data.desktop) && builder) {
            const uid = 'r' + Math.random().toString(36).slice(2, 9);
            classes.push(uid);
            let css = '';
            if (data.mobile)  css += `@media(max-width:768px){.${uid}{${_styleToString(data.mobile)}}}`;
            if (data.tablet)  css += `@media(min-width:769px) and (max-width:1024px){.${uid}{${_styleToString(data.tablet)}}}`;
            if (data.desktop) css += `@media(min-width:1025px){.${uid}{${_styleToString(data.desktop)}}}`;
            if (!builder.collectedStyles) builder.collectedStyles = [];
            builder.collectedStyles.push(css);
        }

        if (classes.length > 0) html += ` class="${classes.join(' ')}"`;

        if (data.id) html += ` id="${data.id}"`;

        const attrs = [];
        for (const [key, val] of Object.entries(data)) {
            if (excludeAttrs.includes(key)) continue;
            attrs.push(`${key}="${val}"`);
        }
        if (attrs.length > 0) html += ' ' + attrs.join(' ');

        if (data.style) html += ` style="${_styleToString(data.style)}"`;

        html += selfClosing ? '/>' : '>';

        if (!selfClosing) {
            if (data.textContent) html += data.textContent;
            if (data.html) html += data.html;
            if (content) html += content;
            if (contentBuilder && typeof contentBuilder === 'function') html += contentBuilder(data, builder);
            if (data.subs) {
                for (const sub of data.subs) html += builder._renderNode(sub);
            }
            html += `</${tagName}>`;
        }

        return html;
    }

    /**
     * Builds button content HTML with optional pulse effect.
     * @param {Object} data
     * @param {Object} builder
     * @returns {string}
     */
    function _buildButtonContent(data, builder) {
        let content = '';
        if (data.value) content += data.value;

        if (data.pulse) {
            const pulseConfig = typeof data.pulse === 'object' ?
                { ...data.pulse } :
                { "left": "24px", "top": "39px" };

            if (pulseConfig.center) {
                pulseConfig["left"] = "50%";
                pulseConfig["transform"] = "translateX(-50%)";
                delete pulseConfig.center;
            }

            const pulseStyle = _styleToString({ "position": "absolute", ...pulseConfig });
            content += `<div class="after pulse" style="${pulseStyle}"></div>`;
        }

        return content;
    }

    /**
     * Executes a named export from an imported ES module.
     * @param {object} module
     * @param {string} functionName
     */
    function _executeModuleFunction(module, functionName) {
        try {
            const func = module[functionName];
            if (typeof func === 'function') {
                app.dev.log(`Executing exported function: ${functionName}`);
                func(app);
            } else {
                app.dev.error(`Exported function not found: ${functionName}`);
            }
        } catch (error) {
            app.dev.error(`Error executing function ${functionName}:`, error);
        }
    }

    // Initialize or extend the app namespace
    app.ui = Object.assign(app.ui || {}, {
        /**
         * UI Body component - core rendering functionality
         * @namespace app.ui.uiBody
         */
        uiBody: {
            /**
             * Registry of all available component rendering functions
             * @type {Object.<string, Function>}
             */
            functionsMap: {},

            /**
             * Flag indicating if default functions have been initialized
             * @type {boolean}
             */
            initialized: false,

            /**
             * List of default component types to register
             * @type {Array<string>}
             */
            defaultComponents: [
                "section", "row", "col", "container",
                "inblock", "block", "textarea"
            ],

            /**
             * Loads and executes a JavaScript module using dynamic import
             * @param {string} path - Path to the JavaScript module (e.g. "calc/calc_data.js")
             * @param {string} callFunction - Function name exported from module (e.g. "data")
             * @returns {Promise} - Resolves when module is loaded and function is executed
             */
            async loadScript(path, callFunction) {
                try {
                    // Ensure the load structure exists
                    if (!app.config.local.load) app.config.local.load = {};
                    if (!app.config.local.load.ProgramData) app.config.local.load.ProgramData = {};

                    // Check if the module is already loaded
                    if (app.config.local.load.ProgramData[path]) {
                        app.dev.log(`ProgramData module "${path}" is already loaded.`);
                        return _executeModuleFunction(app.config.local.load.ProgramData[path], callFunction);
                    }

                    // Construct the full module path
                    const rootPath = app.config.local.ProgramRoot;
                    const fullPath = rootPath + path;

                    app.dev.log(`Loading ProgramData module: "${path}"`);

                    // Dynamically import the module
                    const module = await import(fullPath);

                    // Cache the loaded module
                    app.config.local.load.ProgramData[path] = module;

                    // Execute the optional callback function
                    return _executeModuleFunction(module, callFunction);

                } catch (error) {
                    app.dev.error(`Failed to load ProgramData module "${path}":`, error);
                    throw error;
                }
            },


            /**
             * Initializes the default rendering functions for UI components
             * @param {boolean} [force=false] - If true, re-initializes the function registry
             */
            init(force = false) {
                if (this.initialized && !force) return;
                this.initialized = true;

                // Register each default component type
                for (const type of this.defaultComponents) {
                    this.addFunction(type, function (data, ctx, builder) {
                        let tagName, baseClasses;

                        // Determine element type and base classes
                        switch (type) {
                            case "section":
                                tagName = "section";
                                baseClasses = [];
                                // Auto-generate ID for sections if not provided
                                if (!data.id) {
                                    data.id = `section-${Math.random().toString(36).slice(2, 10)}`;
                                }
                                break;
                            case "textarea":
                                tagName = "textarea";
                                baseClasses = ["textarea"];
                                break;
                            default:
                                tagName = "div";
                                baseClasses = [type];
                        }

                        // Use HTML generation helper
                        return _buildHTMLElement({
                            tagName,
                            data,
                            baseClasses
                        }, builder);
                    });
                }

                // Add title components (h1-h6) with loop
                for (let i = 1; i <= 6; i++) {
                    this.addFunction(`title ${i}`, function (data, ctx, builder) {

                        // Add headings CSS
                        app.addCSS("headings default", `

                                    /* H1 - Largest heading */
                                    h1.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 14px); /* 26px */
                                        font-weight: bold;
                                        margin: 0.67em 0;
                                        line-height: 1.2;
                                    }

                                    /* H2 - Large heading */
                                    h2.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 10px); /* 22px */
                                        font-weight: bold;
                                        margin: 0.83em 0;
                                        line-height: 1.3;
                                    }

                                    /* H3 - Medium heading */
                                    h3.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 6px); /* 18px */
                                        font-weight: bold;
                                        margin: 1em 0;
                                        line-height: 1.4;
                                    }

                                    /* H4 - Small heading */
                                    h4.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 4px); /* 16px */
                                        font-weight: bold;
                                        margin: 1.33em 0;
                                        line-height: 1.4;
                                    }

                                    /* H5 - Smaller heading */
                                    h5.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 2px); /* 14px */
                                        font-weight: bold;
                                        margin: 1.67em 0;
                                        line-height: 1.5;
                                    }

                                    /* H6 - Smallest heading */
                                    h6.def {
                                        color: var(--theme-fontcolor);
                                        font-size: calc(var(--theme-font-size) + 1px); /* 13px */
                                        font-weight: bold;
                                        margin: 2.33em 0;
                                        line-height: 1.5;
                                    }
                                    `);

                        return _buildHTMLElement({
                            tagName: `h${i}`,
                            data: { ...data },
                            baseClasses: ['def'],
                            excludeAttrs: ['class', 'className', 'style', 'id', 'html'],
                            selfClosing: false,
                            content: data.html || data.textContent || ''
                        }, builder);
                    });
                }

                // Add text component (p-tag)
                this.addFunction("text", function (data, ctx, builder) {

                    // Add text CSS  
                    app.addCSS("text default", `
                        /* P - Body text */
                        p.def {
                            color: var(--theme-fontcolor);
                            font-size: var(--theme-font-size); /* 12px */
                            font-weight: normal;
                            margin: 1em 0;
                            line-height: 1.6;
                        }
                        `);

                    return _buildHTMLElement({
                        tagName: 'p',
                        data: { ...data },
                        baseClasses: ['def'],
                        excludeAttrs: ['class', 'className', 'style', 'id', 'html'],
                        selfClosing: false,
                        content: data.html || data.textContent || ''
                    }, builder);
                });

                // Add aero-text component for text inputs
                this.addFunction("aero-text", function (data, ctx, builder) {
                    return _buildHTMLElement({
                        tagName: 'input',
                        data: { ...data, type: 'text' }, // Ensure type="text"
                        baseClasses: ['aero-text'],
                        excludeAttrs: ['class', 'className', 'style', 'id'], // Only exclude basic attrs for input
                        selfClosing: true
                    }, builder);
                });

                // Add aero-button-m component (medium size button)
                this.addFunction("aero-button-m", function (data, ctx, builder) {
                    return _buildHTMLElement({
                        tagName: 'div',
                        data,
                        baseClasses: ['aero-button', 'm'],
                        excludeAttrs: ['class', 'className', 'pulse', 'value', 'style', 'id'],
                        contentBuilder: (data, builder) => _buildButtonContent(data, builder)
                    }, builder);
                });

                // Add aero-button component (original size)
                this.addFunction("aero-button", function (data, ctx, builder) {
                    return _buildHTMLElement({
                        tagName: 'div',
                        data,
                        baseClasses: ['aero-button'],
                        excludeAttrs: ['class', 'pulse', 'value', 'style'],
                        contentBuilder: (data, builder) => _buildButtonContent(data, builder)
                    }, builder);
                });

                this.addFunction("menu", function (data, ctx, builder) {
                    if (data && typeof data.menu !== "undefined") {
                        app.ui.windows.functions.setMainMenu(data);
                    } else {
                        app.dev.warn("The 'menu' function was called without valid 'menu' data:", data);
                    }
                });

                // Add html component - injects a raw HTML string as-is
                this.addFunction("html", function (data) {
                    if (typeof data === "string") return data;
                    if (data && typeof data.html === "string") return data.html;
                    return "";
                });

                // Add script component - loads and executes JavaScript files
                this.addFunction("script", function (data, ctx, builder) {
                    // Collect script for later execution

                    if (data.path && data.call) {
                      
                        if (!builder.collectedScripts) {
                            builder.collectedScripts = [];
                        }

                        builder.collectedScripts.push({
                            path: data.path,
                            call: data.call
                        });
                    }

                    // Script component doesn't render HTML
                    return '';
                });
            },

            /**
             * Registers a new component rendering function
             * @param {string} name - Component type name
             * @param {Function} fn - Rendering function (data, ctx, builder) => string
             */
            addFunction(name, fn) {
                this.functionsMap[name] = fn;
            },

            /**
             * Removes a component rendering function
             * @param {string} name - Component type name to remove
             */
            removeFunction(name) {
                delete this.functionsMap[name];
            },

            /**
             * Creates a new UI builder instance
             * @param {Object} uiTree - UI definition tree
             * @returns {Object} Builder instance with render capabilities
             */
            createInstance(uiTree) {
                const builder = {
                    functionsMap: { ...this.functionsMap },
                    treeData: uiTree,
                    collectedScripts: [],
                    collectedEvents: [],
                    collectedStyles: [],
                    searchIndex: [],

                    /**
                     * Renders a UI component from its definition
                     * @param {Object} [node=this.treeData] - Component definition
                     * @returns {string} Rendered HTML string
                     */
                    render: function (node = this.treeData) {
                        const html = this._renderNode(node);

                        // Inject responsive CSS immediately — no DOM needed
                        if (this.collectedStyles && this.collectedStyles.length > 0) {
                            const style = document.createElement('style');
                            style.textContent = this.collectedStyles.join('');
                            document.head.appendChild(style);
                            this.collectedStyles = [];
                        }

                        // Bind events + scripts after DOM is updated
                        if (this.collectedScripts.length > 0 || (this.collectedEvents && this.collectedEvents.length > 0)) {
                            setTimeout(() => { this.executeScripts(); }, 50);
                        }

                        return html;
                    },

                    /**
                     * Executes all collected scripts
                     */
                    executeScripts: function () {
                        this.collectedScripts.forEach(scriptInfo => {
                            app.ui.uiBody.loadScript(scriptInfo.path, scriptInfo.call)
                                .catch(error => {
                                    console.error('Failed to execute script:', error);
                                });
                        });
                        this.collectedScripts = [];

                        // Bind collected events
                        if (this.collectedEvents) {
                            this.collectedEvents.forEach(({ id, events }) => {
                                const el = $('#' + id)[0];
                                if (!el) return;
                                Object.entries(events).forEach(([type, handler]) => {
                                    el.addEventListener(type, handler);
                                });
                            });
                            this.collectedEvents = [];
                        }

                        // Register search entries
                        if (this.searchIndex && this.searchIndex.length > 0) {
                            if (app.search && typeof app.search.register === 'function') {
                                this.searchIndex.forEach(entry => app.search.register(entry));
                            }
                            this.searchIndex = [];
                        }
                    },

                    /**
                     * Internal method to render a single node
                     * @param {Object} node - Component definition
                     * @returns {string} Rendered HTML string
                     */
                    _renderNode: function (node) {
                        if (!node) return '';
                        if (Array.isArray(node)) return node.map(n => this._renderNode(n)).join('');
                        if (typeof node === 'string') return node;
                        if (typeof node !== 'object') return '';

                        let html = '';

                        // Process all entries in the node
                        for (const [key, value] of Object.entries(node)) {
                            const fn = this.functionsMap[key];
                            if (!fn) {
                                if (value && typeof value === 'object' && /^[a-z][a-z0-9-]*$/i.test(key)) {
                                    html += _buildHTMLElement({ tagName: key, data: value }, this);
                                } else {
                                    console.warn(`No render function for: ${key}`);
                                }
                                continue;
                            }

                            // Call the function and get result
                            const result = fn(value, {}, this);

                            // Only add to HTML if result is a non-empty string
                            if (typeof result === 'string' && result.length > 0) {
                                html += result;
                            }
                        }

                        return html;
                    }
                };
                return builder;
            }
        },

        /**
         * Main entry point for UI rendering.
         * @param {Object} uiTree          - UI definition tree
         * @param {string|Object} [context] - Optional. String programid or { programid } object.
         *   When given, every node that has a `search` property is registered to
         *   app.searchengine under that programid after render().
         *   Omitting this arg still renders normally; search items go to the
         *   global app.searchengine without a programid filter.
         * @returns {Object} Builder instance
         */
        body: function (uiTree, context = null) {
            this.uiBody.init();
            const builder = this.uiBody.createInstance(uiTree);

            const programid = typeof context === 'string'
                ? context
                : (context?.programid ?? null);
            const panelId = (typeof context === 'object' && context !== null)
                ? (context.panelId ?? null)
                : null;

            const _origRender = builder.render.bind(builder);
            builder.render = function (node) {
                const html = _origRender(node);
                // searchIndex is populated by _renderNode for nodes with `search` prop.
                // Snapshot before executeScripts() clears it (setTimeout 50 ms).
                if (builder.searchIndex?.length && app.searchengine) {
                    const items = panelId
                        ? builder.searchIndex.map(item => ({ ...item, _panelId: panelId }))
                        : [...builder.searchIndex];
                    app.searchengine._register(programid, items);
                }
                return html;
            };

            return builder;
        }
    });

    // ── app.searchengine — global search registry ─────────────────────────────
    // Any program that calls app.ui.body(tree, programid).render() registers
    // its search items here automatically.
    //
    // Usage:
    //   app.searchengine.search({ word: 'version' })              // all programs
    //   app.searchengine.search({ word: 'version', programid: 'controlpanel' })
    app.searchengine = (function () {
        const _store = []; // { programid, id, label, description, keywords, ... }
        const _r = v => typeof v === 'function' ? v() : (v || '');

        return {
            // Called by body() — upserts entries by programid+id (accumulates across panels)
            _register(programid, items) {
                items.forEach(item => {
                    if (item.id) {
                        for (let i = _store.length - 1; i >= 0; i--) {
                            if (_store[i]._programid === programid && _store[i].id === item.id) {
                                _store.splice(i, 1);
                                break;
                            }
                        }
                    }
                    _store.push({ _programid: programid, ...item });
                });
            },

            /**
             * Search registered items.
             * @param {{ word: string, programid?: string }} opts
             * @returns {Array} matching entries
             */
            search({ word = '', programid = null } = {}) {
                const q = word.toLowerCase().trim();
                if (!q) return [];
                return _store.filter(entry => {
                    if (programid && entry._programid !== programid) return false;
                    const label = _r(entry.label);
                    const desc  = _r(entry.description);
                    const kw    = entry.keywords || [];
                    return (
                        label.toLowerCase().includes(q) ||
                        desc.toLowerCase().includes(q)  ||
                        kw.some(k => k.toLowerCase().includes(q))
                    );
                });
            }
        };
    })();

})(window.app = window.app || {});