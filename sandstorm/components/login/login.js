/**
 * @file login/login.js
 * @description Login screen program for Sandstorm OS.
 *
 * ES module that registers and drives the system login UI.
 * Exports `setup(os)` (SVG icon + program registration + `os.login` API)
 * and `start(os, win)` (login window creation and authentication flow).
 *
 * Language and background are resolved fresh on every `baseWindow()` call
 * (boot login and lock-screen re-open alike) rather than once at `setup()`
 * time, since both `os.login.settings` and the desktop's current wallpaper
 * can change mid-session. Background is painted via login's own local
 * `.background-layer` div — never `os.desktop.setBackgroundImage()` — so a
 * login-only background override can never leak into what Control Panel →
 * Background shows as the "current" desktop wallpaper after logging in.
 *
 * @module components/login/login
 */
import * as loginState from './state.js';
import * as autoLogout from './autologout.js';

// ── Idle auto-lock timer state (module-level — one login session at a time) ──
let _idleTimer = null;
let _idleActive = false;     // reset on every lock — gates whether activity restarts the timer
let _listenersAttached = false; // set once, ever — the document listeners themselves are never removed

export async function setup(os) {
    os.svg.global.load({
        id: 'sandstorm_login',
        viewBox: '0 0 85 85',
        content: `<g> <path fill-rule="evenodd" fill="#fdb700" d="m 43.451658,54.698893 -8.647197,8.639639 c -0.664546,-0.243232 -1.37944,-0.435418 -2.124907,-0.435418 -3.507733,0 -6.410055,2.98981 -6.410055,6.605445 0,0.69659 0.165152,1.367328 0.360675,1.997006 l -2.428787,2.426672 c -0.324513,-0.05908 -0.658368,-0.150391 -1.058606,-0.150391 -2.999416,0 -5.478437,2.537558 -5.478437,5.595536 0,0.34004 0.03213,0.672207 0.09083,0.995478 l -2.337682,2.335413 c -2.92677,2.924333 -7.6700224,2.92222 -10.5942379,-0.009 l -2.5313865,-2.53162 c -2.92427855,-2.926411 -2.92219345,-7.66971 0.00448,-10.593968 L 30.330565,41.56621 c 2.926814,-2.924288 7.669977,-2.922224 10.594345,0.0046 l 2.531432,2.53366 c 2.92419,2.926809 2.922175,7.670067 -0.0046,10.59433 z" /> <path fill-rule="evenodd" fill="#ffd600" d="m 55.576805,58.668972 c -16.189502,0 -29.313745,-13.065669 -29.313745,-29.255194 0,-16.189523 13.124243,-29.3137775 29.313745,-29.3137775 16.189609,0 29.255194,13.1242545 29.255194,29.3137775 0,16.189525 -13.065585,29.255194 -29.255194,29.255194 z m 7.654209,-45.736044 c -4.802901,0 -8.755074,3.908094 -8.755074,8.670382 0,4.879471 3.952173,8.728967 8.755074,8.728967 4.802871,0 8.637915,-3.849496 8.637915,-8.728967 0,-4.762288 -3.835044,-8.670382 -8.637915,-8.670382 z" /> </g>`
    });

    try {
        const iconFont = new FontFace(
            "Font Awesome 6 Free",
            `url(${os.config.local.ResourcesRoot}icons/fa-solid-900.woff2) format('woff2')`,
            { weight: "900", style: "normal" }
        );
        await iconFont.load();
        document.fonts.add(iconFont);
        os.dev.log("Icon font preloaded", "Login");
    } catch (error) {
        os.dev.log(`Failed to preload icon font: ${error.message}. Continuing...`, "Login");
    }

    os.program.addInfo("sandstorm_login", {
        name: "Sandstorm login",
        version: "1.0",
        owner: "Marcus Larsson",
        description: "A simple sandstorm login",
        icontype: "svg",
        icon: "#sandstorm_login",
        programtype: "system",
        taskbar: false,
        startmenu: false,
        multistart: false,
        main: "start"
    });

    os.login = {
        settings: {
            get: loginState.get,
            set: loginState.set,
            isValidBackgroundImageUrl: loginState.isValidBackgroundImageUrl,
        },
        restartIdleTimer: () => resetIdleTimer(os),
        pauseAutoLogout: () => autoLogout.pause(),
    };

    // Bas window funktion - skapar och visar login-fönstret
    async function baseWindow(os, boot = true, privateKey, resume) {
        await app.addProgramCSS('sandstorm_login', 'sandstorm login screen', 'sandstorm/components/login/login.css', true);

        const loginConfig = os.login.settings.get();

        if (loginConfig.language !== "system" && loginConfig.language !== os.language.get()) {
            try {
                await os.language.set(loginConfig.language);
            } catch (error) {
                os.dev.warn(`Failed to apply login language "${loginConfig.language}": ${error.message}`, "Login");
            }
        }

        const backgroundUrl = resolveLoginBackgroundUrl(os, loginConfig);
        let backgroundSrc = backgroundUrl;
        try {
            const bgImage = await os.load.preloadImage(backgroundUrl);
            backgroundSrc = bgImage.src;
            os.dev.log("Background image loaded", "Login");
        } catch (error) {
            os.dev.log(`Failed to load background image: ${error.message}. Continuing...`, "Login");
        }

        os.ui.windowStart("sandstorm_login", {
            id: "sandstorm_login",
            title: "Sandstorm login",
            windowIcon: false,
            resizable: false,
            width: "270px",
            height: "380px",
            controls: { minimize: false, maximize: false, close: false },
            mode: "maximized",
            left: "0px",
            top: "0px",
            body: function (windowobj) {
                let div = null;
                const langToken = 'login-' + (windowobj?.windowId || 'main');
                if (os.exists("app.language.registerRefresh")) {
                    os.language.registerRefresh(langToken, () => refreshLoginText(div, os));
                }
                windowobj?.on?.('close', () => {
                    if (os.exists("app.language.unregisterRefresh")) os.language.unregisterRefresh(langToken);
                });

                const login = `
             <link rel="stylesheet" href="${app.config.local.ResourcesRoot}icons/sandstorm.css">
    <!-- Layer 1: Background -->
    <div class="background-layer" style="    background:  url(${backgroundSrc}) no-repeat center / cover;
  min-height: 100vh;">
        <div class="bgs" aria-hidden="true"></div>
    </div>

    <!-- Layer 2: Blur -->
    <div class="blur-layer"></div>

    <!-- Layer 3: Content -->
    <div class="top-clock fade-up clock">
        <div class="time" id="currentTime">0:00</div>
        <div class="date" id="currentDate">${_("Loading")}</div>
    </div>

    <!-- Language selector comes first in DOM/tab order (see the keyboard
         nav spec — språkval is step 1) even though it renders bottom-right;
         "fab-lang" gives it the exact same fixed position .floating-actions
         used to, standalone, so it's free to sit anywhere in DOM order
         without a shared flex-container dependency (see the removed
         .floating-actions wrapper below, and login.css's .fab-lang/.fab-forgot rules). -->
    <button class="fab fab-lang" id="langFab" title="${_("Language selection")}" aria-label="${_("Language selection")}" aria-haspopup="true" aria-expanded="false" aria-controls="langMenu">
        <i class="fa-solid fa-earth-americas"></i>
    </button>
    <div class="lang-menu" id="langMenu" role="menu" aria-hidden="true">
        ${langMenuHTML(os)}
    </div>

    <section class="card fade-up fields">
        <form id="loginForm" novalidate>
            ${renderUsernameHTML("admin")}
            <div class="password-row" id="passwordRow">
                <div class="input" id="passInput">
                    <i class="fa-solid fa-unlock"></i>
                    <input id="pass" name="password" value="1234" type="password" placeholder="${_("Password")}" title="${_("Password")}" data-tooltip-follow required autocomplete="current-password">
                    <button type="button" class="password-toggle" id="passwordToggle" title="${_("Show password")}" aria-label="${_("Show password")}">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                </div>
            </div>
            <button type="submit" class="aero-button login-submit-btn" id="loginSubmitBtn">${_("Log in")}<div class="after"></div></button>
            <p id="msg" class="small" aria-live="polite" style="visibility:hidden; color: #ff6b6b; font-size: 13px; text-align: center;"></p>
        </form>
    </section>

    <!-- Forgot password comes after the login button in DOM/tab order — not
         named in the spec's own recommended order, so placed as the last
         stop rather than ahead of the primary flow. Same standalone-fixed-
         position approach as langFab above. -->
    <button class="fab fab-forgot" id="forgotFab" title="${_("Forgot password")}" aria-label="${_("Forgot password")}">
        <i class="fa-solid fa-key"></i>
    </button>

    <!-- Custom context menu -->
    <div class="custom-context-menu" id="customContextMenu">
        <div class="context-menu-item" data-action="cut">
            <i class="fa-solid fa-scissors"></i>
            <span>${_("Cut")}</span>
        </div>
        <div class="context-menu-item" data-action="copy">
            <i class="fa-solid fa-copy"></i>
            <span>${_("Copy")}</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="paste">
            <i class="fa-solid fa-paste"></i>
            <span>${_("Paste")}</span>
        </div>
    </div>
            `;

                setTimeout(() => {
                    div = document.querySelector('.window.pid-sandstorm_login');

                    const customContextMenu = $('#customContextMenu')[0];
                    const contextMenuItems = document.querySelectorAll('.context-menu-item');
                    const passwordToggle = $('#passwordToggle')[0];
                    const passwordInput = $('#pass')[0];

                    // Function to close all menus
                    function closeAllMenus() {
                        customContextMenu.style.display = 'none';
                        langMenu.style.display = 'none';
                        langMenu.setAttribute('aria-hidden', 'true');
                    }

                    // Update clock
                    function updateClock() {
                        const now = new Date();
                        const timeEl = div.querySelector("#currentTime");
                        const dateEl = div.querySelector("#currentDate");

                        if (timeEl) {
                            const hours = String(now.getHours()).padStart(2, '0');
                            const minutes = String(now.getMinutes()).padStart(2, '0');
                            timeEl.textContent = `${hours}:${minutes}`;
                        }

                        if (dateEl) {
                            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                            const formattedDate = now.toLocaleDateString(_localeForClock(os), options);
                            dateEl.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
                        }
                    }
                    div._updateClock = updateClock; // reachable from refreshLoginText() on a language change

                    updateClock();
                    setInterval(updateClock, 60000);

                    // Password toggle
                    passwordToggle.addEventListener('click', function () {
                        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                        passwordInput.setAttribute('type', type);

                        // Toggle eye icon
                        const icon = this.querySelector('i');
                        const label = type === 'password' ? _('Show password') : _('Hide password');
                        if (type === 'password') {
                            icon.classList.remove('fa-eye');
                            icon.classList.add('fa-eye-slash');
                        } else {
                            icon.classList.remove('fa-eye-slash');
                            icon.classList.add('fa-eye');
                        }
                        this.setAttribute('aria-label', label);
                        // Whichever of title/data-tooltip currently holds the
                        // text (ui.js's tooltip system renames title ->
                        // data-tooltip while shown) - keep both in sync so a
                        // toggle mid-tooltip doesn't leave stale wording.
                        if (this.hasAttribute('data-tooltip')) this.setAttribute('data-tooltip', label);
                        else this.setAttribute('title', label);
                    });

                    // Language menu toggle - keyboard-capable: Enter/Space on
                    // langFab already opens it for free (native <button>
                    // activation fires a real click either way), so the only
                    // things that needed adding are moving focus INTO the
                    // list on a keyboard open (a mouse click leaves focus on
                    // langFab, matching how a mouse user would naturally
                    // reach for the option with the mouse next instead),
                    // Up/Down roving between the language buttons, and Esc
                    // closing + returning focus to langFab.
                    const langFab = div.querySelector("#langFab");
                    const langMenu = div.querySelector("#langMenu");

                    if (langFab && langMenu) {

                        const langButtons = () => Array.from(langMenu.querySelectorAll('button'));

                        const openLangMenu = (moveFocusIn) => {
                            langMenu.style.display = 'block';
                            langMenu.setAttribute('aria-hidden', 'false');
                            langFab.setAttribute('aria-expanded', 'true');
                            if (moveFocusIn) {
                                const buttons = langButtons();
                                const current = buttons.find(b => b.dataset.lang === os.language.get());
                                (current || buttons[0])?.focus();
                            }
                        };

                        const closeLangMenu = (restoreFocus) => {
                            langMenu.style.display = 'none';
                            langMenu.setAttribute('aria-hidden', 'true');
                            langFab.setAttribute('aria-expanded', 'false');
                            if (restoreFocus) langFab.focus();
                        };

                        // e.detail === 0 on a button's own click event means
                        // it fired from a keyboard Enter/Space activation,
                        // not a real pointer click (same detection TEMP-DIAG
                        // cancelRunningJob uses in the AI-Office project's
                        // app.js, for the same underlying reason).
                        langFab.onclick = (e) => {
                            e.stopPropagation();
                            const visible = langMenu.style.display === 'block';
                            if (visible) closeLangMenu(false);
                            else openLangMenu(e.detail === 0);
                        };

                        document.addEventListener('click', () => {
                            closeLangMenu(false);
                        });

                        langMenu.onclick = (e) => {
                            e.stopPropagation();
                            const btn = e.target.closest('button');
                            if (btn) {
                                const lang = btn.dataset.lang;
                                closeLangMenu(false);
                                applyLoginLanguage(os, lang);
                            }
                        };

                        langMenu.addEventListener('keydown', (e) => {

                            const buttons = langButtons();
                            const i = buttons.indexOf(document.activeElement);

                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                buttons[i < 0 ? 0 : (i + 1) % buttons.length]?.focus();
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                buttons[i < 0 ? buttons.length - 1 : (i - 1 + buttons.length) % buttons.length]?.focus();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                closeLangMenu(true);
                            }
                        });

                        langFab.addEventListener('keydown', (e) => {
                            if (e.key === 'Escape' && langMenu.style.display === 'block') {
                                e.preventDefault();
                                closeLangMenu(true);
                            }
                        });
                    }

                    // Forgot password
                    const forgotFab = div.querySelector("#forgotFab");
                    if (forgotFab) {
                        let forgotPasswordOpen = false;
                        forgotFab.onclick = async (e) => {
                            e.stopPropagation();

                            if (forgotPasswordOpen) return;
                            forgotPasswordOpen = true;

                            try {
                                const email = await app.ui.prompt({
                                    title: _('Forgot password'),
                                    text: _('Enter your email for password reset:'),
                                    confirm: { label: _('Send') },
                                    cancel: { label: _('Cancel') },
                                });
                                if (email) {
                                    app.ui.alert({
                                        title: _('Forgot password'),
                                        message: _('Reset link sent to ') + email,
                                        confirm: _('OK'),
                                    });
                                }
                            } finally {
                                forgotPasswordOpen = false;
                            }
                        };
                    }

                    // Context menu
                    document.addEventListener('contextmenu', function (e) {
                        const isInput = e.target.tagName === 'INPUT';
                        let activeInput = null;
                        if (isInput) {
                            e.preventDefault();
                            activeInput = e.target;

                            closeAllMenus();
                            customContextMenu.style.display = 'block';
                            customContextMenu.style.left = e.pageX + 'px';
                            customContextMenu.style.top = e.pageY + 'px';
                        } else {
                            e.preventDefault();
                            closeAllMenus();
                        }
                    });

                    document.addEventListener('click', function (e) {
                        if (!customContextMenu.contains(e.target) &&
                            !langMenu.contains(e.target) &&
                            e.target !== langFab &&
                            !langFab.contains(e.target)) {
                            closeAllMenus();
                        }
                    });

                    contextMenuItems.forEach(item => {
                        item.addEventListener('click', function () {
                            const action = this.getAttribute('data-action');

                            if (!activeInput) return;

                            switch (action) {
                                case 'cut':
                                    cutText(activeInput);
                                    break;
                                case 'copy':
                                    copyText(activeInput);
                                    break;
                                case 'paste':
                                    pasteText(activeInput);
                                    break;
                            }

                            closeAllMenus();
                        });
                    });

                    function cutText(input) {
                        const selectedText = input.value.substring(input.selectionStart, input.selectionEnd);

                        if (selectedText) {
                            navigator.clipboard.writeText(selectedText)
                                .then(() => {
                                    const start = input.selectionStart;
                                    const end = input.selectionEnd;
                                    input.value = input.value.substring(0, start) + input.value.substring(end);
                                    input.setSelectionRange(start, start);
                                })
                                .catch(err => {
                                    console.error('Could not cut text: ', err);
                                    alert(_('Could not cut text'));
                                });
                        }
                    }

                    function copyText(input) {
                        const selectedText = input.value.substring(input.selectionStart, input.selectionEnd);

                        if (selectedText) {
                            navigator.clipboard.writeText(selectedText)
                                .catch(err => {
                                    console.error('Could not copy text: ', err);
                                    alert(_('Could not copy text'));
                                });
                        }
                    }

                    function pasteText(input) {
                        navigator.clipboard.readText()
                            .then(text => {
                                const start = input.selectionStart;
                                const end = input.selectionEnd;

                                input.value = input.value.substring(0, start) + text + input.value.substring(end);

                                input.setSelectionRange(start + text.length, start + text.length);
                            })
                            .catch(err => {
                                console.error('Could not paste text: ', err);
                                alert(_('Could not paste text'));
                            });
                    }

                    // Login form with Enter support
                    const form = div.querySelector("#loginForm");
                    const msg = div.querySelector("#msg");
                    const userInput = div.querySelector("#user");

                    if (form) {
                        if (app.desktop.taskbar.config.isUnbuilt !== true) {
                            // Enter on username = focus password
                            userInput.addEventListener('keypress', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    passwordInput.focus();
                                }
                            });
                        }
                        // Enter on password = login
                        passwordInput.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                form.dispatchEvent(new Event('submit'));
                            }
                        });

                        form.onsubmit = (e) => {
                            e.preventDefault();
                            let u = "";
                            const p = passwordInput.value.trim();

                            // Force credentials when taskbar is unbuilt
                            if (app.desktop.taskbar.config.isUnbuilt === true) {
                                u = "admin";
                            } else {
                                u = userInput.value.trim();
                            }

                            if (!u || !p) {
                                if (msg) {
                                    msg.textContent = _('Please fill in both username and password');
                                    msg.style.visibility = 'visible';
                                }
                                return;
                            }

                            if (u === "admin" && p === "1234") {
                                os.dev.log("Login successful!");

                                if (app.exists("app.ui.caret")) {
                                    app.ui.caret.hidden();
                                }

                                const loginWindow = document.querySelector('.pid-sandstorm_login');
                                if (loginWindow) {
                                    // Add fade-out class (CSS transition needed)
                                    loginWindow.style.transition = 'opacity 0.5s ease';
                                    loginWindow.style.opacity = '0';
                                }

                                setTimeout(() => {
                                    try {
                                        os.ui.windows.functions.closeActiveWindow();
                                        os.desktop.taskbar.removeTaskIcon("sandstorm_login");

                                        app.program.setTaskbarIconDisplayFalse("sandstorm_login");

                                        bindIdleListeners(os);

                                        if (boot) {
                                            resume(privateKey);
                                        } else {
                                            os.desktop.taskbar.show();
                                        }


                                    } catch (err) {
                                        os.dev.error(`Resume function failed: ${err}`, "Login");
                                    }
                                }, 100);
                            } else {
                                os.dev.warn("Wrong username or password.", "Login");
                                if (msg) {
                                    msg.style.color = '#ff6b6b';
                                    msg.textContent = _("Incorrect username or password");
                                    msg.style.visibility = "visible";
                                }
                            }
                        };
                    }
                }, 100);

                return login;
            }
        });
    }

    os.session = os.session || {};

    os.session = {
        window: {
            logoff: async function () {
                await baseWindow(os, false);
            },

            main: async function (os, privateKey, resume) {
                if (typeof resume !== "function") {
                    os.dev.error("Invalid or missing resume function. System startup stopped.", "Login");
                    return;
                }

                app.setTitle(_("Sandstorm Login"));
                await baseWindow(os, true, privateKey, resume);
            }
        }
    }
}


