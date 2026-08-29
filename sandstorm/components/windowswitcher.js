/**
 * @file components/windowswitcher.js
 * @description Hold-Shift+W window switcher (OS-wide keyboard-navigation
 * spec, phase 4) - a full-screen 3D-carousel overlay of every open window.
 *
 * Trigger: Shift+W must both be held down together. Left/Right arrows move
 * the highlighted card while held - selection only, no live foreground
 * preview (per design choice: simpler and no flicker risk when cycling
 * quickly through many windows). Releasing EITHER key (Shift or W) commits
 * the currently-highlighted window - not Enter, matching the spec. Escape
 * cancels instead, closing the overlay without changing the active window
 * (not in the original spec text, but matches this project's established
 * Esc-restores principle used everywhere else in this phase).
 *
 * Cards show a real thumbnail of each window's own content (cloned DOM,
 * scaled down), not just an icon+title - important once several windows
 * share the same program (e.g. two Notepad windows): an icon-only card
 * can't tell them apart, a content thumbnail can. The program icon becomes
 * a small secondary badge; the footer row reads "Program · Window title".
 *
 * Deliberately does NOT import anything from ui/window/*.js - that split's
 * own header comment restricts cross-sibling imports to its own index.js.
 * Everything here goes through the same public surface any external program
 * would use: `app.setActiveWindow`, `app.desktop.taskbar.functions.
 * animateTaskbarToWindow`, `app.program.getInfo`, and plain DOM queries on
 * `.window` elements - the same convention taskbar/menu.js's own
 * per-program window list uses.
 *
 * @module components/windowswitcher
 */
