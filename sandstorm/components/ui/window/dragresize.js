/**
 * @file window/dragresize.js
 * @description Position/drag/resize family for the window-management split
 * (see window/index.js for the assembly). Split out of the original
 * monolithic window.js — moved verbatim, no logic changes.
 *
 * Dependency rule: imports from window/state.js only.
 *
 * Pre-existing oddity preserved as-is (not introduced by this split, not
 * fixed here): `resizable()`'s `let id = data.id;` references a bare `data`
 * identifier with no local/module binding anywhere — it can only be
 * resolving via the global scope chain to some `globalThis.data` set by
 * something else entirely. Since bare-identifier lookup falls through to
 * `globalThis` the same way in both classic scripts and ES modules, moving
 * this into a real module changes nothing about how (or whether) that
 * resolves — same behavior before and after the split.
 *
 * @module components/ui/window/dragresize
 */

import { _caret, _caretRAF, triggerEvent } from './state.js';
import * as snapZones from './snap-zones.js';

/**
 * Disables jQuery UI resizable behavior on a window element.
 *
 * - If no argument is provided, all elements with the class `.window` will be affected.
 * - If a string is provided, it will target `.window#<element>`.
 * - Any other input will trigger a developer warning and be ignored.
 *
 * @param {string} [element] - Optional window ID (without `#`). Example: "note" targets `.window#note`.
 */
export function pauseResize(element) {
    let $el;

    if (typeof element === "undefined") {
        // Default: select all window elements
        $el = $(".window");
    } else if (typeof element === "string") {
        // Select specific window by ID
        $el = $(".window#" + element);
    } else {
        // Invalid usage
        app.dev.warn(
            "pauseResize: Only a string or no argument is allowed."
        );
        return;
    }

    // Disable resizable for each matched element
    $el.each(function () {
        if ($(this).hasClass("ui-resizable")) {
            $(this).resizable("disable");
        }
    });
}

/**
 * Enables jQuery UI resizable behavior on a window element.
 *
 * - If no argument is provided, all elements with the class `.window` will be affected.
 * - If a string is provided, it will target `.window#<element>`.
 * - Any other input will trigger a developer warning and be ignored.
 *
 * @param {string} [element] - Optional window ID (without `#`). Example: "note" targets `.window#note`.
 */
export function resumeResize(element) {
    let $el;

    if (typeof element === "undefined") {
        // Default: select all window elements
        $el = $(".window");
    } else if (typeof element === "string") {
        // Select specific window by ID
        $el = $(".window#" + element);
    } else {
        // Invalid usage
        app.dev.warn(
            "resumeResize: Only a string or no argument is allowed."
        );
        return;
    }

    // Enable resizable for each matched element
    $el.each(function () {
        if ($(this).hasClass("ui-resizable")) {
            $(this).resizable("enable");
        }
    });
}

/**
 * Disables jQuery UI draggable behavior on a window element.
 *
 * - If no argument is provided, all elements with the class `.window` will be affected.
 * - If a string is provided, it will target `.window#<element>`.
 * - Any other input will trigger a developer warning and be ignored.
 *
 * @param {string} [element] - Optional window ID (without `#`). Example: "note" targets `.window#note`.
 */
export function pauseDrag(element) {
    let $el;

    if (typeof element === "undefined") {
        // Default: select all window elements
        $el = $(".window");
    } else if (typeof element === "string") {
        // Select specific window by ID
        $el = $(".window#" + element);
    } else {
        // Invalid usage
        app.dev.warn("pauseDrag: Only a string or no argument is allowed.");
        return;
    }

    // Disable draggable for each matched element
    $el.each(function () {
        if ($(this).hasClass("ui-draggable")) {
            $(this).draggable("disable");
        }
    });
}

/**
 * Enables jQuery UI draggable behavior on a window element.
 *
 * - If no argument is provided, all elements with the class `.window` will be affected.
 * - If a string is provided, it will target `.window#<element>`.
 * - Any other input will trigger a developer warning and be ignored.
 *
 * @param {string} [element] - Optional window ID (without `#`). Example: "note" targets `.window#note`.
 */
export function resumeDrag(element) {
    let $el;

    if (typeof element === "undefined") {
        // Default: select all window elements
        $el = $(".window");
    } else if (typeof element === "string") {
        // Select specific window by ID
        $el = $(".window#" + element);
    } else {
        // Invalid usage
        app.dev.warn(
            "resumeDrag: Only a string or no argument is allowed."
        );
        return;
    }

    // Enable draggable for each matched element
    $el.each(function () {
        if ($(this).hasClass("ui-draggable")) {
            $(this).draggable("enable");
        }
    });
}