export async function start(os, privateKey, resume, loginStepConfig = {}) {
    os.login.bootConfig = loginStepConfig;

    if (os.exists("app.desktop.startmenu.logoffButton")) {

        os.desktop.startmenu.logoffButton({
            selector: "#ic-logoff",
            direction: "top",
            zindex: 8050,
            action: "click",
            class: "logoff-menu",
            menuItem: [
                {
                    title: _("Lock Screen"),
                    alt: _("Lock your session"),
                    icon: "<span class='menu-icon' data-icon='#ic-lock'></span>",
                    callback: function () {
                        const running = app.program.getRunning();
                        os.program.confirmRunning(() => performLock(os), _("Lock Screen"), running);
                    }
                },
                {
                    title: _("Log Off"),
                    alt: _("End your session"),
                    icon: "<span class='menu-icon' data-icon='#ic-power'></span>",
                    callback: function () {
                        const running = app.program.getRunning();
                        os.program.confirmRunning(() => {
                            window.location.reload();
                        }, _("Log Off"), running);
                    }
                }
            ]
        });
    }
    // Calls the main function (handles login logic with privateKey and resume)
    os.session.window.main(os, privateKey, resume);
}

/**
 * The actual lock steps, shared by the Start Menu's manual "Lock Screen"
 * click (wrapped in os.program.confirmRunning() there) and the idle timer
 * below, which calls this directly — confirmRunning requires a click to
 * proceed, which would leave the desktop visible/interactive indefinitely
 * on an idle trigger, defeating the point of a timeout.
 * @param {Object} os
 */
