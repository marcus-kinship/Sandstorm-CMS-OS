/**
 * @file win.js
 * @description "About Sandstorm" control-panel panel module.
 *
 * Registers a control-panel tile that opens a modal window displaying
 * version, licensing, and device information for Sandstorm CMS OS.
 *
 * Exported as an ES module with `setup` (no-op — registration is handled
 * by the controlpanel system) and `start` (opens the about window).
 *
 * @module components/ui/win
 *
 * @example
 * // Opened via the controlpanel "About" tile:
 * const mod = await app.includeModule(".../win.js");
 * mod.start(app);
 */

/**
 * Module setup hook — intentionally empty; the control-panel tile is
 * registered elsewhere.
 *
 * @param {Object} os - The global Sandstorm application object.
 * @returns {void}
 */
export function setup(os) {}

/**
 * Opens the "About Sandstorm" information window.
 *
 * Creates a non-resizable 516 × 404 px window inside the Control Panel
 * container and injects the about page markup along with its CSS animation
 * styles via `win.addCSS()`.
 *
 * @param {Object} os - The global Sandstorm application object.
 * @returns {void}
 */
export function start(os) {
    os.ui.windowStart("controlpanel", {
        id:         "about-sandstorm",
        title:      _("About Sandstorm"),
        windowIcon: false,
        resizable:  false,
        width:      "516px",
        height:     "404px",
        body: function (os) {
            os.state.before(function (win) {
                win.addCSS("about sandstorm", `
.about-main {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
    font-size: 12px;
    color: #fff;
    padding: 20px 30px;
}

.about-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    justify-content: center;
    border-bottom: 1px solid #ffffff80;
    padding-bottom: 10px;
}

.about-header h1 {
    font-size: 32px;
    font-weight: 300;
    margin: 0;
    color: #ffffff;
    opacity: 0;
    animation: fadeIn 0.2s ease forwards;
    animation-delay: 0.2s;
}

.about-section {
    opacity: 0;
    animation: fadeIn 0.2s ease forwards;
    animation-delay: 0.2s;
}

.about-section p {
    margin: 4px 0;
    line-height: 1.4;
}

.about-title {
    font-weight: 600;
    margin-top: 10px;
}

.about-device {
    margin-top: 10px;
    font-weight: 500;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
}

@keyframes slideFade {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0px); }
}
                `);
            });

            return `
<div class="about-main">
    <div class="about-header">
        <h1>Sandstorm CMS OS</h1>
    </div>

    <div class="about-section">
        <p class="about-title">Sandstorm CMS OS</p>
        <p>Version Dev (Build 1.0.0)</p>
        <p>© Sandstorm Corporation. All rights reserved.</p>

        <br>

        <p>
            The Sandstorm CMS OS (Content Management System Operating System) and its user interface are protected by
            trademark and other pending or existing intellectual property rights in
            the United States and other countries/regions.
        </p>

        <br>

        <p>This product is licensed under the Sandstorm Software License</p>

        <p class="about-device">
            Device name: <br>
            Sandstorm Virtual Machine <br>
            Organization: Sandstorm Labs
        </p>
    </div>
</div>`;
        }
    });
}
