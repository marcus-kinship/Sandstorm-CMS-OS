/**
 * @file desktop.js
 * @description Desktop environment controller for Sandstorm OS.
 *
 * Registers `app.desktop` — the central manager for the visual desktop layer.
 *
 * Responsibilities:
 * - Apply and reset the user theme via CSS variables (`applyUserThemeSettings`).
 * - Wake-up overlay: fade-in/out when the browser tab regains focus.
 * - Responsive window layout: rearrange open windows for mobile / tablet / desktop breakpoints.
 * - Desktop background: set image, CSS, blur and cycling additional images.
 * - Context menu registry: `buildContextMenuList`, `contextMenuInit`, `contextMenu`.
 * - Extensible "New" submenu and desktop background context menu.
 *
 * @module components/desktop
 *
 * @example
 * // Set background in the startup sequence:
 * app.desktop.setBackgroundImage({ image: "wallpaper/bg.jpg", size: "cover" });
 *
 * // Register a desktop context menu item:
 * app.desktop.buildContextMenuList("body", { title: "Refresh", callback: () => location.reload() });
 */
(function (app) {

    applyUserThemeSettings();

    let _contextMenus = {};
    let wakeUpRun = false;

    let caretRAF = null;

    /**
     * Resolves a mixed list of plain context-menu-item objects and
     * `() => item|null` factory functions into a flat, deduped array of
     * plain items. Factories are called fresh every time this runs (never
     * cached) so a `title: () => _('X')`-thunk-bearing item — or an entire
     * `() => ({...})` factory entry — always reflects the current language,
     * not whatever was active when it was registered. Consolidated here
     * (was previously duplicated as `app.desktop.contextMenu._build()`)
     * so every `contextMenuInit` target gets the same live-resolution
     * behavior, not just the desktop background.
     *
     * @param {Array<object|Function>} list
     * @returns {object[]}
     */
    function _resolveMenuItems(list) {
        return list
            .map(e => typeof e === 'function' ? e() : e)
            .filter(Boolean)
            .filter((v, i, a) => a.findIndex(t => t.title === v.title) === i);
    }



    app.desktop = {
        backgroundOptions: [],
       
        /**
         * Shows a black fade-out overlay when the page becomes visible again (e.g. after tab switch).
         * Only runs if `app.config.user.settings.desktop.wakeUpEnabled` is true.
         * Installs a `visibilitychange` listener on first call so subsequent tab returns
         * automatically trigger the effect.
         *
         * @function wakeUp
         * @memberof app.desktop
         */
        wakeUp: function () {

            if (!app.config.user.settings.desktop.wakeUpEnabled) {
                return;
            }
          
            let overlay = document.getElementById('os-wakeup-overlay');

            // Skapa overlay om den inte finns
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'os-wakeup-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    background: '#000',
                    opacity: '0',
                    pointerEvents: 'none',
                    transition: 'opacity 0.8s ease-out',
                    zIndex: 9999
                });
                document.body.appendChild(overlay);
            }

            // Visa svart direkt
            overlay.style.transition = 'none';
            overlay.style.opacity = '1';

            // Tvinga repaint
            overlay.offsetHeight;

            // Lägg tillbaka transition för toning
            overlay.style.transition = 'opacity 0.8s ease-out';

            // Tona ut
            setTimeout(() => {
                overlay.style.opacity = '0';

                overlay.addEventListener('transitionend', function handler() {
                    overlay.removeEventListener('transitionend', handler);
                    overlay.remove();
                });
            }, 50);

            if (!wakeUpRun) {
                wakeUpRun = true;
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        if (!app.config.user.settings.desktop.wakeUpEnabled) {
                            return;
                        }
                        app.desktop.wakeUp();
                    }
                });
            }

         },

        /**
         * Returns the available workspace rect in px, accounting for the taskbar
         * position on any of the four sides (left/right/top/bottom).
         * Used by the layout engine, maximize, snap, cascade, and any future
         * layout features — centralised here so all callers stay consistent.
         *
         * @returns {{ x: number, y: number, width: number, height: number }}
         */
        getWorkspaceRect: function () {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const $tb = $('.taskbar-s');
            if (!$tb.length) return { x: 0, y: 0, width: vw, height: vh };
            const tw = $tb.outerWidth();
            const th = $tb.outerHeight();
            if ($tb.hasClass('taskbar-left'))  return { x: tw, y: 0,  width: vw - tw, height: vh      };
            if ($tb.hasClass('taskbar-right')) return { x: 0,  y: 0,  width: vw - tw, height: vh      };
            if ($tb.hasClass('taskbar-top'))   return { x: 0,  y: th, width: vw,      height: vh - th };
            return                                    { x: 0,  y: 0,  width: vw,      height: vh - th };
        },

        /**
         * Arranges all visible windows in a classic cascade (diagonal offset stack).
         * Each window is moved to its natural size at an offset position; no resizing.
         * Can be triggered on demand (keyboard shortcut, context menu, etc.).
         * Uses the same workspace rect as the layout engine so the cascade respects
         * whichever side the taskbar is on.
         *
         * @function cascadeWindows
         * @memberof app.desktop
         */
        cascadeWindows: function () {
            const STEP = 30;
            const ws   = app.desktop.getWorkspaceRect();
            const $wins = $('.window:visible:not(.ui-resizable-resizing):not(.ui-draggable-dragging)');
            if ($wins.length === 0) return;

            // Sort back-to-front so the most recently focused window ends up on top
            const sorted = $wins.toArray().sort((a, b) =>
                (parseInt($(a).css('z-index'), 10) || 0) - (parseInt($(b).css('z-index'), 10) || 0)
            );

            sorted.forEach((el, i) => {
                const $win = $(el);
                const x = Math.min(ws.x + i * STEP, ws.x + ws.width  - $win.outerWidth()  - STEP);
                const y = Math.min(ws.y + i * STEP, ws.y + ws.height - $win.outerHeight() - STEP);
                $win.css({ position: 'absolute', left: Math.max(ws.x, x) + 'px', top: Math.max(ws.y, y) + 'px' });
            });
        },

        /**
         * Historically set up the whole responsive-arrange engine on first
         * call (guarded by `_rwInit`). That engine now lives in
         * `sandstorm/components/responsivelayout/engine.js`, which self-
         * initializes during boot (`responsivelayout/index.js`'s `setup(app)`,
         * a `programs` array entry — runs before any window can possibly
         * exist, so it needs no lazy trigger). This is kept as an inert stub
         * purely so `ui/window/dragresize.js:733`'s existing unconditional
         * call site doesn't throw; `app.desktop.responsiveArrange` is set by
         * `engine.js` itself.
         *
         * @function responsiveWindows
         * @memberof app.desktop
         */
        responsiveWindows: function () {},

        /**
         * Resets the theme configuration by re-applying the user's theme settings.
         * 
         * This is a reference to the `applyUserThemeSettings` function,
         * allowing it to be called later as `app.resetConfigTheme()`.
         * 
         * Example:
         * app.resetConfigTheme();
         * 
         * @function
         */
        resetConfigTheme: applyUserThemeSettings,
        /**
         * Sets the background image of the desktop and configures the context menu.
         * @param {object} options - Options for setting the background and context menu.
         * @param {string} options.image - The URL of the background image.
         * @param {string} [options.size='cover'] - Background size (e.g., 'cover', 'contain').
         * @param {string} [options.repeat='no-repeat'] - Background repeat option (e.g., 'no-repeat', 'repeat').
         * @param {string} [options.position='center center'] - Background position (e.g., 'center center', 'top left').
         * @param {string} [options.color='#ffffff'] - Background color (fallback or overlay).
         * @param {string} [options.blur='0px'] - Blur effect to apply (e.g., '5px').
         * @param {Array} [options.additionalImages=[]] - An array of additional image URLs.
         */
        setBackgroundImage: async function (options = {}) {
            // Auto-initialize if not already done
            if (!Array.isArray(this.backgroundOptions)) {
                this.backgroundOptions = [];
            }

            const {
                image,
                size = "cover",
                repeat = "no-repeat",
                position = "center center",
                color = "#ffffff",
                blur = "0px",
                additionalImages = [],
            } = options;

            // Save options to backgroundOptions array — the ORIGINAL url,
            // never the object URL resolved below (that one gets revoked
            // once superseded, so it can't be treated as a persisted path).
            this.backgroundOptions.push({ image, size, repeat, position, color, blur, additionalImages });

            // Genuinely wait for the image before painting it, instead of
            // just pointing a CSS url() at it and returning immediately — a
            // CSS background-image starts fetching once the rule lands, but
            // paints whenever the browser gets around to it, with nothing
            // for a caller to await. That gap is what let icons/taskbar
            // build (and the boot sequence's own loading-screen removal)
            // run and reveal before the wallpaper had actually finished
            // loading on a slow connection — this function is `async` and
            // every call site in the boot `start:` sequence already awaits
            // it, so making the wait real is enough to fix the ordering,
            // with no separate overlay system needed.
            //
            // fetch()+blob() gives a real promise to await AND reuses the
            // exact same downloaded bytes for painting via an object URL —
            // a previous attempt at this used a parallel `Image()` preload
            // next to the CSS url() rule, but those are two independent
            // resource loads to the browser regardless of ordering, and
            // produced two real network requests for the same wallpaper
            // every boot (see git history / NOTES.md). A 15s cap keeps a
            // genuinely stuck fetch (offline, bad URL) from blocking the
            // rest of boot forever — it's a safety valve, not the expected
            // path; legitimate wallpaper images load well within it even on
            // a slow connection.
            let resolvedUrl = size === "none" ? null : image;
            if (resolvedUrl) {
                try {
                    const blob = await Promise.race([
                        fetch(resolvedUrl).then(r => {
                            if (!r.ok) throw new Error(`HTTP ${r.status}`);
                            return r.blob();
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 15000)),
                    ]);
                    resolvedUrl = URL.createObjectURL(blob);

                    // fetch()+blob() only guarantees the BYTES are downloaded —
                    // the browser still has to decode them into a paintable
                    // bitmap, which normally happens lazily on first paint, not
                    // here. Without this, the CSS swap below can land a frame
                    // (or more, on a large image / slow device) before there's
                    // actually anything decoded to show, during which body's
                    // background-color fallback (white by default) is what's
                    // briefly visible instead of the old *or* new wallpaper —
                    // decode() forces that work to happen now, while the old
                    // background is still the one on screen.
                    try {
                        const probe = new Image();
                        probe.src = resolvedUrl;
                        await probe.decode();
                    } catch (decodeErr) {
                        // Not fatal — worst case reverts to the old lazy-paint
                        // behavior for this one image instead of blocking it.
                        app.dev.warn(`Background image decode failed, applying anyway: ${decodeErr.message}`, 'Desktop');
                    }
                } catch (e) {
                    app.dev.warn(`Background image preload failed, showing "${image}" anyway: ${e.message}`, 'Desktop');
                    resolvedUrl = image; // fall back to the raw URL rather than no wallpaper at all
                }
            }

            // Revoke the previous object URL only now, after the new
            // background-image rule below has taken over — revoking it
            // first would blank the still-visible old wallpaper for a frame.
            const previousObjectUrl = this._bgObjectUrl;
            this._bgObjectUrl = (typeof resolvedUrl === 'string' && resolvedUrl.startsWith('blob:')) ? resolvedUrl : null;

            this.applyBackgroundCss(resolvedUrl, { size, repeat, position, color, blur, additionalImages });

            if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
        },

        /**
         * Applies the background CSS to the document body.
         * @param {string} imageUrl - The URL of the background image.
         * @param {object} options - Options for the background CSS.
         * @param {string} [options.size='cover'] - Background size.
         * @param {string} [options.repeat='no-repeat'] - Background repeat.
         * @param {string} [options.position='center center'] - Background position.
         * @param {string} [options.color='#ffffff'] - Background color.
         * @param {string} [options.blur='0px'] - Blur effect for the background.
         * @param {Array} [options.additionalImages=[]] - Additional images to layer.
         */
        applyBackgroundCss: function (imageUrl, { size, repeat, position, color, blur, additionalImages }) {
            // Construct the CSS for the background

            // Check if the blur container already exists
            if (!$('.blur-container').length) {
                // Create the blur container div
                const blurContainer = $('<div class="blur-container"></div>').css({
                    'backdrop-filter': 'none',
                    'position': 'fixed',
                    'top': '0',
                    'left': '0',
                    'width': '100%',
                    'height': '100%',
                    'z-index': '10', // Ensure this is higher than other elements
                    'pointer-events': 'none'
                });

                // Append the blur container to the body
                $('body').append(blurContainer);
            }

            // size:"none" means "no background image" — show only the background color.
            const backgroundImageCss = size === "none" ? "none" : `url('${imageUrl}')`;

            const backgroundCss = `
        body {
          background-image: ${backgroundImageCss};
          background-size: ${size};
          background-repeat: ${repeat};
          background-position: ${position};
          background-color: ${color};
        }`;

            $('.blur-container').css('backdrop-filter', `blur(${blur})`);

            // Append the new background CSS to the style element.
            // app.addCSS() silently no-ops on a duplicate identifier (see its
            // own doc comment) — this call always uses the same fixed name,
            // so without removing the old block first, only the very first
            // background ever set in a session actually took effect; every
            // later change (Control Panel background swap, "Select from
            // PC", etc.) was a no-op with no error, and no way to tell from
            // the caller's side that nothing happened.
            app.removeCSS('Apply background CSS to the document body');
            app.addCSS('Apply background CSS to the document body', backgroundCss);

            // Apply additional images if any
            if (additionalImages.length > 0) {
                this.applyAdditionalBackgroundImages(additionalImages);
            }
        },

        /**
         * Applies additional background images and switches between them every 30 seconds with a fade effect.
         * @param {Array} additionalImages - Array of additional image URLs.
         */
        applyAdditionalBackgroundImages: function (additionalImages) {
            let currentImageIndex = 0;

            // Create an element for each additional image and hide it initially
            additionalImages.forEach((imgUrl, index) => {
                const imgElement = document.createElement("div");
                imgElement.style.backgroundImage = `url(${imgUrl})`;
                imgElement.style.position = "absolute";
                imgElement.style.top = 0;
                imgElement.style.left = 0;
                imgElement.style.width = "100%";
                imgElement.style.height = "100%";
                imgElement.style.zIndex = -1 - index; // Stack images behind each other
                imgElement.style.opacity = 0; // Hide the image initially
                imgElement.style.transition = "opacity 1.5s ease-in-out"; // Smooth fade effect
                document.body.appendChild(imgElement);
            });

            const imgElements = document.querySelectorAll("body > div[style*='background-image']");

            // Function to switch between images
            function switchImage() {
                imgElements.forEach((imgElement, index) => {
                    imgElement.style.opacity = 0; // Hide all images
                });

                // Fade in the current image
                imgElements[currentImageIndex].style.opacity = 1;

                // Move to the next image index
                currentImageIndex = (currentImageIndex + 1) % imgElements.length;
            }

            // Start switching images every 30 seconds
            setInterval(switchImage, 30000); // 30000 milliseconds = 30 seconds

            // Initial display of the first image
            switchImage();
        },

        /**
         * Builds a list of context menu items for a given element (e.g. "body").
         * Flexible: supports 2 or 3 arguments. `item` may be a plain object,
         * an array of plain objects, or a `() => item|null` factory function
         * (or array of factories) — factories are resolved fresh on every
         * menu open by `contextMenuInit`, not here, so a conditional entry
         * (e.g. "Paste" only when the clipboard has something) and live
         * translation both work no matter when it was registered.
         *
         * @param {number|string} sortOrTarget - Sort number if 3 args, or target if 2 args.
         * @param {string|object|Array} targetOrItem - Target if 3 args, or item if 2 args.
         * @param {object|Array} [item] - Menu item(s) if 3 args.
         */
        buildContextMenuList: function (sortOrTarget, targetOrItem, item) {
            let sort, target, items;

            if (item !== undefined) {
                // Three arguments: sort, target, item
                sort = sortOrTarget;
                target = targetOrItem;
                items = Array.isArray(item) ? item : [item];

                // Assign the given sort number to each item. Works on
                // factory functions too — functions are objects, so
                // tagging `.sort` directly on one is harmless and lets
                // sorting below stay agnostic to whether an entry is a
                // plain item or still needs to be resolved.
                items.forEach(i => i.sort = sort);
            } else {
                // Two arguments: target, item → append at the end
                target = sortOrTarget;
                items = Array.isArray(targetOrItem) ? targetOrItem : [targetOrItem];

                // Determine the highest current sort number and assign next numbers
                if (!_contextMenus[target]) _contextMenus[target] = [];
                const maxSort = _contextMenus[target].reduce(
                    (max, curr) => Math.max(max, curr.sort ?? 0),
                    0
                );
                items.forEach(i => i.sort = maxSort + 1);
            }

            if (!_contextMenus[target]) _contextMenus[target] = [];

            // Add the new items. Dedup-by-title deliberately does NOT happen
            // here — for a factory-function entry, `.title` only exists on
            // the object it *returns*, not the function itself, so comparing
            // titles at this point would treat every factory entry as a
            // duplicate of every other one. Deduping happens once, at read
            // time in contextMenuInit's _resolveMenuItems() call, after
            // everything has already been resolved to plain objects.
            _contextMenus[target].push(...items);

            // Sort the list by the sort number
            _contextMenus[target].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        },


        /**
         * Binds a right-click context menu to `selector`, sourced from
         * whatever's registered for that target via `buildContextMenuList`,
         * merged with any `options.items`/`options.callback` the caller
         * supplies directly. Always wires up via `app.ui.contextMenu`'s
         * `callback` option (never its static `items`) so the target's
         * registered list — and every factory-function/thunk entry in it —
         * is re-read and re-resolved fresh on every single right-click,
         * not just once at bind time. This matters because programs keep
         * registering new entries into a target's list well after boot
         * (e.g. a lazy-loaded program's own `setup()`), and translated
         * entries need to reflect the *current* language, not whatever was
         * active the moment this function first ran.
         *
         * @param {string | HTMLElement | jQuery} selector - CSS selector, DOM element, or jQuery object.
         * @param {object} options - Settings such as zIndex, classes, etc.
         */
        contextMenuInit: function (selector, options = {}) {
            let targetKey;

            // Determine the target key based on selector type
            if (typeof selector === "string") {
                // CSS selector string
                targetKey = selector;
            } else if (window.jQuery && selector instanceof jQuery) {
                // jQuery object - get tag name from first element
                if (selector.length > 0) {
                    targetKey = selector[0].tagName.toLowerCase();
                } else {
                    console.error('Empty jQuery object provided');
                    return;
                }
            } else if (selector instanceof HTMLElement) {
                // Native DOM element
                targetKey = selector.tagName.toLowerCase();
            } else {
                console.error('Invalid selector type provided');
                return;
            }

            const userCallback = typeof options.callback === 'function' ? options.callback : null;
            const staticItems  = Array.isArray(options.items) ? options.items : (options.items ? [options.items] : []);

            app.ui.contextMenu(selector, {
                ...options,
                callback: () => {
                    const stored  = _contextMenus[targetKey] || [];
                    const dynamic = userCallback ? (userCallback() || []) : [];
                    return _resolveMenuItems([...dynamic, ...staticItems, ...stored]);
                }
            });
        },
        
        /**
         * Removes the entire context menu list for a given target.
         *
         * @param {string} target - CSS selector of the target element.
         */
        removeContextMenuList: function (target) {
            if (_contextMenus[target]) {
                delete _contextMenus[target];
            }
        },

        /**
         * Removes a specific context menu item by title for a given target.
         *
         * @param {string} target - CSS selector of the target element.
         * @param {string} title - Title of the menu item to remove.
         */
        removeContextMenuItem: function (target, title) {
            if (_contextMenus[target]) {
                _contextMenus[target] = _contextMenus[target].filter(item => item.title !== title);
            }
        },

        /**
         * Creates and handles a context menu for a given selector or element.
         * @param {string | HTMLElement} selector - CSS selector or HTML element to attach the context menu to.
         * @param {object} options - Configuration object for the context menu.
         * @param {Array} options.items - Array of menu item objects with properties like title, icon, and callback.
         * @param {function} [options.callback] - Optional callback function that returns items to display in the menu.
         * @param {number} [options.zIndex=300] - Z-index for the context menu.
         * @param {string} [options.classes=""] - Additional CSS classes to apply to the context menu.
         * @param {boolean} [options.selTarget=false] - Flag indicating whether to handle context menu items based on a specific target.
         */
        contextMenu: function (selector, options) {
            // Delegate the context menu creation to app.ui.contextMenu
            app.ui.contextMenu(selector, options);
        }
    };
})(window.app = window.app || {});

