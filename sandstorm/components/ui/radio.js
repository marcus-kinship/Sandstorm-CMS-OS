/**
 * @file radio.js
 * @description Radio button group — glass button indicator + text label beside it.
 *
 * Registers `app.ui.radio(config)` via its `setup(app)` export.
 * The indicator matches the aero-button gradient/pulse style; text sits outside.
 *
 * @module components/ui/radio
 *
 * @example
 * // In program setup(), after including the module:
 * const html = app.ui.radio({
 *   name: "theme",
 *   items: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }],
 *   selected: "dark"
 * });
 * container.innerHTML = html;
 * app.ui.radio.bind(container);
 * const val = app.ui.radio.getValue(container, "theme"); // "dark"
 */

const _CSS = `
.ss-radio-group {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: center;
}
.ss-radio-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: default;
    user-select: none;
    outline: none;
}
.ss-radio-indicator {
    position: relative;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(
        to top,
        rgb(53 53 53 / 50%) 1%,
        rgb(53 53 53 / 50%) 12%,
        rgb(0 0 0 / 50%) 33%,
        rgb(0 0 0 / 50%) 50%,
        rgb(39 39 39 / 50%) 51%,
        rgb(104 104 104 / 50%) 100%
    );
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.12);
    overflow: hidden;
    flex-shrink: 0;
    transition: box-shadow 0.2s;
}
.ss-radio-label:hover .ss-radio-indicator {
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.2);
}
.ss-radio-label.active .ss-radio-indicator {
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,0.22);
}
.ss-radio-indicator .after {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, 40%);
    width: 9px;
    height: 9px;
    border-radius: 50%;
    filter: blur(4px);
    background: var(--background-radial);
    opacity: 0;
    transition: 0.5s ease;
}
.ss-radio-indicator .after.pulse {
    animation: pulse 3s infinite;
}
.ss-radio-text {
    font: 11px system-ui;
    text-shadow: 1px 1px 1px #000;
    color: rgba(255,255,255,0.5);
    transition: color 0.2s;
}
.ss-radio-label:hover .ss-radio-text {
    color: rgba(255,255,255,0.85);
}
.ss-radio-label.active .ss-radio-text {
    color: #fff;
}
`;

/**
 * Builds the HTML string for a radio button group.
 *
 * @private
 * @param {Object}   config            - Radio group configuration.
 * @param {string}   config.name       - Group name (maps to the hidden `<input name>`).
 * @param {Array}    config.items      - Radio items, each `{ value, label }`.
 * @param {string}   [config.selected] - Pre-selected value; defaults to the first item.
 * @returns {string} HTML string for the radio group.
 */
function _html(config) {
    const { name, items = [], selected = '' } = config;
    const initial = selected || items[0]?.value || '';
    const labels = items.map(item => {
        const active = item.value === initial;
        return (
            `<label class="ss-radio-label${active ? ' active' : ''}" ` +
            `data-radio-name="${name}" data-radio-value="${item.value}">` +
            `<span class="ss-radio-indicator">` +
            `<div class="after${active ? ' pulse' : ''}"></div>` +
            `</span>` +
            `<span class="ss-radio-text">${item.label}</span>` +
            `</label>`
        );
    }).join('');
    return (
        `<div class="ss-radio-group" data-radio-name="${name}">` +
        labels +
        `<input type="hidden" class="ss-radio-hidden" name="${name}" value="${initial}">` +
        `</div>`
    );
}

/**
 * Attaches click handlers to all radio labels inside a container.
 * Updates the `.active` class and the pulse animation on the selected indicator,
 * and syncs the value to the hidden `<input>`.
 *
 * @private
 * @param {HTMLElement} container - The container element that holds the radio group HTML.
 */
function _bind(container) {
    container.querySelectorAll('.ss-radio-label').forEach(label => {
        label.addEventListener('click', () => {
            const name = label.dataset.radioName;
            container.querySelectorAll(`.ss-radio-label[data-radio-name="${name}"]`).forEach(l => {
                l.classList.remove('active');
                l.querySelector('.after')?.classList.remove('pulse');
            });
            label.classList.add('active');
            label.querySelector('.after')?.classList.add('pulse');
            const hidden = container.querySelector(`.ss-radio-hidden[name="${name}"]`);
            if (hidden) hidden.value = label.dataset.radioValue;
        });
    });
}

/**
 * Registers `app.ui.radio` if not already present.
 * Injects the required CSS once and exposes:
 * - `app.ui.radio(config)` — returns HTML string.
 * - `app.ui.radio.bind(container)` — attaches click handlers.
 * - `app.ui.radio.getValue(container, name)` — reads the selected value.
 *
 * @param {Object} app - The global Sandstorm app object.
 */
export function setup(app) {
    if (app.ui?.radio) return;

    app.addCSS('ui-radio', _CSS);

    app.ui.radio = function(config) { return _html(config); };
    app.ui.radio.bind = _bind;
    app.ui.radio.getValue = (container, name) =>
        container.querySelector(`.ss-radio-hidden[name="${name}"]`)?.value || '';
}
