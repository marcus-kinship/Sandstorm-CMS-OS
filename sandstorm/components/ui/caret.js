/**
 * @file caret.js
 * @description Custom animated caret component for Sandstorm input fields.
 *
 * Registers `app.ui.createCaret(options)` which attaches a custom blinking
 * caret to any `<input>`, `<textarea>`, or `contenteditable` element. Features:
 * - Automatic contrast detection (light/dark caret relative to background).
 * - Caps Lock indicator that changes the caret's colour.
 * - Position tracking via `getBoundingClientRect` + scroll offset.
 * - Stable repositioning on window resize (debounced).
 * - IME mode, writing direction (LTR/RTL), and ligature-mode toggles.
 * - Full cleanup via `.destroy()`.
 *
 * @module components/ui/caret
 *
 * @example
 * const caret = app.ui.createCaret({
 *   color: "#ffffff",
 *   width: "2px",
 *   height: "18px"
 * });
 * caret.focusOnTarget(document.querySelector("#my-input"));
 */
/**
 * Custom caret UI component with blinking animation and caps lock indicator
 * @namespace
 */
app.ui = app.ui || {};

/**
 * Creates a custom animated caret for input fields, textareas, and contenteditable elements
 * @param {Object} options - Configuration options
 * @param {string} options.color - Default caret color (default: '#ffffff')
 * @param {string} options.capsLockColor - Caret color when caps lock is on (default: '#ffc108')
 * @param {number} options.width - Caret width in pixels (default: 2)
 * @param {number} options.fade - Blink animation duration in milliseconds (default: 2500)
 * @param {number} options.fadeOutDuration - Fade out duration when blurring in milliseconds (default: 160)
 * @param {number} options.blinkResumeDelay - Delay before resuming blinking after keyup in milliseconds (default: 500)
 * @param {boolean|null} options.imeMode - Enable IME composition mode (null: auto-detect, true: force on, false: force off) (default: null)
 * @param {string} options.direction - Text direction: 'ltr' (left-to-right) or 'rtl' (right-to-left) (default: 'ltr')
 * @param {boolean|null} options.ligatureMode - Handle ligatures in fonts (null: auto-detect, true: force on, false: force off) (default: null)
 * @returns {Object} API object with init, updatePosition, setIMEMode, setDirection, setLigatureMode, focusOnTarget, and destroy methods
 */
