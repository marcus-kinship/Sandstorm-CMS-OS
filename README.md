# Sandstorm CMS/OS

Sandstorm is a web-based operating system and CMS GUI that simulates a desktop OS directly in the browser. It is a pure front-end framework built with ES6 modules, jQuery and a custom window-management system — no backend required.

For the detailed mechanics of how everything fits together (boot sequence, window system, the desktop shell, Explorer, Designer, per-program notes), see **[ARKITEKTUR.md](ARKITEKTUR.md)**. This file is the high-level introduction.

## Technology stack

| Component | Technology |
|-----------|-----------|
| Core language | Vanilla JavaScript (ES6 modules) |
| DOM/events | jQuery 3.7.1 + jQuery UI |
| Touch support | jquery.ui.touch-punch |
| Drag sorting | Sortable.js |
| Styling | CSS variables (theme system) |
| Entry point | `index.html` → `sandstorm.gen.js` |

## File structure

```
├── index.html                  # Bootstrap configuration + startup sequence
├── sandstorm.gen.js            # Hand-written boot shield, loading screen, module loader
├── svgs.js                     # SVG icon definitions
├── combine.vbs / minify.vbs    # Build scripts (generate dist/)
│
├── res/                        # Libraries & resources
│   ├── js/                     # jquery, jquery-ui, touch-punch, sortable
│   ├── css/                    # jquery-ui theme
│   ├── fontawesome/, icons/
│
├── wallpaper/                  # Desktop backgrounds
│
├── sandstorm/
│   ├── basic.css               # Base stylesheet
│   ├── core/                   # modules.js (loader), security.js, utils.js
│   ├── state/store.js          # State store
│   ├── ui/css.js               # Runtime CSS injection (app.addCSS / app.removeCSS)
│   │
│   └── components/             # The OS core
│       ├── load.js             # Load sequence & bootstrap (app.load.system)
│       ├── ui.js / ui.css      # Window & menu rendering
│       ├── api.js              # HTTP/fetch wrapper (ApiRequest)
│       ├── body.js             # DOM initialization
│       ├── desktop.js          # Background, wake-up, theme
│       ├── program.js          # Program lifecycle (Map-based) + extInfo/fileHandlers registry
│       ├── menu.js             # Menu system
│       ├── language/           # os.language — live language switching
│       ├── historyManager.js   # OS-level undo/redo sessions
│       ├── keynav.js           # Keyboard navigation
│       ├── svg.js / svg-morph.js  # app.svg resource manager
│       ├── fonts.js            # app.fonts — shared font registry (Designer + Notepad)
│       │
│       ├── ui/                 # UI widgets (window/, caret.js, calendar.js, dropmenu.js,
│       │                       #  tags.js, toggleWindow.js, slider.js, …)
│       ├── taskbar/            # Taskbar (clock, overflow, show-desktop, sort)
│       ├── startmenu/          # Start menu (tabs, search, running apps)
│       ├── startmenu.js / menu.js
│       ├── search/             # Global search engine (Start menu + Control Panel)
│       ├── notifications/      # Notification system (#timeDisplay trigger + Control Panel tile)
│       ├── cursor/             # Cursor Engine — SVG cursor overlay, permission-gated
│       ├── login/              # Login screen, lock screen, autologout
│       ├── controlpanel/       # Control Panel (themes, language, program config, users, …)
│       ├── explorer/           # File manager — virtual FS + RealStorage backend
│       ├── recyclebin/         # Recycle Bin
│       ├── responsivelayout/   # Responsive Window Layout + Snap Layout
│       ├── windowswitcher.js   # Alt-Tab-style window switcher
│       ├── networkmonitor/     # Network monitor
│       └── widgets/            # Shared widgets (input.js, …)
│
└── program/                    # Applications
    ├── calc/                   # Calculator
    ├── notepad/                # Text editor (multi-instance, tabs, find/replace)
    ├── gui/                    # Layout-component showcase
    ├── solitaire/              # Card game
    ├── mail/                   # Email client
    ├── formbuilder/            # Form designer
    ├── designer/               # Page builder — object model, style engine, 5 tools, dock panels
    ├── fotoviewer/             # Image viewer (declares itself into Explorer)
    ├── mediaplayer/            # Audio/video player (mp3/mp4/m3u)
    └── voiceinput/             # Voice input overlay
```

