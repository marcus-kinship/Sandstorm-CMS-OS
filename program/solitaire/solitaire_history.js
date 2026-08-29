/**
 * @file solitaire/solitaire_history.js
 * @description Solitaire move undo/redo — reverses/replays drop, double-click
 * move, and flip actions recorded on `win.history`.
 *
 * Exports `createHistory(solitaire)`, merged onto `solitaire.game.history`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_history
 */

/**
 * Creates `solitaire.game.history`.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `history` object.
 */
export function createHistory(solitaire) {
    return {
        /**
         * Undoes the most recent move — thin compat wrapper for the
         * Game menu's "Undo" entry. The actual undo stack lives in
         * `win.history` (see historyManager.js); this just forwards
         * to it.
         *
         * @function backStep
         * @returns {void}
         */
        backStep: function () {
            solitaire.win?.history?.undo();
        },

        /**
         * Reverses a previously executed move.
         *
         * Supported undo types:
         *  - "drop" / "doubleclick":
         *      Moves one or multiple cards back to their original slot.
         *      Updates card positions, z-index, scoring, and triggers refresh.
         *
         *  - "flip":
         *      Reverts a card flip and restores scoring state.
         *
         * Any unknown event type is logged.
         *
         * @function undoMove
         * @param {Object} move - The move object containing event type and arguments.
         * @param {string} move.event - Type of move ("drop", "doubleclick", "flip").
         * @param {Object} move.args - Arguments describing the move details.
         *
         * @typedef {Object} MoveArgsDrop
         * @property {string} cardId - ID of the moved card.
         * @property {Array<string>} [cardIds] - IDs if a full stack was moved.
         * @property {number} fromSlot - Source slot ID.
         * @property {number} toSlot - Target slot ID.
         *
         * @typedef {Object} MoveArgsFlip
         * @property {string} cardId - ID of the flipped card.
         * @property {number} slot - Slot where the card was located.
         *
         * @returns {void}
         */
        undoMove: function (move) {
            switch (move.event) {
                case "drop":
                case "doubleclick": {
                    const cardIds = (move.args.cardIds || [move.args.cardId]).slice();
                    const fromSlot = move.args.fromSlot;
                    const toSlot = move.args.toSlot;

                    const $fromSlot = $(`.card-slot[data-slot="${fromSlot}"]`);
                    const $toSlot = $(`.card-slot[data-slot="${toSlot}"]`);

                    // Move each card in reverse order (because they were stacked in order)
                    cardIds.reverse().forEach((cardId) => {
                        const $card = $(`#${cardId}`);
                        $card.appendTo($fromSlot);
                    });

                    // Update card positions and stack visuals
                    solitaire.game.functions.updateCardPositions($fromSlot);
                    solitaire.game.functions.updateCardPositions($toSlot);
                    solitaire.game.functions.updateMultiCards();
                    solitaire.game.functions.bindBackCardFlip();
                    // 3. Only the top card is draggable
                    solitaire.game.draggables.enableTopCardInSlot2();
                    solitaire.game.trigger("refresh");

                    // Remove points if the move was to a foundation slot (10 points)
                    if (toSlot >= 4 && toSlot <= 7) {
                        // Remove scored card entries
                        cardIds.forEach((cardId) => {
                            const index = solitaire.config.scoredCards.indexOf(cardId);
                            if (index > -1) {
                                solitaire.config.scoredCards.splice(index, 1);
                            }
                        });

                        solitaire.game.score.addValue(-10 * cardIds.length);
                    }

                    // Remove tableau-empty bonus (3 points) if we undo making a slot empty
                    if (fromSlot >= 8 && fromSlot <= 14) {
                        if ($fromSlot.children(".card").length === cardIds.length) {
                            // Slot was empty before and now receives cards back
                            const index = solitaire.config.emptiedSlots.indexOf(fromSlot);
                            if (index > -1) {
                                solitaire.config.emptiedSlots.splice(index, 1);
                                solitaire.game.score.addValue(-3);
                            }
                        }
                    }

                    break;
                }

                case "flip": {
                    const flipCardId = move.args.cardId;
                    const flipSlot = move.args.slot;

                    // Reverse the flip action
                    solitaire.game.area.giveout.flipCard(false, flipCardId);

                    // Remove FEW-points (5 points) for undoing the flip
                    const index = solitaire.config.turnedCards.indexOf(flipCardId);
                    if (index > -1) {
                        solitaire.config.turnedCards.splice(index, 1);
                        solitaire.game.score.addValue(-5);
                    }

                    solitaire.game.trigger("refresh");
                    break;
                }

                default:
                    app.dev.log(`Unknown move to undo: ${move.event}`, "Solitaire");
            }
        },

        /**
         * Replays a previously undone "doubleclick" move — the
         * forward counterpart to undoMove(). Only used by
         * win.history's redo() for moves whose do() was a no-op
         * (moveCardToSlot's animated reparent already happened
         * live, so there's no do() to simply call again — see
         * moveCardToSlot's own execute() call). "drop" and "flip"
         * don't need this: their do()/redo() both call the same
         * synchronous closure directly (see onDrop, bindBackCardFlip).
         *
         * Re-scores via the idempotent score.ten/three/few helpers
         * directly rather than tracking explicit point deltas —
         * each already guards against double-scoring the same
         * card/slot via its own scoredCards/emptiedSlots/turnedCards
         * check.
         *
         * @function redoMove
         * @param {Object} move - Same shape as undoMove's `move`.
         * @returns {void}
         */
        redoMove: function (move) {
            switch (move.event) {
                case "drop":
                case "doubleclick": {
                    const cardIds = (move.args.cardIds || [move.args.cardId]).slice();
                    const fromSlot = move.args.fromSlot;
                    const toSlot = move.args.toSlot;

                    const $fromSlot = $(`.card-slot[data-slot="${fromSlot}"]`);
                    const $toSlot = $(`.card-slot[data-slot="${toSlot}"]`);

                    cardIds.forEach((cardId, i) => {
                        const $card = $(`#${cardId}`);
                        if (!$card.length) return;
                        const position = $toSlot.children(".card").length;
                        $card.appendTo($toSlot).css({
                            top: (toSlot >= 8 && toSlot <= 14 ? position * solitaire.config.cardOffset : 0) + "px",
                            left: "0px",
                            position: "absolute",
                            "z-index": position,
                        });
                    });

                    solitaire.game.functions.updateCardPositions($fromSlot);
                    solitaire.game.functions.updateCardPositions($toSlot);
                    solitaire.game.functions.updateMultiCards();
                    solitaire.game.functions.bindBackCardFlip();
                    solitaire.game.draggables.enableTopCardInSlot2();
                    solitaire.game.trigger("refresh");

                    if (toSlot >= 4 && toSlot <= 7) {
                        cardIds.forEach((cardId) => solitaire.game.score.ten(cardId));
                    }
                    if (fromSlot >= 8 && fromSlot <= 14 && $fromSlot.children(".card").length === 0) {
                        solitaire.game.score.three(fromSlot);
                    }
                    break;
                }

                case "flip": {
                    const flipCardId = move.args.cardId;
                    solitaire.game.area.giveout.flipCard(true, flipCardId);
                    solitaire.game.score.few(flipCardId);
                    solitaire.game.trigger("refresh");
                    break;
                }

                default:
                    app.dev.log(`Unknown move to redo: ${move.event}`, "Solitaire");
            }
        },
    };
}