app.svg.global.load({
    id: 'sandstorm_capslock',
    viewBox: '0 0 15 21.455',
    content: `
        <path
            fill-rule="evenodd"
        
            fill="#ffffff"
            d="M 16.727272,24.454545 H 1.1909086 C 0.56981772,24.454545 -4.5454545e-7,23.884727 -4.5454545e-7,23.099999 V 11.727272 C -4.5454545e-7,11.024363 0.56981772,10.372727 1.1909086,10.372727 h 0.090909 V 7.6363631 C 1.2818177,3.4189086 4.782545,-4.5454545e-7 8.9999995,-4.5454545e-7 13.217454,-4.5454545e-7 16.636363,3.4189086 16.636363,7.6363631 v 2.7363639 h 0.09091 C 17.430182,10.372727 18,11.024363 18,11.727272 v 11.372727 c 0,0.784728 -0.569818,1.354546 -1.272727,1.354546 z
               M 5.0090904,20.190909 c 0,0.684272 0.5702728,1.172727 1.0909091,1.172727 H 11.90909 c 0.602455,0 1.090909,-0.488455 1.090909,-1.172727 v -5.645455 c 0,-0.602455 -0.488454,-1.172727 -1.090909,-1.172727 H 6.0999995 c -0.5206363,0 -1.0909091,0.570272 -1.0909091,1.172727 z
               M 13.999999,7.7727268 c 0,-2.7363636 -2.218181,-5.0363636 -4.954545,-5.0363636 -2.7363636,0 -5.0363636,2.3 -5.0363636,5.0363636 V 10.372727 H 13.999999 Z
               M 6.0999995,14.181818 H 11.90909 c 0.251,0 0.454546,0.203545 0.454546,0.454545 v 5.554546 c 0,0.332818 -0.203546,0.536363 -0.454546,0.536363 H 6.0999995 c -0.1691818,0 -0.4545454,-0.203545 -0.4545454,-0.536363 v -5.554546 c 0,-0.251 0.2853636,-0.454545 0.4545454,-0.454545 z
               m 1.9090909,5.190909 0.2727273,-0.827273 h 1.3545454 l 0.2727273,0.827273 H 10.727272 L 9.3636359,15.454545 H 8.554545 L 7.2818177,19.372727 Z
               M 9.454545,17.818181 H 8.4636359 l 0.5363636,-1.445454 z"
        />
    `
});
app.ui.caret.init({
    color: '#ffffff',
    capsLockColor: app.config.user.settings.theme.hoverColor,
    width: 2
});

 app.desktop.wakeUp();


