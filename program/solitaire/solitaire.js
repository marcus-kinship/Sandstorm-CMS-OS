/**
 * @file solitaire/solitaire.js
 * @description Solitaire (Klondike) program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icon + metadata) lives in `setup.js`.
 * Exports `start(os, win)` (game window creation). Game logic is split
 * across sibling `solitaire_*.js` modules (see each file's own header
 * comment) and assembled into the `solitaire.game` object below; styling
 * lives in `solitaire.css`.
 *
 * @module program/solitaire/solitaire
 */
import { createConfig } from './solitaire_config.js';
import { createGameCore } from './solitaire_core.js';
import { createDroppables, createHandlers, createDraggables } from './solitaire_dragdrop.js';
import { createPlaycards } from './solitaire_cards.js';
import { createFunctions } from './solitaire_functions.js';
import { createArea } from './solitaire_area.js';
import { createTiming } from './solitaire_timing.js';
import { createScore } from './solitaire_score.js';
import { createHistory } from './solitaire_history.js';
import { createHelper } from './solitaire_helper.js';
import { setupSizing } from './solitaire_sizing.js';
import { open as openDeckChooser } from './solitaire_deckchooser.js';

const DECK_STORAGE_KEY = 'solitaire_deck';

/** Reads the persisted deck choice (see chooseDeck() below) — falls back
 *  to deck 1 (the original green pattern) for a first run or a corrupt/
 *  out-of-range stored value. */
function loadSavedDeckId() {
    const saved = parseInt(localStorage.getItem(DECK_STORAGE_KEY), 10);
    return saved >= 1 && saved <= 8 ? saved : 1;
}