/**
 * Positions a window element on the screen based on the provided options.
 *
 * Supports the following values for `top` and `left`:
 * - `"center"`: centers the window on that axis
 * - `"top"`, `"bottom"`, `"left"`, `"right"`: aligns the window to that side
 * - Percentage strings: e.g., `"50%"` (relative to screen size)
 * - Viewport units: e.g., `"10vh"`, `"20vw"`
 * - Pixel values as strings or numbers: e.g., `"100"` or `100`
 *
 * You can also pass a margin array `[top, right, bottom, left]` to offset positioning.
 *
 * @param {Object} options - Configuration for positioning.
 * @param {jQuery} options.windowElement - The jQuery object representing the window element to position.
 * @param {string} options.width - The width of the window in pixels.
 * @param {string} options.height - The height of the window in pixels.
 * @param {string|number} [options.left="center"] - Horizontal position ('center', 'left', 'right', percentage string, viewport unit, or pixel value).
 * @param {string|number} [options.top="center"] - Vertical position ('center', 'top', 'bottom', percentage string, viewport unit, or pixel value).
 * @param {number[]} [options.margin=[0,0,0,0]] - Margin array in the order [top, right, bottom, left], applied to positioning.
 */
export function position(options) {
    const windowElement = options.windowElement;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const origWidth  = parseInt(options.width,  10);
    const origHeight = parseInt(options.height, 10);

    const ws = app.desktop.getWorkspaceRect();
    const windowWidth  = (!isNaN(origWidth)  && !String(options.width).includes('%')  && origWidth  > ws.width)  ? ws.width  : origWidth;
    const windowHeight = (!isNaN(origHeight) && !String(options.height).includes('%') && origHeight > ws.height) ? ws.height : origHeight;

    const margin = options.margin || [0, 0, 0, 0]; // [top, right, bottom, left]

    function parseValue(value, isWidth) {
        if (typeof value === "string") {
            if (value.endsWith("%")) {
                return (
                    ((isWidth ? screenWidth : screenHeight) * parseFloat(value)) /
                    100
                );
            } else if (value.endsWith("vw")) {
                return (screenWidth * parseFloat(value)) / 100;
            } else if (value.endsWith("vh")) {
                return (screenHeight * parseFloat(value)) / 100;
            }
        }
        return parseInt(value, 10) || 0;
    }

    let left = 0;
    let top = 0;

    // Horizontal positioning
    switch (options.left) {
        case "center":
            left = (screenWidth - windowWidth) / 2 + margin[3] - margin[1];
            break;
        case "left":
            left = 0 + margin[3];
            break;
        case "right":
            left = screenWidth - windowWidth - margin[1];
            break;
        default:
            left = parseValue(options.left, true) + margin[3];
            break;
    }

    // Vertical positioning
    switch (options.top) {
        case "center":
            top = (screenHeight - windowHeight) / 2 + margin[0] - margin[2];
            break;
        case "top":
            top = 0 + margin[0];
            break;
        case "bottom":
            top = screenHeight - windowHeight - margin[2];
            break;
        default:
            top = parseValue(options.top, false) + margin[0];
            break;
    }

    windowElement.css({
        top: top,
        left: left,
    });

    windowElement.data("natural-left", left);
    windowElement.data("natural-top", top);

    // Store originals so desktop-mode restore gets the full natural size
    app.program.setWindowPosition(
        options.id,
        options.windowId,
        origWidth,
        origHeight,
        left,
        top
    );

    const message =
        `Window "${options.windowId}" for program "${options.id}" positioned at ` +
        `left: ${left}, top: ${top}, width: ${windowWidth}, height: ${windowHeight}.`;

    app.dev.log(message, "Program");

    const posTransTid = setTimeout(function () {
        windowElement.css({
            transition:
                "opacity 1s ease-out, transform 1s ease, left 0.3s ease, top 0.3s ease, width 400ms ease-out, height 400ms ease-out",
        });
    }, 400);
    windowElement.data("pos-trans-tid", posTransTid);
}

/**
 * Enables drag-and-drop functionality for window elements.
 *
 * This method handles making a window element draggable across the screen
 * using jQuery UI's draggable functionality. It accounts for window resizing,
 * maximizing, and dynamically adjusting the position and size relative to taskbar placement.
 *
 * @param {Object} options - The configuration options for the draggable functionality.
 * @param {HTMLElement} options.windowElement - The DOM element representing the window.
 * @param {boolean} options.resizable - If true, the window can be resized.
 * @param {string} options.windowId - The unique ID of the window, used for activation and focus.
 */
