/**
 * @file search/providers/apps.js
 * @description AppProvider — searches installed/pinned programs
 * (`app.program.getAll()`) by name. Distinct from `settings.js`'s
 * UIProvider: `app.searchengine` never indexes programs at all (it's an
 * opt-in registry of `search:`/`searchItems` entries), so a Start Menu
 * search that only queried it could never find "Notepad".
 *
 * @module components/search/providers/apps
 */
import { bestScoreAcrossTerms } from '../matcher.js';

/**
 * @param {string[]} terms - `matcher.expandQuery()`'s output.
 * @returns {Promise<Array>}
 */
export async function search(terms) {
    if (typeof app.program?.getAll !== 'function') return [];
    const all = app.program.getAll() || {};
    const results = [];

    for (const [id, program] of Object.entries(all)) {
        if (program.startmenu !== true) continue;

        const name = typeof program.name === 'function' ? program.name() : program.name;
        if (!name) continue;

        const s = bestScoreAcrossTerms(terms, [name]);
        if (s <= 0) continue;

        results.push({
            id: `app:${id}`,
            title: name,
            subtitle: _('App'),
            icon: { type: program.icontype === 'svg' ? 'svg' : 'img', value: program.icon },
            type: 'app',
            score: s,
            source: 'apps',
            action: { type: 'open-app', target: id },
        });
    }

    return results;
}
