/**
 * @file explorer/window/state.js
 * @description Per-window Explorer state factory + read-only shared
 * constants. `createState()` is called fresh inside every `start(os)`
 * invocation (see window/index.js) — Explorer is `multistart: true`, so
 * each open window needs its own independent `path`/`selection`/`history`/
 * etc.; nothing here is module-level/shared mutable state.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Original local closure variables (`_path`, `_selection`,
 * …) became `state.path`/`state.selection`/… properties of the object this
 * factory returns; every sibling window/*.js module takes that `state`
 * object as a parameter instead of closing over free variables.
 *
 * @module components/explorer/window/state
 */

/**
 * Creates a fresh per-window Explorer state object.
 *
 * @returns {Object} The mutable state object for one Explorer window instance.
 */
export function createState() {
    return {
        path:          '/',
        history:       ['/'],
        histIdx:       0,
        panel:         'files',
        layout:        'full',
        isDialog:      false,
        view:          'list',
        sortField:     'name',   // 'name' | 'size' | 'type' | 'modified'
        sortDir:       'asc',    // 'asc'  | 'desc'
        columns: [
            { key: 'name',     label: () => _('Name'),     style: '' },
            { key: 'type',     label: () => _('Type'),     style: '' },
            { key: 'modified', label: () => _('Modified'), style: '' },
            { key: 'size',     label: () => _('Size'),     style: 'text-align:right;' },
        ],
        dialogTypes:   [],       // [] = no filter; ['txt','jpg'] = only these extensions
        expanded:      new Set(['/']),
        winRoot:       null,
        win:           null,     // WindowElement — set in body(windowobj), exposes .history (win.history.execute(), see historyManager.js)
        metaVisible:   true,
        navLocked:     false,
        navTouchOpen:  false,    // nav rail open state on touch devices (tap toggles, since :hover is unreliable there)
        selection:     new Set(), // paths of selected items
        shiftAnchor:   null,      // path anchor for shift+click range selection
        treeIdx:       0,
        renderedCount: 0,
        searchQuery:   '', // '' = not searching; drives .exp-list-body's search-results view
        searchFilters: { types: [], date: null, size: null }, // applied on top of searchQuery only
        _metaSearchActive: false, // true while exp-meta shows the search-results tree instead of selection details (core.js updateMain / meta.js)
        crumbDropdownFor: null, // path of the crumb whose dropdown is open, or null
        _qsBuffer:      '', // current-folder type-ahead quick-search string (quicksearch.js)
        _qsMatchIndex:  0,  // which match _qsBuffer currently points to, for same-letter cycling
        _qsLastKeyTime: 0,  // Date.now() of the last quick-search keystroke, for the 2s combine/cycle window
    };
}

/** Page size for infinite scroll (items rendered per batch). */
export const PAGE = 50;

/** Quick-access favorites shown in the side panel's Favorites tab. */
export const FAVORITES = [
    { name: _('Home'),      path: '/'          },
    { name: _('Documents'), path: '/Documents' },
    { name: _('Downloads'), path: '/Downloads' },
    { name: _('Pictures'),  path: '/Pictures'  },
];

/** Fallback color-chip palette for extensions with no registered program icon. */
export const EXT_COLOR = {
    pdf:  '#f87171', txt: '#94a3b8', xlsx: '#4ade80', docx: '#60a5fa',
    exe:  '#fb923c', zip: '#a78bfa', msi:  '#fb923c',
    jpg:  '#facc15', png: '#facc15', gif: '#facc15',
    html: '#f97316', css: '#60a5fa', js:   '#fbbf24',
    mp3:  '#c084fc', mp4: '#c084fc', m3u:  '#c084fc',
};

/** Extension → filter category, used by the search filter panel's "File type" chips. */
export const EXT_CATEGORY_MAP = {
    jpg: 'image', png: 'image', gif: 'image',
    pdf: 'document', txt: 'document', docx: 'document', xlsx: 'document',
    mp3: 'media', mp4: 'media', m3u: 'media',
    zip: 'archive',
    html: 'code', css: 'code', js: 'code',
};

/** Folder icon (grid/icon view) keyframe data — see explorer/NOTES.md. */
export const FOLDER_SHAPES = {
    BODY_D:   "M127.000,0.000 C145.1000,0.000 587.1000,0.000 638.000,0.000 C668.617,6.674 695.606,30.942 722.1000,59.1000 C757.339,96.425 790.616,133.571 816.1000,134.000 C846.250,133.571 1390.000,132.1000 1390.000,132.1000 C1430.869,132.1000 1464.000,166.131 1464.000,207.000 L1464.000,1059.1000 C1464.000,1100.869 1430.869,1133.1000 1390.000,1133.1000 L136.1000,1133.1000 C96.131,1133.1000 62.1000,1100.869 62.1000,1059.1000 L62.1000,63.000 C62.1000,22.131 107.1000,0.000 127.000,0.000 Z",
    CLOSED_D: "M87.1000,232.000 C98.1000,231.750 628.833,233.333 646.000,233.000 C673.583,233.459 713.500,199.167 730.300,187.488 C768.858,159.907 783.917,139.781 822.000,133.1000 C828.167,133.969 1402.000,133.1000 1402.000,133.1000 C1429.312,133.969 1466.778,172.239 1463.000,199.000 L1468.328,1084.962 C1464.817,1111.061 1441.179,1133.981 1414.1000,1133.1000 L113.000,1133.1000 C86.631,1134.019 61.322,1111.985 56.739,1085.791 L63.000,289.000 C63.000,289.000 62.531,262.750 63.000,251.1000 C63.469,241.250 71.1000,232.250 87.1000,232.000 Z",
    HALF_D:   "M27.1000,498.000 C27.1000,498.000 720.833,498.333 737.1000,498.000 C765.583,498.459 805.500,464.167 822.300,452.488 C860.858,424.907 875.917,404.781 914.000,399.000 C920.167,398.969 1484.1000,399.000 1484.1000,399.000 C1512.312,398.969 1524.778,415.239 1521.000,442.000 L1468.328,1084.962 C1464.817,1111.061 1441.179,1133.981 1414.1000,1133.1000 L112.1000,1133.1000 C86.631,1134.019 61.322,1111.985 56.739,1085.791 L3.000,554.1000 C-0.118,538.276 -3.843,514.268 12.656,502.647 C16.615,499.858 27.1000,498.000 27.1000,498.000 Z",
    OPEN_D:   "M30.1000,732.1000 C30.1000,732.1000 723.833,733.333 740.1000,732.1000 C768.583,733.459 808.500,699.167 825.300,687.488 C863.858,659.907 878.917,639.781 917.000,634.000 C923.167,633.969 1487.1000,634.000 1487.1000,634.000 C1515.312,633.969 1527.778,650.239 1524.000,677.000 L1468.328,1084.962 C1464.817,1111.061 1441.179,1133.981 1415.000,1133.1000 L113.000,1133.1000 C86.631,1134.019 61.322,1111.985 56.739,1085.791 L6.000,790.000 C2.882,773.276 -0.843,749.268 15.656,737.647 C19.615,734.858 30.1000,732.1000 30.1000,732.1000 Z",
};

/** Extensions previewable as a real image thumbnail in a folder's preview icon. */
export const FOLDER_PREVIEW_IMG_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
