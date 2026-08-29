/**
 * @file slider.js
 * @description Range-slider jQuery plugin (`.defSlider()`) for Sandstorm programs.
 *
 * Converts a `<div class="def-slider">` element into an interactive range
 * slider with a draggable handle, a fill bar, an optional value tooltip, and
 * optional synchronisation with an `<input type="number">` field.
 *
 * Also supports mouse-wheel adjustment and fires a configurable `updateCallback`
 * on every value change.
 *
 * CSS for `.def-slider` is embedded as a `<style>` block in the first line of
 * this file and loaded once per page.
 *
 * @module components/ui/slider
 *
 * @example
 * $(".volume-slider").defSlider({
 *   min: 0, max: 100, value: 50,
 *   field: "#volume-input",
 *   updateCallback: (val) => console.log("Volume:", val)
 * });
 */

/**
 * jQuery plugin to create a customizable, interactive slider with single or dual handle support.
 * The slider allows value selection, tooltips, and error handling.
 *
 * @function
 * @param {Object} options - Configuration options for the slider.
 * @param {number} [options.min=0] - Minimum slider value.
 * @param {number} [options.max=100] - Maximum slider value.
 * @param {number} [options.step=1] - Step size for slider values.
 * @param {boolean} [options.tooltip=true] - Enables or disables tooltip display.
 * @param {boolean} [options.onUpdate] - This is a callback function that gets triggered whenever the slider values change.
 * @param {boolean} [options.dual=false] - Enables dual-handle mode, allowing two handles on the slider.
 * @param {Object} [options.errormsgs] - Error messages displayed for various validation checks.
 * @param {string} [options.errormsgs.outofrange="out of range"] - Message for out-of-range values.
 * @param {string} [options.errormsgs.invalid="Value for Handle 1 is invalid!"] - Message for invalid handle 1 value.
 * @param {string} [options.errormsgs.lessthanHandle1="Value for Handle 2 cannot be less than Handle 1!"] - Message for when handle 2 value is less than handle 1.
 * @param {Object} [options.handle1] - Configuration for the first slider handle.
 * @param {number} [options.handle1.start=0] - Initial position value for handle 1.
 * @param {string|null} [options.handle1.update=null] - Selector for an input field to sync handle 1 value with.
 * @param {Object} [options.handle2] - Configuration for the second slider handle (used if dual mode is enabled).
 * @param {number} [options.handle2.start=100] - Initial position value for handle 2.
 * @param {string|null} [options.handle2.update=null] - Selector for an input field to sync handle 2 value with.
 * @returns {jQuery} The jQuery object for chaining.
 */
