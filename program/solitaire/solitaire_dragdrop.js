/**
 * @file solitaire/solitaire_dragdrop.js
 * @description Solitaire drag-and-drop: droppable slots, drop/refresh
 * handlers, and jQuery UI draggable wiring.
 *
 * Exports `createDroppables(solitaire)`, `createHandlers(solitaire)`, and
 * `createDraggables(solitaire)`, merged onto `solitaire.game.droppables`,
 * `solitaire.game.handlers`, and `solitaire.game.draggables` respectively.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_dragdrop
 */

/**
 * Creates `solitaire.game.droppables` — droppable slot setup, hover/drop
 * handling, and drop-rejection restore logic.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `droppables` object.
 */
export function createDroppables(solitaire) {
    return {
        /**
         * Initializes all droppable slots in the game (foundation & tableau).
         */
        initialize: function () {
            $(".card-slot").each(function () {
                const $slot = $(this);
                const slotId = parseInt($slot.data("slot"));
                if (slotId >= 4 && slotId <= 14) {
                    solitaire.game.droppables.makeSlotDroppable($slot);
                }
            });
            app.dev.log("All droppable slots initialized", "Solitaire");
        },

        /**
         * Makes a single slot droppable using jQuery UI droppable.
         *
         * @param {jQuery} slot - The slot element to make droppable.
         */
        makeSlotDroppable: function (slot) {
            if (!slot || !slot.length) {
                app.dev.log("Slot not found", "Solitaire");
                return;
            }

            // Already droppable → skip
            if (slot.data("ui-droppable")) return;

            slot.droppable({
                accept: '.card',
                greedy: true,
                tolerance: "touch",
                over: (event, ui) => solitaire.game.droppables.onOver(slot, ui.draggable),
                out: (event, ui) => solitaire.game.droppables.onOut(slot, ui.draggable),
                drop: (event, ui) => solitaire.game.droppables.onDrop(slot, ui.draggable),
            });

            app.dev.log(`Slot ${slot.data("slot")} droppable initialized`, "Solitaire");
        },

        /**
         * Checks if a slot is generally droppable (foundation/tableau slots are always droppable).
         *
         * @param {jQuery} $slot - The slot to check.
         * @returns {boolean} True if the slot can accept a card, false otherwise.
         */
        isDroppable: function ($slot) {
            const slotId = parseInt($slot.data("slot"));
            return slotId >= 4 && slotId <= 14;
        },

        /**
         * Validates if a drop action is allowed based on slot rules.
         *
         * @param {jQuery} $slot - The slot being dropped onto.
         * @param {jQuery} $dragged - The dragged card (bottom card of stack).
         * @returns {boolean} True if the drop is allowed, false otherwise.
         */
        canAccept: function ($slot, $dragged) {
            const slotId = parseInt($slot.data("slot"));
            const ids = $dragged.data("dragStack") || [$dragged.attr("id")];
            const $bottom = $("#" + ids[0]);
            const children = $slot.children(".card.front");

            // Empty foundation only accepts Ace
            if (slotId >= 4 && slotId <= 7 && children.length === 0) {
                return $bottom.data("rank") === "A";
            }

            // Foundation rules
            if (slotId >= 4 && slotId <= 7) {
                const result = solitaire.game.functions.canDropInFoundation($slot, $bottom);
                app.dev.log(`Foundation drop check: ${result ? "valid" : "invalid"}`, "Solitaire");
                return result;
            }

            // Tableau rules
            if (slotId >= 8 && slotId <= 14) {
                const result = solitaire.game.functions.canDropInTableau($slot, $bottom);
                app.dev.log(`Tableau drop check: ${result ? "valid" : "invalid"}`, "Solitaire");
                return result;
            }

            return false;
        },

        /**
         * Called when a dragged card hovers over a droppable slot.
         * Adds hover effect if the slot is droppable.
         *
         * @param {jQuery} $slot - The slot being hovered over.
         * @param {jQuery} $dragged - The card currently being dragged.
         */
        onOver: function ($slot, $dragged) {
            if (solitaire.game.droppables.isDroppable($slot)) {
                $slot.addClass("droppable-hover");
                app.dev.log(`Hover over slot ${$slot.data("slot")}`, "Solitaire");
            }
        },

        /**
         * Called when a dragged card leaves a droppable slot.
         * Removes hover effect.
         *
         * @param {jQuery} $slot - The slot being left.
         */
        onOut: function ($slot) {
            $slot.removeClass("droppable-hover");
            app.dev.log(`Hover removed from slot ${$slot.data("slot")}`, "Solitaire");
        },

        /**
         * Handles the drop action for a card stack on a slot.
         * Validates the drop, moves cards, updates game state, and logs all actions.
         *
         * @param {jQuery} $slot - Target slot where the cards are being dropped.
         * @param {jQuery} $dragged - The dragged card (bottom of the stack).
         */
        onDrop: function ($slot, $dragged) {
            $dragged.data("dropHandled", true);

            const slotId = parseInt($slot.data("slot"));
            const ids = $dragged.data("dragStack") || [$dragged.attr("id")];
            const $bottom = $("#" + ids[0]);

            app.dev.log(
                `Drop attempt: slot ${slotId}, bottom card: ${$bottom.data("rank")}, ${$bottom.data("suit-type")}`,
                "Solitaire"
            );

            // Final validation before accepting the drop
            if (!solitaire.game.droppables.canAccept($slot, $dragged)) {
                app.dev.log("Drop validation failed", "Solitaire");
                solitaire.game.droppables.rejectDrop(ids);
                return false;
            }

            app.dev.log("Drop validation passed, moving cards", "Solitaire");

            const $fromSlot = $("#" + ids[0]).parent();
            const fromSlotId = parseInt($fromSlot.data("slot"));

            const doDrop = () => {
                ids.forEach((id, i) => {
                    const $card = $("#" + id);
                    if (!$card.length) return;

                    const currentCount = $slot.children(".card").length;
                    const position = currentCount + i;

                    if (slotId >= 8 && slotId <= 14) {
                        // Tableau slot
                        $card.appendTo($slot).css({
                            top: position * solitaire.config.cardOffset + "px",
                            left: "0px",
                            position: "absolute",
                            "z-index": position,
                        });
                    } else if (slotId >= 4 && slotId <= 7) {
                        // Foundation slot
                        $card.appendTo($slot).css({
                            top: "0px",
                            left: "0px",
                            position: "absolute",
                            "z-index": position,
                        });

                        // TEN points for moving to foundation
                        solitaire.game.score.ten(id);
                    }

                    $card.removeData("is-dragging");
                    $card.removeData("original-zindex");
                });

                // THREE points if the from-slot is emptied
                if (fromSlotId >= 8 && fromSlotId <= 14 && $fromSlot.children(".card").length === 0) {
                    solitaire.game.score.three(fromSlotId);
                }
            };

            const undoDrop = () => solitaire.game.history.undoMove({
                event: "drop",
                args: { cardIds: ids, fromSlot: fromSlotId, toSlot: slotId },
            });

            const session = solitaire.win?.history;
            if (session) {
                session.execute({
                    type:  "game.move",
                    title: _("Move card"),
                    do:    doDrop,
                    undo:  undoDrop,
                    redo:  doDrop,
                });
            } else {
                doDrop();
            }

            $slot.removeClass("droppable-hover");
            solitaire.game.trigger("drop", $slot, $dragged, ids);

            app.dev.log("Drop completed successfully", "Solitaire");
        },

        /**
         * Rejects a drop action, restoring cards to their original positions and z-indexes.
         *
         * @param {string[]} ids - Array of card IDs in the rejected stack.
         */
        rejectDrop: function (ids) {
            // Remove hover effects
            $(".card-slot.dark-holder").removeClass("droppable-hover");

            // Restore each card's position and z-index
            ids.forEach((id) => {
                const $card = $("#" + id);
                const originalZIndex = $card.data("original-zindex");

                $card.css({
                    top: "",
                    left: "",
                    position: "",
                    "z-index": originalZIndex || "",
                });

                $card.removeData("is-dragging");
                $card.removeData("original-zindex");
            });

            // Normalize positions in all affected slots
            ids.forEach((id) => {
                const $card = $("#" + id);
                const $slot = $card.parent();
                solitaire.game.functions.updateCardPositions($slot);
            });

            app.dev.log(
                "Drop rejected, positions and z-indexes fully restored",
                "Solitaire"
            );
        },
    };
}

