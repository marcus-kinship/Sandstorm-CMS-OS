/**
 * @file controlpanel/programs/notifications.content.js
 * @description Notifications panel content: poll interval, badge placement,
 * and the global/per-program notification-routing settings from the
 * notification system design spec (§3, §4, §7) — lazy-loaded on first open
 * via `notifications.js`'s `panel.contentPath`.
 *
 * Reads/writes exclusively through `app.notifications.settings` and
 * `app.notifications.programPref`, same "only ever reach a feature through
 * its own public API" convention as `controlpanel/programs/security.js`.
 *
 * The per-program list only shows programs that have actually sent a
 * notification or already have a stored preference — mirrors security.js's
 * cursor-permissions list, which likewise only lists programs that have
 * actually requested the capability, not every installed program.
 *
 * @module components/controlpanel/programs/notifications.content
 */

const _CSS = `
.notif-cp-prog-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; gap:12px; flex-wrap:wrap; }
.notif-cp-prog-name { color:#fff; font-size:13px; }
.notif-cp-empty { color:rgba(255,255,255,0.55); font-size:13px; padding:12px 0; }
`;

const PROGRAM_PREF_OPTS = [
    { value: 'own', label: () => _('Own surface in the program') },
    { value: 'clock', label: () => _('At the clock') },
    { value: 'both', label: () => _('Both') },
];

export async function setup(os) {
    os.addCSS('cp-notifications', _CSS);
    await app.ui.ensureLoaded(os, ['radio']);
}

function _knownProgramIds() {
    const ids = new Set();
    for (const n of app.notifications.list()) {
        if (n.programId && n.programId !== 'system') ids.add(n.programId);
    }
    for (const id of Object.keys(app.notifications.programPref.list())) ids.add(id);
    return [...ids];
}

function _renderProgramRows() {
    const ids = _knownProgramIds();
    if (!ids.length) {
        return `<div class="notif-cp-empty">${_('No programs have sent notifications yet.')}</div>`;
    }
    return ids.map(id => {
        const name = app.program?.getInfo?.(id)?.name || id;
        const pref = app.notifications.programPref.get(id) || 'clock';
        const items = PROGRAM_PREF_OPTS.map(o => ({ value: o.value, label: o.label() }));
        return `
            <div class="notif-cp-prog-row" data-program="${id}">
                <div class="notif-cp-prog-name">${app.util.escapeHtml(name)}</div>
                ${app.ui.radio({ name: `notif-prog-${id}`, items, selected: pref })}
            </div>
        `;
    }).join('');
}

export function render(os) {
    const settings = os.notifications.settings.get();

    const layout = {
        container: {
            className: "cp-customizer",
            style: "margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
            subs: [{
                block: {
                    style: "max-width:1024px;width:100%;",
                    subs: [
                        { block: { className: "h1", html: _("Notifications") } },
                        { block: { className: "p", html: _("Manage how and when the system shows notifications") } },
                        { block: { className: "line" } },
                        {
                            block: {
                                className: "background-settings-container",
                                subs: [
                                    {
                                        block: {
                                            id: 'notif-poll-wrap', style: 'display:contents;',
                                            search: { label: () => _('Poll interval'), keywords: ['poll', 'interval'] },
                                            subs: [os.ui.label(_("When should the system check for new notifications?"), "notif-cp-poll", os.ui.radio({
                                                name: "notif-cp-poll",
                                                items: [
                                                    { value: '30s', label: _('30 seconds') },
                                                    { value: '1m', label: _('1 minute') },
                                                    { value: '5m', label: _('5 minutes') },
                                                    { value: '10m', label: _('10 minutes') },
                                                    { value: '30m', label: _('30 minutes') },
                                                    { value: 'manual', label: _('Manual only') },
                                                ],
                                                selected: settings.pollInterval || '5m',
                                            }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'notif-placement-wrap', style: 'display:contents;',
                                            search: { label: () => _('Placement'), keywords: ['placement', 'placering'] },
                                            subs: [os.ui.label(_("Placement"), "notif-cp-placement", os.ui.radio({
                                                name: "notif-cp-placement",
                                                items: [
                                                    { value: 'clock', label: _('At the clock (default)') },
                                                    { value: 'right', label: _('Right side of the screen') },
                                                    { value: 'corner', label: _('Top corner') },
                                                    { value: 'custom', label: _('Custom location') },
                                                ],
                                                selected: settings.placement || 'clock',
                                            }))]
                                        }
                                    },
                                    { block: { className: "line" } },
                                    {
                                        block: {
                                            id: 'notif-progmode-wrap', style: 'display:contents;',
                                            search: { label: () => _('Program notifications'), keywords: ['program', 'aviseringar'] },
                                            subs: [os.ui.label(_("Program notifications"), "notif-cp-progmode", os.ui.radio({
                                                name: "notif-cp-progmode",
                                                items: [
                                                    { value: 'allow-own', label: _('Allow programs to show their own notifications') },
                                                    { value: 'all-at-clock', label: _('Show all at the clock') },
                                                    { value: 'blocked', label: _('Block program notifications') },
                                                ],
                                                selected: settings.programMode || 'allow-own',
                                            }))]
                                        }
                                    },
                                ],
                            },
                        },
                        { block: { className: "line" } },
                        { block: { className: "h2", html: _("Per-program notification settings") } },
                        { block: { html: `<div id="notif-cp-programs">${_renderProgramRows()}</div>` } },
                    ],
                },
            }],
        },
    };

    const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'notifications' }).render();

    setTimeout(() => {
        const pollWrap = document.getElementById('notif-poll-wrap');
        const placementWrap = document.getElementById('notif-placement-wrap');
        const progmodeWrap = document.getElementById('notif-progmode-wrap');
        const programsList = document.getElementById('notif-cp-programs');

        os.ui.radio.bind(pollWrap);
        os.ui.radio.bind(placementWrap);
        os.ui.radio.bind(progmodeWrap);
        os.ui.radio.bind(programsList);

        $(pollWrap).find(".ss-radio-label").on("click", () => {
            os.notifications.settings.set({ pollInterval: os.ui.radio.getValue(pollWrap, 'notif-cp-poll') });
        });
        $(placementWrap).find(".ss-radio-label").on("click", () => {
            os.notifications.settings.set({ placement: os.ui.radio.getValue(placementWrap, 'notif-cp-placement') });
        });
        $(progmodeWrap).find(".ss-radio-label").on("click", () => {
            os.notifications.settings.set({ programMode: os.ui.radio.getValue(progmodeWrap, 'notif-cp-progmode') });
        });

        programsList?.addEventListener('click', (e) => {
            const label = e.target.closest('.ss-radio-label');
            const row = label?.closest('.notif-cp-prog-row');
            if (!row) return;
            os.notifications.programPref.set(row.dataset.program, label.dataset.radioValue);
        });
    }, 0);

    return html;
}
