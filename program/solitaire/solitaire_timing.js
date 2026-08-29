/**
 * @file solitaire/solitaire_timing.js
 * @description Solitaire game timer: pause/resume/start plus the `time`
 * sub-object (restart/stop/format).
 *
 * Exports `createTiming(solitaire)`, whose members merge directly onto
 * `solitaire.game` (`pause`, `resume`, `start`, `time`).
 * Split out of the original monolithic solitaire.js — moved verbatim, no
 * logic changes.
 *
 * @module program/solitaire/solitaire_timing
 */

/**
 * Creates the timer-related members for `solitaire.game`.
 *
 * @param {Object} solitaire - The shared solitaire instance.
 * @returns {Object} `{ pause, resume, start, time }`.
 */
export function createTiming(solitaire) {
    return {
        /**
         * Pauses the game timer.
         *
         * Stops the timer interval and marks the game as not started.
         *
         * @function pause
         * @returns {void}
         */
        pause: function () {
            solitaire.config.gameStarted = false;
            clearInterval(solitaire.config.timerInterval);
            solitaire.config.timerInterval = null;
            app.dev.log("Game state paused", "Solitaire");
        },

        /**
         * Resumes the existing game timer without resetting the current time.
         * Only used when a paused game is reopened.
         *
         * @function resume
         * @returns {void}
         */
        resume: function () {
            if (solitaire.config.gameStarted || solitaire.config._winShown) {
                return;
            }

            if (solitaire.config.timerInterval) {
                clearInterval(solitaire.config.timerInterval);
            }

            solitaire.config.gameStarted = true;
            solitaire.config.timerInterval = setInterval(() => {
                solitaire.config.timer++;
                $("#timer-value").text(
                    solitaire.game.time.format(solitaire.config.timer)
                );
            }, 1000);

            app.dev.log("Game timer resumed", "Solitaire");
        },

        /**
         * Starts or restarts the game timer.
         *
         * - Clears any existing timer interval
         * - Resets the timer counter to 0
         * - Marks the game as started
         * - Updates the timer display every second
         *
         * @function start
         * @returns {void}
         */
        start: function () {
            // Clear any existing timer
            if (solitaire.config.timerInterval) {
                clearInterval(solitaire.config.timerInterval);
            }

            // Reset timer and mark game as started
            solitaire.config.timer = 0;
            solitaire.config.gameStarted = true;
            $("#timer-value").text(
                solitaire.game.time.format(solitaire.config.timer)
            );

            // Start interval to update timer every second
            solitaire.config.timerInterval = setInterval(() => {
                solitaire.config.timer++;
                $("#timer-value").text(
                    solitaire.game.time.format(solitaire.config.timer)
                );
            }, 1000);

            app.dev.log("Game started", "Solitaire");
        },

        time: {
            /**
             * Restarts the game timer.
             *
             * Stops the current timer, resets the counter to 0,
             * and updates the displayed timer value.
             *
             * @function restart
             * @returns {void}
             */
            restart: function () {
                this.stop();
                solitaire.config.timer = 0;
                $("#timer-value").text(this.format(solitaire.config.timer));
            },

            /**
             * Stops the game timer.
             *
             * Clears the interval and pauses the game.
             *
             * @function stop
             * @returns {void}
             */
            stop: function () {
                clearInterval(solitaire.config.timerInterval);
                solitaire.game.pause();
            },

            /**
             * Formats a time in seconds to a MM:SS string.
             *
             * @function format
             * @param {number} seconds - The number of seconds to format.
             * @returns {string} The formatted time string, e.g., "03:07".
             */
            format: function (seconds) {
                let mins = Math.floor(seconds / 60);
                let secs = seconds % 60;
                return `${mins.toString().padStart(2, "0")}:${secs
                    .toString()
                    .padStart(2, "0")}`;
            },
        },
    };
}
