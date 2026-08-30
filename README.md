# Sandstorm CMS/OS

Sandstorm is a web-based operating system and CMS GUI that simulates a desktop OS directly in the browser. It is a pure front-end framework built with ES6 modules, jQuery and a custom window-management system — no backend required.

For the detailed mechanics of *how* everything is wired together (boot sequence, window internals, the desktop shell, Explorer, Designer, per-program notes), see **[ARKITEKTUR.md](ARKITEKTUR.md)**. This file is the reference: what exists and how to use it.

---

## Technology stack

| Component | Technology |
|-----------|-----------|
| Core language | Vanilla JavaScript (ES6 modules) |
| DOM/events | jQuery 3.7.1 + jQuery UI |
| Touch support | jquery.ui.touch-punch |
| Drag sorting | Sortable.js |
| Styling | CSS variables (theme system) |
| Entry point | `index.html` → `sandstorm.gen.js` |
| Total | ~244 JS modules, ~4 MB source |

---

## File structure

```
├── index.html                  # Bootstrap configuration + startup sequence
├── sandstorm.gen.js            # Hand-written boot shield, loading screen, module loader, _() / printf()
├── svgs.js                     # SVG icon definitions
├── combine.vbs / minify.vbs    # Build scripts (generate dist/)
│
├── res/                        # Libraries & resources
│   ├── js/                     # jquery, jquery-ui, touch-punch, sortable
│   ├── css/jquery-ui/, fontawesome/, icons/
│
├── wallpaper/                  # Desktop backgrounds
│
├── sandstorm/
│   ├── basic.css               # Base stylesheet
│   ├── core/                   # modules.js (loader), security.js, utils.js
│   ├── state/store.js          # State store + app.setActiveWindow
│   ├── ui/css.js               # Runtime CSS injection (app.addCSS / addProgramCSS / setCSSVariable)
│   │
│   └── components/             # The OS core (see "Global API reference" below)
│       ├── load.js             # app.load.system — the three load lists; app.dom.waitFor; app.icons
│       ├── ui.js / ui.css      # app.ui — windows, dialogs, tabs, contextMenu, tooltip, slider, boxSelect, dragDrop, body
│       ├── api.js              # app.api — ApiRequest (HTTP/fetch wrapper, 40 s timeout)
│       ├── body.js             # DOM init + app.searchengine
│       ├── config.js           # app.config.get/set/has/update/remove (namespaced, in-memory)
│       ├── util.js             # app.util.escapeHtml / truncate / copyToClipboard
│       ├── desktop.js          # app.desktop — background, wake-up, context menus, cascade/responsive windows
│       ├── program.js          # app.program — lifecycle, addInfo, open, extInfo/fileHandlers, status
│       ├── menu.js             # app.ui.menu — menu-tree helpers
│       ├── language/           # os.language — live language switching
│       ├── historyManager.js   # app.historyManager — OS-level undo/redo sessions
│       ├── keynav.js           # Tab+S / Tab+M / Tab+I skip-navigation
│       ├── windowswitcher.js   # Hold-Shift+W 3D window carousel
│       ├── svg.js / svg-morph.js  # app.svg — global/private icon lifecycle
│       ├── fonts.js            # app.fonts.get/set/remove — shared font registry
│       ├── aichat.js           # AI Chat taskbar icon (UI shell only)
│       │
│       ├── ui/                 # Widgets: window/, caret.js, calendar.js, checkbox.js, radio.js,
│       │                       #   dropmenu.js, slider.js, tags.js, toggleWindow.js, sidopanel.js, capsLock.js
│       ├── widgets/input.js
│       ├── taskbar/            # Clock (digital/analog), overflow, show-desktop, FLIP icon sort
│       ├── startmenu/          # Tabs, search, running-apps panel
│       ├── search/             # os.search — apps / settings / commands / filesystem providers
│       ├── notifications/      # app.notifications.notify / dismiss / clear
│       ├── cursor/             # app.cursor — SVG cursor overlay, permission-gated
│       ├── login/              # os.login / os.session — login, lock screen, autologout
│       ├── controlpanel/       # 10 lazy-loaded panels (see below)
│       ├── explorer/           # app.explorer — file manager, virtual FS + RealStorage
│       ├── recyclebin/         # app.recyclebin — undo/redo-aware delete
│       ├── responsivelayout/   # Per-breakpoint grid arrangement + Snap Layout
│       └── networkmonitor/     # app.networkmonitor
│
└── program/                    # Applications
    ├── calc/          notepad/       gui/           solitaire/     mail/
    ├── formbuilder/   designer/      fotoviewer/    mediaplayer/   voiceinput/
```

