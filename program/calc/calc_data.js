/**
 * @file calc/calc_data.js
 * @description Calculator logic for Sandstorm OS.
 *
 * Exports `data(os)` — called by `calc.js` `start()` after the window HTML
 * is in the DOM. Handles expression evaluation, button bindings, and
 * display updates. Only permits safe characters (`0-9 + - * / ( ) .`)
 * before calling `eval` via a sanitised expression.
 *
 * @module program/calc/calc_data
 */
export function data(os) {

    // Function to evaluate the mathematical expression
    function evaluateExpression(expression) {
        try {
            // Endast tillåtna tecken: siffror, operatorer och parenteser
            const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');

            // Kontrollera att uttrycket inte är tomt eller ogiltigt
            if (!sanitized || /[^0-9)]$/.test(sanitized)) {
                return "???";
            }

            // Undvik uttryck som börjar med ogiltiga operatorer
            if (/^[*/.]/.test(sanitized)) {
                return "???";
            }

            // Beräkna
            const result = Function(`"use strict"; return (${sanitized})`)();

            // Returnera avrundat resultat (valfritt)
            return Number.isFinite(result) ? result : "???";
        } catch (err) {
            return "???";
        }
    }


    // Tangentbordsstöd för att skriva in uttryck
    $(document).off('keydown.calc').on('keydown.calc', function (e) {
        const display = $('.active .calc-display');

        if (!display.length) return;

        const allowedKeys = '0123456789/*-+().=';

        if (allowedKeys.includes(e.key)) {
            display.val(display.val() + e.key);
            e.preventDefault();
        } else if (e.key === 'Enter') {
            const result = evaluateExpression(display.val());
            display.val(result);
            e.preventDefault();
        } else if (e.key === 'Backspace') {
            display.val(display.val().slice(0, -1));
            e.preventDefault();
        } else if (e.key === 'Escape') {
            display.val('');
            e.preventDefault();
        }
    });


    // Event listener for calculator buttons
    const buttons = $('.active .calculator .buttons div');
    buttons.click(function () {
        const display = $(this).parent().parent().find('.calc-display'); // Use the helper function to get the display element

        const value = $(this).text().trim(); // Get the button text and remove any extra spaces

        if (value === '=') {
            // When "=" is clicked, evaluate the current expression in the display
            const result = evaluateExpression(display.val());
            display.val(result);
        } else if (value === 'C') {
            // Clear the display when "C" is clicked
            display.val("");
        } else {
            // Append the clicked button's value to the display
            display.val(display.val() + value);
        }
    });
}