/**
 * @file solitaire/solitaire_deckchooser.js
 * @description "Choose Deck" modal dialog — lets the player pick one of 8
 * card-back designs. There are no image assets anywhere in this program
 * (card faces/backs are pure HTML+CSS — see solitaire_cards.js's
 * `createCardElement`), so each deck is a pure-CSS pattern too, matching
 * the existing single `.card-back` repeating-linear-gradient approach the
 * game already used before this dialog existed (see solitaire.css's
 * `.deck-1` rule, unchanged from the old unconditional `.card-back` rule).
 *
 * Deck choice lives on the WRAPPING `.solitaire-game` element as a
 * `deck-<id>` class (`solitaire.js` applies it), not on individual cards —
 * every `.card-back` is DOM-identical (just an empty div), so a single
 * class swap on the ancestor restyles every card at once, including ones
 * dealt by a later "New Game" without any extra per-card bookkeeping.
 *
 * Follows the same windowStart+openDialog "modal resolves a Promise" idiom
 * as designer_color_picker_window.js: `open()` returns
 * Promise<deckId|undefined> (undefined = cancelled), a pending descriptor
 * stashed right before windowStart and consumed synchronously inside
 * body(), `state.close` as the sole resolution point.
 *
 * @module program/solitaire/solitaire_deckchooser
 */

/** The 8 selectable decks — `id` matches the `.deck-<id>` CSS class in solitaire.css. */
export const DECKS = [
    { id: 1, name: () => _('Green') },
    { id: 2, name: () => _('Blue Argyle') },
    { id: 3, name: () => _('Red Trellis') },
    { id: 4, name: () => _('Purple Dots') },
    { id: 5, name: () => _('Navy & Gold') },
    { id: 6, name: () => _('Maroon Damask') },
    { id: 7, name: () => _('Teal Crosshatch') },
    { id: 8, name: () => _('Black & Gold') },
];

let _pending = null;

function renderHTML(currentId) {
    const swatches = DECKS.map(d => `
        <button type="button" class="deck-swatch${d.id === currentId ? ' selected' : ''}" data-deck-id="${d.id}">
            <span class="deck-swatch-back deck-${d.id}"></span>
            <span class="deck-swatch-label">${d.name()}</span>
        </button>
    `).join('');

    return `
        <div class="deck-chooser-root">
            <div class="deck-chooser-grid">${swatches}</div>
            <div class="deck-chooser-footer">
                <button type="button" class="aero-button dc-cancel">${_('Cancel')}</button>
                <button type="button" class="aero-button confirm dc-ok">${_('OK')}<div class="after pulse"></div></button>
            </div>
        </div>
    `;
}

function wireDialog(root, currentId, { setResult, close }) {
    let selectedId = currentId;

    root.querySelectorAll('.deck-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedId = parseInt(btn.dataset.deckId, 10);
            root.querySelectorAll('.deck-swatch').forEach(b => b.classList.toggle('selected', b === btn));
        });
    });

    root.querySelector('.dc-ok').addEventListener('click', () => setResult(selectedId));
    root.querySelector('.dc-cancel').addEventListener('click', () => close());
}

function injectCSS() {
    if (document.getElementById('solitaire-deckchooser-style')) return;
    const style = document.createElement('style');
    style.id = 'solitaire-deckchooser-style';
    style.textContent = `
        .deck-chooser-root { display: flex; flex-direction: column; gap: 6px; padding: 16px;height: 100%; box-sizing: border-box; color: #fff; }
        .deck-chooser-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding-top: 10px; margin-bottom: 20px; height: 370px; align-content: start; overflow-y: auto; }
        .deck-swatch { display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; cursor: pointer; padding: 6px; border-radius: 6px; color: #fff; }
        .deck-swatch:hover { background:#00000040;box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29; }
        .deck-swatch.selected {background:#00000040;box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29; }
        .deck-swatch-back { display: block; ; width: 60px; height: 88px; border-radius: 3px; box-sizing: border-box; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .deck-swatch-label { font-size: 11px; text-align: center; color: #fff; opacity: 0.9; }
        .deck-chooser-footer { display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
}

/**
 * Opens the "Choose Deck" dialog, modal to `parentId`.
 *
 * @param {Object} os - The OS/program API.
 * @param {{currentId: number, parentId: string}} options
 * @returns {Promise<number|undefined>} The chosen deck id, or undefined if cancelled.
 */
export function open(os, { currentId, parentId }) {
    injectCSS();

    return new Promise(resolve => {
        _pending = { resolve, currentId, parentId };

        os.ui.windowStart('solitaire', {
            id: 'solitaire',
            title: _('Choose Deck'),
            windowIcon: true,
            resizable: false,
            width: '420px',
            height: '440px',
            body(windowobj) {
                const captured = _pending;
                _pending = null;
                if (!captured) return '';

                let pendingResult;
                const dialogId = windowobj.windowId;

                windowobj.state.close(() => {
                    captured.resolve(pendingResult);
                    if (captured.parentId) app.windows.closeDialog(dialogId);
                });

                setTimeout(() => {
                    app.windows.openDialog({
                        parentId: captured.parentId,
                        dialogId,
                        modal: true,
                        dialogTitle: _('Choose Deck')
                    });
                }, 0);

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.deck-chooser-root');
                    if (!root) return;
                    wireDialog(root, captured.currentId, {
                        setResult: v => { pendingResult = v; windowobj.close(); },
                        close: () => windowobj.close()
                    });
                }, 0);

                return renderHTML(captured.currentId);
            }
        });
    });
}
