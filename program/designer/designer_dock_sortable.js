/**
 * @file designer/designer_dock_sortable.js
 * @description Drag-reorder for #designerProperties dock panels. Lazy-loaded
 * by `designer.js`'s `start()` after `designer_dock.js` has set up
 * `app.designer.dock` and rendered the initial panels.
 *
 * Uses jQuery UI Sortable (already a project dependency — see
 * `sandstorm/components/taskbar/sort.js` for the same pattern) rather than a
 * custom drag implementation. Registers itself as a dock render hook so it
 * re-binds every time the panel list is rebuilt (add/remove/update all
 * replace the DOM via innerHTML).
 *
 * @module program/designer/designer_dock_sortable
 */

function bind(containerEl) {
    const $c = $(containerEl);
    if ($c.hasClass('ui-sortable')) $c.sortable('destroy');

    $c.sortable({
        items: '> .designer-dock-panel',
        handle: '.dock-drag-handle',
        axis: 'y',
        placeholder: 'designer-dock-drop-placeholder',
        forcePlaceholderSize: true,
        tolerance: 'pointer',
        stop: function () {
            const order = $c.children('.designer-dock-panel').map(function () {
                return $(this).data('dock-id');
            }).get();

            order.forEach((id, i) => {
                const p = app.designer.dock.get(id);
                if (p) p.sort = (i + 1) * 10;
            });

            app.designer.dock.saveLayout();
        }
    });
}

export function init(app) {
    const containerEl = document.getElementById('designerProperties');
    if (!containerEl || !app.designer?.dock) return;

    app.designer.dock._registerRenderHook(bind);
    bind(containerEl);
}
