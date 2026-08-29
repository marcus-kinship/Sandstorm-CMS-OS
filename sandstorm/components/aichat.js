/**
 * @file aichat.js
 * @description AI Chat taskbar system icon for Sandstorm OS.
 *
 * UI-only shell — there is no real AI backend wired up yet. Registers a
 * persistent taskbar status icon (like languageIcon) that toggles a floating
 * overlay panel (via app.ui.toggle.window) listing mock chat sessions.
 *
 * The 4 toolbar icons are functional against local/mock state (no backend):
 *  - Choose program: lists installed programs (os.program.getAll()) and tags
 *    the chat with one, shown as a pill in the header.
 *  - New chat: pushes a new mock session and makes it active.
 *  - Upload image or file: real native file picker, shown as an attach pill.
 *  - Choose session: switches which mock session is active.
 *  - Mic: reuses the real app.voiceinput speech-recognition engine to
 *    dictate directly into the message textarea.
 *
 * Exposes app.desktop.aiChat.setActive()/setBadge()/setEnabled() so the
 * "thinking" pulse, notification badge, and taskbar visibility can be driven
 * manually (or from the "AI Chat" Control Panel page this module registers)
 * until a real backend exists to drive them automatically.
 *
 * @module components/aichat
 */

let _os;

// Manual/CP-driven state — see os.desktop.aiChat below.
const _config = {
    enabled:    true,
    testPulse:  false,
    testBadge:  0
};

// Mock session data — stand-in for real chat history until a backend exists.
const _mockSessions = [
    { id: "s1", title: "Refactor taskbar overflow logic",  state: "done",     time: "2m ago" },
    { id: "s2", title: "Explain a CSS specificity bug",     state: "thinking", time: "just now" },
    { id: "s3", title: "Solitaire responsive card sizing",  state: "waiting",  time: "12m ago" },
];

const _stateColor = {
    done:     "#4ade80",
    thinking: "#facc15",
    waiting:  "#94a3b8",
};

let _activeSessionId  = "s2";
let _currentProgramId = null;   // program picked via "Choose program", or null
let _attachedFile     = null;   // { name } from "Upload image or file", or null
let _openDropdown     = null;   // 'program' | 'session' | null
let _micActive        = false;

