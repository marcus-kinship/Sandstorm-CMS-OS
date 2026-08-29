/**
 * @file solitaire/solitaire_cards.js
 * @description Solitaire deck/card-element creation.
 *
 * Exports `createPlaycards(solitaire)`, merged onto `solitaire.game.playcards`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_cards
 */

/**
 * Creates `solitaire.game.playcards` — deck creation/shuffling and card
 * DOM element construction.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} The `playcards` object.
 */
export function createPlaycards(solitaire) {
    return {
        suit: {
            /**
             * Get the symbol for a given suit.
             *
             * @param {string} suit - Suit name ('hearts', 'diamonds', 'clubs', 'spades').
             * @returns {string} The corresponding suit symbol (♥, ♦, ♣, ♠) or empty string if unknown.
             */
            getSymbol: function (suit) {
                switch (suit) {
                    case "hearts":
                        return "♥";
                    case "diamonds":
                        return "♦";
                    case "clubs":
                        return "♣";
                    case "spades":
                        return "♠";
                    default:
                        return "";
                }
            },

            /**
             * Generate HTML for the center of the card based on value and suit symbol.
             * For face cards (J, Q, K), display the letter; for numbered cards, repeat the suit symbol.
             *
             * @param {string} value - Card value (A, 2-10, J, Q, K).
             * @param {string} suitSymbol - Symbol of the suit (♥, ♦, ♣, ♠).
             * @returns {string} HTML string representing the card center symbols.
             */
            getCenterSymbols: function (value, suitSymbol) {
                // Face cards show a single letter in center
                if (["J", "Q", "K"].includes(value)) {
                    return `<div class="card-face">${value}</div>`;
                }

                // Number cards show repeated suit symbols
                const symbolCount = isNaN(value) ? 1 : parseInt(value, 10);
                let symbols = "";
                for (let i = 0; i < symbolCount; i++) {
                    symbols += `<div class="card-symbol">${suitSymbol}</div>`;
                }

                return symbols;
            },

        },

        /**
         * Create a standard 52-card deck based on suits and values from config.
         *
         * @returns {Array<Object>} Array of card objects {suit, value}.
         */
        createDeck: function () {
            const deck = [];

            // Loop through each suit and value to create the full deck
            for (const suit of solitaire.config.suits) {
                for (const value of solitaire.config.values) {
                    deck.push({ suit, value });
                }
            }

            console.log("Standard 52-card deck created");
            return deck;
        },

        /**
         * Shuffle a given deck using Fisher-Yates algorithm.
         *
         * @param {Array<Object>} deck - Array of card objects to shuffle.
         * @returns {Array<Object>} Shuffled deck array.
         */
        shuffleDeck: function (deck) {
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }

            console.log("Deck shuffled");
            return deck;
        },

        /**
         * Create a new deck and shuffle it, saving both original and shuffled decks in config.
         */
        createAndShuffle: function () {
            // Create standard deck
            solitaire.config.deck = this.createDeck();

            // Create a shuffled copy
            solitaire.config.shuffledDeck = this.shuffleDeck(solitaire.config.deck.slice());

            console.log("Deck created and shuffled, stored in config");
            app.dev.log("Deck created and shuffled", "Solitaire");
        },

        /**
         * Create card elements for the game based on the shuffled deck.
         * Stores each card object with metadata and its DOM element in solitaire.config.cardElements.
         */
        createCardElements: function () {
            const shuffledDeck = solitaire.config.shuffledDeck;

            const cardList = shuffledDeck.map((card, index) => {
                const cardId = `card-${index}`;
                const isRed = card.suit === "hearts" || card.suit === "diamonds";

                return {
                    id: cardId,
                    suit: card.suit,
                    value: card.value,
                    isRed,
                    element: solitaire.game.playcards.createCardElement(
                        cardId,
                        card.suit,
                        card.value,
                        false // All cards initially face-down
                    ),
                };
            });

            // Save the generated card elements in the game config
            solitaire.config.cardElements = cardList;
            console.log("Cards created and stored in config.cardElements");
        },

        /**
         * Create a single card DOM element with proper front/back state.
         *
         * @param {string} id - Unique ID for the card element.
         * @param {string} suit - Suit of the card ('hearts', 'diamonds', 'clubs', 'spades').
         * @param {string} value - Rank of the card ('A', '2', ... 'K').
         * @param {boolean} isFaceUp - Whether the card should be initially face-up.
         * @returns {jQuery} jQuery object representing the card element.
         */
        createCardElement: function (id, suit, value, isFaceUp) {
            const isRed = suit === "hearts" || suit === "diamonds";
            const suitSymbol = solitaire.game.playcards.suit.getSymbol(suit);
            const colorClass = isRed ? "red" : "black";

            // Construct the card HTML structure
            const card = $(`
        <div class="card" id="${id}">
            <div class="card-front ${colorClass}">
                <div class="card-corner top-left">
                    <div class="card-value">${value}</div>
                    <div class="card-suit">${suitSymbol}</div>
                </div>
                <div class="card-center">
                    ${solitaire.game.playcards.suit.getCenterSymbols(value, suitSymbol)}
                </div>
                <div class="card-corner bottom-right">
                    <div class="card-value">${value}</div>
                    <div class="card-suit">${suitSymbol}</div>
                </div>
                <div class="card-drop-zone" style="display: none;"></div>
            </div>
            <div class="card-back"></div>
        </div>
    `);

            // Store metadata for game logic
            card.data("rank", value);
            card.data("suit", isRed ? "red" : "black");
            card.data("suit-type", suit);
            card.data("color", isRed ? "red" : "black");

            // Set initial card face state
            if (isFaceUp) {
                card.addClass("front");
                card.find(".card-back").hide();
                card.find(".card-front").show();

            } else {
                card.addClass("back");
                card.find(".card-front").hide();
                card.find(".card-back").show();

            }

            return card;
        },

    };
}
