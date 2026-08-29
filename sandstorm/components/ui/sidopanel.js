/**
 * @file sidopanel.js
 * @description Collapsible navigation side-panel component for Sandstorm programs.
 *
 * Registers `app.ui.sidopanel(sections, options)` which builds an HTML string
 * for a collapsible navigation panel and returns `{ html, bind }`. Programs
 * inject `html` into their container and then call `bind(containerEl, onSelect)`
 * to attach click handlers.
 *
 * @module components/ui/sidopanel
 *
 * @example
 * const sp = app.ui.sidopanel([
 *   { items: [{ id: "inbox", label: "Inbox", icon: "#ic-mail", count: 3 }] },
 *   { header: { label: "Labels" }, items: [{ id: "work", label: "Work" }] }
 * ]);
 * panelEl.innerHTML = sp.html;
 * sp.bind(panelEl, (id, el) => console.log("Selected:", id));
 */

/**
 * Sections format:
 * ```
 * [
 *   { items: [{ id, label, svgPath, icon, count, active, arrowMain }] },
 *   { header: { label }, items: [...] }
 * ]
 * ```
 */
(function (app) {

    /**
     * Builds a collapsible navigation panel.
     *
     * @memberof app.ui
     * @param {Array<Object>} sections - Panel sections. Each section may have:
     *   - `items` {Array} — list of nav items.
     *   - `header` {Object} — optional section header with a `label` property.
     * @param {Object} [options={}] - Options.
     * @param {Function} [options.onSelect] - Default click callback `(id, el)`.
     * @returns {{ html: string, bind: Function }} Rendered HTML and a `bind` function.
     */
    app.ui.sidopanel = function (sections, options) {
        var opts      = options  || {};
        var onSelect  = opts.onSelect || null;

        // ── HTML builders ────────────────────────────────────────────────────

        function buildItems(items) {
            return (items || []).map(function (item) {
                var arrow = item.arrowMain
                    ? '<svg class="svg-main"><use href="#ic-arrow-down"></use></svg>'
                    : '<svg class="svg-sub"><use href="#ic-arrow-right"></use></svg>';

                var icon = '';
                if (item.icon) {
                    icon = '<svg class="nav-item-icon"><use href="' + item.icon + '"></use></svg>';
                } else if (item.svgPath) {
                    icon = '<svg class="nav-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
                         + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + item.svgPath + '"/>'
                         + '</svg>';
                }

                var count = item.count != null
                    ? '<span class="nav-item-count">' + item.count + '</span>'
                    : '';

                var label = typeof _ === 'function' ? _(item.label || '') : (item.label || '');

                return '<div class="nav-item' + (item.active ? ' active' : '') + '" data-nav="' + (item.id || '') + '">'
                    + arrow + icon
                    + '<span class="nav-item-label">' + label + '</span>'
                    + count
                    + '</div>';
            }).join('');
        }

        var html = (sections || []).map(function (section) {
            var items = buildItems(section.items);
            if (section.header) {
                var headerLabel = typeof _ === 'function'
                    ? _(section.header.label || '')
                    : (section.header.label || '');
                return '<div class="nav-section">'
                     + '<div class="nav-section-header">'
                     + '<svg class="svg-main"><use href="#ic-arrow-down"></use></svg>'
                     + '<span>' + headerLabel + '</span>'
                     + '</div>'
                     + items
                     + '</div>';
            }
            return items;
        }).join('');

        // ── Event binding ────────────────────────────────────────────────────

        function bind(containerEl, overrideSelect) {
            var cb = overrideSelect || onSelect;
            if (!containerEl) return;
            containerEl.querySelectorAll('.nav-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    containerEl.querySelectorAll('.nav-item')
                        .forEach(function (i) { i.classList.remove('active'); });
                    el.classList.add('active');
                    if (typeof cb === 'function') cb(el.getAttribute('data-nav'), el);
                });
            });
        }

        return { html: html, bind: bind };
    };

})(window.app = window.app || {});
