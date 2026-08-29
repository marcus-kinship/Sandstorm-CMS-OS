/**
 * @file solitaire/solitaire_config.js
 * @description Solitaire game configuration/state factory.
 *
 * Exports `createConfig()`, returning the mutable `solitaire.config` object.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_config
 */

/**
 * Creates the Solitaire game configuration and state object.
 *
 * @returns {Object} A fresh `config` object.
 */
export function createConfig() {
    return {
        /** Indicates whether the game has started */
        gameStarted: false,

        /** Selected card-back design (1-8, see solitaire_deckchooser.js's DECKS) */
        cardBackId: (() => {
            const saved = parseInt(localStorage.getItem('solitaire_deck'), 10);
            return saved >= 1 && saved <= 8 ? saved : 1;
        })(),

        /** Current score of the player */
        score: 0,

        /** Game timer in seconds */
        timer: 0,

        /** Reference to timer interval for updating the timer */
        timerInterval: null,

        /** Original deck of cards */
        deck: [],

        /** Shuffled deck used for dealing */
        shuffledDeck: [],

        /** Cards scored for TEN-points */
        scoredCards: [],

        /** Slots emptied for THREE-points */
        emptiedSlots: [],

        /** Cards turned for FEW-points */
        turnedCards: [],

        /** Suits available in the game */
        suits: ["hearts", "diamonds", "clubs", "spades"],

        /** Values/ranks of cards */
        values: [
            "A", "2", "3", "4", "5", "6", "7",
            "8", "9", "10", "J", "Q", "K"
        ],

        /** Order of cards for comparison and move validation */
        order: ["A", "2", "3", "4", "5", "6", "7",
            "8", "9", "10", "J", "Q", "K"],

        /** DOM elements corresponding to each card */
        cardElements: [],

        /** Difficulty level (could affect scoring, hints, etc.) */
        level: 3,

        /** Vertical offset for stacked back cards in tableau */
        cardOffset: 9.6,

        /** Vertical offset for stacked front cards in tableau */
        cardOffsetTop: 24,

        /** Horizontal offset for stacked stock/waste cards */
        cardOffsetH: 18,

        /** Registered event callbacks */
        events: {},

        /** Standard card dimensions (pixels) */
        CARD_WIDTH: 94,
        CARD_HEIGHT: 138,

        /** Mapping of card slot types */
        CARD_SLOTS: {
            STOCK: 1,               // Stock pile
            WASTE: 2,               // Waste pile
            EMPTY: 3,               // Placeholder empty slot
            FOUNDATION_START: 4,    // Start of foundation slots
            FOUNDATION_END: 7,      // End of foundation slots
            TABLEAU_START: 8,       // Start of tableau slots
            TABLEAU_END: 14         // End of tableau slots
        },

        /** Prevents win dialog from showing more than once per game */
        _winShown: false,

        /** Count of in-flight moveTo() animations */
        _activeAnimations: 0,

        /** Key of the currently active responsive size tier ("lg" | "md" | "sm") */
        _activeSizeTier: null,
    };
}
