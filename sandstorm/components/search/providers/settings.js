/**
 * @file search/providers/settings.js
 * @description UIProvider — wraps `app.searchengine.search({word})`, the
 * existing opt-in registry of Control Panel settings/controls (`search:`
 * props on `app.ui.body()` nodes, plus Control Panel panels' own
 * `searchItems[]`). Re-scored here through `matcher.js`'s tier ladder rather
 * than trusting `app.searchengine`'s own substring-only match order.
 *
 * Entries registered by `os.controlpanel.add()` carry `_panelId` — those
 * become `open-setting` actions (jump straight to that Control Panel
 * panel). Entries from the generic `app.ui.body()` `search:` mechanism
 * elsewhere in the OS have no panel to jump to, only the owning program —
 * those fall back to `open-app` on `_programid`.
 *
 * Also separately searches each Control Panel panel's own front-level
 * metadata (`front.label`/`keywords`) via `app.program.controlpanel.getAll()`
 * — `app.searchengine` only ever indexes a panel's individual
 * `searchItems[]` sub-controls, never the panel itself, so without this a
 * search for "Cursor" would return nine scattered sub-settings and no clean
 * top-level "Cursor" hit.
 *
 * @module components/search/providers/settings
 */
import { bestScoreAcrossTerms } from '../matcher.js';

const FALLBACK_ICON = '#ic-search';

/**
 * @param {string[]} terms - `matcher.expandQuery()`'s output.
 * @returns {Promise<Array>}
 */
export async function search(terms) {
    const seen = new Map();

    // Panel-level hits — one clean result per Control Panel panel, matched
    // against its launcher-tile metadata.
    const panels = app.program?.controlpanel?.getAll?.() || [];
    for (const { front, panel } of panels) {
        const label = typeof front.label === 'function' ? front.label() : front.label;
        const s = bestScoreAcrossTerms(terms, [label, ...(front.keywords || [])]);
        if (s <= 0) continue;

        seen.set(`setting:panel:${panel.id}`, {
            id: `setting:panel:${panel.id}`,
            title: label || panel.id,
            subtitle: _('Setting'),
            icon: { type: 'svg', value: front.icon || FALLBACK_ICON },
            type: 'setting',
            score: s,
            source: 'settings',
            action: { type: 'open-setting', target: panel.id },
        });
    }

    if (typeof app.searchengine?.search === 'function') {
        for (const term of terms) {
            const hits = app.searchengine.search({ word: term }) || [];
            for (const entry of hits) {
                const label = typeof entry.label === 'function' ? entry.label() : entry.label;
                const description = typeof entry.description === 'function' ? entry.description() : entry.description;
                const fields = [label, description, ...(entry.keywords || [])];
                const s = bestScoreAcrossTerms(terms, fields);
                if (s <= 0) continue;

                const id = `setting:item:${entry._programid || ''}:${entry.id}`;
                if (seen.has(id) && seen.get(id).score >= s) continue;

                const action = entry._panelId
                    ? { type: 'open-setting', target: entry._panelId }
                    : { type: 'open-app', target: entry._programid };
                const panelIcon = entry._panelId
                    ? panels.find(r => r.panel.id === entry._panelId)?.front?.icon
                    : null;

                seen.set(id, {
                    id,
                    title: label || entry.id,
                    subtitle: _('Setting'),
                    icon: { type: 'svg', value: panelIcon || FALLBACK_ICON },
                    type: 'setting',
                    score: s,
                    source: 'settings',
                    action,
                });
            }
        }
    }

    return [...seen.values()];
}