---

## Startup sequence

`index.html` is the single source of truth for boot configuration. `sandstorm.gen.js` runs first (dark-flash shield, early `pointermove` capture for the cursor engine, loading screen, error-overlay, then bootstraps `sandstorm/core/modules.js`), which calls `app.load.system(config)`.

`app.load.system` takes **three lists with different timing guarantees** (see [ARKITEKTUR.md §1](ARKITEKTUR.md)):

| List | When | Semantics |
|---|---|---|
| `loadingScreen.systemfiles` | Sequentially, under the loading screen | Pure infrastructure (`ui.js`, `desktop.js`, `taskbar/*`, `keynav.js`, …). Array order == execution order. |
| `programs` | Sequentially, `await includeProgram()` each | Each program's `setup(os)` runs here, **before** any `start:` step. |
| `start` | Sequentially, one step at a time | The startup sequence. The login step **blocks the whole sequence** until a human logs in; `desktop.taskbar.build` is last. |

**Rule of thumb:** all boot-critical state (SVG icons, `program.addInfo`, `openWith`/`extInfo`) goes in `setup()`, which finishes before the desktop is shown. `start()` only draws a window and runs lazily on first open.

---

## Global API reference

Everything hangs off the global `app` object (aliased `os` inside program `setup`/`start`). Namespaces are locked read-only once built (`app.lock`).

### Core / loader

| Call | Purpose |
|---|---|
| `app.load.system(config)` | Boot the OS (see above). |
| `app.includeModule(path)` | Lazy-load a component module; resolves `null` on failure (never throws). |
| `app.includeProgram(path, root)` | Load a program and run its `setup()`. |
| `app.importFile(path, description)` / `app.isImported(...)` | Low-level module import + dedupe check. |
| `app.dom.waitFor(selector, {timeout})` | MutationObserver-based wait. `timeout:0` = wait forever; default 5000 ms is a safety valve. |
| `app.exists('app.some.path')` | Safe deep-property existence check. |
| `app.dev.log/warn/error(msg, tag)` | Console logging with engine-aware stack parsing. |
| `_("string")` / `printf("%s %d", …)` | Global translate + format helpers. |

### `app.ui` — windows, dialogs & widgets

| Call | Purpose |
|---|---|
| `app.ui.windowStart(programId, config)` | Open a program window (see **Window API** below). |
| `app.ui.windows` | Window lifecycle: open, close, minimize, maximize, restore, `basWindow`, `layer`. |
| `app.ui.alert({title, body, confirm, onConfirm, close, width, height})` | Modal alert. `body` may be a function or `message` a string. |
| `app.ui.confirm({title, body, confirm, cancel, onConfirm, onCancel, …})` | Modal yes/no. |
| `app.ui.prompt({title, body, onConfirm(value), …})` | Modal text input. |
| `app.ui.toggle.window(...)` | Status-icon / taskbar overlay panel factory. |
| `app.ui.tabs(config, tabsData)` | Tabbed container (re-runs `_()` per language switch). |
| `app.ui.contextMenu(selector, options)` | Attach a right-click menu to matching elements. |
| `app.ui.slider(options, target)` | Custom range slider. |
| `app.ui.boxSelect(section, itemSelector, onSelect, onMove, overflow)` | Rubber-band multi-select. |
| `app.ui.dragDrop(container, itemSelector, dropSelector, options)` | Cross-window drag & drop (Ctrl = copy). |
| `app.ui.body(nodeDef)` / `app.ui.renderHTML(node)` | Declarative layout → DOM (columns, panels, flex/grid, `{script}` nodes). |
| `app.ui.executeActions(node, event)` | Run a layout node's declared actions. |
| `app.ui.menu` | Menu-tree helpers (`add`, `remove`, submenu flyouts). |
| `app.ui.tooltip` | Custom tooltip replacing native `title`/`alt`. |
| `app.ui.check(config)` / `app.ui.radio(config)` | Styled checkbox / radio group (`.bind`, `.getValue`). |
| `app.ui.dropmenu(config)` | Rich dropdown (icon-prefixed trigger, HTML options). |
| `app.ui.tags` | Tag input with autocomplete. |
| `app.ui.caret` | Custom text-caret overlay (`saveState` / `restoreState` / `updatePosition`). |
| `app.ui.calendar` | Date picker (used by the Start-menu Calendar tab). |
| `app.ui.sidopanel(sections, options)` | Collapsible side panel. |
| `app.ui.capsLock.has(event)` | Caps-Lock detection for password fields. |
| `app.ui.label(text, forId, field)` / `app.ui.infoRow(id, label, val, keywords)` | Form-row helpers. |

