/**
 * @file search/manager.js
 * @description SearchManager — orchestrates providers, merges/ranks
 * results. `finalScore = provider's own matcher-tier score + that
 * provider's weight + a recent-use bonus`, applied here so individual
 * providers stay simple and don't need to know about each other or about
 * recency.
 *
 * No cache / background-indexing layer — every data source a provider reads
 * (`app.program`'s registry, `app.explorer._fs`, `app.searchengine`'s
 * store) is already a small in-memory object, so a synchronous per-query
 * walk is already well within any reasonable latency budget. Building real
 * indexing infrastructure for a few dozen entries would be pure overhead.
 *
 * @module components/search/manager
 */
import { expandQuery } from './matcher.js';
import * as recent from './recent.js';

/** @type {Map<string, {weight: number, search: (terms: string[]) => Promise<Array>}>} */
const _providers = new Map();

const MAX_RESULTS = 20;

/**
 * Registers a search provider. Public — `app.search.registerProvider(...)`
 * is the extension point future data sources (e.g. a real online provider,
 * once a backend exists to back it) plug into, without this file or the
 * Start Menu needing to know about them ahead of time.
 * @param {string} name
 * @param {{weight?: number, search: (terms: string[]) => Promise<Array>}} def
 */
export function registerProvider(name, def) {
    if (!def || typeof def.search !== 'function') {
        app.dev?.error?.(`[search] registerProvider("${name}") requires a search(terms) function`, 'Search');
        return;
    }
    _providers.set(name, { weight: def.weight || 0, search: def.search });
}

/**
 * @param {string} word - Raw text from the search box.
 * @returns {Promise<Array>} Ranked, capped `SearchResult[]`.
 */
export async function query(word) {
    const terms = expandQuery(word);
    if (!terms.length) return [];

    const perProvider = await Promise.all(
        [..._providers.entries()].map(async ([name, provider]) => {
            try {
                const hits = await provider.search(terms);
                return (hits || []).map(hit => ({
                    ...hit,
                    score: hit.score + provider.weight + recent.bonus(hit.id),
                }));
            } catch (error) {
                app.dev?.error?.(`[search] provider "${name}" failed: ${error?.message}`, 'Search');
                return [];
            }
        })
    );

    return perProvider
        .flat()
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS);
}