export async function setup(os) {
    _os = os;

    // ── Register SVG icon ──────────────────────────────────────────────────
    os.svg.global.load({
        id: "ic-ai-chat",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>`
    });

    // ── Register as background system program ──────────────────────────────
    //   addInfo() requires all of requiredProperties (program.js), including
    //   `main` — omitting any of them makes it return early without setting
    //   `lastid`, which then makes app.program.add(module) (called by
    //   includeProgram right after setup() returns) fail with "No program ID
    //   set". `main` points at the start() export below, though it should
    //   never actually be invoked since taskbar/startmenu are both false.
    os.program.addInfo("aichat", {
        name:        "AI Chat",
        version:     "1.0",
        owner:       "System",
        description: "AI chat taskbar icon (UI shell)",
        icontype:    "svg",
        icon:        "#ic-ai-chat",
        taskbar:     false,
        startmenu:   false,
        multistart:  false,
        main:        "start",
        programtype: "system",
        autorun:     false
    });

    _injectCSS();

    // ── Register taskbar status icon ───────────────────────────────────────
    //   setStatusIcon() pushes to config.statusIcons[]; the DOM renders when
    //   desktop.taskbar.build() runs in the start sequence (see language.js
    //   for the identical pattern used by languageIcon).
    os.desktop.taskbar.setStatusIcon({
        id:    "aiChatIcon",
        class: "icon ai-chat-icon",
        svg:   "#ic-ai-chat",
        title: "AI Chat",
        click(e) {
            _openDropdown = null;
            os.ui.toggle.window({
                windowId:     "#aiChatPanel",
                iconSelector: ".ai-chat-icon",
                gap:          10,
                width:        "300px",
                height:       "400px",
                class:        "ai-chat-toggle-window",
                position:     "top center",
                body() {
                    return _panelHTML();
                }
            });
        }
    });

    // ── Manual test API — drive the pulse/badge/visibility until a real ─────
    //   backend exists. Also the target of the "AI Chat" Control Panel page.
    os.desktop.aiChat = {
        config: _config,
        /** Toggle the pulsing "thinking" animation on the taskbar icon. */
        setActive(active) {
            _config.testPulse = !!active;
            // Class selector, not "#aiChatIcon" — status icons render in 2+
            // duplicate DOM copies sharing the same id (taskbar + start-menu
            // widget); an id selector only ever reaches one of them.
            $(".ai-chat-icon").toggleClass("active", _config.testPulse);
        },
        /** Show/hide a small notification badge with a count (0 hides it). */
        setBadge(count) {
            _config.testBadge = count || 0;
            $(".ai-chat-icon").each(function () {
                const icon = $(this);
                icon.toggleClass("has-badge", _config.testBadge > 0);
                let badge = icon.find(".ai-chat-badge");
                if (!badge.length) {
                    badge = $('<span class="ai-chat-badge"></span>');
                    icon.append(badge);
                }
                badge.text(_config.testBadge > 9 ? "9+" : _config.testBadge);
            });
        },
        /** Show/hide the taskbar icon entirely. */
        setEnabled(enabled) {
            _config.enabled = !!enabled;
            $("body").toggleClass("ai-chat-disabled", !_config.enabled);
        }
    };

    // ── Toolbar + dropdown + attachment event delegation ────────────────────
    //   Delegated on document (not the panel) since the panel's DOM is
    //   recreated by toggleWindow.js every time it's opened.
    $(document).on("click", ".ai-chat-tool-btn", function (e) {
        e.stopPropagation();
        const action = this.dataset.action;
        if (action === "choose-program") {
            _openDropdown = _openDropdown === "program" ? null : "program";
            _rerenderPanel();
        } else if (action === "choose-session") {
            _openDropdown = _openDropdown === "session" ? null : "session";
            _rerenderPanel();
        } else if (action === "new-chat") {
            const id = "s" + Date.now();
            _mockSessions.unshift({ id, title: _("New chat"), state: "waiting", time: _("just now") });
            _activeSessionId = id;
            _openDropdown = null;
            _rerenderPanel();
        } else if (action === "upload") {
            document.querySelector("#aiChatPanel .ai-chat-file-input")?.click();
        } else if (action === "mic") {
            _toggleMic(this);
        }
    });

    $(document).on("change", ".ai-chat-file-input", function () {
        const file = this.files && this.files[0];
        if (!file) return;
        _attachedFile = { name: file.name };
        _rerenderPanel();
    });

    $(document).on("click", ".ai-chat-attach-remove", function (e) {
        e.stopPropagation();
        _attachedFile = null;
        _rerenderPanel();
    });

    $(document).on("click", ".ai-chat-program-clear", function (e) {
        e.stopPropagation();
        _currentProgramId = null;
        _rerenderPanel();
    });

    $(document).on("click", ".ai-chat-dd-item", function () {
        const dd = this.closest(".ai-chat-dropdown");
        if (dd?.dataset.kind === "program") _currentProgramId = this.dataset.pid;
        else if (dd?.dataset.kind === "session") _activeSessionId = this.dataset.id;
        _openDropdown = null;
        _rerenderPanel();
    });

    $(document).on("click", ".ai-chat-dd-close", function (e) {
        e.stopPropagation();
        _openDropdown = null;
        _rerenderPanel();
    });

    // Close an open dropdown when clicking anywhere else in the panel (or
    // outside it) — everything except the dropdown itself and the two
    // toggle buttons that open/close it (those already manage their own
    // toggle state via the .ai-chat-tool-btn handler above). Uses
    // event.originalEvent.composedPath() rather than a live closest() check
    // for the same reason toggleWindow.js's outside-click handler does: an
    // earlier handler for this same click (e.g. .ai-chat-dd-item) may have
    // already replaced #aiChatPanel's innerHTML via _rerenderPanel(),
    // detaching the original click target while the event is still
    // bubbling — a live closest() on a detached node always misses.
    $(document).on("click", function (e) {
        if (!_openDropdown) return;
        const nativeEvent = e.originalEvent || e;
        const path = typeof nativeEvent.composedPath === 'function' ? nativeEvent.composedPath() : [];
        const insideDropdown = path.some(el => el.classList?.contains?.('ai-chat-dropdown'));
        const onToggleBtn = path.some(el =>
            el.classList?.contains?.('ai-chat-tool-btn') &&
            (el.dataset?.action === 'choose-program' || el.dataset?.action === 'choose-session')
        );
        if (!insideDropdown && !onToggleBtn) {
            _openDropdown = null;
            _rerenderPanel();
        }
    });

    $(document).on("click", ".ai-chat-item", function () {
        _activeSessionId = this.dataset.id;
        _rerenderPanel();
    });

    // ── Auto-grow the message textarea as its content wraps ─────────────────
    $(document).on("input", ".ai-chat-input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, _INPUT_MAX_HEIGHT) + "px";
    });

    _registerControlPanel(os);
}

const _INPUT_MAX_HEIGHT = 120;

// ══════════════════════════════════════════════════════════════════════════
//  START — required by addInfo's `main` field, but unreachable in practice
//  since taskbar/startmenu are both false (no launcher entry points to it).
// ══════════════════════════════════════════════════════════════════════════
export function start() {}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — panel content
// ══════════════════════════════════════════════════════════════════════════

function _rerenderPanel() {
    const panel = document.querySelector("#aiChatPanel");
    if (!panel) return;
    panel.innerHTML = _panelHTML();
}

function _toggleMic(btn) {
    if (!window.app?.voiceinput) return; // voiceinput program not loaded
    if (_micActive) {
        app.voiceinput.stopRecording();
        _micActive = false;
        btn.classList.remove("active");
        return;
    }
    const field = document.querySelector("#aiChatPanel .ai-chat-input");
    if (!field) return;
    app.voiceinput.activeField = field;
    field.focus();
    app.voiceinput.startRecognition();
    _micActive = true;
    btn.classList.add("active");
}

function _sessionRowsHTML() {
    return _mockSessions.map(s => `
        <div class="ai-chat-item${s.id === _activeSessionId ? ' active' : ''}" data-id="${s.id}">
            <span class="ai-chat-dot" style="background:${_stateColor[s.state] || '#94a3b8'}"></span>
            <div class="ai-chat-item-text">
                <div class="ai-chat-item-title">${_esc(s.title)}</div>
                <div class="ai-chat-item-time">${_esc(s.time)}</div>
            </div>
        </div>
    `).join('');
}

function _programIconHTML(p) {
    if (p.icon && (p.icontype === 'svg' || p.icon.startsWith('#'))) {
        return `<svg viewBox="0 0 24 24"><use href="${p.icon}"></use></svg>`;
    }
    if (p.icon) return `<img src="${p.icon}" alt="">`;
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3"/></svg>`;
}

function _dropdownHTML() {
    if (_openDropdown === "program") {
        const programs = Object.entries(_os.program.getAll())
            .filter(([pid]) => pid !== "aichat")
            .sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''));
        const rows = programs.map(([pid, p]) => `
            <div class="ai-chat-dd-item${pid === _currentProgramId ? ' active' : ''}" data-pid="${pid}">
                ${_programIconHTML(p)}<span>${_esc(p.name || pid)}</span>
            </div>`).join('');
        return `<div class="ai-chat-dropdown" data-kind="program">
            <div class="ai-chat-dd-header">
                <span>${_esc(_('Choose program'))}</span>
                <button class="ai-chat-dd-close" type="button" title="${_esc(_('Close'))}">×</button>
            </div>
            <div class="ai-chat-dd-list">${rows || `<div class="ai-chat-dd-empty">${_esc(_('No programs installed'))}</div>`}</div>
        </div>`;
    }
    if (_openDropdown === "session") {
        const rows = _mockSessions.map(s => `
            <div class="ai-chat-dd-item${s.id === _activeSessionId ? ' active' : ''}" data-id="${s.id}">
                <span class="ai-chat-dot" style="background:${_stateColor[s.state] || '#94a3b8'}"></span>
                <span>${_esc(s.title)}</span>
            </div>`).join('');
        return `<div class="ai-chat-dropdown" data-kind="session">
            <div class="ai-chat-dd-header">
                <span>${_esc(_('Choose session'))}</span>
                <button class="ai-chat-dd-close" type="button" title="${_esc(_('Close'))}">×</button>
            </div>
            <div class="ai-chat-dd-list">${rows}</div>
        </div>`;
    }
    return '';
}