### CSS / theme

| Call | Purpose |
|---|---|
| `app.addCSS(id, cssOrPath, isPath)` / `app.removeCSS(id)` | Session-lifetime stylesheet (dedupes by id — `removeCSS` first to replace). |
| `app.addProgramCSS(programId, id, css, path)` / `app.removeProgramCSS(programId)` | Auto-removed when the program's last window closes. |
| `app.setCSSVariable(name, value)` / `app.getCSSVariables(name)` / `app.removeCSSVariable(name)` | Live theme-variable control. |

### `app.program` — program lifecycle

| Call | Purpose |
|---|---|
| `app.program.addInfo(id, data)` | Register a program (metadata, icon, `openWith`). |
| `app.program.getInfo(id)` / `getMain(id)` | Read a program's live metadata / entry function. |
| `app.program.open(id, options)` | Launch (lazy-loads the window module on first call). |
| `app.program.exit(id)` / `onExit(id, fn)` | Close all windows / register a teardown hook. |
| `app.program.running/success/fail/abort/setStatus/getStatus(id)` | Progress/status signalling (drives the cursor "working" cue). |
| `app.program.fileHandlers` / `app.program.extInfo` | The registries Explorer reads for file-type icons & "open with". |
| `app.program.addFileMetaProvider(fn)` | Contribute extra file metadata. |
| `app.program.consumeContext(id)` | Pick up a file/argument handed to the program at launch. |

### Other namespaces

| Namespace | Key calls |
|---|---|
| `app.api` | `app.api.get(url, params)` / `app.api.post(url, body)` — `ApiRequest`, chainable `.then/.catch`, 40 s timeout, REST-agnostic. |
| `app.config` | `app.config.get/set/has/update/remove(namespace, key)` — in-memory only (use `localStorage` for persistence). |
| `app.svg` | `app.svg.global.load(svg)` (session-lifetime), `app.svg.private.load(programId, svg)` / `unload(programId)` (window-lifetime). |
| `app.historyManager` | `create(programId, {maxHistory})` → session with `execute(cmd)`, `undo()`, `redo()`, `clear()`, `canUndo/canRedo`. Also reached via `win.history`. |
| `app.fonts` | `get()` / `set(name, def)` / `remove(name)` — shared by Designer and Notepad. |
| `os.language` | `set(code, {silent})`, `get()`, `loadProgram(id)`, `registerRefresh(token, fn)` / `unregisterRefresh(token)`. Ships `en` + `sv`. |
| `os.search` | `query(text)` → ranked results across providers `apps` / `settings` / `commands` / `filesystem`; `registerProvider(name, {weight, search})`. |
| `app.notifications` | `notify({title, body, icon, priority, programId, actions})` — `priority:'critical'` bypasses `mode:'blocked'`; `dismiss(id)`, `clear()`. |
| `app.cursor` | `show()` / `hide()`, `enable/disable/isEnabled()`, `startWorking()` / `stopWorking()` (ref-counted), `lock()` / `unlock()` (pin a glyph), `follow(el)`, `set(id)` / `systemSet(id)`, `settings(partial)` / `getSettings()`, `register(def)`, `reset()`. Permission-gated per program. |
| `app.desktop` | `setBackgroundImage({image, size, repeat, position, blur})`, `wakeUp()`, `getWorkspaceRect()`, `cascadeWindows()`, `contextMenuInit(selector, options)`, `taskbar.*`, `startmenu.*` (incl. `startmenu.addTab(tabConfig)` — dock a program tab, see **Start-menu docking** below). |
| `app.desktop.aiChat` | `setActive()` / `setBadge()` / `setEnabled()` — drive the AI Chat taskbar icon's "thinking" pulse, badge and visibility (UI shell; no backend wired yet). |
| `app.explorer` | `open(path)`, `_fs` (virtual tree), `_getNode(path)`, `_refreshAll()`, `clipboard` (`copy/cut/paste`), `buildContextMenu(paths, opts)`, `icon.forEntry(entry)`, `metaPanel.register(widget)`, `rename`, `isImageExt(ext)`. |
| `app.shortcut` | `create({name, target})`, `update(path, data)`, `get(path)`, `remove(path)`, `launch(path)` — `.lnk`-style desktop/Explorer shortcuts. |
| `app.recyclebin` | `send(paths)` (undo/redo-aware), restore, empty. |
| `os.login` / `os.session` | `os.session.window.logoff()` (lock screen), `os.login.settings.get/set`, `os.login.restartIdleTimer()`, `os.login.pauseAutoLogout()`. |
| `app.util` | `escapeHtml(v)`, `truncate(v, maxLen)`, `copyToClipboard(v)`. |
| `app.setActiveWindow(windowId)` | Bring a window to the front. |
| `app.hasAccess(obj, action)` / `app.checkAccess(obj, action)` | Permission checks. |