export function draggable(options) {
    let point      = false; // true = top-snap (maximize), false = left/right snap
    let snapZone   = null;  // current preview zone: "top"|"left"|"right"|null
    let snapActive = null;  // zone that will actually snap on release (at edge)
    let snapTarget = null;  // resolveSnapTarget() result for the current left/right preview, or null
    let windowElement = options.windowElement;
    let data = options;
    let windowId = options.windowId;

    // Define the default transition to use when not dragging
    const defaultTransition = "";

    // Apply draggable functionality to the window element
    windowElement.draggable({
        handle: ".window-list", // Sets the header as the drag handle
        // The header IS the drag handle, but the whole right-side control
        // cluster (menu-mobile / minimize / maximize / close) and the window-
        // icon flyout menu live inside it as plain <div>s, not <button>s. With
        // touch-punch translating touchstart -> mousedown for jQuery UI, a tap
        // on "close" on a phone started a window drag instead of closing it
        // (the drag consumed the tap, so the .close click.close handler in
        // lifecycle.js never fired). cancel: excludes those elements from
        // starting a drag while the rest of the header stays draggable.
        // (jQuery UI's own default cancel is "input,textarea,button,select,option"
        // - it's replaced when set, so those are kept here too.)
        cancel: ".controls, .controls *, .control-menu, .control-menu *, button, input, textarea, select, option, a",
        scroll: false, // Prevent scrolling during drag

        // Event triggered when dragging starts
        start: function (event, ui) {
            // Reset snap state
            point      = false;
            snapZone   = null;
            snapActive = null;
            snapTarget = null;
            $(".window-layer").remove();

            snapZones.clearWindowFromAllZones(windowId);

            windowElement.data('snap.slots', null);

            // Disable CSS transition during drag
            $(this).css("transition", "none");

            // Set the current window as the active window
            app.setActiveWindow(windowId);

            if (data.resizable) {
                // Check if the window is currently maximized
                if (windowElement.hasClass("maximized")) {
                    const mouseX = event.pageX - windowElement.offset().left;
                    const mouseY = event.pageY - windowElement.offset().top;

                    windowElement
                        .find(".maximize")
                        .html(`<svg><use href="#ic-bts-maximize"></use></svg>`);

                    windowElement.removeClass("maximized");

                    // Restore to pre-maximize size (win.width/win.height set when maximize was triggered)
                    const restoreW = windowElement.data("win.width")  || windowElement.data("width");
                    const restoreH = windowElement.data("win.height") || windowElement.data("height");

                    windowElement.css({
                        right:  "",
                        bottom: "",
                        width:  restoreW,
                        height: restoreH,
                    });

                    // Adjust position so the mouse stays within the restored window
                    const clampedMouseX = Math.min(mouseX, restoreW - 1);
                    windowElement.css({
                        left: event.pageX - clampedMouseX,
                        top:  Math.max(0, event.pageY - mouseY),
                    });
                }


                // update Position of caret
                _caret();
            }
        },
        drag: function (event, ui) {
            // Single workspace rect used for both clamping and snap zones
            const ws = app.desktop.getWorkspaceRect();

            // Clamp window to workspace edges so snap zones are always reachable
            {
                // Top edge
                if (ui.position.top < ws.y) ui.position.top = ws.y;

                // Bottom taskbar gap (keep header above taskbar)
                const $tb = $('.taskbar-s.taskbar-bottom');
                if ($tb.length) {
                    const GAP = 10;
                    const tbH = $tb.outerHeight();
                    const vh  = window.innerHeight;
                    const my  = event.pageY;
                    if (my >= vh - tbH - GAP) {
                        ui.position.top = (vh - tbH - GAP) - (my - ui.position.top);
                    }
                }

                // Left edge
                if (ui.position.left < ws.x) ui.position.left = ws.x;

                // Right edge (only clamp if window fits inside workspace)
                const _ww = windowElement.outerWidth();
                if (_ww <= ws.width) {
                    const _maxLeft = ws.x + ws.width - _ww;
                    if (ui.position.left > _maxLeft) ui.position.left = _maxLeft;
                }
            }

            if (data.resizable) {
                // PREVIEW_PX: show the ghost layer this far from the edge
                // SNAP_PX:    actually commit snap on release (window at edge via clamp)
                const PREVIEW_PX = 60;
                const SNAP_PX    = 5;

                const winL = ui.position.left;
                const winT = ui.position.top;
                const winR = winL + windowElement.outerWidth();

                let newZone = null;
                let newSnapActive = null;
                snapTarget = null;

                if (snapZones.isSnapAllowed(event)) {
                    if (winL <= ws.x + PREVIEW_PX)                 newZone = "left";
                    else if (winR >= ws.x + ws.width - PREVIEW_PX) newZone = "right";
                    else if (winT <= ws.y + PREVIEW_PX)            newZone = "top";

                    if (newZone === "left" || newZone === "right") {
                        snapTarget = snapZones.resolveSnapTarget(ws, newZone, event.pageY, windowId);
                        if (!snapTarget) newZone = null;
                    }

                    if (winL <= ws.x + SNAP_PX)                 newSnapActive = "left";
                    else if (winR >= ws.x + ws.width - SNAP_PX) newSnapActive = "right";
                    else if (winT <= ws.y + SNAP_PX)            newSnapActive = "top";

                    if ((newSnapActive === "left" || newSnapActive === "right") && !snapTarget) {
                        newSnapActive = null;
                    }
                }

                snapActive = newSnapActive;
                point      = (snapActive === "top");

                const targetKey = !newZone ? null
                    : newZone === "top" ? "top"
                    : `${newZone}:${snapTarget.kind}:${snapTarget.slot || ''}`;

                if (targetKey !== snapZone) {
                    snapZone = targetKey;
                    $(".window-layer").remove();
                    app.dev.log(`Snap preview: ${newZone || "none"} (active=${newSnapActive || "none"})`, "Window");

                    if (newZone) {
                        const $lyr = app.ui.windows.functions.placeholder(windowElement, windowElement.outerWidth(), windowElement.outerHeight());

                        $lyr.css({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: "6px", padding: "14px 20px 0", boxSizing: "border-box" });

                        const hintTextCss = { color: "#fff", fontSize: "13px", fontWeight: "600", textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" };
                        const shiftIcon = `<svg width="14" height="14" viewBox="0 0 24 24" style="flex-shrink:0;"><rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 6 L17 12 L14 12 L14 17 L10 17 L10 12 L7 12 Z" fill="#fff"/></svg>`;
                        const cpIcon = `<svg width="14" height="14" viewBox="0 0 222 170" style="flex-shrink:0;"><use href="#ic-controlpanel"></use></svg>`;

                        const hintRow = (iconHtml, text) => $(`<div></div>`)
                            .css({ display: "flex", alignItems: "center", gap: "6px" })
                            .append(iconHtml)
                            .append($(`<span></span>`).css(hintTextCss).text(text));

                        $(`<div></div>`)
                            .css({ display: "flex", flexDirection: "column", gap: "6px", background: "rgba(0, 0, 0, 0.6)", borderRadius: "6px", padding: "8px 12px" })
                            .append(hintRow(shiftIcon, _('Shift — temporarily turns off snap')))
                            .append(hintRow(cpIcon, _('Control Panel — turns off snap completely')))
                            .appendTo($lyr);

                        $("body").append($lyr);

                        const layerRect = newZone === "top"
                            ? { x: ws.x, y: ws.y, width: ws.width, height: ws.height }
                            : snapTarget.rect;

                        setTimeout(() => {
                            $lyr.css({ transition: "all 0.25s ease" });
                            $lyr.css({ top: layerRect.y, left: layerRect.x, width: layerRect.width, height: layerRect.height });
                        }, 30);
                    }
                }

                // Update position of caret
                _caretRAF();
            }
        },
        // Event triggered when dragging stops
        stop: function (event) {
            // Restore the default transition regardless of what happens next
            windowElement.css("transition", defaultTransition);

            // If window-layer exists AND the window was at the snap edge, apply snap
            let _didSnap = false;
            if (data.resizable) {
                if ($(".window-layer").length && snapActive) {
                    _didSnap = true;
                    app.dev.log(`Snap applied: ${snapActive}`, "Window");
                    const $layer = $(".window-layer");

                    if (!point) {
                        windowElement.css({ transition: "opacity 1s ease-out, transform 1s ease, left 0.3s ease, top 0.3s ease" });
                        snapZones.commitSnap(windowElement, windowId, snapTarget);

                        windowElement.data("natural-left", parseInt(windowElement.css("left"), 10) || 0);
                        windowElement.data("natural-top",  parseInt(windowElement.css("top"),  10) || 0);
                    } else {
                        windowElement.data("win.width", windowElement.width());
                        windowElement.data("win.height", windowElement.height());
                        const _rawTop = windowElement[0].style.top;
                        const _rawLeft = windowElement[0].style.left;
                        windowElement.data("win.top", _rawTop && _rawTop !== "auto" ? _rawTop : windowElement.css("top"));
                        windowElement.data("win.left", _rawLeft && _rawLeft !== "auto" ? _rawLeft : windowElement.css("left"));

                        // Mirrors the exact CSS functions.maximize() applies.
                        windowElement.addClass("maximized");
                        windowElement.css({ transition: "all 0.5s ease" });

                        const _tbEl = $(".taskbar-s").eq(0);
                        const _tbW  = _tbEl.width()  || 0;
                        const _tbH  = _tbEl.height() || 0;

                        if (_tbEl.hasClass("taskbar-left")) {
                            windowElement.css({ left: _tbW + "px", top: "0px", right: "0px", bottom: "0px", width: `calc(100% - ${_tbW}px)`, height: "100%" });
                        } else if (_tbEl.hasClass("taskbar-right")) {
                            windowElement.css({ left: "0px", top: "0px", right: _tbW + "px", bottom: "0px", width: `calc(100% - ${_tbW}px)`, height: "100%" });
                        } else if (_tbEl.hasClass("taskbar-top")) {
                            windowElement.css({ left: "0px", top: _tbH + "px", right: "0px", bottom: "0px", width: "100%", height: `calc(100% - ${_tbH}px)` });
                        } else {
                            windowElement.css({ left: "0px", top: "0px", right: "0px", bottom: _tbH + "px", width: "100%", height: `calc(100% - ${_tbH}px)` });
                        }

                        setTimeout(() => {
                            windowElement.css(
                                "transition",
                                "opacity 1s ease-out, transform 1s ease, left 0.3s ease, top 0.3s ease"
                            );
                        }, 500);

                        // Switch content to 'Normal'
                        windowElement
                            .find(".window-list .controls .maximize")
                            .html(`<svg><use href="#ic-bts-minimize"></use></svg>`)
                            .attr("title", "Normal");
                        windowElement
                            .find(
                                ".window-list .window-header .icon .control-menu .ctm-row.maximize .ctm-title span:eq(1)"
                            )
                            .text("Normal");
                        windowElement
                            .find(
                                ".window-list .window-header .icon .control-menu .ctm-row.maximize .ctm-title span:eq(0)"
                            )
                            .html(`<svg><use href="#ic-bts-minimize"></use></svg>`);
                        point = false;
                    }

                    // Remove the window-layer
                    $layer.remove();
                } else {
                    // Preview was showing but window wasn't at snap edge — cancel
                    $(".window-layer").remove();
                }
                // Update position of caret
                requestAnimationFrame(() => {
                    _caret();
                });
            }

            // Clamp final position so the window header stays inside the workspace
            // Skip for maximized windows and snapped windows — position is managed above
            if (!windowElement.hasClass('maximized') && !_didSnap) {
            const HDR = 36; // min px of header that must remain visible
                const $tb = $('.taskbar-s');
                const vw  = window.innerWidth;
                const vh  = window.innerHeight;
                let fl = parseInt(windowElement.css('left'), 10) || 0;
                let ft = parseInt(windowElement.css('top'),  10) || 0;
                const ww = windowElement.outerWidth() || 0;

                if ($tb.length) {
                    const tbH = $tb.outerHeight();
                    const tbW = $tb.outerWidth();

                    if ($tb.hasClass('taskbar-bottom')) {
                        // Header must stay above taskbar
                        if (ft > vh - tbH - HDR) ft = vh - tbH - HDR;
                    } else if ($tb.hasClass('taskbar-top')) {
                        // Header must stay below taskbar
                        if (ft < tbH) ft = tbH;
                    } else if ($tb.hasClass('taskbar-left')) {
                        // Window must stay right of taskbar
                        if (fl < tbW) fl = tbW;
                    } else if ($tb.hasClass('taskbar-right')) {
                        // Header must stay left of taskbar
                        if (fl > vw - tbW - HDR) fl = vw - tbW - HDR;
                    }
                }

                // General: keep at least HDR px visible at top and sides
                if (ft < 0)        ft = 0;
                if (fl > vw - HDR) fl = vw - HDR;
                if (fl + ww < HDR) fl = HDR - ww;

                windowElement.css({ left: fl, top: ft });
            } // end clamp

            if (!windowElement.hasClass('maximized') && !_didSnap) {
                app.program.setWindowPosition(
                    data.id,
                    windowId,
                    windowElement.width(),
                    windowElement.height(),
                    windowElement.css("left"),
                    windowElement.css("top")
                );

                windowElement.data("natural-left", parseInt(windowElement.css("left"), 10) || 0);
                windowElement.data("natural-top",  parseInt(windowElement.css("top"),  10) || 0);
            }

            // Log message
            const message =
                `Position updated for window "${data.windowId}" in program "${data.id}": ` +
                `width: ${windowElement.width()}, height: ${windowElement.height()}, ` +
                `left: ${windowElement.css("left")}, top: ${windowElement.css(
                    "top"
                )}`;

            app.dev.log(message, "Program");
        },
    });
}

/**
 * Creates a placeholder layer for a window element with a blurred background and shadow.
 * The placeholder matches the size and position of the current window element and is styled
 * to appear behind the window during resizing or drag actions.
 *
 * @param {jQuery} windowElement - The window element to create a placeholder for.
 * @param {number} currentWidth - The current width of the window element.
 * @param {number} currentHeight - The current height of the window element.
 *
 * @returns {jQuery} A jQuery object representing the placeholder layer with defined styles.
 */
export function placeholder(windowElement, currentWidth, currentHeight) {
    return $("<div class='window-layer'></div>").css({
        position: "fixed",
        top: windowElement.offset().top,
        left: windowElement.offset().left,
        width: currentWidth,
        height: currentHeight,
        backdropFilter: "blur(10px)",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
        justifyContent: "center",
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        borderRadius: "20px",
        zIndex: windowElement.css("z-index") - 1,
        transition: "all 0.4s ease",
    });
}

/**
 * Makes a window element resizable with specified options.
 *
 * @function
 * @param {Object} options - Configuration options for making the window resizable.
 * @param {boolean} options.resizable - Indicates whether the window should be resizable.
 * @param {jQuery} options.windowElement - The jQuery object representing the window element to be resized.
 * @param {string} options.windowId - The unique identifier for the window being resized.
 * @param {number} options.minWidth - The minimum width allowed for the resizable window.
 * @param {number} options.minHeight - The minimum height allowed for the resizable window.
 *
 * @returns {void}
 */
export function resizable(options) {
    if (options.resizable) {
        let windowElement = options.windowElement;
        let id = data.id;
        // Convert minWidth and minHeight to integers by removing "px"
        let minWidth = parseInt(options.minWidth, 10);
        let minHeight = parseInt(options.minHeight, 10);

        // Retrieve the stored window object safely from WeakMap
        const storedWindowObj = app.store.get(windowElement[0]);

        // Make the window resizable
        windowElement.resizable({
            handles: "n, e, s, w, ne, se, sw, nw", // Allow resizing from all sides and corners
            minWidth: minWidth,
            minHeight: minHeight,
            resize: function (event, ui) {
                this.style.transition = "none";

                // Register window events
                triggerEvent(
                    storedWindowObj.windowId,
                    "resizing",
                    storedWindowObj,
                    minWidth,
                    minHeight,
                    event,
                    ui
                );
                _caretRAF();
            },
            start: function () {
                clearTimeout($(this).data("pos-trans-tid"));
                this.style.transition = "none";
                void this.offsetWidth;
            },

            stop: function () {
                $(this).css(
                    "transition",
                    "opacity 1s ease-out, transform 1s ease, width 400ms ease-out, height 400ms ease-out"
                );

                $(this).data("natural-left", parseInt($(this).css("left"), 10) || 0);
                $(this).data("natural-top",  parseInt($(this).css("top"),  10) || 0);

                // Update position of caret
                _caretRAF();
            },
        });

        windowElement
            .find(".ui-resizable-n, .ui-resizable-e, .ui-resizable-s, .ui-resizable-w, .ui-resizable-ne, .ui-resizable-se, .ui-resizable-sw, .ui-resizable-nw")
            .on("mousedown.snapfix", function () {
                clearTimeout(windowElement.data("pos-trans-tid"));
                const el = windowElement[0];
                const cs = window.getComputedStyle(el);
                el.style.left   = cs.left;
                el.style.top    = cs.top;
                el.style.width  = cs.width;
                el.style.height = cs.height;
                el.style.transition = "none";
                void el.offsetWidth;
            });
    }
}

/**
 * Adds a resize event listener to the window if it has not already been added.
 * The listener will adjust the position and size of all `.window` elements
 * whenever the window is resized.
 *
 * This function ensures that only one resize listener is active at a time by
 * checking the `app.ui.windows.resizeListenerAdded` flag. If no listener is
 * active, it binds the `app.ui.windows.adjust` function to the resize event.
 *
 * @function
 */
export function addResizeListener() {
    if (!app.ui.windows.resizeListenerAdded) {
        let ticking = false;
        $(window).on("resize", function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                app.ui.windows.adjust();
                ticking = false;
            });
        });

        // Set the flag to indicate the listener has been added
        app.ui.windows.resizeListenerAdded = true;
    }

    if (!app.ui.windows.responsiveListenerAdded) {
        app.ui.windows.responsiveListenerAdded = true;
        // Init once so responsiveWindows sets up its own resize listener
        app.desktop.responsiveWindows();
    }
}

