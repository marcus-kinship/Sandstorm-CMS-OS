# Sandstorm — technical architecture

This is a technical reference for how the project actually fits together: the boot sequence, the window/program system, the desktop shell (taskbar, Start menu, search, notifications, cursor, login, Control Panel), Explorer, Designer and the smaller programs. `README.md` is the high-level introduction; this document describes the mechanics.

---

## 1. The OS layer

### The entry-point chain

```
index.html
  └─ <script src="sandstorm.gen.js">   ← boot shield, loading screen, module loader
       └─ s(async function(app) { await app.load.system({...}) })
            └─ sandstorm/components/load.js  (system orchestration)
```

`sandstorm.gen.js` is **not** a generated build artifact despite the name — it is a hand-written file (confirmed: `combine.vbs` never references it). It does several things synchronously before anything else loads:

1. Injects a dark `<style>` (`html,body{background:#000}`) so you never see a white flash before boot starts.
2. Registers a `pointermove` listener (`globalThis.__sandstormBootMouse`) even before the module loader starts. The Cursor Engine loads late (after `svg.js`/`svg-morph.js`), and without this early tracking it has no way of knowing where the pointer actually is if the mouse hasn't moved since page load — it would otherwise start from a hard-coded `(0,0)` and visibly glide in from the corner on the first mouse move (see section 10).
3. Sets up its own loading screen on `DOMContentLoaded` that deliberately reuses the same ids/classes as `load.js`'s `setLoadingScreen`/`removeLoadingScreen` — the latter then simply skips (the overlay already exists) and cleans up normally with no double work.
4. `showErrorOverlay()` (the boot-error screen) fades in via a double-`requestAnimationFrame` pattern before `opacity` is set to `1` — a same-tick change does not reliably trigger the CSS transition because the browser hasn't committed the initial value `opacity:0`. Without this the overlay popped in instantly while `removeErrorOverlay()` still faded it out, a visible asymmetry.
5. Bootstraps the module loader (`sandstorm/core/modules.js`) via a dynamic `import()`.

`config.local.jsapiLink: "/demo/api/jsapi"` is deliberately an absolute path, not base-relative: the JSAPI gateway lives under `site/demo/` in the surrounding Kinship PHP app, an entirely different top-level path from this static demo-OS clone's own root (which `base` otherwise correctly points at). The `breakpoints` object's three fields are consumed in different places: `mobile` (700) by window layout in `desktop.js`/`window.js`, `tablet` (1024) by tablet mode in `desktop.js`, `taskbar` (705) by the taskbar/Start-menu mobile switch in `taskbar/index.js`.

`dev._parseStack()` handles two stack-trace formats depending on the JS engine: V8 (Chrome/Edge/Node) has an `"Error"` header line followed by lines starting with `"at "`; SpiderMonkey (Firefox)/JSC (Safari) already has a frame line directly. The call chain `_parseStack → log/warn/error → caller` decides which line index (3 and 2 respectively) is actually the caller's frame.

### `load.js` — three separate lists, three different timing guarantees

`app.load.system(config)` takes three lists that are **not** interchangeable:

| List | Runs | Semantics |
|---|---|---|
| `loadingScreen.systemfiles` | Sequentially, synchronous per file, under the loading screen | Pure infrastructure (`ui.js`, `desktop.js`, `taskbar/*.js` …). Often runs side-effecting code at module top level (e.g. `desktop.js` calls `app.svg.global.load()` directly) — so the order in the array must match the execution order exactly. |
| `programs` (= `loadingScreen.programs` + top-level `config.programs` merged) | Sequentially, `await app.includeProgram(path, root)` per program | Each program's `setup(os)` runs here, **before** `start:` ever begins. That is why `notifications/setup.js`'s `os.dom.waitFor('#timeDisplay')` call must wait *event-based* (`timeout: 0`) — `#timeDisplay` is not created until the last step of `start:`, much later (see section 9). |
| `start` (from `index.html`) | Sequentially, one step at a time, can contain `{loginProgram}` | The login step **blocks the entire sequence** until a real human logs in (`os.dom.waitFor`/`loginPromise`) — `desktop.taskbar.build` (which creates `#timeDisplay`) is the last step here. |

Practical consequence: **all boot-critical state a program needs (SVG icons, `program.addInfo`, `extInfo` registration) must be set in `setup()`**, because `setup()` is guaranteed to finish before the `start:` sequence (and thus the desktop) is ever shown. `start()` is only for actually drawing a window — it runs lazily, the first time the user opens the program. Explorer's `setup/*` modules and Media Player's status-icon registration (sections 17 and 21 respectively) are concrete examples of this pattern.

### `app.dom.waitFor(selector, {timeout})`

A generic MutationObserver-based wait, defined in `load.js`. The default timeout of 5000ms is a **safety valve**, not the primary flow — the wait itself is always reactive (observer), the timeout only decides when it gives up and resolves `null`. `{timeout: 0}` = wait forever, only use when the element is *guaranteed* to appear sooner or later (e.g. after a login screen that takes an indeterminate time) — see notifications (section 9) for the real bug a bounded timeout caused here.

---

## 2. The program system (`program.js`)

Every app/system part registers itself via `os.program.addInfo(id, {...})`. The fields that matter for how the program shows up in the rest of the system:

```js
os.program.addInfo("fotoviewer", {
    name, version, owner, description,
    icontype: "svg", icon: "#ic-fotoviewer",
    taskbar: false, startmenu: true, desktop: false,
    multistart: true,        // multiple simultaneous windows allowed
    autorun: false,          // start automatically at boot
    main: "start",           // which export is the entry point
    file: "fotoviewer/fotoviewer.js",  // lazy-loaded only at app.program.open()
    root: "program",
    category: "game",        // optional — currently only consumed by autologout, see section 11
    historyOnExit: "clear",  // see section 3, history scope
    openWith: [...]          // see below — this is the whole extensibility mechanism
});
```

`name`/`description` can be passed either as a plain string or as a `() => _(...)` thunk. `addInfo()` turns the thunk case into a live getter — anything that reads `app.program.getInfo(id).name` fresh on every render (the Start menu's Apps tab, Explorer's `extInfo` labels, …) picks up a later language switch automatically. The one exception is `taskbar/addtotaskbar.js`'s `addProgramsToTaskbar()`, which runs once at boot and bakes `program.name` in as plain text in a separate `config.taskIcons` entry — the same staleness as `desktop/icons.js`'s icon labels, see section 5 (The language system) for the full list of similar places.

### `openWith` → `app.program.extInfo` (the important part)

`openWith` is an array of `{ ext, icon, icontype, label, description, thumbnail }`. `program.js`'s `addInfo()` reads it and does **two things per entry** automatically:

1. Adds a handler to `app.program.fileHandlers[ext]` — this is what a double-click on a file in Explorer actually looks up (`rowMenu`/`openFile` in `explorer/window/core.js`).
2. Writes `app.program.extInfo[ext] = { programId, icon, icontype, label, description, thumbnail }`.

**Explorer never knows about specific file extensions or programs.** It only asks `app.program.extInfo[ext]` for "which icon belongs to this file type" and `app.program.fileHandlers[ext]` for "which programs can open this". It is programs (like Fotoviewer, section 18) that declare themselves into those registries — not the other way around. The same pattern applies to Media Player for mp3/mp4/m3u.

---

## 3. Window management (`ui/window/*`)

`window.js` is a 1-line entry that imports the split-up implementation in `sandstorm/components/ui/window/{state,lifecycle,dragresize,menu-body,element,dialogs,index}.js` (`window-element.js`/`window-events.js` were previously orphaned duplicates of the same code and have been merged here). This section covers the whole lifecycle: creation, dialogs, minimize/maximize, drag/resize and snap.

### Creation and closing (`dialogs.js`)

`windowStart()`/`basWindow()` set `taskId` to just the program id (never a per-window suffixed id), because `addToTaskbar()` always registers the taskbar icon as `#pid-${id}-task` regardless of `single` mode — a suffixed taskId would never match an existing icon and would silently break minimization (`animateWindowToTaskbar` aborts with "Window or taskbar icon not found." without hiding the window).

`historyScope:'private'` (opt-in via `os.program.addInfo`) keys a window's undo/redo session on `windowId` instead of `programId` — unlike the public default scope, the session is freed as soon as THIS window closes, not only when the program's last window is gone. `historyOnExit:'clear'` (default, only applies to `'public'` scope) frees the shared session when the last window closes; `'keep'` lets it stay in `app.historyManager` so it resumes if the program is opened again. `windowStart()`'s private branch creates its session itself (`program.js`'s `open()` already created the public one, before `windowId` even existed) — idempotent, and `WindowElement`'s `history` getter picks windowId vs programId based on the same flag.

The fade-in animation's `complete` callback (not a guessed frame count) is the only thing that releases the cursor's "progress" state (`app.cursor.startWorking()`/`stopWorking()`, see section 10) — jQuery's `complete` IS the single source of truth for "the window is now actually visible", regardless of the `delay(10)` queue or how long the animation actually took. `stopWorking()` is reference-counted, so a single call is enough.