## Startup sequence

`index.html` is the single source of truth for boot configuration. It calls `app.load.system(config)`, which takes **three lists with different timing guarantees** (see [ARKITEKTUR.md §1](ARKITEKTUR.md)):

1. **`loadingScreen.systemfiles`** — pure infrastructure (`ui.js`, `desktop.js`, `taskbar/*`, …), run sequentially under the loading screen. Array order must match execution order.
2. **`programs`** — each program's `setup(os)` runs here, before any `start:` step.
3. **`start`** — the startup sequence from `index.html`. The login step **blocks the whole sequence** until a real human logs in; `desktop.taskbar.build` is the last step.

**Rule of thumb:** all boot-critical state (SVG icons, `program.addInfo`, `openWith`/`extInfo`) must be set in `setup()`, which is guaranteed to finish before the desktop is shown. `start()` only draws a window and runs lazily, the first time the user opens the program.

## Included programs & system components

| Program | Notes |
|---|---|
| **Calculator** | `270×380` window, keyboard support, special-function keys |
| **Notepad** | Multi-instance (`multistart`), tab system, find/replace toolbar, status bar |
| **GUI showcase** | Interactive showcase of layout components (buttons, inputs, flexbox/grid, panels) |
| **Solitaire** | Klondike, resizable, discrete size tiers, undo/redo/hint |
| **Mail** | Email client with nav column and folders (Inbox, Drafts, Sent) |
| **Form Builder** | jQuery-based form designer |
| **Designer** | Full page builder — its own Document/Node object model, a cascade-aware style engine, canvas renderer, Select/Split/Resize/Move/Text tools, and a dozen+ dock panels (see [ARKITEKTUR.md §18](ARKITEKTUR.md)) |
| **Fotoviewer** | Image viewer — declares itself into Explorer via `openWith`, no Explorer code of its own |
| **Media Player** | mp3/mp4/m3u, status-icon overlay panel, Explorer meta-panel audio widget |
| **Voice Input** | Short-lived overlay for speech input |

| System component | Purpose |
|---|---|
| **Taskbar** | Clock (digital/analog), task icons, overflow menu, show-desktop, FLIP-animated icon sort |
| **Start menu** | Apps / Email / Calendar / Widgets / Settings / Account / Updates tabs + search box |
| **Search engine** | Backs both the Start-menu search and Control Panel settings search; alias table + tiered fuzzy matching |
| **Notifications** | `app.notifications` core, `#timeDisplay` trigger, per-program routing, `priority:'critical'` override |
| **Cursor Engine** | SVG cursor overlay replacing the native pointer, permission-gated per program, working/busy cue |
| **Login** | Login + lock screen + autologout (separate from the Control Panel lock timeout) |
| **Control Panel** | Themes, language, program config, users/avatars, responsive layout — lazy-loaded `*.content.js` panels |
| **Explorer** | File manager — in-memory tree from `filesystem.json` + a real `/RealStorage` backend (list/read/write/delete) |
| **Recycle Bin** | Undo/redo-aware delete |
| **Responsive Window Layout** | Admin-controlled per-breakpoint grid arrangement + drag-to-edge Snap Layout |

## Program structure

Each program has a `setup.js` (boot-time registration) and a separate window module (lazy-loaded):

```javascript
// program/myprog/setup.js
export async function setup(os) {
    // Register an SVG icon that must exist whether or not the program is running
    os.svg.global.load({ id: "myprog-icon", viewBox: "0 0 24 24", content: "<path .../>" });

    os.program.addInfo("myprog", {
        name: () => _("My Program"),          // () => _(...) thunk = picks up live language switches
        version: "1.0",
        owner: "Dev",
        description: () => _("Description"),
        icontype: "svg",
        icon: "#myprog-icon",
        taskbar: true,
        startmenu: true,
        desktop: true,
        multistart: false,                    // allow multiple instances
        autorun: false,                       // start at system boot
        main: "start",                        // which export is the entry point
        file: "myprog/myprog.js",             // lazy-loaded by app.program.open() on first launch
        root: "program",
        openWith: [                           // optional — file-type association (see below)
            { ext: "abc", icon: "#myprog-icon", icontype: "svg", label: "ABC File", thumbnail: false }
        ]
    });

    await os.language.loadProgram("myprog");   // loads program/myprog/lang/<code>.json
}
```