/**
 * Removes the resize event listener from the window if no `.window` elements
 * are present on the page. This helps prevent unnecessary event handling when
 * no windows need resizing.
 *
 * The function checks if there are no `.window` elements in the DOM and if the
 * resize listener is currently active (`app.ui.windows.resizeListenerAdded` is true).
 * If both conditions are met, the resize listener is removed.
 *
 * @function
 */
export function removeResizeListener() {
    // Check if no `.window` elements are present and the resize listener is active
    if ($(".window").length === 0 && app.ui.windows.resizeListenerAdded) {
        // Remove the resize event listener from the window
        $(window).off("resize", app.ui.windows.adjust);
        // Reset the flag to indicate the listener has been removed
        app.ui.windows.resizeListenerAdded = false;
    }
}

/**
 * Carries a locked dialog + its modal overlay along with a parent window
 * that adjust() just moved/resized, THEN independently clamps the dialog to
 * the current viewport on its own. Applied synchronously, in the same tick
 * as the parent's own `$win.css(...)` — safe to do because adjust() now
 * applies position changes instantly (transition: "none", see adjust()'s
 * own comments), so the parent's `offset()`/size read here is already its
 * true final value, not a mid-animation snapshot.
 *
 * (An earlier version of this polled the parent's live rect across several
 * animation frames to chase a CSS-transitioned move. That's no longer
 * needed now that the move itself is instant — and during a continuous
 * browser resize, adjust() runs on every single frame, so multiple
 * overlapping multi-frame polling loops could end up racing each other,
 * which is exactly what caused the intermittent "dialog doesn't follow"
 * misses. A plain one-shot, same-tick delta has no async window in which
 * a second call can interleave, so there's nothing left to race.)
 *
 * The independent viewport clamp matters because this must be called on
 * every adjust() pass for a locked window, not just when the parent itself
 * needed to move (see the call sites): a dialog centered over its parent
 * can extend further right/down than the parent's own edge, so shrinking
 * the viewport (e.g. opening a docked DevTools panel) can push the dialog
 * out of view even while the parent still comfortably fits — carrying it
 * by the parent's delta alone (which would be zero here) would never catch
 * that, since nothing about the parent changed.
 *
 * @param {jQuery} $win - The parent window's jQuery-wrapped `-win` element.
 * @param {{left:number, top:number}} prevOffset - The parent's offset() just before this move was applied.
 * @param {string|null} lockedDialogId - The locked dialog's window id, or null if none.
 * @param {string} parentId - The parent window's id (for `app.windows.setOverlayBounds`).
 */
