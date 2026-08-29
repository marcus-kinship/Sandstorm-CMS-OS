/**
 * @file input.js
 * @description Optional widget: themed text-input component for the Sandstorm UI system.
 *
 * NOT part of the boot chain — this is a widget, loaded on demand by
 * whichever program actually needs it (e.g. via
 * `app.includeModule(app.config.local.ComponentsRoot + "widgets/input.js")`),
 * not a core UI component that's always present. Don't assume
 * `app.ui.input` exists without having loaded this file first.
 *
 * Registers `app.ui.input(opts)` — an async function that builds a styled
 * `.ui-input` wrapper element. Supports text, password (with show/hide toggle),
 * email, number, search, tel, and URL types. CSS is injected once via
 * `app.addCSS`. The API is deliberately unchanged from its previous location
 * (`components/ui/input.js`) so existing callers don't need to change.
 *
 * Input icon support
 * -------------------
 * `opts.icon` is NOT the full Font Awesome library — Sandstorm bundles a
 * hand-picked subset (one font file, `fa-solid-900.woff2`) instead of the
 * ~390 KB full package. Available icons are defined in `res/icons/sandstorm.css`
 * and enumerated in `app.icons.available` (see `app.icons.has(name)` to check
 * one at runtime, e.g. for input validation during development).
 *
 * To add a new icon:
 * 1. Find its unicode codepoint (Font Awesome's icon gallery, or the full
 *    `all.min.css` if you have a copy).
 * 2. Add a `.fa-<name>:before { content: "\fXXX"; }` rule to `sandstorm.css`.
 * 3. Add the name to `app.icons.available` (in `load.js`).
 *
 * @module components/widgets/input
 *
 * @example
 * await app.includeModule(app.config.local.ComponentsRoot + "widgets/input.js");
 * const html = await app.ui.input({
 *   id: "username",
 *   type: "text",
 *   placeholder: "Enter username",
 *   icon: "fa-solid fa-user"
 * });
 * formEl.innerHTML = html;
 */
(function (app) {
    // Ensure the app namespace exists and define a start menu module
    app.ui = Object.assign(app.ui || {}, {
        /**
         * Creates a stylized input element for the UI with optional icon support and password toggle.
         * Automatically applies the UI input CSS via app.addCSS and uses theme CSS variables.
         *
         * @param {Object} opts - Options to customize the input.
         * @param {string} [opts.id=""] - Input ID.
         * @param {string} [opts.name=""] - Input name.
         * @param {string} [opts.type="text"] - Input type ("text", "password", "email", "number", "search", "tel", "url").
         * @param {string} [opts.value=""] - Input value.
         * @param {string} [opts.placeholder=""] - Placeholder text.
         * @param {string} [opts.className=""] - Additional CSS classes.
         * @param {string} [opts.autocomplete=""] - Autocomplete attribute.
         * @param {boolean} [opts.required=false] - Required attribute.
         * @param {boolean} [opts.readonly=false] - Readonly attribute.
         * @param {boolean} [opts.disabled=false] - Disabled attribute.
         * @param {string} [opts.ariaLabel=""] - Aria-label for accessibility.
         * @param {Object} [opts.attrs={}] - Additional HTML attributes as key/value pairs.
         * @param {string} [opts.icon=""] - Font Awesome icon class.
         * @returns {Promise<string>} - Returns a Promise resolving to HTML string for the input.
         */
        input: async function (opts = {}) {

            // ---------- Add CSS automatically ----------
            app.addCSS(
                "ui input",
                `
.window .ui-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: var(--theme-borderradius);
    background-color: var(--theme-backgruondcolorc);
    color: var(--theme-fontcolor);
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
    transition: box-shadow 1s;
    position: relative;
    width: 100%;
    box-sizing: border-box;
}

.window .ui-input input {
    flex: 1;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--theme-fontcolor);
    font-size: var(--theme-font-size);
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.3s;
}

.window .ui-input:hover {
    box-shadow: 1px 1px 1px #ffffff49, -1px -1px 1px #ffffff49;
}

.window .ui-input .password-toggle {
    position: absolute;
    right: 10px;
    background: transparent;
    border: none;
    color: var(--theme-fontcolor);
    cursor: default;
    opacity: 0.7;
    transition: opacity 0.3s;
    z-index: 5;
}

.window .ui-input .password-toggle:hover {
    opacity: 1;
}

.window .ui-input i {
    width: 14px;
    color: var(--theme-fontcolor);
    opacity: 0.9;
    font-size: 13px;
    margin-top: 2px;
    margin-left: 1px;
}

/* Allow text selection in input fields */
.window .ui-input input {
    user-select: text;
    -webkit-user-select: text;
}
`
            );

            const allowed = ["text", "password", "email", "number", "search", "tel", "url"];

            const o = Object.assign({
                id: "",
                name: "",
                type: "text",
                value: "",
                placeholder: "",
                className: "",
                autocomplete: "",
                required: false,
                readonly: false,
                disabled: false,
                ariaLabel: "",
                attrs: {},
                icon: ""
            }, opts);

            if (!allowed.includes(o.type)) {
                app.dev.warn(`app.ui.input: '${o.type}' is not allowed. Falling back to 'text'.`);
                o.type = "text";
            }

            // Load Font Awesome if needed
            if (o.icon) {
                await app.load.loadFile(app.config.local.ResourcesRoot + "icons/sandstorm.css");
            }

            // ---------- Build HTML ----------
            let html = `<div class="ui-input ${o.className}" id="${o.id ? o.id + 'Container' : ''}">`;

            // Icon
            if (o.icon) html += `<i class="${o.icon}"></i>`;

            // Locked readonly
            if (o.locked) {
                html += `<div class="readonly-user">${o.username}</div>
<input type="hidden" name="${o.name || 'user'}" value="${o.username}">`;
            } else {
                // Input element
                html += `<input
    id="${o.id || ''}"
    name="${o.name || ''}"
    value="${o.value || ''}"
    type="${o.type}"
    placeholder="${o.placeholder || ''}"
    ${o.required ? 'required' : ''}
    ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : ''}
    ${o.readonly ? 'readonly' : ''}
    ${o.disabled ? 'disabled' : ''}
    aria-label="${o.ariaLabel || ''}"
    ${Object.entries(o.attrs || {}).map(([k, v]) => v === true ? `${k}` : `${k}="${v}"`).join(' ')}
>`;

                // Password toggle
                if (o.type === "password") {
                    const toggleId = o.id ? `${o.id}Toggle` : "passwordToggle";
                    html += `<button type="button" class="password-toggle" id="${toggleId}" aria-label="${_('Show password')}">
    <i class="fa-solid fa-eye-slash"></i>
</button>`;
                }
            }

            html += `</div>`; // close input div

            // ---------- Attach password-toggle event ----------
            if (o.type === "password") {
                // Delay attaching event until element is in DOM
                setTimeout(() => {
                    const toggle = document.getElementById(o.id ? `${o.id}Toggle` : "passwordToggle");
                    const input = document.getElementById(o.id || 'pass');
                    if (toggle && input) {
                        toggle.addEventListener("click", () => {
                            if (input.type === "password") {
                                input.type = "text";
                                toggle.querySelector("i").classList.replace("fa-eye-slash", "fa-eye");
                            } else {
                                input.type = "password";
                                toggle.querySelector("i").classList.replace("fa-eye", "fa-eye-slash");
                            }
                        });
                    }
                }, 0);
            }

            return html;
        }
    });
})(window.app = window.app || {});
