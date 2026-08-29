/**
 * @file search/actions.js
 * @description Dispatches a SearchResult's serializable `action` descriptor
 * ({type, target}) to the real `app.*` call. Kept separate from providers so
 * results stay pure data (testable/loggable/persistable) instead of
 * carrying closures.
 *
 * @module components/search/actions
 */
import { COMMANDS } from './providers/commands.js';

/**
 * @param {{type: string, target: string}} action
 * @returns {void}
 */
export function runAction(action) {
    if (!action?.type) return;

    switch (action.type) {
        case 'open-app':
            app.program.open(action.target);
            break;
        case 'open-setting':
            app.program.controlpanel.open(action.target);
            app.program.open('controlpanel');
            break;
        case 'open-path':
            app.explorer.open(action.target);
            break;
        case 'run-command':
            COMMANDS[action.target]?.run?.();
            break;
        default:
            app.dev?.warn?.(`[search/actions] unknown action type "${action.type}"`, 'Search');
    }
}
