/**
 * @file mail/mail_data.js
 * @description Mail window logic for Sandstorm OS.
 *
 * Exports `startMenuTab(os)` (compact start-menu tab config) and
 * `data(os)` — the main window builder called by `mail.js` after the
 * HTML shell is in the DOM. Data is fetched via `mail_api.js`
 * (backend-first, `data.json` fallback).
 *
 * @module program/mail/mail_data
 */

// ── startMenuTab ─────────────────────────────────────────────────────────────
// Returns a compact tab config for the start menu. No API calls here — the tab
// shows a static "open mail" button so startup stays instant.

export function startMenuTab(os) {
    function t(s) { return typeof _ === 'function' ? _(s) : s; }

    return {
        id:    'mail',
        title: () => t('Mail'),
        icon:  '#ic-mail',
        tab: function () {
            return '<div style="padding:14px;color:var(--theme-fontcolor,#fff);">' +
                '<div id="mail-tab-list" style="margin-bottom:10px;font-size:12px;opacity:.75;">' +
                    t('Loading…') +
                '</div>' +
                '<button class="aero-button-m" onclick="window.app&&app.program&&app.program.start(\'mail\')" style="font-size:11px;padding:5px 14px;width:100%;">' +
                    t('Open Mail') +
                '</button>' +
            '</div>';
        },
        callback: function (containerEl) {
            if (!containerEl) return;
            // Populate the tab list from cached API data once loaded
            var listEl = containerEl.querySelector('#mail-tab-list');
            if (!listEl) return;
            var tryRender = function () {
                var mod = window.app && app.mail;
                if (!mod || !mod._api) { setTimeout(tryRender, 300); return; }
                var cache = mod._api.getCache();
                if (!cache) { setTimeout(tryRender, 300); return; }
                var inbox = cache.emails.filter(function (e) { return e.folder === 'inbox'; }).slice(0, 3);
                listEl.innerHTML = inbox.length
                    ? inbox.map(function (e) {
                        return '<div style="padding:6px 8px;border-radius:5px;margin-bottom:3px;background:rgba(255,255,255,0.07);cursor:pointer;overflow:hidden;" onclick="app.program.start(\'mail\')">' +
                            '<div style="font-weight:' + (e.read ? 400 : 600) + ';font-size:12px;">' + e.from + '</div>' +
                            '<div style="font-size:11px;opacity:.7;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">' + e.subject + '</div>' +
                        '</div>';
                    }).join('')
                    : '<div style="opacity:.5;font-size:12px;">' + t('No messages') + '</div>';
            };
            tryRender();
        }
    };
}

// ── data (all window logic) ───────────────────────────────────────────────────
// Called by the { script } node in mail.js body() — same pattern as calc/notepad.
// os = app (the global app object passed by body.js _executeModuleFunction).

