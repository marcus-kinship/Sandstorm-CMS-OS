/**
 * @file mail/mail.js
 * @description Mail program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (`app.mail`, icons, metadata, eager `mail_data.js`
 * load for the start-menu tab) lives in `setup.js`.
 * Exports `start(os, win)` (window shell; all content rendered by
 * `mail_data.js` via `data()`).
 *
 * @module program/mail/mail
 */

// ── Nav sections (static config, shared by sidopanel) ────────────────────────

export function navData() {
    return [
        {
            items: [
                { id: "inbox",     label: "Inbox",     count: 302, active: true, arrowMain: true, svgPath: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
                { id: "starred",   label: "Starred",   count: 6,                 svgPath: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" },
                { id: "snoozed",   label: "Snoozed",   count: 6,                 svgPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                { id: "important", label: "Important", count: 6,                 svgPath: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
                { id: "sent",      label: "Sent",                                svgPath: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
                { id: "drafts",    label: "Drafts",    count: 14,                svgPath: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }
            ]
        },
        {
            header: { label: "Categories" },
            items: [
                { id: "social",     label: "Social",     svgPath: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
                { id: "updates",    label: "Updates",    svgPath: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
                { id: "promotions", label: "Promotions", svgPath: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" }
            ]
        },
        {
            header: { label: "Less" },
            items: [
                { id: "spam",    label: "Spam",     svgPath: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
                { id: "trash",   label: "Trash",    svgPath: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" },
                { id: "allmail", label: "All mail", svgPath: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" }
            ]
        }
    ];
}

// ── start() — window creation ────────────────────────────────────────────────

export function start(os) {
    const instanceId = "mail-" + Date.now();

    os.ui.windowStart("mail", {
        id:         instanceId,
        title:      _("Mail"),
        windowIcon: true,
        resizable:  true,
        width:      "1000px",
        height:     "868px",
        body: function (win) {

            const langToken = "mail-" + win.windowId;
            os.language.registerRefresh(langToken, () => win.title(_("Mail")));
            win.on("close", () => os.language.unregisterRefresh(langToken));

            // Load CSS; clean up CSS + ResizeObserver when window closes
            os.addCSS("Mail", os.config.local.ProgramRoot + "mail/style.css", true);
            win.state.close(function () {
                var cont = $('#' + instanceId)[0];
                if (cont && cont._ro) cont._ro.disconnect();

                setTimeout(function () {
                    os.removeCSS("Mail");
                }, 450);
            });

            const sp = os.ui.sidopanel(navData());

            const columns = {
                container: {
                    id: instanceId,
                    class: "mail-layout",
                    subs: [

                        // ── LEFT NAV ─────────────────────────────────────
                        {
                            section: {
                                class: "nav-column",
                                id: `${instanceId}-nav`,
                                subs: [

                                    {
                                        block: {
                                            class: "nav",
                                            id: `${instanceId}-backNav`,
                                            subs: [

                                                {
                                                    block: {
                                                        class: "nav-item",
                                                        id: `${instanceId}-backContent`,
                                                        subs: [
                                                            {
                                                                inblock: {
                                                                    class: "nav-item-label",
                                                                    textContent: _("To list")
                                                                }
                                                            },
                                                            {
                                                                inblock: {
                                                                    class: "nav-item-count",
                                                                    textContent: "›"
                                                                }
                                                            }
                                                        ]
                                                    }
                                                },

                                                {
                                                    block: {
                                                        class: "nav-item",
                                                        id: `${instanceId}-backDetail`,
                                                        subs: [
                                                            {
                                                                inblock: {
                                                                    class: "nav-item-label",
                                                                    textContent: _("To message")
                                                                }
                                                            },
                                                            {
                                                                inblock: {
                                                                    class: "nav-item-count",
                                                                    textContent: "›"
                                                                }
                                                            }
                                                        ]
                                                    }
                                                }

                                            ]
                                        }
                                    },

                                    {
                                        block: {
                                            class: "compose-btn aero-button",
                                            subs: [

                                                {
                                                    html: `
                                            <svg style="width:10px;height:10px;margin-top:2px;"
                                                 fill="none"
                                                 stroke="currentColor"
                                                 viewBox="0 0 14 14">
                                                <path stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                      stroke-width="2"
                                                      d="M7 1v12M1 7h12"/>
                                            </svg>
                                        `
                                                },

                                                {
                                                    inblock: {
                                                        class: "btn-text",
                                                        textContent: _("Compose")
                                                    }
                                                },

                                                {
                                                    block: {
                                                        class: "after pulse",
                                                        style: {
                                                            width: "100%"
                                                        }
                                                    }
                                                }

                                            ]
                                        }
                                    },

                                    {
                                        block: {
                                            class: "nav-items",
                                            id: `${instanceId}-navItems`,
                                            html: sp.html
                                        }
                                    }

                                ]
                            }
                        },

                        // ── CONTENT COLUMN ───────────────────────────────
                        {
                            section: {
                                class: "content-column",
                                id: `${instanceId}-content`,
                                subs: [

                                    {
                                        block: {
                                            class: "content-header",
                                            subs: [

                                                {
                                                    block: {
                                                        class: "flex",
                                                        subs: [

                                                            {
                                                                html: `
                                                        <button class="page-btn prev nav"
                                                                id="${instanceId}-listBack">
                                                            ‹
                                                        </button>
                                                    `
                                                            },

                                                            {
                                                                block: {
                                                                    class: "search-bar",
                                                                    subs: [

                                                                        {
                                                                            html: `
                                                                    <svg class="search-icon"
                                                                         fill="none"
                                                                         stroke="currentColor"
                                                                         viewBox="0 0 24 24">
                                                                        <path stroke-linecap="round"
                                                                              stroke-linejoin="round"
                                                                              stroke-width="2"
                                                                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                                                    </svg>
                                                                `
                                                                        },

                                                                        {
                                                                            html: `
                                                                    <input type="text"
                                                                           class="search-input"
                                                                           id="${instanceId}-search"
                                                                           placeholder="${_("Search")}">
                                                                `
                                                                        },

                                                                        {
                                                                            block: {
                                                                                class: "search-actions",
                                                                                subs: [

                                                                                    {
                                                                                        html: `
                                                                                <button class="icon-btn"
                                                                                        id="${instanceId}-filterBtn"
                                                                                        title="${_("Filter")}">

                                                                                    <svg class="icon"
                                                                                         fill="none"
                                                                                         stroke="currentColor"
                                                                                         viewBox="0 0 24 24">

                                                                                        <path stroke-linecap="round"
                                                                                              stroke-linejoin="round"
                                                                                              stroke-width="2"
                                                                                              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
                                                                                    </svg>

                                                                                </button>
                                                                            `
                                                                                    }

                                                                                ]
                                                                            }
                                                                        }

                                                                    ]
                                                                }
                                                            },

                                                            {
                                                                html: `
                                                        <button class="page-btn next nav"
                                                                id="${instanceId}-contentBack">
                                                            ›
                                                        </button>
                                                    `
                                                            }

                                                        ]
                                                    }
                                                },

                                                {
                                                    block: {
                                                        class: "filter-tabs",
                                                        subs: [

                                                            {
                                                                html: `
                                                        <button class="filter-tab active"
                                                                data-filter="all">
                                                            ${_("All")}
                                                        </button>
                                                    `
                                                            },

                                                            {
                                                                html: `
                                                        <button class="filter-tab"
                                                                data-filter="unread">
                                                            ${_("Unread")}
                                                        </button>
                                                    `
                                                            },

                                                            {
                                                                html: `
                                                        <button class="filter-tab"
                                                                data-filter="archived">
                                                            ${_("Archived")}
                                                        </button>
                                                    `
                                                            }

                                                        ]
                                                    }
                                                }

                                            ]
                                        }
                                    },

                                    {
                                        block: {
                                            class: "email-list",
                                            id: `${instanceId}-emailList`
                                        }
                                    },

                                    {
                                        block: {
                                            class: "pagination",
                                            subs: [

                                                {
                                                    html: `
                                            <button class="page-btn prev"
                                                    id="${instanceId}-pagePrev"
                                                    title="${_("Previous page")}">
                                                ‹
                                            </button>
                                        `
                                                },

                                                {
                                                    inblock: {
                                                        class: "page-info",
                                                        id: `${instanceId}-pageInfo`,
                                                        textContent: "1–5 / 5"
                                                    }
                                                },

                                                {
                                                    html: `
                                            <button class="page-btn next"
                                                    id="${instanceId}-pageNext"
                                                    title="${_("Next page")}">
                                                ›
                                            </button>
                                        `
                                                }

                                            ]
                                        }
                                    }

                                ]
                            }
                        },

                        // ── DETAIL COLUMN ────────────────────────────────
                        {
                            section: {
                                class: "detail-column",
                                id: `${instanceId}-detail`,
                                subs: [

                                    {
                                        block: {
                                            class: "detail-header",
                                            subs: [

                                                {
                                                    block: {
                                                        style: {
                                                            display: "flex",
                                                            alignItems: "center"
                                                        },
                                                        subs: [

                                                            {
                                                                html: `
                                                        <button class="page-btn prev nav"
                                                                id="${instanceId}-detailBack">
                                                            ‹
                                                        </button>
                                                    `
                                                            },

                                                            {
                                                                html: `
                                                        <button class="icon-btnno nav"
                                                                id="${instanceId}-navBack">

                                                            <svg width="18"
                                                                 height="18"
                                                                 viewBox="0 0 23 23"
                                                                 fill="currentColor">

                                                                <circle cx="3" cy="6" r="1.5"/>
                                                                <circle cx="3" cy="12" r="1.5"/>
                                                                <circle cx="3" cy="18" r="1.5"/>

                                                                <line x1="7" y1="6"
                                                                      x2="29" y2="6"
                                                                      stroke="currentColor"
                                                                      stroke-width="2"
                                                                      stroke-linecap="round"/>

                                                                <line x1="7" y1="12"
                                                                      x2="19" y2="12"
                                                                      stroke="currentColor"
                                                                      stroke-width="2"
                                                                      stroke-linecap="round"/>

                                                                <line x1="7" y1="18"
                                                                      x2="19" y2="18"
                                                                      stroke="currentColor"
                                                                      stroke-width="2"
                                                                      stroke-linecap="round"/>
                                                            </svg>

                                                        </button>
                                                    `
                                                            }

                                                        ]
                                                    }
                                                },

                                                {
                                                    html: `
                                            <h1 class="detail-subject head"
                                                id="${instanceId}-detailSubject">
                                                ${_("Select a message")}
                                            </h1>
                                        `
                                                },

                                                {
                                                    block: {
                                                        class: "detail-actions",
                                                        subs: [

                                                            {
                                                                html: `
                                                        <button class="icon-btn"
                                                                id="${instanceId}-moreBtn">

                                                            <svg class="icon"
                                                                 fill="none"
                                                                 stroke="currentColor"
                                                                 viewBox="0 0 24 24">

                                                                <path stroke-linecap="round"
                                                                      stroke-linejoin="round"
                                                                      stroke-width="2"
                                                                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                                                            </svg>

                                                        </button>
                                                    `
                                                            }

                                                        ]
                                                    }
                                                }

                                            ]
                                        }
                                    },

                                    {
                                        block: {
                                            class: "detail-content",
                                            id: `${instanceId}-detailContent`
                                        }
                                    },

                                    {
                                        block: {
                                            class: "detail-footer",
                                            subs: [

                                                {
                                                    html: `
                                            <button class="reply-btn"
                                                    id="${instanceId}-replyBtn">

                                                <svg class="icon"
                                                     fill="none"
                                                     stroke="currentColor"
                                                     viewBox="0 0 24 24">

                                                    <path stroke-linecap="round"
                                                          stroke-linejoin="round"
                                                          stroke-width="2"
                                                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                                                </svg>

                                                ${_("Reply")}
                                            </button>
                                        `
                                                },

                                                {
                                                    html: `
                                            <button class="reply-btn"
                                                    id="${instanceId}-forwardBtn">

                                                <svg class="icon"
                                                     fill="none"
                                                     stroke="currentColor"
                                                     viewBox="0 0 24 24">

                                                    <path stroke-linecap="round"
                                                          stroke-linejoin="round"
                                                          stroke-width="2"
                                                          d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                                </svg>

                                                ${_("Forward")}
                                            </button>
                                        `
                                                }

                                            ]
                                        }
                                    }

                                ]
                            }
                        },

                        // ── SCRIPT ───────────────────────────────────────
                        {
                            script: {
                                path: "mail/mail_data.js",
                                call: "data"
                            }
                        }

                    ]
                }
            };

            return os.ui.body(columns).render();
        }
    });
}
