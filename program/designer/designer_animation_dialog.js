/**
 * @file designer/designer_animation_dialog.js
 * @description "fx" CSS animation editor dialog, opened from the merged
 * Layers/Elements panel's bottom bar (designer_layers_panel.js's `fx`
 * button) — a full custom-keyframe editor for the selected node's
 * `node.props.animation`: global timing (duration/delay/timing-function/
 * iteration-count/direction/fill-mode) plus a free-form list of keyframe
 * steps, each an offset (0-100%) and an arbitrary set of CSS property/value
 * pairs. core/animation.js turns that data into a real `@keyframes` rule
 * (regenerated into a shared `<style>` tag on every canvas render) and
 * core/style.js's `buildStyle()` points the node's own `animation` shorthand
 * at it — so committing a change here re-renders the canvas and the
 * animation is immediately visible playing on the actual element; this
 * dialog has no separate preview surface of its own.
 *
 * Every commit writes the *entire* `state` object back to `node.props.
 * animation` in one `win.history.execute()` step (not one step per field —
 * see `commit()`) and re-renders the whole dialog body from that same
 * `state`, same reasoning as designer_border_dialog.js's controls
 * committing immediately with no OK/Cancel: `node.props.animation` is the
 * only source of truth, this dialog holds no state across re-opens.
 *
 * Dialog lifecycle is the exact `_pending`/`windowStart`/`state.close`/two-
 * `setTimeout` skeleton `designer_border_dialog.js`'s own `open()` uses.
 *
 * Lazy-loaded on first click only (see designer_layers_panel.js's
 * `openAnimationDialog`) — not part of `designer.js`'s boot chain.
 *
 * @module program/designer/designer_animation_dialog
 */

const TIMING_OPTIONS = [
    { value: 'ease',        label: _('Ease') },
    { value: 'linear',      label: _('Linear') },
    { value: 'ease-in',     label: _('Ease In') },
    { value: 'ease-out',    label: _('Ease Out') },
    { value: 'ease-in-out', label: _('Ease In Out') }
];

const DIRECTION_OPTIONS = [
    { value: 'normal',            label: _('Normal') },
    { value: 'reverse',           label: _('Reverse') },
    { value: 'alternate',         label: _('Alternate') },
    { value: 'alternate-reverse', label: _('Alternate Reverse') }
];

const FILL_MODE_OPTIONS = [
    { value: 'none',      label: _('None') },
    { value: 'forwards',  label: _('Forwards') },
    { value: 'backwards', label: _('Backwards') },
    { value: 'both',      label: _('Both') }
];

let _pending = null;
let _uiReady = null;

function loadUiDeps(app) {
    _uiReady = app.ui?.dropmenu
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/dropmenu.js').then(mod => mod?.setup?.(app));
}

function defaultAnimation() {
    return {
        duration: 1, delay: 0, timingFunction: 'ease', iterationCount: 1,
        direction: 'normal', fillMode: 'none',
        keyframes: [{ offset: 0, props: {} }, { offset: 100, props: {} }]
    };
}

// Deep-clone, not a reference — this dialog freely mutates `state` as the
// user edits, only ever writing it back to the node on an explicit commit().
function readState(node) {
    const existing = node.props?.animation;
    return existing ? JSON.parse(JSON.stringify(existing)) : defaultAnimation();
}

// ── Markup ───────────────────────────────────────────────────────────────

function keyframeRowHTML(step, index) {
    const propRows = Object.entries(step.props || {}).map(([prop, value], propIndex) =>
        `<div class="dad-prop-row" data-step="${index}" data-prop-index="${propIndex}">` +
            `<input type="text" class="def dad-prop-name" value="${app.util.escapeHtml(prop)}" placeholder="${_('property')}">` +
            `<input type="text" class="def dad-prop-value" value="${app.util.escapeHtml(String(value))}" placeholder="${_('value')}">` +
            `<button type="button" class="dad-icon-btn" data-action="remove-prop" title="${_('Remove property')}">&times;</button>` +
        `</div>`
    ).join('');

    return (
        `<div class="dad-keyframe" data-step="${index}">` +
            `<div class="dad-keyframe-head">` +
                `<input type="number" class="def dad-offset" min="0" max="100" value="${step.offset}">` +
                `<span class="dad-offset-pct">%</span>` +
                `<button type="button" class="dad-icon-btn" data-action="remove-step" title="${_('Remove keyframe')}">&times;</button>` +
            `</div>` +
            `<div class="dad-prop-rows">${propRows}</div>` +
            `<button type="button" class="dad-add-prop" data-action="add-prop" data-step="${index}">+ ${_('Property')}</button>` +
        `</div>`
    );
}

