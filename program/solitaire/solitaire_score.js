/**
 * @file solitaire/solitaire_score.js
 * @description Solitaire scoring: live score display, TEN/THREE/FEW point
 * rules, and the localStorage-backed high score list/window.
 *
 * Exports `createScore(solitaire, os)`, merged onto `solitaire.game.score`.
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_score
 */

/**
 * Creates `solitaire.game.score`.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @param {Object} os - The OS/program API (used by `show()` to open the High Scores window).
 * @returns {Object} The `score` object.
 */
export function createScore(solitaire, os) {
    return {
        highScoreKey: "solitaire_high_scores",
        /**
         * Sets the displayed game score to a specific value.
         *
         * @function setValue
         * @param {number} value - The score to display.
         * @returns {void}
         */
        setValue: function (value) {
            $("#score-value").text(value);
            app.dev.log("Game score: " + value, "Solitaire");
        },

        /**
         * Adds a given value to the current score.
         *
         * @function addValue
         * @param {number} [increase=1] - The amount to add to the current score.
         * @returns {void}
         */
        addValue: function (increase = 1) {
            let current = parseInt($("#score-value").text(), 10) || 0;
            current += increase;
            $("#score-value").text(current);
            app.dev.log("Game score updated: " + current, "Solitaire");
        },

        /**
         * TEN: Adds 10 points when a card is moved to the foundation.
         *
         * @function ten
         * @param {string} cardId - The ID of the card moved to the foundation.
         * @returns {boolean} True if points were added, false if the card was already scored.
         */
        ten: function (cardId) {
            if (!solitaire.config.scoredCards.includes(cardId)) {
                solitaire.config.scoredCards.push(cardId);
                this.addValue(10);
                app.dev.log(`TEN: +10 points for ${cardId}`, "Solitaire");
                return true;
            }
            return false;
        },

        /**
         * THREE: Adds 3 points when a tableau slot is emptied.
         *
         * @function three
         * @param {number} slotId - The ID of the emptied tableau slot.
         * @returns {boolean} True if points were added, false if the slot was already scored.
         */
        three: function (slotId) {
            if (!solitaire.config.emptiedSlots.includes(slotId)) {
                solitaire.config.emptiedSlots.push(slotId);
                this.addValue(3);
                app.dev.log(`THREE: +3 points for emptied slot ${slotId}`, "Solitaire");
                return true;
            }
            return false;
        },

        /**
         * FEW: Adds 5 points when a card is flipped.
         *
         * @function few
         * @param {string} cardId - The ID of the flipped card.
         * @returns {boolean} True if points were added, false if the card was already scored.
         */
        few: function (cardId) {
            if (!solitaire.config.turnedCards.includes(cardId)) {
                solitaire.config.turnedCards.push(cardId);
                this.addValue(5);
                app.dev.log(`FEW: +5 points for flipping ${cardId}`, "Solitaire");
                return true;
            }
            return false;
        },

        /**
         * Retrieves and sorts scores from localStorage.
         * @function get
         * @returns {Array<Object>} A sorted list of scores.
         */
        get: function () {
            const scoresString = localStorage.getItem(this.highScoreKey);
            try {
                const scores = scoresString ? JSON.parse(scoresString) : [];
                return scores.sort((a, b) => {
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    return a.time - b.time;
                });
            } catch (e) {
                app.dev.error("Could not load scores from localStorage:", e, "Solitaire");
                return [];
            }
        },
        /**
         * Saves a score to localStorage.
         * @function set
         * @param {string} name - The player's name.
         * @param {number} score - The achieved score.
         * @param {number} time - The achieved time (in seconds).
         * @param {function} callback - Callback to run after saving (optional).
         */
        set: function (name, score, time, callback) {
            const newEntry = {
                name: name,
                score: score,
                time: time,
                date: new Date().toLocaleDateString(),
            };
            const scores = this.get();
            scores.push(newEntry);

            const topScores = scores.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.time - b.time;
            }).slice(0, 10);

            localStorage.setItem(this.highScoreKey, JSON.stringify(topScores));
            app.dev.log(`New score saved: ${name}, ${score} points, ${time} seconds`, "Solitaire");
            if (callback) callback();
        },

        /**
         * Clears the score list from localStorage.
         */
        clear: function () {
            localStorage.removeItem(this.highScoreKey);
            solitaire.os.ui.alert(_("High Scores"), _("The score list has been cleared!")).then(() => {
                solitaire.os.ui.windowRefresh("solitaire-highscores");
            });
            app.dev.log("Score list cleared", "Solitaire");
        },

        /**
         * Generates the HTML table for the score list.
         */
        generateScoreTable: function (scores) {
            if (scores.length === 0) {
                return `<p>${_("No scores have been saved yet. Play a game!")}</p>`;
            }

            let html = `
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #c0c0c0; border: 1px solid #777;">
                            <th style="padding: 5px; border: 1px solid #777;">#</th>
                            <th style="padding: 5px; border: 1px solid #777; text-align: left;">${_("Name")}</th>
                            <th style="padding: 5px; border: 1px solid #777; text-align: right;">${_("Score")}</th>
                            <th style="padding: 5px; border: 1px solid #777; text-align: right;">${_("Time")}</th>
                            <th style="padding: 5px; border: 1px solid #777; text-align: right;">${_("Date")}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            scores.forEach((entry, index) => {
                html += `
                    <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f0f0f0'};">
                        <td style="padding: 5px; border: 1px solid #c0c0c0; text-align: center;">${index + 1}</td>
                        <td style="padding: 5px; border: 1px solid #c0c0c0;">${app.util.escapeHtml(entry.name)}</td>
                        <td style="padding: 5px; border: 1px solid #c0c0c0; text-align: right;">${entry.score}</td>
                        <td style="padding: 5px; border: 1px solid #c0c0c0; text-align: right;">${solitaire.game.time.format(entry.time)}</td>
                        <td style="padding: 5px; border: 1px solid #c0c0c0; text-align: right;">${entry.date}</td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            return html;
        },

        /**
         * Opens the High Scores window.
         * @function show
         */
        show: function () {

            os.ui.windowStart("solitaire", {
                id: "solitaire",
                title: _("High Scores"),
                windowIcon: true,
                resizable: false,
                width: "450px",
                height: "400px",
                menu: {
                    options: { position: "top" },
                    menu: {
                        [_("Options")]: {
                            children: {
                                [_("Clear Scores")]: {
                                    click: () => this.clear(), // Calls the clear function in the score object
                                },
                            },
                        },
                    },
                },
                body: function () {
                    // This function is called when the window is updated/opened
                    return `
                        <div style="padding: 10px; font-family: 'Tahoma', sans-serif;">
                            <h2>🏆 ${_("Solitaire High Scores")}</h2>
                            <div id="score-list-container">
                                ${solitaire.game.score.generateScoreTable(solitaire.game.score.get())}
                            </div>
                        </div>
                    `;
                },
            });
        }
    };
}
