/**
 * @file toggleWindow.js
 * @description Floating toggle-window component for the Sandstorm UI system.
 *
 * Registers `app.ui.toggle.window(options)` — creates a positioned floating
 * panel anchored to a target element. Clicking the trigger again removes the
 * panel (toggle behaviour). The panel auto-repositions on viewport resize and
 * closes when the user clicks outside it.
 *
 * Also registers `app.ui.toggle.windowAdjustPosition()` which repositions all
 * currently open `.toggleWindow` panels to stay aligned with their anchors.
 *
 * @module components/ui/toggleWindow
 *
 * `width`/`height` also accept `"auto"` — the panel then shrinks/grows to fit
 * whatever `body()` renders instead of using a fixed pixel size. Pass this
 * when a panel's content height varies at runtime (e.g. a media player
 * overlay that's taller while something is playing) instead of writing a
 * bespoke resize/reposition handler per caller.
 *
 * `window(...)` returns `{ reposition, element }` (or `null` when the call
 * just closed an already-open panel). Call `.reposition()` after mutating
 * the panel's own content in place (e.g. `el.innerHTML = "..."`) to re-run
 * the same sizing/alignment logic used on open and on window resize.
 *
 * Pass `iconSelector` instead of `targetId` for the common "taskbar status
 * icon toggles its own panel" case. Status icons render in 2+ duplicate DOM
 * copies sharing the same id/class (once in the real taskbar, once in the
 * start-menu widget), so a bare selector is ambiguous and resolves to the
 * wrong copy's position. Every caller used to re-derive this by hand (and
 * several got it wrong by using the parent's full className, which breaks
 * when transient state classes like "fade-in"/"fade-hidden" are present) —
 * `iconSelector` centralizes the fix: it reads `window.event` (the click),
 * finds the clicked icon via `.closest(iconSelector)`, and scopes the
 * selector to that icon's own parent's first class.
 *
 * @example
 * app.ui.toggle.window({
 *   windowId: "#my-panel",
 *   targetId: "#my-button",
 *   width: "300px",
 *   height: "200px",
 *   position: "bottom center",
 *   body: () => "<p>Panel content</p>"
 * });
 *
 * @example
 * const handle = app.ui.toggle.window({
 *   windowId: "#my-panel",
 *   targetId: "#my-button",
 *   height: "auto",
 *   body: () => renderPanel()
 * });
 * // later, after replacing the panel's own innerHTML in place:
 * handle?.reposition();
 */