function renderHTML(state) {
    return `
        <div class="dad-root">
            <div class="dad-grid">
                <label class="dad-field"><span>${_('Duration (s)')}</span><input type="number" class="def dad-duration" min="0" step="0.1" value="${state.duration}"></label>
                <label class="dad-field"><span>${_('Delay (s)')}</span><input type="number" class="def dad-delay" min="0" step="0.1" value="${state.delay}"></label>
                <label class="dad-field"><span>${_('Timing')}</span><span class="dad-mount" data-mount="timing"></span></label>
                <label class="dad-field"><span>${_('Iterations')}</span><input type="text" class="def dad-iterations" value="${state.iterationCount}" placeholder="1, 2, ... infinite"></label>
                <label class="dad-field"><span>${_('Direction')}</span><span class="dad-mount" data-mount="direction"></span></label>
                <label class="dad-field"><span>${_('Fill Mode')}</span><span class="dad-mount" data-mount="fill-mode"></span></label>
            </div>
            <div class="dad-keyframes-header">
                <span>${_('Keyframes')}</span>
                <button type="button" class="aero-button xs" data-action="add-step">+ ${_('Keyframe')}</button>
            </div>
            <div class="dad-keyframes">${state.keyframes.map(keyframeRowHTML).join('')}</div>
            <div class="dad-footer">
                <button type="button" class="aero-button xs dad-remove-anim" data-action="remove-animation">${_('Remove Animation')}</button>
                <button type="button" class="aero-button xs dad-close">${_('Close')}</button>
            </div>
        </div>
    `;
}

// ── Dialog wiring ────────────────────────────────────────────────────────

function wireDialog(root, node, { close }) {
    let state = readState(node);

    function commitValue(value, title) {
        const before = node.props.animation;
        const apply = (v) => {
            node.props = node.props || {};
            if (v === undefined) delete node.props.animation; else node.props.animation = v;
            app.designer.render();
        };
        const session = app.designer.win?.history;
        if (session) {
            session.execute({ type: 'node.animation', title, do: () => apply(value), undo: () => apply(before), redo: () => apply(value) });
        } else {
            apply(value);
        }
    }

    function commit(title) {
        commitValue(JSON.parse(JSON.stringify(state)), title);
    }

    function renderBody() {
        root.innerHTML = renderHTML(state);
        mountDropdowns();
        bindBody();
    }

    function mountDropdowns() {
        if (!app.ui?.dropmenu) return;
        const timingMount = root.querySelector('[data-mount="timing"]');
        const directionMount = root.querySelector('[data-mount="direction"]');
        const fillMount = root.querySelector('[data-mount="fill-mode"]');
        if (timingMount) timingMount.innerHTML = app.ui.dropmenu({ options: TIMING_OPTIONS, selected: state.timingFunction });
        if (directionMount) directionMount.innerHTML = app.ui.dropmenu({ options: DIRECTION_OPTIONS, selected: state.direction });
        if (fillMount) fillMount.innerHTML = app.ui.dropmenu({ options: FILL_MODE_OPTIONS, selected: state.fillMode });
        app.ui.dropmenu.initAll();

        timingMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => { state.timingFunction = e.target.value; commit(_('Changed animation timing')); });
        directionMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => { state.direction = e.target.value; commit(_('Changed animation direction')); });
        fillMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => { state.fillMode = e.target.value; commit(_('Changed animation fill mode')); });
    }

    function bindBody() {
        root.querySelector('.dad-duration')?.addEventListener('change', e => {
            const n = parseFloat(e.target.value);
            state.duration = Number.isFinite(n) ? n : 0;
            commit(_('Changed animation duration'));
        });
        root.querySelector('.dad-delay')?.addEventListener('change', e => {
            const n = parseFloat(e.target.value);
            state.delay = Number.isFinite(n) ? n : 0;
            commit(_('Changed animation delay'));
        });
        root.querySelector('.dad-iterations')?.addEventListener('change', e => {
            const raw = e.target.value.trim();
            const n = parseFloat(raw);
            state.iterationCount = raw.toLowerCase() === 'infinite' ? 'infinite' : (Number.isFinite(n) ? n : 1);
            commit(_('Changed animation iterations'));
        });

        root.querySelector('[data-action="add-step"]')?.addEventListener('click', () => {
            const offsets = state.keyframes.map(k => k.offset).sort((a, b) => a - b);
            let offset = 50;
            if (offsets.length >= 2) offset = Math.round((offsets[offsets.length - 1] + offsets[offsets.length - 2]) / 2);
            else if (offsets.length === 1) offset = offsets[0] === 100 ? 50 : Math.min(100, offsets[0] + 50);
            state.keyframes.push({ offset, props: {} });
            commit(_('Added keyframe'));
            renderBody();
        });

        root.querySelectorAll('.dad-keyframe').forEach(stepEl => {
            const stepIndex = parseInt(stepEl.dataset.step, 10);

            stepEl.querySelector('.dad-offset')?.addEventListener('change', e => {
                const n = parseInt(e.target.value, 10);
                state.keyframes[stepIndex].offset = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
                commit(_('Changed keyframe offset'));
            });

            stepEl.querySelector('[data-action="remove-step"]')?.addEventListener('click', () => {
                state.keyframes.splice(stepIndex, 1);
                commit(_('Removed keyframe'));
                renderBody();
            });

            stepEl.querySelector('[data-action="add-prop"]')?.addEventListener('click', () => {
                state.keyframes[stepIndex].props[''] = '';
                renderBody();
            });

            stepEl.querySelectorAll('.dad-prop-row').forEach(row => {
                const propIndex = parseInt(row.dataset.propIndex, 10);
                const nameInput = row.querySelector('.dad-prop-name');
                const valueInput = row.querySelector('.dad-prop-value');
                const currentProp = () => Object.keys(state.keyframes[stepIndex].props)[propIndex];

                function applyPropEdit(newName, newValue) {
                    const oldName = currentProp();
                    const props = state.keyframes[stepIndex].props;
                    const value = newValue !== undefined ? newValue : props[oldName];
                    const name = newName !== undefined ? newName : oldName;
                    const rebuilt = {};
                    Object.entries(props).forEach(([k, v], i) => {
                        if (i === propIndex) rebuilt[name] = value;
                        else rebuilt[k] = v;
                    });
                    state.keyframes[stepIndex].props = rebuilt;
                }

                nameInput?.addEventListener('change', e => { applyPropEdit(e.target.value, undefined); commit(_('Changed animation property')); });
                valueInput?.addEventListener('change', e => { applyPropEdit(undefined, e.target.value); commit(_('Changed animation value')); });

                row.querySelector('[data-action="remove-prop"]')?.addEventListener('click', () => {
                    const props = state.keyframes[stepIndex].props;
                    delete props[currentProp()];
                    commit(_('Removed animation property'));
                    renderBody();
                });
            });
        });

        root.querySelector('[data-action="remove-animation"]')?.addEventListener('click', () => {
            state = defaultAnimation();
            commitValue(undefined, _('Removed animation'));
            renderBody();
        });

        root.querySelector('.dad-close')?.addEventListener('click', () => close());
    }

    renderBody();
}

