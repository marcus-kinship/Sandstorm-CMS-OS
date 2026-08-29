/**
 * @file taskbar/clock.js
 * @description Taskbar clock: time formatting, the digital `setInterval`
 * clock, the mode dispatcher (digital/digital-short/analog/hidden), and the
 * canvas-rendered analog clock.
 *
 * Registers `app.desktop.taskbar.{formatClockTime, clock, setClockDisplay,
 * analogClock}` — same IIFE-extends convention as the other taskbar/*.js
 * sibling modules. Loaded via `taskbar/index.js`'s side-effect imports.
 *
 * Split out of the original monolithic taskbar/index.js — moved verbatim,
 * no logic changes.
 *
 * @module components/taskbar/clock
 */
(function (app) {

    Object.assign(app.desktop.taskbar, {

        /**
         * Formats a `Date` as `HH:MM` or `HH:MM:SS`, honoring `config.clockTimeFormat`
         * (`"24"` for 24-hour time, `"12"` for 12-hour time with an AM/PM suffix).
         * @param {Date} now
         * @param {string} [format="full"] - `"full"` for HH:MM:SS, `"short"` for HH:MM.
         * @returns {string}
         */
        formatClockTime: function (now, format = "full") {
            const use12h = app.desktop.taskbar.config.clockTimeFormat === "12";
            let hoursNum = now.getHours();
            let suffix = "";

            if (use12h) {
                suffix = hoursNum >= 12 ? " PM" : " AM";
                hoursNum = hoursNum % 12;
                if (hoursNum === 0) hoursNum = 12;
            }

            const hours = hoursNum.toString().padStart(2, "0");
            const minutes = now.getMinutes().toString().padStart(2, "0");
            if (format === "short") return `${hours}:${minutes}${suffix}`;
            const seconds = now.getSeconds().toString().padStart(2, "0");
            return `${hours}:${minutes}:${seconds}${suffix}`;
        },

        /**
         * Two-line hover tooltip (`title` attribute) for the clock: a
         * notification summary on the first line, full date + time on the
         * second — e.g. "You have no notifications\nAug 6, 2025 12:40"
         * ("\nden 6 aug 2025 12:40" in Swedish). Date locale is driven off
         * `globalThis.currentLanguage` (set by `language.js`'s
         * `_activate`), not hardcoded to one language — Swedish's "den"
         * prefix is added manually since `Intl` doesn't produce it on its
         * own. The notification summary comes from `app.notifications`
         * (optional-chained — this file loads before that feature only in
         * theory, never in this app's actual boot order, but the file
         * itself shouldn't hard-crash if notifications is ever absent).
         * @param {Date} now
         * @returns {string}
         */
        formatClockTitle: function (now) {
            const time = app.desktop.taskbar.formatClockTime(now, "short");
            let datePart;
            if (globalThis.currentLanguage === "sv") {
                datePart = now.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
                datePart = `den ${datePart} ${time}`;
            } else {
                datePart = `${now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} ${time}`;
            }

            const unread = app.notifications?.list?.().filter(n => !n.read).length ?? 0;
            const summary = unread === 0
                ? _('No notifications')
                : (unread === 1 ? _('1 new notification') : printf(_('%d new notifications'), unread));

            return `${summary}\n${datePart}`;
        },

        /**
         * Starts a digital clock that updates the text of the given element every second.
         * Also keeps a full-date `title` tooltip on the element, refreshed only when it
         * actually changes (once a minute) so the browser's native tooltip doesn't flicker.
         * @param {string} [id="timeDisplay"] - ID of the element to write the time into.
         * @param {string} [format="full"]     - `"full"` for HH:MM:SS, `"short"` for HH:MM.
         * @returns {number} The `setInterval` handle — store it in `config.clockInterval` to clear later.
         */
        clock: function (id = "timeDisplay", format = "full") {
            let clockInterval = null;

            const getCurrentTime = () => app.desktop.taskbar.formatClockTime(new Date(), format);

            const timeDisplay = $('#' + id)[0];
            if (timeDisplay) {
                let lastTitle = "";
                const updateTitle = () => {
                    const title = app.desktop.taskbar.formatClockTitle(new Date());
                    if (title !== lastTitle) {
                        timeDisplay.title = title;
                        lastTitle = title;
                    }
                };

                // Updates the existing time text node in place rather than
                // timeDisplay.textContent = ... (which wipes ALL children
                // every tick, including the notifications badge dot —
                // recreating that element every second permanently
                // restarted its CSS pulse animation from 0%, so a 3s pulse
                // never got past its first second and looked static).
                const _setTimeText = (text) => {
                    let textNode = null;
                    for (const node of timeDisplay.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) { textNode = node; break; }
                    }
                    if (textNode) textNode.textContent = text;
                    else timeDisplay.insertBefore(document.createTextNode(text), timeDisplay.firstChild);
                };

                _setTimeText(getCurrentTime());
                updateTitle();
                clockInterval = setInterval(() => {
                    _setTimeText(getCurrentTime());
                    updateTitle();
                }, 1000);
            } else {
                console.warn(`Element with id '${id}' not found.`);
            }
            return clockInterval;
        },

        /**
         * Central entry point for applying the user's chosen clock display mode to a
         * horizontal (desktop/tablet) taskbar. Clears any running clock interval, then
         * renders the requested mode, and finally re-runs overflow detection since
         * hiding/shrinking the clock changes how much space `.tasks` has available.
         *
         * @param {string} [mode] - `"digital"`, `"digital-short"`, `"analog"`, or `"hidden"`.
         *                           Defaults to the stored `config.clockDisplayMode`.
         * @param {string} [id="timeDisplay"] - Container element ID.
         */
        setClockDisplay: function (mode, id = "timeDisplay") {
            const config = app.desktop.taskbar.config;
            mode = mode || config.clockDisplayMode;
            config.clockDisplayMode = mode;
            config.clockOverflowActive = false;

            clearInterval(config.clockInterval);
            config.clockInterval = null;

            const $el = $('#' + id);
            $el.show().attr('title', '');
            $el.empty();

            switch (mode) {
                case "hidden":
                    $el.hide();
                    break;
                case "analog":
                    config.clockInterval = app.desktop.taskbar.analogClock(id, 25, 25);
                    break;
                case "digital-short":
                    config.clockInterval = app.desktop.taskbar.clock(id, "short");
                    break;
                default:
                    config.clockInterval = app.desktop.taskbar.clock(id, "full");
            }

            app.desktop.taskbar.overflow.handle();
        },

        /**
         * Renders an analogue clock on a `<canvas>` inside the given element,
         * updating every second. Also sets the container's `title` attribute to the
         * current digital time (HH:MM), only rewriting it when the minute changes so the
         * native tooltip doesn't flicker while hovering.
         * @param {string} [id="timeDisplay"] - Container element ID.
         * @param {number} [width=30]
         * @param {number} [height=30]
         * @param {string} [color="#fff"]     - Stroke / fill colour for hands and face.
         * @returns {number} The `setInterval` handle.
         */
        analogClock: function (id = "timeDisplay", width = 30, height = 30, color = "#fff") {
            const parentElement = $('#' + id)[0];

            if (!parentElement) {
                console.error(`Element with id "${id}" not found.`);
                return;
            }

            const canvas = document.createElement('canvas');

            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            canvas.width = width * dpr;
            canvas.height = height * dpr;

            parentElement.innerHTML = "";
            parentElement.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            let lastTitle = "";

            function drawClock(color) {
                ctx.clearRect(0, 0, width, height);

                const centerX = width / 2;
                const centerY = height / 2;
                const radius = Math.min(centerX, centerY) - 4;

                const now = new Date();
                const hours = now.getHours() % 12;
                const minutes = now.getMinutes();
                const seconds = now.getSeconds();

                const hoursAngle = (hours * 30 + minutes * 0.5) - 90;
                const minutesAngle = (minutes * 6) - 90;
                const secondsAngle = (seconds * 6) - 90;

                const title = app.desktop.taskbar.formatClockTitle(now);
                if (title !== lastTitle) {
                    parentElement.title = title;
                    lastTitle = title;
                }

                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.stroke();

                const handLength = radius * 0.8;

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + handLength * Math.cos(hoursAngle * Math.PI / 180),
                    centerY + handLength * Math.sin(hoursAngle * Math.PI / 180)
                );
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + handLength * Math.cos(minutesAngle * Math.PI / 180),
                    centerY + handLength * Math.sin(minutesAngle * Math.PI / 180)
                );
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + handLength * Math.cos(secondsAngle * Math.PI / 180),
                    centerY + handLength * Math.sin(secondsAngle * Math.PI / 180)
                );
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(centerX, centerY, 1.5, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
            }

            let clockInterval = null;
            clockInterval = setInterval(function () { drawClock(color); }, 1000);
            drawClock(color);
            return clockInterval;
        },

    });

})((window.app = window.app || {}));
