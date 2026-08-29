/**
 * @file controlpanel/programs/cursor.content.js
 * @description Cursor Control Panel content: engine on/off, pack/theme/size/
 * speed/smoothness, animation toggles, and the embedded cursor-control
 * Security sub-section (ask-before-control / system-only / usage-badge /
 * reset-all-permissions) — lazy-loaded on first open via `cursor.js`'s
 * `panel.contentPath`.
 *
 * Every control calls the already-boot-locked `app.cursor.settings({...})`
 * live; persistence itself goes through `cursor/settings-provider.js`'s own
 * debounced best-effort save (same pre-existing gap as every other Control
 * Panel section — `os.saveUserSettings` doesn't exist anywhere in this repo
 * yet).
 *
 * @module components/controlpanel/programs/cursor.content
 */

const _CSS = `
.cursor-cp-swatches { display: flex; gap: 10px; align-items: center; }
.cursor-cp-swatch {
    width: 28px; height: 28px; border-radius: 50%; cursor: default;
    border: 2px solid rgba(255,255,255,0.25); box-sizing: border-box;
    transition: border-color 0.15s, transform 0.15s;
}
.cursor-cp-swatch:hover { transform: scale(1.08); }
.cursor-cp-swatch.selected { border-color: #fff; }
`;

export async function setup(os) {
    os.addCSS('cp-cursor', _CSS);
    await app.ui.ensureLoaded(os, ['dropmenu']);
}

