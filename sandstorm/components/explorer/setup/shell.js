/**
 * @file explorer/setup/shell.js
 * @description Builds the static HTML shell for an Explorer window (toolbar,
 * nav sidebar, main list area, meta panel). Pure function — no registration
 * side effects.
 *
 * Exported as `buildExpShell()`, assigned to `app.explorer.windows.buildShell`
 * by explorer/setup/dialogs.js and called by explorer.js's `body()` to
 * produce the window's inner HTML.
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes.
 *
 * @module components/explorer/setup/shell
 */

/**
 * Builds the Explorer window's static HTML shell.
 *
 * @returns {string} The shell HTML.
 */
export function buildExpShell() {
    const toolbar = `
        <div class="exp-toolbar">
            <button class="exp-nav-btn exp-back" title="${_('Back')}" disabled>
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
            <button class="exp-nav-btn exp-fwd" title="${_('Forward')}" disabled>
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
            </button>
            <button class="exp-nav-btn exp-up" title="${_('Up')}">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11z" transform="rotate(-90,12,12)"/></svg>
            </button>
            <div class="exp-breadcrumb"></div>
            <button class="exp-view-btn exp-breadcrumb-toggle" title="${_('Show path')}">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>
            </button>
            <div class="exp-toolbar-right">
                <button class="exp-view-btn exp-refresh-btn" title="${_('Refresh')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                </button>
                <div class="exp-toolbar-sep"></div>
                <button class="exp-view-btn exp-edit-menu-btn" title="${_('Edit')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>
                </button>
                <button class="exp-view-btn active" data-view="list" title="${_('List view')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
                </button>
                <button class="exp-view-btn" data-view="grid" title="${_('Grid view')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"/></svg>
                </button>
                <div class="exp-toolbar-sep"></div>
                <div class="exp-side-search-wrap">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input class="exp-hdr-search" type="text" placeholder="${_('Search files…')}" />
                </div>
                <button class="exp-side-act-btn exp-filter-btn" title="${_('Filter search results')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
                    <svg class="exp-filter-caret" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
                </button>
                <div class="exp-filter-panel">
                    <div class="exp-filter-section">
                        <div class="exp-filter-label">${_('File type')}</div>
                        <div class="exp-filter-chips" data-group="type">
                            <button type="button" class="exp-filter-chip" data-cat="image">${_('Images')}</button>
                            <button type="button" class="exp-filter-chip" data-cat="document">${_('Documents')}</button>
                            <button type="button" class="exp-filter-chip" data-cat="media">${_('Audio/Video')}</button>
                            <button type="button" class="exp-filter-chip" data-cat="archive">${_('Archives')}</button>
                            <button type="button" class="exp-filter-chip" data-cat="code">${_('Code')}</button>
                        </div>
                    </div>
                    <div class="exp-filter-section">
                        <div class="exp-filter-label">${_('Date modified')}</div>
                        <div class="exp-filter-chips" data-group="date">
                            <button type="button" class="exp-filter-chip" data-date="today">${_('Today')}</button>
                            <button type="button" class="exp-filter-chip" data-date="week">${_('Last 7 days')}</button>
                            <button type="button" class="exp-filter-chip" data-date="month">${_('Last 30 days')}</button>
                        </div>
                    </div>
                    <div class="exp-filter-section">
                        <div class="exp-filter-label">${_('Size')}</div>
                        <div class="exp-filter-chips" data-group="size">
                            <button type="button" class="exp-filter-chip" data-size="small">${_('Small (<1 MB)')}</button>
                            <button type="button" class="exp-filter-chip" data-size="medium">${_('Medium (1-100 MB)')}</button>
                            <button type="button" class="exp-filter-chip" data-size="large">${_('Large (>100 MB)')}</button>
                        </div>
                    </div>
                    <div class="exp-filter-footer">
                        <button type="button" class="exp-filter-clear">${_('Clear filters')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    const nav = `
        <div class="exp-nav">
            <div class="exp-nav-icons">
                <button class="exp-act-btn active" data-panel="files" title="${_('Files')}">
                    <svg viewBox="0 0 24 24"><use href="#ic-folder"></use></svg>
                </button>
                <button class="exp-act-btn" data-panel="favorites" title="${_('Favorites')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                </button>
                <button class="exp-act-btn exp-meta-toggle" title="${_('Hide details')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h6v-2H3v2zm0-5h8v-2H3v2zm0-7v2h18V6H3zm16 9.34V14h-2v2.34c-.6.28-1 .89-1 1.66 0 1.1.9 2 2 2s2-.9 2-2c0-.77-.4-1.38-1-1.66zM11 17h6v-2h-6v2z"/></svg>
                </button>
                <button class="exp-act-btn exp-nav-lock" title="${_('Lock panel')}">
                    <svg class="exp-nav-lock-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                </button>
                <button class="exp-act-btn exp-desktop-nav-btn" title="${_('Desktop')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z"/></svg>
                </button>
                <button class="exp-act-btn exp-import-btn" title="${_('Import from computer')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5z"/></svg>
                </button>
                <button class="exp-act-btn exp-upload-btn" title="${_('Upload files')}">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                </button>
            </div>
            <div class="exp-nav-panel">
                <div class="exp-side-body"></div>
            </div>
        </div>`;
    const main = `
        <div class="exp-main">
            <div class="exp-search-status"></div>
            <div class="exp-list-body"></div>
            <div class="exp-footer">
                <span class="exp-footer-text"></span>
            </div>
        </div>`;
    const meta = `
        <div class="exp-meta">
            <div class="exp-meta-body">
                <div class="exp-meta-icon"></div>
                <div class="exp-meta-name"></div>
                <div class="exp-meta-rows"></div>
                <div class="exp-meta-extra"></div>
            </div>
        </div>`;
    return `<div class="exp-root layout-full">${toolbar}<div class="exp-workspace">${nav}${main}${meta}</div></div>`;
}