`alert()`/`confirm()` previously had the already-noted "message: bug": only `options.body` as a function was ever read, so every call site in the whole app that passed `message:` as a plain string rendered an empty dialog body — now fixed centrally, and the string is escaped since it is always status text, never intentional markup. The same dialogs' `.window.d-msgwin` CSS reflows via a container query, not a viewport `@media` query — these dialogs often open inside a scaled/embedded viewport where `window.innerWidth` does not reflect the actual rendered width. `prompt()`'s default height was raised to `230px` (from a previously too-short `180px`) after measuring the actual content (~171px + ~20px title-row chrome); its colors are set explicitly because `prompt()`, unlike `alert()`, never injects its own stylesheet. The `prompt()` window is closed via an explicitly looked-up `windowId`/`programId` (derived from the clicked button's `.window` parent) instead of `closeActiveWindow()`, which otherwise risks closing the wrong window if a calling window regains focus via bubbling right after the prompt opened.

### `window-modal.js` — locked dialogs

`lockWindowLayer()` saves/blurs the text caret (it is `position:fixed` and otherwise visible on top of the overlay), fades in the overlay and dialog simultaneously via double-`requestAnimationFrame` (the same browser trick as the error overlay in section 1), and sets the overlay's initial `opacity:0` with `!important` so no external CSS can override it. The taskbar icon for the dialog is only hidden when it is the program's ONLY window — otherwise it would wrongly hide the icon for a simultaneously open main window of the same program. Two "stale state guard" checks in `openDialog()` (parent thinks it has a dialog that is gone, and dialog thinks it belongs to a parent that is gone respectively) restore the link via `_destroyDialogLink` instead of crashing.

### `lifecycle.js` — minimize, maximize, close

A minimized or closed window ceases to own its snap quarter/half area (see snap-zones below) so a new drag toward that edge sees the spot as free. Minimization always goes via `animateWindowToTaskbar` (even in `instant` mode, which just skips the visible tween) because it computes position/state data that the restore path depends on.

`maximize()` returns early if the window has a locked modal dialog (`app.windows.getWindowState(windowId).dialogOpen`). Background: `pauseResize`/`pauseDrag` (window-modal.js) only disable jQuery UI's drag/resize handles — but maximize/restore is an entirely separate code path (title-bar button AND context-menu row, both routed here) that was never protected the same way. Without this guard, maximizing the parent moved size/position in the middle of an open dialog, while the darkened overlay's bounds tracking (`_updateOverlayBounds`) only follows the PARENT — the dialog itself was left exactly where it was, stranded without reaching its OK/Cancel buttons. On re-maximize `windowElement.data('snap.slots', null)` is also nulled explicitly, otherwise `dragresize.js`'s snap reflow keeps forcing the window back into its old quarter/half area after un-maximizing; size/position is saved as RAW inline style (not computed style) before maximizing, and the restored size on un-maximize deliberately reads the saved `win.width`/`win.height` value instead of re-measuring live (see the memory note "Maximize restore stale-read bug" — a live read races the CSS transition).

### `dragresize.js` — "home" position, snap and performance

This is the most comment-dense file in the original codebase; a single architectural mechanism was previously explained in five different places. Summarized:

**The "home" position system** (`natural-left`/`natural-top` data attributes): `position()` sets them to the spot that `adjust()` clamps FROM and returns TO as soon as there is room again, on every browser resize. Every user-driven drag/resize updates them to the new spot — including after a snap, when they are set to the snapped rectangle. By always clamping from "home" (not the window's current screen position), a previously shrunk window finds its way back to where the user left it when the browser is enlarged again.

**Snap-slot cleanup**: when a window starts being dragged or maximized, its snap zone is freed (`snapZones.clearWindowFromAllZones`) and `snap.slots` is nulled — otherwise `adjust()`'s reflow keeps forcing it back. `commitSnap` re-sets `snap.slots` on a new snap.

**Snap preview during drag**: the whole snap system (incl. top-edge maximize-via-drag) is blocked by Shift, by the Snap Layout toggle (Control Panel, section 12/15), or by a viewport below the tablet breakpoint. Left/right zones are checked BEFORE the top zone — a corner near both a side AND the top must resolve to the side's zone, otherwise it is cut off by a top/maximize preview. The ghost layer's target rectangle is created/updated when the RESOLVED TARGET changes, not just the side, because `resolveSnapTarget`'s corner/center banding is independent of which side you are on. The ghost layer uses `box-sizing:border-box` (otherwise padding is added on top of the exact width/height `setTimeout` sets, and the ghost spills out under the taskbar); the hint text sits in a shared dark "pill" behind both rows because the ghost itself is a light semi-transparent layer (dark text + light shadow was hard to read against dark content). The target rectangle is snapshotted at the same tick that decided to (re)create the layer, because `snapTarget` is an outer closure variable that later drag ticks keep re-assigning.

**Resize performance** (`addResizeListener`): rAF-throttled, NOT debounced. A debounce only recomputes every N ms while the edge is dragged, so a window animated with a CSS transition (fixed duration) chases a target that keeps changing before it gets there — it stutters regardless of the drag speed. Running on every frame and applying the position instantly makes the window's movement speed identical to the resize's own, with no independent animation length to fall out of sync with.

**A locked dialog "comes along"**: a locked dialog is never clamped directly in the loop — it is moved by the PARENT's own branch, with exactly the same delta the parent is clamped with (otherwise they drift apart, or a pair is left stranded off-screen after a shrink). The overlay is synced explicitly here (`app.windows.setOverlayBounds`) instead of its own MutationObserver path, which races the parent's position transition. Snapped windows had a bug risk: their size is an absolute pixel rectangle set at snap time, and "clamp from home" only touches left/top — without recomputing from saved slots against the current work area, a snapped window would get stuck in its snap-time size forever.

### `snap-zones.js` and `index.js` — commit and keyboard

`CORNER_BAND = 0.2`: the top/bottom 20% of the work area count as "corner" (→ quarter), the middle 60% as "middle" (→ half) — a 20/60/20 split explicitly requested by the user over an even 33/33/33, so an ordinary half is easy to hit while quarters require a deliberate corner aim. `commitSnap()` runs `windowElement.removeClass('maximized')` explicitly: a window that jumps straight from maximized to half/quarter via the keyboard shortcut (`snapQuarter`/`snapHalf` in `index.js`) never goes through `lifecycle.js`'s own maximize-toggle-off, and `dragresize.js`'s `adjust()` checks `.hasClass('maximized')` FIRST — without this the window would silently snap back to fullscreen on the next resize/reflow despite the rectangle having just changed correctly.

`snapMaximize()`: already half-snapped → escalate to that side's own upper quarter; floating or already quarter → maximize. `snapRestore()`: a snapped window has no saved pre-snap floating rectangle to return to (only the maximize/restore pair saves such a thing) — un-snap leaves it floating at its current size; a second W+Down falls through to minimization. The keydown handler for W+1-9 fixed a real bug report ("w + 1-9 doesn't work"): `event.code` only matches a physical numpad key, which most laptop keyboards lack — `e.key` is already the digit string "1".."9" for both the top row AND numpad-with-NumLock-on, so it is checked directly; the `event.code` fallback is only needed for numpad-without-NumLock.

One remaining, unfixed bug (out of scope for that refactoring): `app.lock("ui.window.*", ...)` targets the singular string `"ui.window.*"`, but the object being built is `app.ui.windows` (plural) — the wildcard lookup therefore likely never matches anything and silently no-ops.

### `menu-body.js` — floating submenus

Submenus are teleported to `document.body` (`position:fixed`) when opened, to escape the window's `overflow:hidden`/CSS transform — `openSubmenus` is a `Set`, `submenu._menuParent` saves the original parent for re-attachment on close. The module's CSS for the floating mode is injected ONCE at module load (not per window), because `ui.css`'s original selectors don't match when the element leaves the window's DOM tree — a previous parallel pure-CSS `:hover > .submenu { display:block }` rule was removed entirely (see section 4) because it toggled `display:block` immediately on native hover, before JS had repositioned the submenu, showing it for one frame at the wrong screen position.

The `menuInteractionLocked` flag has a root-cause investigation behind it: clicking a leaf option that opens a new dialog window shifts the layout enough that the browser re-fires a native `mouseenter` on the original menu item (the pointer never actually moved) — which re-runs `showSubmenu()` and re-opens a submenu `hideAllSubmenus()` just closed. The flag blocks the nested mouseenter handler for the duration of the click command plus two animation frames. The menu items' click wiring is wrapped in per-item `try/catch`: a synchronous error while wiring ONE option would otherwise propagate out of `forEach` and silently abort the whole loop, so every subsequent option (in DOM order) is left without a listener — the same pattern as `renderActive()`'s per-hook try/catch in Designer (section 19). Clicking a menu row calls `app.setActiveWindow(winId)` explicitly because `e.stopPropagation()` (necessary against the document-level outside-click closer) prevents the click from bubbling to the window's own focus handler — without this a click in a non-active window does not bring that window to the front.

In `ui.css`: `menu.options.position:'window-title'` (the menu row merged with the title row) has its own rules: the title shrinks to its own content so the menu gets the remaining space; the usual `.wm-menu` semi-transparent background box (correct for normal top/bottom/left/right modes) is specifically excluded in window-title mode, where it would otherwise read as a redundant rectangle in an already semi-transparent title row; the same `.menu-container` moves to `.control-menu` on overflow and then switches layout from a horizontal row to a vertical list.

---

## 4. Shared UI components (`sandstorm/components/ui/*.js`)

A number of standalone widgets are used throughout the system:

**`calendar.js`**: `months`/`weekDays` are resolved via `_()` anew on EVERY `init()` call, deliberately uncached — the Start menu's calendar tab re-runs its entire `callback()` (and thus `init()`) on every language switch via `ui.js`'s `tabs()` re-run.

**`caret.js`** (custom text-caret overlay): `SELECTION_API_INPUT_TYPES` (`'text','search','url','tel','password'`) is exactly the `<input>` types the Selection API supports per spec — other types throw `InvalidStateError` or have no text caret at all (the basis for the "Caret input-type guard" fix, see the memory notes). `getCaretCoordinates()` measures via an invisible mirror `<div>`: a zero-width span after the text forces a trailing line break to actually render (otherwise a trailing `\n` is eaten by HTML in `pre-wrap`); the x offset is taken from the div's left edge to the caret (not `textSpan`'s width) to handle multi-line text correctly; y already includes `borderTop`+`paddingTop` and must not be added again. `updatePosition()` reads coordinates in a `requestAnimationFrame` (otherwise `scrollTop` is read before the browser has auto-scrolled after e.g. Enter). Navigation keys update the position in `setTimeout(…,0)` after the browser has processed the key. On text selection the caret is positioned at `selectionEnd`, not `selectionStart`.

**`dropmenu.js`**: icon-prefixed triggers (e.g. Designer's text-formatting toolbar) show only icon+value+arrow in the CLOSED trigger — the open list always shows full text labels, even for options whose `label` is rich HTML (e.g. a two-column font-family preview); the trigger's label then uses `opt.dataset.title` (plain text) instead of `textContent`, which would otherwise merge the columns. The options list's scrollbar deliberately matches the Designer canvas's own (`rgba(0,0,0,0.15)`/`rgba(255,255,255,0.35)`). The document-click listener that closes the dropdown runs in the **capture** phase (not bubble) so it triggers even when the clicked element stops its own propagation — the condition `!el.contains(e.target)` (instead of always closing) is what makes the capture phase safe: a click on the element's OWN trigger must reach its own toggle handler with the `open` class still present, otherwise it reads the class as already removed and adds it back, turning a close-click into a no-op.

**`tags.js`** (tagged input field with autocomplete): the list is made visible (`.show()`) BEFORE positioning is computed, because `offset()` requires an already-visible element. `mousedown` (not `click`) is used in the autocomplete options' handler specifically to prevent the input's `blur` from firing first.

**`toggleWindow.js`** (the status-icon panel factory, used by notifications and Media Player): the `iconSelector` path resolves `targetId` from the actually clicked icon, because status icons often exist in 2+ DOM duplicates (the real taskbar + the Start menu widget). Closing via the trigger unbinds the same `document` click listener the panel registered on open (saved via `.data('outsideClickHandler', ...)`), otherwise it leaks forever. `width`/`height:"auto"` is left unset so the panel shrinks/grows to fit its own content; the size is re-measured on EVERY `adjustPosition()` call (not cached), so a caller can mutate the panel's `innerHTML` and run the returned `.reposition()` handle to follow along. Final clamping is applied on all four sides (not just top/left), otherwise the panel can hang off the right/bottom edge near a corner.

**`window-modal.js`** and **`menu-body.js`** are described in section 3.

---

## 5. The language system (`language.js`)

`os.language` tracks the loaded OS language and per-program language files separately: `_loadedProgram` is keyed on `${langCode}:${programId}` so each program's own file is fetched at most once per language, and a 404 for one pair never blocks another. `_registeredPrograms` (every id that has ever called `loadProgram()`, regardless of fetch outcome) is walked on every future `set(langCode)`, so a program registered under English still gets its Swedish file fetched the first time the user switches to sv.

`_refreshHandlers` (token → callback) is the core of live language switching: every open window that wants to be re-translated registers via `registerRefresh()`. `_activate()` snapshots handlers BEFORE iteration, because a callback can synchronously close its own window (→ `unregisterRefresh`) and mutate the Map mid-walk; each call runs in its own try/catch so one broken window doesn't block the rest.

A number of `registerRefresh` entries handle shell parts that lack their own setup()/lifecycle hook (Taskbar/Start Menu are boot-time system files, built long before any program's `setup()` runs):

- `"shell-taskbar-startmenu"` only updates concretely identified stale title/placeholder attributes, not a full rebuild.
- `"shell-taskbar-pinned-icon-names"` and `"shell-desktop-icon-names"` cover the two places that still bake `program.name` in as plain text at a one-time occasion (`addtotaskbar.js`, `desktop/icons.js`'s `add()`) — see section 2 for why most other places are already thunk-based and avoid this.
- `"shell-startmenu-tabs"` tears down and rebuilds the ENTIRE `app.ui.tabs()` call for all of the Start menu's tabs (Apps/Email/Calendar/Widgets/Settings/Account/Updates) with the same `tabConfig.tabs` array — each `tab()` function already calls `_()` fresh at run time, so the staleness is purely "never re-called after the first build", not stale data. Rebuilding all tabs in one sweep is cheaper and more complete than patching each tab's strings individually; the active tab's position is read from the DOM before and restored afterward so the rebuild doesn't bounce back to the Apps tab.

The general "frozen translation thunk" pattern (`() => _(...)` instead of an already-resolved string, resolved only at render/registration time) recurs in several independent places that were fixed during the same work: Explorer's `fileops.js` ("Shortcut" in the New submenu — must be registered before `shortcutEditor` is defined but must not freeze the language), `desktop/icons.js`'s "Deselect All" entry (unlike its sibling entry "Select All" it must be a factory, not a plain object), `notepad/setup.js`'s "New Text File" (registered BEFORE the program's own language file has loaded), and `solitaire_deckchooser.js`'s `DECKS` names. See the memory note "Frozen translation thunk bug" for the general description.

Most programs with imperative, non-re-renderable windows (Notepad, Mail, Formbuilder, GUI showcase, Fotoviewer) limit their own `registerRefresh` wiring to just the window title — their menus/status bars/content are built once at `windowStart()` and would require a larger separate task to make fully re-renderable without clashing with their own state-update logic (see the respective program sections below). `voiceinput.js` has no `registerRefresh` wiring at all: its only UI is a short-lived `app.ui.toggle.window()` overlay with no real `windowStart()` window to hang a leak-safe refresh pair on — `body()` is already rebuilt from scratch every time it opens.

---

## 6. Taskbar (`sandstorm/components/taskbar/*`)

`build.js` starts the clock (`analogClock`/`setClockDisplay`) BEFORE `overflow.start()` — the latter measures the taskbar's width and may switch to the analog icon if `.tasks` already overflows; a later unconditional clock call could have overwritten that decision. The slide-in animation uses a double-buffering/reflow trick: the taskbar is set off-screen without a transition, a synchronous reflow is forced (`void $taskbar[0].offsetHeight`), then the inline styles are reset in a `requestAnimationFrame` so the transition actually triggers — without the forced reflow the browser can merge the two style sets and the animation doesn't happen.

`checkTaskbarPosition()` has a re-entrancy guard (`checkInProgress`) with a real background bug: the function reads `config.position` early but only writes it after its own ~350ms+ transition await — a second resize call that lands mid-transition then read the still-old position, re-applied the same already-current CSS (triggering no new `transitionend`), and hung its own `waitForTransitionEnd()` call forever. Confirmed live: the taskbar got stuck invisible (`opacity:0`) after a quick resize back and forth across the mobile breakpoint. `waitForTransitionEnd()` now has its own safety-valve timeout, but preventing the overlapping call is the actual fix (see the memory note "Taskbar position race condition").

`clock.js`: `formatClockTitle()` adds no extra comma for `en-US`, because `toLocaleDateString` already inserts its own ("Aug 6, 2025"). The tooltip return value (`${summary}\n${datePart}`) relies on native `title` tooltips rendering a literal `"\n"` as a line break. `analogClock()` is rendered at `devicePixelRatio` (not just CSS size) to stay sharp on high-DPI, and the `title` attribute is only updated when the displayed minute actually changes — otherwise the browser's native tooltip flickers/re-triggers on every second tick while you hover (see also the memory note "Clock tick wipes badge dot" about a related problem in the notification system, section 9).

`icons.js`: an icon node found via `getElementById` is only reused if `parentNode === container` — an old hidden node from the overflow menu can share the same id, and without the check it would be reused by mistake in the main list. `menu.js`: `getCloseAllWindowsData()` marks `closeAll:true` to distinguish the row's PROGRAM id from ordinary window ids; `build()`'s dismiss listener runs deliberately in the capture phase (so a window close button's `stopPropagation()` can't swallow the click) and is delayed one tick so the same click that opened the menu doesn't immediately close it. `overflow.js`: when restoring from the overflow clock, `$("#timeDisplay").empty()` must be run explicitly — `clock()`'s digital mode only looks-up-or-inserts its text node and never removes the old `<canvas>` element, a second, independent call site of the same bug `clock.js`'s own dispatcher already handles.

`showdesktop.js`: the module variable `_hidden` tracks exactly which windows the last "show desktop" click minimized; each entry is validated against the window's live `'minimized'` class before restoration. `sort.js` implements a FLIP animation (First-Last-Invert-Play) for icon reordering: a pure CSS `transform` transition cannot animate a DOM-order change in itself, so positions are saved before, the reorder happens, and the delta is measured+animated on jQuery UI's `change` event. Positions are read via `offsetLeft`/`offsetTop` (transform-independent), not `getBoundingClientRect()`, because a fast drag across several icons can trigger multiple `change` events before a previous 150ms animation is done — `getBoundingClientRect()` would then have reported the transform-interpolated mid-animation position and replayed the movement over and over. `windowanim.js`'s `instant` branch applies exactly the same end CSS as the animated path, just immediately.

In `style.css`: `.ui-sortable-helper` is excluded from the transform transition (the actively dragged element should not lag behind the mouse). `#showDesktopBtn`'s base rule (6px vertical strip + `border-left`) is turned into a horizontal strip + `border-top` in left/right taskbar mode, where the `.right` container becomes a column.

---

## 7. The Start menu (`sandstorm/components/startmenu/*`)

`core.js` resets `menu.style.height` in two separate places (init's and build's own document-click listeners) with the same logic as `toggleMenu()`'s close animation, so the menu always closes consistently regardless of which listener triggered it. A right-click INSIDE the menu previously fell straight through to `desktop.js`'s background context menu (bound on `document.body`, which the whole menu lives inside) — `e.stopPropagation()` now suppresses the wrong menu, without adding a real replacement. `startbutton()` sets `isolation:isolate` to create a new stacking context so the `.after` element's `z-index:-1` doesn't leak upward, and defers the `.after` background by a double rAF to avoid a yellow flash on the first paint.

`running_apps.js` extracts the program id via running windows' `pid-*` CSS classes (set by `windowStart`) instead of `getAllWindowId()`, whose window-level ids (e.g. `"cp-taskmanager"`) don't always match registered program ids and caused null crashes; a just-opened program is ensured to be in the list even before its window has shown in the DOM. `search.js` (the Start menu's own search box) resets itself (`_resetSearch()`) after a result is activated, so the menu starts fresh next time it opens; its resize listener shares a trigger with `core.js`'s `calculateMenuHeight()` so the result box's bottom edge stays synced; keyboard navigation is based on a grid (Down/Up = whole row, Left/Right = within the row). `state.js`'s `_hiddenWindowIds` mirrors `showdesktop.js`'s pattern for the "Apps running" panel's own hide-all button.

`tabs.js`: `createAppsTab()`'s click/context-menu handlers are bound to the ENTIRE `.appsborder` plate, not just the inner `.appicos` icon box — `.name` is a SIBLING of `.appicos`, so a listener only there missed clicks on the label text. The page indicator (`_renderPages`) counts with `Math.round`, not `Math.ceil` — `ceil` previously added a false extra page for just a few overflowing sub-pixels from flex-wrap reflow. Reading `scrollHeight`/`clientHeight` for the page indicator is deferred (`setTimeout(…,16)`, same as the wheel/resize paths), because a synchronous read before the grid's flex-wrap had settled gave the wrong page count on first open. `addTab()`'s icon HTML is built by `app.ui.tabs()` itself at render time, not in advance — otherwise an early build freezes `tabConfig.title`'s then-current value permanently (see section 5 on the thunk pattern).

In `startmenu.css`: the width formulas `min(640px, calc(100vw - Npx))` are repeated for `def-l`/`def-r`/`def-b`/`def-t` with their respective side offsets (9px/63px). `.def-t.show-t` previously had a fixed `640px` that a higher-specificity rule (3 classes) silently overrode the base `.startmenu` rule's `min()` fix — confirmed live: a top-positioned taskbar at a 600px viewport stuck out 40px and clipped the last icon column. `.rightmain` uses `container-type:inline-size` so `.appslist`/`.pd` can size padding/gap via `cqw` against its own rendered width, not the viewport. `.appsborder .name` was widened from 68px to 112px (measured: a 15-character `app.util.truncate()` string needs ~97px at 12px font — 68px didn't even fit "Kontrollpanel"). `#ms-search-results`'s `max-height:480px` is only a fallback — `search.js`'s `_sizeResults()` sets it inline against `.rightmain`'s actual bottom edge.

---

## 8. The search engine (`sandstorm/components/search/*`)

The backend behind both the Start menu's search field and the Control Panel's settings search. `matcher.js`'s `ALIASES` table is deliberately small and hand-maintained (not a synonym dictionary) — one level flat, bounded by `MAX_EXPANSIONS`. Fuzzy matching in `score()` is only done for reasonably short terms/targets, and is compared both against the target's own words (so multi-word targets like "Control Panel" can fuzzy-match a misspelled first word) and against an initial substring of matching length (so a run-together "Controlpanel" can still fuzzy-match "contorl", a typo a plain whitespace split would never have isolated).

`providers/apps.js` limits itself (v1 scope) to apps the user already sees in the Apps tab (`program.startmenu === true`). `providers/filesystem.js`: a file hit opens its PARENT folder (because `app.explorer.open()` navigates TO a folder), a folder hit opens itself. `providers/settings.js` substring-matches only the RAW word against `app.searchengine.search`, so `search()` calls it once per expanded term (raw word + alias) to still reach the alias expansion, and recomputes each hit through `matcher.js`'s real tier ladder afterward.

---

## 9. The notification system (`sandstorm/components/notifications/*`)

`api.js`'s `notify()`: a `priority:'critical'` notification is always shown, even when the program's notifications are otherwise blocked (`mode:'blocked'`). If the routing decision was `'own'` but no surface is registered for the program, the notification falls back to the clock instead of being silently lost.

`setup.js`'s click listener on `#timeDisplay` waits via `os.dom.waitFor('#timeDisplay', {timeout: 0})` — with no time limit, deliberately. `startup-complete` fires synchronously right after the boot `start:` loop, but `desktop.taskbar.build`'s actual DOM creation runs in a deferred `$(fn)` macrotask (jQuery 3 already defers already-ready handlers via `setTimeout(0)`), so `#timeDisplay` doesn't exist yet then. The module's `start()` runs during the boot `programs` phase, long before `config.start`'s array even begins — `desktop.taskbar.build` is that array's LAST step, behind the login screen's wait. A bounded timeout was the actual bug: it silently gave up in the middle of login without an error, and the click listener was never wired (see the memory note "startup-complete vs app.dom.waitFor" and section 1). The CSS rule `#timeDisplay > .notif-badge-dot.pulse` needs its own selector (not just the `.pulse` class alone) because the start button's `.after.pulse` base rule (same shared keyframe, basic.css) has higher specificity (ID+class) and would otherwise win. The `MutationObserver` that heals the badge after the clock's own text writes is only triggered by `childList` mutations (not class toggles), so it cannot loop itself.

---

## 10. The Cursor Engine (`sandstorm/components/cursor/*`)

An SVG cursor overlay that replaces the native mouse pointer, permission-gated per program. `index.js` seeds its initial position from `window.__sandstormBootMouse` (see section 1) — without it the overlay starts from `motion.js`'s hard-coded `(0,0)` and visibly glides in from the corner on the first mouse move.

`api.js`: `_pin()`'s unpin branch calls `resync()` after `state.setManualCursor(false)`, otherwise the overlay keeps showing the just-unpinned glyph until the next `pointermove` (same cause as a stuck busy/working cursor after a program has finished loading while the mouse stood still). The `_workingDepth` counter is ref-counted so overlapping "starting" cues (several autorun programs at boot) can't race each other — only the call that takes the counter to zero actually touches state. `show()` always emits, even if `state.js`'s own `visible` value was already `true` — `renderer.js`'s `_applyVisibility` then bypasses the separate window-boundary fade, which is the whole point of an explicit `show()` call.

`cursor-map.js` previously lacked `grab`/`grabbing` (Designer's dock/palette drag handles) and `row-resize`/`col-resize` (Designer's splitter-boundary drag, `tools/resize.js`) — both fell silently back to the default arrow (see the memory note "Cursor-map gaps"). `detect.js` temporarily strips `renderer.js`'s `cursor:none!important` suppression class for the single synchronous `getComputedStyle` call on element change, otherwise the rule would clobber the semantic cursor value before the code can read it. `_onPointerMove` uses `e.target` (cheap, correct since the overlay itself is `pointer-events:none`); `_onTouch` must instead use `elementFromPoint`, because a touch event's `e.target` stays locked to the original `touchstart` target for the whole gesture.

`motion.js`'s `EPSILON = 0.02`: exponential smoothing in floating point never reaches its target exactly — without the threshold, `positionchange` (and renderer.js's trail spawn/idle-timer reset) would fire forever even with the cursor stationary, which showed up as the trail effect never settling. Follow mode tracks the target's live center every frame (`getBoundingClientRect`, not `detect.js`'s `getComputedStyle`); if the followed element is removed without a matching `Cursor.follow(null)`, a lingering `followTarget` would permanently block pointermove handling and freeze the cursor.

`permission.js`'s `isSystemProgram()` does NOT trust `'sandstormscomponents'` (the default owner id for component-level dialogs) as system-trusted, even though that identity can be `.window.active` right after one of its own consent dialogs "closes" — otherwise the next gated call from ANY program would silently be auto-granted. Only a genuinely absent active window (`programId === null`) is trusted at the system level.

`renderer.js`: the working cursor's ring lives in its own standalone element (not baked into a spinning `<use>`, which would rotate the whole reference including the static arrow). The window-boundary fade (`WINDOW_FADE_MS`) is separate from `--cursor-opacity` (the user's overall theme opacity) — they compose multiplicatively. `_applyVisibility` bypasses the window fade when a program has explicitly called `show()`, but `hide()` leaves the fade state untouched (display:none already hides everything). The boot fade-in in `init()` only happens if `window.__sandstormBootMouse` shows that the mouse is actually known to be over the window — otherwise `_onWindowMouseEnter` fades it in for real as soon as it actually arrives (without this condition a fake cursor showed at `(0,0)` when the real mouse was outside the browser window at boot).

