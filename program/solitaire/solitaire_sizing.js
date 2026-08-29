/**
 * @file solitaire/solitaire_sizing.js
 * @description Solitaire responsive card-size tiers.
 *
 * Exports `setupSizing(solitaire)`, called once from the entry file right
 * before `solitaire.game.new()`. Measures the window, applies the initial
 * size tier, and wires a ResizeObserver to switch tiers as the window is
 * resized. Split out of the original monolithic solitaire.js — moved
 * verbatim, no logic changes.
 *
 * @module program/solitaire/solitaire_sizing
 */

const SIZE_TIERS = {
    lg: { width: 94, height: 138, offset: 9.6, offsetTop: 24,   offsetH: 18, cssClass: null },
    md: { width: 65, height: 95,  offset: 6.6, offsetTop: 16.5, offsetH: 12, cssClass: "size-md" },
    sm: { width: 48, height: 66,  offset: 4.6, offsetTop: 11.5, offsetH: 9.2, cssClass: "size-sm" },
};

function tierForWidth(width) {
    if (width <= 425) return "sm";
    if (width <= 768) return "md";
    return "lg";
}

/**
 * Switches the active size tier: updates the config metrics used by
 * tableau offsets/animation, toggles the matching CSS class, and
 * repositions cards already on the board. Deferred (retried shortly
 * after) while a card move animation is in flight, so it never fights
 * over element positions with an in-progress .animate() call.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @param {string} tierKey - "lg" | "md" | "sm".
 */
function applySizeTier(solitaire, tierKey) {
    if (tierKey === solitaire.config._activeSizeTier) return;

    if (solitaire.config._activeAnimations > 0) {
        setTimeout(() => applySizeTier(solitaire, tierKey), 150);
        return;
    }

    const tier = SIZE_TIERS[tierKey];
    if (!tier) return;

    solitaire.config._activeSizeTier = tierKey;
    solitaire.config.CARD_WIDTH = tier.width;
    solitaire.config.CARD_HEIGHT = tier.height;
    solitaire.config.cardOffset = tier.offset;
    solitaire.config.cardOffsetTop = tier.offsetTop;
    solitaire.config.cardOffsetH = tier.offsetH;

    const el = document.querySelector(".solitaire-game");
    if (el) {
        el.classList.remove("size-md", "size-sm");
        if (tier.cssClass) el.classList.add(tier.cssClass);
    }

    // Skips stock (1) and waste (2) slots — see NOTES.md.
    $(".card-slot").each(function () {
        const $slot = $(this);
        const slotIndex = parseInt($slot.data("slot"));
        if (slotIndex === 1 || slotIndex === 2) return;
        solitaire.game.functions.updateCardPositions($slot);
    });

    // Re-fan just the currently visible waste batch at the new spacing.
    const waste = $(".max-three-holder").children(".card");
    const visibleCount = Math.min(solitaire.config.level, waste.length);
    waste.slice(-visibleCount).each(function (i) {
        $(this).css({ top: 0, left: i * tier.offsetH + "px" });
    });
}

/**
 * Measures the game window and applies the matching size tier, then wires
 * a ResizeObserver (when available) to re-apply it as the window resizes.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {void}
 */
export function setupSizing(solitaire) {
    // Measures the outer .window chrome, not .solitaire-game — see NOTES.md.
    const gameAreaEl = document.querySelector(".solitaire-game");
    const windowEl = gameAreaEl?.closest(".window");
    const CONTENT_MARGIN = 20;

    function measureAvailableWidth() {
        if (windowEl) return windowEl.getBoundingClientRect().width - CONTENT_MARGIN;
        return gameAreaEl.getBoundingClientRect().width;
    }

    if (gameAreaEl) {
        applySizeTier(solitaire, tierForWidth(measureAvailableWidth()));

        const observeTarget = windowEl || gameAreaEl;
        if (window.ResizeObserver) {
            let resizeDebounce = null;
            const sizeTierObserver = new ResizeObserver(() => {
                clearTimeout(resizeDebounce);
                resizeDebounce = setTimeout(
                    () => applySizeTier(solitaire, tierForWidth(measureAvailableWidth())),
                    120
                );
            });
            sizeTierObserver.observe(observeTarget);
        }
    }
}