function _carryLockedPair($win, prevOffset, lockedDialogId, parentId) {
    if (!lockedDialogId) return;

    const offset = $win.offset();
    const dx = offset.left - prevOffset.left;
    const dy = offset.top  - prevOffset.top;

    const dialogEl = document.getElementById(`${lockedDialogId}-win`);
    if (dialogEl) {
        const $dialog = $(dialogEl);
        const dialogOffset = $dialog.offset();
        let dLeft = dialogOffset.left + dx;
        let dTop  = dialogOffset.top  + dy;
        const dW = $dialog.outerWidth();
        const dH = $dialog.outerHeight();
        const HDR = 36; // min px of header that must remain visible, matching the normal window clamp below
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Pull the whole dialog back into view when it fits; otherwise
        // fall back to the same "keep a header's worth visible" rule
        // regular windows use.
        if (dW <= vw) {
            if (dLeft < 0)          dLeft = 0;
            if (dLeft + dW > vw)    dLeft = vw - dW;
        } else {
            if (dLeft > vw - HDR)   dLeft = vw - HDR;
            if (dLeft + dW < HDR)   dLeft = HDR - dW;
        }
        if (dH <= vh) {
            if (dTop < 0)           dTop = 0;
            if (dTop + dH > vh)     dTop = vh - dH;
        } else if (dTop < 0) {
            dTop = 0;
        }

        $dialog.css({ transition: "none", left: dLeft, top: dTop });
    }

    if (app.windows && typeof app.windows.setOverlayBounds === 'function') {
        app.windows.setOverlayBounds(parentId, {
            top: offset.top, left: offset.left,
            width: $win.outerWidth(), height: $win.outerHeight(),
        });
    }
}

