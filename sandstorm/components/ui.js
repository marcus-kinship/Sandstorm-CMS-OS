/**
 * @file components/ui.js
 * @description Core UI namespace for Sandstorm OS.
 *
 * Registers `app.ui` — the central hub for all window, dialog, and UI utilities.
 * Responsibilities include:
 * - Window CSS is loaded from `ui.css` via `app.addCSS` at initialisation
 * - `app.ui.windows` — window lifecycle (open, close, minimize, maximize, restore)
 * - `app.ui.windowStart(programId, config)` — convenience wrapper to open a new window
 * - `app.ui.toggle` — toggle-window helper used by status icons and taskbar overlays
 * - `app.ui.context` — desktop context-menu rendering
 * - Timeout utilities for auto-dismiss UI elements
 *
 * @module components/ui
 */
(function (app) {
    app.addCSS("window", "sandstorm/components/ui.css", true);

    // Tracks the element a tooltip is currently showing for, so a MutationObserver
    // can force-hide it if that element gets removed from the DOM without ever
    // firing mouseleave (e.g. its window/program closes while it's being hovered).
    let _tooltipTarget = null;

    // Tracks whether the most recent interaction was a pointer click or Tab
    // navigation, exposed as an html class. Native :focus-visible already
    // makes this distinction correctly for buttons/divs (no ring on mouse
    // focus), but per spec it matches on ANY focus for text-editable elements
    // (input/textarea) - this fills that gap so CSS can still tell them apart
    // on text fields too, e.g. `html:not(.input-modality-mouse) .foo:has(input:focus-visible)`.
    document.addEventListener("pointerdown", () => {
        document.documentElement.classList.add("input-modality-mouse");
    }, true);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Tab") document.documentElement.classList.remove("input-modality-mouse");
    }, true);

    app.ui = {
        timeout: {
            id: null
        },
        
        
        /**
         * Runs a fade-out animation on an element using a CSS transition class.
         * Resolves when the animation is done.
         */

        animation: async function (element, fadeClass = "fade-out") {

            // jQuery → DOM
            if (element && element.jquery) {
                element = element.get(0);
            }

            // selector string
            if (typeof element === "string") {
                element = document.querySelector(element);
            }

            if (!element || !element.classList) return;

            return new Promise(resolve => {

                // Force reflow for transition to trigger
                void element.offsetWidth;

                element.classList.add(fadeClass);

                const onEnd = (ev) => {
                    if (ev.propertyName !== "opacity") return;
                    element.removeEventListener("transitionend", onEnd);
                    resolve();
                };

                element.addEventListener("transitionend", onEnd);

                // Fallback if animation never fires
                const duration = parseFloat(getComputedStyle(element).transitionDuration) * 1000;
                setTimeout(resolve, duration + 50);
            });
        
        },

        /**
         * Tooltip functionality for CMS OS
         * 
         * This module creates a custom tooltip that replaces the default `title` and `alt` attributes.
         * The tooltip fades in and moves towards the object when hovered and fades out when the cursor leaves.
         * 
         * @namespace app.ui.tooltip
         */

        tooltip: {
            /**
             * Initializes the tooltip system by adding event listeners.
             * 
             * - Adds a global `mouseenter` event for elements with `title` or `alt` attributes.
             * - Adds a global `mouseleave` event to hide the tooltip.
             * - Removes the default browser tooltip for better user experience.
             */
            init: function () {
                app.dev.log(`Initializes the tooltip`, "Core");

                // Add tooltip CSS
                app.addCSS("tooltip ui", `
                    .ui-tooltip {
                        position: absolute;
                        background: rgba(0, 0, 0, 0.85);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 5px;
                        font-size: 13px;
                        pointer-events: none;
                        white-space: pre-line;
                        max-width: 320px;
                        z-index: 9999;
                        opacity: 0;
                        transform: scale(0.8);
                        transition: opacity 0.2s ease-out, transform 0.2s ease-out;
                    }
        
                    .ui-tooltip-visible {
                        opacity: 1;
                        transform: scale(1);
                    }
                `);
                $(function () {
                    // Listen for mouse hover on elements with title or alt attributes
                    $(document).on("mouseenter", "[title]:not(.def-slider), [alt]:not(.def-slider)", function (event) {
                        let $this = $(this);

                        // Exclude .def-slider elements from tooltip logic
                        if ($this.closest().length) return;

                        let tooltipText = $this.attr("title") || $this.attr("alt");

                        if (!tooltipText) return;

                        // Save the text in the data tooltip
                        $this.attr("data-tooltip", tooltipText);
                        $this.removeAttr("title").removeAttr("alt");

                        // Follow mouse when element or any ancestor has data-tooltip-follow
                        const follow = $this.is("[data-tooltip-follow]") ||
                                       $this.closest("[data-tooltip-follow]").length > 0;

                        app.ui.tooltip.show($this, tooltipText, event, follow);
                    });

                    // Keyboard focus - same title/alt -> data-tooltip handoff
                    // as mouseenter above, just triggered by Tab navigation
                    // instead of the mouse. Always static positioning (never
                    // `follow`, unlike mouseenter) - a focusin event carries
                    // no cursor coordinates to follow in the first place.
                    $(document).on("focusin", "[title]:not(.def-slider), [alt]:not(.def-slider)", function (event) {
                        let $this = $(this);

                        let tooltipText = $this.attr("title") || $this.attr("alt");
                        if (!tooltipText) return;

                        $this.attr("data-tooltip", tooltipText);
                        $this.removeAttr("title").removeAttr("alt");

                        app.ui.tooltip.show($this, tooltipText, event, false);
                    });

                    // Focus moving on (Tab/Shift+Tab to the next control, or
                    // away entirely) hides it - mirrors mouseleave below,
                    // just for the keyboard path.
                    $(document).on("focusout", "[data-tooltip]:not(.def-slider)", function () {
                        let $this = $(this);

                        let tooltipText = $this.attr("data-tooltip");
                        if (tooltipText) {
                            $this.attr("title", tooltipText);
                            $this.removeAttr("data-tooltip");
                        }

                        app.ui.tooltip.hide();
                    });

                    // click object is hidden
                    $(document).on("click", "[data-tooltip]:not(.def-slider)", function () {
                        setTimeout(() => {
                            app.ui.tooltip.hide();
                        }, 200);
                    });

                    $(document).on("mouseleave", "[data-tooltip]:not(.def-slider)", function () {
                        let $this = $(this);

                        // Ã…terstÃ¤ll title eller alt frÃ¥n data-tooltip
                        let tooltipText = $this.attr("data-tooltip");
                        if (tooltipText) {
                            $this.attr("title", tooltipText); // Or use `alt` if it was from `alt`
                            $this.removeAttr("data-tooltip"); // Clear temporary storage
                        }

                        app.ui.tooltip.hide();
                    });

                    // Window title: show tooltip only when text is truncated
                    $(document).on("mouseenter", ".window-list .window-header .title", function (e) {
                        const el = this;
                        if (el.scrollWidth > el.clientWidth) {
                            app.ui.tooltip.show($(el), el.textContent.trim(), e, false);
                        }
                    }).on("mouseleave", ".window-list .window-header .title", function () {
                        app.ui.tooltip.hide();
                    });

                    // Failsafe: closing a program/window removes its hovered element
                    // straight from the DOM without ever firing mouseleave, so the
                    // floating .ui-tooltip (appended to <body>, independent of it)
                    // would otherwise be stuck on screen forever. Force-hide it as
                    // soon as its target is no longer in the document.
                    new MutationObserver(() => {
                        if (_tooltipTarget && !document.body.contains(_tooltipTarget)) {
                            app.ui.tooltip.hide();
                        }
                    }).observe(document.body, { childList: true, subtree: true });
                });
            },

            /**
             * Displays a tooltip at the hovered element.
             * 
             * @param {jQuery} $element - The element being hovered.
             * @param {string} text - The tooltip text to display.
             */
            show: function ($element, text, event, follow) {
                if (!$element.is(":visible")) return;

                _tooltipTarget = $element[0];

                let $tooltip = $("<div>", { class: "ui-tooltip", text: text }).appendTo("body");

                const margin = 14;

                if (follow) {
                    // â”€â”€ Follow-cursor mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    function _place(e) {
                        const tw = $tooltip.outerWidth()  || 0;
                        const th = $tooltip.outerHeight() || 0;
                        const ww = $(window).width();
                        const wh = $(window).height();
                        const sx = $(window).scrollLeft();
                        const sy = $(window).scrollTop();

                        let x = e.pageX + margin;
                        let y = e.pageY + margin;

                        if (x + tw > ww + sx) x = e.pageX - tw - margin;
                        if (y + th > wh + sy) y = e.pageY - th - margin;
                        if (x < sx + margin)  x = sx + margin;
                        if (y < sy + margin)  y = sy + margin;

                        $tooltip.css({ left: x + "px", top: y + "px" });
                    }
                    if (event) _place(event);
                    $(document).on("mousemove.ui-tooltip", _place);
                } else {
                    // â”€â”€ Static mode (fixed relative to element) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                    const tooltipWidth  = $tooltip.outerWidth();
                    const tooltipHeight = $tooltip.outerHeight();
                    const offset        = $element.offset();
                    const elemWidth     = $element.outerWidth();
                    const elemHeight    = $element.outerHeight();

                    let top  = offset.top - tooltipHeight - margin;
                    let left = offset.left + (elemWidth / 2) - (tooltipWidth / 2);

                    if (top < 0)                                      top  = offset.top + elemHeight + margin;
                    if (top + tooltipHeight > $(window).height())     top  = offset.top - tooltipHeight - margin;
                    if (left + tooltipWidth > $(window).width())      left = $(window).width() - tooltipWidth - margin;
                    if (left < 0)                                     left = margin;
                    if (top  < 0)                                     top  = margin;

                    $tooltip.css({ left: left + "px", top: top + "px" });
                }

                setTimeout(() => { $tooltip.addClass("ui-tooltip-visible"); }, 10);
            },

            /**
             * Hides the tooltip and removes it from the DOM after animation.
             */
            hide: function () {
                _tooltipTarget = null;
                $(document).off("mousemove.ui-tooltip");
                let $tooltip = $(".ui-tooltip");
                $tooltip.removeClass("ui-tooltip-visible");

                setTimeout(() => {
                    $tooltip.remove();
                }, 200);
            }
        },

        /**
         * Mouse-following glow for `.aero-button` elements.
         *
         * `.aero-button`'s `.after` child (basic.css) is a static blurred glow
         * behind the button content. This tracks the cursor horizontally while
         * hovering — the glow leans toward wherever the mouse is over the
         * button — and springs back to centered + pulsing (`.pulse`, also
         * basic.css) on mouseleave. Delegated on `document` (same reasoning as
         * `app.ui.tooltip` above) since `.aero-button` instances are created
         * throughout the OS — Start button, Designer, Fotoviewer, etc. — many
         * of them long after boot, so a direct per-element binding would miss
         * anything not yet in the DOM at init time.
         *
         * @namespace app.ui.aeroGlow
         */
        aeroGlow: {
            /**
             * Wires the delegated mousemove/mouseleave handlers. Call once at boot.
             */
            init: function () {
                app.dev.log(`Initializes the aero-button glow`, "Core");

                $(document).on("mousemove", ".aero-button", function (event) {
                    const $btn = $(this);
                    const $after = $btn.find(".after");
                    if (!$after.length) return;

                    // basic.css centers .after by default via `left:50%` +
                    // `transform:translate(-50%,0%)`. Only the X side needs
                    // cancelling here, since `left` is about to be set as an
                    // absolute px value — `top` isn't cursor-tracked (an
                    // earlier version tried that, but .aero-button's
                    // `overflow: hidden` clips most of that motion away on
                    // short buttons like the ~26px-tall Start button anyway).
                    // It does get a small fixed nudge below basic.css's
                    // `top: 50%` resting position, but only while actively
                    // hovering — mouseleave below clears it back to the
                    // default, so the idle/pulsing state is untouched.
                    const halfWidth = $after.outerWidth() / 2;
                    const x = event.pageX - $btn.offset().left - halfWidth;

                    $after.removeClass("pulse").css({
                        left: x + "px",
                        top: "calc(50% + 6px)",
                        transform: "translate(0, 0)",
                        opacity: 1
                    });
                });

                $(document).on("mouseleave", ".aero-button", function () {
                    // Clear the inline overrides (including the transform
                    // cancel above) so .after falls back to basic.css's
                    // centered default instead of a hand-computed approximation.
                    $(this).find(".after").addClass("pulse").css({
                        left: "",
                        transform: "",
                        opacity: ""
                    });
                });
            }
        },

        /**
         * Creates a tabbed interface with icons and tabs that display content on click.
         * 
         * @param {Object} config - Configuration object.
         * @param {string} config.tabsContainerId - The jQuery selector for the tabs container.
         * @param {string} config.iconsContainerId - The jQuery selector for the icons container.
         * @param {Object} tabsdata - Data object containing tabs, icons, and settings for the menu.
         * @param {Object} tabsdata.tabs - Array of tab data, each containing an icon, tab content, and optional callback.
         * @param {number} [tabsdata.default=0] - Index of the default tab to display.
         *
         * `icon` accepts any HTML, not just Font Awesome — but if you do use an
         * `fa-*` class, it must be one of the icons in Sandstorm's subset (see
         * `app.icons.available` / `res/icons/sandstorm.css`), not the full
         * Font Awesome library.
         *
         * @example
         * const config = {
         *     tabsContainerId: '#tabs-container',
         *     iconsContainerId: '#icons-container'
         * };
         * 
         * const tabsdata = {
         *     default: 0, // Default tab to display
         *     tabs: {
         *         {
         *             id: 'icon-1', // Optional ID for the icon
         *             icon: '<i class="fas fa-key"></i>', // Icon HTML content
         *             tabid: 'tab-1', // Optional ID for the tab content container
         *             tab: 'Home Content', // Tab content (can also be a function returning HTML)
         *             callback: function() {
         *                 console.log('Home tab loaded');
         *             }
         *         },
         *         {
         *             id: 'icon-2',
         *             icon: '<i class="fas fa-user"></i>',
         *             tabid: 'tab-2',
         *             tab: function() { return '<p>User Profile Content</p>'; },
         *             callback: function() {
         *                 console.log('User tab loaded');
         *             }
         *         },
         *         {
         *           divider: '<hr />' // Divider between tabs
         *          },
         *         {
         *             id: 'icon-3',
         *             icon: '<i class="fas fa-unlock"></i>',
         *             tabid: 'tab-3',
         *             tab: 'Settings Content',
         *             callback: function() {
         *                 console.log('Settings tab loaded');
         *             }
         *         }
         *     }
         * };
         * 
         * // Initialize the tabs
         * tabs(config, tabsdata);
         */
        tabs: function (config, tabsdata) {
            const { tabsContainerId, iconsContainerId } = config;

            // Get container elements using jQuery
            const tabsContainer = $(tabsContainerId);
            const iconsContainer = $(iconsContainerId);

            if (!tabsContainer.length || !iconsContainer.length) {
                console.error('Container elements not found');
                return;
            }


            /**
             * Iterates over tabsdata.tabs to create icons and corresponding tabs.
             * Adds event listeners to each icon for displaying the associated tab.
             */
            tabsdata.tabs.forEach((menuItem, index) => {

                if (menuItem.divider) {
                    // Create a divider if specified
                    const divider = $('<div>')
                        .addClass('tab-divider')
                        .html(menuItem.divider || ''); // Optional content for the divider
                    iconsContainer.append(divider);
                    return; // Skip further processing for dividers
                }

                // Only process if an icon is defined
                if (menuItem.icon !== undefined) {
                    // menuItem.title may be a plain string (resolved once,
                    // frozen forever) or a thunk `() => _(...)` that
                    // re-resolves the current translation on every call —
                    // same duck-typed pattern os.controlpanel.add() uses.
                    // Resolved HERE, at render time, rather than once inside
                    // addTab() (which used to bake a frozen title straight
                    // into a stored HTML string) so that re-running this
                    // whole tabs() call after a language change — see
                    // language.js's own "shell-startmenu-tabs" refresh —
                    // actually picks up the new language for tab icon
                    // tooltips too, not just each tab's own content. Keeps
                    // the original two-level markup (outer `icons-N` div
                    // wrapping an inner `.blockicon` div) intact — CSS like
                    // `#ms-icons-container div > div { overflow: visible }`
                    // depends on that exact nesting.
                    const resolvedTitle = typeof menuItem.title === 'function' ? menuItem.title() : (menuItem.title || '');
                    const iconInner = menuItem.icontype === 'svg'
                        ? `<div class="blockicon" title="${resolvedTitle}"><svg><use href="${menuItem.icon}" /></svg></div>`
                        : `<div class="blockicon" title="${resolvedTitle}"><img src="${menuItem.icon}"></div>`;

                    // Create icon element
                    const icon = $('<div>')
                        .addClass(`icons-${index}`) // Changed class to `icons-${index}`
                        .html(iconInner);

                    if (menuItem.id) {
                        icon.attr('id', menuItem.id);
                    }

                    iconsContainer.append(icon);

                    // Create tab element if tab content is defined
                    if (menuItem.tab !== undefined) {
                        const tab = $('<div>')
                            .addClass(`tabs-${index}`);

                        // Add ID if specified
                        if (menuItem.tabid) {
                            tab.attr('id', menuItem.tabid);
                        }

                        // Handle tab content: check if tab content is a function or direct content
                        const tabContent = typeof menuItem.tab === 'function'
                            ? menuItem.tab()
                            : menuItem.tab;

                        tab.html(tabContent);
                        tabsContainer.append(tab);

                        // Add click handler to icon
                        icon.on('click', function () {
                            // Hide all tabs
                            tabsContainer.children().removeClass('active');
                            // Show current tab
                            tab.addClass('active');
                            // Update icon states
                            iconsContainer.children().removeClass('active');
                            icon.addClass('active');
                        });

                        // Execute callback if defined
                        if (typeof menuItem.callback === 'function') {
                            menuItem.callback();
                        }
                    } else {
                        console.error('Cannot create tab: tab content is missing for the icon');
                    }
                }
            });

            /**
             * Sets the default tab and activates the corresponding icon.
             * 
             * @type {number} defaultTabIndex - Index of the default tab, falling back to 0 if not specified.
             */
            const defaultTabIndex = tabsdata.default !== undefined ? tabsdata.default : 0;
            tabsContainer.children().eq(defaultTabIndex).addClass('active');
            iconsContainer.children().eq(defaultTabIndex).addClass('active');
        },

        waitForTransitionEnd: function (element) {
            return new Promise(resolve => {
                const el = element instanceof jQuery ? element[0] : element;

                if (!el) {
                    resolve();
                    return;
                }

                const computed = getComputedStyle(el);
                const dur = parseFloat(computed.transitionDuration) || 0;
                const delay = parseFloat(computed.transitionDelay) || 0;

                if ((dur + delay) === 0) {
                    resolve();
                    return;
                }

                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    el.removeEventListener('transitionend', handler);
                    clearTimeout(fallback);
                    resolve();
                };
                const handler = () => finish();

                el.addEventListener('transitionend', handler, { once: true });

                // Safety-valve fallback, not the primary resolution signal
                // (that's still the transitionend listener above) — a
                // caller that sets a NEW `transition`/property on this same
                // element before the browser fires transitionend (e.g. two
                // overlapping callers racing the same taskbar element, see
                // taskbar/build.js's checkTaskbarPosition) can leave that
                // property change never actually dispatching the event this
                // listener is waiting for, hanging this promise forever.
                // Confirmed live: exactly this race left the taskbar frozen
                // at opacity:0 (invisible) permanently after rapid resizing
                // crossed its mobile-mode breakpoint back and forth.
                const fallback = setTimeout(finish, (dur + delay) * 1000 + 100);
            });
        },
        /**
         * Function to create and handle a context menu for a given selector or element.
         * 
         * @param {string | HTMLElement} selector - CSS selector or HTML element to attach the context menu to.
         * @param {object} options - Configuration object for the context menu.
         * @param {Array} options.items - Array of menu item objects with properties like title, icon, and callback.
         * @param {function} [options.callback] - Optional callback function that returns items to display in the menu.
         * @param {number} [options.zIndex=300] - Z-index for the context menu.
         * @param {string} [options.classes=""] - Additional CSS classes to apply to the context menu.
         * @param {boolean} [options.seltaget=false] - Flag indicating whether to handle context menu items based on a specific target.
         */
        contextMenu: function (selector, options = {}) {
            const {
                items = [],
                callback,
                zIndex = null,
                classes = "",
                seltaget = false,
                exclude = null   // CSS selector — if the right-click target matches, skip this menu
            } = options;

            // Array to store elements with context menus
            const contextMenuElements = [];


            // Select the element based on the provided selector
            let element;

            if (typeof selector === 'string') {
                element = document.querySelector(selector);
            } else if (selector instanceof HTMLElement) {
                element = selector;
            } else if (window.jQuery && selector instanceof jQuery) {
                element = selector[0]; // ta fÃ¶rsta DOM-elementet i jQuery-objektet
            } else {
                console.error('Invalid selector or element provided');
                return;
            }

            if (!element) {
                console.error('Element not found in DOM');
                return;
            }

            // Resolve z-index: auto-detect parent window if not supplied
            const _resolveZ = (el) => {
                if (zIndex !== null) return zIndex;
                const pw = el ? el.closest('.window') : null;
                const wz = pw ? parseInt(pw.style.zIndex, 10) : NaN;
                return (isNaN(wz) ? 5000 : wz) + 1;
            };

            // Add the element to the array of context menu elements
            contextMenuElements.push(element);

            // Add event listeners for right-click (contextmenu) and long press (3 seconds)
            let pressTimer;
            element.addEventListener("contextmenu", function (e) {
                handleContextMenu(e); // Call the function with the event
            });
            element.addEventListener("mousedown", (e) => {
                if (e.button === 0) {
                    // pressTimer = setTimeout(() => handleContextMenu(e), 3000); // Long press to show the menu
                }
            });
            element.addEventListener("mouseup", (e) => {
                if (e.button === 0) {
                    clearTimeout(pressTimer);
                }
            });

            // Function to handle the display of the context menu
            function handleContextMenu(e) {
                e.preventDefault(); // Prevent default right-click behavior

                // Check if the clicked target is in the list of context menu elements
                if (!seltaget && !contextMenuElements.some(el => el.contains(e.target))) return;
                if (exclude && e.target.closest(exclude)) return;

                // Remove any existing context menus
                closeAllMenus(e);

                // Determine menu items
                let menuItems = items;
                if (callback && typeof callback === 'function') {
                    menuItems = callback(); // Use the callback to get menu items if defined
                }

                // Create and display the menu
                if (!menuItems || (Array.isArray(menuItems) && !menuItems.length)) return;
                createMenu(menuItems, classes, _resolveZ(e.target));

                // Lock hover appearance on the right-clicked row while menu is open
                const ctxRow = e.target.closest('[data-path]');
                if (ctxRow) ctxRow.classList.add('ctx-active');

                // Lock any collapsible panel that contains the right-clicked element
                const ctxNav = e.target.closest('.exp-nav');
                if (ctxNav) ctxNav.classList.add('exp-nav-ctx');

                // Calculate and adjust menu position
                const menu = document.querySelector(".contextMenu");
                if (!menu) return;

                // Add CSS transition for smooth repositioning
                menu.style.transition = "left 0.3s ease, top 0.3s ease";

                // Position the menu initially
                updateMenuPosition(menu, e.clientX, e.clientY);
                menu.classList.add("show");

                // Add window resize event listener to check and update menu position
                window.addEventListener("resize", () => {
                    if (menu && document.body.contains(menu)) {
                        updateMenuPosition(menu, parseInt(menu.style.left), parseInt(menu.style.top));
                    }
                });

                // Close the menu on left-click outside
                document.addEventListener("click", function (event) {
                    closeAllMenus(event);
                }, {
                    once: true
                });
            }

            // Function to update menu position
            function updateMenuPosition(menu, posX, posY) {
                const menuWidth = menu.offsetWidth;
                const menuHeight = menu.offsetHeight;
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;

                // Extract numeric part from posX and posY if they're strings with 'px'
                if (typeof posX === 'string' && posX.includes('px')) {
                    posX = parseInt(posX);
                }
                if (typeof posY === 'string' && posY.includes('px')) {
                    posY = parseInt(posY);
                }

                // Adjust menu position if it overflows the screen
                if (posX + menuWidth > windowWidth) {
                    posX = windowWidth - menuWidth - 30;
                }
                if (posY + menuHeight > windowHeight) {
                    posY = windowHeight - menuHeight - 30;
                }

                // Ensure menu is not positioned outside the left or top edges
                posX = Math.max(10, posX);
                posY = Math.max(10, posY);

                menu.style.left = `${posX}px`;
                menu.style.top = `${posY}px`;
            }

            // Function to remove all context menus
            function closeAllMenus(event) {
                document.querySelectorAll(".contextMenu").forEach((menu) => {
                    menu.classList.remove("show");
                    if (!menu.contains(event.target)) {
                        menu.remove();
                    }
                });
                document.querySelectorAll(".ctx-active").forEach(el => el.classList.remove("ctx-active"));
                document.querySelectorAll(".exp-nav-ctx").forEach(el => el.classList.remove("exp-nav-ctx"));
                // Remove resize event listener when closing menus
                window.removeEventListener("resize", updateMenuPosition);
            }

            // Function to create the main menu
            function createMenu(items, classes = "", zIndex = 1000) {
                const menu = document.createElement("div");
                menu.className = "contextMenu " + classes;
                menu.style.zIndex = zIndex;

                items.forEach((item) => {
                    const menuItem = document.createElement("div");
                    menuItem.style.justifyContent = "space-between";
                    menuItem.className = "ctm-row";

                    // Add icon (if available)
                    const icon = document.createElement("span");
                    icon.innerHTML = item.icon || "";
                    icon.style.marginRight = "10px";

                    // Add title
                    const title = document.createElement("span");
                    // item.title may be a plain string or a `() => _(...)`
                    // thunk (same duck-typed pattern as the tabs() function
                    // above) — resolved fresh here every time the context
                    // menu is actually opened, so entries registered once at
                    // boot (e.g. controlpanel.js's taskbar/desktop menu
                    // items) still pick up a later language change.
                    title.textContent = typeof item.title === 'function' ? item.title() : item.title;

                    const line = document.createElement("div");
                    line.className = "ctm-title";
                    line.appendChild(icon);
                    line.appendChild(title);

                    // Right side: › arrow for submenu items, alt text for regular items
                    const alt = document.createElement("span");
                    if (item.submenu) {
                        alt.textContent = '›';
                        alt.style.cssText = 'font-size:16px;line-height:1;opacity:0.75;margin-left:6px;flex-shrink:0;';
                    } else {
                        alt.textContent = item.alt || '';
                    }

                    if (item.submenu) {
                        // â”€â”€ Hover-based submenu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                        let _sub   = null;
                        let _timer = null;

                        const _positionSub = () => {
                            if (!_sub) return;
                            const rect = menuItem.getBoundingClientRect();
                            let x = rect.right, y = rect.top;
                            const sw = _sub.offsetWidth, sh = _sub.offsetHeight;
                            if (x + sw > window.innerWidth)  x = rect.left - sw;
                            if (y + sh > window.innerHeight) y = window.innerHeight - sh - 10;
                            _sub.style.left = x + 'px';
                            _sub.style.top  = y + 'px';
                        };

                        const _showSub = () => {
                            clearTimeout(_timer);
                            // Close any other open submenu at this level
                            document.querySelectorAll('.contextMenu.submenu').forEach(s => s.remove());
                            _sub = createSubMenu(item.submenu, zIndex + 1, item.submenuClass);
                            _sub.style.position = 'absolute';
                            document.body.appendChild(_sub); // append first so offsetWidth is valid
                            _positionSub();
                            _sub.classList.add('show'); // required: CSS sets opacity:0 without .show
                            _sub.addEventListener('mouseenter', () => clearTimeout(_timer));
                            _sub.addEventListener('mouseleave', _hideSub);
                        };

                        const _hideSub = () => {
                            _timer = setTimeout(() => { _sub?.remove(); _sub = null; }, 130);
                        };

                        menuItem.addEventListener('mouseenter', _showSub);
                        menuItem.addEventListener('mouseleave', _hideSub);
                        // Click: stop propagation so closeAllMenus doesn't fire, toggle submenu
                        menuItem.addEventListener('click', e => {
                            e.stopPropagation();
                            if (_sub) { _hideSub(); } else { _showSub(); }
                        });
                    } else {
                        // â”€â”€ Regular item: click to invoke â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                        menuItem.addEventListener("click", () => {
                            if (item.callback) item.callback();
                            document.querySelectorAll(".contextMenu").forEach(m => m.remove());
                        });
                    }

                    // Assemble the menu item by appending icon, title, and alt text
                    menuItem.appendChild(line);
                    menuItem.appendChild(alt);
                    menu.appendChild(menuItem);
                });

                // Append the constructed menu to the body
                document.body.appendChild(menu);
            }

            // Function to create a submenu
            function createSubMenu(items, subZ, extraClass = "") {
                const subMenu = document.createElement("div");
                subMenu.className = "contextMenu submenu" + (extraClass ? " " + extraClass : "");
                subMenu.style.zIndex = subZ != null ? subZ : 10001;

                items.forEach((item) => {
                    const subMenuItem = document.createElement("div");
                    subMenuItem.style.justifyContent = "space-between";
                    subMenuItem.style.cursor = "pointer";
                    subMenuItem.className = "ctm-row";

                    // Add icon (if available)
                    const icon = document.createElement("span");
                    icon.innerHTML = item.icon || "";
                    icon.style.marginRight = "10px";

                    // Add title
                    const title = document.createElement("span");
                    // item.title may be a plain string or a `() => _(...)`
                    // thunk (same duck-typed pattern as the tabs() function
                    // above) — resolved fresh here every time the context
                    // menu is actually opened, so entries registered once at
                    // boot (e.g. controlpanel.js's taskbar/desktop menu
                    // items) still pick up a later language change.
                    title.textContent = typeof item.title === 'function' ? item.title() : item.title;

                    const line = document.createElement("div");
                    line.className = "ctm-title";
                    line.appendChild(icon);
                    line.appendChild(title);

                    // Add alternative text (alt description)
                    const alt = document.createElement("span");
                    alt.textContent = item.alt;

                    // Click: run callback and close all menus
                    subMenuItem.addEventListener("click", () => {
                        if (item.callback) item.callback();
                        document.querySelectorAll('.contextMenu').forEach(m => m.remove());
                    });

                    // Assemble the submenu item by appending icon, title, and alt text
                    subMenuItem.appendChild(line);
                    subMenuItem.appendChild(alt);
                    subMenu.appendChild(subMenuItem);
                });

                return subMenu;
            }
        },
        sliderLoaded: null, // globalt inom modulen eller objektet
        /**
         * jQuery plugin to create a customizable, interactive slider with single or dual handle support.
         * The slider allows value selection, tooltips, and error handling.
         *
         * @function
         * @param {Object} options - Configuration options for the slider.
         * @param {number} [options.min=0] - Minimum slider value.
         * @param {number} [options.max=100] - Maximum slider value.
         * @param {number} [options.step=1] - Step size for slider values.
         * @param {boolean} [options.tooltip=true] - Enables or disables tooltip display.
         * @param {boolean} [options.dual=false] - Enables dual-handle mode, allowing two handles on the slider.
         * @param {boolean} [options.onUpdate] - This is a callback function that gets triggered whenever the slider values change.
         * @param {Object} [options.errormsgs] - Error messages displayed for various validation checks.
         * @param {string} [options.errormsgs.outofrange="out of range"] - Message for out-of-range values.
         * @param {string} [options.errormsgs.invalid="Value for Handle 1 is invalid!"] - Message for invalid handle 1 value.
         * @param {string} [options.errormsgs.lessthanHandle1="Value for Handle 2 cannot be less than Handle 1!"] - Message for when handle 2 value is less than handle 1.
         * @param {Object} [options.handle1] - Configuration for the first slider handle.
         * @param {number} [options.handle1.start=0] - Initial position value for handle 1.
         * @param {string|null} [options.handle1.update=null] - Selector for an input field to sync handle 1 value with.
         * @param {Object} [options.handle2] - Configuration for the second slider handle (used if dual mode is enabled).
         * @param {number} [options.handle2.start=100] - Initial position value for handle 2.
         * @param {string|null} [options.handle2.update=null] - Selector for an input field to sync handle 2 value with.
         * @returns {jQuery} The jQuery object for chaining.
         */
        slider: async function (options, target = "input[type=range]") {
            app.addCSS("defslider ui", `
          .def-slider {
            position: relative;
            width: 100%;
            height: 5px;
            background-color: #e0e0e0;
            border-radius: 4px;
            margin: 20px 0;
            background-color: rgba(0, 0, 0, 0.25);
            border: 1px solid #ffffff29;
            border-radius: 5px;
            transition: border 1s ease-out;
          }
    
          .def-slider:hover {
                border: 1px solid #525252;
            }
    
          .def-slider .bar {
            position: absolute;
            height: 100%;
            background-color: #007bff;
            border-radius: 4px;
            z-index: 1;
          }
    
          .def-slider .slider-handle {
            position: absolute;
            top: -7px;
            width: 13px;
            height: 13px;
            background-color: #ffffff;
            border: 3px solid #ffffff;
            border-radius: 50%;
            cursor: pointer;
            z-index: 2;
            transform: translateX(-50%);
            box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.25);
            transition: all 200ms ease-out;
          }
    
          .def-slider .tooltip {
            position: absolute;
            top: -30px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #333;
            color: #fff;
            padding: 2px 6px;
            font-size: 12px;
            border-radius: 4px;
            display: none;
            z-index: 3;
          }`);

            if (!this.sliderLoaded) {
                this.sliderLoaded = app.load.loadFile("sandstorm/components/ui/slider.js")
                    .catch(error => {
                        app.dev.error(`Could not load slider.js:`, error);
                        this.sliderLoaded = null; // so it can try again next time
                    });
            }

            try {
                await this.sliderLoaded; // wait until ready
                $(target).defSlider(options); // run if plugin exists
            } catch (error) {
                console.error(`Error initializing defSlider:`, error);
            }

        },

        /**
         * Renders HTML dynamically based on the provided node object.
         * The node object can include properties for ID, style, class, rows, and columns.
         * Rows and columns can contain strings or nested objects with HTML content or further sub-nodes.
         * 
         * @param {Object} node - The node object containing properties for HTML rendering.
         * @param {string} [node.id] - The ID to assign to the HTML element.
         * @param {string|Object} [node.style] - The style to apply to the element (string or object with `style` and `className`).
         * @param {Array} [node.columns] - An array of columns to be rendered inside the element.
         * @param {Array} [node.rows] - An array of rows to be rendered inside the element.
         * @param {string} [node.rows[].html] - HTML content for a row (if it's an object).
         * @param {string} [node.columns[].html] - HTML content for a column (if it's an object).
         * @returns {jQuery} A jQuery object containing the rendered HTML.
         */
        renderHTML: function (node) {
            let $html = $('<div></div>');

            // Set ID, style, and class
            if (node.id) $html.attr('id', node.id);
            if (node.style) {
                if (typeof node.style === 'string') {
                    $html.attr('style', node.style);
                } else if (typeof node.style === 'object') {
                    if (node.style.style) $html.attr('style', node.style.style);
                    if (node.style.className) $html.addClass(node.style.className);
                }
            }

            // Add classes for columns/rows
            if (node.rows) $html.addClass('rows');
            if (node.columns) $html.addClass('columns');

            // Handle columns and rows separately
            if (Array.isArray(node.columns)) {
                node.columns.forEach(col => {
                    if (typeof col === "string") {
                        $html.append("<div>" + col + "</div>"); // Add text directly
                    } else if (col.html) {
                        $html.append($("<div>" + col.html + "</div>")); // Add HTML content directly
                    } else {
                        $html.append(generateHTML(col)); // Handle potential sub-nodes
                    }
                });
            }

            if (Array.isArray(node.rows)) {
                node.rows.forEach(row => {
                    if (typeof row === "string") {
                        $html.append("<div>" + row + "</div>"); // Add text directly
                    } else if (row.html) {
                        $html.append($("<div>" + row.html + "</div>")); // Add HTML content directly
                    } else {
                        $html.append(generateHTML(row)); // Handle potential sub-nodes
                    }
                });
            }

            return $html;
        },

        /**
         * Recursively processes and runs actions for all nodes and their nested content.
         * This function checks if a node or its child elements have defined actions and executes them.
         * It supports nested structures like rows, columns, and content arrays.
         * 
         * @param {Object} node - The node object that contains actions and other properties.
         * @param {Event|null} [event=null] - The event that triggered the action, if any.
         * @param {Array} [node.content] - Array of content items that may contain further nodes or strings.
         * @param {Array} [node.columns] - Array of column nodes that may contain further nodes.
         * @param {Array} [node.rows] - Array of row nodes that may contain further nodes.
         * @param {Object} [node.actions] - A set of actions to be executed for the node.
         * @param {string} [node.id] - The identifier for the node, used when calling actions.
         * @param {string} [item.id] - The identifier for a content item or column/row, used when calling actions.
         * @returns {void}
         */
        executeActions: function (node, event = null) {
            // Check if the node has actions and call it
            if (node.actions) {
                console.log("Processing node:", node.id);

                node.actions.call(node.id, event); // Call the action for the current node
            }

            // Handle content that is an array and loop over it
            if (node.content && Array.isArray(node.content)) {
                node.content.forEach((item) => {
                    // If item is an object with actions (like button objects)
                    if (typeof item === "object" && item.actions) {
                        item.actions(item.id, event);
                    }
                    // If item is a regular object (not a string), call executeActions recursively
                    else if (typeof item === "object" && !item.html) {
                        executeActions(item, event);
                    }
                });
            }

            // Check if node has columns and recursively handle them
            if (node.columns) {
                node.columns.forEach((col) => executeActions(col, event));
            }

            // Check if node has rows and recursively handle them
            if (node.rows) {
                node.rows.forEach((row) => executeActions(row, event));
            }
        },

        /**
         * Sets up rubber-band box-selection on a container element.
         *
         * The drag starts only when the user presses the left mouse button directly
         * on the container background (i.e. `e.target` must be `document.body`, a
         * `.blur-container`, or a `.select` element that equals the container).
         * Clicking on a child item does NOT start the box.
         *
         * A 5 px movement threshold prevents accidental misclicks from triggering the
         * selection box. The visual box is not appended to the DOM until the threshold
         * is crossed.
         *
         * All items matching `itemSelector` that exist anywhere in the document are
         * tested for intersection — this includes items dragged outside the container
         * (e.g. free-floating on `<body>`).
         *
         * Class manipulation and selection-state bookkeeping are intentionally left to
         * the caller via `onSelect` / `onMove` so this function stays generic.
         *
         * @param   {Element|string}          section        Container element, or a CSS
         *                                                    selector string. Falls back to
         *                                                    `document.body` when omitted.
         * @param   {string}                  itemSelector   CSS selector for candidate items
         *                                                    (e.g. `'.desktop-icon'`).
         *                                                    Defaults to `'.item'`.
         * @param   {function(Element[]):void} [onSelect]    Called on mouse-up with the
         *                                                    (possibly empty) array of items
         *                                                    inside the final rectangle.
         * @param   {function(Element[]):void} [onMove]      Called on every mousemove with
         *                                                    the live array of items currently
         *                                                    inside the rubber-band. Use to
         *                                                    apply a preview / hover state
         *                                                    (e.g. a `.selecting` CSS class).
         *                                                    Called with `[]` when the drag
         *                                                    ends so the preview can be cleared.
         * @returns {function():void}                         Cleanup — removes the mousedown
         *                                                    listener from the container.
         *
         * @example
         * app.ui.boxSelect(
         *     document.body,
         *     '.desktop-icon',
         *     // Final selection (mouse-up)
         *     selected => {
         *         clearMySelection();
         *         selected.forEach(el => el.classList.add('selected'));
         *     },
         *     // Live preview (during drag)
         *     live => {
         *         document.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selecting'));
         *         live.forEach(el => el.classList.add('selecting'));
         *     }
         * );
         */
        boxSelect: function (section, itemSelector, onSelect, onMove, overflow = false) {
            const container = typeof section === 'string'
                ? document.querySelector(section)
                : (section || document.body);
            const selector = itemSelector || '.item';
            if (!container) return function () {};

            const THRESHOLD    = 5;
            const SCROLL_ZONE  = 40;  // px from edge that triggers auto-scroll
            const SCROLL_SPEED = 12;  // max px per RAF tick

            let startX, startY, selectBox;
            let selecting        = false;
            let hasMoved         = false;
            let _ctrlDuringDrag  = false;
            let _scrollRafId     = null;
            let _dragMouseX      = 0;
            let _dragMouseY      = 0;
            let mouseMoveHandler, mouseUpHandler;

            // â”€â”€ Keyboard navigation state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let _anchor = null; // anchor element for shift-range selection
            let _cursor = null; // current keyboard cursor element
            let _active = false; // whether this container is the active boxSelect

            function _getItems() {
                return Array.from(document.querySelectorAll(selector));
            }

            // Find the item in the next visual row closest in x to curIdx
            function _findNextRow(items, curIdx) {
                if (curIdx >= items.length - 1) return curIdx;
                const curRect = items[curIdx].getBoundingClientRect();
                const curX = curRect.left + curRect.width / 2;
                let nextRowY = null;
                for (let i = curIdx + 1; i < items.length; i++) {
                    if (items[i].getBoundingClientRect().top > curRect.top + 5) {
                        nextRowY = items[i].getBoundingClientRect().top;
                        break;
                    }
                }
                if (nextRowY === null) return Math.min(curIdx + 1, items.length - 1);
                let best = -1, bestDist = Infinity;
                for (let i = 0; i < items.length; i++) {
                    const r = items[i].getBoundingClientRect();
                    if (Math.abs(r.top - nextRowY) < 5) {
                        const dist = Math.abs(r.left + r.width / 2 - curX);
                        if (dist < bestDist) { bestDist = dist; best = i; }
                    }
                }
                return best === -1 ? curIdx : best;
            }

            // Find the item in the previous visual row closest in x to curIdx
            function _findPrevRow(items, curIdx) {
                if (curIdx <= 0) return 0;
                const curRect = items[curIdx].getBoundingClientRect();
                const curX = curRect.left + curRect.width / 2;
                let prevRowY = null;
                for (let i = curIdx - 1; i >= 0; i--) {
                    if (items[i].getBoundingClientRect().top < curRect.top - 5) {
                        prevRowY = items[i].getBoundingClientRect().top;
                        break;
                    }
                }
                if (prevRowY === null) return Math.max(curIdx - 1, 0);
                let best = -1, bestDist = Infinity;
                for (let i = 0; i < items.length; i++) {
                    const r = items[i].getBoundingClientRect();
                    if (Math.abs(r.top - prevRowY) < 5) {
                        const dist = Math.abs(r.left + r.width / 2 - curX);
                        if (dist < bestDist) { bestDist = dist; best = i; }
                    }
                }
                return best === -1 ? curIdx : best;
            }

            // Track anchor/cursor when clicking an item, and set container active.
            // Shift+click fires range-select via onSelect so callers can apply it.
            const _onContainerMouseDown = function (e) {
                if (e.button !== 0) return;
                _active = true;
                const item = e.target.closest(selector);
                if (item) {
                    if (e.shiftKey && _anchor) {
                        const items = _getItems();
                        const ai = items.indexOf(_anchor);
                        const ci = items.indexOf(item);
                        if (ai !== -1 && ci !== -1) {
                            const from = Math.min(ai, ci);
                            const to   = Math.max(ai, ci);
                            if (typeof onSelect === 'function')
                                onSelect(items.slice(from, to + 1), false, true);
                            _cursor = item;
                            e._boxSelectShift = true;
                            return;
                        }
                    }
                    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) _anchor = item;
                    _cursor = item;
                }
            };

            // Deactivate when clicking outside the container
            const _onDocMouseDown = function (e) {
                if (!container.contains(e.target)) _active = false;
            };

            // Arrow key + Shift navigation
            const _onKeyDown = function (e) {
                if (!_active) return;
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

                // An editable field elsewhere on the page (e.g. a number
                // input's own spinner) owns arrow keys while it has focus —
                // _active only reflects "the last mousedown landed inside
                // this container", which stays true long after focus has
                // since moved to an unrelated input outside it.
                const ae = document.activeElement;
                if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

                const items = _getItems();
                if (items.length === 0) return;
                e.preventDefault();

                let curIdx = _cursor ? items.indexOf(_cursor) : (_anchor ? items.indexOf(_anchor) : -1);
                if (curIdx === -1) curIdx = 0;

                let nextIdx;
                if      (e.key === 'ArrowRight') nextIdx = Math.min(curIdx + 1, items.length - 1);
                else if (e.key === 'ArrowLeft')  nextIdx = Math.max(curIdx - 1, 0);
                else if (e.key === 'ArrowDown')  nextIdx = _findNextRow(items, curIdx);
                else                             nextIdx = _findPrevRow(items, curIdx);

                _cursor = items[nextIdx];
                _cursor.scrollIntoView({ block: 'nearest', inline: 'nearest' });

                if (e.shiftKey) {
                    // Extend range from anchor to new cursor
                    const anchorIdx = _anchor ? items.indexOf(_anchor) : nextIdx;
                    const from = Math.min(anchorIdx, nextIdx);
                    const to   = Math.max(anchorIdx, nextIdx);
                    if (typeof onSelect === 'function') onSelect(items.slice(from, to + 1));
                } else {
                    _anchor = _cursor;
                    if (typeof onSelect === 'function') onSelect([_cursor]);
                }
            };

            container.addEventListener('mousedown', _onContainerMouseDown);
            document.addEventListener('mousedown', _onDocMouseDown, true);
            document.addEventListener('keydown', _onKeyDown);
            // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

            function isValidBoxSelectTarget(e) {
                if (e.target === document.body) return true;
                if (!container.contains(e.target)) return false;
                if (e.target.closest('thead')) return false;
                // Ctrl/Cmd + drag anywhere in the container = additive box-select
                if ((e.ctrlKey || e.metaKey) && container.contains(e.target)) return true;
                if (typeof selector === 'string' && e.target.closest(selector)) return false;
                return (
                    container.classList.contains('blur-container') ||
                    container.classList.contains('select') ||
                    e.target === container
                );
            }

            function hitTest(rect) {
                const hits = [];
                document.querySelectorAll(selector).forEach(item => {
                    const r = item.getBoundingClientRect();
                    if (r.right > rect.x && r.left < rect.x + rect.width &&
                        r.bottom > rect.y && r.top  < rect.y + rect.height) {
                        hits.push(item);
                    }
                });
                return hits;
            }

            function _refreshSelectBox(mx, my) {
                if (!hasMoved) return;
                let rect;
                if (overflow) {
                    const cr = container.getBoundingClientRect();
                    const ox1 = startX - cr.left + container.scrollLeft;
                    const oy1 = startY - cr.top  + container.scrollTop;
                    const ox2 = mx     - cr.left + container.scrollLeft;
                    const oy2 = my     - cr.top  + container.scrollTop;
                    Object.assign(selectBox.style, {
                        left:   `${Math.min(ox1, ox2)}px`,
                        top:    `${Math.min(oy1, oy2)}px`,
                        width:  `${Math.abs(ox2 - ox1)}px`,
                        height: `${Math.abs(oy2 - oy1)}px`
                    });
                    rect = {
                        x: Math.min(mx, startX), y: Math.min(my, startY),
                        width: Math.abs(mx - startX), height: Math.abs(my - startY),
                    };
                } else {
                    rect = {
                        x: Math.min(mx, startX), y: Math.min(my, startY),
                        width: Math.abs(mx - startX), height: Math.abs(my - startY),
                    };
                    Object.assign(selectBox.style, {
                        left: `${rect.x}px`, top: `${rect.y}px`,
                        width: `${rect.width}px`, height: `${rect.height}px`
                    });
                }
                if (typeof onMove === 'function') onMove(hitTest(rect));
            }

            function _autoScrollTick() {
                if (!selecting || !hasMoved) { _scrollRafId = null; return; }
                const cr   = container.getBoundingClientRect();
                const relY = _dragMouseY - cr.top;
                let dy = 0;
                if (relY >= 0 && relY < SCROLL_ZONE)
                    dy = -SCROLL_SPEED * (1 - relY / SCROLL_ZONE);
                else if (relY <= cr.height && relY > cr.height - SCROLL_ZONE)
                    dy = SCROLL_SPEED  * (1 - (cr.height - relY) / SCROLL_ZONE);
                // No longer in scroll zone — stop and let mouseMoveHandler restart if needed
                if (dy === 0) { _scrollRafId = null; return; }
                const before = container.scrollTop;
                container.scrollTop += Math.round(dy);
                if (container.scrollTop !== before) {
                    _refreshSelectBox(_dragMouseX, _dragMouseY);
                    _scrollRafId = requestAnimationFrame(_autoScrollTick);
                } else {
                    // Hit scroll limit — stop RAF, mouseMoveHandler restarts on zone re-entry
                    _scrollRafId = null;
                }
            }

            function onMouseDown(e) {
                if (e.button !== 0) return;
                _ctrlDuringDrag = e.ctrlKey || e.metaKey;
                $("#select-box").remove();

                if (!isValidBoxSelectTarget(e)) return;

                startX   = e.clientX;
                startY   = e.clientY;
                hasMoved = false;

                const _parentWindow  = container.closest('.window');
                const _parentDesktop = container.closest('.desktop-icons, .desktop');
                let _boxZ = 4999;
                if (_parentWindow) {
                    const wz = parseInt(_parentWindow.style.zIndex, 10);
                    _boxZ = (isNaN(wz) ? 5000 : wz) + 1;
                } else if (_parentDesktop) {
                    _boxZ = 4999;
                }

                // Prepare container for overflow=true mode
                if (overflow) {
                    const cs = getComputedStyle(container);
                    if (cs.position === 'static') container.style.position = 'relative';
                }

                selectBox = document.createElement('div');
                Object.assign(selectBox.style, {
                    position: overflow ? 'absolute' : 'fixed',
                    left: '0px',
                    top: '0px',
                    width: '0px',
                    height: '0px',
                    background: 'linear-gradient(144deg, rgba(37, 37, 37, 0.3) 0%, rgb(10 10 10 / 20%) 47%)',
                    boxShadow: '1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29',
                    border: 'none',
                    zIndex: String(_boxZ),
                    pointerEvents: 'none'
                });
                selectBox.classList.add('select-box');
                selectBox.id = "select-box";
                selecting = true;

                mouseMoveHandler = function (eMove) {
                    if (!selecting) return;
                    _dragMouseX = eMove.clientX;
                    _dragMouseY = eMove.clientY;

                    if (!hasMoved) {
                        if (Math.abs(_dragMouseX - startX) < THRESHOLD &&
                            Math.abs(_dragMouseY - startY) < THRESHOLD) return;
                        hasMoved = true;
                        if (overflow) {
                            container.appendChild(selectBox);
                        } else {
                            document.body.appendChild(selectBox);
                        }
                    }

                    _refreshSelectBox(_dragMouseX, _dragMouseY);

                    // (Re)start auto-scroll RAF when mouse enters a scroll zone
                    if (overflow && _scrollRafId === null) {
                        const cr   = container.getBoundingClientRect();
                        const relY = _dragMouseY - cr.top;
                        if ((relY >= 0 && relY < SCROLL_ZONE) ||
                            (relY <= cr.height && relY > cr.height - SCROLL_ZONE))
                            _scrollRafId = requestAnimationFrame(_autoScrollTick);
                    }
                };

                mouseUpHandler = function () {
                    if (!selecting) return;
                    selecting = false;

                    if (_scrollRafId !== null) {
                        cancelAnimationFrame(_scrollRafId);
                        _scrollRafId = null;
                    }

                    document.removeEventListener('mousemove', mouseMoveHandler);
                    document.removeEventListener('mouseup',   mouseUpHandler);

                    if (typeof onMove === 'function') onMove([]);

                    if (selectBox && selectBox.parentNode) {
                        const boxRect = selectBox.getBoundingClientRect();
                        selectBox.parentNode.removeChild(selectBox);

                        const rect = {
                            x: boxRect.left, y: boxRect.top,
                            width: boxRect.width, height: boxRect.height
                        };
                        const hits = hitTest(rect);
                        // Update keyboard anchor/cursor after drag selection
                        if (hits.length > 0) {
                            _anchor = hits[0];
                            _cursor = hits[hits.length - 1];
                        }
                        if (typeof onSelect === 'function') onSelect(hits, _ctrlDuringDrag);
                    } else if (!hasMoved) {
                        // Plain click on container background — clear selection
                        _anchor = null;
                        _cursor = null;
                        if (typeof onSelect === 'function') onSelect([], false);
                    }
                };

                document.addEventListener('mousemove', mouseMoveHandler);
                document.addEventListener('mouseup',   mouseUpHandler);
            }

            container.addEventListener('mousedown', onMouseDown);

            return function cleanup() {
                container.removeEventListener('mousedown', onMouseDown);
                container.removeEventListener('mousedown', _onContainerMouseDown);
                document.removeEventListener('mousedown', _onDocMouseDown, true);
                document.removeEventListener('keydown', _onKeyDown);
            };
        },

        /**
         * Drag-and-drop between any two boxSelect containers.
         * Attach to a source container; items matching itemSelector are draggable.
         * Drop targets are any elements matching dropSelector anywhere in the document.
         *
         * @param {HTMLElement|string} container   Source container element or selector
         * @param {string} itemSelector            CSS selector for draggable items
         * @param {string} dropSelector            CSS selector for valid drop targets
         * @param {object} [options]
         *   onOver(items, target, e)  → return false to deny drop
         *   onLeave(target)           → mouse left target without dropping
         *   onDrop(items, target, e)  → items dropped on target
         *   onStart(items, e)         → drag started
         *   onCancel(items, e)        → drag ended on non-target
         * @returns {function} cleanup
         */
        dragDrop: function (container, itemSelector, dropSelector, options = {}) {
            const el = typeof container === 'string'
                ? document.querySelector(container)
                : (container || document.body);
            if (!el) return function () {};

            const { onStart = null, onOver = null, onLeave = null, onDrop = null, onCancel = null } = options;
            const THRESHOLD = 5;
            let _ghost = null, _overTarget = null;

            function _createGhost(items, x, y) {
                const g = document.createElement('div');
                g.className = 'dd-ghost';
                Object.assign(g.style, {
                    position: 'fixed', pointerEvents: 'none', zIndex: '99999',
                    left: x + 'px', top: y + 'px',
                    transform: 'translate(-50%,-50%) scale(0.92)',
                    opacity: '0',
                    transition: 'opacity 0.12s ease, transform 0.12s ease',
                    willChange: 'transform,opacity',
                });
                // A <tr> (Explorer's list-view rows) cloned outside its own
                // <table>/<tbody> loses table layout entirely — cells
                // collapse to their content width and overlap, since a <tr>
                // has no meaningful rendering on its own. Build a compact
                // icon+name chip from just the row's own name cell instead
                // of trying to preserve a multi-column table layout in a
                // floating, non-table ghost. Grid items are plain <div>s
                // already and clone correctly as-is.
                let clone;
                if (items[0].tagName === 'TR') {
                    const nameCell = items[0].querySelector('td[data-col="name"]');
                    clone = document.createElement('div');
                    clone.className = 'exp-row-ghost';
                    clone.innerHTML = nameCell ? nameCell.innerHTML : items[0].textContent;
                } else {
                    clone = items[0].cloneNode(true);
                }
                clone.removeAttribute('id');
                clone.style.cssText += ';pointer-events:none;margin:0;';
                g.appendChild(clone);
                if (items.length > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'dd-ghost-badge';
                    badge.textContent = items.length;
                    g.appendChild(badge);
                }
                document.body.appendChild(g);
                requestAnimationFrame(() => {
                    g.style.opacity = '1';
                    g.style.transform = 'translate(-50%,-50%) scale(1)';
                });
                return g;
            }

            function _removeGhost() {
                if (!_ghost) return;
                const g = _ghost; _ghost = null;
                g.style.opacity = '0';
                g.style.transform = 'translate(-50%,-50%) scale(0.88)';
                setTimeout(() => g.remove(), 150);
            }

            function _setOver(tgt, allowed) {
                if (_overTarget === tgt) return;
                if (_overTarget) {
                    _overTarget.classList.remove('dd-over', 'dd-over-deny');
                    if (typeof onLeave === 'function') onLeave(_overTarget);
                }
                _overTarget = tgt;
                if (_overTarget) _overTarget.classList.add(allowed ? 'dd-over' : 'dd-over-deny');

                // Invalid-target feedback is the cursor itself, not a red
                // outline on the target — matches real OS drag-and-drop UX.
                // Released back to normal auto-detection the moment the
                // target becomes valid, changes, or the drag ends (this
                // same call already runs with tgt:null then).
                if (app.exists("app.cursor.systemSet")) {
                    app.cursor.systemSet(_overTarget && !allowed ? 'cursor-unavailable' : null);
                }
            }

            function _onMouseDown(e) {
                if (e.button !== 0) return;
                const hitItem = e.target.closest(itemSelector);
                if (!hitItem) return;
                e.preventDefault();
                app.dev?.log?.(`dragDrop: mousedown on draggable item (itemSelector="${itemSelector}") — tracking for drag start`, 'DragDrop');

                let startX = e.clientX, startY = e.clientY, started = false, dragItems = [];

                function onMove(eM) {
                    if (!started) {
                        if (Math.abs(eM.clientX - startX) < THRESHOLD &&
                            Math.abs(eM.clientY - startY) < THRESHOLD) return;
                        started = true;
                        const all = Array.from(document.querySelectorAll(itemSelector));
                        dragItems = all.filter(i => i.classList.contains('exp-selected'));
                        if (!dragItems.length || !dragItems.includes(hitItem)) dragItems = [hitItem];
                        app.dev?.log?.(`dragDrop: threshold crossed — drag started with ${dragItems.length} item(s)`, 'DragDrop');
                        _ghost = _createGhost(dragItems, eM.clientX, eM.clientY);
                        dragItems.forEach(i => i.classList.add('dd-dragging'));
                        if (typeof onStart === 'function') onStart(dragItems, eM);
                    }
                    if (_ghost) { _ghost.style.left = eM.clientX + 'px'; _ghost.style.top = eM.clientY + 'px'; }
                    const under = document.elementFromPoint(eM.clientX, eM.clientY);
                    const tgt = under ? under.closest(dropSelector) : null;
                    if (tgt !== _overTarget) {
                        const ok = tgt
                            ? (typeof onOver === 'function' ? onOver(dragItems, tgt, eM) !== false : true)
                            : false;
                        _setOver(tgt, ok);
                    }
                }

                function onUp(eU) {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    if (!started) {
                        app.dev?.log?.('dragDrop: mouseup before threshold crossed — treated as a plain click, no drag', 'DragDrop');
                        return;
                    }
                    dragItems.forEach(i => i.classList.remove('dd-dragging'));
                    const tgt = _overTarget;
                    _setOver(null, false);
                    _removeGhost();
                    if (!tgt) {
                        // Diagnostic: what elementFromPoint actually found at
                        // the drop point, whether or not it matched
                        // dropSelector — the raw ground truth for why this
                        // was rejected, since _overTarget only ever holds
                        // something once onOver has already matched it.
                        const rawUnder = document.elementFromPoint(eU.clientX, eU.clientY);
                        app.dev?.log?.(`dragDrop: mouseup — no valid target under pointer, cancelling. Raw element at (${eU.clientX},${eU.clientY}): ` +
                            (rawUnder ? `<${rawUnder.tagName.toLowerCase()} id="${rawUnder.id}" class="${rawUnder.className}" data-kind="${rawUnder.dataset?.kind ?? ''}" data-fspath="${rawUnder.dataset?.fspath ?? ''}" data-folder="${rawUnder.dataset?.folder ?? ''}">` : 'null'), 'DragDrop');
                    } else {
                        app.dev?.log?.(`dragDrop: mouseup — dropped on <${tgt.tagName.toLowerCase()} class="${tgt.className}">`, 'DragDrop');
                    }
                    if (tgt) { if (typeof onDrop   === 'function') onDrop(dragItems, tgt, eU); }
                    else     { if (typeof onCancel === 'function') onCancel(dragItems, eU); }
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            }

            el.addEventListener('mousedown', _onMouseDown);
            return function cleanup() { el.removeEventListener('mousedown', _onMouseDown); };
        },

        /**
         * Declarative UI builder.
         * Converts a node definition object into an HTML string via .render().
         *
         * Supported node types (as object keys):
         *   container / block  — <div class style id subs html>
         *   aero-button        — OS standard button
         *   aero-button-m      — Small OS button (with optional pulse)
         *   aero-text          — Styled text element
         *   html               — Raw HTML string (value must be string)
         *   script             — Async script loader: { path, call }
         *
         * @param  {Object} nodeDef  Root node definition, e.g. { container: { ... } }
         * @returns {{ render: function(): string }}
         *
         * @example
         * const html = os.ui.body({
         *   container: {
         *     className: "my-panel",
         *     style: { padding: "20px" },
         *     subs: [
         *       { block: { html: "<p>Hello</p>" } },
         *       { "aero-button": { value: "OK" } }
         *     ]
         *   }
         * }).render();
         */
        body: function (nodeDef) {

            function buildStyle(style) {
                if (!style) return '';
                if (typeof style === 'string') return ` style="${style}"`;
                const css = Object.entries(style)
                    .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
                    .join(';');
                return css ? ` style="${css}"` : '';
            }

            function renderNode(def) {
                if (!def) return '';
                if (typeof def === 'string') return def;

                const key  = Object.keys(def)[0];
                const node = def[key];

                switch (key) {
                    case 'container':
                    case 'block': {
                        const cls      = node.className || '';
                        const idAttr   = node.id ? ` id="${node.id}"` : '';
                        const styleAttr = buildStyle(node.style);
                        const inner    = (node.subs || []).map(renderNode).join('') + (node.html || '');
                        return `<div class="${cls}"${idAttr}${styleAttr}>${inner}</div>`;
                    }
                    case 'aero-button': {
                        const cls = ['aero-button', node.className || ''].filter(Boolean).join(' ');
                        return `<div class="${cls}">${node.value || ''}</div>`;
                    }
                    case 'aero-button-m': {
                        const cls   = ['aero-button-m', node.className || ''].filter(Boolean).join(' ');
                        const pulse = node.pulse
                            ? `<div class="after pulse" style="left:${node.pulse.left || '24px'};top:${node.pulse.top || '39px'};"></div>`
                            : '';
                        return `<div class="${cls}">${node.value || ''}${pulse}</div>`;
                    }
                    case 'aero-text': {
                        const cls = ['aero-text', node.className || ''].filter(Boolean).join(' ');
                        return `<div class="${cls}">${node.value || ''}</div>`;
                    }
                    case 'html':
                        return typeof node === 'string' ? node : (node.value || '');
                    case 'script':
                        return `<span class="ui-body-script" data-ui-path="${node.path || ''}" data-ui-call="${node.call || ''}" style="display:none"></span>`;
                    default:
                        return '';
                }
            }

            const rootKey  = Object.keys(nodeDef)[0];
            const rootHtml = renderNode({ [rootKey]: nodeDef[rootKey] });

            return {
                render() {
                    // Process { script } nodes asynchronously after HTML is in DOM
                    setTimeout(async () => {
                        const scripts = document.querySelectorAll('.ui-body-script[data-ui-path]');
                        for (const el of scripts) {
                            const path = el.dataset.uiPath;
                            const call = el.dataset.uiCall;
                            if (!path || !call) { el.remove(); continue; }
                            try {
                                const root = app.config?.local?.ProgramRoot || '';
                                const mod  = await app.importFile(root + path);
                                if (mod && typeof mod[call] === 'function') mod[call](app);
                            } catch (e) {
                                app.dev?.error?.(`ui.body script error (${path}):`, e);
                            }
                            el.remove();
                        }
                    }, 0);
                    return rootHtml;
                }
            };
        }
    };

    const _UI_DEP_MODULES = { dropmenu: 'ui/dropmenu.js', check: 'ui/checkbox.js', radio: 'ui/radio.js' };

    /**
     * Lazily loads one or more shared `app.ui.*` sub-modules if not already
     * present, collapsing the `if (!os.ui.X) { includeModule; setup }` guard
     * repeated across callers (Control Panel panels, Designer dialogs) into
     * one call.
     * @param {object} os - The app instance (usually just `app`).
     * @param {string[]} names - Keys into `_UI_DEP_MODULES`, e.g. ['dropmenu', 'check'].
     */
    app.ui.ensureLoaded = async function (os, names) {
        for (const name of names) {
            if (os.ui[name]) continue;
            const path = _UI_DEP_MODULES[name];
            if (!path) continue;
            const mod = await os.includeModule(os.config.local.ComponentsRoot + path);
            if (mod?.setup) mod.setup(os);
        }
    };

})((window.app = window.app || {}));