function injectCSS() {
    if (document.getElementById('designer-animation-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-animation-dialog-style';
    style.textContent = `
        .dad-root { display: flex; flex-direction: column; gap: 10px; padding: 14px; color: #fff; font-size: 11px; overflow-y: auto; height: 100%; box-sizing: border-box; }
        .dad-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
        .dad-field { display: flex; flex-direction: column; gap: 3px; }
        .dad-field span { opacity: 0.7; font-size: 10px; }
        .dad-field input.def { width: 100%; box-sizing: border-box; }
        .dad-mount .ui-dropmenu { width: 100%; box-sizing: border-box; height: 22px; }

        .dad-keyframes-header { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
        .dad-keyframes { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
        .dad-keyframe { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px 8px; }
        .dad-keyframe-head { display: flex; align-items: center; gap: 4px; }
        .dad-offset { width: 50px; flex: 0 0 50px; }
        .dad-offset-pct { opacity: 0.6; }
        .dad-keyframe-head .dad-icon-btn { margin-left: auto; }
        .dad-prop-rows { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .dad-prop-row { display: flex; align-items: center; gap: 4px; }
        .dad-prop-name { flex: 0 0 40%; }
        .dad-prop-value { flex: 1; min-width: 0; }
        .dad-icon-btn { background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 4px; }
        .dad-icon-btn:hover { color: #fff; }
        .dad-add-prop { margin-top: 6px; background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 10px; padding: 0; }
        .dad-add-prop:hover { color: #fff; }

        .dad-footer { display: flex; justify-content: space-between; margin-top: 4px; }
    `;
    document.head.appendChild(style);
}

function open(options = {}) {
    return _uiReady.then(() => {
        _pending = { options };

        app.ui.windowStart('designer', {
            id: 'designer',
            title: _('Animation'),
            windowIcon: true,
            resizable: false,
            width: '420px',
            height: '520px',
            body(windowobj) {
                const captured = _pending;
                _pending = null;
                if (!captured || !captured.options.node) return '';

                const node = captured.options.node;
                const parentId = captured.options.parentId || app.designer.win?.windowId || 'designer';
                const dialogId = windowobj.windowId;

                windowobj.state.close(() => {
                    if (parentId) app.windows.closeDialog(dialogId);
                });

                setTimeout(() => {
                    app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: _('Animation') });
                }, 0);

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.dad-root');
                    if (!root) return;
                    wireDialog(root, node, { close: () => windowobj.close() });
                }, 0);

                return renderHTML(readState(node));
            }
        });
    });
}

export function init(app) {
    injectCSS();
    app.designer = app.designer || {};
    app.designer.animationDialog = { open };

    loadUiDeps(app);
}
