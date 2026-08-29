/**
 * @file api.js
 * @description HTTP API client for the Sandstorm OS environment.
 *
 * Exposes `app.api` with GET, POST, and multipart-POST methods that support
 * both a chainable callback API (`.success()`, `.fail()`, `.done()`) and a
 * standard Promise interface (`then/catch/finally`).
 *
 * Includes a URL blacklist so specific endpoints can be blocked at runtime
 * for security or debugging purposes. Every request is logged with the
 * caller's file and line number via stack-trace introspection.
 *
 * @module components/api
 *
 * @example
 * // Promise style
 * const data = await app.api.get("/api/users", { page: 1 });
 *
 * // Callback style
 * app.api.post("/api/save", { title: "Hello" })
 *   .success(res => console.log(res))
 *   .fail(err => console.error(err));
 */
(function (app) {
    // Ensure the app namespace exists and define API module
    app.api = app.api || {};

    /**
     * API configuration
     * @namespace
     * @property {number} timeout - Default timeout in milliseconds (default: 40000)
     */
    app.api.config = {
        timeout: 40000
    };

    /**
     * Blacklist with details about where the calls were made from
     * @type {Object.<string, Array>}
     * @private
     */
    const blacklist = {};

    /**
     * Gets information about where the function was called from
     * @returns {Object} Object with caller, file, line and column
     * @private
     */
    function getCallerInfo() {
        const stack = new Error().stack.split('\n');
        const callerLine = stack[3] || stack[2] || 'unknown';
        const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);

        if (match) {
            return {
                caller: match[1],
                file: match[2],
                line: match[3],
                column: match[4]
            };
        }

        return {
            caller: callerLine.trim(),
            file: 'unknown',
            line: 'unknown',
            column: 'unknown'
        };
    }

    /**
     * Logs an API request with timestamp and caller information
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} url - URL being called
     * @param {Object} callerInfo - Information about the caller
     * @private
     */
    function logRequest(method, url, callerInfo) {
        const timestamp = new Date().toISOString();
        app.dev.log(`[${timestamp}] ${method} request to: ${url}`, 'API');
        app.dev.log(`Called from: ${callerInfo.file}:${callerInfo.line} (${callerInfo.caller})`, 'API');
    }

    /**
     * Request class for chainable callbacks and Promise support
     * Allows multiple callbacks to be registered and executed on success/fail/done
     * Also supports Promise interface with then/catch/finally
     * @class
     * @private
     */
    class ApiRequest {
        /**
         * Creates a new ApiRequest instance
         * @constructor
         */
        constructor() {
            this.successCallbacks = [];
            this.failCallbacks = [];
            this.doneCallbacks = [];
            this.promise = new Promise((resolve, reject) => {
                this._resolve = resolve;
                this._reject = reject;
            });
        }

        /**
         * Registers a success callback
         * @param {Function} callback - Function to execute on successful request
         * @returns {ApiRequest} Returns this for chaining
         */
        success(callback) {
            this.successCallbacks.push(callback);
            return this;
        }

        /**
         * Registers a fail callback
         * @param {Function} callback - Function to execute on failed request
         * @returns {ApiRequest} Returns this for chaining
         */
        fail(callback) {
            this.failCallbacks.push(callback);
            return this;
        }

        /**
         * Registers a done callback that executes regardless of result
         * @param {Function} callback - Function to execute when request is complete
         * @returns {ApiRequest} Returns this for chaining
         */
        done(callback) {
            this.doneCallbacks.push(callback);
            return this;
        }

        /**
         * Promise.then implementation
         * @param {Function} onFulfilled - Success handler
         * @param {Function} [onRejected] - Error handler
         * @returns {Promise} Promise for chaining
         */
        then(onFulfilled, onRejected) {
            return this.promise.then(onFulfilled, onRejected);
        }

        /**
         * Promise.catch implementation
         * @param {Function} onRejected - Error handler
         * @returns {Promise} Promise for chaining
         */
        catch(onRejected) {
            return this.promise.catch(onRejected);
        }

        /**
         * Promise.finally implementation
         * @param {Function} onFinally - Handler to call regardless of outcome
         * @returns {Promise} Promise for chaining
         */
        finally(onFinally) {
            return this.promise.finally(onFinally);
        }

        /**
         * Triggers all success callbacks and resolves the Promise
         * @private
         * @param {*} data - Data to send to callbacks
         */
        _triggerSuccess(data) {
            this.successCallbacks.forEach(cb => cb(data));
            this.doneCallbacks.forEach(cb => cb(data, null));
            this._resolve(data);
        }

        /**
         * Triggers all fail callbacks and rejects the Promise
         * @private
         * @param {*} error - Error to send to callbacks
         */
        _triggerFail(error) {
            this.failCallbacks.forEach(cb => cb(error));
            this.doneCallbacks.forEach(cb => cb(null, error));
            this._reject(error);
        }
    }

    /**
     * Creates a timeout promise that rejects after specified milliseconds
     * @param {number} ms - Timeout in milliseconds
     * @param {string} url - URL for error message
     * @returns {Promise} Promise that rejects after timeout
     * @private
     */
    function createTimeout(ms, url) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Request timeout after ${ms}ms for URL: ${url}`));
            }, ms);
        });
    }

    /**
     * Executes a fetch request with timeout support
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {string} method - HTTP method for logging
     * @returns {Promise} Promise that resolves with response data
     * @private
     */
    async function executeRequest(url, options, method) {
        const timeoutMs = app.api.config.timeout;
        const timeoutPromise = createTimeout(timeoutMs, url);

        const fetchPromise = fetch(url, options).then(async response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        });

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        app.dev.log(`${method} request successful`, 'API');
        return result;
    }

    /**
     * Adds a URL to the blacklist with detailed call information
     * @param {string} url - URL to be blocked
     * @param {string} [line] - Line number where the call was made (auto-detected if not provided)
     * @param {string} [file] - File name where the call was made (auto-detected if not provided)
     * @param {string} [caller] - Function name that made the call (auto-detected if not provided)
     * @param {string} [reason] - Reason for blacklisting
     * @private
     */
    function addToBlacklist(url, line, file, caller, reason) {
        const callerInfo = getCallerInfo();

        if (!blacklist[url]) {
            blacklist[url] = [];
        }

        blacklist[url].push({
            line: line || callerInfo.line,
            file: file || callerInfo.file,
            caller: caller || callerInfo.caller,
            reason: reason || 'Manual blacklist',
            timestamp: new Date().toISOString()
        });

        app.dev.log(`Added to blacklist: ${url}`, 'API');
        app.dev.log(`Location: ${file || callerInfo.file}:${line || callerInfo.line} (${caller || callerInfo.caller})`, 'API');
        if (reason) app.dev.log(`Reason: ${reason}`, 'API');
    }

    /**
     * Removes a URL from the blacklist
     * @param {string} url - URL to remove from blacklist
     * @returns {boolean} True if URL was removed, false if not found
     * @private
     */
    function removeFromBlacklist(url) {
        if (blacklist[url]) {
            delete blacklist[url];
            app.dev.log(`Removed from blacklist: ${url}`, 'API');
            return true;
        }
        app.dev.log(`ℹ️ URL not found in blacklist: ${url}`, 'API');
        return false;
    }

    /**
     * Checks if a URL is in the blacklist
     * @param {string} url - URL to check
     * @returns {boolean} True if URL is blocked
     * @private
     */
    function isBlacklisted(url) {
        return Object.keys(blacklist).some(blocked => url.includes(blocked));
    }

    /**
     * Clears the entire blacklist
     * @returns {number} Number of URLs removed
     * @private
     */
    function clearBlacklist() {
        const count = Object.keys(blacklist).length;
        Object.keys(blacklist).forEach(url => {
            delete blacklist[url];
        });
        app.dev.log(`Cleared blacklist: ${count} URLs removed`, 'API');
        return count;
    }

    // Public API methods
    Object.assign(app.api, {
        /**
         * Makes a GET request to the specified URL
         * @param {string} url - URL to call
         * @param {Object} [args={}] - Query parameters as object
         * @param {Function|Object} [callback=null] - Either a success callback function or object with {success, fail, done}
         * @returns {ApiRequest} Request object that supports both callbacks and Promise interface
         * 
         * @example
         * // Using callbacks
         * app.api.get('/api/users', { page: 1 }, function(data) {
         *   console.log(data);
         * });
         * 
         * @example
         * // Using Promise
         * app.api.get('/api/users', { page: 1 })
         *   .then(data => console.log(data))
         *   .catch(error => console.error(error));
         * 
         * @example
         * // Using async/await
         * try {
         *   const data = await app.api.get('/api/users', { page: 1 });
         *   console.log(data);
         * } catch (error) {
         *   console.error(error);
         * }
         */
        get: function (url, args = {}, callback = null) {
            const callerInfo = getCallerInfo();
            const request = new ApiRequest();

            // Register callbacks
            if (typeof callback === 'function') {
                request.success(callback);
            } else if (callback && typeof callback === 'object') {
                if (callback.success) request.success(callback.success);
                if (callback.fail) request.fail(callback.fail);
                if (callback.done) request.done(callback.done);
            }

            // Check blacklist
            if (isBlacklisted(url)) {
                app.dev.error(`Request blocked! URL is blacklisted: ${url}`, 'API');
                app.dev.error(`Blacklist info: ${JSON.stringify(blacklist[url] || blacklist)}`, 'API');
                const error = new Error(`URL is blacklisted: ${url}`);
                request._triggerFail(error);
                addToBlacklist(url, callerInfo.line, callerInfo.file, callerInfo.caller, 'Attempted access after blacklisting');
                return request;
            }

            // Log request
            logRequest('GET', url, callerInfo);

            // Build URL with query parameters
            const queryString = new URLSearchParams(args).toString();
            const fullUrl = queryString ? `${url}?${queryString}` : url;

            // Execute request with timeout
            executeRequest(fullUrl, {}, 'GET')
                .then(data => {
                    request._triggerSuccess(data);
                })
                .catch(error => {
                    app.dev.error(`GET request failed: ${error.message}`, 'API');
                    request._triggerFail(error);
                });

            return request;
        },

        /**
         * Makes a POST request with JSON data
         * @param {string} url - URL to call
         * @param {Object} [data={}] - Data to send as JSON
         * @param {Function|Object} [callback=null] - Either a success callback function or object with {success, fail, done}
         * @returns {ApiRequest} Request object that supports both callbacks and Promise interface
         * 
         * @example
         * // Using callbacks
         * app.api.post('/api/users', { name: 'John' }, function(data) {
         *   console.log(data);
         * });
         * 
         * @example
         * // Using Promise
         * app.api.post('/api/users', { name: 'John' })
         *   .then(data => console.log(data))
         *   .catch(error => console.error(error));
         */
        post: function (url, data = {}, callback = null) {
            const callerInfo = getCallerInfo();
            const request = new ApiRequest();

            // Register callbacks
            if (typeof callback === 'function') {
                request.success(callback);
            } else if (callback && typeof callback === 'object') {
                if (callback.success) request.success(callback.success);
                if (callback.fail) request.fail(callback.fail);
                if (callback.done) request.done(callback.done);
            }

            // Check blacklist
            if (isBlacklisted(url)) {
                app.dev.error(`Request blocked! URL is blacklisted: ${url}`, 'API');
                app.dev.error(`Blacklist info: ${JSON.stringify(blacklist[url] || blacklist)}`, 'API');
                const error = new Error(`URL is blacklisted: ${url}`);
                request._triggerFail(error);
                addToBlacklist(url, callerInfo.line, callerInfo.file, callerInfo.caller, 'Attempted access after blacklisting');
                return request;
            }

            // Log request
            logRequest('POST', url, callerInfo);
            app.dev.log(`Data: ${JSON.stringify(data)}`, 'API');

            // Execute request with timeout
            executeRequest(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            }, 'POST')
                .then(responseData => {
                    request._triggerSuccess(responseData);
                })
                .catch(error => {
                    app.dev.error(`POST request failed: ${error.message}`, 'API');
                    request._triggerFail(error);
                });

            return request;
        },

        /**
         * Makes a POST request with multipart form data (for file uploads)
         * @param {string} url - URL to call
         * @param {FormData} formData - FormData object with files and data
         * @param {Function|Object} [callback=null] - Either a success callback function or object with {success, fail, done}
         * @returns {ApiRequest} Request object that supports both callbacks and Promise interface
         * 
         * @example
         * // Using callbacks
         * const formData = new FormData();
         * formData.append('file', file);
         * app.api.multiFormData('/api/upload', formData, function(data) {
         *   console.log(data);
         * });
         * 
         * @example
         * // Using Promise
         * app.api.multiFormData('/api/upload', formData)
         *   .then(data => console.log(data))
         *   .catch(error => console.error(error));
         */
        multiFormData: function (url, formData, callback = null) {
            const callerInfo = getCallerInfo();
            const request = new ApiRequest();

            // Register callbacks
            if (typeof callback === 'function') {
                request.success(callback);
            } else if (callback && typeof callback === 'object') {
                if (callback.success) request.success(callback.success);
                if (callback.fail) request.fail(callback.fail);
                if (callback.done) request.done(callback.done);
            }

            // Check blacklist
            if (isBlacklisted(url)) {
                app.dev.error(`Request blocked! URL is blacklisted: ${url}`, 'API');
                app.dev.error(`Blacklist info: ${JSON.stringify(blacklist[url] || blacklist)}`, 'API');
                const error = new Error(`URL is blacklisted: ${url}`);
                request._triggerFail(error);
                addToBlacklist(url, callerInfo.line, callerInfo.file, callerInfo.caller, 'Attempted access after blacklisting');
                return request;
            }

            // Log request
            logRequest('POST (multipart)', url, callerInfo);
            app.dev.log(`FormData entries: ${JSON.stringify([...formData.entries()])}`, 'API');

            // Execute request with timeout
            executeRequest(url, {
                method: 'POST',
                body: formData
            }, 'Multipart')
                .then(data => {
                    request._triggerSuccess(data);
                })
                .catch(error => {
                    app.dev.error(`Multipart request failed: ${error.message}`, 'API');
                    request._triggerFail(error);
                });

            return request;
        },

        /**
         * Manually adds a URL to the blacklist with detailed information
         * @param {string} url - URL to block
         * @param {string} [line] - Optional line number (auto-detected if not provided)
         * @param {string} [file] - Optional file name (auto-detected if not provided)
         * @param {string} [caller] - Optional caller function name (auto-detected if not provided)
         * @param {string} [reason] - Reason for blacklisting
         * 
         * @example
         * app.api.addToBlacklist('/admin/delete');
         * @example
         * app.api.addToBlacklist('/admin/delete', '123', 'script.js', 'adminFunction', 'Security risk');
         */
        addToBlacklist: function (url, line, file, caller, reason) {
            addToBlacklist(url, line, file, caller, reason);
        },

        /**
         * Removes a URL from the blacklist
         * @param {string} url - URL to remove from blacklist
         * @returns {boolean} True if URL was removed, false if not found
         * 
         * @example
         * app.api.removeFromBlacklist('/admin/delete');
         */
        removeFromBlacklist: function (url) {
            return removeFromBlacklist(url);
        },

        /**
         * Shows all blocked URLs with information about when and where they were blocked
         * @returns {Object} The blacklist object
         * 
         * @example
         * app.api.showBlacklist();
         */
        showBlacklist: function () {
            app.dev.log('Current blacklist:', 'API');
            app.dev.log(JSON.stringify(blacklist, null, 2), 'API');
            return blacklist;
        },

        /**
         * Checks if a URL is in the blacklist
         * @param {string} url - URL to check
         * @returns {boolean} True if URL is blocked
         * 
         * @example
         * if (app.api.isBlacklisted('/admin/delete')) {
         *   console.log('URL is blocked');
         * }
         */
        isBlacklisted: function (url) {
            return isBlacklisted(url);
        },

        /**
         * Clears the entire blacklist
         * @returns {number} Number of URLs removed
         * 
         * @example
         * app.api.clearBlacklist();
         */
        clearBlacklist: function () {
            return clearBlacklist();
        },

        /**
         * Gets the number of URLs in the blacklist
         * @returns {number} Number of blacklisted URLs
         * 
         * @example
         * app.api.getBlacklistCount();
         */
        getBlacklistCount: function () {
            return Object.keys(blacklist).length;
        }
    });
    app.lock('api.*', { writable: false, configurable: false });
})(window.app = window.app || {});
