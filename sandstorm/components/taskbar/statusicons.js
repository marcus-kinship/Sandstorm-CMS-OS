/**
 * @file taskbar/statusicons.js
 * @description Status-tray icon registry and rendering (the right-side
 * icons — network, volume, clock companions, etc. — as opposed to
 * icons.js's left-side pinned/running task icons).
 *
 * Registers `app.desktop.taskbar.setStatusIcon`/`updateStatusIconText`/
 * `createStatusIcons` — same IIFE-extends convention as the other
 * taskbar/*.js sibling modules. Loaded via `taskbar/index.js`'s
 * side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/statusicons
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Registers a status icon (clock, network indicator, etc.) in the right tray.
         * Duplicate IDs are silently ignored. Icons are sorted by `order` after insertion.
         * @param {Object}   iconOptions
         * @param {string}   iconOptions.id      - Unique element id.
         * @param {string}   [iconOptions.svg]   - SVG href.
         * @param {string}   [iconOptions.img]   - Image URL.
         * @param {string}   [iconOptions.text]  - Text content (max 10 chars).
         * @param {string}   [iconOptions.class] - CSS class for the icon element.
         * @param {number}   [iconOptions.order] - Sort order in the tray.
         */
        setStatusIcon: function (iconOptions) {
            if (this.config && Array.isArray(this.config.statusIcons)) {
                const exists = this.config.statusIcons.some(icon => icon.id === iconOptions.id);
                if (!exists) {
                    if (typeof iconOptions.text === "string" && iconOptions.text.length > 10) {
                        iconOptions.text = iconOptions.text.slice(0, 10);
                    }

                    if (typeof iconOptions.order !== "number") {
                        iconOptions.order = this.config.statusIcons.length;
                    }

                    this.config.statusIcons.push(iconOptions);
                    this.config.statusIcons.sort((a, b) => a.order - b.order);
                }
            }
        },

        /**
         * Updates the visible text of an existing status icon without a full re-render.
         * Text is truncated to 10 characters.
         * @param {string} id   - Status icon id.
         * @param {string} text - New text content.
         */
        updateStatusIconText: function (id, text) {
            if (typeof text === "string" && text.length > 10) text = text.slice(0, 10);

            const icon = this.config?.statusIcons?.find(i => i.id === id);
            if (icon) icon.text = text;

            const el = document.querySelector(`.statusicons #${id}`);
            if (el) el.textContent = text;
            app.dev.log(`Updated status icon ${id} text to: ${text}`, "Taskbar");
        },

        /**
         * Builds the status-icon tray element from `config.statusIcons`.
         * Returns the container div (caller must append it to the DOM).
         * @param {string} [className="statusicons"] - CSS class for the container.
         * @param {number} [limit]                   - Maximum number of icons to include.
         * @returns {HTMLElement|null}
         */
        createStatusIcons: function (className = "statusicons", limit) {
            const statusIcons = this.config.statusIcons;

            if (!Array.isArray(statusIcons)) {
                dev.error("statusIcons should be an array");
                return null;
            }

            const statusIconsDiv = document.createElement("div");
            statusIconsDiv.classList.add(className);

            const limitedStatusIcons = limit ? statusIcons.slice(0, limit) : statusIcons;

            limitedStatusIcons.forEach((icon) => {
                const statusIconDiv = document.createElement("div");
                statusIconDiv.className = icon.class || "";

                if (icon.id) {
                    statusIconDiv.id = icon.id;
                }

                if (icon.text) {
                    statusIconDiv.textContent = icon.text;
                }

                if (icon.svg) {
                    statusIconDiv.innerHTML = `<svg title="${icon.title}"><use href="${icon.svg}"></use></svg>`;
                } else if (icon.img) {
                    statusIconDiv.innerHTML = `<img src="${icon.img}" title="${icon.name}" />`;
                }

                if (icon.style !== undefined) {
                    statusIconDiv.style.cssText = icon.style;
                }

                if (typeof icon.click === "function") {
                    statusIconDiv.onclick = (e) => icon.click(e);
                }

                if (typeof icon.contextmenu === "function") {
                    statusIconDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); icon.contextmenu(e); });
                }

                statusIconsDiv.appendChild(statusIconDiv);
            });

            return statusIconsDiv;
        },

    });

})((window.app = window.app || {}));
