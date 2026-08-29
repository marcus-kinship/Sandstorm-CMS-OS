/**
 * @file designer/designer_dock_resizable.js
 * @description Width-resize for the #designerProperties dock column. Lazy-
 * loaded by `designer.js`'s `start()` after `designer_dock.js` has set up
 * `app.designer.dock`.
 *
 * All dock panels share one column (they're stacked vertically), so this
 * resizes #designerProperties itself by its left edge — using jQuery UI
 * Resizable, the same plugin already used for window resizing (see
 * `sandstorm/components/ui/window.js`). Bounds are the intersection of every
 * currently-registered panel's minWidth/maxWidth (the widest of the minimums,
 * the narrowest of the maximums), recomputed on every dock render so newly
 * added/removed panels keep the resize range honest.
 *
 * @module program/designer/designer_dock_resizable
 */

const DEFAULT_MIN = 200;
const DEFAULT_MAX = 600;

function computeBounds(app) {
    const list = app.designer.dock.list();
    const resizablePanels = list.filter(p => p.resizable !== false);
    if (!resizablePanels.length) return { minWidth: DEFAULT_MIN, maxWidth: DEFAULT_MAX };

    return {
        minWidth: Math.max(...resizablePanels.map(p => p.minWidth ?? DEFAULT_MIN)),
        maxWidth: Math.min(...resizablePanels.map(p => p.maxWidth ?? DEFAULT_MAX))
    };
}

export function init(app) {
    const containerEl = document.getElementById('designerProperties');
    if (!containerEl || !app.designer?.dock) return;

    const $c = $(containerEl);

    function apply() {
        const { minWidth, maxWidth } = computeBounds(app);

        if ($c.hasClass('ui-resizable')) {
            $c.resizable('destroy');
        }
        $c.resizable({
            handles: 'w',
            minWidth,
            maxWidth,
            resize: function () {
                containerEl.style.flex = '0 0 auto';
            }
        });

        $c.find('.ui-resizable-w').css({ left: '0px', cursor: 'ew-resize' });
    }

    app.designer.dock._registerRenderHook(apply);
    apply();
}
