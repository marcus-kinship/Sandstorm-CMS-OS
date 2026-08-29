/**
 * @file calc/calc.js
 * @description Calculator program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * Calculator program — registration (icon + metadata) lives in `setup.js`.
 * Exports `start(os, win)` (window creation; logic delegated to `calc_data.js`).
 *
 * @module program/calc/calc
 */
export function start(os) {

    // Initialize and display the calculator window
    os.ui.windowStart("calculator", {
        id: "calculator",
        title: _("Calculator"),
        windowIcon: false,
        resizable: false,
        width: "270px",
        height: "380px",
        body: function(windowobj) {
            const langToken = "calc-" + windowobj?.windowId;
            if (os.exists("app.language.registerRefresh")) {
                os.language.registerRefresh(langToken, () => windowobj.title(_("Calculator")));
            }
            windowobj?.on?.("close", () => {
                if (os.exists("app.language.unregisterRefresh")) os.language.unregisterRefresh(langToken);
            });

            // Calculator UI definition
            const calculatorUI = {
                container: {
                    className: "calculator",
                    style: {
                        padding: "21px 28px 38px 28px",
                    },
                    subs: [
                        {
                            block: {
                                className: "display",
                                subs: [
                                    {
                                        "aero-text": {
                                            className: "calc-display",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            block: {
                                className: "buttons",
                                style: {
                                    display: "flex",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    flexDirection: "row",
                                    paddingTop: "27px",
                                    rowGap: "18px",
                                    columnGap: "6px"
                                },
                                subs: [
                                    { "aero-button-m": { value: "7" } },
                                    { "aero-button-m": { value: "8" } },
                                    { "aero-button-m": { value: "9" } },
                                    { "aero-button-m": { value: "/" } },
                                    { "aero-button-m": { value: "4" } },
                                    { "aero-button-m": { value: "5" } },
                                    { "aero-button-m": { value: "6" } },
                                    { "aero-button-m": { value: "*" } },
                                    { "aero-button-m": { value: "1" } },
                                    { "aero-button-m": { value: "2" } },
                                    { "aero-button-m": { value: "3" } },
                                    { "aero-button-m": { value: "-" } },
                                    { "aero-button-m": { value: "0" } },
                                    { "aero-button-m": { value: "." } },
                                    {
                                        "aero-button-m": {
                                            value: "=",
                                            pulse: {
                                                top: "39px",
                                                left: "24px",
                                            },

                                        }
                                    },
                                    { "aero-button-m": { value: "+" } },
                                    { "aero-button-m": { value: "C" } }
                                ]
                            }
                        },
                        {
                            script: {
                                path: "calc/calc_data.js",
                                call: "data"
                            }
                        }
                    ]
                }
            };

            // Render the UI
            const builder = os.ui.body(calculatorUI);
            return builder.render();
        }
    });
}