export function render(os) {
    const settings = app.cursor.getSettings() || {};
    const packOpts = [
        { value: "standard", label: _("Standard") },
        { value: "modern", label: _("Modern") },
        { value: "minimal", label: _("Minimal") },
        { value: "retro", label: _("Retro") },
        { value: "custom", label: _("Custom") },
    ];
    const sizeOpts = [16, 24, 32, 48, 64].map(s => ({ value: String(s), label: `${s}px` }));
    const smoothOpts = [
        { value: "none", label: _("None") },
        { value: "low", label: _("Low") },
        { value: "medium", label: _("Medium") },
        { value: "high", label: _("High") },
    ];

    const layout = {
        container: {
            className: "cp-customizer",
            style: "margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
            subs: [{
                block: {
                    style: "max-width:1024px;width:100%;",
                    subs: [
                        { block: { className: "h1", html: _("Cursor") } },
                        { block: { className: "p", html: _("Custom SVG cursor engine settings") } },
                        { block: { className: "line" } },
                        {
                            block: {
                                className: "background-settings-container",
                                subs: [
                                    {
                                        block: {
                                            id: 'cursor-enabled-wrap', style: 'display:contents;',
                                            search: { label: () => _('Use system cursor'), keywords: ['system', 'cursor', 'native'] },
                                            subs: [os.ui.label(_("Use system cursor"), "cursor-cp-use-system", `<label class="switch-def"><input type="checkbox" id="cursor-cp-use-system" class="lock" ${settings.enabled ? "" : "checked"}><span class="slider"></span></label>`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-css-also-wrap', style: 'display:contents;',
                                            search: { label: () => _('Enable CSS cursor'), keywords: ['css', 'cursor', 'hybrid'] },
                                            subs: [os.ui.label(_("Enable CSS cursor"), "cursor-cp-css-also", `<label class="switch-def"><input type="checkbox" id="cursor-cp-css-also" class="lock" ${settings.cssCursorAlso ? "checked" : ""}><span class="slider"></span></label>`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-pack-wrap', style: 'display:contents;',
                                            search: { label: () => _('Cursor pack'), keywords: ['pack', 'style'] },
                                            subs: [os.ui.label(_("Cursor pack"), "cursor-cp-pack", os.ui.dropmenu({ id: "cursor-cp-pack", options: packOpts, selected: settings.pack || "standard" }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-speed-wrap', style: 'display:contents;',
                                            search: { label: () => _('Speed'), keywords: ['speed'] },
                                            subs: [os.ui.label(_("Speed"), "cursor-cp-speed", `<input type="range" id="cursor-cp-speed" min="0" max="100" value="${Math.round((settings.speed ?? 0.8) * 100)}">`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-smoothness-wrap', style: 'display:contents;',
                                            search: { label: () => _('Smoothness'), keywords: ['smoothness', 'motion'] },
                                            subs: [os.ui.label(_("Smoothness"), "cursor-cp-smoothness", os.ui.dropmenu({ id: "cursor-cp-smoothness", options: smoothOpts, selected: settings.smoothness || "medium" }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-size-wrap', style: 'display:contents;',
                                            search: { label: () => _('Size'), keywords: ['size'] },
                                            subs: [os.ui.label(_("Size"), "cursor-cp-size", os.ui.dropmenu({ id: "cursor-cp-size", options: sizeOpts, selected: String(settings.size || 24) }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-color-wrap', style: 'display:contents;',
                                            search: { label: () => _('Color'), keywords: ['color', 'colour'] },
                                            subs: [os.ui.label(_("Color"), "cursor-cp-color-accent", `
                                                <div class="cursor-cp-swatches">
                                                    <div class="cursor-cp-swatch${(settings.theme || 'accent') === 'accent' ? ' selected' : ''}" id="cursor-cp-color-accent" style="background:var(--background-radial,#4da3ff);" title="${_('Accent')}"></div>
                                                    <div class="cursor-cp-swatch${settings.theme === 'white' ? ' selected' : ''}" id="cursor-cp-color-white" style="background:#ffffff;" title="${_('White')}"></div>
                                                    <div class="cursor-cp-swatch${settings.theme === 'black' ? ' selected' : ''}" id="cursor-cp-color-black" style="background:#000000;" title="${_('Black')}"></div>
                                                    <input type="color" id="cursor-cp-color-custom" value="#4da3ff" title="${_('Custom')}">
                                                </div>
                                            `)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'cursor-anim-wrap', style: 'display:contents;',
                                            search: { label: () => _('Animations'), keywords: ['animation', 'idle', 'busy', 'hover', 'click', 'trail'] },
                                            subs: [
                                                os.ui.label(_("Idle"), "cursor-cp-anim-idle", `<label class="switch-def"><input type="checkbox" id="cursor-cp-anim-idle" class="lock" ${settings.animations?.idle ? "checked" : ""}><span class="slider"></span></label>`),
                                                os.ui.label(_("Busy"), "cursor-cp-anim-busy", `<label class="switch-def"><input type="checkbox" id="cursor-cp-anim-busy" class="lock" ${settings.animations?.busy ? "checked" : ""}><span class="slider"></span></label>`),
                                                os.ui.label(_("Hover"), "cursor-cp-anim-hover", `<label class="switch-def"><input type="checkbox" id="cursor-cp-anim-hover" class="lock" ${settings.animations?.hover ? "checked" : ""}><span class="slider"></span></label>`),
                                                os.ui.label(_("Click"), "cursor-cp-anim-click", `<label class="switch-def"><input type="checkbox" id="cursor-cp-anim-click" class="lock" ${settings.animations?.click ? "checked" : ""}><span class="slider"></span></label>`),
                                                os.ui.label(_("Trail"), "cursor-cp-anim-trail", `<label class="switch-def"><input type="checkbox" id="cursor-cp-anim-trail" class="lock" ${settings.animations?.trail ? "checked" : ""}><span class="slider"></span></label>`),
                                            ]
                                        }
                                    },
                                ],
                            },
                        },
                        { block: { className: "line" } },
                        { block: { className: "h2", html: _("Security") } },
                        {
                            block: {
                                className: "background-settings-container",
                                id: 'cursor-security-wrap',
                                subs: [
                                    {
                                        block: {
                                            style: 'display:contents;',
                                            subs: [os.ui.label(_("Ask before a program controls the cursor"), "cursor-cp-sec-ask", `<label class="switch-def"><input type="checkbox" id="cursor-cp-sec-ask" class="lock" ${settings.security?.askBeforeControl ? "checked" : ""}><span class="slider"></span></label>`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            style: 'display:contents;',
                                            subs: [os.ui.label(_("Allow only system programs"), "cursor-cp-sec-systemonly", `<label class="switch-def"><input type="checkbox" id="cursor-cp-sec-systemonly" class="lock" ${settings.security?.systemOnly ? "checked" : ""}><span class="slider"></span></label>`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            style: 'display:contents;',
                                            subs: [os.ui.label(_("Show cursor usage indicator"), "cursor-cp-sec-showusage", `<label class="switch-def"><input type="checkbox" id="cursor-cp-sec-showusage" class="lock" ${settings.security?.showUsage ? "checked" : ""}><span class="slider"></span></label>`)]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            style: 'display:contents;',
                                            html: `<div style="grid-column:1/-1;padding-top:4px;"><div class="aero-button" id="cursor-cp-sec-resetall">${_('Reset all permissions')}</div></div>`
                                        }
                                    },
                                ],
                            },
                        },
                    ],
                },
            }],
        },
    };

    const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'cursor' }).render();

    setTimeout(async () => {
        os.ui.dropmenu?.initAll();

        $("#cursor-cp-use-system").on("change", (e) => {
            app.cursor.settings({ enabled: !e.target.checked });
        });
        $("#cursor-cp-css-also").on("change", (e) => {
            app.cursor.settings({ cssCursorAlso: e.target.checked });
        });
        $("#cursor-cp-pack").on("change", (e) => {
            app.cursor.settings({ pack: e.target.value });
        });
        $("#cursor-cp-smoothness").on("change", (e) => {
            app.cursor.settings({ smoothness: e.target.value });
        });
        $("#cursor-cp-size").on("change", (e) => {
            app.cursor.settings({ size: parseInt(e.target.value) });
        });

        let speedTimeout;
        $("#cursor-cp-speed").on("input", (e) => {
            clearTimeout(speedTimeout);
            const v = parseInt(e.target.value);
            speedTimeout = setTimeout(() => app.cursor.settings({ speed: v / 100 }), 150);
        });

        const markSelectedSwatch = (id) => {
            document.querySelectorAll('.cursor-cp-swatch').forEach(el => el.classList.remove('selected'));
            document.getElementById(id)?.classList.add('selected');
        };
        $("#cursor-cp-color-accent").on("click", () => { app.cursor.settings({ theme: "accent" }); markSelectedSwatch("cursor-cp-color-accent"); });
        $("#cursor-cp-color-white").on("click", () => { app.cursor.settings({ theme: "white" }); markSelectedSwatch("cursor-cp-color-white"); });
        $("#cursor-cp-color-black").on("click", () => { app.cursor.settings({ theme: "black" }); markSelectedSwatch("cursor-cp-color-black"); });
        $("#cursor-cp-color-custom").on("change", (e) => {
            app.cursor.settings({ theme: { color: e.target.value } });
            document.querySelectorAll('.cursor-cp-swatch').forEach(el => el.classList.remove('selected'));
        });

        for (const key of ["idle", "busy", "hover", "click", "trail"]) {
            $(`#cursor-cp-anim-${key}`).on("change", (e) => {
                app.cursor.settings({ animations: { [key]: e.target.checked } });
            });
        }

        $("#cursor-cp-sec-ask").on("change", (e) => {
            app.cursor.settings({ security: { askBeforeControl: e.target.checked } });
        });
        $("#cursor-cp-sec-systemonly").on("change", (e) => {
            app.cursor.settings({ security: { systemOnly: e.target.checked } });
        });
        $("#cursor-cp-sec-showusage").on("change", (e) => {
            app.cursor.settings({ security: { showUsage: e.target.checked } });
        });
        $("#cursor-cp-sec-resetall").on("click", () => {
            app.cursor.permission.reset("cursor-control");
            app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
        });
    }, 0);

    return html;
}
