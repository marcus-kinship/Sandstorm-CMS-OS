/**
 * @file solitaire/solitaire_core.js
 * @description Solitaire core game loop: init, event bus, and touch failsafe.
 *
 * Exports `createGameCore(solitaire)`, returning the `isInitializing`/`new`/
 * `initialize`/`event`/`trigger` members merged directly onto `solitaire.game`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_core
 */

/**
 * Creates the core game-loop members for `solitaire.game`.
 *
 * @param {Object} solitaire - The shared solitaire instance (config/game/win).
 * @returns {Object} `{ isInitializing, new, initialize, event, trigger }`.
 */
export function createGameCore(solitaire) {
    return {
        /**
        * Start a new game by clearing slots, shuffling cards, and dealing stock/tableau.
        * Sets up all event handlers and initializes the game state.
        */
        isInitializing: false, // global flag or part of the solitaire object

        new: async function () {
            // stop if initialization is already in progress
            if (this.isInitializing) {
                app.dev.log("Stop if initialization is already in progress", "Solitaire");
              return;
            }
            this.isInitializing = true;       // set the flag to indicate initialization started

            try {
                app.dev.log("Starting new Solitaire game", "Solitaire");

                // Clear all slots
                solitaire.game.area.slots.clear();
                app.dev.log("All slots cleared", "Solitaire");

                // Create and shuffle the deck
                solitaire.game.playcards.createAndShuffle();

                // Create DOM elements for each card
                solitaire.game.playcards.createCardElements();

                // Deal cards to stock and tableau
                await solitaire.game.area.giveout.stockCards();
                await solitaire.game.area.giveout.tableauCards();
                app.dev.log("Cards dealt to stock and tableau", "Solitaire");

                // Register event handlers
                solitaire.game.event("startDrag", solitaire.game.handlers.onStartDrag);
                solitaire.game.event("drop", solitaire.game.handlers.onDrop);
                solitaire.game.event("refresh", solitaire.game.handlers.onRefresh);
                app.dev.log("Event handlers registered", "Solitaire");

                // Initialize stock click handlers and droppables
                solitaire.game.initialize();

                // Trigger initial refresh to setup draggables & multi-card logic
                solitaire.game.trigger("refresh");

                // Start game timer or state
                solitaire.game.start();
                app.dev.log("Game initialization complete", "Solitaire");
            } finally {
                this.isInitializing = false; // reset the flag even if an error occurs
            }
        },

        /**
         * Setup initial event listeners and initialize droppable slots.
         * Called once at game start.
         */
        initialize: function () {
            // Stock click handler: draws a card when the stock is clicked
            $(document).on("click", ".full-card-holder", function () {
                solitaire.game.area.slots.drawFromStock();
                solitaire.game.trigger("refresh");
                app.dev.log("Stock clicked: drew card", "Solitaire");
            });

            // Initialize droppable slots (foundation & tableau)
            solitaire.game.droppables.initialize();
            app.dev.log("Droppable slots initialized", "Solitaire");

            // Mobile touch-drag failsafe — see NOTES.md.
            if (!solitaire.game._touchFailsafeBound) {
                solitaire.game._touchFailsafeBound = true;
                document.addEventListener("touchcancel", () => {
                    solitaire.game.draggables.forceEndDrag();
                }, { passive: true });
                document.addEventListener("touchend", () => {
                    setTimeout(() => solitaire.game.draggables.forceEndDrag(), 50);
                }, { passive: true });
            }
        },

        /**
         * Register a named event callback.
         *
         * @param {string} name - Event name.
         * @param {Function} callback - Callback function to invoke when triggered.
         */
        event: function (name, callback) {
            solitaire.config.events[name] = callback;
            app.dev.log(`Event registered: ${name}`, "Solitaire");
        },

        /**
         * Trigger a previously registered event with optional arguments.
         *
         * @param {string} name - Event name.
         * @param  {...any} args - Arguments to pass to the event callback.
         */
        trigger: function (name, ...args) {
            if (solitaire.config.events[name]) {
                solitaire.config.events[name](...args);
                app.dev.log(`Event triggered: ${name}`, "Solitaire");
            } else {
                app.dev.log(`Event not found: ${name}`, "Solitaire");
            }
        },
    };
}