---

## Design & visual language

Sandstorm's look is **glassmorphism** on a dark, theme-tinted ground — every floating surface (windows, dialogs, menus, context menus, dropdowns, the Start menu, the AI Chat panel) is a blurred, semi-transparent pane with a soft "Dark Bevel" edge.

### Glass surfaces

```css
.window {
    background: none;                                   /* the ::before pseudo carries the tint */
    backdrop-filter: blur(var(--theme-blur, 10px));     /* the glass blur */
    border-radius: var(--theme-borderradius, 12px);
    box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29;   /* Dark Bevel: light top/left, dark bottom/right */
    transition: opacity 1s, transform 1s, width 400ms, height 400ms;
}
.window::before {                                        /* diagonal gradient tint under the content */
    inset: 0;
    background: linear-gradient(144deg,
        var(--theme-backgruondcolora-o, rgba(37,37,37,.2)) 0%,
        var(--theme-backgruondcolorb-o, rgba(10,10,10,.2)) 47%);
}
```

### Theme variables

| Variable | Default | Set by |
|---|---|---|
| `--theme-blur` | `10px` | Control Panel → **Customize → Blur Background** slider (1–30 px); persisted in `user.settings.theme.blur` |
| `--theme-borderradius` | `12px` | `user.settings.theme.borderRadius` |
| `--theme-backgruondColorA`…`E` (+ `-o` opacity variants) | see `index.html` | `user.settings.theme` + JS-computed opacity variants |
| `--theme-opacity` / `--cursor-opacity` | `20` / — | Customize panel |
| `--theme-fontcolor` / `--theme-hovercolor` | `#fff` / `#ffc108` | Customize panel |

All are live-editable through `app.setCSSVariable(name, value)` (the Control Panel does exactly this; `desktop.js` seeds them at boot). A program should read/compose these rather than hard-coding colours, so it inherits the user's glass/opacity/blur settings automatically.

### CSS animations

- **`app.ui.animation(element, fadeClass = "fade-out")`** — adds a CSS transition class and resolves a Promise on `transitionend` (with a duration-based fallback). The canonical way to await a fade.
- **`app.ui.waitForTransitionEnd(element)`** — bare `transitionend` await with a safety-valve timeout.
- ~30 named `@keyframes` across the codebase: boot reveal (`fadeUpClock` / `fadeUpFields` / `fadeUpIcons`, `backgroundFade`), attention cues (`pulse`, `notif-badge-pulse`, `taskbar-bounce`, `modal-focus-pulse-kf`, `designer-dock-flash`), the cursor engine (`cursor-spin`, `cursor-idle-breathe`, `cursor-click-pulse`), spinners (`rotation`, `fv-spin`, `cp-panel-spin`), the AI "thinking" pulse (`ai-chat-pulse`), `caret-blink`, `float`, `slideFade`, …
- Windows fade/slide in on open, animate size on resize, and FLIP-animate icon reordering — always driven by a real `transition`/`complete` callback, never a guessed `setTimeout` (see [ARKITEKTUR.md](ARKITEKTUR.md) "A CSS transition's end state can be stale…").