function _panelHTML() {
    const programInfo = _currentProgramId ? _os.program.getInfo(_currentProgramId) : null;
    const attachHTML = _attachedFile ? `
        <div class="ai-chat-attach-row">
            <span class="ai-chat-attach-pill">
                <span class="ai-chat-attach-name">${_esc(_attachedFile.name)}</span>
                <button class="ai-chat-attach-remove" type="button" title="${_esc(_('Remove'))}">×</button>
            </span>
        </div>` : '';

    return `
        <div class="ai-chat-wrap">
            <div class="ai-chat-header">
                <span>${_esc(_('AI Chat'))}</span>
                ${programInfo ? `
                    <span class="ai-chat-program-pill" data-pid="${_currentProgramId}">
                        ${_esc(programInfo.name || _currentProgramId)}
                        <button class="ai-chat-program-clear" type="button" title="${_esc(_('Clear'))}">×</button>
                    </span>` : ''}
            </div>
            <div class="ai-chat-list-wrap">
                <div class="ai-chat-list">${_sessionRowsHTML()}</div>
                ${_dropdownHTML()}
            </div>
            <div class="ai-chat-toolbar">
                <button class="ai-chat-tool-btn${_openDropdown === 'program' ? ' active' : ''}" data-action="choose-program" type="button" title="${_esc(_('Choose program'))}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
                </button>
                <button class="ai-chat-tool-btn" data-action="new-chat" type="button" title="${_esc(_('New chat'))}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
                <button class="ai-chat-tool-btn" data-action="upload" type="button" title="${_esc(_('Upload image or file'))}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5S13.5 3.62 13.5 5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                </button>
                <button class="ai-chat-tool-btn${_openDropdown === 'session' ? ' active' : ''}" data-action="choose-session" type="button" title="${_esc(_('Choose session'))}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                </button>
                <button class="ai-chat-tool-btn ai-chat-mic-btn${_micActive ? ' active' : ''}" data-action="mic" type="button" title="${_esc(_('Voice input'))}">
                    <svg viewBox="0 0 24 24"><use href="#ic-mic"></use></svg>
                </button>
            </div>
            <input type="file" class="ai-chat-file-input" accept="image/*,.pdf,.txt,.md,.doc,.docx" style="display:none">
            ${attachHTML}
            <div class="ai-chat-input-row">
                <textarea class="ai-chat-input" rows="1" placeholder="${_esc(_('Type a message…'))}"></textarea>
            </div>
        </div>
    `;
}

