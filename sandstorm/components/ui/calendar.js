/**
 * @file calendar.js
 * @description Calendar UI component for the Sandstorm start menu.
 *
 * Registers `app.ui.calendar` — a full-featured month/week view calendar
 * with optional daily schedule (time slots). Features:
 * - Configurable first day of week, date format, month names, and weekday names.
 * - Month navigation (prev/next buttons).
 * - Week-number display.
 * - Day click handler (`onClick`) for custom actions.
 * - Optional daily schedule view (`dailySchedule`) with configurable start/end
 *   hours, 12/24-hour format, and an `addEvent(date, label, callback)` API.
 * - Month/year selection overlay.
 *
 * @module components/ui/calendar
 *
 * @example
 * // In the start sequence (index.html):
 * ["desktop.startmenu.createCalendarTab", {}, {
 *   dailySchedule: { start: "08:00", end: "19:00", timeType: 24 }
 * }]
 */
(function (app) {
    app.ui = Object.assign(app.ui || {}, {

        calendar: {
            /**
             * Initializes the calendar with the given configuration.
             * @param {object} config - Configuration object for the calendar.
             * @param {string} config.startDay - Specifies the first day of the week ('monday' or 'sunday').
             * @param {string} config.dateFormat - Format for the date (e.g., 'w d m'). 'w' = weekday, 'd' = day, 'm' = month.
             * @param {array} config.months - An array of month names (e.g., ['January', 'February', ...]).
             * @param {object} config.weekDays - An object with full and short names of weekdays.
             * @param {array} config.weekDays.full - Full names of the weekdays (e.g., ['Monday', 'Tuesday', ...]).
             * @param {array} config.weekDays.short - Short names of the weekdays (e.g., ['Mon', 'Tue', ...]).
             * @param {boolean} [config.showWeekNumber=false] - Whether to show the week numbers in the calendar.
             * @param {string} [config.selectDateId] - ID of the element to display the selected date.
             * @param {string} [config.calendarmapId] - ID of the element where the calendar days will be rendered.
             * @returns {object} - Returns an object with the method `getDate` to retrieve the formatted current date.
             * @example
             * const calendar = app.ui.calendar.init({
             *   todayId: "#sm-bt-today",
             *   prevId: "#sm-bt-prev",
             *   nextId: "#sm-bt-next",
             *   selectDateId: "#sm-bt-selectDate",
             *   calendarmapId: "#sm-bt-calendar-map",
             *   showWeekNumber: true,
             *   startDay: 'monday',
             *   dateFormat: 'w d m',
             *   months: ['January', 'February', 'March', ...],
             *   weekDays: { full: ['Monday', 'Tuesday', ...], short: ['Mon', 'Tue', ...] }
             * });
             * console.log(calendar.getDate()); // Example output: "Tuesday 22 October"
             */
            init: function (config) {
                // Default configuration
                const defaultConfig = {
                    startDay: 'monday',
                    showWeekNumber: false,
                    dateFormat: '%w %d %m', // Example: "Tuesday 22 October"
                    months: [
                        _('January'), _('February'), _('March'), _('April'), _('May'), _('June'),
                        _('July'), _('August'), _('September'), _('October'), _('November'), _('December')
                    ],
                    weekDays: {
                        full: [_('Monday'), _('Tuesday'), _('Wednesday'), _('Thursday'), _('Friday'), _('Saturday'), _('Sunday')],
                        short: [_('Mon'), _('Tue'), _('Wed'), _('Thu'), _('Fri'), _('Sat'), _('Sun')]
                    }
                };

                app.addCSS("Calendar", `
                    .calendar {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
                        font-size: 12px;
                    }

                    .calendar .current {
                        background-color: #00000040; 
                        border-radius: 10px;
                    }

                    .calendar .body{
                        overflow: auto;
                        height: 525px;
                    }

                    .calendar .hour-row {
                        display: flex;
                        height: 60px;
                        border-bottom: 1px solid #ffffff29;
                    }

                    .calendar .hour-label {
                        width: 50px;
                        text-align: right;
                        padding-right: 10px;
                        color: white;
                        font-size: 16px;
                    }

                    .calendar .event-layer {
                        padding: 10px 20px;
                        width: 300px;
                        border-radius: 10px;
                        position: absolute;
                        z-index: 8500;
                        backdrop-filter: blur(10px);
                        box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;
                         margin-left: 10px;
                        justify-content: center;
                        background: linear-gradient(144deg, rgba(37, 37, 37, 0.3) 0%, rgb(10 10 10 / 20%) 47%);
                    }
                    
                    .calendar .event-layer .layer-list{
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .calendar .event-layer h3 {
                        margin: 0;
                        color: #ffffff;
                    }

                    .calendar .event-layer:hover .close-layer{
                        background-color: #00000040;
                        border-radius: 50%;
                        
                    }
                    .calendar .event-layer .close-layer {
                        border-radius: 50%;
                        cursor: default;
                        width: 23px;
                        background-color: #00000000;
                        height: 23px;
                        display: flex;
                        transition: background-color 2s ease-in-out;
                        align-items: center;
                        justify-content: center;
                    }

                     .calendar .event-layer .close-layer svg{
                        height: 9px;
                        width: 9px;
                    }

                    .calendar  .two-row {
                        display: flex;
                        width: 100%;
                        flex-direction: column;
                        flex: 1;
                    }

                    .calendar .half-hour:first-child {
                        border-bottom: 1px solid #ffffff29;
                    }

                    .calendar .half-hour {
                        flex: 1;
                        border-left: 1px solid #ffffff29;
                        cursor: default;
                        height: 30px;
                        width: 100%;
                        position: relative;
                    }

                    .calendar .h2{
                        border-radius: 10px;
                        padding-right: 32px;
                        transition: background-color 0.6s ease, border-radius 0.6s ease;
                        padding-left: 32px;
                        cursor: default;
                    }

                    .calendar .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        color: #fff;
                        cursor: default;
                    }
                    .calendar .header .h2{
                        border-radius: 10px;
                        padding-right: 10px;
                        transition: background-color 0.6s ease, border-radius 0.6s ease;
                        padding-left: 10px;
                        cursor: default;
                    }
                    .calendar .header .h2:hover {
                        background-color: #00000040;
                        border-radius: 10px;
                    }

                    .calendar .header  div {
                        display: flex;
                        gap: 10px;
                    }

                    .calendar .header div svg {
                        width: 16px;
                        height: 16px;
                        fill: #fff;
                        cursor: default;
                        padding-right: 10px;
                        padding-left: 10px;
                    }

                    .calendar .header div svg:hover {
                        transition: background-color 0.6s ease, border-radius 0.6s ease;
                        background-color: #00000040; /* Gul bakgrundsfärg för att markera aktuell månad/år */
                        border-radius: 10px;
                    }

                    .calendar .month-select {
                        padding: 10px;
                        text-align: center;
                        color: #fff;
                    transition: background-color 0.6s ease, border-radius 0.6s ease;
                        cursor: default;
                    }

                    .calendar .month-select:hover {
                        background-color: #00000040;
                        border-radius: 10px;
                    }

                    /* Grid layout för år */
                    .calendar .map-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr); /* 4 kolumner */
                        gap: 10px;
                        padding-top: 10px;
                    }

                    .calendar .year-select {
                        padding: 10px;
                        text-align: center;
                        color: #fff;
                        transition: background-color 0.6s ease, border-radius 0.6s ease;
                        cursor: default;
                    }

                    .calendar .year-select:hover {
                        background-color: #00000040;
                        border-radius: 10px;
                    }


                    .calendar .calendar-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 5px;
                    }

                    .calendar .week-number {
                        font-weight: bold;
                        width: 40px;
                        color: #fff;
                        text-align: center;
                    }

                    .calendar .day:hover{
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background-color: #00000040;

                    }
                    .calendar .day,.week-day,
                    .calendar .empty-day {
                        width: 40px;
                        height: 40;
                        display: flex;
                        align-content: center;
                        transition: background-color 0.6s ease, border-radius 0.6s ease;
                        justify-content: center;
                        color: fff;
                        border-radius: 50%;
                    }

                    .calendar .day {
                        cursor: default;
                    }

                    .calendar .empty-day {
                    }

                    .calendar .current-day {
                        background-color: #00000040;
                        color: #fff;
                        font-weight: bold;
                    }

                    .calendar .opacity {
                        opacity: 0;
                        animation: fadein 2s forwards ease-in-out;
                        animation-delay: var(--calendar-cantransition-delay);
                    }
                `);

                // Merge defaultConfig with the provided config
                const calendarConfig = Object.assign({}, defaultConfig, config);

                // Define the current date as default
                calendarConfig.currentDate = new Date();

                // Get current date
                const currentDate = calendarConfig.currentDate;
                if (calendarConfig.month == undefined) {
                    calendarConfig.month = calendarConfig.months[currentDate.getMonth()];
                }

                if (calendarConfig.year == undefined) {
                    calendarConfig.year = currentDate.getFullYear();
                }

                if (calendarConfig.day == undefined) {
                    calendarConfig.day = currentDate.getDate();
                }

                if (calendarConfig.viewMode == undefined) {
                    calendarConfig.viewMode = 'day';  // Start with 'day'
                }

                return {
                    config: calendarConfig,

                    /**
                     * Initializes a daily schedule by setting up start and end times, 
                     * handling click events on calendar days, and rendering a time view.
                     *
                     * @function dailySchedule
                     * @param {Object} options - Options for setting up the daily schedule.
                     * @param {string} options.start - The start time in "HH:MM" format (24-hour).
                     * @param {string} options.end - The end time in "HH:MM" format (24-hour).
                     * @param {number} [options.timeType=12] - The format of the time display, 
                     * either 12-hour or 24-hour format.
                     * @param {Function} [options.callback=null] - Optional callback to execute 
                     * when time slots are rendered.
                     *
                     * @returns {void}
                     */
                    dailySchedule: function ({ start, end, timeType = 12, callback = null }) {
                        this.config.dailySchedule = {
                            start: start,
                            end: end,
                            timeType: timeType
                        };

                        // Check that start and end times are provided
                        if (!start || !end) {
                            console.error("Start time and end time must be specified.");
                            return;
                        }

                        // Ensure that the start time is earlier than the end time
                        const [startHour, startMin] = start.split(":").map(Number);
                        const [endHour, endMin] = end.split(":").map(Number);
                        if (startHour > endHour || (startHour === endHour && startMin >= endMin)) {
                            console.error("Start time must be earlier than end time.");
                            return;
                        }

                        // Clear previous click events to avoid duplicate bindings
                        $(this.config.calendarmapId).off("click", ".day");

                        // Add a click event to ".day" elements to activate and render the time view
                        $(this.config.calendarmapId).on("click", ".day", (event) => {

                            // Extract date from class names
                            const classList = event.currentTarget.className.split(" ");
                            const dateClass = classList.find(className => className.startsWith("date-"));
                            if (!dateClass) return;

                            // Get the date in 'yyyy-mm-dd' format
                            const rawDate = dateClass.replace("date-", "");
                            const [year, month, day] = rawDate.split("-").map(Number);

                            // Format the date to 'dd month yyyy' using this.config.months
                            const formattedDate = `${day} ${this.config.months[month - 1]} ${year}`;

                            // Update #sm-bt-selectDate with the selected date
                            $(this.config.selectDateId).text(formattedDate);
                            this.config.viewMode = "time";

                            // Render the time view with the provided start, end, and timeType parameters
                            this.renderTimeView(start, end, timeType, callback);
                        });

                    },

                    addEvent: function () {
                        const self = this;
                        let currentEventLayer = null;
                        let current = null;
                         $(self.config.calendarmapId).on('click', function (event) {
                            if (config.viewMode === 'time') { 
                                return;
                            }
                            
                            if ($(event.target).closest('.event-layer').length > 0) {
                                return; // Avbryt om klicket kommer från event-layer
                            }

                            event.stopPropagation();

                            const offsetY = event.pageY - $(self.config.calendarmapId).offset().top;

                            // Beräkna timme och minut baserat på offsetY
                            const hourOffset = Math.floor(offsetY / 60);  // Hela timmar från offsetY
                            const minutesOffset = offsetY % 60;             // Resterande minuter

                            // Dela upp starttiden i timmar och minuter
                            const [startHour, startMinute] = self.config.dailySchedule.start.split(':').map(Number);

                            // Konvertera starttiden till totalt antal minuter
                            const startTotalMinutes = startHour * 60 + startMinute;

                            // Beräkna den totala tiden i minuter
                            const totalMinutes = startTotalMinutes + (hourOffset * 60) + minutesOffset;

                            // Konvertera tillbaka till timmar och minuter
                            const actualHour = Math.floor(totalMinutes / 60) % 24; // Timme i 24-timmarsformat
                            const actualMinutes = totalMinutes % 60;                // Resterande minuter


                            // Skapa event-lagret

                            if (current) {
                               $(currentEventLayer).remove();
                                currentEventLayer = self.createEventLayer(actualHour, minutesOffset, offsetY);
                                
                             }
                             
                             console.log("hmm");
                             current = true;
                            // Justera huvudkalenderns position
                            $(self.config.calendarmapId).css('position', 'relative');
                        }); 

                        // Dölj .event-layer vid klick utanför kalendern
                        $(".startmenu, html").on('click', function (event) {
                            // Ignorera klick inom .event-layer eller inom kalendern
                            if ($(event.target).closest(self.config.calendarmapId).length > 0) {
                                return;
                            }

                            if (currentEventLayer) {
                             
                                $(currentEventLayer).remove();
                                    currentEventLayer = null;
                              
                            }

                            // Ta bort position: relative om inga event-layer finns
                            $(self.config.calendarmapId).css('position', '');
                        });
                    },

                    createEventLayer: function (hour, minutes, offsetY) {
                        const self = this;

                        let eventLayer = $(`
                            <div class="event-layer">
                                <div class="layer-list">
                                    <h3>${_("AddEvent")}</h3>
                                    <div class="close-layer" title="${_("Close")}"><svg><use href="#ic-bts-close"></use></svg></div>
                                </div>
                                <div class="def-gap">
                                    <div class="input-def">
                                        <input type="text" class="event-title" placeholder="">
                                        <label>${_("Title")}</label>
                                    </div>
                                </div>
                                <div class="def-gap">
                                    <div class="input-def">
                                        <input type="text" class="event-time" value="${hour}:${minutes < 10 ? '0' + minutes : minutes}"  placeholder="">
                                        <label>${_("Time")}</label>
                                    </div>
                                </div>
                                <div class="def-gap">
                                    <div class="input-def">
                                        <input type="text" class="event-location" placeholder="">
                                        <label>${_("Location")}</label>
                                    </div>
                                </div>
                      
                                <label class="def">${_("Description")}</label>
                                <textarea class="def" placeholder=""></textarea>
                                <div class="def-gap">
                                  <button class="aero-button">${_("Save")}</button>
                                </div>
                            </div>
                        `);

                        eventLayer.css({
                            top: offsetY + "px",  // Musens Y-position
                            left: "70px"
                        }).hide().fadeIn(200);

                        $(self.config.calendarmapId).append(eventLayer);

                        eventLayer.find('.close-layer').on('click', function (event) {
                            event.stopPropagation();
                            eventLayer.fadeOut(200, function () {
                                $(this).remove();
                            });
                        });

                        return eventLayer;
                    },

                    /**
                     * Converts a 24-hour format hour to 12-hour format with AM/PM notation.
                     *
                     * @function formatTo12Hour
                     * @param {number} hour - The hour in 24-hour format (0-23).
                     * @returns {string} The formatted hour in 12-hour format (e.g., "3:00 PM").
                     */
                    formatTo12Hour: function (hour) {
                        // Determine whether the time is AM or PM
                        const ampm = hour >= 12 ? "PM" : "AM";

                        // Convert hour to 12-hour format (12 instead of 0 for midnight)
                        const formattedHour = hour % 12 || 12;

                        // Return the formatted hour as a string with ":00" appended
                        return `${formattedHour}:00 ${ampm}`;
                    },

                    /**
                    * Renders a time view from the specified start and end times, dividing each hour into 
                    * 30-minute intervals, and displays them within the configured calendar container.
                    *
                    * @function renderTimeView
                    * @param {string} start - The start time in "HH:MM" format (24-hour).
                    * @param {string} end - The end time in "HH:MM" format (24-hour).
                    * @param {number} timeType - The time format, either 12-hour or 24-hour format.
                    * @param {Function} [callback] - Optional callback function to execute after rendering.
                    *
                    * @returns {void}
                    */
                    renderTimeView: function (start, end, timeType, callback) {
                        // Parse start and end hours from provided times
                        const startHour = parseInt(start.split(":")[0], 10);
                        const endHour = parseInt(end.split(":")[0], 10);

                        // Get the calendar container and clear any existing content
                        const container = $(this.config.calendarmapId);
                        container.empty();
                        let i = 0;
                    
                        // Loop through each hour from start to end
                        for (let hour = startHour; hour <= endHour; hour++) {
                            // Format the hour based on the specified timeType (12-hour or 24-hour)
                            const hourLabel = timeType === 24 ? `${hour}:00` : formatTo12Hour(hour);

                            // Create the hour row element, setting height for the full hour
                            const hourRow = $(`<div class="hour-row opacity" style="--calendar-cantransition-delay: ${i * 0.1}s;">`).attr("data-time", `${hour}:00`);
                            hourRow.append(`<div class="hour-label">${hourLabel}</div>`);

                            // Create a container for 30-minute intervals, using flex layout for alignment
                            const twoRow = $('<div class="two-row"></div>');

                            // Create first 30-minute interval block, adding bottom border for separation
                            const halfHour1 = $('<div class="half-hour"></div>')
                                .attr("data-time", `${hour}:00`);

                            // Create second 30-minute interval block
                            const halfHour2 = $('<div class="half-hour"></div>')
                                .attr("data-time", `${hour}:30`);

                            // Append the 30-minute blocks to the two-row container
                            twoRow.append(halfHour1, halfHour2);

                            // Add the two-row container to the hour row
                            hourRow.append(twoRow);

                            // Append the hour row to the main container
                            container.append(hourRow);
                
                            i++;
                        }

                        // Execute the callback function if it is defined
                        if (typeof callback === "function") {

                                 callback(this);
                           
                        }
                    },

                    /**
                     * Formats a given date according to the specified format in the configuration.
                     * @param {Date} date - The date object to be formatted.
                     * @param {object} config - The calendar configuration that includes the format, months, and weekdays.
                     * @returns {string} - The formatted date string.
                     * @example
                     * const config = {
                     *   dateFormat: 'w d m',
                     * };
                     * 
                     * // Output: "Tuesday 22 October"
                     */
                    formatDate: function (date, config) {
                        const day = date.getDate();
                        const month = config.months[date.getMonth()];
                        const weekDay = config.weekDays.full[date.getDay()];

                        // Replace placeholders ('w' for weekday, 'd' for day, 'm' for month)
                        let formattedDate = config.dateFormat
                            .replace('%w', weekDay)
                            .replace('%d', day)
                            .replace('%m', month);

                        return formattedDate;
                    },

                    /**
                     * Updates the calendar configuration with an optional callback function.
                     * When provided, the callback will be executed each time the calendar updates with new dates,
                     * typically at the start of a new month.
                     * 
                     * @param {Function} [callback=null] - Optional callback function that will receive available dates
                     *                                    when the calendar updates. If null, any existing callback
                     *                                    will be removed.
                     * 
                     * @example
                     * // Example usage with a callback
                     * calendar.update((dates) => {
                     *     console.log('Calendar updated with new dates:', dates);
                     * });
                     * 
                     * // Example usage without callback - removes existing callback
                     * calendar.update();
                     */
                    update: function (callback = null) {
                        if (callback != null) {
                            // Add callback to config.days
                            this.config.days = {
                                callback: callback
                            };
                        }
                    },

                    /**
                     * Initializes the calendar and sets up event listeners for month navigation 
                     * and year/month selection.
                     *
                     * This function verifies the existence of necessary DOM elements and adds 
                     * click event listeners to buttons for navigating between months, 
                     * selecting dates, and resetting to the current date. 
                     * It also handles changes in view modes (day, month, year) and renders 
                     * the calendar appropriately based on the current date.
                     *
                     * @param {function} [callback=null] - An optional callback function to execute 
                     *                                      on initialization. If provided, it will 
                     *                                      be assigned to the days configuration.
                     */
                    start: function (callback = null) {
                        const config = this.config;

                        // Verify if required DOM elements exist
                        const prevButton = document.querySelector(config.prevId);
                        const nextButton = document.querySelector(config.nextId);
                        const selectDateButton = document.querySelector(config.selectDateId);
                        const calendarMap = document.querySelector(config.calendarmapId);

                        if (!prevButton) {
                            console.error(`Element with id '${config.prevId}' for the previous button was not found.`);
                        }
                        if (!nextButton) {
                            console.error(`Element with id '${config.nextId}' for the next button was not found.`);
                        }
                        if (!selectDateButton) {
                            console.error(`Element with id '${config.selectDateId}' for the select date button was not found.`);
                        }
                        if (!calendarMap) {
                            console.error(`Element with id '${config.calendarmapId}' for the calendar map was not found.`);
                        }

                        // Return if any required element is missing
                        if (!prevButton || !nextButton || !selectDateButton || !calendarMap) {
                            console.error('Calendar initialization failed due to missing elements.');
                            return;
                        }

                        // Add click event to navigate to the previous month
                        prevButton.addEventListener('click', () => {
                            $(config.calendarmapId).off('click');

                            if (config.viewMode === 'time') {
                                this.renderCalendar(true);
                            } else if (config.viewMode === 'day') {
                                config.currentDate.setMonth(config.currentDate.getMonth() - 1);
                                this.renderCalendar(true);
                            } else if (config.viewMode === 'month') {
                                config.currentDate.setFullYear(config.currentDate.getFullYear() - 1);
                                this.showMonthYearSelection(true);
                            } else if (config.viewMode === 'year') {
                                config.currentDate.setFullYear(config.currentDate.getFullYear() - 4);
                                this.showMonthYearSelection(true);
                            }
                        });

                        // Add click event to navigate to the next month
                        nextButton.addEventListener('click', () => {
                            $(config.calendarmapId).off('click');

                            if (config.viewMode === 'time') {
                                this.renderCalendar();
                            } else if (config.viewMode === 'day') {
                                config.currentDate.setMonth(config.currentDate.getMonth() + 1);
                                this.renderCalendar();
                            } else if (config.viewMode === 'month') {
                                config.currentDate.setFullYear(config.currentDate.getFullYear() + 1);
                                this.showMonthYearSelection();
                            } else if (config.viewMode === 'year') {
                                config.currentDate.setFullYear(config.currentDate.getFullYear() + 4);
                                this.showMonthYearSelection();
                            }
                        });

                        // Add click event for selecting a month and year
                        selectDateButton.addEventListener('click', () => {
                            $(config.calendarmapId).off('click');

                            if (config.viewMode === 'time') {
                                config.viewMode = 'day';
                                this.renderCalendar();
                                return;

                            } else if (config.viewMode === 'day') {
                                config.viewMode = 'month';
                            } else if (config.viewMode === 'month') {
                                config.viewMode = 'year';
                            }

                            this.showMonthYearSelection();
                        });

                        // Add listeners for the scroll event
                        calendarMap.addEventListener('wheel', (event) => {
                            if (config.viewMode !== 'time') {
                                event.preventDefault();  // Prevent default behavior
                            }

                            if (event.deltaY < 0) {
                                // Scroll up
                                if (config.viewMode === 'day') {
                                    config.currentDate.setMonth(config.currentDate.getMonth() - 1);
                                    this.renderCalendar(true);
                                } else if (config.viewMode === 'month') {
                                    config.currentDate.setFullYear(config.currentDate.getFullYear() - 1);
                                    this.showMonthYearSelection(true);
                                } else if (config.viewMode === 'year') {
                                    config.currentDate.setFullYear(config.currentDate.getFullYear() - 4);
                                    this.showMonthYearSelection(true);
                                }
                            } else if (event.deltaY > 0) {
                                // Scroll down
                                if (config.viewMode === 'day') {
                                    config.currentDate.setMonth(config.currentDate.getMonth() + 1);
                                    this.renderCalendar();

                                } else if (config.viewMode === 'month') {
                                    config.currentDate.setFullYear(config.currentDate.getFullYear() + 1);
                                    this.showMonthYearSelection();
                                } else if (config.viewMode === 'year') {
                                    config.currentDate.setFullYear(config.currentDate.getFullYear() + 4);
                                    this.showMonthYearSelection();
                                }
                            }
                        });

                        const currentDate = new Date();
                        const formattedDate = this.formatDate(currentDate, config);

                        // Get the element with todayId
                        const todayButton = document.querySelector(config.todayId);

                        // Check if todayButton exists and set the text to the formatted date
                        if (todayButton) {
                            todayButton.textContent = formattedDate;  // Set the text to the formatted date

                            // Add a click function to the today button
                            todayButton.addEventListener('click', () => {
                                $(config.calendarmapId).off('click');
                                calendarMap.classList.remove('map-grid');
                                config.currentDate = new Date(); // Set currentDate to today
                                config.viewMode = 'day'; // Switch to day view
                                this.renderCalendar(); // Render the calendar again
                            });
                        }

                        // Render the initial state of the calendar
                        this.renderCalendar();
                    },

                    /**
                     * Changes the current month by a given offset (positive or negative).
                     * @param {number} offset - The number of months to move (can be negative).
                     */
                    changeMonth: function (offset) {

                        const currentDate = this.config.currentDate;
                        const newMonth = currentDate.getMonth() + offset;
                        currentDate.setMonth(newMonth);
                    },


                    /**
                    * Renders a calendar for the current month and year, filling in day cells and optional week numbers.
                    * This function updates the HTML content of the calendar and handles the display of both the previous
                    * and next month's empty day slots to maintain a proper calendar grid.
                    *
                    * @function renderCalendar
                    * @param {boolean} [prev=false] - Direction of calendar rendering. If true, renders in reverse order
                    * 
                    * @requires config {Object} Configuration object containing calendar settings
                    * @property {Date} config.currentDate - Current date object used for calendar rendering
                    * @property {string} config.calendarmapId - DOM selector for the calendar container
                    * @property {string} config.selectDateId - DOM selector for the header displaying current month/year
                    * @property {string[]} config.months - Array of month names
                    * @property {Object} config.weekDays - Object containing weekday names
                    * @property {string[]} config.weekDays.short - Array of shortened weekday names
                    * @property {boolean} config.showWeekNumber - Whether to display week numbers
                    * @property {Object} [config.days] - Optional configuration for day handling
                    * @property {Function} [config.days.callback] - Callback function receiving array of date strings
                    * 
                    * @throws {Error} Throws console error if calendar container element is not found
                    * 
                    * @features
                    * This function creates a complete calendar view with the following features:
                    * - Displays current month and year in the header
                    * - Shows week numbers (optional)
                    * - Highlights current day
                    * - Includes days from previous and next months
                    * - Supports click handling for date selection
                    * - Adds transition delays for visual effects
                    * 
                    * Calendar Structure:
                    * - Previous month's trailing days (with 'empty-day' class)
                    * - Current month's days
                    * - Next month's leading days (with 'empty-day' class)
                    * 
                    * Date Format:
                    * - All dates are formatted as 'YYYY-MM-DD'
                    * - Stored in data attributes and class names
                    * 
                    * CSS Classes:
                    * - 'calendar-row': Container for each week
                    * - 'week-days': Header row with day names
                    * - 'week-number': Week number cells
                    * - 'week-day': Day name cells in header
                    * - 'day': Regular day cells
                    * - 'empty-day': Days from adjacent months
                    * - 'current-day': Highlights current date
                    * - 'opacity': For transition effects
                    * - 'date-{YYYY-MM-DD}': Unique identifier for each date
                    * 
                     *
                     * @example
                     * // Example usage:
                     * calendar.renderCalendar(); // Render the current month calendar
                     * calendar.renderCalendar(true); // Render the calendar with reverse mode
                     *
                     * @description
                     * This function constructs a calendar grid based on the current month and year. It computes the necessary empty
                     * days before and after the current month's days to align the calendar correctly. It also inserts the week number
                     * if `showWeekNumber` is enabled. After rendering, it calls an optional callback function (`config.days.callback`)
                     * with a list of formatted date strings representing each day in the grid.
                     *
                     * If the `prev` argument is `true`, the function will render in reverse order, affecting animations or any behavior
                     * relying on the order of rendered day elements.
                     *
                     * After constructing the HTML structure, it inserts the generated calendar content into the `config.calendarmapId` element.
                     * If the `config.calendarmapId` is invalid (i.e., the element does not exist), an error message will be logged in the console.
                     *
                     * The optional `config.days.callback` function can be used to handle interactions with the calendar, such as enabling
                     * clickable days, highlighting specific dates, or displaying event data.
                     */

                    renderCalendar: function (prev = false) {
                        const config = this.config;
                        const calendarMap = document.querySelector(config.calendarmapId);

                        // Validate required DOM element
                        if (!calendarMap) {
                            app.dev.error(`Element with id '${config.calendarmapId}' for the calendar map was not found.`,"Calendar");
                            return;
                        }

                        // Initialize current date information
                        const currentDate = config.currentDate;
                        const currentMonth = currentDate.getMonth();
                        const currentMonthn = config.months[currentDate.getMonth()];
                        const currentYear = currentDate.getFullYear();
                        const currentDay = currentDate.getDate();

                        // Check if displaying current month and year
                        const isCurrentMonthAndYear = (config.month === currentMonthn && config.year === currentYear);

                        // Update header display
                        document.querySelector(config.selectDateId).innerHTML = `${config.months[currentMonth]} ${currentYear}`;

                        // Calculate calendar boundaries
                        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
                        const lastDateOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                        const lastDateOfPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

                        // Initialize week number (if enabled)
                        let weekNumber = this.getWeekNumber(new Date(currentYear, currentMonth, 1));

                        // Calculate empty days at start of month
                        const emptyDaysStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

                        // Initialize calendar HTML structure
                        let calendarHTML = '<div class="calendar-row week-days">';

                        // Add week number column header
                        calendarHTML += '<div class="week-number"></div>';

                        // Add weekday headers
                        config.weekDays.short.forEach(day => {
                            calendarHTML += `<div class="week-day">${day}</div>`;
                        });

                        calendarHTML += '</div><div class="calendar-row">';

                        // Calculate empty days at end of month
                        const emptyDaysEnd = 7 - ((lastDateOfMonth + emptyDaysStart) % 7);

                        // Initialize dates array and counter
                        let dates = [];
                        let i = prev ? lastDateOfMonth + emptyDaysEnd : 1;

                        // Add week number if enabled
                        if (config.showWeekNumber) {
                            calendarHTML += `<div class="week-number opacity" style="--calendar-cantransition-delay: ${i * 0.05}s;">${weekNumber}</div>`;
                        }

                        // Render previous month's trailing days
                        for (let day = lastDateOfPrevMonth - emptyDaysStart + 1; day <= lastDateOfPrevMonth; day++) {
                            const dateString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            calendarHTML += `<div class="empty-day day opacity date-${dateString}" style="--calendar-cantransition-delay: ${i * 0.05}s;" data-empty="true">${day}</div>`;
                            dates.push(dateString);
                            i = prev ? i - 1 : i + 1;
                        }

                        // Render current month's days
                        for (let day = 1; day <= lastDateOfMonth; day++) {
                            // Start new week row if necessary
                            if ((day + emptyDaysStart - 1) % 7 === 0 && day > 1) {
                                calendarHTML += '</div><div class="calendar-row">';
                                // Add week number if enabled
                                if (config.showWeekNumber) {
                                    weekNumber = this.getWeekNumber(new Date(currentYear, currentMonth, day));
                                    calendarHTML += `<div class="week-number opacity" style="--calendar-cantransition-delay: ${(i + emptyDaysStart) * 0.05}s;">${weekNumber}</div>`;
                                }
                            }

                            // Determine day classes
                            const isCurrentDay = isCurrentMonthAndYear && currentDay === day;
                            const dayClass = isCurrentDay ? 'day current-day' : 'day';

                            // Format date string
                            const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                            // Add day to calendar
                            calendarHTML += `<div class="${dayClass} opacity date-${dateString}" data-empty="false" style="--calendar-cantransition-delay: ${(i + emptyDaysStart) * 0.05}s;">${day}</div>`;
                            dates.push(dateString);
                            i = prev ? i - 1 : i + 1;
                        }

                        // Render next month's leading days
                        for (let day = 1; day <= emptyDaysEnd && emptyDaysEnd < 7; day++) {
                            const nextMonth = currentMonth + 1 > 11 ? 0 : currentMonth + 1;
                            const nextYear = currentMonth + 1 > 11 ? currentYear + 1 : currentYear;
                            const dateString = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            calendarHTML += `<div class="empty-day day opacity date-${dateString}" style="--calendar-cantransition-delay: ${i * 0.05}s;" data-empty="true">${day}</div>`;
                            dates.push(dateString);
                            i = prev ? i - 1 : i + 1;
                        }

                        // Close calendar structure
                        calendarHTML += '</div>';

                        // Update DOM with calendar
                        calendarMap.innerHTML = calendarHTML;


                        // Handle day click callbacks if configured
                        if (config.days != undefined && typeof config.days.callback === 'function') {
                            config.days.callback(dates);
                        }
                    },

                    /**
                     * Calculates the ISO week number for a given date.
                     *
                     * The week number is determined by counting the number of weeks that 
                     * have passed since the first week of the year, which is defined as 
                     * the week that contains the first Thursday of the year.
                     *
                     * @param {Date} date - The date for which to calculate the week number.
                     * @returns {number} The ISO week number (1-53).
                     */
                    getWeekNumber: function (date) {
                        const oneJan = new Date(date.getFullYear(), 0, 1);
                        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
                        return Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
                    },

                    /**
                     * Displays the month or year selection grid in the calendar.
                     *
                     * Depending on the current view mode (month or year), this function 
                     * will render a grid of months or years that the user can select.
                     * The current month or year is highlighted, and clicking on a month 
                     * or year will update the current date and switch back to the day view 
                     * or show the corresponding month/year selection.
                     *
                     * @param {boolean} [prev=false] - Optional flag to determine the direction of selection. 
                     *                                  If true, the selection is adjusted for previous months/years.
                     */
                    showMonthYearSelection: function (prev = false) {
                        const config = this.config;
                        const year = new Date().getFullYear();
                        const calendarMap = document.querySelector(config.calendarmapId);
                        const currentYear = config.currentDate.getFullYear();
                        const currentMonth = config.currentDate.getMonth(); // Current month

                        // Clear the current calendar
                        calendarMap.innerHTML = '';

                        if (config.viewMode === 'time') {

                            this.renderCalendar();
                        } else if (config.viewMode === 'month') {
                            // Add a class to handle grid layout for months
                            calendarMap.classList.add('map-grid');

                            let x = 1;

                            if (prev) {
                                x = 16
                            }

                            // Display the 12 standard months + 4 extra from next year
                            for (let i = 0; i < 16; i++) {
                                const futureMonth = (currentMonth + i) % 12;   // Ensure months wrap after December
                                const futureYear = currentYear + Math.floor((currentMonth + i) / 12);  // Adjust year if next year

                                const monthElement = document.createElement('div');
                                monthElement.className = 'month-select opacity';
                                monthElement.textContent = `${config.months[futureMonth]} ${futureYear}`;   // Add both month and year to the text
                                monthElement.style.setProperty('--calendar-cantransition-delay', `${x * 0.05}s`);

                                // Highlight the current month
                                if (i === 0 && year === currentYear) {
                                    monthElement.classList.add('current');
                                }

                                // Click to select month and return to day view
                                monthElement.addEventListener('click', () => {
                                    config.currentDate.setMonth(futureMonth);
                                    config.currentDate.setFullYear(futureYear);
                                    // Remove 'month-grid' class before returning to day view
                                    calendarMap.classList.remove('map-grid');
                                    config.viewMode = 'day';
                                    this.renderCalendar();
                                });

                                calendarMap.appendChild(monthElement);
                                if (!prev) {
                                    x++;
                                } else {
                                    x--;
                                }

                            }
                        } else if (config.viewMode === 'year') {
                            // Add a class to handle grid layout for years
                            calendarMap.classList.add('map-grid');

                            let x = 1;

                            if (prev) {
                                x = 16
                            }

                            // Display 16 years in rows
                            const yearsRange = 16;
                            const startYear = currentYear - Math.floor(yearsRange / 2);
                            let i = 0;
                            for (let y = startYear; y < startYear + yearsRange; y++) {
                                const yearElement = document.createElement('div');
                                yearElement.className = 'year-select opacity';
                                yearElement.textContent = y;
                                yearElement.style.setProperty('--calendar-cantransition-delay', `${x * 0.05}s`);

                                // Highlight the current year
                                if (y === year) {
                                    yearElement.classList.add('current');
                                }

                                // Click to select year and show months
                                yearElement.addEventListener('click', () => {
                                    config.currentDate.setFullYear(y);
                                    calendarMap.classList.remove('map-grid');
                                    config.viewMode = 'month';
                                    this.showMonthYearSelection();
                                });

                                calendarMap.appendChild(yearElement);
                                i++;
                                if (!prev) {
                                    x++;
                                } else {
                                    x--;
                                }
                            }
                        }
                    }
                };
            }
        }
    });
})(window.app = window.app || {});