---

## Window API

```javascript
// program/myprog/myprog.js
export function start(os) {
    const win = os.ui.windowStart("myprog", {
        id: "myprog-win",              // required
        title: _("My Program"),        // required
        width: "600px",                // required
        height: "400px",               // required
        body: function (win) { … },    // required — HTML string OR os.ui.body() layout def

        windowIcon: true,
        resizable: true,
        minWidth: "320px", minHeight: "200px",
        controls: { minimize: true, maximize: true, close: true },
        mode: "normal",                // or "maximized"
        left: "center", top: "center", // center / left / right / top / bottom / px value
        single: false,                 // true = part of a tab group

        menu: {
            [_("File")]: { children: {
                [_("Open")]: { click: () => exec("open"), shortcut: "Ctrl+O" },
                "---": {},                       // separator
                [_("Exit")]: { click: () => exec("exit") }
            }},
            options: { position: "window-title" } // merge menu into the title bar
        }
    });
}
```

- **History (undo/redo):** `win.history` gives the program a `historyManager` session. Opt into per-window scope with `historyScope:'private'` in `addInfo`; `historyOnExit:'clear'|'keep'` for the shared scope.
- **Dialogs** (`app.ui.alert` / `confirm` / `prompt`) are modal — they lock their parent window behind a dimmed overlay and follow it when it moves.
- **Language:** most imperative windows call `os.language.registerRefresh(token, fn)` for at least the title; menus/status bars built once at `windowStart()` are frozen unless rebuilt (see [ARKITEKTUR.md §5](ARKITEKTUR.md)).

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `S` + `M` | Toggle Start menu |
| `S` + `C` / `S` + `S` / `S` + `T` | Control Panel → Customize / Settings / Task Manager |
| `S` + `U` | Refresh desktop icons |
| **Hold `Tab`** + `S` / `M` / `I` | Jump to: Start-menu search / active window's menu bar / active window's first content field |
| **Hold `Shift`** + `W` | Window switcher (3D carousel); `←`/`→` to cycle, release to commit, `Esc` to cancel |
| **Hold `W`** + `←` / `→` | Snap active window to left / right half |
| **Hold `W`** + `↑` / `↓` | Maximize / restore-or-unsnap-or-minimize |
| **Hold `W`** + `1`–`9` | Direct snap (numpad layout: `7`=top-left ¼ … `5`/`8`=maximize … `2`=restore) |
| `W` + `←`+`↑` etc. | Corner quarters via arrow chords |

Snapping is disabled while `Shift` is held, when the Snap Layout toggle is off (Control Panel), or below the tablet breakpoint. Program windows add their own (e.g. Ctrl+Z/Y, Ctrl+F in Notepad).

---

## Applications

### Calculator (`program/calc/`)
`270×380` window, `multistart`. Full keyboard support (`0–9 + - * / . Enter Backspace Esc`), special-function keys (sin, cos, √, …).

### Notepad (`program/notepad/`)
`multistart`, tabbed (all tabs share one `<textarea>` — a deliberate undo-history trade-off). Menus:
- **File:** Open · Save · Save As · Print layout · Print · Exit
- **Edit:** Undo · Redo · Cut · Copy · Paste · Find · Find next · Replace · Font
- **View:** Status bar · About · Help

Font list comes from the shared `app.fonts` registry (same as Designer). Registers `.txt` / `.md` / `.log` handlers and a "New Text File" entry in Explorer's New submenu.

### GUI showcase (`program/gui/`)
Interactive reference of every layout component: buttons, inputs, checkboxes, radios, flexbox layout, grid layout, panels. Read-only, `multistart`.

### Solitaire (`program/solitaire/`)
Klondike, `category:"game"`, resizable, discrete size tiers (center pips hidden at the smallest). Menu:
- **Game:** New Game · Deal · Undo · Hint 💡 · High Scores 🏆 · Options (Draw One / Draw Three / Choose Deck)
- **Help:** Rules · About