`theme.js`: the "accent" color reads `os.config.user.settings.theme.backgroundRadialColor` (the plain hex code the Theme tab already saves) instead of `--background-radial`, which is always a `radial-gradient(...)` function value — `color:` (the SVG's `fill="currentColor"` depends on it) cannot hold a gradient and falls silently back to inherited color. `_accentPreset()` uses no glow, because a blurred drop-shadow in the accent color rendered as a visible colored circle on top of the cursor (reported live as an unwanted "yellow circle").

---

## 11. The login system (`sandstorm/components/login/*`)

`login.js`'s `setup()` preloads the icon font ("Font Awesome 6 Free") explicitly via the Font Loading API — a `<link rel="stylesheet">` otherwise doesn't start fetching until the window's HTML lands in the DOM, right when the icons are needed, and `font-display:block` makes them invisible until then. The `os.login` namespace is safe to expose even though `setup()` runs inside the `start:` array after the boot-API cleanup, because the cleanup only locks `os.controlpanel.add`/`addMenuItem`. A locked login language (`"system"` default leaves `os.language` untouched) is honored even if the OS is running something else. `body()`'s `div` variable is set inside a `setTimeout` block when the window's HTML is actually in the DOM; `refreshLoginText()` closes over it by reference and guards against it still being null. `forgotFab.onclick` needs `e.stopPropagation()` — otherwise the click bubbles to the login window's root click-to-focus handler, which runs `app.setActiveWindow(loginWindowId)` AFTER `app.ui.prompt()` has already activated its own window in the same dispatch, stealing back the top z-index and burying the prompt behind the unclosable login window (same fix as `langFab`/`langMenu`).

`start()` saves the entire `loginProgram` `start:` step from `index.html` once at boot (index.html is the single source of truth) and persists it on `os.login` for the session, including later lock-screen re-opens (`os.session.window.logoff()` calls `baseWindow()` directly, without going through `start()` again). `performLock()`'s `toggleMenu()` call is a real toggle and is only called if the Start menu is actually already open (a manual Lock Screen click), otherwise an idle-timer trigger would wrongly open the menu.

`autologout.js`: if `_isBlocked()` (e.g. a program tagged `category:"game"`, see section 2) is true, a new check is scheduled in 5s instead of aborting the cycle — already-elapsed inactivity keeps counting from the end of the block. The explicit "Stay logged in" button is the only way to dismiss the warning dialog; a pause/media-start mid-countdown dismisses it just like an explicit cancel.

---

## 12. Control Panel (`sandstorm/components/controlpanel/*`)

See the memory note "Control Panel lazy loading" for the split into an eager manifest + lazy `*.content.js` files (`os.includeModule()` swallows its own import errors and resolves `null` instead of throwing — you can't rely on catch alone to detect a failed load).

`program.js`'s `main()` rebuilds whichever panel is open (or the launcher grid) entirely on every language switch, because `_render()` already re-runs each `_()` call. `taskManager()`'s selected-row highlight (`.tm-selected`) is deliberately a static highlight, not the shared pulsing `.ctm-row` hover animation — sharing the infinite animation rule made a selected row keep pulsing forever even without the mouse nearby.

Several panels share the same `os.ui.infoRow()` helper (`ui/dropmenu.js`) instead of their own hand-built `.cp-field`/`.cp-label` markup or a double-implemented local closure — consolidated from `core.content.js`, `system.content.js` and `update.content.js`. `customized.content.js`'s "No background image" toggle is kept in sync both ways with the background-image state. `program.content.js` rejects `.svg` as a raw `<img>` icon source (same policy as Explorer's `icon_menu.js`, section 17) — real SVG icons go via `icontype:'svg'`/`app.load.addSVG()`.

`responsivelayout.content.js` (section 15's settings panel): the Snap Layout section is independent of the grid-arrange toggle `available` — drag-to-edge snapping has its own gate. The `$('#rwl-save-mine')` button's `app.ui.confirm` call requires `stopPropagation()`: without it the click keeps bubbling after the confirm dialog is created, reaches the Control Panel window's own "click anywhere in me = focus me" handler, and it steals back focus a tick later — leaving the new dialog visually behind and unclickable (confirmed live via `setActiveWindow` tracking; same class of bug as `login.js`'s `forgotFab` above).

`users.content.js`'s avatar validation is multi-layered: `src=""` is a URL context (not plain text), so HTML-escaping alone does not exclude a `javascript:` scheme. Beyond the scheme prefix, it is checked that the payload after the comma actually IS base64 (a prefix match alone would let a rigged string smuggle arbitrary bytes past), plus a length cap (`MAX_AVATAR_DATA_URL_CHARS`, ~1.4M characters ≈ a 1MB image after base64 inflation) — an unbounded data: URI in the DOM on every render of the user list is otherwise a cheap self-inflicted DoS. SVG is excluded even though an `<img>`-rendered SVG cannot run scripts in current browsers — it is a rendering-context quirk, not a guarantee. The picker page's corresponding check (`MAX_AVATAR_FILE_BYTES`) runs against the raw `File` before it is read, so an oversized photo is rejected immediately instead of burning a `FileReader` pass needlessly.

`tabs.css` implements three responsive modes for the sidebar: full labeled rail (desktop) → icon-only 56px rail (`@container max-width:768px`, same left position, icons only) → fully collapsed drawer below 450px (`.cp-tab-topbar` with back/search/menu, which slides the full sidebar in as an overlay).

---

## 13. The desktop — icons, drag/drop, background

### Desktop icons (`sandstorm/components/desktop/icons.js`)

The grid engine: `_gApply()`'s else branch only clears the transform transition the animate branch may have left behind — not the whole `transition` shorthand, which would otherwise abort an unrelated ongoing transition (e.g. an icon's boot-time opacity fade-in). `_gResize()` snapshots and sorts in reading order (row-major) so earlier items get priority on reflow; widgets keep their `userCol`/`userRow` (resize doesn't change user intent) while icons restore their old entry. `add()` fades in new icons (only for a batch render, staggered 0.2s/item, same timing as the taskbar's entrance animation) because this runs right after the loading screen's `removeLoadingScreen()` promise resolves, at boot. `refreshFs()` skips `autoDesktopIcon` entries already rendered via `_icons`/`add()`, otherwise the same program icon is double-rendered.

`_buildFsContextMenu()` delegates the whole action catalog to `app.explorer.buildContextMenu` (section 17) — the desktop only provides the rename UI (tied to its own `.desktop-icon-label` DOM). Multi-drag (`bind()`'s `mousedown`→`onMove`) sets `z-index:99999` (same convention as the single-icon drag) plus `pointer-events:none` — otherwise the dragged icon itself would be the element under the mouse pointer at drop time and Explorer's `bindExternalDrop` mouseup (section 17) would never reach the window below. The `.dd-dragging` class (Explorer's ghost-drag opacity) is deliberately NOT set — that would visibly fade desktop icons during the whole drag, a regression against the existing look; only the `data-path` marker is reused. In `onUp()` (multi-drag end) the `accepted` set is captured BEFORE cleanup removes the marker; accepted icons trust the already-started async move (`openMoveStatus`→`pasteItems`→`refreshFs`) instead of being snapped back, otherwise a successful drop looks misleadingly like a rejected one.

### The background system (`desktop.js`)

`app.desktop.setBackgroundImage(options)` is the only way in to change the desktop background (boot, Control Panel, Explorer's "Set as desktop background" — see section 17). It is `async` and actually does the work before it resolves:

```
fetch(url) → blob → URL.createObjectURL(blob) → new Image().decode()  → applyBackgroundCss()
             (15s timeout as a safety valve)   (forces decoding BEFORE the CSS switch)
```

Two things worth remembering if you touch this code:

- **`applyBackgroundCss()` must `app.removeCSS(id)` before `app.addCSS(id, ...)`** — `app.addCSS` silently ignores duplicates of the same identifier (documented behavior in `ui/css.js`), so without `removeCSS` first only the *first* background in a session ever takes effect.
- **The `decode()` step exists to avoid a white flash** — `fetch()+blob()` only guarantees downloaded bytes, not that the browser has decoded the image into a paintable bitmap. Without the explicit `decode()` call the CSS switch can get ahead of the actual decoding, which makes the `background-color` fallback (white) show for a brief glimpse before the image itself paints.

Explorer's and the desktop icons' shared context menu adds "Set as desktop background" conditionally on `app.explorer.isImageExt(ext) && entry.url` (see section 17) and calls `setBackgroundImage()` directly — Explorer knows `app.desktop`'s public API, but `app.desktop` doesn't know about Explorer, the same one-way dependency principle as the Fotoviewer integration (section 18), except Explorer initiates the call this time.

---

## 14. Responsive Window Layout (`sandstorm/components/responsivelayout/*`)

Admin-controlled grid arrangement of windows per breakpoint tier, a separate system from the drag-to-edge Snap Layout (section 3) — Snap Layout has its own gate and does not require the grid system to be enabled.

`api.js`'s `defaultConfig()`: the `columns` cap only limits the arrange engine's MAX columns per tier (fewer open windows than the cap still use fewer); `columnsEnabled` toggles the cap off per tier without clearing the saved value, so re-enabling restores the last value. `writeConfig()` nulls `app.desktop._rwLayoutState` (engine.js's cached last-computed grid, keyed only on window set + active window) — the cache was never designed to notice a config change itself, so without this invalidation a just-saved column cap had no visible effect until a window open/close forced a recompute (confirmed live: two arrange passes in a row with the same windows produced byte-identical output despite an intervening columns save). `init(app)` seeds a valid, enabled default config on first boot — otherwise `isAvailable()` reads false until a mutating call happens to trigger `ensureConfig()` first.

`engine.js`'s `arrangeWindows()`: off (or an invalid config) → never auto-arrange, a hard stop — confirmed live that a fallback to legacy `app.config.local.breakpoints` produced a real z-index bug (two windows swapping stacking order around a ~350px breakpoint and not restoring it reliably). Gated centrally in the function (not just in `checkWindowSize`) so that `menu-body.js`'s direct call to `app.desktop.responsiveArrange()` can't bypass the block either. Maximized windows are excluded from the z-index floor calculation BEFORE `.filter()` runs — otherwise their z-index was never counted in `excludedMaxZ`, and `zFloor` could bury an actively arranged window behind an unfocused maximized window (confirmed live: z=5001 → z=1003 for the active window, while the unfocused maximized one stayed at z=5000). Locked modal-dialog pairs are tracked separately from maximized windows in the same filter: a locked pair should stay on top of EVERYTHING (unlike a maximized window, which an arranged active window may still exceed) — mixing it into `excludedMaxZ` would have made `zFloor` wrongly START above the locked pair (confirmed live: a Solitaire "Choose Deck" dialog was buried under an arranged Explorer window on a breakpoint change).

---

## 15. The Recycle Bin (`sandstorm/components/recyclebin/setup.js`)

`send()`'s `doDelete` helper captures each path's current entry and removes it — the actual mutation, called from `do()` (the first time) and `redo()` (a later repeat). `ids` is shared via closure so `undo()` always restores exactly what the last `do()`/`redo()` call produced.

---

## 16. Explorer

### Two layers: boot-critical vs lazy

```
sandstorm/components/explorer/
├── setup.js  → setup/index.js         ← BOOT-CRITICAL, always runs (even if the Explorer window is never opened)
│    ├── setup/icons.js       registerIcons   — SVG sprite, program.addInfo("explorer", …)
│    ├── setup/core.js        registerCore    — app.explorer._fs, _getNode, clipboard, metaPanel registry, contextMenu registry
│    ├── setup/dialogs.js     registerDialogs — the file-picker dialog (select.file et al.)
│    ├── setup/fileops.js     registerFileOps — newFolder/newFile/remove/rename (the actual file operations)
│    ├── setup/icon_menu.js   registerIconMenu— app.explorer.icon.forEntry() + app.explorer.buildContextMenu()  ← SHARED with Desktop icons
│    └── setup/shortcuts.js   registerShortcuts
│
└── explorer.js  → window/index.js     ← LAZY, loaded only when the window opens (pure re-export: `export { start } from './window/index.js'`)
     ├── window/state.js     createState()  — all per-window state (multistart: true, one state per opened window)
     ├── window/core.js      update/updateMain/navigate/openFile
     ├── window/list.js      renderList/renderSearchResults, row-icon rendering
     ├── window/rows.js      click/double-click/context-menu binding per row
     ├── window/meta.js      right detail panel — selection mode OR search-tree mode
     ├── window/search.js    scoped offline search (from the current folder, not the whole tree)
     ├── window/menus.js     rowMenu() — Explorer's OWN, richer row menu
     ├── window/icons.js     fileIcon/extIcon/animatedFolderIcon
     ├── window/dragdrop.js, breadcrumb.js, tree.js, toolbar.js, createitems.js, dialogmode.js, fsutil.js
```

> `explorer_windows.js` and `explorer_api.js`, previously listed here as dead code at the root level of the folder, **no longer exist in the repo** — likely removed in an earlier, unrelated cleanup (see the memory note `project_dead_code_audit.md`, 2026-08-15). The real implementation is still `explorer.js` + `setup.js`, as described above.

### The virtual file system and RealStorage

`app.explorer._fs` is an in-memory tree, loaded once from `filesystem.json` at boot (`setup/core.js`, via `app.api.get`). After the fs load, `/Desktop` shortcut mirrors are backfilled for all `desktop:true` programs whose `add()` ran before the fs was ready, and real desktop icons are rendered for `/Desktop`'s then-current contents. `app.explorer._refreshAll` is exposed publicly so other boot-critical modules that mutate the fs directly (e.g. Recycle Bin, section 15) can trigger a redraw without their own copy of the refresh logic; every fs mutation also syncs the desktop icons (`app.desktop.icon.refreshFs()`) regardless of which path changed.

A node: `{ type: 'file'|'folder'|'shortcut', ext, size, modified, url?, content? }`. `.url` is the field that points at a real image URL — without it there is no source to show as a thumbnail or set as background. `/RealStorage` folders (a real backend, unlike the simulated tree) are populated LAZILY: `navigate()` (core.js) and the separate tree-click handler in `dragdrop.js`'s `bindSideRows()` each have their own lazy-load hook (`isRealStoragePath`/`ensureRealFolderLoaded`) — `list.js`'s `renderList()` shows a "loading" state until the fetch resolves, otherwise a genuinely existing but not-yet-populated folder would wrongly render as "Folder not found". `setup/fileops.js`'s `remove()`/`newFile()` mutate `_fs` ONLY AFTER the server confirms (unlike the simulated tree's optimistic path), and `pasteItems()` outright rejects EVERY paste that touches RealStorage as source or destination — no move/copy operation exists server-side yet (the phase is limited to list/read/write/delete), and a simulated item has no real content to save if it is moved there.

### The context-menu system

- **`rowMenu(state, path)`** (`window/menus.js`) — Explorer's own row menu. Richer (Open With submenu, Paste, Select All/Deselect All). Items like "Open"/"Rename"/"Set as desktop background" always work on the **specifically right-clicked** `path`, regardless of how many other rows are selected.
- **`app.explorer.buildContextMenu(paths, opts)`** (`setup/icon_menu.js`) — boot-safe, shared catalog (Open/Rename/Copy/Cut/Delete/Properties) used by the **Desktop icons** (section 13) because they can't wait for the lazy-loaded `explorer.js`. Takes `paths` (the whole multi-selection) **and** a separate `opts.clickedPath` for items that only apply to the specifically clicked file. `opts.onRename(path, entry)` lets Explorer own WHAT rename does (`app.explorer.rename`), while the caller owns HOW the name is entered (inline editing vs Explorer's own file rows). The Properties entry opens the same rich tabbed window that Explorer's own row menu uses, with an identical `{path, entry}` shape.

Both menus share a single source of truth for "is this an image file" (`_imageExts`, icon_menu.js) so "Set as desktop background" is kept in sync in both places — it requires a real browsable `.url` (most of the sample images in `filesystem.json` are decorative placeholders without one). A shortcut's icon is always its target program's registered icon (no separate override field in v1); a broken/unknown target falls through to a generic file glyph.

### Search

Scoped to the **current folder and its subfolders** — not the whole file system (`searchMatches()` starts traversal from `state.path`). A 150ms debounce in `toolbar.js` reads the input field's value at *fire time*, not at keydown, so an old timer can never revive an already-cleared search. The header's search field collapses to just an icon on narrow windows (≤425px) — a click expands it. A filter-panel add-on (file type/date/size chips) is applied on top of the active query.

The right detail panel (`.exp-meta`) is **context-dependent**, controlled by `core.js`'s `updateMain()`: no search → `updateMeta()` (ordinary selection info); search active → `updateSearchMeta()` (ASCII tree of the hits' full paths, regardless of which row happens to be selected — a row click during an active search does NOT switch back).

Touch devices have no real `:hover`, so the navigation rail's normal hover-to-expand is unreliable there — `if (window.matchMedia('(hover: none)').matches)` instead toggles a dedicated class explicitly per tap. The breadcrumb toggle icon is always looked up fresh (not cached in a closure variable), because `.exp-breadcrumb` is cloned-and-replaced by `setupBreadcrumbInput()` on every `updateMain()`.

### Image thumbnails

`fileIcon(entry, size, fit)` (`window/icons.js`) is the **only** function that decides what a row/grid cell/meta panel shows for non-folder files. It checks `entry.url && app.program.extInfo[entry.ext]?.thumbnail` — if true, a real `<img src={entry.url}>`; otherwise a fallback to `extInfo[ext].icon` or a colored extension badge. `fit` controls `object-fit`: `'cover'` for row/grid, `'contain'` for the meta panel's larger preview, which additionally grows to 200×200px (from 132×132px) specifically when a real thumbnail is shown.

### Other things of technical importance

`window/dragdrop.js`'s `DROP_TARGET_SELECTOR` is deliberately NOT window-scoped (unlike the item selector) — the drop side must match folder rows in ANY Explorer window plus the desktop's folder icons/empty area, otherwise cross-window and Explorer→Desktop drops are structurally impossible. `.desktop-icons` is `pointer-events:none` for ordinary clicks (so empty desktop area passes through to box-select/context-menu handlers on `document.body`), which also makes it invisible to `elementFromPoint`-based drop detection on empty area — `.dd-drop-active` is toggled to make it hit-testable just for the duration of a drag. Ctrl+drag = copy (industry standard), an ordinary drag moves. `openMoveStatus()`'s progress animation is cosmetic (per-item timing simulated); the actual file-system change happens once, after it is done, and updates every open Explorer window plus the desktop icons via `_refreshAll` — no manual Close button is shown on success (auto-closes), but failed/aborted operations require a manual Close because the user needs to read them.

`window/fsutil.js`'s `KNOWN_FOLDER_NAMES`: six root-level folders' display names (e.g. "Documents"→"Dokument") are translated, but only the VISIBLE label (`list.js`'s `rowHTML()`) — data-path/name/sorting always use the real, untranslated name, matched via exact root-level path (a user-created subfolder that happens to have the same name deeper in the tree is unaffected).

`window/meta.js`'s `_wrapCharacters()` wraps whitespace-only text nodes between the `.exp-meta-row` rows in their own `<span>`, otherwise normal HTML whitespace collapsing eats the space the animation's `gap` rhythm needs and it shows as a gap that appears and then disappears.

In `explorer.css`: the `.exp-anim-folder` folder icon is three composed layers (back shape / HTML-content preview / front tab, see `_animatedFolderIcon()`); its `font-size` is set inline to the icon's own pixel size so descendants can size in `em` proportionally regardless of which context renders it (grid, meta panel, multi-select). `@container (max-width:600px) { .exp-meta {...} }` collapses the meta panel's width to 0 (not `display:none`, for a smooth animation) when the work area is too narrow for it to fit beside a readable file list — respecting an inline-set manual toggle if the user has already forced the panel hidden/shown. `.dd-over`/`.dd-over-deny` carry no styling of their own at all — invalid-target feedback is the cursor itself (cursor-unavailable, see section 10), not a border on the target, matching real OS UX.

---

## 17. Fotoviewer — how extensibility actually works

This is exactly the pattern you want to be able to rely on everywhere. Fotoviewer owns **no** code in Explorer whatsoever — all it does is declare itself at boot:

```js
// program/fotoviewer/setup.js
export const IMG_EXTS       = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','tif','avif']);
export const THUMBNAIL_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','ico','avif']); // a subset — .svg/.tiff excluded

os.program.addInfo("fotoviewer", {
    ...
    openWith: [...IMG_EXTS].map(ext => ({
        ext,
        icon: '#ic-fotoviewer', icontype: 'svg',
        label: ext.toUpperCase() + ' Image',
        thumbnail: THUMBNAIL_EXTS.has(ext)   // ← this is the whole API
    }))
});
```

`THUMBNAIL_EXTS` is deliberately a subset of `IMG_EXTS`, not the same list: `.svg` is excluded per Explorer's established policy against raw `<img>` for SVG sources (the same security stance as `controlpanel/program.content.js`'s icon handling, section 12); `.tiff`/`.tif` lack a built-in `<img>` decoder in ordinary browsers and would render as a broken-image icon — worse than the generic glyph fallback.

What `program.js` does with the `openWith` list (see section 2) then propagates automatically to **three different places in Explorer**, without Explorer or Fotoviewer explicitly talking to each other:

1. **Double-click in Explorer** → `app.program.fileHandlers['jpg']` exists → the file opens in Fotoviewer.
2. **Icon rendering** (`fileIcon()`) → `extInfo['jpg'].thumbnail === true` + `entry.url` exists → a real image thumbnail instead of a generic glyph, in row, grid *and* meta panel.
3. **The meta panel's container size** → the same `thumbnail` flag decides whether `.exp-meta-icon` becomes 200×200 or stays at 132×132.

Should another program (e.g. a future video player) want the same thumbnail treatment for `.mp4`, all it takes is setting `thumbnail: true` on its own `openWith` entry — Explorer does not need to change at all.

Fotoviewer's own window limits live language switching to the toolbar's `.title` attributes, the empty-state text and the window title (the same title-only scope described generally in section 5) — the context menu's items are already rebuilt from scratch every time the menu opens. Drop-from-Explorer is detected by catching `mouseup` while elements still carry Explorer's `app.ui.dragDrop`-set `.dd-dragging` class (see section 16).

---

## 18. Designer

Designer is by far the largest program in the codebase: a full page-builder tool with its own object model (Document/Node), a cascade-aware style engine, a canvas rendering layer, five separate tools (Select/Split/Resize/Move/Text) and over a dozen dock-panel modules. This section goes through the architecture layer by layer.

### Module load order (`designer.js`)

`start(os)` builds the Designer window itself and sets `app.designer.win` SYNCHRONOUSLY before any `includeModule().then()` chain has a chance to resolve, so every lazy-loaded `designer_*.js` module's `init()` is guaranteed to see it set. Live language switching is limited to the window title (the same scope principle as section 5/17) — Designer's toolbar, dock panels, menu list and color picker are built and bound entirely independently of each other, with no single re-render entry point.

The many `app.includeModule(...).then(mod => mod.init(app))` chains (ruler, devicemode, scrollbar, tabs, dock, menu, object model, droppable, selection, the tools, hover-overlay) are loaded in an order that mirrors real dependencies:

- `designer_dock.js` (the core registry/renderer) loads before drag-reorder (`designer_dock_sortable.js`) and resize (`designer_dock_resizable.js`), which both need the dock's DOM.
- The color system loads history → element/group views → picker window → pickup tool → `core/style.js`'s color-aware `setColor`, because both the history strip and the pickup tool's `'designer-color-picked'` listener require `app.designer.colorHistory` to already exist.
- The Style Binding foundation (`core/stylesheet.js`) loads before `core/style.js` — `buildStyle()` reads it via a real ES import regardless of init order, but the load order still guarantees `app.designer.stylesheet` exists no later than `app.designer.style`.
- The object model (Document/Node/registry/parser/renderer + block types) loads independently of the tab order. `canvas/droppable.js` is chained after, because it needs `app.designer._registerRenderHook`/`applyDropAction`. `designer_selection.js` (single source of truth for the selected node) must load before both outline (select tool) and tag (hover overlay), because both now only *react* to its broadcast. The Split/Resize/Move/Text/Select tools are loaded in turn because each needs `app.designer.getDocument()`/`render()`; Resize is ambient (ungated by `activeTool`), Move/Text are gated behind their respective tool id.
- The last `forEach` loop (Properties/Groups/Layers/History/Toolbar/animation modules) has a per-module try/catch — the same pattern as `menu-body.js`'s click wiring (section 3) and `designer_objectmodel.js`'s render hooks below: a module that throws during `init()` (e.g. Properties' own initial `panelHTML()` render) previously silently skipped every module REGISTERED AFTER it in the array — including the toolbar itself — for the rest of the session.

### The object model (`core/*.js`)

`Node`/`Document` (`core/document.js`) is the core: block-specific shorthand fields (e.g. a splitter's `direction`) are folded from a sibling-to-`type` position into `props` in the constructor, so authored JSON can be written in the simpler form. `core/parser.js` (`load`/`serialize`) is the boundary between saved JSON and the live tree. `core/registry.js` is the block-type registry (`Node.type` → renderer definition).

`core/style.js`'s `buildStyle()` is where a node's `layout`/`style` becomes an inline CSS string. It reads the Style Binding foundation's `resolveComputedStyle(node)` (`core/stylesheet.js`, Step 1 of a planned multi-step reworking — see the file's own detailed header docblock for the whole cascade algorithm, with states/Step 7 and responsive/Step 8 already prepared as locked invariants): matching `.class`/`#id` rules are merged under the node's own inline style, while a node without classes/id still resolves to plain `node.style`, unchanged. A rule's identity is the triple `(selector, state, breakpoint)`, not `selector` alone — a class/id can thus hold a normal rule plus any number of state-/breakpoint-scoped variants as separate entries. `canvas/renderer.js`'s `render()` sets `setActiveStylesheet(doc.stylesheet)` once, synchronously, before the tree walk — every block's `render(node, childHTMLs)` otherwise has no Document reference to read a stylesheet from (safe because JS is single-threaded).

`core/color.js` contains pure color-conversion functions: a full sRGB → linear → XYZ → CIE Lab (D65) pipeline and back (clipped at the gamut boundary — a Lab coordinate outside sRGB gives its nearest displayable color, never a thrown error), and a conventional simple subtractive CMYK approximation (no ICC profile, in line with what a color picker without real ink-profile handling is expected to show).

### The tool system (`tools/*.js`, `rules/element_capabilities.js`)

`rules/element_capabilities.js`'s `TYPE_CAPABILITIES` controls what each tool may do with a given node type: a `button` is `resizable:false, splittable:false` (its size comes from the content, no internal layout to split); a `form` is `splittable:false` (should stay cohesive, matching `tools/split.js`'s existing guard, now generalized to data); a `splitter` is `splittable:false` (splitting an already-splitter is not well-defined) but NOT overridden on `resizable` — that flag means "can this node's own share be changed as one side of ITS PARENT's boundary", which a nested splitter-as-pane needs just like any other node type.

**`tools/select.js`**: `outlineVisible` (the Cursor bar's "frame" checkbox) is a pure UI preference, not persisted, independent of the selection itself — unchecked only hides the blue outline via CSS without touching `app.designer.selection`. A re-render replaces every `.db-node`, so the outline class is re-applied against the current selection afterward (`designer_selection.js`'s own render hook already handles dropping the selection if the node itself is gone).

**`tools/move.js`**: the only document mutation is moving the same node instance between `children` arrays — never a new node, never a type/flexBasis change.

**`tools/colorpickup.js`**: a one-shot eyedropper via the native `EyeDropper` API that returns to the Cursor tool afterward (no persistent mode arming — there is no bitmap design surface to sample against). The `.catch()` branch returns `null` silently (Escape/denied permission, not an error). The side panel's pick pushes the result into the foreground swatch (`designer-color-group-primary`), like a real OS eyedropper.

**`tools/resize.js`** has the most bug history of all the tool files. Two size models coexist (see `blocks/splitter.js` below): a splitter with a flex-height ancestor inherits a free definite height and keeps a percent `flexBasis`; a splitter without such an ancestor (root level, or whose nearest splitter ancestor is itself a px-height splitter) uses plain pixel heights. `HANDLE_OFFSET = 10` solves a real conflict: at a px-mode rows-splitter's trailing edge the last pane's bottom and the splitter's own bottom coincide exactly in the Def state — a "closest wins" tiebreaker made one handle permanently unreachable (an identical distance always resolved to the same side); the solution offsets each handle's hit zone away from the shared edge (child above, root below) so no tiebreaker is needed. A custom SVG cursor for `CURSOR_VERTICAL` was abandoned after being reported invisible in a VS Code Live Preview webview (custom data-URI cursors aren't reliably supported there); the disambiguation is now carried by the drag tooltip's text label instead of the cursor shape. `findPlainNodeEdgeAt()` stopped excluding the implicit root "Canvas" container element — it was wrong to assume the user never wants to resize it directly, especially on an otherwise empty canvas; a padding-less wrapper-with-one-child conflict (identical boundaries, no size difference to sort on) is instead resolved via nesting depth, in favor of the more specific (innermost) node. `plainNodeIsResizable()` deliberately does NOT reuse `element_capabilities.js`'s `isResizable()` flag (it means something else, see above) — doing so silently blocked height resize on every button/form node. `startDragPercent()` maps the mouse position 0..1 over just the COMBINED share of panes A+B (not a raw 0-100%), otherwise the total across all panes is pushed past 100% as soon as a third pane exists.

**`tools/split.js`**: a previous custom scissors+orientation SVG cursor turned out never to actually render, for the same root cause as the Cursor Engine in general (section 10) — it globally suppresses native cursors and resolves its own SVG overlays solely from CSS `cursor:` KEYWORDS, never from a raw `url()` value. The solution registers the scissors graphic as an entirely new engine cursor (`registerCustomCursors()`) instead of switching to a built-in keyword (the path `resize.js` chose for its corresponding problem). `splitRows()`/`splitColumns()` turn the clicked node into the splitter IN PLACE (same id, same position within its parent) — nothing is wrapped from the outside. `addSiblingPaneRows()`/`addSiblingPaneColumns()` ("Add Pane") always add the new pane to the clicked node's PARENT splitter, never inside the node itself — a previous version special-cased an empty clicked node by silently reinterpreting Add Pane as a nested Split, which broke the deliberate user choice between the two dialogs. The "Add Pane or Split?" dialog is only ambiguous when the clicked node is already a pane in a splitter running the SAME direction being applied — a different direction has only one meaningful interpretation (nest), no question needed.

**`tools/text.js`**: `pendingStyle`/`pendingTag` is staged style/tag for the NEXT text node created while nothing is selected (the same "configure before you place it" idea, for style and `props.tag` respectively) — they never retroactively touch an existing node's style. `enterTextEdit()` selects the node immediately at edit start (not just at commit), so everything tied to `app.designer.selection` (toolbar, outline, Layers row) reacts immediately. Switching tools mid-edit always commits the typed text, same as a blur.

### The splitter block and the layout model (`blocks/splitter.js`, `designer_objectmodel.js`)

The splitter node has two size models depending on whether it has a flex-height ancestor (percent `flexBasis`, ordinary flex `.db-splitter-pane`) or not (plain pixel heights, `px-mode` class, `display:block`). In px-mode a CSS custom property, `--db-pane-h`, was used to stretch a pane's child `.db-node` to fill the pane's full, literal pixel height. Two other techniques were tried and abandoned: `position:absolute;inset:0` never works because every block's renderer already sets `position:relative` as its own inline style (which always beats a stylesheet rule); `height:100%` resolved unpredictably as soon as more than one auto-height box sat between the pane and a genuinely definite-height ancestor — the percentage "reached through" several intermediate boxes and blew a nested pane up to an unrelated size. Custom properties inherit through auto-height boxes without the percentage resolution's ambiguity, and every pane boundary always declares a value (the real px number or the literal string `"auto"` for the Def state) to block accidental inheritance from a completely unrelated outer pane.

Injected CSS in `designer_objectmodel.js` carries several layers of bug history on top of this base model: `.db-splitter-pane > .db-node { flex:1; min-height:0 }` makes a pane's child always fill its wrapper (otherwise "dead space" in the wrapper gave a hit test that skipped past the child to the splitter itself, and showed "Splitter" instead of the pane's own content type in tools that read `closest('.db-node')`). A NESTED splitter inside a pane instead resets `min-height:auto` (more specific, 3 classes vs 2) — it is itself a flex container with its own children that have a real min-height floor, and `min-height:0` had hidden a silent overflow past the splitter's own edge. A rows-splitter's hover-highlight border is gated on BOTH hover AND active tool (`db-split-row-hover`, toggled in `designer_hover_overlay.js`) because pure CSS `:hover` cannot express the AND condition. A row-directed splitter at/near the document root previously got no rendered height at all (the root's implicit `layout:{mode:'flow'}` is `height:auto`, so percent flexBasis had nothing definite to resolve against) — two CSS-only fixes (blanket `height:100%`, then `:has()`+`:only-child` scoping) were abandoned because they applied unconditionally regardless of direction and stretched elements that shouldn't fill the whole canvas; the actual fix is in JS: `convertToRowSplitter` gives the splitter a small explicit `layout.height` (pane count × 40px) at conversion time, only when nothing else already gives a definite height, rendered through the same `buildStyle()` mechanism as every other node.

`convertToRowSplitter`/`convertToColumnSplitter` have their own extensive bug history around which field (`layout.height` vs `props.height`) carries the pre-split height, how it is divided between the two new panes depending on Def/Defined state, and why `flexBasis`/`width` must be stripped from pane1's inherited layout (an inherited inline `layout.width` always beats the CSS rule that would otherwise have filled the pane's full width — found live as an 800px node split at 75% rendering pane1 at the full 800px instead of its 600px share). `tools/split.js`'s `_snapshotNode()`/`_applyNodeSnapshot()` capture the mutable fields these functions overwrite, so a split can be undone/redone by toggling the snapshot instead of re-running the conversion (which would mint new pane ids on every redo).

### The dock panels

`designer_dock.js` is the core registry/renderer for `#designerProperties`. `designer_dock_resizable.js` always runs `$c.resizable('destroy')` before rebinding, because the dock's `render()` rebuilds the container via `innerHTML` on every change, which destroys jQuery UI's handle elements but leaves the cursor class behind; its `'w'` handle is moved to `left:0px` (jQuery UI's default wedges it half outside the container's left edge, right on top of the vertical scrollbar `#scrollbarY`, which wins the hit test). `designer_dock_sortable.js` syncs the new DOM order to each panel's `sort` value (in gaps of 10, for future insertions) WITHOUT triggering a re-render mid-drag-settle.

Several panels share the same "flush tabs in the title row instead of a text heading" pattern, because `designer_dock.js`'s `.dock-title` only treats the title as an opaque HTML string: `designer_boxmodel_panel.js`'s four `DELEGATE_TABS` tabs (Box/Position/Text/... — the `'gradients'`/`'patterns'` tabs are dispatched straight to the Gradients/Patterns panels' own `renderInto(container)`), `designer_layers_panel.js`'s Layers/Elements pair, `designer_groups_panel.js`'s six BOX/POSITION/TEXT/BACKGROUND/BORDER/EFFECTS tabs (too many for one row — scrolls horizontally with a hidden scrollbar, unlike the Layers/Elements two-tab pair). Each one scopes its `.dock-title` override to its own `[data-dock-id]` so Properties/History/etc. keep their ordinary text-based title behavior.

`designer_boxmodel_panel.js`'s `PROP_OF`/`SECTION_COLOR` tables are deliberately shared by the diagram, the field rows and the commit handler (but are an independent copy of `designer_groups_panel.js`'s corresponding `SIZE_UNITS`/cascade read layer — the program's convention for small per-file constant tables rather than a cross-file import, because the `designer_*.js` files are `app.includeModule` siblings without real ES imports between each other). The panel reads `resolveComputedStyle` (Style Binding) to show the RESOLVED cascade value, not raw `node.style`. Both it and `designer_layers_panel.js` register their `render()` on BOTH the dock's render hook (catches drag-reorder/resize/save-load, which otherwise resets the panel to its original add() placeholder) AND `app.designer._registerRenderHook` (catches canvas-level changes) AND a `'designer-selection-changed'` listener (a pure selection change never triggers a canvas render by itself).

`designer_layers_panel.js`'s `BLOCK_ICONS` uses emoji, not the OS's SVG sprite — the sprite completely lacks an entry for image/button/layout/custom, and reusing a shared container icon for them would have put two visually identical tiles in the flat grid. Its "+" add menu and `designer_menu.js`'s own submenu share the same teleported-to-`document.body` pattern with a capture-phase outside-click closer (the bubble phase would have missed a click whose own trigger already called `stopPropagation()`, e.g. an `app.ui.dropmenu` instance).

The color system: `designer_color_history.js` owns the Properties panel's "Color" tab (map/slider for the FG/BG slots); `applyColor()` updates the mini swatch directly without a full re-render mid-drag, and commits to Recent only on `pointerup` (release), not on every intermediate sample. `designer_color_element.js` (ColorElementView/ColorGroupView) is the swatch factory, including the compact "stacked" toolbox layout (Photoshop-style foreground/background, overlapping squares + corner swap/reset). `designer_color_picker_window.js` is a standalone Photoshop-like advanced picker. `designer_gradients_panel.js`/`designer_patterns_panel.js` share the CRUD shape and a common "asset grid" CSS look with color-history; a Chromium-specific bug (`background:none` chokes a native `<input type=color>` swatch's own color fill) is fixed in both via `-webkit-appearance:none` + explicit `::-webkit-color-swatch*` pseudo-element rules instead.

### The canvas toolbar and side menu

`designer_toolbar.js` (`#designerToolbar`) is shared between the Cursor bar (node selected) and the text-formatting bar (Text Tool active) — the same element, different content. `fontFamilyOptions()`/`mountDropdowns()` handle the general dropmenu pattern from section 4 (icon-only trigger vs rich HTML list) for the font/weight/edge-smoothing controls. `#designerToolbar`'s CSS `overflow` was changed from `hidden` to `visible`, because `hidden` also clipped the dropdown popups' lists, which must render below the bar's 24px-high row — the window's own `overflow:hidden` is still enough to prevent accidental horizontal overflow.

`designer_menu.js` (`#designerMenuList`, the side bar) has `toolIds` per item so `setActiveTool()` can highlight the right icon regardless of the active tool (one icon can cover several ids, e.g. Splitter covers `'split-rows'`+`'split-columns'`). Submenus are teleported fixed-position popups, the same pattern as the window menu system (section 3). The side menu's categories took their current form after iterative direct feedback: Container/Form were merged with Image/Button; Splitter activates click-to-split mode; Move is gated behind `activeTool` (unlike Resize, which is ambient); Text Tool has its tag picker in the toolbar instead of its own side category (its submenu has a top-level click that activates Normal Text directly); "Wave Text" was removed from the UI but `blocks/text.js` still renders existing `textMode:'wave'` nodes correctly (no migration needed); Color Picker is a one-shot eyedropper with no persistent mode.

### The hover/selection overlay (`designer_hover_overlay.js`, `designer_selection.js`)

Two independent floating tags (selection tag + hover tag), both `position:fixed` on `document.body` (not descendants of the Designer window). `designer_selection.js` is the single source of truth for the selected node; its render hook validates against fresh DOM (a re-render can remove the selected node's element), and its `'designer-node-inserted'` listener selects what was just inserted, exactly like a click — a single place decides this instead of every consumer (outline, tag) independently reacting to the insert event.

The click handler on `.db-node` is delegated to the same selector and gate (`activeTool==='select'`) as `tools/select.js`'s own — previously unconditional, which cloned the selection another tool's own click handler had just set on the same event (found via `tools/text.js`: entering edit mode selected the text node, then immediately re-selected whichever `.db-node` physically sat under the click). Moving from a `.db-node` to empty canvas area (still inside `#designerCanvasBody`, so the canvas-level mouseleave never fires) previously fell through silently and left the last-hovered tag visible — now handled explicitly.

The window-drag handling in `init()` observes the Designer window's `style` attribute (MutationObserver) to reposition the tags: a pure position move of the window never triggers a ResizeObserver, and the tags had stayed at their old screen position. A Snap Layout commit sets its final position together with a CSS transition — the style attribute (and thus the observer) fires immediately, but the element doesn't stop moving until the transition finishes ~300ms later, so a same-tick `getBoundingClientRect()` read is stale (the same bug class as "Maximize restore stale-read bug", section 3) — repositioning therefore happens both immediately (for responsiveness during the drag) and once more after the transition's duration. The observer also watches `class` (not just `style`), because focus changes toggle `.active` and that is how the tags know to hide behind another active window.

`.db-node`'s `min-height:40px` is a permanent baseline (no `padding-top` reserved for the tag, which is a pure overlay) — a previous `padding-top:15px` approach escalated badly through nested splitters, where each level added another 15px and caused a visible height-overflow bug.

### Dialogs and other canvas widgets

`designer_animation_dialog.js`/`designer_border_dialog.js`/`designer_sides_dialog.js` share `_pending`/`_uiReady` module variables (a stashed `{options}` consumed synchronously in `body()`; a Promise that waits for `app.ui.dropmenu`). `designer_border_dialog.js`'s injected CSS needed element+class specificity (`input.dbd-width`, not just `.dbd-width`) to beat the global `input.def` rule's `width:calc(100% - 2px)`, which otherwise swelled the field to ~266px in a 360px row. `designer_sides_dialog.js`'s field markup uses plain `<div>`, not `<label>`, around each side input's pair of input+unit dropdown — a `<label>` wrapping TWO focusable controls forwards a click on the dropdown to the label's implicitly associated first control (the same "label wraps two controls" bug documented generally in the memory notes). The same file's `wireDialog()` fills ALL sides' dropdown mounts before `initAll()` is called once — interleaving per-side `innerHTML` writes with a per-side `initAll()` call left later mounts unresponsive even though their "ready" marker was still set.

`designer_ruler.js` draws top/left px rulers with rotated (-90°) left-label text and a draggable guide line whose invisible "hit" box is wider than the visible 1px line for easier gripping. `designer_scrollbar.js`'s injected `::-webkit-scrollbar{display:none}` is needed specifically for WebKit/Blink (Firefox/old Edge is already hidden inline in `designer.js`); its `ResizeObserver` watches both the viewport and the scrollable content, because either can change the scroll extent (e.g. the device-mode dropdown resizing `#designerCanvasBody`). `designer_devicemode.js`'s dropdown opens upward (`direction:'up'`, it sits at the bottom of the canvas) with several scoped style overrides against the shared dropmenu CSS (sized for stacked settings rows, not a fixed 24px strip). `designer_tabs.js`'s sort mousedown activates the tab (rebuilds the DOM via `render()`) before the drag starts, and therefore has to re-queue the DOM element afterward because the original jQuery context goes stale.

---

## 19. Notepad (`program/notepad/*`)

Multiple windows are supported (`multistart:true`); `exec(action)` sets `app.config.set('notepad', 'activeWindowId', ...)` before calling the command, so Explorer's file-picker dialog (opened from Notepad's Open/Save As) knows which Notepad window is its "parent". Live language switching is limited to the window's title (see section 5) — the menu's `_("File")` keys and the status bar's initial text are computed once at `windowStart()` and frozen there, the same pattern `notepad_data.js` then overwrites with live cursor values; safely rebuilding the menu/status text without clashing with that update logic was left as a larger separate task.

All tabs in a window share ONE `<textarea>`, whose `.value` is swapped on tab activation — a deliberate trade-off, not an oversight (see the memory note "Notepad tabs + title menu"): `win._np.undo`/`redo` use the browser's `document.execCommand("undo")` history, which lives on the `<textarea>` element itself, and swapping `.value` doesn't swap that history, so undo/redo after a tab switch can nest into another tab's edit history. A separate `<textarea>` per tab would have solved it correctly but requires re-wiring every `editor.*` reference in a ~800-line file — documented as out of scope rather than silently ignored. `notepad_tabs.js`'s listener for `'notepad-tab-activated'` MUST be bound before `createTabs(win)` is called, because its seed `add()` fires the event synchronously before it returns. `close(id)` always creates a new empty tab when the last tab is closed — a text editor should never end up completely document-less.

`notepad_data.js`'s `win._np.font()` saves the cursor position before the font dialog steals focus (to work around a known `caret.js` "lastFocusMethod" bug that otherwise jumps the caret to the end of the text on refocus) and restores it AFTER the chosen font has finished loading (otherwise the caret position is measured against the fallback font's width, and the text reflows to the wrong x position when the real font later loads). `allFonts` reads the same shared `app.fonts.get()` registry as Designer (section 18), not its own hard-coded list; `SYSTEM_FONT_NAMES` is a separate local list of names that render directly without `loadGF()`'s Google Fonts network call. `setup.js`'s "New Text File" entry in Explorer's New submenu is registered as a `() => _(...)` thunk (see section 5) because it is registered BEFORE the program's own language file has loaded.

---

## 20. Media Player (`program/mediaplayer/*`)

`setup.js`'s overlay CSS (`#mp-overlay-styles`) is injected as a standalone `<style>` tag instead of via `app.addProgramCSS`, deliberately: the latter removes its CSS when the last program window closes, but the status icon and its toggle-overlay panel (section 4) must work even when no player window is open. The Explorer meta panel's compact audio-player widget is registered already in `setup()` (boot time) so an already-open Explorer window picks it up directly. `os.language.registerRefresh("mediaplayer-overlay", ...)` is a permanent registration that is never unregistered (unlike per-window tokens) because the status icon/overlay is a singleton that lives the whole session — `_refreshOverlay()` is already safe to run as a no-op when the panel is not open. The panel opens with `height:"auto"` (rendered height varies with the track list's length), and the returned `.reposition()` handle is re-run every time the content is swapped in place.

The context menu in `mediaplayer.js`'s `body(win)` is bound to `#${instanceId}-root` (not the window's root element), specifically to avoid triggering `program.add()`'s own click chain. `mediaplayer_data.js`'s instance object exposes `_updateWindowTitle`/`_updateMeta` specifically so the language-switch refresh can recompute the title and track-info fallback without duplicating the logic outside the file.

---

## 21. Mail (`program/mail/*`)

`start()`'s `body(win)` limits live language switching to the window's own title — the side panel's nav labels and the Compose/Contacts views are currently not wrapped in `_()` at all. `win.state.close(...)` defers `os.removeCSS("Mail")` by 450ms via `setTimeout` instead of immediately: `window.js`'s `_performWindowClose` sends the `close` event BEFORE the window's 400ms fade-out animation (basic.css) has finished, so the CSS would otherwise be removed while the window is still visibly closing. The layout (`columns`) is rendered via `os.ui.body()` instead of raw HTML specifically so the `{ script }` node (`mail_data.js`'s `data()`) is triggered automatically.