```javascript
// program/myprog/myprog.js
export function start(os) {
    const win = os.ui.windowStart("myprog", {
        id: "myprog-win",
        title: _("My Program"),
        windowIcon: true,
        resizable: true,
        width: "600px",
        height: "400px",
        menu: { /* optional menu structure */ },
        body: function () { /* return the window's UI definition */ }
    });
}
```

Register the program by adding its `setup.js` path to `index.html`'s `programs` list.

### File-type associations (`openWith` → `app.program.extInfo`)

`openWith` is the entire extensibility mechanism. For each entry, `program.js` automatically:

1. adds a handler to `app.program.fileHandlers[ext]` (what a double-click in Explorer looks up), and
2. writes `app.program.extInfo[ext]` (icon, label, `thumbnail` flag).

**Explorer never knows about specific file types or programs** — it only queries those two registries. A program that wants real image thumbnails for its file type just sets `thumbnail: true` on its `openWith` entry; Explorer needs no changes. Fotoviewer (see [ARKITEKTUR.md §17](ARKITEKTUR.md)) is the reference example.

### SVG resource manager (`app.svg`)

- **`app.svg.global.load(svg)`** — icons that must exist whether or not the program runs (a program's `icon`, system icons). Lives the whole OS session.
- **`app.svg.private.load(programId, svgOrList)`** / **`app.svg.private.unload(programId)`** — resources only needed while the program is running (e.g. tool icons in an open window). Auto-unloaded when the program's last window closes.
- All SVG ids share one global namespace — pick unique ids (prefix with the program name when in doubt).

## Backend integration

`sandstorm/components/api.js` provides the `ApiRequest` class with a timeout (default 40 000 ms), logging and chainable callbacks:

```javascript
os.api.get('/api/content', { id: 123 })
    .then(data => updateContent(data))
    .catch(err => console.error(err));

os.api.post('/api/save', { content: "text" })
    .then(response => showSuccess())
    .catch(err => showError(err));
```

REST-agnostic — works with PHP, .NET, Java or any REST backend.

## Theme system

CSS variables drive the entire look:

```css
--theme-backgroundColor        /* Main background */
--theme-fontcolor              /* Text color (default: white) */
--theme-backgroundcolorc       /* Semi-transparent background */
```

Set themes via the Control Panel or directly in `index.html`'s `user.settings.theme` configuration.

## Localization

Global `_()` function for translation. `os.language.set(code)` switches language live: open windows that registered via `registerRefresh()` are re-translated, and each program's `lang/<code>.json` is fetched on demand.

```javascript
name: () => _("Calculator")   // thunk — resolved at render time, picks up language switches
```

Wrap user-facing strings that are computed once at registration in a `() => _(...)` thunk, not a resolved string — a resolved string freezes to the boot language (see [ARKITEKTUR.md §5](ARKITEKTUR.md)).

## Installation and running

### Requirements
- Modern browser (Chrome, Firefox, Edge)
- A local web server (ES6 modules require HTTP)

### Quick start
```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# Then open http://localhost:8000
```

### Build
`combine.vbs` and `minify.vbs` generate a bundled/minified `dist/`. `sandstorm.gen.js` is **hand-written**, not a build output despite the name.

## Architecture principles

- **Front-end only** — no backend required, everything runs in the browser.
- **A program owns its own registration** — no central "list of image types"; programs declare themselves via `addInfo`/`openWith`, and shared systems read those registries.
- **`setup()` = boot-critical state, `start()` = lazy UI.**
- **Timeouts are a safety valve, not the flow** — the reactive path (MutationObserver, `await fetch`, `transitionend`) is what decides when something is done.
- **Frozen translation thunks are a recurring bug class** — defer `_()` to a `() => _(...)` thunk resolved at render time.
- **Teleported overlays** (menus, dropdowns, hover tags — `position:fixed` on `document.body`) need their own z-index and capture-phase outside-click handling.

See [ARKITEKTUR.md](ARKITEKTUR.md) for the full treatment of each of these.

## License

MIT License — see [LICENSE](LICENSE).