app.ui.caret = (function () {

    const CSS_BASE_ID = 'ui-caret-base';
    const CSS_STYLE_ID = 'ui-caret-style';

    let enabled = false;
    let caretEl = null;
    let activeTarget = null;
    let capsLockOn = false;
    let removeTimeout = null;
    let currentOpts = null;
    let imeComposing = false;
    let lastFocusMethod = null; // Track how focus was changed

    // Keyed snapshots used by saveState/restoreState
    const _caretStates = new Map();

    // Store event listeners for cleanup
    let listeners = {};

    const defaults = {
        color: '#ffffff',
        capsLockColor: '#ffc108',
        width: 2,
        fade: 2500,
        fadeOutDuration: 160,
        blinkResumeDelay: 500,
        imeMode: null,        // null = auto-detect
        direction: 'ltr',     // 'ltr' or 'rtl'
        ligatureMode: null,   // null = auto-detect
        autoContrast: true    // auto-pick white/black caret based on field background
    };

    /* ---------------- Helper Functions ---------------- */

    /**
     * Walk up the DOM to find the first opaque background color and return
     * '#000000' if the background is light or '#ffffff' if it is dark.
     * Falls back to '#ffffff' when no opaque ancestor is found.
     * @param {HTMLElement} el - Element to start from
     * @returns {string} '#000000' or '#ffffff'
     */
    function contrastColor(el) {
        let current = el;
        while (current && current !== document.documentElement) {
            const bg = getComputedStyle(current).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                const m = bg.match(/(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/);
                if (m) {
                    const luminance = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
                    return luminance > 0.5 ? '#000000' : '#ffffff';
                }
            }
            current = current.parentElement;
        }
        return '#ffffff';
    }

    const SELECTION_API_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);

    /**
     * Check if an element is editable (input, textarea, or contenteditable)
     * @param {HTMLElement} el - Element to check
     * @returns {boolean} True if element is editable
     */
    function isEditable(el) {
        if (!el) return false;
        if (el.tagName === 'TEXTAREA' || el.isContentEditable === true) return true;
        return el.tagName === 'INPUT' && SELECTION_API_INPUT_TYPES.has(el.type);
    }

    /**
     * Get current caret position in the element
     * @param {HTMLElement} element - Target element
     * @returns {number} Caret position index
     */
    function getCaretPosition(element) {
        let caretPos = 0;

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            caretPos = element.selectionStart || 0;
        } else if (element.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(element);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                caretPos = preCaretRange.toString().length;
            }
        }

        return caretPos;
    }

    /**
     * Get scroll offset for an element including all parent containers
     * Useful for nested scrollable containers and contenteditable elements
     * @param {HTMLElement} element - Target element
     * @returns {Object} Object with scrollX and scrollY properties
     */
    function getScrollOffset(element) {
        let scrollX = 0;
        let scrollY = 0;
        let current = element.parentElement;

        // Walk up the DOM tree to accumulate scroll offsets
        while (current && current !== document.body && current !== document.documentElement) {
            const style = getComputedStyle(current);
            const overflow = style.overflow + style.overflowX + style.overflowY;

            // Check if this element is scrollable
            if (overflow.includes('scroll') || overflow.includes('auto')) {
                scrollX += current.scrollLeft || 0;
                scrollY += current.scrollTop || 0;
            }

            current = current.parentElement;
        }

        return { scrollX, scrollY };
    }

    /**
     * Calculate exact pixel coordinates for caret position
     * @param {HTMLElement} element - Target element
     * @param {number} position - Character position
     * @returns {Object|null} Object with x, y, height properties or null
     */
    function getCaretCoordinates(element, position) {
        const style = getComputedStyle(element);
        const fontSize = parseFloat(style.fontSize);
        const lineHeight = style.lineHeight !== 'normal'
            ? parseFloat(style.lineHeight)
            : fontSize * 1.2;

        // Detect RTL direction
        const isRTL = currentOpts && currentOpts.direction === 'rtl'
            ? true
            : (style.direction === 'rtl');

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            const div = document.createElement('div');

            const styles = [
                'position', 'padding', 'paddingLeft', 'paddingRight',
                'paddingTop', 'paddingBottom', 'margin', 'border',
                'borderLeft', 'borderRight', 'borderTop', 'borderBottom',
                'font', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
                'letterSpacing', 'wordSpacing', 'whiteSpace', 'textTransform',
                'lineHeight', 'textAlign', 'boxSizing', 'width', 'height',
                'direction'
            ];

            styles.forEach(prop => {
                div.style[prop] = style[prop];
            });

            // Apply RTL if set in options
            if (currentOpts && currentOpts.direction === 'rtl') {
                div.style.direction = 'rtl';
            }

            div.style.position = 'absolute';
            div.style.visibility = 'hidden';
            div.style.whiteSpace = element.tagName === 'TEXTAREA' ? 'pre-wrap' : 'nowrap';
            div.style.overflow = 'auto';
            div.style.overflowWrap = 'break-word';

            // Handle ligatures if enabled
            if (currentOpts && currentOpts.ligatureMode === true) {
                div.style.fontFeatureSettings = '"liga" 1, "clig" 1';
            } else if (currentOpts && currentOpts.ligatureMode === false) {
                div.style.fontFeatureSettings = '"liga" 0, "clig" 0';
            }

            document.body.appendChild(div);

            let text = element.value.substring(0, position);

            // Password: use the browser's own masking
            if (element.type === 'password') {
                const security = style.webkitTextSecurity;
                if (security && security !== 'none') {
                    div.style.webkitTextSecurity = security;
                } else {
                    // Fallback (Firefox etc.)
                    text = '•'.repeat(text.length);
                }
            }

            // Replace tabs with spaces (assuming 4-space tab width)
            text = text.replace(/\t/g, '    ');

            const textSpan = document.createElement('span');
            textSpan.style.whiteSpace = element.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
            textSpan.textContent = (text.endsWith('\n') ? text + '\u200B' : text) || '\u200B';

            div.textContent = '';
            div.appendChild(textSpan);

            const cursorSpan = document.createElement('span');
            cursorSpan.textContent = '\u200B';
            cursorSpan.style.display = 'inline';
            div.appendChild(cursorSpan);

            const divRect     = div.getBoundingClientRect();
            const cursorRect  = cursorSpan.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            let x;
            if (isRTL) {
                x = divRect.right - cursorRect.right;
            } else {
                x = cursorRect.left - divRect.left;
            }

            const y = cursorRect.top - divRect.top;
            const caretHeight = cursorRect.height > 0 ? cursorRect.height : lineHeight;

            document.body.removeChild(div);

            const elementHeight = element.offsetHeight;
            const paddingTop    = parseFloat(style.paddingTop);
            const paddingBottom = parseFloat(style.paddingBottom);
            const borderTop     = parseFloat(style.borderTopWidth);
            const borderBottom  = parseFloat(style.borderBottomWidth);

            const contentHeight =
                elementHeight - paddingTop - paddingBottom - borderTop - borderBottom;

            let yOffset = 0;

            // Vertical centering only applies to single-line inputs
            if (element.tagName === 'INPUT' && caretHeight < contentHeight) {
                yOffset = (contentHeight - caretHeight) / 2;
            }

            return {
                x: elementRect.left + x      - element.scrollLeft + window.scrollX,
                y: elementRect.top  + y + yOffset - element.scrollTop  + window.scrollY,
                height: caretHeight
            };
        }

        if (element.isContentEditable) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const scrollOffset = getScrollOffset(element);

                return {
                    x: rect.left + window.scrollX - scrollOffset.scrollX,
                    y: rect.top + window.scrollY - scrollOffset.scrollY,
                    height: rect.height || lineHeight
                };
            }
        }

        return null;
    }

    /**
     * Synchronize caret z-index with target element
     * @param {HTMLElement} caret - Caret element
     * @param {HTMLElement} target - Target input element
     */
    function syncZIndex(caret, target) {
        const z = getComputedStyle(target).zIndex;
        caret.style.zIndex = (z === 'auto' || isNaN(z)) ? 9999 : (+z + 1);
    }

    /**
     * Update caret color based on caps lock state
     * @param {Object} opts - Options object with color settings
     */
    function updateCaretColor(opts) {
        if (!caretEl) return;
        let color;
        if (capsLockOn) {
            color = opts.capsLockColor;
        } else if (opts.autoContrast && activeTarget) {
            color = contrastColor(activeTarget);
        } else {
            color = opts.color;
        }
        caretEl.style.setProperty('--caret-color', color);
    }

    /**
     * Remove caret element from DOM
     * @param {boolean} immediate - If true, remove immediately without fade out
     */
    function removeCaret(immediate = false) {
        // Clear any pending removal timeout
        if (removeTimeout) {
            clearTimeout(removeTimeout);
            removeTimeout = null;
        }

        if (caretEl) {
            if (immediate) {
                // Immediate removal without animation (for switching fields)
                caretEl.remove();
                caretEl = null;
            } else {
                // Fade out before removal (for blur)
                caretEl.classList.remove('blinking');
                caretEl.classList.add('fade-out');

                const fadeOutTime = currentOpts ? currentOpts.fadeOutDuration : defaults.fadeOutDuration;

                removeTimeout = setTimeout(() => {
                    if (caretEl) {
                        caretEl.remove();
                        caretEl = null;
                    }
                    removeTimeout = null;
                }, fadeOutTime);
            }
        }
        activeTarget = null;
    }

    /**
     * Update caret position after layout stabilizes
     * Uses requestAnimationFrame loop to detect when position stops changing
     * @param {number} frames - Number of consistent frames needed to consider stable
     */
    function updateAfterResizeStable(frames = 3) {
        let last = null;
        let sameCount = 0;

        function check() {
            if (!caretEl || !activeTarget) return;

            const pos = getCaretCoordinates(
                activeTarget,
                getCaretPosition(activeTarget)
            );

            if (!pos) return;

            const key = `${pos.x}|${pos.y}|${pos.height}`;

            if (key === last) {
                sameCount++;
                if (sameCount >= frames) {
                    // Layout is stable - apply position and show caret
                    caretEl.style.left = pos.x + 'px';
                    caretEl.style.top = pos.y + 'px';
                    caretEl.style.height = pos.height + 'px';
                    caretEl.classList.remove('resizing');
                    return;
                }
            } else {
                sameCount = 0;
                last = key;
            }

            requestAnimationFrame(check);
        }

        // Hide caret during resize with !important class
        if (caretEl) {
            caretEl.classList.add('resizing');
        }
        requestAnimationFrame(check);
    }

    /**
     * Update caret position to match current text cursor
     * @public
     */
    function updatePosition() {
        if (!caretEl || !activeTarget) return;

        // Check if activeTarget is still in the document
        if (!document.body.contains(activeTarget)) {
            removeCaret(true);
            return;
        }

        requestAnimationFrame(() => {
            if (!caretEl || !activeTarget) return;

            const position = getCaretPosition(activeTarget);
            const coords   = getCaretCoordinates(activeTarget, position);

            if (!coords) return;

            caretEl.style.left   = coords.x      + 'px';
            caretEl.style.top    = coords.y      + 'px';
            caretEl.style.height = coords.height + 'px';
        });
    }

    /**
     * Create and position a new caret element
     * @param {HTMLElement} target - Target input element
     * @param {Object} opts - Configuration options
     */
    function createCaret(target, opts) {
        // Remove existing caret immediately when switching fields
        removeCaret(true);

        const caret = document.createElement('div');
        caret.className = 'ui-caret';
        const initialColor = capsLockOn
            ? opts.capsLockColor
            : (opts.autoContrast ? contrastColor(target) : opts.color);
        caret.style.setProperty('--caret-color', initialColor);
        caret.style.setProperty('--blink-duration', opts.fade + 'ms');
        caret.style.setProperty('--fade-out-duration', opts.fadeOutDuration + 'ms');
        caret.style.width = opts.width + 'px';

        document.body.appendChild(caret);

        syncZIndex(caret, target);

        caretEl = caret;
        activeTarget = target;

        updatePosition();

        // Start blinking animation after positioning
        requestAnimationFrame(() => {
            if (caretEl) {
                caretEl.classList.add('blinking');
            }
        });
    }

    /**
     * Remove all event listeners
     */
    function removeEventListeners() {
        if (listeners.focusin) {
            document.removeEventListener('focusin', listeners.focusin);
        }
        if (listeners.click) {
            document.removeEventListener('click', listeners.click);
        }
        if (listeners.touchend) {
            document.removeEventListener('touchend', listeners.touchend);
        }
        if (listeners.keydown) {
            document.removeEventListener('keydown', listeners.keydown);
        }
        if (listeners.keyup) {
            document.removeEventListener('keyup', listeners.keyup);
        }
        if (listeners.compositionstart) {
            document.removeEventListener('compositionstart', listeners.compositionstart);
        }
        if (listeners.compositionupdate) {
            document.removeEventListener('compositionupdate', listeners.compositionupdate);
        }
        if (listeners.compositionend) {
            document.removeEventListener('compositionend', listeners.compositionend);
        }
        if (listeners.input) {
            document.removeEventListener('input', listeners.input);
        }
        if (listeners.selectionchange) {
            document.removeEventListener('selectionchange', listeners.selectionchange);
        }
        if (listeners.focusout) {
            document.removeEventListener('focusout', listeners.focusout);
        }
        if (listeners.scroll) {
            window.removeEventListener('scroll', listeners.scroll, true);
        }
        if (listeners.resize) {
            window.removeEventListener('resize', listeners.resize);
        }
        if (window.visualViewport) {
            if (listeners.visualViewportResize) {
                window.visualViewport.removeEventListener('resize', listeners.visualViewportResize);
            }
            if (listeners.visualViewportScroll) {
                window.visualViewport.removeEventListener('scroll', listeners.visualViewportScroll);
            }
        }

        listeners = {};
    }

    /**
     * Initialize custom caret
     * @param {Object} options - Configuration options
     */
    function init(options = {}) {
        // If already enabled, destroy first
        if (enabled) {
            destroy();
        }

        enabled = true;

        const opts = Object.assign({}, defaults, options);
        currentOpts = opts;

        // Hide native caret
        app.addCSS(CSS_BASE_ID, `
      input,
      textarea,
      [contenteditable="true"] {
        caret-color: transparent !important;
      }
    `);

        // Custom caret styling with smooth blinking animation
        app.addCSS(CSS_STYLE_ID, `
      @keyframes caret-blink {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }
      
      .ui-caret {
        position: fixed;
        pointer-events: none;
        background: var(--caret-color);
        opacity: 1;
        border-radius: 1px;
        z-index: 9999;
        transition: opacity var(--fade-out-duration, ${opts.fadeOutDuration}ms) ease, 
                    background-color 200ms ease;
      }
      
      .ui-caret.resizing {
        opacity: 0 !important;
        animation: none !important;
      }
      
      .ui-caret.blinking {
        animation-name: caret-blink;
        animation-duration: var(--blink-duration, ${opts.fade}ms);
        animation-timing-function: ease;
        animation-delay: 0s;
        animation-iteration-count: infinite;
      }
      
      .ui-caret.fade-out {
        opacity: 0;
      }
    `);

        // Event Handlers - stored for cleanup

        // Focus event - create caret when focusing editable element
        listeners.focusin = (e) => {
            if (!enabled || !isEditable(e.target)) return;

            capsLockOn = window.event?.getModifierState?.('CapsLock') ?? capsLockOn;
            updateCaretColor(opts);

            const element = e.target;

            // If focus was triggered by keyboard (Tab or Enter) and the element has text, move caret to the end
            if (lastFocusMethod === 'keyboard') {
                if (element.value && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
                    const len = element.value.length;
                    element.setSelectionRange(len, len);
                } else if (element.isContentEditable && element.textContent) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(element);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }

            createCaret(element, opts);

            // Reset for next time
            lastFocusMethod = null;
        };
        document.addEventListener('focusin', listeners.focusin);

        // Click event - update position when clicking inside field
        listeners.click = (e) => {
            if (!enabled || !isEditable(e.target)) return;
            lastFocusMethod = 'mouse';
            setTimeout(() => updatePosition(), 10);
        };
        document.addEventListener('click', listeners.click);

        // Touch event - handle mobile touch for caret positioning
        listeners.touchend = (e) => {
            if (!enabled || !isEditable(e.target)) return;
            lastFocusMethod = 'mouse';
            setTimeout(() => updatePosition(), 10);
        };
        document.addEventListener('touchend', listeners.touchend);

        // Keydown event - detect caps lock and pause blinking
        listeners.keydown = (e) => {
            if (!enabled || !caretEl) return;

            // Detect caps lock state change
            if (e.getModifierState && e.getModifierState('CapsLock') !== capsLockOn) {
                capsLockOn = e.getModifierState('CapsLock');
                updateCaretColor(opts);
            }

            // Track if the key is Tab or Enter
            if (e.key === 'Tab' || e.key === 'Enter') {
                lastFocusMethod = 'keyboard';
            }

            // Don't pause animation for modifier keys only
            const isModifierOnly = e.key === 'CapsLock' || e.key === 'Shift' ||
                e.key === 'Control' || e.key === 'Alt' ||
                e.key === 'Meta';

            const isNavKey = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                e.key === 'ArrowUp'   || e.key === 'ArrowDown'  ||
                e.key === 'Home'      || e.key === 'End'        ||
                e.key === 'PageUp'    || e.key === 'PageDown';
            if (isNavKey) {
                setTimeout(() => updatePosition(), 0);
            }

            if (!isModifierOnly) {
                // Pause blinking during typing
                caretEl.classList.remove('blinking');
                caretEl.style.opacity = '1';
            }
        };
        document.addEventListener('keydown', listeners.keydown);

        // IME composition events
        listeners.compositionstart = () => {
            if (!enabled || !caretEl) return;

            // Check if IME mode is enabled (null = auto-detect, true = force on)
            if (opts.imeMode === false) return;

            imeComposing = true;
            // Hide caret during IME composition
            if (caretEl) {
                caretEl.style.opacity = '0';
            }
        };
        document.addEventListener('compositionstart', listeners.compositionstart);

        listeners.compositionupdate = () => {
            if (!enabled || !imeComposing) return;
            // Keep caret hidden during composition
        };
        document.addEventListener('compositionupdate', listeners.compositionupdate);

        listeners.compositionend = () => {
            if (!enabled || !caretEl) return;

            if (opts.imeMode === false) return;

            imeComposing = false;
            // Show caret and update position after composition
            updatePosition();
            setTimeout(() => {
                if (caretEl) {
                    caretEl.style.opacity = '1';
                    caretEl.classList.add('blinking');
                }
            }, 50);
        };
        document.addEventListener('compositionend', listeners.compositionend);

        // Keyup event - update position and resume blinking
        listeners.keyup = () => {
            if (!enabled || !caretEl) return;
            updatePosition();

            // Resume blinking after configurable delay
            setTimeout(() => {
                if (caretEl) {
                    caretEl.classList.add('blinking');
                }
            }, opts.blinkResumeDelay);
        };
        document.addEventListener('keyup', listeners.keyup);

        // Input event - update position during text changes
        listeners.input = () => {
            if (!enabled) return;
            updatePosition();
        };
        document.addEventListener('input', listeners.input);

        // Selection change - update position when selection changes
        listeners.selectionchange = () => {
            if (!enabled || !activeTarget) return;
            updatePosition();
        };
        document.addEventListener('selectionchange', listeners.selectionchange);

        // Blur event - remove caret with fade out when losing focus
        listeners.focusout = () => {
            if (!enabled) return;
            removeCaret(false); // Use fade out animation
        };
        document.addEventListener('focusout', listeners.focusout);

        // Scroll event - update position during scroll (including nested containers)
        listeners.scroll = () => {
            if (!enabled) return;
            updatePosition();
        };
        window.addEventListener('scroll', listeners.scroll, true);

        // Resize event - wait for stable layout before updating
        listeners.resize = () => {
            if (!enabled || !caretEl) return;
            updateAfterResizeStable();
        };
        window.addEventListener('resize', listeners.resize);

        // Visual viewport events (Chrome/Safari zoom, mobile)
        if (window.visualViewport) {
            listeners.visualViewportResize = () => {
                if (!enabled || !caretEl) return;
                updateAfterResizeStable();
            };
            listeners.visualViewportScroll = () => {
                if (!enabled || !caretEl) return;
                updateAfterResizeStable();
            };

            window.visualViewport.addEventListener('resize', listeners.visualViewportResize);
            window.visualViewport.addEventListener('scroll', listeners.visualViewportScroll);
        }
    }

    /**
     * Focus on a target element and position caret at specific character position
     * @param {string|HTMLElement} target - Element ID or element reference
     * @param {number} position - Character position (default: end of content)
     * @public
     */
    function focusOnTarget(target, position = null) {
        // Get element by ID if string provided
        const element = typeof target === 'string'
            ? document.getElementById(target)
            : target;

        if (!element || !isEditable(element)) {
            console.warn('focusOnTarget: Invalid or non-editable element');
            return;
        }

        // Focus the element
        element.focus();

        // Determine position
        let targetPos = position;

        if (targetPos === null) {
            // Default to end of content
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                targetPos = element.value.length;
            } else if (element.isContentEditable) {
                targetPos = element.textContent.length;
            }
        }

        // Set caret position
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.setSelectionRange(targetPos, targetPos);
        } else if (element.isContentEditable) {
            // For contenteditable, we need to set selection manually
            const range = document.createRange();
            const sel = window.getSelection();

            try {
                let currentPos = 0;
                let found = false;

                function traverseNodes(node) {
                    if (found) return;

                    if (node.nodeType === Node.TEXT_NODE) {
                        const textLength = node.textContent.length;
                        if (currentPos + textLength >= targetPos) {
                            range.setStart(node, targetPos - currentPos);
                            range.collapse(true);
                            found = true;
                            return;
                        }
                        currentPos += textLength;
                    } else {
                        for (let child of node.childNodes) {
                            traverseNodes(child);
                            if (found) return;
                        }
                    }
                }

                traverseNodes(element);

                if (found) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            } catch (e) {
                console.warn('focusOnTarget: Could not set caret position in contenteditable', e);
            }
        }

        // Update caret position with delay like click events
        setTimeout(() => updatePosition(), 10);
    }

    /**
     * Set IME mode
     * @param {boolean|null} mode - null: auto-detect, true: force on, false: force off
     * @public
     */
    function setIMEMode(mode) {
        if (!currentOpts) return;
        currentOpts.imeMode = mode;
    }

    /**
     * Set text direction
     * @param {string} direction - 'ltr' or 'rtl'
     * @public
     */
    function setDirection(direction) {
        if (!currentOpts) return;
        if (direction !== 'ltr' && direction !== 'rtl') {
            console.warn('setDirection: direction must be "ltr" or "rtl"');
            return;
        }
        currentOpts.direction = direction;
        // Update position immediately if caret is active
        if (caretEl && activeTarget) {
            updatePosition();
        }
    }

    /**
     * Set ligature mode
     * @param {boolean|null} mode - null: auto-detect, true: force on, false: force off
     * @public
     */
    function setLigatureMode(mode) {
        if (!currentOpts) return;
        currentOpts.ligatureMode = mode;
        // Update position immediately if caret is active
        if (caretEl && activeTarget) {
            updatePosition();
        }
    }

    /**
     * Destroy custom caret and clean up
     */
    function destroy() {
        enabled = false;
        imeComposing = false;
        lastFocusMethod = null;
        removeCaret(true);
        removeEventListeners();
        app.removeCSS(CSS_BASE_ID);
        app.removeCSS(CSS_STYLE_ID);
        currentOpts = null;
    }

    function hidden() {
        removeCaret(false);
    }

    /**
     * Save current caret target and position under a key.
     * Call before hiding the caret (e.g. when a modal dialog opens).
     * @param {string} key - Unique key, typically the parent window ID.
     */
    function saveState(key) {
        if (!activeTarget) return;
        _caretStates.set(key, {
            target:   activeTarget,
            position: getCaretPosition(activeTarget)
        });
    }

    /**
     * Return the saved state for a key, or null if none.
     * @param {string} key
     * @returns {{ target: HTMLElement, position: number }|null}
     */
    function getState(key) {
        return _caretStates.get(key) || null;
    }

    /**
     * Refocus the saved element and reposition the caret.
     * Call after the modal dialog closes and the parent window regains focus.
     * @param {string} key
     */
    function restoreState(key) {
        const state = _caretStates.get(key);
        if (!state || !state.target || !document.contains(state.target)) return;
        focusOnTarget(state.target, state.position);
    }

    /**
     * Delete the saved state for a key.
     * @param {string} key
     */
    function removeState(key) {
        _caretStates.delete(key);
    }

    /* ---------------- Public API ---------------- */

    return {
        init: init,
        updatePosition: updatePosition,
        setIMEMode: setIMEMode,
        setDirection: setDirection,
        setLigatureMode: setLigatureMode,
        focusOnTarget: focusOnTarget,
        destroy: destroy,
        hidden: hidden,
        saveState: saveState,
        getState: getState,
        restoreState: restoreState,
        removeState: removeState,

        /**
         * Re-attaches and repositions the custom caret to a specific element.
         * Use this after programmatic focus (e.g. rename inputs opened via context
         * menu) where the caret may not have been created due to timing.
         *
         * @example
         *   setTimeout(() => {
         *     input.focus();
         *     input.setSelectionRange(0, input.value.length);
         *     app.ui.caret.position.update(input);
         *   }, 50);
         */
        position: {
            update(element) {
                if (!enabled || !currentOpts) return;
                const target = (element instanceof HTMLElement) ? element : activeTarget;
                if (!target || !isEditable(target)) return;
                if (document.activeElement !== target) return;
                createCaret(target, currentOpts);
                requestAnimationFrame(() => {
                    if (!caretEl || !activeTarget) return;
                    const hasSelection = target.selectionEnd !== undefined &&
                                        target.selectionStart !== target.selectionEnd;
                    const pos = hasSelection ? target.selectionEnd : getCaretPosition(target);
                    const coords = getCaretCoordinates(target, pos);
                    if (!coords) return;
                    caretEl.style.left   = coords.x      + 'px';
                    caretEl.style.top    = coords.y      + 'px';
                    caretEl.style.height = coords.height + 'px';
                });
            }
        }
    };

})();

app.lock("ui.caret.*", { writable: false, configurable: false });