function _esc(s) {
    return app.util.escapeHtml(s);
}

// ══════════════════════════════════════════════════════════════════════════
//  PRIVATE — Control Panel page
// ══════════════════════════════════════════════════════════════════════════

async function _registerControlPanel(os) {
    // Same lazy-load guard controlpanel/programs/system.js uses for its
    // Taskbar page — dropmenu.js/checkbox.js register app.ui.label/app.ui.check
    // themselves and aren't guaranteed to have loaded yet at this point.
    if (!os.ui.dropmenu) {
        const dm = await os.includeModule(os.config.local.ComponentsRoot + 'ui/dropmenu.js');
        if (dm?.setup) dm.setup(os);
    }
    if (!os.ui.check) {
        const cb = await os.includeModule(os.config.local.ComponentsRoot + 'ui/checkbox.js');
        if (cb?.setup) cb.setup(os);
    }

    os.svg.global.load({
        id: 'ic-cp-aichat',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>`
    });

    os.controlpanel.add({
        front: {
            name:     'aichat',
            icon:     '#ic-cp-aichat',
            type:     'svg',
            label:    () => _('AI Chat'),
            keywords: ['ai', 'chat', 'assistant', 'aichat']
        },
        panel: {
            id:   'aichat',
            name: () => _('AI Chat'),
            searchItems: [
                { id: 'aichat-enabled', label: () => _('Show icon in taskbar'),   keywords: ['ai', 'chat', 'taskbar', 'icon', 'show', 'hide', 'enable', 'disable'] },
                { id: 'aichat-pulse',   label: () => _('Test: thinking pulse'),   keywords: ['ai', 'chat', 'pulse', 'thinking', 'animation', 'test'] },
                { id: 'aichat-badge',   label: () => _('Test: notification badge'), keywords: ['ai', 'chat', 'badge', 'notification', 'count', 'test'] },
            ],
            render(os) {
                const layout = {
                    container: {
                        className: 'cp-customizer',
                        style: 'margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:100%;box-sizing:border-box;',
                        subs: [{
                            block: {
                                style: 'max-width:1024px;width:100%;',
                                subs: [
                                    { block: { className: 'h1', html: _('AI Chat') } },
                                    { block: { className: 'p',  html: _('Configure the AI Chat taskbar icon (UI shell — no backend yet)') } },
                                    { block: { className: 'line' } },
                                    { block: {
                                        id: 'aichat-enabled',
                                        style: 'display:contents;',
                                        search: { label: () => _('Show icon in taskbar'), keywords: ['ai', 'chat', 'taskbar', 'icon', 'show', 'hide'] },
                                        subs: [ os.ui.label(_('Show icon in taskbar'), 'cp-aichat-enabled', os.ui.check({ id: 'cp-aichat-enabled', checked: _config.enabled })) ]
                                    }},
                                    { block: { className: 'line' } },
                                    { block: {
                                        id: 'aichat-pulse',
                                        style: 'display:contents;',
                                        search: { label: () => _('Test: thinking pulse'), keywords: ['ai', 'chat', 'pulse', 'test'] },
                                        subs: [ os.ui.label(_('Test: thinking pulse'), 'cp-aichat-pulse', os.ui.check({ id: 'cp-aichat-pulse', checked: _config.testPulse })) ]
                                    }},
                                    { block: { className: 'line' } },
                                    { block: {
                                        id: 'aichat-badge',
                                        style: 'display:contents;',
                                        search: { label: () => _('Test: notification badge'), keywords: ['ai', 'chat', 'badge', 'test'] },
                                        subs: [ os.ui.label(_('Test: notification badge (0 = hidden)'), 'cp-aichat-badge',
                                            `<input type="number" id="cp-aichat-badge" min="0" max="99" value="${_config.testBadge}" class="def" style="width:80px;">`) ]
                                    }},
                                ]
                            }
                        }]
                    }
                };

                const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'aichat' }).render();

                setTimeout(() => {
                    $('#cp-aichat-enabled').on('change', function () { os.desktop.aiChat.setEnabled(this.checked); });
                    $('#cp-aichat-pulse').on('change', function () { os.desktop.aiChat.setActive(this.checked); });
                    $('#cp-aichat-badge').on('input', function () { os.desktop.aiChat.setBadge(parseInt(this.value, 10) || 0); });
                }, 0);

                return html;
            }
        }
    });
}

function _injectCSS() {
    _os.addCSS("aichat-system", _os.config.local.ComponentsRoot + "aichat.css", true);
}