(function (app) {
    let overlayEl = null;
    let candidates = [];
    let cardEls = [];
    let selectedIndex = 0;
    let switcherActive = false;
    let comboDown = false;

    function taskIdOf(winEl) {
        const cls = Array.from(winEl.classList).find((c) => c.startsWith("pid-"));
        return cls ? cls.slice(4) : null;
    }

    function resolveName(value, fallback) {
        const resolved = typeof value === "function" ? value() : value;
        return resolved || fallback || "";
    }

    // Most-recently-used first (highest z-index first) - same ordering
    // real Alt-Tab-style switchers use. Excludes modal dialogs (alert/
    // prompt/confirm reuse the theming class `.m-window` on their inner
    // content - see ui/window/dialogs.js) since they're ephemeral and
    // already own their own focus-trap, not independent switch targets.
    function collectCandidates() {
        return Array.from(document.querySelectorAll(".window"))
            .filter((el) => !el.querySelector(".m-window"))
            .map((el) => ({ el, z: parseInt(getComputedStyle(el).zIndex, 10) || 0 }))
            .sort((a, b) => b.z - a.z)
            .map(({ el }) => {
                const taskId = taskIdOf(el);
                const info = taskId && typeof app.program?.getInfo === "function" ? app.program.getInfo(taskId) : null;
                const title = el.querySelector(".window-header .title")?.textContent?.trim() || "";
                return {
                    el,
                    windowId: el.id.replace(/-win$/, ""),
                    taskId,
                    title,
                    programName: resolveName(info?.name, title),
                    // Only the icon glyph itself (svg/img), NOT `.icon`'s whole
                    // innerHTML - that div also contains the `.control-menu`
                    // minimize/maximize/close dropdown, normally hidden by CSS
                    // scoped to a real window header. Dumped raw into a card
                    // outside that context, it would render fully visible.
                    iconHtml: el.querySelector(".window-header .icon > svg, .window-header .icon > img")?.outerHTML || "",
                };
            });
    }

    function buildOverlay() {
        const el = document.createElement("div");
        el.id = "window-switcher-overlay";
        el.innerHTML = '<div class="ws-stage"></div>';
        document.body.appendChild(el);
        return el;
    }

    // Clones the real window's own content, scaled down to fit the
    // thumbnail box, letterboxed (never stretched/distorted) and centered.
    // A clone is a SNAPSHOT at the moment the switcher opens, not a live
    // view - fine for a short-lived overlay. Two things cloneNode(true)
    // does NOT carry over on its own, both fixed up here:
    //  - form field VALUES: cloning copies the `value` ATTRIBUTE, not the
    //    live `.value` PROPERTY, so a Notepad textarea the user actually
    //    typed into would otherwise clone as empty. Synced manually below.
    //  - canvas pixel content: a cloned <canvas> is blank until its bitmap
    //    is redrawn. Synced manually below too (best-effort; a WebGL canvas
    //    without preserveDrawingBuffer may still come out blank - acceptable
    //    for a rough thumbnail, not worth the complexity of forcing that on).
    function buildThumbnail(candidate, wrapEl) {
        // Clone the WHOLE .window, not just its .window-list child - .content
        // (the actual program body: text, canvas, form fields, everything a
        // user would recognize) is a SIBLING of .window-list, not nested
        // inside it, so cloning .window-list alone silently produced empty
        // title-bar-only thumbnails with none of the real content.
        const sourceEl = candidate.el;
        const realW = sourceEl.offsetWidth || 1;
        const realH = sourceEl.offsetHeight || 1;

        const inner = document.createElement("div");
        inner.className = "ws-thumb-inner";
        inner.style.width = realW + "px";
        inner.style.height = realH + "px";

        // Rendered inside a Shadow DOM, KEEPING the real "window"/"pid-x"/
        // "active" classes - the opposite of an earlier attempt that
        // stripped them. That attempt fixed one real collision
        // (app.setActiveWindow's `$(".window").each()` assumes every match
        // has a real id and threw otherwise) but broke every OTHER CSS rule
        // scoped through `.window ...` in the process (next found: the
        // hidden-by-default control-menu dropdown rendering fully visible;
        // there was no guarantee that was the last one - icon sizing rules
        // and others are scoped the same way and would keep surfacing one
        // at a time). Shadow DOM solves BOTH problems structurally instead
        // of patching symptoms: `document.querySelectorAll(".window")` from
        // the main document can never see inside a shadow tree regardless
        // of what classes live there, so the real classes can stay - CSS
        // just needs its own copy of the stylesheet, since shadow trees
        // don't inherit light-DOM <style> tags. All of `app.addCSS()`'s
        // output ends up concatenated into one shared `<style id="s_css">`
        // (see ui/css.js) - cloning that single element covers every
        // `.window`-scoped rule this or any future clone will ever need, in
        // one step, always in sync with whatever's actually live.
        const shadow = inner.attachShadow({ mode: "open" });
        const styleClone = document.getElementById("s_css")?.cloneNode(true);
        if (styleClone) shadow.appendChild(styleClone);

        const clone = sourceEl.cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
        clone.setAttribute("inert", "");
        // The clone carries over the real window's own inline positioning
        // (position:absolute; top/left at its actual screen coordinates,
        // plus its open/close opacity transition) - reset those so it sits
        // naturally inside the thumbnail box instead of trying to fly off
        // to its old on-screen position.
        clone.style.position = "relative";
        clone.style.top = "0";
        clone.style.left = "0";
        clone.style.transform = "none";
        clone.style.opacity = "1";
        clone.style.transition = "none";
        clone.querySelectorAll(".ui-resizable-handle").forEach((n) => n.remove());
        // Belt-and-suspenders even with the real hide-by-default CSS rule
        // now correctly present via the cloned stylesheet above: the
        // thumbnail has no use for this dropdown either way, so drop it
        // rather than depend on CSS specificity always winning.
        clone.querySelectorAll(".control-menu").forEach((n) => n.remove());

        const origFields = sourceEl.querySelectorAll("input, textarea, select");
        const cloneFields = clone.querySelectorAll("input, textarea, select");
        origFields.forEach((o, i) => {
            const c = cloneFields[i];
            if (!c) return;
            if (o.tagName === "SELECT") c.selectedIndex = o.selectedIndex;
            else c.value = o.value;
            if (o.type === "checkbox" || o.type === "radio") c.checked = o.checked;
        });

        const origCanvases = sourceEl.querySelectorAll("canvas");
        const cloneCanvases = clone.querySelectorAll("canvas");
        origCanvases.forEach((o, i) => {
            const c = cloneCanvases[i];
            if (!c) return;
            c.width = o.width;
            c.height = o.height;
            try { c.getContext("2d")?.drawImage(o, 0, 0); } catch (err) { /* cross-origin or WebGL source - leave blank */ }
        });

        shadow.appendChild(clone);
        wrapEl.appendChild(inner);

        const thumbW = wrapEl.clientWidth || 300;
        const thumbH = wrapEl.clientHeight || 190;
        const scale = Math.min(thumbW / realW, thumbH / realH);
        inner.style.transform = `scale(${scale})`;
    }

    // Creates one persistent DOM element per candidate, once, when the
    // switcher opens. applyLayout() below only ever mutates these elements'
    // own style/class afterward - never innerHTML - so the CSS `transition`
    // on transform/opacity actually has a previous value to animate FROM.
    // Rebuilding via innerHTML on every arrow press (the original approach)
    // destroys and recreates every card each time, which starts each new
    // element already at its target style - no interpolation, no roll, just
    // an instant jump every press.
    function buildCards(stage) {
        stage.innerHTML = "";
        cardEls = candidates.map((c) => {
            const footerText = c.programName && c.programName !== c.title
                ? `${c.programName} · ${c.title}`
                : (c.title || c.programName || "");
            const footer = typeof app.util?.escapeHtml === "function" ? app.util.escapeHtml(footerText) : footerText;

            const el = document.createElement("div");
            el.className = "ws-card";
            el.innerHTML = `
                <div class="ws-thumb-wrap">
                    <div class="ws-badge">${c.iconHtml}</div>
                </div>
                <div class="ws-footer">${footer}</div>
            `;
            stage.appendChild(el);
            buildThumbnail(c, el.querySelector(".ws-thumb-wrap"));
            return el;
        });
    }

    function applyLayout() {
        const n = candidates.length;
        cardEls.forEach((el, i) => {
            let d = i - selectedIndex;
            if (d > n / 2) d -= n;
            if (d < -n / 2) d += n;
            const abs = Math.abs(d);
            const isSelected = d === 0;
            // Every window always renders as a card - none are ever dropped,
            // however many are open. Distance from the selected card only
            // affects scale/fade/spread, with floors so far cards stay
            // faintly visible (never fully invisible) rather than vanishing.
            // Spacing scales with viewport width and card count so the arc
            // always spans most of the screen - a "full-screen" spread
            // whether 2 windows are open or 12, not a fixed clump of cards
            // sitting in the middle third of a wide monitor.
            const spread = Math.min(340, (window.innerWidth * 0.46) / Math.max(n / 2, 1));
            const angle = d * -22;
            const tx = d * spread;
            const tz = -abs * 120;
            const scale = isSelected ? 1 : Math.max(0.45, 1 - abs * 0.09);
            const opacity = Math.max(0.35, 1 - abs * 0.16);

            el.classList.toggle("selected", isSelected);
            el.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${angle}deg) scale(${scale})`;
            el.style.opacity = opacity;
            el.style.zIndex = 1000 - abs;
        });
    }

    function openSwitcher() {
        // A previous session's overlay can still be mid fade-out (up to
        // ~0.4s, see fadeOutAndRemove below) when Shift+W is pressed again
        // quickly - without this, its cards and the new session's cards
        // would both sit in the DOM at once, visually doubling every card
        // for the duration of the overlap. Force-clear any leftover
        // immediately; a session that's already being replaced doesn't need
        // its own gentle fade anymore.
        document.querySelectorAll("#window-switcher-overlay").forEach((el) => el.remove());

        candidates = collectCandidates();
        if (!candidates.length) return;
        const activeEl = document.querySelector(".window.active");
        const activeIndex = activeEl ? candidates.findIndex((c) => c.el === activeEl) : -1;
        selectedIndex = activeIndex >= 0 ? activeIndex : 0;
        overlayEl = buildOverlay();
        switcherActive = true;
        buildCards(overlayEl.querySelector(".ws-stage"));
        applyLayout();
        requestAnimationFrame(() => overlayEl?.classList.add("ws-visible"));
    }

    function move(dir) {
        if (!switcherActive || !candidates.length) return;
        selectedIndex = (selectedIndex + dir + candidates.length) % candidates.length;
        applyLayout();
    }

    // Removes .ws-visible (the same class openSwitcher() adds to fade IN)
    // so the overlay's own opacity transition plays in reverse, then removes
    // the element once that transition actually finishes - transitionend is
    // the real signal, the timeout is only a fallback in case it never fires
    // (e.g. the element was already display:none for some reason).
    function fadeOutAndRemove(el) {
        if (!el) return;
        el.classList.remove("ws-visible");
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            el.remove();
        };
        el.addEventListener("transitionend", (e) => {
            if (e.target === el && e.propertyName === "opacity") finish();
        });
        setTimeout(finish, 500);
    }

    function teardown() {
        switcherActive = false;
        if (overlayEl) { fadeOutAndRemove(overlayEl); overlayEl = null; }
        candidates = [];
        cardEls = [];
    }

    function commitSwitcher() {
        if (!switcherActive) return;
        const chosen = candidates[selectedIndex];
        teardown();
        if (!chosen) return;

        const isHidden = getComputedStyle(chosen.el).display === "none" || chosen.el.classList.contains("minimized");
        if (isHidden && chosen.taskId && app.desktop?.taskbar?.functions?.animateTaskbarToWindow) {
            app.desktop.taskbar.functions.animateTaskbarToWindow(chosen.windowId, chosen.taskId);
        }
        if (typeof app.setActiveWindow === "function") app.setActiveWindow(chosen.windowId);
    }

    function cancelSwitcher() {
        teardown();
    }

    document.addEventListener("keydown", (e) => {
        if ((e.key === "w" || e.key === "W") && e.shiftKey) {
            e.preventDefault();
            if (!comboDown) {
                comboDown = true;
                openSwitcher();
            }
            return;
        }
        if (!switcherActive) return;
        if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
        else if (e.key === "Escape") { e.preventDefault(); comboDown = false; cancelSwitcher(); }
    });

    document.addEventListener("keyup", (e) => {
        if ((e.key === "w" || e.key === "W" || e.key === "Shift") && comboDown) {
            comboDown = false;
            commitSwitcher();
        }
    });

    window.addEventListener("blur", () => {
        if (comboDown) { comboDown = false; cancelSwitcher(); }
    });

    app.addCSS("windowswitcher", `
        #window-switcher-overlay {
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(var(--theme-blur, 10px));
            opacity: 0;
            transition: opacity 0.4s ease-in-out;
        }
        #window-switcher-overlay.ws-visible {
            opacity: 1;
        }
        #window-switcher-overlay .ws-stage {
            position: relative;
            width: 100%;
            height: 70vh;
            display: flex;
            align-items: center;
            justify-content: center;
            perspective: 2000px;
            transform-style: preserve-3d;
        }
        #window-switcher-overlay .ws-card {
            position: absolute;
            width: 360px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
            border-radius: 14px;
            background-color: var(--theme-backgruondcolorc, #00000040);
            box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29, 0 20px 50px rgba(0, 0, 0, 0.5);
            transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.3s ease-out, background-color 0.3s ease-out, box-shadow 0.3s ease-out;
            color: #fff;
            pointer-events: none;
        }
        #window-switcher-overlay .ws-card.selected {
            background-color: var(--theme-backgruondcolord, #00000060);
            box-shadow: 0 0 0 3px #fff, 0 26px 60px rgba(0, 0, 0, 0.6);
        }
        #window-switcher-overlay .ws-thumb-wrap {
            position: relative;
            width: 340px;
            height: 212px;
            border-radius: 8px;
            overflow: hidden;
            background: #1a1a1acc;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #window-switcher-overlay .ws-thumb-inner {
            transform-origin: center center;
            pointer-events: none;
        }
        #window-switcher-overlay .ws-badge {
            position: absolute;
            left: 8px;
            bottom: 8px;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.55);
            border-radius: 6px;
            padding: 4px;
            box-sizing: border-box;
            z-index: 2;
        }
        #window-switcher-overlay .ws-badge svg,
        #window-switcher-overlay .ws-badge img {
            width: 100%;
            height: 100%;
        }
        #window-switcher-overlay .ws-footer {
            font-size: 14px;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
            padding: 0 4px;
        }
    `);
})((window.app = window.app || {}));
