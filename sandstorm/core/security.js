/**
 * @file security.js
 * @description URL and domain security utilities for the Sandstorm OS kernel.
 *
 * Patches `globalThis.app` with three methods that control which external
 * domains and local paths are permitted for dynamic `import()` calls and
 * resource fetches. All security checks are enforced by
 * {@link app.validateDomain} before any module import runs.
 *
 * Loaded as a side-effect ES module during the DOMContentLoaded boot sequence
 * in `sandstorm.gen.js` — `globalThis.app` must already exist.
 *
 * @module core/security
 */

const app = globalThis.app;

/**
 * Resolves a URL or path to its canonical web-relative form.
 *
 * Steps:
 * 1. URL-decodes the input.
 * 2. Strips any leading absolute prefix up to the first recognised base path
 *    (`/sandstorm/`, `/res/`, `/program/`, `/components/`).
 * 3. Resolves `.` and `..` segments.
 *
 * @private
 * @param {string} path - Raw path or URL string to normalise.
 * @returns {string} Normalised path beginning with `/`.
 *
 * @example
 * _normalizePath("http://localhost/sandstorm/components/ui.js")
 * // => "/sandstorm/components/ui.js"
 *
 * _normalizePath("/sandstorm/core/../ui/css.js")
 * // => "/sandstorm/ui/css.js"
 */
function _normalizePath(path) {
    try { path = decodeURIComponent(path); } catch (e) {}
    const knownPaths = ['/sandstorm/', '/res/', '/program/', '/components/'];
    for (const basePath of knownPaths) {
        const index = path.indexOf(basePath);
        if (index !== -1) { path = path.substring(index); break; }
    }
    const parts = path.split('/').filter(Boolean);
    const normalized = [];
    for (const part of parts) {
        if (part === '..') normalized.pop();
        else if (part !== '.') normalized.push(part);
    }
    return '/' + normalized.join('/');
}

/**
 * Validates that a URL or path is safe to import or fetch.
 *
 * Checks (in order):
 * 1. **Protocol-relative** URLs (`//…`) are always rejected.
 * 2. **Path traversal** (`..`) is always rejected.
 * 3. **Dangerous protocols** (`data:`, `blob:`, `javascript:`, `vbscript:`,
 *    `file:`) are always rejected.
 * 4. Only `http:` and `https:` are permitted.
 * 5. For **cross-origin** URLs the hostname must appear in `allowedDomains`
 *    (or `app.config.local.allowedExternalDomains`).
 * 6. For **same-origin** URLs `requireBasePath=true` enforces that the
 *    normalised pathname starts with one of the paths in
 *    `app.config.local.allowedBasePaths`.
 *
 * @memberof app
 * @param {string} path - URL or path to validate.
 * @param {string[]|null} [allowedDomains=null] - Optional override for the
 *   external domain allowlist. Falls back to
 *   `app.config.local.allowedExternalDomains` when `null`.
 * @param {boolean} [requireBasePath=true] - When `true`, same-origin paths
 *   must start with an entry from `app.config.local.allowedBasePaths`.
 * @returns {boolean} `true` if the URL passes all checks; `false` otherwise.
 *
 * @example
 * app.validateDomain("sandstorm/components/ui.js");        // true
 * app.validateDomain("https://evil.com/payload.js");       // false
 * app.validateDomain("javascript:alert(1)");               // false
 * app.validateDomain("https://cdn.jsdelivr.net/lib.js",
 *   ["cdn.jsdelivr.net"]);                                 // true
 */