/**
 * Applies the user's saved theme settings to the CSS variables.
 *
 * Iterates through each theme setting key in `app.config.user.settings.theme`,
 * converts it into a valid CSS variable name (e.g., `backgroundColorA_RGBA` → `--theme-background-color-a_rgba`),
 * and sets the value using `app.setCSSVariable`.
 *
 * Skips any theme value that is strictly `true`.
 * 
 * Example:
 * Given a theme:
 * {
 *   backgruondColorA_RGBA: '#2525254d',
 *   fontColor: '#ffffff'
 * }
 * 
 * This function will set:
 * --theme-backgruondcolora_rgba: "#2525254d"
 * --theme-fontcolor: "#ffffff"
 * 
 * @function applyUserThemeSettings
 * @returns {void}
 */
function _makeRadialGradient(hex) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    const d = n => Math.round(n * 0.92).toString(16).padStart(2, '0');
    return `radial-gradient(circle, ${hex} 0%, #${d(r)}${d(g)}${d(b)} 100%)`;
}

function _colorToRgb(c) {
    if (!c || typeof c !== 'string') return null;
    if (c.startsWith('#')) {
        const h = c.length === 9 ? c.slice(0, 7) : c;
        if (h.length === 7) return { r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) };
    }
    const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

function applyUserThemeSettings() {
    const theme = app?.config?.user?.settings?.theme;

    app.setCSSVariable("--theme-blur", "10px");
    app.setCSSVariable("--theme-borderradius", "20px");
    app.setCSSVariable("--theme-opacity", "1");

    if (!theme) {
        app.setCSSVariable("--theme-backgruondcolora-o", "rgba(37,37,37,0.2)");
        app.setCSSVariable("--theme-backgruondcolorb-o", "rgba(10,10,10,0.2)");
        return;
    }

    const opOn = theme.opactiyTrue !== false;

    for (const key in theme) {
        if (theme.hasOwnProperty(key)) {
            const value = theme[key];
            if (value === true || value === false) continue;

            if (key === 'backgroundRadialColor') {
                app.setCSSVariable("--background-radial", _makeRadialGradient(value));
                continue;
            }

            if (key === 'backgruondColorA_RGBA') {
                app.setCSSVariable("--theme-backgruondcolora", value);
                continue;
            }

            if (key === 'backgruondColorB_RGBA') {
                app.setCSSVariable("--theme-backgruondcolorb", value);
                continue;
            }

            if (key === 'backgruondColorC_RGBA') {
                app.setCSSVariable("--theme-backgruondcolorc", value);
                continue;
            }

            if (key === 'blur') {
                const _b = parseInt(value);
                const blurVal = (isNaN(_b) || _b <= 0) ? 10 : _b;
                app.setCSSVariable("--theme-blur", `${blurVal}px`);
                continue;
            }

            if (key === 'borderRadius') {
                const _r = parseInt(value);
                app.setCSSVariable("--theme-borderradius", `${isNaN(_r) ? 20 : _r}px`);
                continue;
            }

            if (key === 'opacity') {
                const _o = parseInt(value);
                const opVal = isNaN(_o) ? 10 : _o;
                app.setCSSVariable("--theme-opacity", opOn ? (opVal / 100).toString() : "1");
                continue;
            }

            const cssVarName = "--theme-" + key.replace(/([A-Z])/g, "$1").toLowerCase();
            app.setCSSVariable(cssVarName, theme[key]);
        }
    }

    const _op2 = parseInt(theme.opacity);
    const opVal2 = isNaN(_op2) ? 10 : _op2;
    const finalOpacity = opOn ? opVal2 / 100 : 1;
    const colorA = theme.backgruondColorA_RGBA || theme.backgruondColorA;
    const colorB = theme.backgruondColorB_RGBA || theme.backgruondColorB;
    const rgbA = _colorToRgb(colorA) || { r: 37, g: 37, b: 37 };
    const rgbB = _colorToRgb(colorB) || { r: 10, g: 10, b: 10 };
    app.setCSSVariable("--theme-backgruondcolora-o", `rgba(${rgbA.r},${rgbA.g},${rgbA.b},${finalOpacity})`);
    app.setCSSVariable("--theme-backgruondcolorb-o", `rgba(${rgbB.r},${rgbB.g},${rgbB.b},${finalOpacity})`);

    if (!theme.backgroundRadialColor) {
        app.setCSSVariable("--background-radial", _makeRadialGradient('#ffc107'));
    }
}