`mail_api.js`'s local fallback for `sendEmail()` escapes `payload.body` (`app.util.escapeHtml`) before wrapping it in `<p>` markup — otherwise a sent message could inject HTML into its own or a recipient's detail view. `markRead()`/`toggleStar()` update the cache optimistically, before the backend response. `mail_data.js`'s `data(os)` finds the most recently created, not-yet-initialized window by scanning `containers` BACKWARDS — correctly handling several simultaneously open Mail windows. `app.mail._api` is exposed globally so the Start menu's compact mail tab (a different context) can reach the same API instance. The initial load has a two-step fallback: `api.listEmails()` fills the cache via `seed()` internally; if the call itself throws, the code falls back to a direct `api.load()`.

`setup.js` builds `app.mail` SYNCHRONOUSLY right at the start of `setup()` (before any awaits) — `startmenu.js`'s `createEmailTab()` is called independently at boot and must find `app.mail` already then. `mail_data.js` is loaded eagerly (not lazily) for the same reason, so the Start menu's mail tab has real data directly at boot. `style.css`'s `.layout-compact`/`.layout-mobile` are controlled by JS-set classes (`ResizeObserver` on the window's actual width), not viewport `@media` queries — in an OS with several simultaneously visible windows, the window's width, not the browser window's, is the relevant measure.

