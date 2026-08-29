/**
 * @file components/keynav.js
 * @description Tab+S/M/I skip-navigation shortcuts (see the OS-wide
 * keyboard-navigation spec, phase 3).
 *
 * Trigger mechanic: Tab must be held down, then S/M/I pressed while it's
 * still held - mirrors this OS's existing "hold W, tap Arrow" snap-shortcut
 * convention (window/index.js's initSnapShortcuts()), not a quick two-key
 * sequence. The bare Tab keydown is never preventDefault()'d on its own, so
 * a lone Tab press still moves focus normally - only once S/M/I follows
 * while Tab is still down does this module intervene. That does mean a
 * single "real" Tab-driven focus move still happens on the initial press
 * before a combo completes; accepted tradeoff of this trigger mechanic,
 * not a bug.
 *
 * - Tab+S: opens the Start Menu (if closed) and moves focus into its search
 *   box, which already supports arrow-key navigation (search.js). If
 *   already open, closes it and restores focus to wherever it was.
 * - Tab+M: moves focus into the active window's own menu bar (its first
 *   top-level item), if it has one. The menu bar's own Arrow/Enter/Escape
 *   handling lives in ui/window/menu-body.js; this module only handles the
 *   jump in and, via the "sandstorm:menu-exit" event that module dispatches
 *   on Escape/activation, restoring focus back out.
 * - Tab+I: moves focus to the first focusable element in the active
 *   window's own content area, skipping past its title bar/menu.
 *
 * @module components/keynav
 */
(function (app) {
    let tabDown = false;
    let preFocus = null;

    const FOCUSABLE_SELECTOR = 'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])';

    function restoreFocus() {
        if (preFocus && document.contains(preFocus) && typeof preFocus.focus === "function") preFocus.focus();
        preFocus = null;
    }

    function activeWindowEl() {
        return document.querySelector(".window.active");
    }

    function handleTabS() {
        const sm = app.desktop && app.desktop.startmenu;
        if (!sm || typeof sm.toggleMenu !== "function") return;

        if (sm.options.isMenuOpen) {
            sm.toggleMenu();
            restoreFocus();
            return;
        }

        preFocus = document.activeElement;
        sm.toggleMenu();
        requestAnimationFrame(() => {
            const searchInput = document.getElementById("q-search");
            const target = searchInput || sm.options.menu?.querySelector(FOCUSABLE_SELECTOR);
            target?.focus();
        });
    }

    function handleTabM() {
        const winEl = activeWindowEl();
        if (!winEl) return;
        const firstItem = winEl.querySelector(".menu-container .wm-menu > .menu-item");
        if (!firstItem) return;

        preFocus = document.activeElement;
        firstItem.focus();
        winEl.addEventListener("sandstorm:menu-exit", restoreFocus, { once: true });
    }

    function handleTabI() {
        const winEl = activeWindowEl();
        if (!winEl) return;
        const content = winEl.querySelector(".content");
        if (!content) return;

        const target = content.matches(FOCUSABLE_SELECTOR) ? content : content.querySelector(FOCUSABLE_SELECTOR);
        if (!target) return;

        preFocus = document.activeElement;
        target.focus();
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            tabDown = true;
            return;
        }
        if (!tabDown || e.repeat) return;

        const key = e.key.toLowerCase();
        if (key === "s") { e.preventDefault(); handleTabS(); }
        else if (key === "m") { e.preventDefault(); handleTabM(); }
        else if (key === "i") { e.preventDefault(); handleTabI(); }
    });

    document.addEventListener("keyup", (e) => {
        if (e.key === "Tab") tabDown = false;
    });

    window.addEventListener("blur", () => { tabDown = false; });
})((window.app = window.app || {}));
