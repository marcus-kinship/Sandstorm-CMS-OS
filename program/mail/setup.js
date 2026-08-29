/**
 * @file mail/setup.js
 * @description Boot-time registration for the Mail program.
 *
 * Builds `app.mail` (including `startMenuEmailTab()`, called unconditionally
 * by `startmenu.js`'s `createEmailTab()` at boot regardless of whether the
 * Mail window is ever opened), SVG icons, and program registration — all
 * boot-critical. Also eagerly loads `mail_data.js` here (not just lazily
 * inside `start()`) so the start-menu email tab has real data immediately.
 * The window shell lives in `mail.js`, lazy-loaded by `app.program.open()`
 * the first time the user actually opens the program.
 *
 * @module program/mail/setup
 */

export async function setup(os) {

    if (!window.app)      window.app = {};
    if (!window.app.mail) window.app.mail = {};

    app.mail.startMenuEmailTab = function () {
        return {
            id:       'mail',
            title:    () => _('Messages'),
            icon:     '#ic-msg',
            icontype: 'svg',
            tab: function () {
                const css = `
                    .mail-gui{display:flex;flex-direction:column;padding-top:18px;padding-left:32px;padding-right:32px;}
                    .mail-header{display:flex;align-items:center;gap:10px;}
                    .mail-gui .mh-icon{width:32px;height:32px;border-radius:10px;background-color:var(--theme-backgruondcolorc,#00000040);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;border:1px solid rgba(255,255,255,0.03);color:#fff;transition:background-color 0.2s ease;}
                    .mail-gui .mh-icon:hover{background-color:var(--theme-backgruondcolorc,#00000060);}
                    .mail-gui .mh-icon.active-on{background:var(--theme-backgruondcolore,#00000080);}
                    .mail-gui .mh-icon svg{width:20px;height:20px;}
                    .mail-body{display:flex;flex-direction:column;gap:10px;}
                    .submenu{position:relative;transition:all 1s ease-in;}
                    .submenu *{transition:all 100ms ease-in;}
                    .submenu .mobile-btn{display:none;font-size:28px;cursor:pointer;padding:4px 10px;color:#fff;}
                    .submenu .mail-snav{display:flex;gap:10px;align-items:center;justify-content:flex-end;}
                    @media (max-width:515px){
                        .submenu{display:flex;gap:10px;align-items:center;justify-content:flex-end;}
                        .submenu .mail-snav{display:none;flex-direction:column;position:absolute;top:44px;right:0;border-radius:10px;z-index:50;min-width:180px;background:linear-gradient(144deg,var(--theme-backgruondcolora,rgba(37,37,37,0.3)) 0%,var(--theme-backgruondcolorb,rgba(10,10,10,0.2)) 47%);box-shadow:1px 1px 1px #ffffff29,-1px -1px 1px #ffffff29;padding:6px;backdrop-filter:blur(10px);}
                        .submenu .mobile-btn{display:block;}
                        .submenu.open .mail-snav{display:block;}
                    }
                    .submenu .sbtn{padding:0px 8px;padding-right:8px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,1);line-height:34px;}
                    .submenu .sbtn:hover{background-color:var(--theme-backgruondcolorc,#00000040);animation:fadeInOut 3s ease infinite;animation-delay:1s;}
                    .submenu .sbtn.active{background-color:var(--theme-backgruondcolorc,#00000040);color:#fff;}
                    .mail-list{display:flex;flex-direction:column;gap:12px;color:#fff;}
                    .mail-item{display:flex;gap:12px;padding:12px;background:var(--theme-backgruondcolorc,#00000040);border-radius:8px;opacity:0;animation:fadein 1800ms forwards ease-in-out;animation-delay:var(--transition-delay,0s);cursor:pointer;}
                    .mail-item:hover{background:var(--theme-backgruondcolorc,#00000060);}
                    .avatar{width:44px;height:44px;border-radius:50%;background:var(--theme-backgruondcolorc,#00000040);display:flex;align-items:center;justify-content:center;font-weight:bold;}
                    .mail-gui .row{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px;}
                    .mail-gui .col{flex:1;}
                    .filter-menu{position:absolute;display:none;z-index:8050;min-width:210px;background:linear-gradient(144deg,var(--theme-backgruondcolora,rgba(37,37,37,0.3)) 0%,var(--theme-backgruondcolorb,rgba(10,10,10,0.2)) 47%);box-shadow:1px 1px 1px #ffffff29,-1px -1px 1px #ffffff29;padding:6px;backdrop-filter:blur(10px);padding-top:8px;border-radius:10px;top:50px;right:0;}
                    .filter-menu.show{display:block;}
                    .filter-menu-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;color:#fff;font-size:12px;transition:background-color 1s ease;background-color:#ffffff00;}
                    .filter-menu-item:hover{background-color:#00000040;animation:fadeInOut 3s ease infinite;animation-delay:1s;}
                    .filter-menu-item .menu-icon{width:18px;height:18px;display:flex;align-items:center;justify-content:center;}
                    .filter-menu-item .menu-icon svg{width:18px;height:18px;}
                    .filter-menu-item .menu-text{flex:1;display:flex;flex-direction:column;}
                    .filter-menu-item .menu-title{font-weight:500;line-height:1.2;}
                    .filter-menu-item .menu-alt{font-size:11px;opacity:0.7;line-height:1.2;margin-top:2px;}
                    .compose-form{padding:20px 0;}
                    .compose-form input,.compose-form textarea{padding:12px;border-radius:8px;background:var(--theme-backgruondcolorc,#00000040);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:12px;width:100%;box-sizing:border-box;}
                    .compose-form textarea{resize:vertical;min-height:200px;font-family:inherit;}
                    .compose-form label{color:#fff;font-size:12px;opacity:0.9;margin-bottom:6px;display:block;}
                    @keyframes fadein{from{opacity:0;}to{opacity:1;}}
                    @media (max-width: 700px) { .mail-gui{padding-left:28px;padding-right:28px;} }
                    @media (max-width: 600px) { .mail-gui{padding-left:16px;padding-right:16px;} }
                    @media (max-width: 425px) { .mail-gui{padding-left:10px;padding-right:10px;} }
                    @media (max-width: 400px) { .mail-gui{padding-left:6px;padding-right:6px;} }
                `;
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);

                let mailItems = '';
                for (let i = 0; i < 4; i++) {
                    mailItems += `
                        <div class="mail-item" style="--transition-delay: ${i * 0.3}s;">
                            <div class="avatar">JC</div>
                            <div class="meta">
                                <div class="from">Jackson Cole</div>
                                <div class="sub">Welcome to your workspace!</div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="mail-gui">
                        <div class="row">
                            <div class="col">
                                <div class="mail-header">
                                    <div class="mh-icon active-on" title="${_("Inbox")}" data-panel="inbox">
                                        <svg><use href="#ic-inbox"/></svg>
                                    </div>
                                    <div class="mh-icon" title="${_("Contacts")}" data-panel="contacts">
                                        <svg><use href="#ic-contacts"/></svg>
                                    </div>
                                    <div class="mh-icon" title="${_("Compose")}" data-panel="compose">
                                        <svg><use href="#ic-send"/></svg>
                                    </div>
                                </div>
                            </div>
                            <div class="col">
                                <div class="submenu">
                                    <div class="mobile-btn">⋯</div>
                                    <div class="mail-snav">
                                        <div class="sbtn active" data-sub="incoming" title="${_("View all incoming messages")}">${_("Incoming")}</div>
                                        <div class="sbtn" data-sub="sent" title="${_("View all emails you have sent")}">${_("Sent")}</div>
                                        <div class="sbtn" data-sub="drafts" title="${_("View emails saved as drafts")}">${_("Drafts")}</div>
                                        <div class="sbtn" data-sub="filter" title="${_("Manage filters and sorting options")}">${_("Filter")}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mail-body">
                            <div class="mail-list">${mailItems}</div>
                        </div>
                    </div>
                `;
            },
            callback: function () {
                app.api.get(os.config.local.ProgramRoot + 'mail/mail_preview_data.json')
                    .success(data => _initEmailTab(data.mailData, data.contactsData));
            }
        };
    };

    // Bound to the fetched preview data — everything the start-menu email tab
    // needs to render/filter/switch panels, moved out of callback() so the
    // mock data can live in mail_preview_data.json instead of inline here.
    function _initEmailTab(mailData, contactsData) {
                let currentMailType = 'incoming';
                let currentPanel = 'inbox';
                let currentSortOrder = null;

                function createFilterMenu(config) {
                    const menu = document.createElement("div");
                    menu.className = config.class || "filter-menu";
                    menu.style.zIndex = config.zindex || 100;

                    config.menuItems.forEach(item => {
                        const menuItem = document.createElement("div");
                        menuItem.className = "filter-menu-item";

                        const textWrapper = document.createElement("div");
                        textWrapper.className = "menu-text";

                        const title = document.createElement("div");
                        title.className = "menu-title";
                        title.textContent = item.title;
                        textWrapper.appendChild(title);

                        if (item.alt) {
                            const alt = document.createElement("div");
                            alt.className = "menu-alt";
                            alt.textContent = item.alt;
                            textWrapper.appendChild(alt);
                        }

                        menuItem.appendChild(textWrapper);
                        menuItem.addEventListener("click", (e) => {
                            e.stopPropagation();
                            if (typeof item.callback === "function") item.callback();
                            menu.classList.remove("show");
                        });
                        menu.appendChild(menuItem);
                    });

                    return menu;
                }

                function positionMenu(menu, button, direction) {
                    const rect = button.getBoundingClientRect();
                    menu.style.top = "auto"; menu.style.bottom = "auto";
                    menu.style.left = "auto"; menu.style.right = "auto";
                    switch (direction.toLowerCase()) {
                        case "top": menu.style.bottom = (window.innerHeight - rect.top + 10) + "px"; menu.style.left = rect.left + "px"; break;
                        case "bottom": menu.style.top = (rect.bottom + 10) + "px"; menu.style.right = (window.innerWidth - rect.right) + "px"; break;
                        case "left": menu.style.top = rect.top + "px"; menu.style.right = (window.innerWidth - rect.left + 10) + "px"; break;
                        case "right": menu.style.top = rect.top + "px"; menu.style.left = (rect.right + 10) + "px"; break;
                        default: menu.style.top = (rect.bottom + 10) + "px"; menu.style.right = (window.innerWidth - rect.right) + "px";
                    }
                }

                function sortMailItems(items, sortBy, order) {
                    const sorted = [...items];
                    if (sortBy === 'date') sorted.sort((a, b) => order === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
                    else if (sortBy === 'name') { sorted.sort((a, b) => { const nA = a.from || a.to || '', nB = b.from || b.to || ''; return order === 'asc' ? nA.localeCompare(nB) : nB.localeCompare(nA); }); }
                    return sorted;
                }

                function renderContactsList(items) {
                    const mailListContainer = document.querySelector('.mail-list');
                    if (!mailListContainer) return;
                    mailListContainer.innerHTML = items.map((item, index) => `
                        <div class="mail-item" style="--transition-delay: ${index * 0.3}s;">
                            <div class="avatar">${app.util.escapeHtml(item.avatar)}</div>
                            <div class="meta"><div class="from">${app.util.escapeHtml(item.name)}</div><div class="sub">${app.util.escapeHtml(item.email)} • ${app.util.escapeHtml(item.company)}</div></div>
                        </div>
                    `).join('');
                }

                function renderComposeForm() {
                    const mailBodyContainer = document.querySelector('.mail-body');
                    if (!mailBodyContainer) return;
                    mailBodyContainer.innerHTML = `
                        <div class="compose-form" style="opacity:0;animation:fadein 800ms forwards ease-in-out;">
                            <div style="display:flex;flex-direction:column;gap:16px;">
                                <div><label>${_("To")}</label><input type="email" id="compose-to" placeholder="${_("recipient@example.com")}"></div>
                                <div><label>${_("Subject")}</label><input type="text" id="compose-subject" placeholder="${_("Enter subject")}"></div>
                                <div><label>${_("Message")}</label><textarea id="compose-message" placeholder="${_("Write your message here...")}" rows="8"></textarea></div>
                                <div style="display:flex;gap:12px;justify-content:flex-end;">
                                    <button class="aero-button" id="compose-send">${_("Send")}<div class="after pulse"></div></button>
                                </div>
                            </div>
                        </div>
                    `;
                    const sendBtn = $('#compose-send');
                    if (sendBtn.length) {
                        sendBtn.on('click', function () {
                            const to = $('#compose-to').val();
                            const subject = $('#compose-subject').val();
                            const message = $('#compose-message').val();
                            if (!to || !subject || !message) { alert(_("Please fill in all fields")); return; }
                            alert(_("Message sent!"));
                            $('#compose-to').val('');
                            $('#compose-subject').val('');
                            $('#compose-message').val('');
                        });
                    }
                }

                function renderMailList(items, type) {
                    const mailListContainer = document.querySelector('.mail-list');
                    if (!mailListContainer) return;
                    mailListContainer.innerHTML = items.map((item, index) => {
                        let fromText = app.util.escapeHtml(item.from);
                        let subText = app.util.escapeHtml(item.subject);
                        if (type === 'sent') fromText = `To: ${app.util.escapeHtml(item.to)}`;
                        else if (type === 'drafts') subText = `<span style="color:#aaa;font-style:italic;">${app.util.escapeHtml(item.subject)}</span>`;
                        return `
                            <div class="mail-item" style="--transition-delay: ${index * 0.3}s;">
                                <div class="avatar" title="${app.util.escapeHtml(item.date)}">${app.util.escapeHtml(item.avatar)}</div>
                                <div class="meta"><div class="from">${fromText}</div><div class="sub">${subText}</div></div>
                            </div>
                        `;
                    }).join('');
                }

                function handleFilterClick(button) {
                    let filterMenu = document.querySelector('.filter-menu');
                    if (filterMenu) {
                        if (filterMenu.classList.contains('show')) { filterMenu.classList.remove('show'); return; }
                        if (filterMenu._cleanup) filterMenu._cleanup();
                        filterMenu.remove(); filterMenu = null;
                    }
                    const filterConfig = {
                        class: 'filter-menu', zindex: 8050,
                        menuItems: [
                            { title: _('Date Ascending'), alt: _('Oldest first'), callback: () => { currentSortOrder = { by: 'date', order: 'asc' }; renderMailList(sortMailItems(mailData[currentMailType], 'date', 'asc'), currentMailType); } },
                            { title: _('Date Descending'), alt: _('Newest first'), callback: () => { currentSortOrder = { by: 'date', order: 'desc' }; renderMailList(sortMailItems(mailData[currentMailType], 'date', 'desc'), currentMailType); } },
                            { title: _('Name Ascending'), alt: _('A to Z'), callback: () => { currentSortOrder = { by: 'name', order: 'asc' }; renderMailList(sortMailItems(mailData[currentMailType], 'name', 'asc'), currentMailType); } },
                            { title: _('Name Descending'), alt: _('Z to A'), callback: () => { currentSortOrder = { by: 'name', order: 'desc' }; renderMailList(sortMailItems(mailData[currentMailType], 'name', 'desc'), currentMailType); } }
                        ]
                    };
                    filterMenu = createFilterMenu(filterConfig);
                    document.body.appendChild(filterMenu);
                    setTimeout(() => { positionMenu(filterMenu, button, 'bottom'); filterMenu.classList.add('show'); }, 10);
                    const closeFilterMenu = (e) => { if (!filterMenu.contains(e.target) && !button.contains(e.target)) filterMenu.classList.remove('show'); else if (button.contains(e.target)) filterMenu.classList.remove('show'); };
                    const handleResize = () => { if (filterMenu.classList.contains('show')) positionMenu(filterMenu, button, 'bottom'); };
                    document.addEventListener('click', closeFilterMenu);
                    window.addEventListener('resize', handleResize);
                    filterMenu._cleanup = () => { document.removeEventListener('click', closeFilterMenu); window.removeEventListener('resize', handleResize); };
                }

                function handleContactsFilterClick(button) {
                    let filterMenu = document.querySelector('.filter-menu');
                    if (filterMenu) {
                        if (filterMenu.classList.contains('show')) { filterMenu.classList.remove('show'); return; }
                        if (filterMenu._cleanup) filterMenu._cleanup();
                        filterMenu.remove(); filterMenu = null;
                    }
                    const filterConfig = {
                        class: 'filter-menu', zindex: 8050,
                        menuItems: [
                            { title: _('Name Ascending'), alt: _('A to Z'), callback: () => renderContactsList([...contactsData.all].sort((a, b) => a.name.localeCompare(b.name))) },
                            { title: _('Name Descending'), alt: _('Z to A'), callback: () => renderContactsList([...contactsData.all].sort((a, b) => b.name.localeCompare(a.name))) },
                            { title: _('Email Ascending'), alt: _('A to Z'), callback: () => renderContactsList([...contactsData.all].sort((a, b) => a.email.localeCompare(b.email))) },
                            { title: _('Company'), alt: _('Group by company'), callback: () => renderContactsList([...contactsData.all].sort((a, b) => a.company.localeCompare(b.company))) }
                        ]
                    };
                    filterMenu = createFilterMenu(filterConfig);
                    document.body.appendChild(filterMenu);
                    setTimeout(() => { positionMenu(filterMenu, button, 'bottom'); filterMenu.classList.add('show'); }, 10);
                    const closeFilterMenu = (e) => { if (!filterMenu.contains(e.target) && !button.contains(e.target)) filterMenu.classList.remove('show'); else if (button.contains(e.target)) filterMenu.classList.remove('show'); };
                    const handleResize = () => { if (filterMenu.classList.contains('show')) positionMenu(filterMenu, button, 'bottom'); };
                    document.addEventListener('click', closeFilterMenu);
                    window.addEventListener('resize', handleResize);
                    filterMenu._cleanup = () => { document.removeEventListener('click', closeFilterMenu); window.removeEventListener('resize', handleResize); };
                }

                function setupSubmenuEvents() {
                    const submenu = document.querySelector('.submenu');
                    const mobileBtn = document.querySelector('.mobile-btn');
                    const menuDiv = document.querySelector('.mail-snav');
                    if (menuDiv) {
                        menuDiv.addEventListener('click', function (e) {
                            const button = e.target.closest('.sbtn');
                            if (!button) return;
                            const subType = button.getAttribute('data-sub');
                            document.querySelectorAll('.sbtn').forEach(btn => btn.classList.remove('active'));
                            button.classList.add('active');
                            if (subType === 'filter') handleFilterClick(button);
                            else if (mailData[subType]) { currentMailType = subType; currentSortOrder = null; renderMailList(mailData[subType], subType); }
                            if (window.innerWidth <= 515 && submenu) submenu.classList.remove('open');
                        });
                    }
                    if (mobileBtn && submenu) {
                        mobileBtn.addEventListener('click', function (e) { e.stopPropagation(); submenu.classList.toggle('open'); });
                    }
                    document.addEventListener('click', function (e) {
                        if (window.innerWidth <= 515 && submenu && !submenu.contains(e.target) && submenu.classList.contains('open')) submenu.classList.remove('open');
                    });
                }

                function setupContactsSubmenuEvents() {
                    const submenu = document.querySelector('.submenu');
                    const mobileBtn = document.querySelector('.mobile-btn');
                    const menuDiv = document.querySelector('.mail-snav');
                    if (menuDiv) {
                        menuDiv.addEventListener('click', function (e) {
                            const button = e.target.closest('.sbtn');
                            if (!button) return;
                            const subType = button.getAttribute('data-sub');
                            document.querySelectorAll('.sbtn').forEach(btn => btn.classList.remove('active'));
                            button.classList.add('active');
                            if (subType === 'filter-contacts') handleContactsFilterClick(button);
                            else if (subType === 'all-contacts') renderContactsList(contactsData.all);
                            if (window.innerWidth <= 515 && submenu) submenu.classList.remove('open');
                        });
                    }
                    if (mobileBtn && submenu) {
                        mobileBtn.addEventListener('click', function (e) { e.stopPropagation(); submenu.classList.toggle('open'); });
                    }
                }

                function updateMenuForPanel(panel) {
                    const menuDiv = document.querySelector('.mail-snav');
                    if (!menuDiv) return;
                    if (panel === 'inbox') {
                        menuDiv.innerHTML = `
                            <div class="sbtn active" data-sub="incoming" title="${_("View all incoming messages")}">${_("Incoming")}</div>
                            <div class="sbtn" data-sub="sent" title="${_("View all emails you have sent")}">${_("Sent")}</div>
                            <div class="sbtn" data-sub="drafts" title="${_("View emails saved as drafts")}">${_("Drafts")}</div>
                            <div class="sbtn" data-sub="filter" title="${_("Manage filters and sorting options")}">${_("Filter")}</div>
                        `;
                        setupSubmenuEvents();
                    } else if (panel === 'contacts') {
                        menuDiv.innerHTML = `
                            <div class="sbtn active" data-sub="all-contacts" title="${_("View all contacts")}">${_("All Contacts")}</div>
                            <div class="sbtn" data-sub="filter-contacts" title="${_("Sort contacts")}">${_("Filter")}</div>
                        `;
                        setupContactsSubmenuEvents();
                    }
                }

                function updateContentForPanel(panel) {
                    const mailBody = document.querySelector('.mail-body');
                    if (!mailBody) return;
                    if (panel === 'inbox') {
                        mailBody.innerHTML = '<div class="mail-list"></div>';
                        currentMailType = 'incoming';
                        renderMailList(mailData.incoming, 'incoming');
                    } else if (panel === 'contacts') {
                        mailBody.innerHTML = '<div class="mail-list"></div>';
                        renderContactsList(contactsData.all);
                    } else if (panel === 'compose') {
                        renderComposeForm();
                    }
                }

                function setupHeaderIconEvents() {
                    const headerIcons = document.querySelectorAll('.mh-icon');
                    headerIcons.forEach(icon => {
                        icon.addEventListener('click', function () {
                            const panel = this.getAttribute('data-panel');
                            headerIcons.forEach(i => i.classList.remove('active-on'));
                            this.classList.add('active-on');
                            currentPanel = panel;
                            const submenu = document.querySelector('.submenu');
                            if (submenu) submenu.style.display = panel === 'compose' ? 'none' : '';
                            updateMenuForPanel(panel);
                            updateContentForPanel(panel);
                        });
                    });
                }

                setTimeout(() => {
                    updateMenuForPanel('inbox');
                    updateContentForPanel('inbox');
                    setupHeaderIconEvents();
                    const firstHeaderIcon = document.querySelector('.mh-icon');
                    if (firstHeaderIcon) firstHeaderIcon.classList.add('active-on');
                }, 100);
    }

    // ── SVG icons ────────────────────────────────────────────────────────────

    os.svg.global.load({ id: 'ic-mail', viewBox: "0 0 512 389", content: `<g>
        <path fill="#1392de" fill-rule="evenodd" d="M32.461441,8.0000005 H479.53856 C493.36742,8.0000005 504,18.951636 504,32.142379 V361.09556 c0,13.50981 -10.63258,24.46144 -24.46144,24.46144 H32.461441 c-13.509805,0 -24.4614405,-10.95163 -24.4614405,-24.46144 V32.142379 c0,-13.190743 10.9516355,-24.1423785 24.4614405,-24.1423785 z"/>
        <path fill="#1ea2e5" fill-rule="evenodd" d="M492.73922,381.88921 8.0000005,52.532228 V32.46144 c0,-13.509804 10.9516355,-24.4614395 24.4614405,-24.4614395 H479.53856 C493.36742,8.0000005 504,18.951636 504,32.46144 v328.31507 c0,9.10071 -4.31123,16.7979 -11.26078,21.1127 z"/>
        <path fill="#50e6ff" fill-rule="evenodd" d="M32.461441,8.0000005 H479.53856 C493.36742,8.0000005 504,18.951636 504,32.46144 V52.219193 L283.8116,201.9544 c0,0 -10.90131,8.86283 -27.65206,8.86283 -16.75078,0 -27.97114,-8.86283 -27.97114,-8.86283 L8.0000005,52.219193 V32.46144 c0,-13.509804 10.9516355,-24.4614395 24.4614405,-24.4614395 z"/>
    </g>` });

    os.svg.global.load({ id: 'ic-send', viewBox: "0 0 640 640", content: `<path fill="#ffffff" d="M568.4 37.7C578.2 34.2 589 36.7 596.4 44C603.8 51.3 606.2 62.2 602.7 72L424.7 568.9C419.7 582.8 406.6 592 391.9 592C377.7 592 364.9 583.4 359.6 570.3L295.4 412.3C290.9 401.3 292.9 388.7 300.6 379.7L395.1 267.3C400.2 261.2 399.8 252.3 394.2 246.7C388.6 241.1 379.6 240.7 373.6 245.8L261.2 340.1C252.1 347.7 239.6 349.7 228.6 345.3L70.1 280.8C57 275.5 48.4 262.7 48.4 248.5C48.4 233.8 57.6 220.7 71.5 215.7L568.4 37.7z"/>` });

    os.svg.global.load({ id: 'ic-contacts', viewBox: "0 0 640 640", content: `<path fill="#ffffff" d="M160 64C124.7 64 96 92.7 96 128L96 512C96 547.3 124.7 576 160 576L448 576C483.3 576 512 547.3 512 512L512 128C512 92.7 483.3 64 448 64L160 64zM272 352L336 352C380.2 352 416 387.8 416 432C416 440.8 408.8 448 400 448L208 448C199.2 448 192 440.8 192 432C192 387.8 227.8 352 272 352zM248 256C248 225.1 273.1 200 304 200C334.9 200 360 225.1 360 256C360 286.9 334.9 312 304 312C273.1 312 248 286.9 248 256zM576 144C576 135.2 568.8 128 560 128C551.2 128 544 135.2 544 144L544 208C544 216.8 551.2 224 560 224C568.8 224 576 216.8 576 208L576 144zM560 256C551.2 256 544 263.2 544 272L544 336C544 344.8 551.2 352 560 352C568.8 352 576 344.8 576 336L576 272C576 263.2 568.8 256 560 256zM544 400L544 464C544 472.8 551.2 480 560 480C568.8 480 576 472.8 576 464L576 400C576 391.2 568.8 384 560 384C551.2 384 544 391.2 544 400z"/>` });

    os.svg.global.load({ id: 'ic-inbox', viewBox: "0 0 640 640", content: `<path fill="#ffffff" d="M155.8 96C123.9 96 96.9 119.4 92.4 150.9L64.6 345.2C64.2 348.2 64 351.2 64 354.3L64 480C64 515.3 92.7 544 128 544L512 544C547.3 544 576 515.3 576 480L576 354.3C576 351.3 575.8 348.2 575.4 345.2L547.6 150.9C543.1 119.4 516.1 96 484.2 96L155.8 96zM155.8 160L484.3 160L511.7 352L451.8 352C439.7 352 428.6 358.8 423.2 369.7L408.9 398.3C403.5 409.1 392.4 416 380.3 416L259.9 416C247.8 416 236.7 409.2 231.3 398.3L217 369.7C211.6 358.9 200.5 352 188.4 352L128.3 352L155.8 160z"/>` });

    os.svg.global.load({ id: 'ic-msg', viewBox: '0 0 512 512', content: `
      <rect x="48" y="96" width="416" height="320" rx="40" ry="40" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/>
      <path fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M112 160l144 112 144-112"/>
    ` });

    // ── Register program ─────────────────────────────────────────────────────

    os.program.addInfo("mail", {
        name:        () => _("Mail"),
        version:     "1.0",
        owner:       "Marcus Larsson",
        description: () => _("A simple mail program"),
        icontype:    "svg",
        icon:        "#ic-mail",
        taskbar:     true,
        startmenu:   true,
        multistart:  true,
        main:        "start",
        desktop:     true,
        file:        "mail/mail.js", // Lazy-loaded by app.program.open() on first launch
        root:        "program"
    });

    // ── Load tags widget if missing ──────────────────────────────────────────

    if (!os.exists("ui.tags")) {
        await os.importFile(os.config.local.ComponentsRoot + "ui/tags.js");
    }

    // ── Load sidopanel if not yet registered ────────────────────────────────

    if (!os.ui.sidopanel) {
        await os.importFile(os.config.local.ComponentsRoot + "ui/sidopanel.js");
    }

    const mailData = await os.importFile(os.config.local.ProgramRoot + "mail/mail_data.js");

    if (mailData) Object.assign(app.mail, mailData);

    await os.language.loadProgram("mail");
}
