/*
 * SVG Resource Manager
 *
 * app.svg is a lifecycle layer above app.load.addSVG().
 *
 * Resource types:
 *   global  — OS icons, launcher icons, program icons. Lifetime: OS session.
 *   private — runtime-only program resources, window-scoped icons.
 *             Lifetime: program execution (auto-unloaded on app.program.exit).
 *
 * All symbols share one SVG sprite namespace — symbol IDs must be unique
 * regardless of ownership type.
 */
(function (app) {
    const symbols = new Map();          // id -> { owner, type }
    const programSymbols = new Map();   // programId -> Set<id>
    const exitRegistered = new Set();   // programIds that already have an onExit hook

    function register(svg, owner, type) {
        if (!svg || !svg.id || svg.content === undefined) {
            app.dev.warn('SVG resource missing id/content', svg, 'SVG');
            return;
        }
        if (symbols.has(svg.id)) {
            app.dev.log(`SVG '${svg.id}' already registered (owner: ${symbols.get(svg.id).owner})`, "SVG");
            return;
        }
        app.load.addSVG(svg);
        symbols.set(svg.id, { owner, type });
        if (type === "private") {
            if (!programSymbols.has(owner)) programSymbols.set(owner, new Set());
            programSymbols.get(owner).add(svg.id);
        }
    }

    app.svg = {
        global: {
            /**
             * Registers a system-wide SVG symbol that lives for the whole OS session.
             * @param {Object} svg - {id, viewBox, content}
             */
            load(svg) {
                register(svg, "system", "global");
            },

            /**
             * Removes a global SVG symbol. Normally only used at system shutdown.
             * @param {string} id
             */
            unload(id) {
                const entry = symbols.get(id);
                if (!entry || entry.type !== "global") return;
                if (app.load.removeSVG(id)) symbols.delete(id);
            }
        },

        private: {
            /**
             * Registers one or more SVG symbols owned by a running program.
             * Automatically unloaded when the program exits.
             * @param {string} programId
             * @param {Object|Object[]} svgOrList - {id, viewBox, content} or an array of those
             */
            load(programId, svgOrList) {
                if (!programId) {
                    app.dev.warn('SVG private resource requires a programId', svgOrList, 'SVG');
                    return;
                }
                const list = Array.isArray(svgOrList) ? svgOrList : [svgOrList];
                let registered = false;
                list.forEach(svg => {
                    const before = symbols.size;
                    register(svg, programId, "private");
                    if (symbols.size > before) registered = true;
                });
                // Only take the exit hook if at least one symbol actually
                // registered — a call with all-invalid descriptors shouldn't
                // leave a dangling onExit with nothing to unload.
                if (registered && !exitRegistered.has(programId) && app.exists("app.program.onExit")) {
                    app.program.onExit(programId, () => app.svg.private.unload(programId));
                    exitRegistered.add(programId);
                }
            },

            /**
             * Removes every SVG symbol owned by the given program.
             * @param {string} programId
             */
            unload(programId) {
                const ids = programSymbols.get(programId);
                if (!ids) return;
                ids.forEach(id => {
                    // Defense in depth: only remove symbols this program actually
                    // still owns, in case of a future bug/id reuse that leaves
                    // programSymbols out of sync with symbols.
                    const entry = symbols.get(id);
                    if (!entry || entry.owner !== programId) return;
                    if (app.load.removeSVG(id)) symbols.delete(id);
                });
                programSymbols.delete(programId);
                exitRegistered.delete(programId);
                // Note: if a program's lifecycle allows new windows to open
                // after exit() without re-running setup(), it must call
                // private.load() again to re-register its resources and the
                // onExit hook — unload() intentionally clears both.
            }
        }
    };

    app.lock('svg.*', { writable: false, configurable: false });
})(window.app = window.app || {});