export async function data(os) {

    var instanceId = null;
    var containers = document.querySelectorAll('.mail-layout[id^="mail-"]');
    for (var ci = containers.length - 1; ci >= 0; ci--) {
        if (!containers[ci]._mailInit) { instanceId = containers[ci].id; break; }
    }
    if (!instanceId) return;

    var containerEl = $('#' + instanceId)[0];
    if (!containerEl) return;
    containerEl._mailInit = true;   // prevent double-init on multi-start

    // ── Load API ──────────────────────────────────────────────────────────────

    // Show loading state while data arrives
    var listEl = $('#' + instanceId + '-emailList')[0];
    if (listEl) listEl.innerHTML = '<div style="padding:40px 16px;text-align:center;opacity:.5;color:var(--theme-fontcolor);">Loading…</div>';

    var api;
    try {
        var _root = (os.config && os.config.local && os.config.local.ProgramRoot) || '';
        var apiMod = await import(_root + 'mail/mail_api.js');
        api = apiMod.createApi(os);
    } catch (e) {
        if (os.dev) os.dev.error('mail: could not load mail_api.js', e);
        if (listEl) listEl.innerHTML = '<div style="padding:40px 16px;text-align:center;opacity:.5;color:var(--theme-fontcolor);">Failed to load mail</div>';
        return;
    }

    if (window.app && app.mail) app.mail._api = api;

    // ── State ─────────────────────────────────────────────────────────────────

    var currentFolder = 'inbox';
    var currentFilter = 'all';
    var currentSearch = '';
    var currentPage   = 0;
    var PAGE_SIZE     = 5;
    var selectedId    = null;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function el(suffix) { return $('#' + instanceId + '-' + suffix)[0]; }
    function t(s) { return typeof _ === 'function' ? _(s) : s; }
    function esc(s) {
        return app.util.escapeHtml(s);
    }
    function avatar(name) { return (name || '?')[0].toUpperCase(); }

    function getFilteredEmails() {
        var cache = api.getCache();
        if (!cache) return [];
        return cache.emails.filter(function (e) {
            if (e.folder !== currentFolder)            return false;
            if (currentFilter === 'unread'   && e.read)     return false;
            if (currentFilter === 'archived' && !e.archived) return false;
            if (currentSearch) {
                var q = currentSearch.toLowerCase();
                return (e.subject + e.from + e.preview).toLowerCase().indexOf(q) !== -1;
            }
            return true;
        });
    }

    // ── Email list ────────────────────────────────────────────────────────────

    function renderEmailList() {
        var list = el('emailList');
        if (!list) return;

        var filtered = getFilteredEmails();
        var total    = filtered.length;
        var start    = currentPage * PAGE_SIZE;
        var page     = filtered.slice(start, start + PAGE_SIZE);

        var pagePrevEl = el('pagePrev');
        var pageNextEl = el('pageNext');
        var pageInfoEl = el('pageInfo');
        if (pageInfoEl) pageInfoEl.textContent = total > 0
            ? (start + 1) + '–' + Math.min(start + PAGE_SIZE, total) + ' / ' + total
            : '0 / 0';
        if (pagePrevEl) pagePrevEl.disabled = currentPage === 0;
        if (pageNextEl) pageNextEl.disabled  = start + PAGE_SIZE >= total;

        if (page.length === 0) {
            list.innerHTML = '<div style="padding:40px 16px;text-align:center;opacity:.5;color:var(--theme-fontcolor);">' + t('No messages') + '</div>';
            return;
        }

        list.innerHTML = page.map(function (email) {
            return '<div class="email-item' + (email.id === selectedId ? ' selected' : '') + '" data-id="' + email.id + '">' +
                '<div class="email-avatar">' + avatar(email.from) + '</div>' +
                '<div class="email-content">' +
                    '<div class="email-header">' +
                        '<span class="email-sender" style="font-weight:' + (email.read ? 400 : 700) + '">' + esc(email.from) + '</span>' +
                        '<span class="email-date">' + esc(email.date) + '</span>' +
                    '</div>' +
                    '<div class="email-subject" style="font-weight:' + (email.read ? 400 : 600) + '">' + esc(email.subject) + '</div>' +
                    '<div class="email-preview">' + esc(email.preview) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        list.querySelectorAll('.email-item').forEach(function (item) {
            item.addEventListener('click', function () {
                openEmail(parseInt(item.getAttribute('data-id'), 10));
            });
        });
    }

    function openEmail(id) {
        selectedId = id;
        var cache  = api.getCache();
        var email  = cache && cache.emails.find(function (e) { return e.id === id; });
        if (!email) return;

        api.markRead(id);
        renderEmailList();
        renderEmailDetail(email);
        if (isMobile()) showDetail();
    }

    // ── Detail view ───────────────────────────────────────────────────────────

    function renderEmailDetail(email) {
        var subjectEl = el('detailSubject');
        var content   = el('detailContent');
        if (subjectEl) subjectEl.textContent = email.subject;
        if (!content)  return;

        var initials = (email.from || '?').split(' ')
            .map(function (w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase();
        var dateStr = esc(email.date) + (email.time ? ' ' + esc(email.time) : '');

        content.innerHTML =
            '<div class="message-block">' +
                '<div class="print-header">' +
                    esc(email.from) + ' (' + esc(email.email) + ') - ' + dateStr +
                '</div>' +
                '<div class="detail-info">' +
                    '<div class="detail-avatar">' + initials + '</div>' +
                    '<div>' +
                        '<div class="detail-meta">' +
                            '<h3 title="' + dateStr + '">' + esc(email.from) + '</h3>' +
                            '<p>' + esc(email.email) + '</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="page-margin">' +
                    '<div class="detail-body">' + email.body + '</div>' +
                '</div>' +
            '</div>';
    }

    function clearDetail() {
        selectedId = null;
        var subjectEl = el('detailSubject');
        var content   = el('detailContent');
        if (subjectEl) subjectEl.textContent = t('Select a message');
        if (content)   content.innerHTML = '';
    }

    // ── Compose ───────────────────────────────────────────────────────────────

    function showCompose(opts) {
        opts = opts || {};
        var subjectEl = el('detailSubject');
        var content   = el('detailContent');
        if (!content) return;
        if (subjectEl) subjectEl.textContent = t('New message');

        content.innerHTML =
            '<div class="page-margin">' +
                '<div style="display:flex;flex-direction:column;">' +
                    '<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #e5e7eb;padding:10px 0;">' +
                        '<span style="width:58px;font-size:13px;color:#666;flex-shrink:0;">' + t('To') + '</span>' +
                        '<input id="' + instanceId + '-cTo" type="text" value="' + esc(opts.to || '') + '"' +
                            ' style="flex:1;border:none;outline:none;font-size:14px;color:#111;background:transparent;">' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #e5e7eb;padding:10px 0;">' +
                        '<span style="width:58px;font-size:13px;color:#666;flex-shrink:0;">' + t('Subject') + '</span>' +
                        '<input id="' + instanceId + '-cSubject" type="text" value="' + esc(opts.subject || '') + '"' +
                            ' style="flex:1;border:none;outline:none;font-size:14px;font-weight:500;color:#111;background:transparent;">' +
                    '</div>' +
                    '<textarea id="' + instanceId + '-cBody" placeholder="' + t('Write your message…') + '"' +
                        ' style="border:none;outline:none;font-size:14px;line-height:1.75;color:#111;min-height:260px;resize:none;padding:14px 0;background:transparent;">' +
                        esc(opts.body || '') +
                    '</textarea>' +
                    '<div style="display:flex;gap:8px;padding:10px 0;">' +
                        '<button id="' + instanceId + '-cSend" class="reply-btn primary">' +
                            '<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
                                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>' +
                            '</svg>' +
                            t('Send') +
                        '</button>' +
                        '<button id="' + instanceId + '-cDiscard" class="reply-btn">' + t('Discard') + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var sendBtn    = $('#' + instanceId + '-cSend');
        var discardBtn = $('#' + instanceId + '-cDiscard');
        if (sendBtn.length)    sendBtn.on('click',    handleSend);
        if (discardBtn.length) discardBtn.on('click', clearDetail);

        if (isMobile()) showDetail();
    }

    function handleSend() {
        var toEl      = $('#' + instanceId + '-cTo')[0];
        var subjectEl = $('#' + instanceId + '-cSubject')[0];
        var bodyEl    = $('#' + instanceId + '-cBody')[0];

        if (!toEl || !toEl.value.trim()) {
            if (os.ui && os.ui.alert) {
                os.ui.alert({
                    title: t('Missing recipient'),
                    body: function () { return '<p>' + t('Please enter at least one recipient.') + '</p>'; }
                });
            }
            return;
        }

        var sendBtn = $('#' + instanceId + '-cSend')[0];
        if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = t('Sending…'); }

        api.sendEmail({
            to:        toEl.value.trim(),
            subject:   (subjectEl && subjectEl.value.trim()) || t('(no subject)'),
            body:      (bodyEl    && bodyEl.value)           || '',
            from:      'Me',
            fromEmail: 'me@example.com'
        }).then(function () {
            clearDetail();
            if (currentFolder === 'sent') renderEmailList();
        }).catch(function () {
            if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = t('Send'); }
        });
    }

    // ── Nav ───────────────────────────────────────────────────────────────────

    var navItemsEl = el('navItems');
    if (navItemsEl) {
        navItemsEl.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () {
                navItemsEl.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('active'); });
                item.classList.add('active');
                currentFolder = item.getAttribute('data-nav') || 'inbox';
                currentPage   = 0;
                clearDetail();
                renderEmailList();
                if (isMobile()) showContent();
            });
        });
    }

    // ── Compose button ────────────────────────────────────────────────────────

    var composeBtn = containerEl.querySelector('.compose-btn');
    if (composeBtn) composeBtn.addEventListener('click', function () { showCompose(); });

    // ── Reply / Forward ───────────────────────────────────────────────────────

    var replyBtn = el('replyBtn');
    if (replyBtn) {
        replyBtn.addEventListener('click', function () {
            if (!selectedId) return;
            var cache = api.getCache();
            var email = cache && cache.emails.find(function (e) { return e.id === selectedId; });
            if (email) showCompose({ to: email.email, subject: 'Re: ' + email.subject });
        });
    }

    var forwardBtn = el('forwardBtn');
    if (forwardBtn) {
        forwardBtn.addEventListener('click', function () {
            if (!selectedId) return;
            var cache = api.getCache();
            var email = cache && cache.emails.find(function (e) { return e.id === selectedId; });
            if (email) showCompose({
                subject: 'Fwd: ' + email.subject,
                body:    '\n\n---------- Forwarded message ----------\nFrom: ' + email.from + '\n\n' + email.body.replace(/<[^>]+>/g, '')
            });
        });
    }

    // ── Search ────────────────────────────────────────────────────────────────

    var searchInput = el('search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            currentSearch = searchInput.value;
            currentPage   = 0;
            renderEmailList();
        });
    }

    // ── Filter tabs ───────────────────────────────────────────────────────────

    containerEl.querySelectorAll('.filter-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            containerEl.querySelectorAll('.filter-tab').forEach(function (tb) { tb.classList.remove('active'); });
            tab.classList.add('active');
            currentFilter = tab.getAttribute('data-filter') || 'all';
            currentPage   = 0;
            renderEmailList();
        });
    });

    // ── Pagination ────────────────────────────────────────────────────────────

    var pagePrevBtn = el('pagePrev');
    var pageNextBtn = el('pageNext');
    if (pagePrevBtn) {
        pagePrevBtn.addEventListener('click', function () {
            if (currentPage > 0) { currentPage--; renderEmailList(); }
        });
    }
    if (pageNextBtn) {
        pageNextBtn.addEventListener('click', function () {
            if ((currentPage + 1) * PAGE_SIZE < getFilteredEmails().length) { currentPage++; renderEmailList(); }
        });
    }

    // ── ResizeObserver (responsive layout) ───────────────────────────────────

    if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var w         = entries[i].contentRect.width;
                var wasMobile = containerEl.classList.contains('layout-mobile');
                containerEl.classList.toggle('layout-mobile',  w <= 768);
                containerEl.classList.toggle('layout-compact', w > 768 && w <= 1024);
                if (wasMobile && w > 768) {
                    [el('nav'), el('content'), el('detail')].forEach(function (col) {
                        if (col) col.classList.remove('is-full', 'is-hidden');
                    });
                }
            }
        });
        ro.observe(containerEl);
        containerEl._ro = ro;
    }

    // ── Mobile columns ────────────────────────────────────────────────────────

    function isMobile() { return containerEl.classList.contains('layout-mobile'); }

    function setColumns(ns, cs, ds) {
        [[el('nav'), ns], [el('content'), cs], [el('detail'), ds]].forEach(function (p) {
            var col = p[0]; var state = p[1];
            if (!col) return;
            col.classList.remove('is-full', 'is-hidden');
            if (state === 'full')   col.classList.add('is-full');
            if (state === 'hidden') col.classList.add('is-hidden');
        });
    }

    function showNav()     { setColumns('full',   'hidden', 'hidden'); }
    function showContent() { setColumns('hidden', 'full',   'hidden'); }
    function showDetail()  { setColumns('hidden', 'hidden', 'full');   }

    var backContent = el('backContent');
    var backDetail  = el('backDetail');
    var listBack    = el('listBack');
    var contentBack = el('contentBack');
    var detailBack  = el('detailBack');
    var navBack     = el('navBack');
    if (backContent) backContent.addEventListener('click', showContent);
    if (backDetail)  backDetail.addEventListener('click',  showDetail);
    if (listBack)    listBack.addEventListener('click',    showNav);
    if (contentBack) contentBack.addEventListener('click', showContent);
    if (detailBack)  detailBack.addEventListener('click',  showContent);
    if (navBack)     navBack.addEventListener('click',     showNav);

    // ── moreBtn context menu (app.ui.menu.create) ─────────────────────────────

    if (window.app && app.ui && app.ui.menu && el('moreBtn')) {
        app.ui.menu.create({
            selector:  '#' + instanceId + '-moreBtn',
            direction: 'down,right',
            action: 'click',
            zindex:    9000,
            menuItem: [
                {
                    title:    t('Reply'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>',
                    callback: function () {
                        if (!selectedId) return;
                        var cache = api.getCache();
                        var email = cache && cache.emails.find(function (e) { return e.id === selectedId; });
                        if (email) showCompose({ to: email.email, subject: 'Re: ' + email.subject });
                    }
                },
                {
                    title:    t('Forward'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
                    callback: function () {
                        if (!selectedId) return;
                        var cache = api.getCache();
                        var email = cache && cache.emails.find(function (e) { return e.id === selectedId; });
                        if (email) showCompose({ subject: 'Fwd: ' + email.subject, body: '\n\n---------- Forwarded message ----------\nFrom: ' + email.from + '\n\n' + email.body.replace(/<[^>]+>/g, '') });
                    }
                },
                '---',
                {
                    title:    t('Archive'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"/></svg>',
                    callback: function () {
                        if (!selectedId) return;
                        api.archiveEmail(selectedId).then(function () {
                            clearDetail();
                            renderEmailList();
                        });
                    }
                },
                {
                    title:    t('Delete'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
                    callback: function () {
                        if (!selectedId) return;
                        api.deleteEmail(selectedId).then(function () {
                            clearDetail();
                            renderEmailList();
                        });
                    }
                },
                '---',
                {
                    title:    t('New message'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>',
                    callback: function () { showCompose(); }
                },
                {
                    title:    t('Print'),
                    icon:     '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>',
                    callback: function () { window.print(); }
                }
            ]
        });
    }

    // ── Initial load ──────────────────────────────────────────────────────────

    try {
        await api.listEmails();
    } catch (e) {
        await api.load().catch(function () {});
    }
    renderEmailList();

    // Auto-open the first (most recent) email in the current folder
    var initCache = api.getCache();
    if (initCache && initCache.emails) {
        var firstEmail = initCache.emails.find(function (e) { return e.folder === currentFolder; });
        if (firstEmail) openEmail(firstEmail.id);
    }
}
