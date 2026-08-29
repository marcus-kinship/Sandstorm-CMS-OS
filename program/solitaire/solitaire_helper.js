/**
 * @file solitaire/solitaire_helper.js
 * @description Solitaire hint system: finds and visually highlights an
 * available move.
 *
 * Exports `createHelper(solitaire)`, merged onto `solitaire.game.helper`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_helper
 */

/**
 * Creates `solitaire.game.helper`.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `helper` object.
 */
export function createHelper(solitaire) {
    return {
        /**
         * Searches for all possible moves (hints) on the board and displays the first available one.
         *
         * Priority order:
         *  1. Check the waste pile card (slot 2).
         *  2. Check all visible cards in the tableau (slots 8–14).
         *
         * If at least one valid move is found, the function:
         *  - Logs the found hint
         *  - Displays a visual hint using `displayHint()`
         *  - Returns the hint object
         *
         * If no hints are available:
         *  - Logs the result
         *  - Shows an alert to the user
         *  - Returns `null`
         *
         * @function showHint
         * @returns {Object|null} The first hint found, or null if no valid moves exist.
         *
         * @typedef {Object} Hint
         * @property {string} cardId - The ID of the card that can be moved.
         * @property {number} fromSlot - The slot the card is currently in.
         * @property {number} toSlot - The slot the card can be moved to.
         * @property {string} type - The move type ("foundation" or "tableau").
         * @property {number} priority - Importance of the move.
         */
        showHint: function () {
            app.dev.log("Searching for hints...", "Solitaire");

            let hints = [];

            // 1. Check the waste pile card (slot 2) first
            const $wasteSlot = $(`.card-slot[data-slot="2"]`);
            const $wasteCard = $wasteSlot.children(".card.front").last();

            if ($wasteCard.length > 0) {
                const wasteHints = solitaire.game.helper.findMovesForCard(
                    $wasteCard,
                    2
                );
                hints = hints.concat(wasteHints);
            }

            // 2. Check tableau cards (slots 8–14)
            for (let slotId = 8; slotId <= 14; slotId++) {
                const $slot = $(`.card-slot[data-slot="${slotId}"]`);
                const $cards = $slot.children(".card.front");

                // Check each visible card in the slot
                $cards.each(function () {
                    const $card = $(this);
                    const cardHints = solitaire.game.helper.findMovesForCard(
                        $card,
                        slotId
                    );
                    hints = hints.concat(cardHints);
                });
            }

            // 3. Show the first hint found
            if (hints.length > 0) {
                const hint = hints[0];

                app.dev.log(
                    `Hint found: Move ${hint.cardId} from slot ${hint.fromSlot} to slot ${hint.toSlot}`,
                    "Solitaire"
                );

                // Display visual hint
                solitaire.game.helper.displayHint(hint);

                return hint;
            } else {
                app.dev.log("No hints available", "Solitaire");
                alert("No available moves found!");
                return null;
            }
        },

        /**
         * Determines all valid moves for a given card based on Solitaire rules.
         *
         * Rules applied:
         *  - A card can only be moved if it is the top card of its stack,
         *    unless the stack belongs to the tableau (slots 8–14), where moving full stacks is allowed.
         *  - Foundation slots (4–7):
         *      - Empty foundation accepts only an Ace.
         *      - Otherwise, card must match suit and be exactly one rank higher.
         *  - Tableau slots (8–14):
         *      - Empty tableau accepts only a King.
         *      - Otherwise, card must be opposite color and exactly one rank lower than the top card.
         *
         * @function findMovesForCard
         * @param {jQuery} $card - jQuery-wrapped card element.
         * @param {number} fromSlotId - The slot ID where the card is currently located.
         * @returns {Array<Object>} A list of valid move objects.
         *
         * @typedef {Object} Move
         * @property {string} cardId - The ID of the card being moved.
         * @property {number} fromSlot - The slot the card is moving from.
         * @property {number} toSlot - The target slot.
         * @property {string} type - The move type ("foundation" or "tableau").
         * @property {number} priority - Move priority (used by hint system).
         */
        findMovesForCard: function ($card, fromSlotId) {
            const cardId = $card.attr("id");
            const cardRank = $card.data("rank");
            const cardSuit = $card.data("suit-type");
            const cardColor = $card.data("color");
            let moves = [];

            // Check if the card is the top card in its stack
            const $parent = $card.parent();
            const $nextCards = $card.nextAll(".card.front");

            // Determine if the stack below can be moved (allowed only in tableau)
            const canMoveStack = $nextCards.length === 0 || fromSlotId >= 8;

            // If the card has cards on top and we are not in tableau, it cannot be moved
            if (!canMoveStack && $nextCards.length > 0) {
                return moves;
            }

            // ===== A. Check foundation slots (4–7) =====
            for (let slotId = 4; slotId <= 7; slotId++) {
                const $targetSlot = $(`.card-slot[data-slot="${slotId}"]`);
                const $topCard = $targetSlot.children(".card").last();

                // Empty foundation accepts only an Ace
                if ($topCard.length === 0 && cardRank === "A") {
                    moves.push({
                        cardId: cardId,
                        fromSlot: fromSlotId,
                        toSlot: slotId,
                        type: "foundation",
                        priority: 10,
                    });
                    continue;
                }

                // Non-empty foundation: match suit and be one rank higher
                if ($topCard.length > 0) {
                    const topRank = $topCard.data("rank");
                    const topSuit = $topCard.data("suit-type");

                    if (topSuit === cardSuit) {
                        const values = solitaire.config.values;
                        const topRankIndex = values.indexOf(topRank);
                        const cardRankIndex = values.indexOf(cardRank);

                        if (cardRankIndex === topRankIndex + 1) {
                            moves.push({
                                cardId: cardId,
                                fromSlot: fromSlotId,
                                toSlot: slotId,
                                type: "foundation",
                                priority: 10,
                            });
                        }
                    }
                }
            }

            // ===== B. Check tableau slots (8–14) =====
            // Always check tableau for waste pile cards (slot 2)
            if (moves.length === 0 || fromSlotId === 2) {
                for (let slotId = 8; slotId <= 14; slotId++) {
                    // Skip the same slot
                    if (slotId === fromSlotId) continue;

                    const $targetSlot = $(`.card-slot[data-slot="${slotId}"]`);
                    const $topCard = $targetSlot.children(".card").last();

                    // Empty tableau accepts only a King
                    if ($topCard.length === 0 && cardRank === "K") {
                        moves.push({
                            cardId: cardId,
                            fromSlot: fromSlotId,
                            toSlot: slotId,
                            type: "tableau",
                            priority: 5,
                        });
                        continue;
                    }

                    // Non-empty tableau: must be opposite color and one rank lower
                    if ($topCard.length > 0) {
                        const topRank = $topCard.data("rank");
                        const topColor = $topCard.data("color");

                        if (cardColor !== topColor) {
                            const values = solitaire.config.values;
                            const topRankIndex = values.indexOf(topRank);
                            const cardRankIndex = values.indexOf(cardRank);

                            if (cardRankIndex === topRankIndex - 1) {
                                moves.push({
                                    cardId: cardId,
                                    fromSlot: fromSlotId,
                                    toSlot: slotId,
                                    type: "tableau",
                                    priority: 5,
                                });
                            }
                        }
                    }
                }
            }

            return moves;
        },

        /**
         * Displays a visual hint showing which card should be moved and to which slot.
         *
         * - Highlights the source card (`hint-from`)
         * - Highlights the target slot (`hint-target`)
         * - Highlights the target card inside the slot if it exists (`hint-to`)
         * - Automatically removes all highlights after 3 seconds
         *
         * @function displayHint
         * @param {Object} hint - The hint data object.
         * @param {string} hint.cardId - The ID of the card element that should be highlighted as the source.
         * @param {string|number} hint.toSlot - The slot identifier where the card should be moved.
         * @returns {void}
         */
        displayHint: function (hint) {
            // Remove any previous hint highlights
            $(".card").removeClass("hint-from hint-to");
            $(".card-slot").removeClass("hint-target");

            // Highlight the source card
            const $card = $("#" + hint.cardId);
            $card.addClass("hint-from");

            // Highlight the target slot
            const $targetSlot = $(`.card-slot[data-slot="${hint.toSlot}"]`);
            $targetSlot.addClass("hint-target");

            // Highlight the top card inside the target slot, if one exists
            const $targetCard = $targetSlot.children(".card").last();
            if ($targetCard.length > 0) {
                $targetCard.addClass("hint-to");
            }

            // Remove all highlights after 3 seconds
            setTimeout(() => {
                $(".card").removeClass("hint-from hint-to");
                $(".card-slot").removeClass("hint-target");
            }, 3000);

            app.dev.log(
                `Hint displayed: ${hint.cardId} → slot ${hint.toSlot}`,
                "Solitaire"
            );
        },
    };
}
