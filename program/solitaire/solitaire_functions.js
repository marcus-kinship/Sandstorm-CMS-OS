/**
 * @file solitaire/solitaire_functions.js
 * @description Solitaire board/game-state helper functions (validation,
 * z-index/position bookkeeping, win detection).
 *
 * Exports `createFunctions(solitaire, os)`, merged onto `solitaire.game.functions`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_functions
 */

/**
 * Creates `solitaire.game.functions` — the board-state helper grab-bag used
 * by drag/drop, double-click, and the win check.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @param {Object} os - The OS/program API (used by `finish()` to open the win window).
 * @returns {Object} The `functions` object.
 */
export function createFunctions(solitaire, os) {
    return {
        /**
         * Checks if the game is finished (all foundations complete).
         * If complete, stops the timer and shows the win/Grattis dialog.
         */
        finish: function () {
            let allFoundationsComplete = true;

            for (let slotId = 4; slotId <= 7; slotId++) {
                const count = $(`.card-slot[data-slot='${slotId}'] .card.front`).length;
                if (count !== 13) {
                    allFoundationsComplete = false;
                    break;
                }
            }

            if (!allFoundationsComplete || solitaire.config._winShown) return;

            solitaire.config._winShown = true;
            app.dev.log("All foundations complete - game finished!", "Solitaire");
            solitaire.game.time.stop();

            const finalScore = parseInt($("#score-value").text(), 10) || 0;
            const finalTime  = solitaire.config.timer;

            os.ui.windowStart("solitaire", {
                id: "solitaire-win",
                title: _("Congratulations!"),
                windowIcon: true,
                resizable: false,
                width: "440px",
                height: "500px",
                body: function () {
                    const scoresHtml = solitaire.game.score.generateScoreTable(
                        solitaire.game.score.get()
                    );
                    return `
                        <div style="padding:15px;font-family:'Tahoma',sans-serif;text-align:center;">
                            <div style="font-size:48px;line-height:1;">🏆</div>
                            <h2 style="color:#008000;margin:8px 0 4px;">${_("Congratulations!")}</h2>
                            <p style="margin:4px 0;">${_("You won the game!")}</p>
                            <p style="margin:6px 0;">
                                ${_("Score")}: <strong>${finalScore}</strong>
                                &nbsp;&nbsp;
                                ${_("Time")}: <strong>${solitaire.game.time.format(finalTime)}</strong>
                            </p>
                            <div style="margin:14px 0;display:flex;justify-content:center;align-items:center;gap:8px;">
                                <label style="white-space:nowrap;">${_("Your name")}:</label>
                                <input id="win-player-name" type="text" maxlength="30"
                                    style="padding:4px 6px;border:2px inset #fff;font-size:14px;width:160px;"
                                    placeholder="${_("Enter your name")}"/>
                                <button id="win-save-btn"
                                    style="padding:4px 14px;cursor:pointer;white-space:nowrap;">
                                    ${_("Save")}
                                </button>
                            </div>
                            <hr style="margin:10px 0;"/>
                            <h3 style="margin:0 0 8px;">🏅 ${_("High Scores")}</h3>
                            <div id="win-score-list" style="text-align:left;">${scoresHtml}</div>
                        </div>
                    `;
                },
            });

            setTimeout(function () {
                $("#win-save-btn").off("click").on("click", function () {
                    const name = $("#win-player-name").val().trim();
                    if (!name) {
                        $("#win-player-name").focus();
                        return;
                    }
                    solitaire.game.score.set(name, finalScore, finalTime, function () {
                        const updated = solitaire.game.score.generateScoreTable(
                            solitaire.game.score.get()
                        );
                        $("#win-score-list").html(updated);
                        $("#win-save-btn").prop("disabled", true).text(_("Saved!"));
                        $("#win-player-name").prop("disabled", true);
                    });
                });

                // Allow pressing Enter in the name field to save
                $("#win-player-name").off("keydown").on("keydown", function (e) {
                    if (e.key === "Enter") $("#win-save-btn").trigger("click");
                });
            }, 150);
        },
        /**
         * Updates 'multi' class on tableau cards.
         * Cards in a stack (more than one) will have 'multi' added to all except the top card.
         */
        updateMultiCards: function () {
            const $slot2 = $(`.card-slot[data-slot="2"]`);
            $slot2.find(".card.front").removeClass("multi"); // Waste slot never gets multi

            for (let slot = 4; slot <= 14; slot++) {
                const $slot = $(`.card-slot[data-slot="${slot}"]`);
                const $cards = $slot.children(".card.front");

                if ($cards.length > 1) {
                    $cards.not(":last").addClass("multi");
                    $cards.last().removeClass("multi");
                } else {
                    $cards.removeClass("multi");
                }

                this.normalizeZIndexes($slot);
            }
        },

        /**
         * Checks if a card can be dropped into a foundation slot.
         *
         * @param {jQuery} $slot - The foundation slot element.
         * @param {jQuery} $card - The card element being moved.
         * @returns {boolean} True if the card can be legally dropped.
         */
        canDropInFoundation: function ($slot, $card) {
            const $top = $slot.children(".card").last();
            const rank = $card.data("rank");
            const suitType = $card.data("suit-type");

            if ($top.length === 0) {
                // Empty foundation - only allow Ace
                return rank === "A";
            }

            const topRank = $top.data("rank");
            const topSuitType = $top.data("suit-type");

            if (topSuitType !== suitType) return false;

            const values = solitaire.config.values;
            const currentRankIndex = values.indexOf(topRank);
            const nextRankIndex = currentRankIndex + 1;
            const nextRank = values[nextRankIndex] || null;

            return nextRank === rank;
        },

        /**
         * Checks if a card can be dropped into a tableau slot.
         *
         * @param {jQuery} $slot - The tableau slot element.
         * @param {jQuery} $card - The card element being moved.
         * @returns {boolean} True if the card can be legally dropped.
         */
        canDropInTableau: function ($slot, $card) {
            const $top = $slot.children(".card").last();
            const rank = $card.data("rank");
            const cardColor = $card.data("color");

            app.dev.log(
                `Tableau drop check: card=${rank}${cardColor}, slot=${$slot.data(
                    "slot"
                )}, topCard=${$top.length ? $top.data("rank") + $top.data("color") : "empty"}`,
                "Solitaire"
            );

            // Empty slot - allow any card (or optionally only King)
            if ($top.length === 0) {
                app.dev.log(`Empty slot - card allowed`, "Solitaire");
                return true;
            }

            const topRank = $top.data("rank");
            const topColor = $top.data("color");

            // Colors must alternate
            if (cardColor === topColor) {
                app.dev.log(`Rejected - same color: ${cardColor} == ${topColor}`, "Solitaire");
                return false;
            }

            // Rank must be one lower than the top card
            const values = solitaire.config.values;
            const topRankIndex = values.indexOf(topRank);
            const cardRankIndex = values.indexOf(rank);

            const result = cardRankIndex === topRankIndex - 1;
            app.dev.log(`Rank check: ${cardRankIndex} === ${topRankIndex} - 1 -> ${result}`, "Solitaire");

            return result;
        },

        /**
         * Handles a double-click event on a card.
         *
         * - Attempts to automatically move the card to a valid foundation or tableau slot.
         * - Prioritizes foundation moves (slots 4-7) first.
         * - Then checks tableau slots (8-14).
         *
         * @function handleDoubleClick
         * @param {jQuery} $card - The card element that was double-clicked.
         * @returns {void}
         */
        handleDoubleClick: function ($card) {
            const cardRank = $card.data("rank");
            const cardSuit = $card.data("suit-type");
            const cardColor = $card.data("color");

            app.dev.log(`Double-clicked card: ${cardRank} of ${cardSuit}`, "Solitaire");

            // 1. Check foundation slots (4-7) first
            for (let slotId = 4; slotId <= 7; slotId++) {
                const $slot = $(`.card-slot[data-slot="${slotId}"]`);
                const $topCard = $slot.children(".card").last();

                // Empty foundation - only allow Ace
                if ($topCard.length === 0 && cardRank === "A") {
                    solitaire.game.functions.moveCardToSlot($card, $slot);
                    return;
                }

                // Non-empty foundation - check same suit and next rank
                if ($topCard.length > 0) {
                    const topRank = $topCard.data("rank");
                    const topSuit = $topCard.data("suit-type");

                    if (topSuit === cardSuit) {
                        const values = solitaire.config.values;
                        const topRankIndex = values.indexOf(topRank);
                        const cardRankIndex = values.indexOf(cardRank);

                        if (cardRankIndex === topRankIndex + 1) {
                            solitaire.game.functions.moveCardToSlot($card, $slot);

                            return;
                        }
                    }
                }
            }

            // 2. Check tableau slots (8-14)
            for (let slotId = 8; slotId <= 14; slotId++) {
                const $slot = $(`.card-slot[data-slot="${slotId}"]`);
                const $topCard = $slot.children(".card").last();

                // Empty tableau - only allow King
                if ($topCard.length === 0 && cardRank === "K") {
                    solitaire.game.functions.moveCardToSlot($card, $slot);
                    return;
                }

                // Non-empty tableau - check alternating colors and descending rank
                if ($topCard.length > 0) {
                    const topRank = $topCard.data("rank");
                    const topColor = $topCard.data("color");

                    if (cardColor !== topColor) {
                        const values = solitaire.config.values;
                        const topRankIndex = values.indexOf(topRank);
                        const cardRankIndex = values.indexOf(cardRank);

                        if (cardRankIndex === topRankIndex - 1) {
                            solitaire.game.functions.moveCardToSlot($card, $slot);
                            return;
                        }
                    }
                }
            }

            app.dev.log("No valid move found for double-clicked card", "Solitaire");
        },

        /**
         * Moves a card to a target slot with animations and scoring updates.
         *
         * - Uses `moveTo` for animation
         * - Awards points for moves to foundation (TEN) or emptied tableau (THREE)
         * - Records the move in history
         * - Updates positions, multi-card stacks, back card flips, and game progress
         *
         * @function moveCardToSlot
         * @param {jQuery} $card - The card element to move.
         * @param {jQuery} $targetSlot - The slot element to move the card into.
         * @returns {void}
         */
        moveCardToSlot: function ($card, $targetSlot) {
            const cardId = $card.attr("id");
            const $currentSlot = $card.parent();
            const currentSlotId = $currentSlot.data("slot");
            const targetSlotId = $targetSlot.data("slot");

            app.dev.log(
                `Moving card ${cardId} from slot ${currentSlotId} to slot ${targetSlotId}`,
                "Solitaire"
            );

            // Use moveTo function for animated movement
            solitaire.game.area.giveout
                .moveTo(currentSlotId, targetSlotId, cardId)
                .then(() => {
                    // TEN: Award points if moved to foundation (slots 4-7)
                    if (targetSlotId >= 4 && targetSlotId <= 7) {
                        solitaire.game.score.ten(cardId);
                    }

                    // THREE: Award points if a tableau slot (8-14) became empty
                    if (currentSlotId >= 8 && currentSlotId <= 14) {
                        if ($currentSlot.children(".card").length === 0) {
                            solitaire.game.score.three(currentSlotId);
                        }
                    }

                    const moveArgs = { cardId, fromSlot: currentSlotId, toSlot: targetSlotId };
                    const session = solitaire.win?.history;
                    if (session) {
                        session.execute({
                            type:  "game.move",
                            title: _("Move card"),
                            do()   {},
                            undo() { solitaire.game.history.undoMove({ event: "doubleclick", args: moveArgs }); },
                            redo() { solitaire.game.history.redoMove({ event: "doubleclick", args: moveArgs }); },
                        });
                    }

                    // Update game state and visual layout
                    solitaire.game.functions.updateCardPositions($currentSlot);
                    solitaire.game.functions.updateCardPositions($targetSlot);
                    solitaire.game.functions.updateMultiCards();
                    solitaire.game.functions.bindBackCardFlip();
                    solitaire.game.functions.checkGameProgress();
                    solitaire.game.trigger("refresh");

                    // 3. Only the top card is draggable
                    solitaire.game.draggables.enableTopCardInSlot2();
                });
        },

        /**
         * Updates the height of tableau slots based on stacked cards.
         *
         * - Front cards add 20px
         * - Back cards add 8px
         * - Base slot height is 115px
         *
         * @function updateSlots
         * @returns {void}
         */
        updateSlots: function () {
            const BASE_HEIGHT = 115; // base slot height

            $(".card-slot").each(function () {
                const slot = $(this);
                const slotNum = parseInt(slot.data("slot"), 10);

                // Only update tableau slots (8-14)
                if (slotNum < 8 || slotNum > 14) return;

                const cards = slot.children(".card");
                let extraHeight = 0;

                cards.each(function () {
                    extraHeight += $(this).hasClass("front") ? 20 : 8;
                });

                const totalHeight = BASE_HEIGHT + extraHeight;
                slot.css("height", totalHeight + "px");
            });
        },

        /**
         * Returns the stack of a card including all cards above it.
         *
         * - Slot 2 (waste) does not allow stacked moves
         *
         * @function getCardStack
         * @param {jQuery} $card - The card element to get the stack for.
         * @returns {jQuery} A jQuery collection of the card and any stacked cards above it.
         */
        getCardStack: function ($card) {
            const parentSlot = parseInt($card.parent().data("slot"));

            // Waste slot never has stackable cards
            if (parentSlot === 2) {
                return $card;
            }

            // Get all face-up cards above this one in the stack
            let $stack = $card.nextAll(".card.front");
            return $card.add($stack);
        },

        /**
         * Normalizes z-index values for all cards in all slots.
         *
         * Ensures that each card in a slot has sequential z-index starting from 0.
         *
         * @function normalizeAllZIndexes
         * @returns {void}
         */
        normalizeAllZIndexes: function () {
            $(".card-slot").each(function () {
                const $slot = $(this);
                $slot.children(".card").each(function (index) {
                    $(this).css("z-index", index);
                });
            });
        },

        /**
         * Normalizes z-index values for cards in a specific slot.
         *
         * @function normalizeZIndexes
         * @param {jQuery} $slot - The slot whose cards' z-index should be normalized.
         * @returns {void}
         */
        normalizeZIndexes: function ($slot) {
            $slot.children(".card").each(function (index) {
                $(this).css("z-index", index);
            });
        },

        /**
         * Updates the positions and z-indexes of cards in a slot.
         *
         * - For foundation slots, cards stack at top-left.
         * - For tableau slots, cards are offset based on whether they are face-up or face-down.
         * - For stock/waste or other slots, cards are slightly offset horizontally.
         *
         * @function updateCardPositions
         * @param {jQuery} $slot - The card slot to update.
         * @returns {void}
         */
        updateCardPositions: function ($slot) {
            const slotIndex = parseInt($slot.data("slot") || $slot.index() + 1);
            const isFoundation = slotIndex >= 4 && slotIndex <= 7;
            const isTableau = slotIndex >= 8 && slotIndex <= 14;

            if (isFoundation) {
                // Foundation cards stack at top-left with z-index order
                $slot.children(".card").each(function (index) {
                    $(this).css({ top: "0px", left: "0px", "z-index": index });
                });
                return;
            }

            if (isTableau) {
                // Use configured offsets, fallback to defaults
                const offsetFront =
                    typeof solitaire.config.cardOffsetTop === "number"
                        ? solitaire.config.cardOffsetTop
                        : 20;
                const offsetBack =
                    typeof solitaire.config.cardOffset === "number"
                        ? solitaire.config.cardOffset
                        : 8;

                // Position cards sequentially with running top offset
                let runningTop = 0;
                $slot.children(".card").each(function (index) {
                    const $card = $(this);
                    $card.css({
                        top: runningTop + "px",
                        left: "0px",
                        "z-index": index,
                    });

                    runningTop += $card.hasClass("front") ? offsetFront : offsetBack;
                });
                return;
            }

            // Other slots (stock, waste) - horizontal stacking
            const offsetH =
                typeof solitaire.config.cardOffsetH === "number"
                    ? solitaire.config.cardOffsetH
                    : 18;
            $slot.children(".card").each(function (index) {
                const $card = $(this);
                $card.css({
                    top: "0px",
                    left: index * offsetH + "px",
                    "z-index": index,
                });
            });
        },

        /**
         * Binds click events to face-down cards in bottom slots to flip them.
         *
         * - Awards FEW points (5) for flipping a card
         * - Records the flip in history
         * - Flips the card face-up and refreshes the game state
         *
         * @function bindBackCardFlip
         * @returns {void}
         */
        bindBackCardFlip: function () {
            $(".card-slot.bottom").each(function () {
                const $slot = $(this);
                const $topCard = $slot.children(".card").last();

                if ($topCard.hasClass("back")) {
                    $topCard.off("click");
                    $topCard.on("click", function () {
                        const cardId = $(this).attr("id");
                        const slot = parseInt($slot.data("slot"));

                        const doFlip = () => {
                            // Award 5 points for flipping the card
                            solitaire.game.score.few(cardId);
                            // Flip the card face-up
                            solitaire.game.area.giveout.flipCard(true, cardId);
                            // Refresh game state
                            solitaire.game.trigger("refresh");
                        };

                        const undoFlip = () => solitaire.game.history.undoMove({
                            event: "flip",
                            args: { cardId, slot },
                        });

                        const session = solitaire.win?.history;
                        if (session) {
                            session.execute({
                                type:  "game.flip",
                                title: _("Flip card"),
                                do:    doFlip,
                                undo:  undoFlip,
                                redo:  doFlip,
                            });
                        } else {
                            doFlip();
                        }
                    });
                } else {
                    // Unbind click for any back cards not on top
                    $slot.children(".card.back").off("click");
                }
            });
        },

        /**
         * Hides all drop zones and removes droppable indicators.
         *
         * @function hideDropZones
         * @returns {void}
         */
        hideDropZones: function () {
            $(".card-drop-zone").hide();
            $(".card-slot").removeClass("droppable-empty");
        },

        /**
         * Logs the current game progress for debugging or monitoring purposes.
         *
         * @function checkGameProgress
         * @returns {void}
         */
        checkGameProgress: function () {
            app.dev.log("Game state updated", "Solitaire");
        },
    };
}
