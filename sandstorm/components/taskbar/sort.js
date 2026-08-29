/**
 * @file taskbar/sort.js
 * @description Drag-and-drop sort support for taskbar task icons.
 *
 * Registers `app.desktop.taskbar.sort` — enables jQuery UI Sortable on the
 * `.tasks` container so the user can reorder pinned application icons.
 *
 * Responsibilities:
 * - `getTaskIcons()` — return the current ordered icon list from config.
 * - `updateTaskIcons(data)` — replace the entire list or upsert a single entry.
 * - `sortableTaskIcons()` — initialise (or reinitialise) jQuery UI Sortable
 *   with axis-aware configuration and a `stop` handler that syncs the new DOM
 *   order back to `config.taskIcons`.
 *
 * @module components/taskbar/sort
 */
(function (app) {

    app.desktop.taskbar.sort = {
        /**
         * Returns the current ordered task icon list from config.
         *
         * @returns {Array} Ordered list of task icon descriptors.
         */
        getTaskIcons: function () {
            return app.desktop.taskbar.config.taskIcons || [];
        },

        /**
         * Replaces or upserts task icon data in `config.taskIcons`.
         * When `data` is an array, it replaces the entire list.
         * When `data` is an object with an `id`, it updates the matching entry or appends a new one.
         *
         * @param {Array|{id: string, [key: string]: any}} data - Full replacement array or single icon update.
         */
        updateTaskIcons: function (data) {
            let icons = this.getTaskIcons();

            if (Array.isArray(data)) {
                app.desktop.taskbar.config.taskIcons = data;
            } else if (data && data.id) {
                let index = icons.findIndex(icon => icon.id === data.id);
                if (index !== -1) {
                    icons[index] = { ...icons[index], ...data };
                } else {
                    icons.push(data);
                }
                app.desktop.taskbar.config.taskIcons = icons;
            }
        },

        /**
         * Activates jQuery UI Sortable on the `.tasks` container so the user can drag task icons.
         * Re-initialises by destroying any existing sortable before rebinding.
         * Uses `axis: "x"` for horizontal taskbars and `axis: "y"` for vertical ones.
         * On drop, syncs the new DOM order back to `config.taskIcons` via `updateTaskIcons`.
         */
        sortableTaskIcons: function () {
            $(function () {
                var $tasks = $(".taskbar-s .tasks");

                if ($tasks.hasClass("ui-sortable")) {
                    $tasks.sortable("destroy");
                }

                var mouseMoved = false;
                var taskbar = $(".taskbar-s");
                var axis = "x";

                if (taskbar.hasClass("taskbar-left") || taskbar.hasClass("taskbar-right")) {
                    axis = "y";
                }

                var flipRects = new Map();

                function recordRects() {
                    flipRects.clear();
                    $tasks.children().each(function () {
                        if (this.classList.contains('ui-sortable-placeholder')) return;
                        flipRects.set(this, { left: this.offsetLeft, top: this.offsetTop });
                    });
                }

                function playFlip() {
                    $tasks.children().each(function () {
                        if (this.classList.contains('ui-sortable-placeholder')) return;
                        if (this.classList.contains('ui-sortable-helper')) return;

                        const before = flipRects.get(this);
                        if (!before) return;

                        const dx = before.left - this.offsetLeft;
                        const dy = before.top - this.offsetTop;
                        if (!dx && !dy) return;

                        this.style.transition = 'none';
                        this.style.transform = `translate(${dx}px, ${dy}px)`;
                        void this.offsetWidth;
                        this.style.transition = 'transform 0.15s ease';
                        this.style.transform = '';
                    });
                    recordRects();
                }

                $tasks.sortable({
                    placeholder: "icontasks-highlight",
                    axis: axis,
                    start: function (event, ui) {
                        mouseMoved = false;

                        $(document).on("mousemove", function () {
                            mouseMoved = true;
                        });

                        recordRects();
                    },

                    change: function (event, ui) {
                        playFlip();
                    },

                    stop: function (event, ui) {
                        $(document).off("mousemove");
                        flipRects.clear();

                        let allIcons = app.desktop.taskbar.sort.getTaskIcons();

                        let updatedIcons = [];

                        $tasks.children().each(function () {
                            let id = $(this).attr("id");
                            let icon = allIcons.find(t => t.id === id);
                            if (icon) updatedIcons.push(icon);
                        });

                        allIcons.forEach(icon => {
                            if (!updatedIcons.find(i => i.id === icon.id)) {
                                updatedIcons.push(icon);
                            }
                        });

                        app.desktop.taskbar.sort.updateTaskIcons(updatedIcons);
                    }
                });
            });
        }
    };

})((window.app = window.app || {}));