export function start(os) {
    // Generate a unique eventId for this window instance

    // Create window with menu
    const win = os.ui.windowStart("solitaire", {
        id: "solitaire",
        title: _("Solitaire"),
        windowIcon: true,
        resizable: true,
        width: "800px",
        height: "650px",
        minWidth: "340px",
        minHeight: "380px",
        menu: {
            options: {
                position: "top",
                mobileicon: true,
                class: "solitaire-menu",
            },
            menu: {
                [_("Game")]: {
                    children: {
                        [_("New Game")]: {
                            click: function () {
                                solitaire.game.new();
                                app.dev.log("New game", "Solitaire");
                            },
                        },
                        [_("Deal")]: {
                            click: function () {
                                app.dev.log("Dealing cards...", "Solitaire");
                            },
                        },
                        [_("Undo")]: {
                            click: function () {
                                solitaire.game.history.backStep();
                                app.dev.log("Undoing last move...", "Solitaire");
                            },
                        },
                        [_("Hint")]: {
                            icon: "💡",
                            click: function () {
                                solitaire.game.helper.showHint();
                                app.dev.log("Showing hint...", "Solitaire");
                            },
                        },
                        [_("High Scores")]: {
                            icon: "🏆",
                            click: function () {
                                solitaire.game.score.show(); // Bindar 'os' till funktionen
                            },
                        },

                        [_("Options")]: {
                            children: {
                                [_("Draw One")]: {
                                    click: function () {
                                        solitaire.config.level = 1;
                                    },
                                },
                                [_("Draw Three")]: {
                                    click: function () {
                                        solitaire.config.level = 3;
                                    },
                                },
                                [_("Choose Deck")]: {
                                    click: function () {
                                        chooseDeck();
                                    },
                                },
                            },
                        },
                    },
                },
                [_("Help")]: {
                    children: {
                        [_("Rules")]: {
                            click: showRules,
                        },
                        [_("About")]: {
                            click: showAbout,
                        },
                    },
                },
            },
        },
        body: function (windowObj) {
            setTimeout(() => { solitaire.win = windowObj; }, 0);

            const langToken = "solitaire-" + windowObj.windowId;
            os.language.registerRefresh(langToken, () => windowObj.title(_("Solitaire")));
            windowObj.on("close", () => os.language.unregisterRefresh(langToken));

            // Event listener for window close

            windowObj.state.close(async (win) => {
                app.dev.log(`Timer stopped for window ${win.windowId}`, "Solitaire");
                solitaire.game.time.stop();
            });

            windowObj.state.ready(async (win) => {
                if (
                    solitaire.config.timer > 0 &&
                    !solitaire.config.gameStarted &&
                    !solitaire.config._winShown
                ) {
                    app.dev.log(`Resuming timer for window ${win.windowId}`, "Solitaire");
                    solitaire.game.time.resume();
                }
            });

            return `
                <div class="solitaire-game deck-${loadSavedDeckId()}" id="solitaire-board-${windowObj.windowId}" style=" height: 100%; padding: 10px; box-sizing: border-box; position: relative;">
                    <div class="game-area">
                        <!-- Row 1 -->
                        <div class="card-slot full-card-holder" data-slot="1"></div>
                        <div class="card-slot max-three-holder" data-slot="2"></div>
                        <div class="card-slot" data-slot="3"></div>
                        <div class="card-slot dark-holder" data-slot="4"></div>
                        <div class="card-slot dark-holder" data-slot="5"></div>
                        <div class="card-slot dark-holder" data-slot="6"></div>
                        <div class="card-slot dark-holder" data-slot="7"></div>
                        <!-- Row 2 (bottom) -->
                        <div class="card-slot bottom" data-slot="8"></div>
                        <div class="card-slot bottom" data-slot="9"></div>
                        <div class="card-slot bottom" data-slot="10"></div>
                        <div class="card-slot bottom" data-slot="11"></div>
                        <div class="card-slot bottom" data-slot="12"></div>
                        <div class="card-slot bottom" data-slot="13"></div>
                        <div class="card-slot bottom" data-slot="14"></div>
                    </div>

                    <div style="position: absolute; bottom: 0; left: 0; right: 0; background-color: #c0c0c0; border-top: 1px solid #000; padding: 5px 10px; display: flex; justify-content: space-between;">
                        <div class="score-display">${_("Score")}: <span id="score-value">0</span></div>
                        <div class="timer-display">${_("Time")}: <span id="timer-value">00:00</span></div>
                    </div>
                </div>
            `;
        },
    });

    // Load styles from an external file (same pattern as mediaplayer.js)
    os.addCSS("solitaire-styles", os.config.local.ProgramRoot + "solitaire/solitaire.css", true);

    function showRules() {
        os.ui.alert(
            _("Solitaire Rules"),
            `
            <h3>${_("How to Play:")}</h3>
            <ol>
                <li>${_("Move cards between tableau piles in descending order and alternating colors")}</li>
                <li>${_("Build foundations up in suit from Ace to King")}</li>
                <li>${_("Click the stock pile to deal cards to the waste pile")}</li>
                <li>${_("Double-click cards to automatically move them to foundations when possible")}</li>
            </ol>
        `
        );
    }

    function showAbout() {
        os.ui.alert(
            _("About Solitaire"),
            `
            <p>${_("Windows 98-style Solitaire")}</p>
            <p>${_("Version 1.0")}</p>
        `
        );
    }

    // Opens the modal "Choose Deck" dialog and waits for the player's
    // choice (openDeckChooser's returned Promise only resolves once the
    // dialog closes, via its own state.close handler — see
    // solitaire_deckchooser.js) before touching anything. Cancel/close
    // resolves undefined, in which case nothing changes and the game just
    // continues exactly as it was.
    //
    // The game timer is paused for the dialog's duration (only if a game
    // was actually running - solitaire.game.resume() would otherwise start
    // it ticking for a game that was never dealt) so browsing decks doesn't
    // silently burn playing time.
    async function chooseDeck() {
        const wasRunning = solitaire.config.gameStarted;
        if (wasRunning) solitaire.game.pause();

        const chosen = await openDeckChooser(os, {
            currentId: solitaire.config.cardBackId,
            parentId: solitaire.win?.windowId || "solitaire",
        });

        if (wasRunning) solitaire.game.resume();

        if (chosen === undefined) return;

        solitaire.config.cardBackId = chosen;
        localStorage.setItem(DECK_STORAGE_KEY, String(chosen));

        const boardEl = document.getElementById(`solitaire-board-${solitaire.win?.windowId}`);
        if (boardEl) {
            boardEl.className = boardEl.className.replace(/\bdeck-\d+\b/, `deck-${chosen}`);
        }
    }


    let solitaire = {
        /**
       * Solitaire game configuration and state.
       */
        config: createConfig(),
        game: {},
    };

    Object.assign(solitaire.game, createGameCore(solitaire), {
        droppables: createDroppables(solitaire),
        handlers: createHandlers(solitaire),
        draggables: createDraggables(solitaire),
        playcards: createPlaycards(solitaire),
        functions: createFunctions(solitaire, os),
        area: createArea(solitaire),
    });
    Object.assign(solitaire.game, createTiming(solitaire), {
        score: createScore(solitaire, os),
        history: createHistory(solitaire),
        helper: createHelper(solitaire),
    });

    setupSizing(solitaire);

    // Initialize new game
    solitaire.game.new();
}