8 card-back designs (deck 1 is a CSS fallback; 2–8 are pure CSS patterns). Full undo/redo via `app.historyManager`.

### Mail (`program/mail/`)
`multistart`, `columns` layout that reflows compact/mobile on **window** width (ResizeObserver, not `@media`). Folders (Inbox, Drafts, Sent), Compose, Contacts. `app.mail._api` (`listEmails`, `sendEmail`, `markRead`, `toggleStar`, optimistic cache) is also used by the Start-menu Email tab. Local `sendEmail` fallback escapes the body before wrapping in `<p>`.

### Form Builder (`program/formbuilder/`)
`1100×800` resizable, jQuery-based form designer. Dialog bodies rebuild from scratch each open.

### Designer (`program/designer/`) — the big one, `autorun:true`
A full page-builder (see [ARKITEKTUR.md §18](ARKITEKTUR.md)):
- **Object model** — `Document` / `Node` tree, `core/parser.js` (load/serialize), `core/registry.js` (block types: container, layout, image, button, form, text, custom, splitter).
- **Style engine** — `core/style.js` `buildStyle()` + Style Binding (`core/stylesheet.js`): a cascade where `.class` / `#id` rules merge under a node's inline style; rule identity is `(selector, state, breakpoint)`.
- **Colour** — `core/color.js` (full sRGB↔CIE-Lab pipeline, gamut-clipped; subtractive CMYK approximation), history strip, Photoshop-style stacked FG/BG swatches, standalone advanced picker, native `EyeDropper` pickup tool.
- **Tools** — Select · Split (rows/columns, in-place, "Add Pane" vs nest) · Resize (px & flex-% dual model) · Move · Text. Gated by `rules/element_capabilities.js`.
- **Dock panels** — Properties, Box model (Box/Position/Text/Gradients/Patterns tabs), Layers/Elements, Groups (6 tabs), History; drag-reorder + resizable.
- **Chrome** — pixel rulers with draggable guides, device-mode presets, hidden-scrollbar canvas, tab bar, floating hover/selection tags (`position:fixed` on `body`).

### Fotoviewer (`program/fotoviewer/`)
`multistart`. Toolbar: Previous · Play Slideshow / Pause · Next · Zoom In / Out · Fit to Window · Properties · Menu (Open File / Open Folder). Declares itself into Explorer for 11 image extensions (thumbnails for a subset — `.svg`/`.tiff` excluded). Accepts drag-drops from Explorer. **This is the reference example of the `openWith` extensibility model.**

### Media Player (`program/mediaplayer/`)
`multistart`, mp3 / mp4 / m3u. Context menu: Open/Add File · Open Folder · Close Media · Play/Pause · Stop · Next · Previous · Repeat · Shuffle. A session-lifetime status-icon overlay panel (works with no player window open) and a compact audio widget in Explorer's meta panel.

### Voice Input (`program/voiceinput/`)
A short-lived `app.ui.toggle.window()` overlay for speech input — no persistent window.

---

## System components