(function (app) {
    app.ui = Object.assign(app.ui || {}, {

        toggle: {
            /**
             * Toggles the visibility of a floating window based on a target element's position.
             * The window adjusts its position dynamically to avoid going off-screen and can be
             * configured to avoid overlapping with a specified element.
             *
             * @param {Object} options - Configuration options for the toggleWindow function.
             * @param {string} options.windowId - The unique ID of the window element to toggle.
             * @param {string} [options.targetId] - The selector of the target element that anchors the window. Required unless `iconSelector` is given.
             * @param {string} [options.iconSelector] - Convenience alternative to `targetId` for status-icon triggers: resolves the clicked icon (via `window.event`) and its duplicate-safe container selector automatically. See module docblock.
             * @param {number|string} [options.width=400] - The width of the window in pixels, or "auto" to size to content.
             * @param {number|string} [options.height=300] - The height of the window in pixels, or "auto" to size to content.
             * @param {number} [options.gap=0] - The gap in pixels between the floating window and the target element.
             * @param {string} [options.class=""] - Additional CSS classes for styling the window.
             * @param {string} [options.position='top center'] - Preferred position of the window relative to the target element.
             *    Options: 'top left', 'top center', 'top right', 'bottom left', 'bottom center',
             *             'bottom right', 'left top', 'left center', 'left bottom', 'right top',
             *             'right center', 'right bottom'.
             * @param {Function} [options.body=function() { return ""; }] - Function that returns the HTML content for the window body.
             * @param {string|null} [options.noOverlap=null] - Optional ID of an element that the window should avoid overlapping.
             *
             * @returns {void}
             */
            window: function ({
                windowId,
                targetId,
                iconSelector = null,
                width = "400px",
                height = "300px",
                gap = 0,
                class: additionalClasses = "",
                position = 'top center',
                body = function () { return ""; },
                noOverlap = null
            }) {
                event.preventDefault();

                if (iconSelector) {
                    const icon = event.target.closest(iconSelector);
                    if (!icon) return null;
                    const parentClass = icon.parentElement.classList[0];
                    targetId = `.${parentClass} > ${iconSelector}`;
                }

                // Select elements by ID
                const windowElement = $(windowId);
                const targetElement = $(targetId);
                const noOverlapElement = noOverlap ? $( noOverlap) : null;

                if (windowElement.length) {
                    const staleHandler = windowElement.data('outsideClickHandler');
                    if (staleHandler) $(document).off('click', staleHandler);
                    windowElement.remove();
                    return null;
                }

                // Create new window element if it doesn't exist
                const newWindow = $('<div></div>')
                    .attr('id', windowId.replace('#', ''))
                    .attr("data", JSON.stringify({ targetId, position, noOverlap, gap, width, height })) // Set data attribute as JSON string
                    .addClass("toggleWindow " + additionalClasses); // Add the additional classes
             
                
                app.addCSS("toggleWindow", `
                    .toggleWindow{
                        position: absolute;
                        backdrop-filter: blur(10px);
                    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
                    justify-content: center;
                    background-color: rgb(0 0 0 / 30%);
                    background: linear-gradient(144deg,
                            rgba(37, 37, 37, 0.3) 0%,
                            rgb(10 10 10 / 20%) 47%);
                    border-radius: 10px;
                    overflow: hidden;
                    z-index: 9000;
                        opacity: 0;
                        display: none; // Hidden by default
                    }

                    .toggleWindow.show{
                        opacity: 1;
                        display: block;
                }`);


                if (width && width !== "auto") newWindow.css('width', width);
                if (height && height !== "auto") newWindow.css('height', height);
                newWindow.html(body());

                $('body').append(newWindow);

                const adjustPosition = () => {
                    const targetOffset = targetElement.offset();
                    const windowWidth = $(window).width();
                    const windowHeight = $(window).height();

                    let topPosition = targetOffset.top;
                    let leftPosition = targetOffset.left;

                    const [primaryPos, secondaryAlign] = position.split(' ');
                    const w = (width  === "auto") ? newWindow.outerWidth()  : parseInt(width, 10);
                    const h = (height === "auto") ? newWindow.outerHeight() : parseInt(height, 10);

                    // Kontrollera om targetId är inom fönstret
                    if (targetOffset.top >= 0 && targetOffset.top <= windowHeight && targetOffset.left >= 0 && targetOffset.left <= windowWidth) {
                        // Justera vertikal positionering
                        if (primaryPos === 'top') {
                            topPosition = targetOffset.top - h - gap;
                            if (topPosition < gap) {
                                topPosition = targetOffset.top + targetElement.outerHeight() + gap;
                            }
                        } else if (primaryPos === 'bottom') {
                            topPosition = targetOffset.top + targetElement.outerHeight() + gap;
                            if (topPosition + h + gap > windowHeight) {
                                topPosition = targetOffset.top - h - gap;
                            }
                        } else if (primaryPos === 'left') {
                            leftPosition = targetOffset.left - w - gap;
                            if (leftPosition < gap) {
                                leftPosition = targetOffset.left + targetElement.outerWidth() + gap;
                            }
                        } else if (primaryPos === 'right') {
                            leftPosition = targetOffset.left + targetElement.outerWidth() + gap;
                            if (leftPosition + w + gap > windowWidth) {
                                leftPosition = targetOffset.left - w - gap;
                            }
                        }

                        // Justera horisontell positionering för top/bottom eller vertikal för left/right
                        if (primaryPos === 'top' || primaryPos === 'bottom') {
                            switch (secondaryAlign) {
                                case 'left':
                                    leftPosition = targetOffset.left;
                                    break;
                                case 'center':
                                    leftPosition = targetOffset.left + (targetElement.outerWidth() / 2) - (w / 2);
                                    break;
                                case 'right':
                                    leftPosition = targetOffset.left + targetElement.outerWidth() - w;
                                    break;
                            }
                        } else {
                            switch (secondaryAlign) {
                                case 'top':
                                    topPosition = targetOffset.top;
                                    break;
                                case 'center':
                                    topPosition = targetOffset.top + (targetElement.outerHeight() / 2) - (h / 2);
                                    break;
                                case 'bottom':
                                    topPosition = targetOffset.top + targetElement.outerHeight() - h;
                                    break;
                            }
                        }

                        // Överlappningskontroll
                        if (noOverlapElement) {
                            const noOverlapOffset = noOverlapElement.offset();
                            const noOverlapBottom = noOverlapOffset.top + noOverlapElement.outerHeight();
                            const noOverlapRight = noOverlapOffset.left + noOverlapElement.outerWidth();

                            if (
                                topPosition < noOverlapBottom + gap &&
                                topPosition + h > noOverlapOffset.top - gap &&
                                leftPosition < noOverlapRight + gap &&
                                leftPosition + w > noOverlapOffset.left - gap
                            ) {
                                leftPosition = noOverlapRight + gap;
                                if (leftPosition + w + gap > windowWidth) {
                                    leftPosition = windowWidth - w - gap;
                                }
                            }
                        }

                        topPosition  = Math.min(Math.max(topPosition, gap), windowHeight - h - gap);
                        leftPosition = Math.min(Math.max(leftPosition, gap), windowWidth - w - gap);

                        newWindow.css({
                            top: topPosition + 'px',
                            left: leftPosition + 'px',
                        }).addClass("show");
                    }

                };

                adjustPosition();
                $(window).on('resize', adjustPosition);

                newWindow.data('reposition', adjustPosition);

            
                // Outside-click handler — uses composedPath(), see ui/NOTES.md.
                function outsideClickHandler(event) {
                    const nativeEvent = event.originalEvent || event;
                    const path = typeof nativeEvent.composedPath === 'function' ? nativeEvent.composedPath() : [];
                    const insideWindow = path.includes(newWindow[0]);
                    const insideTarget = targetElement.toArray().some(el => path.includes(el));
                    if (!insideWindow && !insideTarget) {
                        newWindow.remove();
                        $(document).off('click', outsideClickHandler); // Remove the event listener when window is closed
                    }
                }
                newWindow.data('outsideClickHandler', outsideClickHandler);

                // Hide the window if clicking outside
                $(document).on('click', outsideClickHandler);

                return { reposition: adjustPosition, element: newWindow };
            },

            /**
            * Adjusts the position of all windows with the class `.toggleWindow`
            * dynamically based on their associated target elements.
            *
            * This function recalculates each window's position to ensure they remain
            * in alignment with their target element, based on the `targetId` stored
            * in the window's `data` attribute.
            *
            * @returns {void}
            */
            windowAdjustPosition: function () {
                $('.toggleWindow').each(function () {
                    const windowElement = $(this);
                    const data = JSON.parse(windowElement.attr('data')); // Get data as JSON
                    const targetId = data.targetId;
                    const gap = data.gap || 0;
                    const targetElement = $(targetId);

                    // Exit if target element doesn't exist
                    if (!targetElement.length) return;

                    // Get target element's position and dimensions
                    const targetOffset = targetElement.offset();
                    const windowWidth = windowElement.outerWidth();
                    const windowHeight = windowElement.outerHeight();
                    const windowWidthMax = $(window).width();
                    const windowHeightMax = $(window).height();

                    // Calculate new positions (similar logic as in `toggleWindow`)
                    let topPosition = targetOffset.top;
                    let leftPosition = targetOffset.left;

                    // Adjust positions if necessary to keep window within viewport
                    if (topPosition + windowHeight > windowHeightMax - gap) {
                        topPosition = targetOffset.top - windowHeight;
                    }

                    if (leftPosition + windowWidth > windowWidthMax - gap) {
                        leftPosition = targetOffset.left - windowWidth;
                    }

                    // Keep a `gap` margin from every edge of the browser window
                    topPosition  = Math.min(Math.max(topPosition, gap), windowHeightMax - windowHeight - gap);
                    leftPosition = Math.min(Math.max(leftPosition, gap), windowWidthMax - windowWidth - gap);

                    // Apply updated positions to the window element
                    windowElement.css({
                        top: topPosition + 'px',
                        left: leftPosition + 'px'
                    });
                });
            }
        }
    });
}) (window.app = window.app || {}); // Skapa app-objektet om det inte redan finns
