/**
 * @file dropmenu.js
 * @description Custom div-based dropdown component for the Sandstorm UI system.
 *
 * ES module that extends `app.ui` with a styled dropdown that mirrors the
 * native `<select>` API surface (`.value` getter/setter, `change` event).
 *
 * Registers:
 * - `app.ui.dropmenu(config)` — returns an HTML string for a dropdown.
 * - `app.ui.dropmenu.initAll()` — activates all uninitialized `.ui-dropmenu`
 *   elements in the document (call after injecting HTML).
 * - `app.ui.label(text, forId, fieldHtml)` — returns a `body()` node object
 *   that renders a label + field row.
 * - `{ dropmenu: {...} }` node type support inside `app.ui.body()` trees.
 *
 * @module components/ui/dropmenu
 *
 * @example
 * const html = app.ui.dropmenu({
 *   id: "lang-select",
 *   options: [
 *     { value: "en", label: "English" },
 *     { value: "sv", label: "Svenska" }
 *   ],
 *   selected: "en"
 * });
 * el.innerHTML = html;
 * app.ui.dropmenu.initAll();
 * document.getElementById("lang-select").addEventListener("change", e => {
 *   console.log("Selected:", e.target.value);
 * });
 */

const _CSS = `
.ui-dropmenu {
    position: relative;
    width: 100%;
    height: 25px;
    margin-bottom: 15px;
    background-color: rgba(0, 0, 0, 0.25);
    color: #ffffff;
    border: none;
    border-radius: 5px;
    padding: 0 9px;
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: default;
    user-select: none;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    box-sizing: border-box;
    outline: none;
}

.ui-dropmenu:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.55);
}

.ui-dropmenu-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
}

.ui-label-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0;
}

.ui-label-row > .ui-label-text {
    flex-shrink: 0;
    width: 140px;
}

.ui-label-row > .ui-label-text label {
    color: #ffffff;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
}

.ui-label-row > .ui-label-field {
    flex: 0 0 300px;
    margin-left: auto;
}

.ui-dropmenu-arrow {
    font-size: 8px;
    opacity: 0.6;
    flex-shrink: 0;
    margin-left: 5px;
    pointer-events: none;
    transition: transform 180ms ease;
}

.ui-dropmenu.open > .ui-dropmenu-arrow {
    transform: rotate(180deg);
}

.ui-dropmenu-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-right: 6px;
    pointer-events: none;
}

.ui-dropmenu-icon svg {
    width: 16px;
    height: 16px;
}

.ui-dropmenu-options {
    display: none;
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    width: 100%;
    z-index: 2000;
    background: linear-gradient(144deg, rgba(37,37,37,0.97) 0%, rgba(10,10,10,0.95) 100%);
    backdrop-filter: blur(12px);
    border-radius: 5px;
    box-shadow: 1px 1px 6px rgba(0,0,0,0.5),
                1px 1px 1px #ffffff1a, -1px -1px 1px #ffffff1a;
    padding: 3px 0;
    max-height: 180px;
    overflow-y: auto;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.35) rgba(0,0,0,0.15);
}

.ui-dropmenu.has-icon > .ui-dropmenu-options {
    width: 200px;
}

.ui-dropmenu-options::-webkit-scrollbar { width: 8px; }
.ui-dropmenu-options::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 4px; }
.ui-dropmenu-options::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.35); border-radius: 4px; }
.ui-dropmenu-options::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }

.ui-dropmenu.open > .ui-dropmenu-options {
    display: block;
}

.ui-dropmenu.dm-up > .ui-dropmenu-options {
    top: auto;
    bottom: calc(100% + 2px);
}

.ui-dropmenu-option {
    padding: 5px 9px;
    cursor: default;
    color: #ffffff;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 120ms ease;
}

.ui-dropmenu-option:hover {
    background-color: rgba(255,255,255,0.1);
}

.ui-dropmenu-option.selected {
    background-color: rgba(255,255,255,0.06);
}
`;

/** Strips markup down to plain text — for a tooltip when an option's `label` is itself HTML (e.g. a rich preview row) and no explicit `title` override was given. */
function _stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
}

function _html(config) {
    const { id = '', options = [], selected = '', className = '', direction = 'down', icon = '' } = config;
    const cur = options.find(o => o.value === selected) || options[0] || { label: '' };
    const curText    = cur.title || _stripHtml(cur.label);
    const idAttr     = id        ? ` id="${id}"`            : '';
    const classExtra = [className, direction === 'up' ? 'dm-up' : '', icon ? 'has-icon' : ''].filter(Boolean).map(c => ' ' + c).join('');

    const opts = options.map(o => {
        const titleData = o.title ? ` data-title="${app.util.escapeHtml(o.title)}"` : '';
        return `<div class="ui-dropmenu-option${o.value === selected ? ' selected' : ''}" data-value="${o.value}"${titleData}>${o.label}</div>`;
    }).join('');

    const iconHTML = icon ? `<span class="ui-dropmenu-icon"><svg><use href="${icon}"></use></svg></span>` : '';

    return (
        `<div class="ui-dropmenu${classExtra}"${idAttr} data-value="${selected}" tabindex="0">` +
        iconHTML +
        `<span class="ui-dropmenu-label">${app.util.escapeHtml(curText)}</span>` +
        `<span class="ui-dropmenu-arrow">&#9660;</span>` +
        `<div class="ui-dropmenu-options">${opts}</div>` +
        `</div>`
    );
}