(function ($) {
    
    if ($.fn.defSlider) return; // Förhindra omregistrering
    
    $.fn.defSlider = function (options) {
        const settings = $.extend(
            {
                min: 0,
                max: 100,
                step: 1,
                tooltip: true,
                dual: false,
                // Add callback option with a default empty function
                onUpdate: function(values) {},
                errormsgs: {
                    outofrange: "out of range",
                    invalid: "Value for Handle 1 is invalid!",
                    lessthanHandle1:
                        "Value for Handle 2 cannot be less than Handle 1!",
                },
                handle1: { start: 0, update: null },
                handle2: { start: 100, update: null },
            },
            options
        );

        return this.each(function () {
            // Initialize essential elements and slider handles, including optional dual handle
            const $input = $(this);
            const min = settings.min;
            const max = settings.max;
            const baseStep = settings.step;
            const tooltipEnabled = settings.tooltip;
            const isDual = settings.dual;
            const onUpdate = settings.onUpdate;

            const start1 =
                settings.handle1.start !== undefined
                    ? settings.handle1.start
                    : min;
            const updateField1 = settings.handle1.update
                ? $(settings.handle1.update)
                : null;

            const start2 =
                settings.handle2.start !== undefined
                    ? settings.handle2.start
                    : max;
            const updateField2 = settings.handle2.update
                ? $(settings.handle2.update)
                : null;

            const errormsgs = settings.errormsgs;

            // Add this right before creating the $slider element
            const inputId = $input.attr('id');

            // Then when creating the $slider element, add the id if it exists
            const $slider = $("<div>", {
                class: "def-slider",
                "data-min": min,
                "data-max": max,
                "data-tooltip": tooltipEnabled,
              
            });
            
            // Apply the ID only if it exists on the original input
            if (inputId) {
                $slider.attr('id', inputId);
            }
            
            

            const $bar = $("<div>", { class: "bar" }).appendTo($slider);
            const $handle1 = $("<div>", {
                class: "slider-handle",
                "data-value": start1,
            }).appendTo($slider);
            $("<div>", { class: "tooltip" }).appendTo($handle1);

            let $handle2 = null;
            if (isDual) {
                $handle2 = $("<div>", {
                    class: "slider-handle",
                    "data-value": start2,
                }).appendTo($slider);
                $("<div>", { class: "tooltip" }).appendTo($handle2);
            }

            $input.replaceWith($slider);
            

            /**
             * Triggers the onUpdate callback with the current slider values
             */
            function triggerUpdateCallback() {
                const handle1Value = parseInt($handle1.attr("data-value"), 10);
                if (isDual && $handle2) {
                    const handle2Value = parseInt($handle2.attr("data-value"), 10);
                    onUpdate({ handle1: handle1Value, handle2: handle2Value });
                } else {
                    onUpdate({ handle1: handle1Value });
                }
            }

            /**
             * Update the bar's position based on handle positions.
             */
            function updateBarPosition() {
                const handle1Value = parseInt($handle1.attr("data-value"), 10);
                const handle2Value = $handle2
                    ? parseInt($handle2.attr("data-value"), 10)
                    : max;
                const startPercent = ((handle1Value - min) / (max - min)) * 100;

                if (isDual) {
                    const endPercent = ((handle2Value - min) / (max - min)) * 100;
                    $bar.css({
                        left: startPercent + "%",
                        width: endPercent - startPercent + "%",
                    });
                } else {
                    $bar.css({ left: 0, width: startPercent + "%" });
                }
                
                // Trigger callback after updating bar position
                triggerUpdateCallback();
            }

            /**
             * Updates the handle's position and tooltip display.
             * @param {jQuery} $handle - Handle element to update.
             * @param {number} value - New value to set for the handle.
             */
            function updateHandlePosition($handle, value) {
                const percent = ((value - min) / (max - min)) * 100;
                $handle.css("left", percent + "%");
                if (tooltipEnabled) {
                    const $tooltip = $handle.find(".tooltip");
                    $tooltip.text(value).css("display", "block");
                }
            }

            /**
             * Syncs the handle value with an associated input field.
             * @param {jQuery} $field - Input field to sync.
             * @param {jQuery} $handle - Handle element to update.
             * @param {jQuery|null} otherHandle - Opposite handle for dual mode.
             */
            function syncFieldToHandle($field, $handle, otherHandle = null) {

                if ($field) {
                    $field.on("input change", function () {
                        let value = $(this).val();
                        // If the field is empty, set the value to 0
                        // Check if the value is an empty string or not a number

                        if (value === "") {
                        } else if (isNaN(value)) {
                            alert(errormsgs.invalid); // Display an error message if the value is invalid
                            value = 0; // Reset to 0 if the field is empty or invalid
                            $(this).val(value); // Update the field with 0
                        } else {
                            value = parseInt($(this).val(), 10);
                        }

                        value = Math.max(min, Math.min(value, max));

                        // Ensure the value is within the min and max limits
                        if (value < min || value > max) {
                            alert(errormsgs.outofrange); // Display an error message if out of bounds
                            value = Math.max(min, Math.min(value, max)); // Reset to a valid value
                            $(this).val(value); // Update the field with the valid value
                        }

                        // If in dual-mode and other handle exists
                        if (isDual && otherHandle) {
                            const otherValue = parseInt(
                                otherHandle.attr("data-value"),
                                10
                            );

                            // If handle2's value is less than handle1's, reset the value and show an alert
                            if ($handle === $handle2 && value < otherValue) {
                                alert(errormsgs.lessthanHandle1);
                                value = otherValue; // Reset to handle1's value
                                $(this).val(value + 1); // Update the field with the correct value
                            }
                        }

                        // Update the current handle with the new value
                        $handle.attr("data-value", value);
                        updateHandlePosition($handle, value); // Update handle's position
                        updateBarPosition(); // Update the slider bar position
                    });
                }
                // Single handle click interaction to set value
                if (!isDual) {

                    $slider.on("click", function (e) {

                        // Ensure the click was on the slider, not on the handle
                        if (
                            $(e.target).is($slider) ||
                            $(e.target).is($slider.find(".bar"))
                        ) {
                            const rangeWidth = $(this).width();
                            const offsetX = e.offsetX;
                            const newPercentage = offsetX / rangeWidth;
                            const newValue = Math.round(
                                min + (max - min) * newPercentage
                            );

                            $(this).val(newValue); // Update input value
                            $handle1.attr("data-value", newValue); // Update handle's value

                            // Animated transition to the new position
                            updateHandlePosition($handle1, newValue);
                            updateBarPosition();
                        }
                    });
                }

            }

            /**
             * Syncs the value of a handle to the corresponding field.
             *
             * This function takes a handle (usually a slider or draggable element) and a field (input or text area),
             * and updates the field's value based on the handle's data attribute.
             *
             * @param {jQuery} $handle - The jQuery object representing the handle element.
             * @param {jQuery} $field - The jQuery object representing the input or field element to sync the value with.
             *
             * @returns {void} This function does not return any value. It modifies the field's value based on the handle's data attribute.
             */
            function syncHandleToField($handle, $field) {
                if ($field) {
                    const value = parseInt($handle.attr("data-value"), 10);
                    $field.val(value);
                }
            }

            // Update positions and fields from initial values
            updateHandlePosition($handle1, start1);
            syncHandleToField($handle1, updateField1);

            if (isDual && $handle2) {
                updateHandlePosition($handle2, start2);
                syncHandleToField($handle2, updateField2);
            }

            updateBarPosition();

            /**
             * Handles the drag functionality for a handle element in a range slider.
             *
             * This function allows the user to drag the handle, updates the position of the handle,
             * and adjusts the value based on the drag event. It also updates the associated field
             * and the bar position, ensuring that the value remains within the specified range
             * and accounts for the presence of a second handle if `isDual` is true.
             *
             * @param {jQuery} $handle - The jQuery object representing the handle being dragged.
             * @param {jQuery} [otherHandle] - The jQuery object representing the second handle (if dual slider).
             * @param {boolean} isLeftHandle - Boolean indicating if the handle being dragged is the left handle in a dual slider.
             *
             * @returns {void} This function does not return any value. It modifies the handle's position, the bar, and the field.
             */
            function handleDrag($handle, otherHandle, isLeftHandle) {
                $handle.on("mousedown touchstart", function (e) {
                    e.preventDefault();
                    $(document).on("mousemove touchmove", function (e) {
                        const sliderWidth = $slider.width();
                        const offsetX = e.pageX - $slider.offset().left;
                        let percent = Math.max(
                            0,
                            Math.min(100, (offsetX / sliderWidth) * 100)
                        );
                        let newValue = Math.round(
                            min + (percent / 100) * (max - min)
                        );

                        newValue = Math.round(newValue / baseStep) * baseStep;

                        if (isDual && otherHandle) {
                            const otherValue = parseInt(
                                otherHandle.attr("data-value"),
                                10
                            );

                            if (isLeftHandle && newValue >= otherValue) {
                                newValue = otherValue - baseStep;
                            } else if (!isLeftHandle && newValue <= otherValue) {
                                newValue = otherValue + baseStep;
                            }
                        }

                        $handle.attr("data-value", newValue);
                        updateHandlePosition($handle, newValue);
                        updateBarPosition();
                        syncHandleToField(
                            $handle,
                            isLeftHandle ? updateField1 : updateField2
                        );
                    });

                    $(document).on("mouseup touchend", function () {
                        $(document).off("mousemove touchmove mouseup touchend");
                    });
                });
            }

            /**
             * Adds the wheel event listener to the slider for adjusting the handle position using the mouse wheel.
             *
             * The scroll function allows the user to adjust the slider handle's value dynamically based on
             * the mouse wheel movement. The step size increases or decreases based on the wheel scroll amount.
             * If the slider is dual, the correct handle is selected based on the mouse's X position relative to the slider.
             *
             * @param {Event} e - The wheel event triggered when the user scrolls.
             *
             * @returns {void} This function does not return any value. It updates the handle's value, position, and field.
             */
            if (!isDual) {
                $slider.on("wheel", function (e) {
                    e.preventDefault();

                    // Calculate dynamic step based on the scroll amount
                    const dynamicStep = Math.min(
                        baseStep *
                        Math.pow(4, Math.abs(e.originalEvent.deltaY / 100)),
                        max - min
                    );
                    let delta =
                        e.originalEvent.deltaY > 0 ? dynamicStep : -dynamicStep;

                    // Determine the handle to update (default to the first handle)
                    let handle = $handle1;
                    let currentValue = parseInt(handle.attr("data-value"), 10);

                    // Handle dual slider logic
                    if (isDual) {
                        handle =
                            e.originalEvent.offsetX < $slider.width() / 2
                                ? $handle1
                                : $handle2;
                    }

                    // Calculate the new value and clamp it within the min and max bounds
                    let newValue = currentValue + delta;
                    newValue = Math.max(min, Math.min(newValue, max));

                    // Adjust the value to the nearest step
                    newValue = Math.round(newValue / baseStep) * baseStep;

                    // Update the handle data, position, and synchronize with the field
                    handle.attr("data-value", newValue);
                    updateHandlePosition(handle, newValue);
                    updateBarPosition();
                    syncHandleToField(
                        handle,
                        handle === $handle1 ? updateField1 : updateField2
                    );
                });
            }

            /**
             * Handles the drag functionality for the slider handles.
             *
             * This function allows the user to drag a handle to adjust the slider's value. The value is
             * dynamically updated based on the drag position, ensuring the value is constrained within
             * the specified range. In a dual slider setup, it checks if the dragged handle is the left or
             * right one and adjusts accordingly to avoid overlap with the other handle.
             *
             * @param {jQuery} $handle - The jQuery object representing the handle being dragged.
             * @param {jQuery} [otherHandle] - The jQuery object representing the second handle (if dual slider).
             * @param {boolean} isLeftHandle - Boolean indicating if the handle being dragged is the left handle.
             *
             * @returns {void} This function does not return any value. It updates the handle's value, position, and field.
             */
            handleDrag($handle1, isDual ? $handle2 : null, true);
            if (isDual && $handle2) {
                handleDrag($handle2, $handle1, false);
            }

            /**
             * Synchronizes the input fields with the corresponding slider handles during initialization.
             *
             * This function updates the input fields to match the current values of the slider handles
             * during the initialization phase. If the slider is dual, it ensures that both input fields
             * are synchronized with their respective handles.
             *
             * @param {jQuery} field1 - The first input field to synchronize with the first slider handle.
             * @param {jQuery} $handle1 - The first slider handle.
             * @param {jQuery} $handle2 - The second slider handle (if dual slider).
             *
             * @returns {void} This function does not return any value. It updates the input fields to match the slider values.
             */
            syncFieldToHandle(updateField1, $handle1, $handle2); // Synchronize field for Handle 1 with Handle 2
            if (isDual) {
                syncFieldToHandle(updateField2, $handle2, $handle1); // Synchronize field for Handle 2 with Handle 1
            }
            
            // Trigger initial callback with starting values
            triggerUpdateCallback();
        });
    };
})(jQuery);