/**
 * Extensible sub-menu registry for the desktop background's "New" item.
 *
 * Programs register entries in `app.desktop.contextMenu.submenu.new.add(...)`.
 * The "New" top-level item itself is registered as a normal entry via
 * `app.desktop.buildContextMenuList("body", ...)` below.
 *
 * This namespace used to also hold its own separate `_entries`/`add`/`_build`
 * top-level registry (a second, parallel implementation of exactly what
 * `buildContextMenuList`/`contextMenuInit`/`_contextMenus` above already do
 * for any target) — consolidated away since there's no reason for the
 * desktop background specifically to have its own menu-registry mechanism
 * when the generic one already exists and now supports the same
 * factory-function/live-translation entries. Only `.submenu.new` remains
 * here, since it serves a genuinely different purpose (populating one
 * item's nested `submenu:` array, not top-level target items) and is
 * referenced externally by `explorer/setup/fileops.js`, `program/notepad/
 * setup.js`, and `desktop/icons.js`'s `app.desktop.icons` alias.
 *
 * @namespace app.desktop.contextMenu.submenu
 */
app.desktop.contextMenu = {
    submenu: {
        new: {
            _entries: [],
            add({ icon = '', text = '', alt = '', fn } = {}) {
                this._entries.push({ icon, title: text, alt, callback: fn });
            },
            _build() { return [...this._entries]; }
        }
    }
};

app.desktop.buildContextMenuList(1, "body", () => {
    const entries = app.desktop.contextMenu.submenu.new._build();
    if (!entries.length) return null;
    return {
        title: _('New'),
        icon:  '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>',
        submenu: entries
    };
});

// Passed as a factory function (matching the "New" entry above), not a
// plain object, so contextMenuInit's live resolution re-evaluates
// _("Update") fresh every time the menu is actually shown — a plain object
// here would freeze the English text forever, same bug as everywhere else
// this session (see program.js's addInfo() comment).
app.desktop.buildContextMenuList(0, "body", () => ({
    title: _("Update"),
    shortcut: "S+U",
    alt: "S+U",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    callback: () => {
        app.dev.log("Updating desktop...", "Desktop");
        app.desktop.icon.update();
    }
}));