/**
 * Creates `solitaire.game.handlers` — the named event callbacks fired via
 * `solitaire.game.trigger()` ("startDrag", "drop", "refresh").
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `handlers` object.
 */
export function createHandlers(solitaire) {
    return {
        /**
        * Called when a drag operation starts.
        * Stores the original z-index of all cards in the stack.
        *
        * @param {jQuery} $card - The card being dragged.
        * @param {jQuery} $stack - The full stack of cards being dragged.
        */
        onStartDrag: function ($card, $stack) {
            $stack.each(function () {
                const $c = $(this);
                const currentZIndex = $c.css("z-index");
                $c.data("original-zindex", currentZIndex);
            });
            app.dev.log(
                `Drag stack initialized for card: ${$card.attr("id")}`,
                "Solitaire"
            );
        },

        /**
         * Called when a card or stack is successfully dropped into a slot.
         * Updates z-index, positions, multi-card classes, back-card flips, and game state.
         *
         * @param {jQuery} $slot - The target slot where the card(s) were dropped.
         * @param {jQuery} $card - The card being dropped.
         * @param {string[]} ids - Array of card IDs in the dragged stack.
         */
        onDrop: function ($slot, $card, ids) {
            const $fromSlot = $("#" + ids[0]).parent();

            // Clear temporary z-index data
            ids.forEach((id) => {
                $("#" + id).removeData("original-zindex");
            });

            // Update game state
            solitaire.game.functions.normalizeAllZIndexes();
            solitaire.game.functions.updateCardPositions($fromSlot);
            solitaire.game.functions.updateCardPositions($slot);
            solitaire.game.functions.updateMultiCards();
            solitaire.game.functions.bindBackCardFlip();
            solitaire.game.functions.hideDropZones();
            solitaire.game.functions.checkGameProgress();
            solitaire.game.trigger("refresh");

            app.dev.log(
                `Cards dropped into slot ${$slot.data("slot")}: ${ids.join(", ")}`,
                "Solitaire"
            );
        },

        /**
         * Refreshes draggable functionality, double-click handlers, multi-card classes, slot heights, and checks for game completion.
         * This should be called whenever the UI needs to reflect a state change (e.g., after dealing, moving, or flipping cards).
         */
        onRefresh: function () {
            // Re-initialize draggable cards
            $(".card.front").draggable({
                revert: "invalid",
                helper: "original",
                start: solitaire.game.draggables.onStart,
                drag: solitaire.game.draggables.onDrag,
                stop: solitaire.game.draggables.onStop,
            });

            // Attach double-click handler for moving cards automatically
            $(".card.front")
                .off("dblclick")
                .on("dblclick", function () {
                    solitaire.game.functions.handleDoubleClick($(this));
                });

            // Update visual states
            solitaire.game.functions.updateMultiCards();
            solitaire.game.functions.updateSlots();
            solitaire.game.functions.finish();

            app.dev.log("Draggables refreshed and UI updated", "Solitaire");
        },
    };
}

