/**
 * @file search/providers/commands.js
 * @description CommandProvider — a small, static list of OS-level actions
 * search can run directly, distinct from apps/settings/files. Exports
 * `COMMANDS` so `search/actions.js`'s `'run-command'` dispatch can look a
 * command up by id without a circular import back into the manager.
 *
 * @module components/search/providers/commands
 */
import { bestScoreAcrossTerms } from '../matcher.js';

/** @type {Object<string, {title: () => string, keywords: string[], run: () => void}>} */
export const COMMANDS = {
    'show-desktop': {
        title: () => _('Show desktop'),
        keywords: ['show desktop', 'minimize all', 'hide windows', 'visa skrivbordet'],
        run: () => app.desktop.taskbar.toggleShowDesktop(),
    },
    'open-control-panel': {
        title: () => _('Open Control Panel'),
        keywords: ['control panel', 'settings', 'inställningar'],
        run: () => app.program.open('controlpanel'),
    },
    'open-explorer': {
        title: () => _('Open Explorer'),
        keywords: ['explorer', 'files', 'filer'],
        run: () => app.program.open('explorer'),
    },
};

/**
 * @param {string[]} terms - `matcher.expandQuery()`'s output.
 * @returns {Promise<Array>}
 */
export async function search(terms) {
    const results = [];
    for (const [id, cmd] of Object.entries(COMMANDS)) {
        const title = cmd.title();
        const s = bestScoreAcrossTerms(terms, [title, ...cmd.keywords]);
        if (s <= 0) continue;

        results.push({
            id: `command:${id}`,
            title,
            subtitle: _('Command'),
            icon: { type: 'svg', value: '#ic-search' },
            type: 'command',
            score: s,
            source: 'commands',
            action: { type: 'run-command', target: id },
        });
    }
    return results;
}