async function performLock(os) {
    try {
        app.program.setTaskbarIconDisplayFalse("sandstorm_login");
        os.desktop.taskbar.removeTaskIcon("sandstorm_login");
        if (os.session && os.session.currentUser) {
            delete os.session.currentUser;
        }
        if (os.desktop.startmenu.options?.isMenuOpen) {
            await os.desktop.startmenu.toggleMenu();
        }
        await os.desktop.taskbar.hide();
        os.dev.log("Taskbar discontinued");
        stopIdleTimer();
        if (typeof os.session.window.logoff === "function") {
            os.session.window.logoff();
        }
    } catch (err) {
        os.dev.error(`Logoff function failed: ${err}`, "Login");
    }
}

function renderUsernameHTML(username) {
    const locked = app.desktop.taskbar.config.isUnbuilt === true;

    if (locked) {
        return `
        <div class="input">
            <i class="fa-solid fa-user"></i>
            <div class="readonly-user">${username}</div>
            <input type="hidden" name="user" value="${username}">
        </div>`;
    }

    return `
    <div class="input">
        <i class="fa-solid fa-user"></i>
        <input id="user" name="user" value="${username}" type="text"
               placeholder="${_("Username")}" title="${_("Username")}" data-tooltip-follow required autocomplete="username">
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
//  Language
// ══════════════════════════════════════════════════════════════════════════

function langMenuHTML(os) {
    return os.language.getInstalled().map(l =>
        `<button data-lang="${l.code}">${app.util.escapeHtml(l.nativeName)}</button>`
    ).join('');
}

/**
 * Persists the login-language choice and, since login has no per-context
 * override mechanism to lean on, also switches the OS-wide language (same
 * as picking a language anywhere else in the OS).
 * @param {Object} os
 * @param {string} lang
 */
async function applyLoginLanguage(os, lang) {
    os.login.settings.set({ language: lang });
    if (lang !== os.language.get()) {
        try {
            await os.language.set(lang);
        } catch (error) {
            os.dev.warn(`Language switch failed: ${error.message}`, "Login");
        }
    }
}

const _CLOCK_LOCALES = { en: 'en-US', sv: 'sv-SE' };

function _localeForClock(os) {
    return _CLOCK_LOCALES[os.language.get()] || 'en-US';
}

/**
 * Targeted re-translation of the login window's own visible text on a
 * language change while it's open — not a full re-render (would lose
 * in-progress form input). `div` may still be null if a language change
 * lands before the window's own setTimeout(...,100) binding block has run.
 * @param {Element|null} div
 * @param {Object} os
 */
function refreshLoginText(div, os) {
    if (!div) return;

    const setPlaceholder = (sel, text) => { const el = div.querySelector(sel); if (el) el.placeholder = text; };
    const setAttrOn = (sel, attr, text) => { const el = div.querySelector(sel); if (el) el.setAttribute(attr, text); };
    const setText = (sel, text) => { const el = div.querySelector(sel); if (el) el.textContent = text; };

    setPlaceholder('#pass', _('Password'));
    setPlaceholder('#user', _('Username'));
    setAttrOn('#pass', 'title', _('Password'));
    setAttrOn('#user', 'title', _('Username'));

    const passwordToggle = div.querySelector('#passwordToggle');
    const passwordInput = div.querySelector('#pass');
    if (passwordToggle && passwordInput) {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        const label = isPassword ? _('Show password') : _('Hide password');
        // Keeps whichever of title/data-tooltip currently holds the text
        // in sync too (see ui.js's tooltip system — it renames title to
        // data-tooltip while a tooltip is actively shown/hovered/focused),
        // so a language change mid-tooltip doesn't leave stale text on
        // whichever attribute isn't "live" at that exact moment.
        passwordToggle.setAttribute('aria-label', label);
        setAttrOn('#passwordToggle', 'title', label);
        setAttrOn('#passwordToggle', 'data-tooltip', label);
    }

    setText('#loginSubmitBtn', _('Log in'));

    setAttrOn('#forgotFab', 'title', _('Forgot password'));
    setAttrOn('#forgotFab', 'aria-label', _('Forgot password'));
    setAttrOn('#langFab', 'title', _('Language selection'));
    setAttrOn('#langFab', 'aria-label', _('Language selection'));

    setText('[data-action="cut"] span', _('Cut'));
    setText('[data-action="copy"] span', _('Copy'));
    setText('[data-action="paste"] span', _('Paste'));

    const msg = div.querySelector('#msg');
    if (msg) msg.style.visibility = 'hidden';

    app.setTitle(_("Sandstorm Login"));

    if (typeof div._updateClock === 'function') div._updateClock();
}

// ══════════════════════════════════════════════════════════════════════════
//  Background
// ══════════════════════════════════════════════════════════════════════════

/**
 * 3-level fallback: an explicit per-login override, else the desktop's
 * current wallpaper (if already set this session), else
 * os.login.bootConfig.background — the same value index.html's own
 * loginProgram start: step passes to start() (see start()'s own comment),
 * which is also what its neighboring desktop.setBackgroundImage step uses.
 * index.html is the single source of truth for this path; nothing in this
 * file hardcodes its own copy of it.
 * @param {Object} os
 * @param {Object} loginConfig
 * @returns {string}
 */
export function resolveLoginBackgroundUrl(os, loginConfig) {
    if (loginConfig.backgroundImage) return loginConfig.backgroundImage;
    const live = (os.desktop.backgroundOptions || []).slice(-1)[0]?.image;
    if (live) return live;
    return os.login.bootConfig?.background;
}

// ══════════════════════════════════════════════════════════════════════════
//  Auto-lock idle timer
// ══════════════════════════════════════════════════════════════════════════

function startIdleTimer(os) {
    clearTimeout(_idleTimer);
    const cfg = os.login.settings.get();
    if (!cfg.timeout) return; // 0 = "Never"
    _idleTimer = setTimeout(() => performLock(os), cfg.timeout * 1000);
}

function resetIdleTimer(os) {
    if (!_idleActive) return; // not logged in — ignore
    startIdleTimer(os);
}

function bindIdleListeners(os) {
    _idleActive = true;

    if (!_listenersAttached) {
        _listenersAttached = true;
        let debounceTimer = null;
        const reset = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                resetIdleTimer(os);
                autoLogout.reset(); // same activity feeds both timers — see autologout.js's own comment
            }, 1000);
        };
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
            document.addEventListener(evt, reset, { passive: true })
        );
    }

    startIdleTimer(os);
    autoLogout.start(os);
}

function stopIdleTimer() {
    clearTimeout(_idleTimer);
    _idleTimer = null;
    _idleActive = false;
    autoLogout.stop();
}
