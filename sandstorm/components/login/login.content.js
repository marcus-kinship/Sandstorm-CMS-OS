/**
 * @file login/login.content.js
 * @description "Inloggning" (Login) panel content: language override, the
 * automatic-lock timeout, and a background-image override — lazy-loaded on
 * first open via `login.controlpanel.js`'s `panel.contentPath`.
 *
 * Reads/writes exclusively through `os.login.settings`, same "only ever
 * reach a feature through its own public API" convention as
 * `notifications.content.js`.
 *
 * @module components/controlpanel/programs/login.content
 */

import { injectCSS as injectBackgroundPickerCSS, renderThumbnailPickerHTML, bindThumbnailPicker } from '../controlpanel/programs/backgroundpicker.js';
import { resolveLoginBackgroundUrl } from './login.js';

const TIMEOUT_OPTS = [
    { value: "300", label: () => _('5 minutes') },
    { value: "600", label: () => _('10 minutes') },
    { value: "1200", label: () => _('20 minutes') },
    { value: "1800", label: () => _('30 minutes') },
    { value: "3600", label: () => _('1 hour') },
    { value: "7200", label: () => _('2 hours') },
    { value: "10800", label: () => _('3 hours') },
    { value: "14400", label: () => _('4 hours') },
    { value: "18000", label: () => _('5 hours') },
    { value: "36000", label: () => _('10 hours') },
    { value: "54000", label: () => _('15 hours') },
    { value: "72000", label: () => _('20 hours') },
    { value: "0", label: () => _('Never') },
];

export async function setup(os) {
    injectBackgroundPickerCSS(os);
    await app.ui.ensureLoaded(os, ['dropmenu']);
}

export function render(os) {
    const cfg = os.login.settings.get();

    const langOpts = [
        { value: 'system', label: _('System language') },
        ...os.language.getInstalled().map(l => ({ value: l.code, label: `${l.nativeName} (${l.name})` })),
    ];
    const timeoutOpts = TIMEOUT_OPTS.map(o => ({ value: o.value, label: o.label() }));

    const layout = {
        container: {
            className: "cp-customizer",
            style: "margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
            subs: [{
                block: {
                    style: "max-width:1024px;width:100%;",
                    subs: [
                        { block: { className: "h1", html: _("Login") } },
                        { block: { className: "p", html: _("Language, automatic lock timeout, and background image for the login screen") } },
                        { block: { className: "line" } },
                        {
                            block: {
                                className: "background-settings-container",
                                subs: [
                                    {
                                        block: {
                                            id: 'login-cp-language-wrap', style: 'display:contents;',
                                            search: { label: () => _('Language'), keywords: ['language', 'locale', 'login'] },
                                            subs: [os.ui.label(_("Language"), "login-cp-language", os.ui.dropmenu({
                                                id: "login-cp-language",
                                                options: langOpts,
                                                selected: cfg.language || "system",
                                            }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'login-cp-timeout-wrap', style: 'display:contents;',
                                            search: { label: () => _('Automatic timeout'), keywords: ['timeout', 'lock', 'idle', 'auto-lock'] },
                                            subs: [os.ui.label(_("Automatic timeout"), "login-cp-timeout", os.ui.dropmenu({
                                                id: "login-cp-timeout",
                                                options: timeoutOpts,
                                                selected: String(cfg.timeout ?? 300),
                                            }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'login-bg-image-wrap', style: 'display:contents;',
                                            search: { label: () => _('Background image'), keywords: ['background', 'image', 'wallpaper', 'login'] },
                                            html: renderThumbnailPickerHTML(os, {
                                                idPrefix: 'login-bg', currentImage: cfg.backgroundImage,
                                                previewImage: resolveLoginBackgroundUrl(os, cfg),
                                                title: _("Background"),
                                            }),
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

    const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'login' }).render();

    setTimeout(() => {
        os.ui.dropmenu?.initAll();

        $("#login-cp-language").on("change", async (e) => {
            const lang = e.target.value;
            os.login.settings.set({ language: lang });
            if (lang !== 'system' && lang !== os.language.get()) {
                try { await os.language.set(lang); } catch (error) { os.dev.warn(`Language switch failed: ${error.message}`, "Login"); }
            }
            app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
        });

        $("#login-cp-timeout").on("change", (e) => {
            os.login.settings.set({ timeout: parseInt(e.target.value, 10) || 0 });
            os.login.restartIdleTimer?.();
            app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
        });

        bindThumbnailPicker(os, {
            idPrefix: 'login-bg',
            currentImage: cfg.backgroundImage,
            onApply: (url) => {
                if (!os.login.settings.isValidBackgroundImageUrl(url)) {
                    os.ui?.alert?.({
                        title: _('Error'),
                        message: _('Unsupported image type — choose a .jpg, .png, .gif, .webp, or .bmp file.'),
                        confirm: _('OK'),
                    });
                    return;
                }
                os.login.settings.set({ backgroundImage: url });
                app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
            },
            onClear: () => {
                os.login.settings.set({ backgroundImage: null });
                app.desktop.taskbar.notify.success({ programid: "controlpanel", time: 2000 });
            },
        });
    }, 0);

    return html;
}