---

## 22. Solitaire (`program/solitaire/*`)

`solitaire.js`'s `body(windowObj)` sets `solitaire.win = windowObj` via `setTimeout(...,0)`, because `body()` runs synchronously INSIDE the same `windowStart()` call that creates the `solitaire` variable further down — a direct assignment would have hit the variable's temporal dead zone. `let solitaire = {...}` is built in two steps (base object, then `Object.assign` for factory functions that close over `solitaire` itself) for the same reason. Only the window title is re-registered for language switching — the High Scores/"you won" dialogs are rebuilt from scratch every time they open.

`solitaire_config.js`'s `cardOffset*`/`CARD_WIDTH`/`CARD_HEIGHT` must be kept in sync by hand with the `"lg"` entry in `solitaire_sizing.js`'s `SIZE_TIERS`. `cardBackId` is read directly from `localStorage` at config creation so it matches the `deck-<id>` class `solitaire.js`'s DOM template already applied at the same initial render (the template is built before the `solitaire` object is constructed — both must compute the same default independently). `_activeSizeTier` deliberately starts as `null` (not `"lg"`) so the very first `applySizeTier()` call always runs fully. `solitaire_deckchooser.js`'s `DECKS` names are thunks (see section 5).

The undo/redo system (`solitaire_dragdrop.js`/`solitaire_functions.js`/`solitaire_history.js`) builds `doDrop()` so it is reused unchanged for both `do()` and `redo()` — the scoring (`score.ten`/`score.three`) is idempotent. `moveCardToSlot()`'s `.then()` callback leaves `do()` empty in the history call (animation+score have already happened by the time the promise resolved) — a later `redo()` goes instead via `history.redoMove()`, a synchronous non-animated equivalent, because reusing `moveCardToSlot()` for redo would have recursed back into the same `execute()` call. `undoMove()`'s "drop"/"doubleclick" branch slices (copies) `move.args.cardIds` instead of aliasing directly, because the same array can still be held by a `do()`/`redo()` closure.