app.validateDomain = function (path, allowedDomains = null, requireBasePath = true) {
    try {
        if (path.startsWith("//")) {
            this.dev.error(`Security Error: Protocol-relative URLs not allowed: ${path}`, "Core");
            return false;
        }
        if (path.includes('..')) {
            this.dev.error(`Security Error: Path traversal detected: ${path}`, "Core");
            return false;
        }
        const domains = allowedDomains || this.config.local.allowedExternalDomains || [];
        const url = new URL(path, window.location.href);
        const currentOrigin = window.location.origin;
        const dangerousProtocols = ['data:', 'blob:', 'javascript:', 'vbscript:', 'file:'];
        if (dangerousProtocols.some(proto => url.protocol === proto)) {
            this.dev.error(`Security Error: Blocked dangerous protocol: ${url.protocol}`, "Core");
            return false;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            this.dev.error(`Security Error: Only HTTP/HTTPS allowed, got: ${url.protocol}`, "Core");
            return false;
        }
        const isSameOrigin = url.origin === currentOrigin;
        if (!isSameOrigin) {
            if (domains.length === 0) {
                this.dev.error(`Security Error: External domain not allowed: ${url.origin}`, "Core");
                return false;
            }
            const urlHostname = url.hostname.toLowerCase();
            const isAllowed = domains.some(domain => {
                const d = domain.toLowerCase();
                return urlHostname === d || urlHostname.endsWith('.' + d);
            });
            if (!isAllowed) {
                this.dev.error(`Security Error: Domain not in allowlist: ${url.origin}`, "Core");
                return false;
            }
            return true;
        }
        if (requireBasePath) {
            const normalizedPath = _normalizePath(url.pathname);
            const allowedPaths = this.config.local.allowedBasePaths || [];
            const isAllowedPath = allowedPaths.some(basePath => normalizedPath.startsWith(basePath));
            if (!isAllowedPath) {
                this.dev.error(`Security Error: Path not in allowed directories: ${normalizedPath}. Allowed: ${allowedPaths.join(', ')}`, "Core");
                return false;
            }
        }
        return true;
    } catch (error) {
        this.dev.error(`Security Error: Invalid URL: ${error.message}`, "Core");
        return false;
    }
};

/**
 * Adds a new base path to the same-origin import allowlist.
 *
 * The path must begin and end with `/` (e.g. `'/custom-modules/'`).
 * Duplicate entries are silently ignored.
 *
 * @memberof app
 * @param {string} path - The base path to allow.
 * @returns {boolean} `true` if the path was added; `false` if it was rejected
 *   (bad format or already present).
 *
 * @example
 * app.addAllowedBasePath('/custom-modules/');  // true
 * app.addAllowedBasePath('custom-modules');    // false — must start/end with /
 */
app.addAllowedBasePath = function (path) {
    if (!path.startsWith('/') || !path.endsWith('/')) {
        this.dev.error('Base path must start and end with /', "Core");
        return false;
    }
    if (!this.config.local.allowedBasePaths.includes(path)) {
        this.config.local.allowedBasePaths.push(path);
        this.dev.log(`Added allowed base path: ${path}`, "Core");
        return true;
    }
    return false;
};

/**
 * Adds a hostname to the external-domain import allowlist.
 *
 * Any leading `http://` or `https://` prefix is stripped automatically.
 * Subdomains of the registered hostname are also allowed (e.g. registering
 * `"example.com"` permits `"cdn.example.com"`).
 * Duplicate entries are silently ignored.
 *
 * @memberof app
 * @param {string} domain - Hostname to allow (e.g. `"cdn.jsdelivr.net"`).
 *   Protocol prefix is stripped if present.
 * @returns {boolean} `true` if the domain was added; `false` if it was
 *   already in the allowlist.
 *
 * @example
 * app.addAllowedDomain('cdn.jsdelivr.net');           // true
 * app.addAllowedDomain('https://unpkg.com');          // true  (prefix stripped)
 * app.addAllowedDomain('cdn.jsdelivr.net');           // false — already present
 */
app.addAllowedDomain = function (domain) {
    domain = domain.replace(/^https?:\/\//, '').toLowerCase();
    if (!this.config.local.allowedExternalDomains.includes(domain)) {
        this.config.local.allowedExternalDomains.push(domain);
        this.dev.log(`Added allowed external domain: ${domain}`, "Core");
        return true;
    }
    return false;
};