function _setup(el) {
    if (!el || el.dataset.dmReady) return;
    el.dataset.dmReady = '1';

    // .value getter / setter — mirrors <select>
    Object.defineProperty(el, 'value', {
        get: () => el.dataset.value || '',
        set(v) {
            const str = String(v);
            el.dataset.value = str;
            el.querySelectorAll('.ui-dropmenu-option').forEach(o =>
                o.classList.toggle('selected', o.dataset.value === str)
            );
            const opt = el.querySelector(`.ui-dropmenu-option[data-value="${str.replace(/"/g, '\\"')}"]`);
            const lbl = el.querySelector('.ui-dropmenu-label');
            if (opt && lbl) lbl.textContent = opt.dataset.title || opt.textContent;
        },
        configurable: true
    });

    // Open / close on click
    el.addEventListener('click', e => {
        const wasOpen = el.classList.contains('open');
        document.querySelectorAll('.ui-dropmenu.open').forEach(d => d.classList.remove('open'));
        if (!wasOpen) el.classList.add('open');
        e.stopPropagation();
    });

    // Select option
    el.querySelectorAll('.ui-dropmenu-option').forEach(opt => {
        opt.addEventListener('click', e => {
            el.value = opt.dataset.value;
            el.classList.remove('open');
            el.dispatchEvent(new Event('change', { bubbles: true }));
            e.stopPropagation();
        });
    });

    // Keyboard navigation
    el.addEventListener('keydown', e => {
        const opts = [...el.querySelectorAll('.ui-dropmenu-option')];
        const idx  = opts.findIndex(o => o.dataset.value === el.value);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = opts[idx + 1] ?? opts[0];
            if (next) { el.value = next.dataset.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = opts[idx - 1] ?? opts[opts.length - 1];
            if (prev) { el.value = prev.dataset.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.classList.toggle('open');
        } else if (e.key === 'Escape') {
            el.classList.remove('open');
        }
    });

    document.addEventListener('click', (e) => {
        if (!el.contains(e.target)) el.classList.remove('open');
    }, true);
}

function _patchDef(def) {
    if (!def || typeof def !== 'object') return def;
    const key = Object.keys(def)[0];
    if (!key) return def;
    if (key === 'dropmenu') return { html: _html(def.dropmenu) };
    const node = def[key];
    if (node && typeof node === 'object' && Array.isArray(node.subs)) {
        return { [key]: { ...node, subs: node.subs.map(_patchDef) } };
    }
    return def;
}

export function setup(app) {
    if (app.ui?.dropmenu) return;

    app.addCSS('ui-dropmenu', _CSS);

    // Standalone HTML generator
    app.ui.dropmenu = config => _html(config);

    // Label-field row — returns a DSL block node for use directly in subs arrays
    app.ui.label = (text, forId, field = '') => {
        const forAttr = forId ? ` for="${forId}"` : '';
        return {
            block: {
                className: 'ui-label-row',
                subs: [
                    { block: { className: 'ui-label-text', html: `<label${forAttr}>${text}</label>` } },
                    { block: { className: 'ui-label-field', html: field } }
                ]
            }
        };
    };

    // Read-only "label: value" info row for Control Panel panels (System,
    // About, ...) — an app.ui.label() row with a searchable id/keywords
    // pair grafted onto the block node. Was previously copy-pasted as an
    // identical local closure in both core.content.js and system.content.js;
    // shared here since it's generic to any panel, not specific to either.
    app.ui.infoRow = (id, label, val, keywords) => {
        const row = app.ui.label(label, null, `<span class="cp-value">${val}</span>`);
        row.block.id = id;
        row.block.search = { label: () => label, keywords };
        return row;
    };

    // Activate all uninitialized dropmenu elements in the document
    app.ui.dropmenu.initAll = () =>
        document.querySelectorAll('.ui-dropmenu:not([data-dm-ready])').forEach(_setup);

    // Extend app.ui.body to support { dropmenu: {...} } node type
    const _orig = app.ui.body;
    if (!_orig) return;

    app.ui.body = function(nodeDef) {
        const result      = _orig.call(app.ui, _patchDef(nodeDef));
        const origRender  = result.render.bind(result);
        result.render = function() {
            const html = origRender();
            setTimeout(() => app.ui.dropmenu.initAll(), 0);
            return html;
        };
        return result;
    };
}