/**
 * Adjusts the size and position of all .window elements when the browser window is resized.
 * Ensures no windows go outside the visible area of the browser window and that they do not overlap with .taskbar2.
 * When browser window gets larger, windows try to return to their original positions.
 *
 * @event window#resize
 */
export function adjust() {
    /**
     * The width of the browser window in pixels.
     * @type {number}
     */
    let windowWidth = $(window).width();

    /**
     * The height of the browser window in pixels.
     * @type {number}
     */
    let windowHeight = $(window).height();

    /**
     * The .taskbar2 element.
     * @type {jQuery}
     */
    let taskbar = $(".taskbar-s");

    /**
     * The width of .taskbar2 in pixels.
     * @type {number}
     */
    let taskbarWidth = taskbar.outerWidth();

    /**
     * The height of .taskbar2 in pixels.
     * @type {number}
     */
    let taskbarHeight = taskbar.outerHeight();

    /**
     * The position of .taskbar2 relative to the document.
     * @type {Object}
     * @property {number} top - The top position of the taskbar.
     * @property {number} left - The left position of the taskbar.
     */

    let taskbarOffset = taskbar.offset() || { top: 0, left: 0 };

    $(".window").not(".ui-resizable-resizing, .ui-draggable-dragging").each(function () {
        let $win = $(this);

        // Skip windows managed by responsiveWindows (position:fixed grid layout)
        if ($win.data('responsive-modified')) return;

        let winId = this.id ? this.id.replace(/-win$/, '') : null;
        let lockedDialogId = null;
        if (winId && app.windows && typeof app.windows.getWindowState === 'function') {
            const state = app.windows.getWindowState(winId);
            if (state.mode === 'dialog') return;
            if (state.dialogOpen && state.dialogId) lockedDialogId = state.dialogId;
        }

        // Maximized windows: resize to fill current workspace on every browser resize
        if ($win.hasClass('maximized')) {
            const ws = app.desktop.getWorkspaceRect();
            const prevOffset = $win.offset();
            $win.css({ transition: "none", left: ws.x, top: ws.y, width: ws.width, height: ws.height });

            _carryLockedPair($win, prevOffset, lockedDialogId, winId);
            return;
        }

        if (winId && $win.data('snap.slots')) {
            const ws = app.desktop.getWorkspaceRect();
            const prevOffset = $win.offset();
            $win.css({ transition: "none" }); // instant — see the maximized branch above
            snapZones.reflowSlots($win, ws);
            _carryLockedPair($win, prevOffset, lockedDialogId, winId);
            return;
        }

        /**
         * The width of the current .window in pixels.
         * @type {number}
         */
        let winWidth = $win.outerWidth();

        /**
         * The height of the current .window in pixels.
         * @type {number}
         */
        let winHeight = $win.outerHeight();

        /**
         * The position of the current .window relative to the document.
         * @type {Object}
         * @property {number} top - The top position of the window.
         * @property {number} left - The left position of the window.
         */
        let winOffset = $win.offset();

        // Extract windowId from class name and get original position
        let windowId = null;

        let naturalLeft = $win.data('natural-left');
        let naturalTop  = $win.data('natural-top');
        if (naturalLeft === undefined || naturalTop === undefined) {
            naturalLeft = winOffset.left;
            naturalTop  = winOffset.top;
            $win.data('natural-left', naturalLeft);
            $win.data('natural-top',  naturalTop);
        }
        let newLeft = naturalLeft;
        let newTop  = naturalTop;

        // Adjust horizontally (left/right)
        if (newLeft + winWidth > windowWidth) {
            newLeft = windowWidth - winWidth; // Move within the right edge of the window
        }
        if (newLeft < 0) {
            newLeft = 0; // Move within the left edge of the window
        }

        // Adjust vertically (top/bottom)
        if (newTop + winHeight > windowHeight - taskbarHeight) {
            newTop = windowHeight - taskbarHeight - winHeight; // Move within the bottom edge of the window
        }
        if (newTop < 0) {
            newTop = 0; // Move within the top edge of the window
        }

        // Check for overlap with .taskbar2
        if (
            newLeft < taskbarOffset.left + taskbarWidth &&
            newLeft + winWidth > taskbarOffset.left &&
            newTop < taskbarOffset.top + taskbarHeight &&
            newTop + winHeight > taskbarOffset.top
        ) {
            // Adjust to avoid overlap with .taskbar2
            if (newTop + winHeight > taskbarOffset.top) {
                newTop = taskbarOffset.top - winHeight;
            }
        }

        // Apply the new position if it has changed
        if (newLeft !== winOffset.left || newTop !== winOffset.top) {
            // Instant, no transition — see the maximized branch above.
            $win.css({
                transition: "none",
                left: newLeft,
                top: newTop,
            });
        }

        _carryLockedPair($win, winOffset, lockedDialogId, winId);
    });
}
