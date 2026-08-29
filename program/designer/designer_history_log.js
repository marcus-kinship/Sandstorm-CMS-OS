/**
 * @file designer/designer_history_log.js
 * @description The "History" dock panel — renders the live undo/redo stack
 * from the active window's `win.history` (see `sandstorm/components/historyManager.js`)
 * instead of keeping its own separate activity log. Every tool now records
 * real do/undo/redo commands via `win.history.execute()` (see `tools/*.js`,
 * `designer_objectmodel.js`, `designer_hover_overlay.js`) — this panel just
 * reflects that shared state, re-rendering on the `'history.changed'`
 * lifecycle event and highlighting the current undo/redo pointer.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`, after
 * the dock system (needs the "history" dock panel's DOM to already exist).
 *
 * @module program/designer/designer_history_log
 */

function render() {
    const panel = document.querySelector('[data-dock-id="history"] .designer-dock-content');
    if (!panel) return;

    const session = app.designer.win?.history;
    const entries = session?.getHistory() ?? [];
    const pointer = session?.getPointer() ?? -1;

    panel.innerHTML = entries.length
        ? `<ul class="designer-history-list">${entries.map((cmd, i) => {
            const cls = i === pointer ? ' designer-history-current' : (i > pointer ? ' designer-history-future' : '');
            return `<li class="${cls}">${cmd.title}</li>`;
        }).reverse().join('')}</ul>`
        : `<p>${_('No actions yet')}</p>`;
}

function injectCSS() {
    if (document.getElementById('designer-history-log-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-history-log-style';
    style.textContent = `
        .designer-history-list { list-style: none; margin: 0; padding: 0; }
        .designer-history-list li { padding: 3px 6px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .designer-history-list li.designer-history-current { background: rgba(77,163,255,0.16); font-weight: 600; }
        .designer-history-list li.designer-history-future { opacity: 0.4; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();
    render();

    app.lifecycle.on('history.changed', (e) => {
        if (e?.programId === 'designer') render();
    });
}
