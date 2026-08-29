/**
 * @file search/matcher.js
 * @description Shared fuzzy-matching tiers + a small alias table for the
 * global search system. Case-insensitive throughout, matching the
 * `.toLowerCase()` convention already used by `app.searchengine` and
 * Explorer's own search.
 *
 * Tier scores: exact 100, prefix 80, substring 50, alias 30, fuzzy 20, else 0.
 * Providers call `bestScoreAcrossTerms()` per candidate and keep the best;
 * `search/manager.js` adds the provider's own weight + a recency bonus on
 * top afterward, so providers never need to know about each other.
 *
 * @module components/search/matcher
 */

export const TIER = {
    EXACT: 100,
    PREFIX: 80,
    SUBSTRING: 50,
    ALIAS: 30,
    FUZZY: 20,
};

const ALIASES = {
    'anteckningar':     ['notepad', 'notes'],
    'inställningar':    ['settings', 'config'],
    'installningar':    ['settings', 'config'],
    'kontrollpanelen':  ['control panel', 'control'],
    'kontrollpanel':    ['control panel', 'control'],
    'skrivbord':        ['desktop'],
    'papperskorg':      ['recycle bin', 'trash'],
    'utforskaren':      ['explorer', 'files'],
    'miniräknare':      ['calculator', 'calc'],
    'musen':            ['cursor', 'mouse'],
    'pekare':           ['cursor', 'pointer'],
};

const MAX_EXPANSIONS = 5;

/**
 * Expands a raw typed word into itself plus any matched aliases (capped at
 * `MAX_EXPANSIONS` total terms).
 * @param {string} word
 * @returns {string[]} Lowercased terms; index 0 is always the raw word.
 */
export function expandQuery(word) {
    const w = (word || '').trim().toLowerCase();
    if (!w) return [];
    const out = [w];
    for (const term of ALIASES[w] || []) {
        if (out.length >= MAX_EXPANSIONS) break;
        if (!out.includes(term)) out.push(term);
    }
    return out;
}

/**
 * Levenshtein edit distance — small strings only, no need for anything
 * fancier at this corpus size.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

/**
 * Scores one (term, target) pair against the tier ladder.
 * @param {string} term - One of `expandQuery()`'s results (already lowercased).
 * @param {string} target - Candidate text (title, keyword, ...); lowercased internally.
 * @param {boolean} [isAliasTerm=false] - True when `term` came from alias
 *   expansion rather than the raw query — caps the tier at ALIAS even on an
 *   exact/prefix hit, so an alias match can never outrank a genuine exact
 *   match on what the user actually typed.
 * @returns {number}
 */
export function score(term, target, isAliasTerm = false) {
    if (!term || !target) return 0;
    const t = String(target).toLowerCase();
    const q = term;

    if (isAliasTerm) {
        return (t === q || t.includes(q)) ? TIER.ALIAS : 0;
    }

    if (t === q) return TIER.EXACT;
    if (t.startsWith(q)) return TIER.PREFIX;
    if (t.includes(q)) return TIER.SUBSTRING;

    if (q.length >= 3 && t.length <= 40) {
        const tolerance = q.length <= 5 ? 1 : 2;
        const candidates = t.split(/\s+/);
        if (t.length > q.length) candidates.push(t.slice(0, q.length));
        for (const w of candidates) {
            if (Math.abs(w.length - q.length) > tolerance) continue;
            if (editDistance(q, w) <= tolerance) return TIER.FUZZY;
        }
    }

    return 0;
}

/**
 * Scores a single expanded term against multiple candidate fields (title,
 * keywords, ...) and returns the best tier found.
 * @param {string} term
 * @param {string[]} fields
 * @param {boolean} [isAliasTerm=false]
 * @returns {number}
 */
function scoreFields(term, fields, isAliasTerm = false) {
    let best = 0;
    for (const f of fields) {
        if (!f) continue;
        const s = score(term, f, isAliasTerm);
        if (s > best) best = s;
    }
    return best;
}

/**
 * Scores every expanded query term (raw word + aliases) against a
 * candidate's fields and returns the single best score across all of them —
 * the one number a provider needs per result.
 * @param {string[]} terms - `expandQuery()`'s output.
 * @param {string[]} fields - Candidate text fields (title, keywords, ...).
 * @returns {number}
 */
export function bestScoreAcrossTerms(terms, fields) {
    let best = 0;
    terms.forEach((term, i) => {
        const s = scoreFields(term, fields, i > 0);
        if (s > best) best = s;
    });
    return best;
}
