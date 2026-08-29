/**
 * @file mail/mail_api.js
 * @description Mail API layer for Sandstorm OS.
 *
 * Exports `createApi(os)` — returns an API object that first attempts real
 * backend REST endpoints and falls back to a local `data.json` file.
 *
 * Backend endpoints expected:
 * - `GET  /api/mail/list?folder=inbox` → `{ emails: [...] }`
 * - `GET  /api/mail/get?id=1`          → `{ email: {...} }`
 * - `POST /api/mail/send`              → `{ ok: true }`
 * - `POST /api/mail/delete`            → `{ ok: true }`
 *
 * @module program/mail/mail_api
 */

const BASE = '/api/mail';

export function createApi(os) {

    const DATA_URL = os.config.local.ProgramRoot + 'mail/data.json';

    // In-memory cache: { emails: [], contacts: [] }
    var _cache   = null;
    var _pending = null;  // Promise while loading

    // ── Seed ─────────────────────────────────────────────────────────────────
    // Loads data.json once; subsequent calls return immediately.

    function seed() {
        if (_cache)   return Promise.resolve(_cache);
        if (_pending) return _pending;

        _pending = fetch(DATA_URL)
            .then(function (r) { return r.ok ? r.json() : { emails: [], contacts: [] }; })
            .catch(function ()  { return { emails: [], contacts: [] }; })
            .then(function (data) {
                _cache   = { emails: data.emails || [], contacts: data.contacts || [] };
                _pending = null;
                return _cache;
            });

        return _pending;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    // Safe wrappers — if os.api is absent or throws synchronously the returned
    // rejected Promise is caught by the existing .catch() fallbacks below.
    function apiGet(path, params) {
        try {
            return (os.api && typeof os.api.get === 'function')
                ? os.api.get(path, params)
                : Promise.reject(new Error('no api'));
        } catch (e) { return Promise.reject(e); }
    }

    function apiPost(path, body) {
        try {
            return (os.api && typeof os.api.post === 'function')
                ? os.api.post(path, body)
                : Promise.reject(new Error('no api'));
        } catch (e) { return Promise.reject(e); }
    }

    function nowDate() {
        return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function nowTime() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {

        // Returns the raw in-memory cache (synchronous, null until first load).
        getCache: function () { return _cache; },

        // Forces seed load and returns the cache.
        load: function () { return seed(); },

        // ── Emails ───────────────────────────────────────────────────────────

        listEmails: function (folder) {
            return apiGet(BASE + '/list', folder ? { folder: folder } : {})
                .then(function (res) { return res.emails || res; })
                .catch(function () {
                    return seed().then(function (data) {
                        return folder
                            ? data.emails.filter(function (e) { return e.folder === folder; })
                            : data.emails.slice();
                    });
                });
        },

        getEmail: function (id) {
            return apiGet(BASE + '/get', { id: id })
                .then(function (res) { return res.email || res; })
                .catch(function () {
                    return seed().then(function (data) {
                        return data.emails.find(function (e) { return e.id === id; }) || null;
                    });
                });
        },

        // payload: { to, subject, body, from, fromEmail }
        sendEmail: function (payload) {
            return apiPost(BASE + '/send', payload)
                .then(function (res) {
                    // Backend handled it — still update local cache
                    if (res && res.email) {
                        seed().then(function (data) { data.emails.push(res.email); });
                    }
                    return res;
                })
                .catch(function () {
                    // Fallback: add to local sent folder
                    return seed().then(function (data) {
                        var sent = {
                            id:       Date.now(),
                            folder:   'sent',
                            from:     payload.from      || 'Me',
                            email:    payload.fromEmail || 'me@example.com',
                            to:       payload.to,
                            subject:  payload.subject   || '(no subject)',
                            preview:  (payload.body || '').substring(0, 80),
                            body:     '<p>' + app.util.escapeHtml(payload.body || '').replace(/\n/g, '</p><p>') + '</p>',
                            date:     nowDate(),
                            time:     nowTime(),
                            read:     true,
                            starred:  false,
                            archived: false
                        };
                        data.emails.push(sent);
                        return { ok: true, email: sent };
                    });
                });
        },

        deleteEmail: function (id) {
            return apiPost(BASE + '/delete', { id: id })
                .catch(function () { return { ok: true }; })
                .then(function (res) {
                    // Always update local cache
                    if (_cache) {
                        var idx = _cache.emails.findIndex(function (e) { return e.id === id; });
                        if (idx !== -1) _cache.emails.splice(idx, 1);
                    }
                    return res;
                });
        },

        markRead: function (id) {
            if (_cache) {
                var email = _cache.emails.find(function (e) { return e.id === id; });
                if (email) email.read = true;
            }
            return apiPost(BASE + '/update', { id: id, read: true })
                .catch(function () { return { ok: true }; });
        },

        toggleStar: function (id) {
            var starred = false;
            if (_cache) {
                var email = _cache.emails.find(function (e) { return e.id === id; });
                if (email) { email.starred = !email.starred; starred = email.starred; }
            }
            return apiPost(BASE + '/update', { id: id, starred: starred })
                .catch(function () { return { ok: true, starred: starred }; });
        },

        archiveEmail: function (id) {
            if (_cache) {
                var email = _cache.emails.find(function (e) { return e.id === id; });
                if (email) email.archived = true;
            }
            return apiPost(BASE + '/update', { id: id, archived: true })
                .catch(function () { return { ok: true }; });
        },

        // ── Contacts ─────────────────────────────────────────────────────────

        listContacts: function () {
            return apiGet(BASE + '/contacts')
                .then(function (res) { return res.contacts || res; })
                .catch(function () {
                    return seed().then(function (data) { return data.contacts.slice(); });
                });
        }
    };
}