/**
 * Creates `solitaire.game.draggables` — jQuery UI draggable start/drag/stop
 * handlers plus the slot-2 (waste) top-card-only-draggable rule and the
 * mobile touch-drag failsafe cleanup.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `draggables` object.
 */
export function createDraggables(solitaire) {
    return {

        /**
         * Enable draggable for the top card in slot 2 (waste pile).
         */
        enableTopCardInSlot2: function () {
            const $waste = $(".max-three-holder"); // slot 2
            const $topCard = $waste.children(".card.front").last();

            // Disable draggable for all other cards
            $waste.children(".card.front").not($topCard).each(function () {
                const $c = $(this);
                if ($c.data("ui-draggable")) $c.draggable("disable");
            });

            // Enable draggable for top card only
            if ($topCard.length && $topCard.data("ui-draggable")) {
                $topCard.draggable("enable");
            }
        },

        /**
         * Enable draggable for the top card in slot 2 (waste pile).
         */
        enableTopCardInSlot2: function () {
            const $slot2 = $(".max-three-holder"); // Slot 2 / waste
            const $cards = $slot2.children(".card.front");

            // Only proceed if there are any cards
            if ($cards.length === 0) {
                return;
            }

            // Disable draggable for all cards in slot 2
            $cards.each(function () {
                const $c = $(this);
                if ($c.data("ui-draggable")) $c.draggable("disable");
            });

            // Enable draggable only for top card
            const $top = $cards.last();
            if ($top.length && $top.data("ui-draggable")) {
                $top.draggable("enable");
            }

            app.dev.log(`Top card in slot 2 enabled for dragging: ${$top.attr("id")}`, "Solitaire");
        },

        /**
         * Called when dragging starts on a card.
         * Handles single-card and multi-card stacks, sets temporary z-index for dragging.
         *
         * @param {Event} event - jQuery UI dragstart event.
         * @param {Object} ui - jQuery UI UI object.
         */
        onStart: function (event, ui) {
            const $dragged = $(this);
            const parentSlot = parseInt($dragged.parent().data("slot"));

            // Only the last card in slot 2 can be dragged
            if (parentSlot === 2) {
                const $cards = $dragged.parent().children(".card.front");
                const lastCard = $cards.last()[0];
                if ($dragged[0] !== lastCard) {
                    event.preventDefault();
                    return false;
                }
            }

            const $stack = solitaire.game.functions.getCardStack($dragged);
            const ids = $stack.map(function () {
                return $(this).attr("id");
            }).get();

            $dragged.data("dragStack", ids);
            app.dev.log(`Drag started for card(s): ${ids.join(", ")}`, "Solitaire");
            solitaire.game.trigger("startDrag", $dragged, $stack);

            if ($stack.length > 1) {
                // Multi-card drag: position each card absolutely
                $stack.each(function (i) {
                    const $c = $(this);
                    const pos = $c.position();
                    $c.css({
                        position: "absolute",
                        top: pos.top + "px",
                        left: pos.left + "px",
                        "z-index": 5000 + i,
                    });
                });
            } else {
                // Single card drag: set high z-index
                $dragged.css("z-index", 5000);
            }

            $stack.data("is-dragging", true);
        },

        /**
         * Called during dragging of a card.
         * Moves all cards in a stack if multi-card drag is active.
         *
         * @param {Event} event - jQuery UI drag event.
         * @param {Object} ui - jQuery UI UI object.
         */
        onDrag: function (event, ui) {
            const $dragged = $(this);
            const ids = $dragged.data("dragStack") || [];

            if (ids.length > 1) {
                const dx = ui.position.left - ui.originalPosition.left;
                const dy = ui.position.top - ui.originalPosition.top;

                for (let i = 1; i < ids.length; i++) {
                    const $c = $("#" + ids[i]);
                    if ($c.length && $c.data("is-dragging")) {
                        const currentTop = parseFloat($c.css("top")) || 0;
                        const currentLeft = parseFloat($c.css("left")) || 0;
                        $c.css({
                            top: currentTop + dy + "px",
                            left: currentLeft + dx + "px",
                        });
                    }
                }

                // Update original position to prevent cumulative delta
                ui.originalPosition.left = ui.position.left;
                ui.originalPosition.top = ui.position.top;
            }
        },

        /**
         * Called when dragging stops on a card.
         * Cleans up temporary data, z-index, and resets dragging flags.
         *
         * @param {Event} event - jQuery UI dragstop event.
         * @param {Object} ui - jQuery UI UI object.
         */
        onStop: function (event, ui) {
            const $dragged = $(this);
            const ids = $dragged.data("dragStack") || [];

            // Handles the missed-every-slot case — see NOTES.md.
            if (!$dragged.data("dropHandled") && ids.length) {
                solitaire.game.droppables.rejectDrop(ids);
            }
            $dragged.removeData("dropHandled");

            solitaire.game.functions.hideDropZones();

            // Clear temporary z-index data
            ids.forEach((id) => {
                const $c = $("#" + id);
                $c.removeData("original-zindex");
            });

            $dragged.removeData("dragStack");
            $(".card").data("is-dragging", false);

            // Enable new top card in slot 2 if needed
            solitaire.game.draggables.enableTopCardInSlot2();

            app.dev.log(`Drag stopped for card(s): ${ids.join(", ")}`, "Solitaire");
        },

        /**
         * Failsafe cleanup for interrupted touch drags.
         *
         * On mobile, a touchcancel (incoming call, system gesture, multi-touch)
         * can fire without touch-punch ever emitting the mouseup it translates
         * touchend into — jQuery UI's own stop/revert logic then never runs, so
         * a dragged card (or the other cards in a multi-card stack, which are
         * positioned manually in onDrag rather than by jQuery UI) is left stuck
         * with inline position/top/left: a "ghost" card floating away from its
         * slot, while the slot it came from renders as if empty. Reuses the same
         * reset logic as a rejected drop for whatever is still mid-drag.
         */
        forceEndDrag: function () {
            const $dragging = $(".card").filter(function () {
                return $(this).data("is-dragging") === true;
            });
            if (!$dragging.length) return;

            const ids = $dragging.map(function () { return $(this).attr("id"); }).get();
            app.dev.log(`Touch drag interrupted — force-resetting card(s): ${ids.join(", ")}`, "Solitaire");

            solitaire.game.droppables.rejectDrop(ids);
            solitaire.game.functions.hideDropZones();
            $(".card").data("is-dragging", false);
            solitaire.game.draggables.enableTopCardInSlot2();
        },

    };
}