| Component | Details |
|---|---|
| **Taskbar** (`taskbar/`) | Clock — digital, or analog when `.tasks` overflows (rendered at `devicePixelRatio`); task icons with overflow menu; **Show Desktop** strip (restores exactly what it minimized); FLIP-animated icon reordering; per-side layout (bottom/top/left/right). |
| **Start menu** (`startmenu/`) | Tabs: **Apps** (paged grid), **Email**, **Calendar** (daily schedule + `calendarAddEvent`), **Widgets**, **Settings**, **Account**, **Updates**. Built-in search box (grid keyboard nav). "Apps running" panel with a hide-all button. |
| **Search** (`search/`) | `os.search.query()` across 4 weighted providers: `apps` (20), `settings` (15), `commands` (10), `filesystem` (0). Hand-maintained alias table + tiered fuzzy matching (whole-word + initial-substring). Backs both the Start-menu and Control-Panel search fields. |
| **Notifications** (`notifications/`) | `#timeDisplay` (the clock) is the trigger + badge host. Per-program routing (`'own'` surface → falls back to the clock); `priority:'critical'` always shows. |
| **Cursor Engine** (`cursor/`) | SVG overlay replacing the native pointer. Permission-gated per program (`isSystemProgram` does *not* trust component-owner dialogs). Working/busy ring, follow mode, trail effect, accent-colour theming, boot-position seeding from an early `pointermove` capture. Two Control Panel tiles. |
| **Login** (`login/`) | Login screen (blocks boot until authenticated), lock screen (`os.session.window.logoff()`), autologout on inactivity (`index.html` `autoLogout` — distinct from the Control Panel lock timeout, which only re-shows login). Preloads the icon font via the Font Loading API. |
| **Control Panel** (`controlpanel/`) | 10 lazy-loaded panels: **core** (general), **customized** (wallpaper/personalisation), **cursor**, **notifications**, **program** (per-program config), **responsivelayout**, **security**, **system**, **update**, **users** (avatars — multi-layered data-URI validation). Sidebar collapses to icon-rail then drawer on width. |
| **Explorer** (`explorer/`) | Two layers: boot-critical `setup/*` (always runs) + lazy `window/*` (on open, `multistart`). In-memory tree from `filesystem.json` **plus** a real `/RealStorage` backend (list/read/write/delete, lazy-loaded per folder). Rich row menu (Open With, Paste, Select All) vs the shared boot-safe `buildContextMenu` used by desktop icons. Scoped search (current folder + subfolders), image thumbnails, animated 3-layer folder icons, cross-window & Explorer→Desktop drag-drop. |
| **Recycle Bin** (`recyclebin/`) | `app.recyclebin.send(paths)` — undo/redo-aware delete (shared `doDelete` for `do`/`redo`). |
| **Responsive Window Layout** (`responsivelayout/`) | Admin-controlled per-breakpoint-tier grid arrangement (max-columns cap, per-tier toggle) **+** the drag-to-edge Snap Layout (own gate — 20/60/20 corner band, Shift override). |
| **Network Monitor** (`networkmonitor/`) | `app.networkmonitor` — connection status widget. |

---

## Program structure

Each program has a `setup.js` (boot-time registration) and a separate lazy window module:

```javascript
// program/myprog/setup.js
export async function setup(os) {
    os.svg.global.load({ id: "myprog-icon", viewBox: "0 0 24 24", content: "<path .../>" });

    os.program.addInfo("myprog", {
        name: () => _("My Program"),          // () => _(...) thunk = picks up live language switches
        version: "1.0",
        owner: "Dev",
        description: () => _("Description"),
        icontype: "svg",  icon: "#myprog-icon",
        taskbar: true,  startmenu: true,  desktop: true,
        multistart: false,                    // allow multiple instances
        autorun: false,                       // start at OS boot
        category: "game",                     // optional — currently only autologout reads it
        historyScope: "public",               // or "private"; historyOnExit: "clear" | "keep"
        main: "start",                        // which export is the entry point
        file: "myprog/myprog.js",             // lazy-loaded by app.program.open() on first launch
        root: "program",
        openWith: [
            { ext: "abc", icon: "#myprog-icon", icontype: "svg", label: "ABC File", thumbnail: false }
        ]
    });

    await os.language.loadProgram("myprog");   // program/myprog/lang/<code>.json (folder name, not id!)
}
```

Register the program by adding its `setup.js` path to `index.html`'s `programs` list.

### File-type associations (`openWith` → `app.program.extInfo`)

`openWith` is the entire extensibility mechanism. Per entry, `program.js` automatically:

1. adds a handler to `app.program.fileHandlers[ext]` (what a double-click in Explorer looks up), and
2. writes `app.program.extInfo[ext]` (icon, label, `thumbnail` flag).

**Explorer / Media Player never know about specific file types or programs** — they only query those two registries. Set `thumbnail: true` on an `openWith` entry to get real `<img>` thumbnails in Explorer's rows, grid and meta panel with no Explorer changes. Fotoviewer (see [ARKITEKTUR.md §17](ARKITEKTUR.md)) is the reference.

### Start-menu docking (`app.desktop.startmenu.addTab`)

A program can dock its own tab into the Start menu — it sits alongside the shell's own tabs (**Apps · Email · Calendar · Widgets · Account · Settings · Updates**). Same principle as `openWith`: the program hands the shell a config object, the shell renders it.

