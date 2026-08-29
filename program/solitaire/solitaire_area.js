/**
 * @file solitaire/solitaire_area.js
 * @description Solitaire board area: slot clearing/stock-draw and the
 * initial deal/animation ("giveout") logic.
 *
 * Exports `createArea(solitaire)`, merged onto `solitaire.game.area`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_area
 */

/**
 * Creates `solitaire.game.area` — `slots` (clear/drawFromStock) and
 * `giveout` (stockCards/moveTo/flipCard/delay/tableauCards).
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `area` object.
 */
export function createArea(solitaire) {
    return {
        slots: {
            /**
             * Clears the game board and resets all scores, timers, and history.
             *
             * @function clear
             * @returns {void}
             */
            clear: function () {
                // Remove all cards from slots
                $(".card-slot").empty();

                // Reset score and timer
                solitaire.game.score.setValue(0);
                solitaire.game.time.restart();

                // Clear all scoring arrays and history
                solitaire.config.scoredCards = [];
                solitaire.config.emptiedSlots = [];
                solitaire.config.turnedCards = [];
                solitaire.win?.history?.clear();
                solitaire.config._winShown = false;

                app.dev.log("Game cleared", "Solitaire");
            },

            /**
             * Draws cards from the stock to the waste pile according to game level.
             *
             * - Returns waste cards to stock if stock is empty
             * - Moves up to `level` cards from stock to waste
             * - Flips cards face-up in waste
             * - Initializes draggable cards and enables only the top card
             *
             * @function drawFromStock
             * @returns {void}
             */
            drawFromStock: function () {
                const stock = $(".full-card-holder");
                const waste = $(".max-three-holder");

                // 1. Return waste cards to stock if present
                if (waste.children().length > 0) {
                    let wasteCards = waste.children().toArray();

                    // Restore original order (first in, first out)
                    wasteCards.forEach((card) => {
                        const $c = $(card);
                        $c.removeClass("front").addClass("back");
                        $c.find(".card-front").hide();
                        $c.find(".card-back").show();
                        $c.css({ top: 0, left: 0, "z-index": 1 });

                        // Disable draggable if already initialized
                        if ($c.data("ui-draggable")) {
                            $c.draggable("disable");
                        }

                        stock.prepend($c);
                    });
                }

                // 2. Draw up to `level` cards from stock
                let takeCount = Math.min(solitaire.config.level, stock.children().length);
                if (takeCount === 0) return;

                let cardsToMove = stock.children().slice(-takeCount).toArray();

                const offsetH =
                    typeof solitaire.config.cardOffsetH === "number"
                        ? solitaire.config.cardOffsetH
                        : 18;

                cardsToMove.forEach((card, i) => {
                    const $c = $(card);
                    $c.appendTo(waste);
                    $c.removeClass("back").addClass("front");
                    $c.find(".card-back").hide();
                    $c.find(".card-front").show();
                    $c.css({
                        top: 0,
                        left: i * offsetH + "px",
                        "z-index": 10 + i,
                    });

                    // Initialize draggable if not already initialized
                    if (!$c.data("ui-draggable")) {
                        $c.draggable({
                            revert: "invalid",
                            helper: "original",
                            start: solitaire.game.draggables.onStart,
                            drag: solitaire.game.draggables.onDrag,
                            stop: solitaire.game.draggables.onStop,
                        });
                    }

                    // Lock card initially
                    $c.draggable("disable");
                });

                // 3. Only the top card is draggable
                solitaire.game.draggables.enableTopCardInSlot2();
            },
        },
        giveout: {
            /**
             * Places all cards into the stock slot at the beginning of the game.
             *
             * Positions all cards absolutely at (0,0) with proper z-index stacking.
             *
             * @async
             * @function stockCards
             * @returns {Promise<void>}
             */
            stockCards: async function () {
                const stockSlot = $(`.card-slot:nth-child(1)`);
                const cards = solitaire.config.cardElements;

                cards.forEach((card, index) => {
                    card.element
                        .css({
                            position: "absolute",
                            top: "0px",
                            left: "0px",
                            "z-index": index,
                        })
                        .appendTo(stockSlot);
                });

                app.dev.log("Placed all cards in the stock slot", "Solitaire");
            },

            /**
             * Animates moving a card from one slot to another.
             *
             * Creates a cloned card for animation, hides the original during the animation,
             * and places the original into the destination slot once the animation completes.
             *
             * @async
             * @function moveTo
             * @param {number} slotA - The source slot index (1-based child index).
             * @param {number} slotB - The destination slot index (1-based child index).
             * @param {string} cardId - The ID of the card to move.
             * @returns {Promise<void>} Resolves when the card has been moved.
             */
            moveTo: async function (slotA, slotB, cardId) {
                return new Promise((resolve) => {
                    const card = $(`#${cardId}`);
                    const $slotA = $(`.card-slot:nth-child(${slotA})`);
                    const $slotB = $(`.card-slot:nth-child(${slotB})`);
                    const gameArea = $(".game-area");

                    const slotAPos = $slotA.offset();
                    const slotBPos = $slotB.offset();
                    const gameAreaPos = gameArea.offset();

                    const cardsInSlot = $slotB.children().length;
                    const cardOffset = cardsInSlot * solitaire.config.cardOffset;

                    const cardRect = card[0].getBoundingClientRect();

                    // Create a cloned card for smooth animation
                    const animatedCard = card
                        .clone()
                        .css({
                            position: "absolute",
                            left: slotAPos.left - gameAreaPos.left,
                            top: slotAPos.top - gameAreaPos.top,
                            width: cardRect.width,
                            height: cardRect.height,
                            "z-index": 1000,
                            margin: 0,
                        })
                        .appendTo(".game-area");

                    // Hide the original card during animation
                    card.css("visibility", "hidden");

                    solitaire.config._activeAnimations =
                        (solitaire.config._activeAnimations || 0) + 1;

                    // Animate card movement to the destination slot
                    animatedCard.animate(
                        {
                            left: slotBPos.left - gameAreaPos.left,
                            top: slotBPos.top - gameAreaPos.top + cardOffset,
                        },
                        {
                            duration: 120,
                            easing: "swing",
                            complete: function () {
                                // Remove animated clone and show the original in its new slot
                                animatedCard.remove();
                                card
                                    .css({
                                        visibility: "visible",
                                        top: cardOffset + "px",
                                        left: "0",
                                    })
                                    .appendTo($slotB);
                                solitaire.config._activeAnimations--;
                                resolve();
                            },
                        }
                    );
                });
            },

            /**
             * Flips a card to face-up or face-down with animation.
             *
             * @function flipCard
             * @param {boolean} isFaceUp - If true, flip the card face-up; otherwise, flip face-down.
             * @param {string} cardId - The ID of the card to flip.
             * @param {Function} [callback] - Optional callback to execute after the flip animation completes.
             * @returns {void}
             */
            flipCard: function (isFaceUp, cardId, callback) {
                const card = $(`#${cardId}`);

                if (isFaceUp) {
                    // Flip card face-up
                    card.removeClass("back").addClass("front");

                    // Animate back fading out, front fading in
                    card.find(".card-back")
                        .stop(true, true)
                        .fadeOut(300, function () {
                            card.find(".card-front")
                                .stop(true, true)
                                .fadeIn(300, function () {
                                    if (callback) callback();
                                });
                        });
                } else {
                    // Flip card face-down
                    card.removeClass("front").addClass("back");

                    // Animate front fading out, back fading in
                    card.find(".card-front")
                        .stop(true, true)
                        .fadeOut(300, function () {
                            card.find(".card-back")
                                .stop(true, true)
                                .fadeIn(300, function () {
                                    if (callback) callback();
                                });
                        });
                }
            },

            /**
             * Returns a promise that resolves after a specified delay.
             *
             * Useful for creating asynchronous pauses in animations.
             *
             * @function delay
             * @param {number} ms - Milliseconds to wait.
             * @returns {Promise<void>} A promise that resolves after the delay.
             */
            delay: function (ms) {
                return new Promise((resolve) => setTimeout(resolve, ms));
            },

            /**
             * Deals and animates the initial tableau piles in Solitaire.
             *
             * - Deals the first 28 cards into 7 tableau piles (slots 8–14)
             * - Staggers animations with a small delay
             * - Arranges cards with vertical offsets
             * - Flips the top card of each pile face-up
             *
             * @async
             * @function tableauCards
             * @returns {Promise<void>}
             */
            tableauCards: async function () {
                const TABLEAU_SLOTS = [8, 9, 10, 11, 12, 13, 14];
                const CARD_OFFSET = solitaire.config.cardOffset;
                const ANIMATION_DELAY = 1;
                const cards = solitaire.config.cardElements;
                const tableauCards = cards.slice(0, 28);

                for (let pileIndex = 0; pileIndex < TABLEAU_SLOTS.length; pileIndex++) {
                    const slot = TABLEAU_SLOTS[pileIndex];
                    const cardsInPile = pileIndex + 1;
                    const startIndex = (pileIndex * (pileIndex + 1)) / 2;
                    const pileCards = tableauCards.slice(startIndex, startIndex + cardsInPile);

                    for (let cardIndex = 0; cardIndex < pileCards.length; cardIndex++) {
                        const card = pileCards[cardIndex];
                        const isTopCard = cardIndex === cardsInPile - 1;
                        const topPosition = cardIndex * CARD_OFFSET;

                        // Wait a short delay for animation
                        await this.delay((ANIMATION_DELAY / 2) * cardIndex + ANIMATION_DELAY * pileIndex);

                        // Move card to its tableau slot
                        await this.moveTo(
                            solitaire.config.CARD_SLOTS.STOCK,
                            slot,
                            card.id
                        );

                        // Position the card with offset and z-index
                        card.element.css({
                            top: topPosition + "px",
                            left: "0",
                            "z-index": cardIndex,
                        });

                        // Flip the top card face-up, others face-down
                        this.flipCard(isTopCard, card.id);

                        // Mark card as dealt
                        card.dealt = true;
                    }
                }

                app.dev.log("Dealt cards to the tableau piles", "Solitaire");
            },
        },
    };
}
