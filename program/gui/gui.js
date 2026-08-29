/**
 * @file gui/gui.js
 * @description GUI Controls showcase program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icon + metadata) lives in `setup.js`.
 * Exports `start(os, win)` (window with tabbed component examples).
 *
 * @module program/gui/gui
 */
export function start(os) {

    os.ui.windowStart("gui", {
        id:        "gui",
        title:     _("GUI Controls & Layout"),
        windowIcon: true,
        resizable: true,
        width:     "900px",
        height:    "640px",
        body(windowobj) {
            const langToken = "gui-" + windowobj?.windowId;
            os.language.registerRefresh(langToken, () => windowobj.title(_("GUI Controls & Layout")));
            windowobj?.on?.("close", () => os.language.unregisterRefresh(langToken));

            const gcId = 'gc-' + Date.now();

            const base = os.config.local.ComponentsRoot + 'controlpanel/';
            os.addCSS('cp-controlpanel', base + 'controlpanel.css', true);
            os.addCSS('cp-tabs',         base + 'tabs.css',         true);

            const SECTIONS = [
                { id: 'buttons',    label: _('Buttons') },
                { id: 'inputs',     label: _('Inputs') },
                { id: 'toggles',    label: _('Toggles & Radio') },
                { id: 'typography', label: _('Typography') },
                { id: 'dialogs',    label: _('Dialogs') },
                { id: 'ui-api',     label: _('UI API') },
            ];

            // ── Section content ───────────────────────────────────────────────

            function _sectionButtons() {
                return `
                <div class="h1">${_('Buttons')}</div>
                <div class="p">${_('aero-button — all variants and states')}</div>
                <div class="line"></div>

                <div class="gc-label">${_('Sizes')}</div>
                <div class="gc-row">
                    <button class="aero-button l">${_('Large')}<div class="after"></div></button>
                    <button class="aero-button m">${_('Medium')}<div class="after"></div></button>
                    <button class="aero-button xs">${_('Small')}<div class="after"></div></button>
                    <button class="aero-button">${_('Default')}<div class="after"></div></button>
                </div>

                <div class="gc-label">${_('Variants')}</div>
                <div class="gc-row">
                    <button class="aero-button">${_('Default')}<div class="after"></div></button>
                    <button class="aero-button confirm">${_('Confirm')}<div class="after"></div></button>
                    <button class="aero-button confirm" disabled>${_('Disabled')}<div class="after"></div></button>
                </div>

                <div class="gc-label">${_('With pulse animation')}</div>
                <div class="gc-row">
                    <button class="aero-button">${_('No pulse')}<div class="after"></div></button>
                    <button class="aero-button">${_('Pulse')}<div class="after pulse"></div></button>
                    <button class="aero-button confirm">${_('Confirm pulse')}<div class="after pulse"></div></button>
                </div>`;
            }

            function _sectionInputs() {
                return `
                <div class="h1">${_('Inputs')}</div>
                <div class="p">${_('Text fields, selects and textareas')}</div>
                <div class="line"></div>

                <div class="gc-label">${_('Basic input (.def)')}</div>
                <div class="gc-col">
                    <input class="def" type="text"     placeholder="${_('Text input')}"     style="max-width:320px;">
                    <input class="def" type="password" placeholder="${_('Password')}"       style="max-width:320px;">
                    <input class="def" type="email"    placeholder="${_('Email')}"          style="max-width:320px;">
                    <input class="def" type="number"   placeholder="${_('Number')}"         style="max-width:320px;">
                    <input class="def" type="text"     placeholder="${_('Disabled')}" disabled style="max-width:320px;">
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('Floating label (.input-def)')}</div>
                <div class="gc-col">
                    <div class="input-def" style="max-width:320px;">
                        <input class="def" type="text" id="gc-fl-1" placeholder=" ">
                        <label for="gc-fl-1">${_('Display name')}</label>
                    </div>
                    <div class="input-def" style="max-width:320px;">
                        <input class="def" type="password" id="gc-fl-2" placeholder=" ">
                        <label for="gc-fl-2">${_('Password')}</label>
                    </div>
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('Select (.def)')}</div>
                <select class="def" style="max-width:320px;">
                    <option>${_('Option one')}</option>
                    <option>${_('Option two')}</option>
                    <option>${_('Option three')}</option>
                </select>

                <div class="gc-label" style="margin-top:20px;">${_('Slider (.def-slider via defSlider())')}</div>
                <div style="max-width:320px;padding:0 4px;">
                    <div id="${gcId}-slider-1"></div>
                </div>
                <div style="max-width:320px;padding:0 4px;margin-top:8px;">
                    <div id="${gcId}-slider-2"></div>
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('Textarea')}</div>
                <textarea class="def" rows="3" placeholder="${_('Write something…')}" style="max-width:320px;width:100%;resize:vertical;"></textarea>`;
            }

            function _sectionToggles() {
                const chk1 = app.ui.check({ id: 'gc-chk-1', checked: true });
                const chk2 = app.ui.check({ id: 'gc-chk-2', checked: false });
                const chk3 = app.ui.check({ id: 'gc-chk-3', checked: true });

                const radio = (typeof app.ui.radio === 'function')
                    ? app.ui.radio({ name: 'gc-radio', items: [
                        { value: 'a', label: _('Option A') },
                        { value: 'b', label: _('Option B') },
                        { value: 'c', label: _('Option C') },
                      ], selected: 'b' })
                    : `<div style="opacity:.5">${_('Radio not loaded')}</div>`;

                return `
                <div class="h1">${_('Toggles & Radio')}</div>
                <div class="p">${_('app.ui.check() and app.ui.radio()')}</div>
                <div class="line"></div>

                <div class="gc-label">${_('Toggle switch (app.ui.check)')}</div>
                <div class="gc-col" style="gap:16px;">
                    <label style="display:flex;align-items:center;gap:14px;cursor:default;">
                        ${chk1}
                        <span style="font-size:12px;">${_('Enabled (checked)')}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:14px;cursor:default;">
                        ${chk2}
                        <span style="font-size:12px;">${_('Disabled (unchecked)')}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:14px;cursor:default;">
                        ${chk3}
                        <span style="font-size:12px;">${_('Another toggle')}</span>
                    </label>
                </div>

                <div class="gc-label" style="margin-top:24px;">${_('Radio group (app.ui.radio)')}</div>
                ${radio}

                <div class="gc-label" style="margin-top:24px;">${_('Native checkbox')}</div>
                <div class="gc-col" style="gap:10px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:default;">
                        <input type="checkbox" checked> ${_('Checked')}
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:default;">
                        <input type="checkbox"> ${_('Unchecked')}
                    </label>
                </div>`;
            }

            function _sectionTypography() {
                return `
                <div class="h1">${_('Typography & Layout')}</div>
                <div class="p">${_('Headings, labels, lines and field helpers')}</div>
                <div class="line"></div>

                <div class="gc-label">${_('Headings')}</div>
                <div class="gc-card">
                    <div class="h1">.h1 — ${_('Main heading')}</div>
                    <div class="p">.p — ${_('Body text / description paragraph')}</div>
                    <div class="line"></div>
                    <div class="cp-label">.cp-label — ${_('Section label / uppercase key')}</div>
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('cp-field rows')}</div>
                <div class="gc-card">
                    <div class="cp-field">
                        <span class="cp-label">${_('Key')}</span>
                        <span class="cp-value">${_('Value')}</span>
                    </div>
                    <div class="cp-field">
                        <span class="cp-label">${_('Version')}</span>
                        <span class="cp-value">1.0.0</span>
                    </div>
                    <div class="cp-field">
                        <span class="cp-label">${_('Status')}</span>
                        <span class="cp-value" style="color:#86efac;">${_('Active')}</span>
                    </div>
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('Line separators')}</div>
                <div class="gc-card">
                    <div>${_('Content above')}</div>
                    <div class="line"></div>
                    <div>${_('Content below')}</div>
                </div>

                <div class="gc-label" style="margin-top:20px;">${_('Background cards')}</div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <div style="padding:14px 18px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);font-size:12px;min-width:140px;">
                        <div style="opacity:.5;font-size:10px;margin-bottom:4px;">theme-backgruondcolorc</div>
                        ${_('Card')}
                    </div>
                    <div style="padding:14px 18px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:12px;min-width:140px;">
                        <div style="opacity:.5;font-size:10px;margin-bottom:4px;">rgba(255,255,255,0.06)</div>
                        ${_('Card border')}
                    </div>
                </div>`;
            }

            function _sectionDialogs() {
                return `
                <div class="h1">${_('Dialogs')}</div>
                <div class="p">${_('app.ui.alert / confirm / prompt — modal dialog windows')}</div>
                <div class="line"></div>

                <div class="gc-label">${_('app.ui.alert()')}</div>
                <div class="gc-row">
                    <button class="aero-button" id="${gcId}-alert-info">${_('Info alert')}<div class="after"></div></button>
                    <button class="aero-button" id="${gcId}-alert-err">${_('Error alert')}<div class="after"></div></button>
                </div>
                <div class="gc-code">app.ui.alert({ title: 'Title', message: 'Message', confirm: 'OK' })</div>

                <div class="gc-label" style="margin-top:20px;">${_('app.ui.confirm()')}</div>
                <div class="gc-row">
                    <button class="aero-button" id="${gcId}-confirm">${_('Confirm dialog')}<div class="after"></div></button>
                </div>
                <div class="gc-code">app.ui.confirm({ title: '…', message: '…', confirm: 'Yes', cancel: 'No' })</div>

                <div class="gc-label" style="margin-top:20px;">${_('app.ui.prompt()')}</div>
                <div class="gc-row">
                    <button class="aero-button" id="${gcId}-prompt">${_('Prompt dialog')}<div class="after"></div></button>
                </div>
                <div class="gc-code">app.ui.prompt({ title: '…', message: '…', placeholder: '…' })</div>

                <div id="${gcId}-dialog-result" style="display:none;margin-top:16px;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.06);font-size:12px;"></div>`;
            }

            function _sectionUiApi() {
                return `
                <div class="h1">${_('UI API reference')}</div>
                <div class="p">${_('All registered app.ui.* functions')}</div>
                <div class="line"></div>

                ${[
                    ['app.ui.windowStart(programid, opts)',  _('Open a program window')],
                    ['app.ui.window(opts)',                  _('Open a generic window')],
                    ['app.ui.layer(opts)',                   _('Fullscreen overlay layer')],
                    ['app.ui.alert(opts)',                   _('Modal alert dialog (async)')],
                    ['app.ui.confirm(opts)',                 _('Modal confirm dialog (async, returns bool)')],
                    ['app.ui.prompt(opts)',                  _('Modal prompt dialog (async, returns string)')],
                    ['app.ui.body(nodeDef, ctx)',            _('UI tree renderer → .render()')],
                    ['app.ui.check(config)',                 _('Toggle switch HTML string')],
                    ['app.ui.radio(config)',                 _('Radio group HTML string + .bind() + .getValue()')],
                    ['app.ui.dropmenu(config)',              _('Dropdown menu HTML')],
                    ['app.ui.label(text, forId, field)',     _('Label + field body() node')],
                    ['app.ui.sidopanel(sections, opts)',     _('Collapsible side-navigation panel')],
                    ['app.ui.caret',                        _('Custom text caret controller')],
                    ['app.ui.tags',                         _('Tag input / chip component')],
                    ['app.ui.capsLock',                     _('Caps Lock state detector')],
                    ['app.ui.animation(el, cls)',           _('Await CSS animation on element')],
                ].map(([fn, desc]) => `
                <div style="display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.05);padding:9px 0;">
                    <div style="font-family:monospace;font-size:11px;color:#93c5fd;flex:0 0 320px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fn}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.55);flex:1;">${desc}</div>
                </div>`).join('')}`;
            }

            // ── HTML ──────────────────────────────────────────────────────────

            const html = `
            <style>
            #${gcId} .gc-pane { display:none; }
            #${gcId} .gc-pane.active { display:block; }
            #${gcId} .gc-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,0.38); font-weight:600; margin:20px 0 10px; }
            #${gcId} .gc-label:first-child { margin-top:0; }
            #${gcId} .gc-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            #${gcId} .gc-col { display:flex; flex-direction:column; gap:10px; }
            #${gcId} .gc-card { padding:16px 18px; border-radius:10px; background:var(--theme-backgruondcolorc,#00000040); margin-bottom:4px; }
            #${gcId} .gc-code { font-family:monospace; font-size:11px; padding:10px 14px; border-radius:8px; background:rgba(0,0,0,0.3); color:#93c5fd; margin-top:8px; white-space:nowrap; overflow-x:auto; }
            </style>

            <div id="${gcId}" class="cp-tab-panel" style="font-size:12px;color:#fff;">
              <div class="cp-tab-sidebar">
                ${SECTIONS.map((s, i) =>
                    `<div class="cp-tab${i === 0 ? ' active' : ''}" data-sec="${s.id}">
                        <span class="cp-tab-name">${s.label}</span>
                        <span class="cp-tab-arrow">&#8250;</span>
                    </div>`
                ).join('')}
              </div>
              <div class="cp-tab-content" style="padding:28px 32px;">
                <div class="gc-pane active" id="${gcId}-pane-buttons">${_sectionButtons()}</div>
                <div class="gc-pane" id="${gcId}-pane-inputs">${_sectionInputs()}</div>
                <div class="gc-pane" id="${gcId}-pane-toggles">${_sectionToggles()}</div>
                <div class="gc-pane" id="${gcId}-pane-typography">${_sectionTypography()}</div>
                <div class="gc-pane" id="${gcId}-pane-dialogs">${_sectionDialogs()}</div>
                <div class="gc-pane" id="${gcId}-pane-ui-api">${_sectionUiApi()}</div>
              </div>
            </div>`;

            // ── Bind events ───────────────────────────────────────────────────

            setTimeout(() => {

                // Sidebar navigation
                document.querySelectorAll(`#${gcId} .cp-tab[data-sec]`).forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelectorAll(`#${gcId} .cp-tab`).forEach(t => t.classList.remove('active'));
                        document.querySelectorAll(`#${gcId} .gc-pane`).forEach(p => p.classList.remove('active'));
                        tab.classList.add('active');
                        $(`#${gcId}-pane-` + tab.dataset.sec).addClass('active');
                    });
                });

                // Sliders — app.ui.slider() lazy-loads slider.js + injects CSS
                app.ui.slider({ min: 0, max: 100, handle1: { start: 40 } }, `#${gcId}-slider-1`);
                app.ui.slider({ min: 0, max: 200, handle1: { start: 80 }, handle2: { start: 160 }, dual: true }, `#${gcId}-slider-2`);

                // Radio bind (if loaded)
                if (typeof app.ui.radio?.bind === 'function') {
                    const root = $('#' + gcId)[0];
                    if (root) app.ui.radio.bind(root);
                }

                // Dialogs section
                $(`#${gcId}-alert-info`).on('click', () => {
                    app.ui.alert({ title: _('Information'), message: _('This is an info alert message.'), confirm: _('OK') });
                });
                $(`#${gcId}-alert-err`).on('click', () => {
                    app.ui.alert({ title: _('Error'), message: _('Something went wrong. Please try again.'), confirm: _('Close') });
                });
                $(`#${gcId}-confirm`).on('click', async () => {
                    const result = await app.ui.confirm({
                        title:   _('Confirm action'),
                        message: _('Are you sure you want to continue?'),
                        confirm: _('Yes'),
                        cancel:  _('No')
                    });
                    const el = $(`#${gcId}-dialog-result`)[0];
                    if (el) {
                        el.style.display = 'block';
                        el.textContent = `confirm() → ${result}`;
                    }
                });
                $(`#${gcId}-prompt`).on('click', async () => {
                    const result = await app.ui.prompt({
                        title:       _('Enter a value'),
                        message:     _('Type something below:'),
                        placeholder: _('Your input…'),
                        confirm:     _('Submit'),
                        cancel:      _('Cancel')
                    });
                    const el = $(`#${gcId}-dialog-result`)[0];
                    if (el) {
                        el.style.display = 'block';
                        el.textContent = `prompt() → "${result ?? _('(cancelled)')}"`;
                    }
                });

            }, 0);

            return html;
        }
    });
}