```javascript
// in the program (returns a tab config), then a helper in startmenu/tabs.js calls addTab():
app.desktop.startmenu.addTab({
    id:       "myprog",
    title:    () => _("My Panel"),
    icon:     "#myprog-icon",
    icontype: "svg",
    tab:      function () { return "<div>…live panel content…</div>"; }   // rebuilt each language switch
});
```

Requires `title` + `icon` + `icontype`. Each `tab()` runs at render time (so `_()` follows language switches). **Mail is the reference:** `createEmailTab()` in `startmenu/tabs.js` calls `app.mail.startMenuEmailTab()` and `addTab()`s the result — the docked Email tab reuses the same `app.mail._api` instance as the full Mail window. The Calendar tab (`createCalendarTab(config)`) and the system tabs (Widgets / Account / Settings / Updates, appended by `extendsTabs()`) work the same way.

The shell also exposes the AI Chat panel (`app.desktop.aiChat`), the Media Player status-overlay panel, and the Responsive Window Layout — a docked tab shares the Start-menu glass surface and search box with all of them.

---

## Backend integration

`app.api` (`ApiRequest`, `sandstorm/components/api.js`) — 40 000 ms default timeout, logging, chainable callbacks:

```javascript
os.api.get('/api/content', { id: 123 })
    .then(data => updateContent(data))
    .catch(err => console.error(err));

os.api.post('/api/save', { content: "text" })
    .then(() => showSuccess())
    .catch(err => showError(err));
```

REST-agnostic — works with PHP, .NET, Java or any REST backend. `config.local.jsapiLink` in `sandstorm.gen.js` points at an optional JSAPI gateway.

---

## Theme system

CSS variables drive the entire look — `index.html`'s `user.settings.theme` seeds them at boot, the Control Panel (**Customize**) edits them live via `app.setCSSVariable`, and every glass surface reads them. See **[Design & visual language](#design--visual-language)** above for the variable table (`--theme-blur`, `--theme-borderradius`, the `--theme-backgruondColorA…E` tint scale, `--theme-opacity`, `--cursor-opacity`) and the glassmorphism / animation model.

---

## Localization

Global `_()` translates via `translations[lang][key]`; `printf("%s / %d", …)` formats. `os.language.set(code)` switches live: windows that registered via `registerRefresh()` are re-translated, and each program's `lang/<code>.json` is fetched on demand. Ships `en` (default) + `sv`.

```javascript
name: () => _("Calculator")   // thunk — resolved at render time, follows language switches
```

Wrap strings computed once at registration in a `() => _(...)` thunk — a resolved string freezes to the boot language ("frozen translation thunk" bug class, [ARKITEKTUR.md §5](ARKITEKTUR.md)).

---

## Installation and running

**Requirements:** a modern browser + a local web server (ES6 modules need HTTP).

```bash
python -m http.server 8000      # or:  npx serve .
# then open http://localhost:8000
```

**Build:** `combine.vbs` + `minify.vbs` generate a bundled/minified `dist/`. `sandstorm.gen.js` is **hand-written**, not a build output despite the name.

---

## Architecture principles

- **Front-end only** — no backend required, everything runs in the browser.
- **A program owns its own registration** — no central "list of image types"; programs declare themselves via `addInfo`/`openWith`, shared systems read the registries.
- **`setup()` = boot-critical state, `start()` = lazy UI.**
- **Timeouts are a safety valve, not the flow** — the reactive path (MutationObserver, `await fetch`, `transitionend`) decides when something is done.
- **Frozen translation thunks are a recurring bug class** — defer `_()` to a `() => _(...)` thunk resolved at render time.
- **A `forEach` over independent consumers needs per-item `try/catch`** — one bad registration must not silently skip the rest.
- **Teleported overlays** (menus, dropdowns, hover tags — `position:fixed` on `document.body`) need their own z-index and capture-phase outside-click handling.
- **A CSS transition's end state can be stale in the same tick it starts** — read the known JS value or wait for `transitionend`.

See **[ARKITEKTUR.md](ARKITEKTUR.md)** for the full treatment of each of these, layer by layer.

---

## License

MIT License — see [LICENSE](LICENSE).