`.card-back`'s deck-1 pattern (green diagonal stripes) is the unconditional CSS fallback if something were to render `.solitaire-game` without a `deck-N` class; decks 2-8 are pure CSS patterns (no image resources in the program). Size tiers (`.size-md`/`.size-sm`) are discrete, JS-switched classes based on measured window width — not fluid CSS scaling; at the smallest tier the center symbols are hidden entirely (only top-left rank/suit) instead of shrinking further.

---

## 23. Other programs

**Calc** (`program/calc/setup.js`): `os.language.loadProgram("calc")` takes the program's FOLDER name ("calc"), not its registered id ("calculator") — they differ for several programs in the codebase, and the fetch path must match the real folder on disk (`program/calc/lang/...`), a real pitfall if the pattern is copied without thought to a new program.

**GUI showcase** (`program/gui/gui.js`): a static reference/showcase with no editable state — only the window title is re-registered for language switching, consistent with the scope in the other programs, even though a full rebuild would have been safe too (all six sections are already built into a single HTML string with no per-tab render function to re-run separately).

**Formbuilder** (`program/formbuilder/formbuilder.js`): the same title-only language-switch scope as Notepad/Mail/GUI — the various dialog bodies are already rebuilt from scratch every time they open.

**Voiceinput** (`program/voiceinput/voiceinput.js`): no `registerRefresh` wiring at all (see section 5) — the only UI is a short-lived `app.ui.toggle.window()` overlay with no real window to hang a leak-safe refresh pair on; `body()` is already rebuilt from scratch on every open.

