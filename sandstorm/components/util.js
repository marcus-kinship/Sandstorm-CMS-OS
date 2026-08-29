/**
 * @file util.js
 * @description Small shared utilities for the Sandstorm OS environment.
 *
 * Exposes `app.util.escapeHtml()` — the single HTML-escaping helper other
 * components should use before interpolating user-controlled strings (file
 * names, user names, etc.) into template-literal HTML.
 *
 * @module components/util
 */
(function (app) {
    app.util = app.util || {};

    /**
     * Escapes `&`, `<`, `>`, `"` and `'` so a string is safe to interpolate
     * into HTML markup (element text or a quoted attribute value).
     * @param {*} value - Value to escape; non-strings are coerced first.
     * @returns {string} The escaped string, or '' for null/undefined.
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Fits a string into at most `maxLen` characters per line, for
     * fixed-width UI (Start Menu app grid, desktop icon labels) where a long
     * translated name would otherwise overflow or overlap its container —
     * English names were short enough to rarely need this, but several
     * Swedish translations run noticeably longer.
     *
     * A single word (no space) has no natural break point, so it's hard-cut
     * at `maxLen` with an ellipsis. A multi-word string instead wraps at
     * word boundaries across up to two lines of `maxLen` chars each (never
     * cutting mid-word) — the returned string contains a literal `\n`
     * between the two lines, so callers must render it somewhere with
     * `white-space: pre-line` (or split on `\n` themselves) for the break to
     * actually show. Any words left over after two lines are dropped, with
     * an ellipsis appended to the second line.
     * @param {*} value - Value to fit; non-strings are coerced first.
     * @param {number} [maxLen=15]
     * @returns {string} The fitted string (possibly containing one `\n`), or '' for null/undefined.
     */
    function truncate(value, maxLen = 15) {
        if (value === null || value === undefined) return '';
        const s = String(value);
        if (s.length <= maxLen) return s;

        if (!s.includes(' ')) {
            return s.slice(0, maxLen).trimEnd() + '…';
        }

        const words = s.split(' ');
        let i = 0;

        const fillLine = () => {
            let line = '';
            while (i < words.length) {
                const next = line ? line + ' ' + words[i] : words[i];
                if (next.length > maxLen) break;
                line = next;
                i++;
            }
            return line;
        };

        const line1 = fillLine();
        // First word alone already exceeds maxLen — no room for a second
        // line at all, hard-cut it same as the no-space case.
        if (!line1) return words[0].slice(0, maxLen).trimEnd() + '…';

        let line2 = fillLine();
        if (i < words.length) {
            // Words remain beyond two lines — hard-cut line2 to make room
            // for the ellipsis marking the drop.
            if (!line2) line2 = words[i].slice(0, maxLen).trimEnd();
            else if (line2.length > maxLen - 1) line2 = line2.slice(0, maxLen - 1).trimEnd();
            line2 += '…';
        }

        return line2 ? line1 + '\n' + line2 : line1;
    }

    /**
     * Writes `text` to the system clipboard verbatim — no prefix, no
     * quoting, nothing added — so callers like a "Copy path" menu item can
     * hand back exactly the raw string a user would paste into code or
     * another tool. Shows an OS notification on success (the notification
     * body is purely cosmetic feedback and never affects what was copied)
     * and a blocking alert on failure (clipboard API unavailable, e.g.
     * non-HTTPS — same messaging as notepad's own clipboard fallback).
     * @param {string} text - Written to the clipboard exactly as given.
     * @param {{successTitle?:string, successBody?:string}} [opts]
     * @returns {Promise<boolean>} true on success.
     */
    async function copyToClipboard(text, { successTitle, successBody } = {}) {
        if (!navigator.clipboard) {
            app.ui?.alert?.({ title: _('Error'), message: _('Could not copy text'), confirm: _('OK') });
            return false;
        }
        try {
            await navigator.clipboard.writeText(text);
            if (app.exists('app.notifications.notify')) {
                app.notifications.notify({
                    title: successTitle || _('Path copied'),
                    body: successBody !== undefined ? successBody : text,
                    priority: 'info',
                    programId: 'system',
                });
            }
            return true;
        } catch (error) {
            app.ui?.alert?.({ title: _('Error'), message: _('Could not copy text'), confirm: _('OK') });
            return false;
        }
    }

    Object.assign(app.util, { escapeHtml, truncate, copyToClipboard });
    app.lock('util.*', { writable: false, configurable: false });
})(window.app = window.app || {});