---

## Design principles that recur

- **A program owns its own registration.** There is no central "list of image types" or "list of audio types" in the Explorer/Media Player layer — every program declares itself via `addInfo`/`openWith`, and shared systems (Explorer, taskbar, Start menu) read from those registries.
- **`setup()` = boot-critical state, `start()` = lazy UI.** Anything other parts of the system might depend on (icons, `extInfo`, `fileHandlers`) must be set in `setup()`, never in `start()`.
- **An image/file always refers to a specific entry, regardless of multi-select.** Explorer's `rowMenu()`, the shared `buildContextMenu()`, and the desktop icons' own multi-drag all consistently distinguish "the whole selection" (Copy/Cut/Delete) from "the specifically clicked entry" (Open/Rename/Set as background) — the latter never disappear just because several items happen to be selected.
- **Timeouts are a safety valve, not the flow.** `app.dom.waitFor`, `setBackgroundImage`'s fetch, `waitForTransitionEnd` — all have a timeout, but the reactive/event-based path (MutationObserver, `await fetch`, `transitionend`) is always what actually decides when something is done. A timeout that fires in normal operation is a sign that something else is wrong — the notification system's now-fixed `#timeDisplay` wait (section 9) and the taskbar's position race (section 6) are both concrete examples of exactly that.
- **A `forEach`/loop over independent consumers needs a per-item try/catch.** A synchronously thrown error in ONE registration (a menu item in `menu-body.js`, dock panels in `designer.js`, render hooks in `designer_objectmodel.js`) must never silently skip every subsequent registration in the same array for the rest of the session — the same pattern was discovered and fixed independently in at least three different subsystems.
- **Frozen translation thunks are a recurring, general bug class.** `_()` resolved once at module/registration time freezes that string to the boot language forever; the fix is consistently the same — defer to a `() => _(...)` thunk, resolved only at actual render/open time. Found and fixed independently in Explorer's New menu, the desktop icons' context menu, Notepad's New menu, Solitaire's deck chooser and several `startmenu`/`taskbar` places (see section 5).
- **Teleported overlays (fixed on `document.body`) need their own z-index and outside-click-to-close handling, often in the capture phase.** Menus, dropdowns, tooltips and Designer's hover tags all escape their ancestors' `overflow:hidden`/stacking context the same way — and a trigger that already calls `stopPropagation()` requires the closing listener to sit in the capture phase to still see the click.
- **A CSS transition's actual end state can be stale in the same tick it starts.** Reading `getBoundingClientRect()`/`.width()`/`.height()` immediately after a transition is triggered (window maximize, Designer tags repositioning after a Snap Layout commit) often gives the OLD value — either read the known, already-computed JS value instead, or wait for `transitionend`.

---

## Deliberately left out of this consolidation

A number of files were covered by the comment-migration pass but yielded nothing substantial to bring in here: `sandstorm/core/modules.js`, `sandstorm/core/security.js`, `sandstorm/core/utils.js`, `sandstorm/state/store.js`, `sandstorm/ui/css.js`, `sandstorm/basic.css`, `login/login.css`, `explorer/explorer.js`, `designer/core/parser.js`, `designer/core/registry.js`, and `blocks/button.js`/`container.js`/`custom.js`/`form.js`/`image.js`/`layout.js` contained no substantial in-body comments at all (already clean logic or already fully documented via JSDoc headers, which the migration never touched). The network monitor (`networkmonitor`) and the desktop/Start-menu widgets were mentioned in the scope for one of the migration agents but yielded no content — likely for the same reason. A number of individual constant tables (`FONT_SIZE_UNITS`/`SIZE_UNITS`/`SOURCE_COLOR` repeated as independent copies across several `designer_*.js` files, `PREVIEW_MIN_PERCENT` duplicated between `tools/resize.js` and `tools/split.js`) are mentioned here only once as a pattern rather than once per file, because they are genuinely repetitive instances of the same already-documented convention.
