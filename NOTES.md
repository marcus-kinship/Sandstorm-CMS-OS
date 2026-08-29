# Sandstorm OS/CMS — implementation notes

Combined from the per-folder `NOTES.md` files scattered across the repo.
Each top-level section below corresponds to one original file; its own
heading structure is preserved underneath.

---

# sandstorm/components/NOTES.md

# sandstorm/components — implementation notes

Background/history notes extracted out of inline code comments, organized
by file. The source keeps standard JSDoc; longer "why"/history narrative
lives here.

## load.js

**Preload phase** (`system()`, before the sequential systemfile import
loop): fires `<link rel="modulepreload">` for every systemfile/program URL
the sequential import loops will need, so the browser fetches/parses/
compiles them all in parallel in the background starting right away. This
is intentionally *not* a full parallel-fetch-then-topologically-sorted-init
rewrite — most systemfiles run side-effecting code at module top level
(e.g. `desktop.js` calls `app.svg.global.load()` immediately, not inside a
deferred init hook), so *execution* order still has to match the declared
array order exactly. Preloading only removes network latency from that
critical path: each later `await import(...)` / `await
app.includeProgram(...)` resolves against an already-warm cache instead of
a fresh round-trip. Fire-and-forget — never awaited, so a slow/failed
preload for one file can't block or break boot; the real sequential loops
fall back to a normal network fetch for anything not yet warm.

**Critical startup steps**: a step shaped `[{ call: "functionPath",
critical: true }, ...]` re-throws on failure instead of just logging and
continuing — lets a boot step that truly must succeed actually stop boot
rather than silently leaving the system in a half-initialized state.

**Autorun timing** (`animMs` sleep before autorun programs open): reads the
taskbar's configured animation duration directly with a safe fallback to 0,
rather than polling in a `requestAnimationFrame` loop, so autorun programs
don't visually launch before the taskbar's own entrance animation settles.

---

# sandstorm/components/ui/NOTES.md

# sandstorm/components/ui — implementation notes

## window.js — `functions.maximize()`

**Tooltip update on click**: `app.ui.tooltip`'s own mouseenter/mouseleave
handlers (`sandstorm/components/ui.js`) move a button's `title` into
`data-tooltip` (and remove `title`) the moment the cursor enters it,
restoring `title` from `data-tooltip` only on mouseleave. Clicking the
maximize button never leaves it first, so while `data-tooltip` is present
that's the live copy — writing `title` directly would sit unused until the
*next* mouseleave overwrote it right back with the stale pre-click text.
Fix: write to whichever of `title`/`data-tooltip` is actually live.

**Restore-branch sizing (`restoredWidth`/`restoredHeight`)**:
`windowElement.width()`/`.height()` are deliberately *not* used in the
taskbar-bounds check here — the width/height/top/left just set above are
mid-transition (400ms ease-out), so a live measurement taken this same
tick can still reflect the *maximized* size for a moment, before the
browser has visually applied the new one. That stale (much taller) height
made the "keep window above the bottom taskbar" check think the restored
window would overflow the screen, forcing `top` back down to ~0 — the
window "restoring" to top-center instead of its actual pre-maximize
position. `originalWidth`/`originalHeight` are the exact values just
assigned, so using them directly is both correct and avoids the stale read.

**Maximize-branch capture (raw inline style, not computed style)**: reads
`windowElement[0].style.top`/`.left` directly rather than `windowElement.css(...)`
before maximizing — if a snap-to-edge transition (`left 0.3s ease`,
`top 0.3s ease`) is still animating when maximize is triggered, the
computed style would return the live mid-animation value instead of the
actual target position to restore to later. Same root cause as the
restore-branch note above: never trust a live-measured value while a CSS
transition on that same property might still be in flight.

## window.js — drag-to-edge snap (top-drag maximize)

This is a second, separate code path (triggered by dragging a window to
the top of the screen) that duplicates `functions.maximize()`'s own
capture-before-maximizing logic — see `_didSnap`'s `else` branch (the
`point` case, as opposed to left/right edge snapping). Same raw-inline-
style-over-computed-style reasoning applies here for the same reason: a
still-animating snap transition could otherwise be captured mid-flight.
The subsequent CSS block mirrors the exact styles `functions.maximize()`
itself applies, so the window ends up in an identical maximized state
regardless of which path triggered it.

Left/right edge snapping (the `!point` branch just above) derives its
target position from `app.desktop.getWorkspaceRect()` rather than the
snap-preview layer's own offset, because that layer may still be
mid-animation when the drop happens — reading its live position would risk
the same kind of stale-mid-transition value.

## window.js — resize-handle jitter fix

A `mousedown.snapfix` handler is bound on every `.ui-resizable-*` handle,
firing *before* jQuery UI's own `_mouseStart` bubbles up and captures
`originalPosition`. It (a) cancels any pending transition timeout and (b)
snaps all four geometry values (`left`/`top`/`width`/`height`) to their
current computed state. This eliminates a resize-jitter bug where
mid-animation position/size values got captured as the resize's starting
point instead of the settled ones.

Similarly, the periodic taskbar-offset/workspace adjustment loop skips
windows the user is actively resizing or dragging
(`.ui-resizable-resizing`, `.ui-draggable-dragging`) — overwriting
`left`/`top` while jQuery UI is mid-drag is what caused a north/west
resize-handle jitter bug (this loop's writes raced jQuery UI's own
`left`/`top` writes; east/south handles were unaffected since resizing
from those edges never touches `left`/`top`).

## window.js — `position:'window-title'` + `mobileicon` responsive overflow

No fixed breakpoint: the title row's natural (unclipped) width is cached
once at mount, then compared against the header's live available width on
every resize. `.window-header` is `flex:1` with `flex-basis:0%`, so its
`clientWidth` always equals "row width minus `.controls` width" — a stable
budget that doesn't change just because the menu moves in or out of it,
which avoids feedback loops with the code's own DOM writes. When it stops
fitting, the *same* `.menu-container` node (not a rebuilt copy) is moved
into the window-icon's existing `.control-menu` popup, reusing all its
existing click/submenu event handling as-is; moved back once it fits again.

## toggleWindow.js

**Outside-click detection uses `composedPath()`, not a live
`event.target.closest()` check**: a delegated click handler on the panel's
own content (e.g. one that does `panelEl.innerHTML = "..."` to refresh
itself, as `aichat.js`'s session/program pickers do) can detach the
original click target from the document *while this same click event is
still bubbling* — a live `closest()` on a detached node then always returns
nothing, so the panel would incorrectly close on every in-place refresh.
`composedPath()` is captured at dispatch time and stays valid regardless of
what handlers upstream did to the DOM.

jQuery wraps the native event in its own `jQuery.Event` — `composedPath()`
called on that wrapper returns an empty array (jQuery's event normalization
doesn't proxy it correctly), so the pristine native event is pulled out via
`.originalEvent` first.

---

# sandstorm/components/explorer/NOTES.md

# sandstorm/components/explorer — implementation notes

## setup.js

**Built-in file-type icons** (`_fileTypeIcons`): registers a real
`app.program.extInfo[ext]` icon for common file types that have no real
registered program in this demo OS (no Word/Excel/Acrobat/archive-manager
clone). Without these, the same file rendered differently depending on
where it was shown — a colored text badge in the file list/grid (`_extIcon`)
vs. the plain `#ic-file-generic` glyph in a folder's icon preview
(`_folderPreviewIconHTML`) — registering a real extInfo icon here means
both call sites resolve the exact same icon, so a file looks identical
everywhere it appears. Fixed light page + dark label (not `currentColor`)
so the label stays legible regardless of the surrounding theme/color
context.

**Properties dialog body**: `app.ui.alert` only renders `options.body` (a
function returning HTML) — `options.message` is never read, so a plain
string there silently renders as an empty dialog.

**`app.shortcut`**: not a separate icon/desktop system — shortcuts are just
another entry type in the same `app.explorer._fs` tree as folder/file, so
they get copy/cut/paste/move/delete/rename for free (those functions are
already type-agnostic) and desktop rendering for free (via
`app.explorer.icon.forEntry` + `app.desktop.icon.refreshFs`, both already
built). `path` is only ever the entry's placement — `target` is its stable
identity; renaming, moving, or copying a shortcut never touches `target`.

`"fullscreen"` is a user-facing name — maps internally to
`window.mode="maximized"`. There is no separate fullscreen window state in
Sandstorm. `_resolveStartMode`/`_validateStartMode` are the single source
of truth for what a shortcut's `startMode` means/what counts as valid —
used by `launch()`/`launchDraft()`/`create()`/`update()`, so a draft
test-run and a saved shortcut can never disagree.

(more notes pending — file not fully audited yet)

## explorer.js

**Folder icon (grid/icon view)**: a folder shape with a real content
preview — an image thumbnail, or a cascading stack of up to 4 equally-sized
content icons (each a colored circle chip, no card background) —
composited from three layers (back shape / HTML preview / front flap) via
CSS instead of one baked SVG string. Resting state is half-open (peeking a
couple of layers) for a non-empty folder, closed for an empty one;
hovering morphs the flap fully open to reveal the whole stack.
Interpolation lives in `app.svg.morph()`/`morphPath()` (`svg-morph.js`) —
`_FOLDER_SHAPES` just supplies the folder's own keyframe data.

**Preview chip stacking step** (`_folderPreviewIconHTML`'s `pos`): each
layer sits 6% lower and in front of the previous — a smaller step than the
chip's own size (see `.exp-folder-chip` in `explorer.css`) so every layer
still peeks out above the resting half-open flap. At an earlier 10%/layer
step the 3rd chip's top edge landed below the flap's rest boundary and was
fully hidden (looked like a missing/colorless chip).

(explorer.js has many more short design-rationale comments not extracted
here — only the longest/clearest bug-history and architecture blocks were
moved; short 1-3 line notes were left in place as acceptable inline
context.)

## explorer.css

**Breadcrumb collapse below 425px** (`.exp-breadcrumb`): stays
`position:absolute` (removed from the toolbar's flex flow) even while
hidden, so opening/closing only ever animates opacity + transform.
Toggling `position` itself, or `width:0` vs `width:auto`, can't be
transitioned by the browser — that's why it used to snap instead of
animating.

---

# program/designer/NOTES.md

# Designer — implementation notes

Background/history notes for `program/designer/`, extracted out of inline
code comments so the source only carries standard JSDoc. Organized by file.

## Tool separation (Select / Split / Resize / Move / Text)

Five peer tools, in `program/designer/tools/`, each with a distinct,
non-overlapping responsibility — none of them reach into another's job:

| Tool | File | Touches | Gated by `activeTool`? |
|---|---|---|---|
| Select | `tools/select.js` | `app.designer.selection` only | Yes (`'select'`) |
| Split | `tools/split.js` | Creates/restructures nodes (`convertToRowSplitter`/`convertToColumnSplitter`); sets a *new* pane's initial `flexBasis` | Yes (`'split-rows'`/`'split-columns'`) |
| Resize | `tools/resize.js` | Rewrites an *existing* pane's `props.flexBasis` only — never creates, removes, or reparents a node | No — ambient, works on hover regardless of active tool |
| Move | `tools/move.js` | Reparents a node (`Document.removeNode` + `insertNode` of the *same* instance) — never creates a node, never touches `flexBasis`, never converts a node to a splitter | Yes (`'move'`) |
| Text | `tools/text.js` | A `text` node's own `props.value` (editing), or inserts a new `text` node *inside* a non-text node (creating) — never touches `flexBasis`, never reparents, never converts to a splitter | Yes (`'text'`) |

**`tools/text.js`**: clicking a `type: 'text'` node enters `contentEditable`
edit mode on it directly, caret placed at the clicked point
(`caretRangeFromPoint`/`caretPositionFromPoint`). Clicking anything else
inserts a new empty `text` node (tag `p`) *inside* it and immediately edits
that. Exits on blur or Ctrl+Enter, only writing `props.value` (and only
logging history / re-rendering) if the text actually changed — a click
that opens and immediately closes edit mode with no typing is a no-op, not
a spurious history entry. Switching to a *different* tool mid-edit — via
the sidebar, Escape, or any other path — still commits whatever was typed:
`designer_objectmodel.js`'s `setActiveTool()` broadcasts a
`'designer-tool-changed'` event whenever the active tool actually changes,
and `text.js` listens for that rather than needing every other tool to
know a text edit might be in progress. (An earlier draft tried polling via
`MutationObserver` on `document.body`'s class list — fragile, since only
the Select tool happens to toggle a body class; the broadcast event is the
correct fix and works for any future tool too.)

The existing "Text" *category* (`id: 'text'` in `designer.js`, a
drag-to-insert submenu of tag variants — p/span/h1-h6) is unrelated to the
Text *Tool* (`id: 'text-tool'`) — they share the same T-shaped icon since
both are conceptually "text," but the category opens a flyout of draggable
variants while the tool activates click-to-create-or-edit mode. Don't
confuse the two ids.

Resize deliberately stays ambient rather than requiring its own explicit
tool selection: dragging a splitter boundary is likely the single most
common interaction in the whole editor, and gating it behind a tool switch
(the way Select/Split/Move are gated) would add a click to the most
frequent action for no benefit — the same tradeoff Figma/Photoshop make by
keeping resize handles live under the cursor no matter what tool is active.
`app.designer.resizeTool.isDragging()` exists for other code that needs to
know a resize is in progress, mirroring the `selectTool`/`splitTool`/
`moveTool` namespaces' shape even though Resize has no `activate()`.

Move, by contrast, *is* gated — reparenting a node is a much
higher-consequence action than adjusting a split ratio (it changes the
tree, not just a number), so it needs a deliberate sidebar switch first,
the same way Select/Split do. A node can only be picked up if
`rules/element_capabilities.js` marks it `movable`; a drop target is
rejected if it's the dragged node itself or one of its own descendants
(`Node#find` used as a cheap "is X inside Y's subtree" check).

**`rules/element_capabilities.js`**: per-node-type capability defaults
(`selectable`/`movable`/`resizable`/`splittable`), overridable per-instance
via `node.props.capabilities`. Generalizes what used to be a one-off
`type === 'form'` special case in the split tool (forms can't be split)
into data every tool can consult the same way. `button`/`form` are
`resizable:false` (their size comes from content, not a pane share);
`form`/`text`/`image`/`splitter` are `splittable:false`; `splitter` is also
`resizable:false` (its own "size" is just the sum of its panes, which
Resize already handles pane-by-pane).

## blocks/splitter.js

**Pane sizing (`flexBasis`)**: each pane's own share of the split is stored
on `child.props.flexBasis` — written by `tools/split.js` from where
the split was clicked (e.g. 60/40, not always 50/50), and rewritten by
`tools/resize.js`'s drag interaction afterward. `flex-grow` is 0 (a fixed
percentage, not "share remaining space equally") whenever a basis is set;
falls back to equal-share behavior for any pane that's never been
explicitly sized. `flex-shrink` is 1, not 0 — see "Overflow when a pane's
share can't fit its own floor" below for why that matters.

Panes sit directly adjacent — no handle element between them.
`tools/resize.js` finds the seam and makes it draggable purely
from pane geometry (`getBoundingClientRect`), so there's nothing in the
renderer for it to depend on.

**`min-width:0` / `min-height:40px` on `.db-splitter-pane`**: `min-width:0`
is the standard flexbox reset (a flex item's default `min-width:auto`/
`min-height:auto` refuses to shrink below its content's own intrinsic size,
which would silently override a small flex-basis percentage). `min-height`
gets a real floor instead of that same reset — a rows-direction split with
no minimum could compute a pane down to a sliver (or literally 0px) as its
share shrinks, which isn't useful even though it's "correct" by the
percentage math.

**Why the pane child uses `flex:1`, not `height:100%`** (`.db-splitter-pane
> .db-node`, see `designer_objectmodel.js`): a plain percentage height
doesn't reliably resolve against a size that came from `min-height`
clamping a `flex-basis` percentage — a genuine CSS spec edge case. The
clamped size renders at a definite pixel value (`getComputedStyle` reports
it correctly), but isn't treated as "definite" for a *child's* percentage-
height resolution, so `height:100%` silently fell back to the child's own
intrinsic (near-zero) height whenever the pane's `min-height` was the thing
actually constraining it. Flex distribution doesn't have that ambiguity —
it stretches to the container's real available space directly, so
`.db-splitter-pane` is `display:flex; flex-direction:column` and its child
uses `flex:1` instead.

**Overflow when a pane's share can't fit its own floor**: with two panes at
an uneven split (e.g. 55/45) inside a tightly-constrained container, the
smaller pane's flex-basis share can compute below its own `min-height:40px`
floor — the floor wins (min-height is a hard constraint), so that pane
renders taller than its "fair share." With `flex-shrink:0` (the original
setting) neither pane can shrink to absorb that, so the combined rendered
height silently exceeded the container's own — invisible overflow past the
splitter's bottom edge, no border/clip to reveal it. `flex-shrink:1`
(`blocks/splitter.js`'s render, and `tools/resize.js`'s matching live-drag
inline style) fixes this at the root: a shrinkable sibling now absorbs the
deficit, itself never going below its own `min-height:40px` floor either —
so a too-small combined request degrades to "both panes sit at their
40px floor" instead of overflowing. Shrink only ever activates when the
combined share exceeds the container, so a normal (non-floor-constrained)
split's exact ratio is unaffected — guaranteed by the flexbox spec, not
just by testing. Works together with `designer_objectmodel.js`'s
`.db-splitter-pane > .db-node.db-splitter { min-height: auto }` (a NESTED
splitter needs its own floor correctly recognized by its parent's layout
for this deficit to even be well-defined in the first place).

This whole class of bug used to be worse before an earlier fix removed
`.db-node`'s `padding-top:15px` (previously reserved for the hover/
selection tag's own space) — that padding compounded through every level
of nesting, on top of the floor-vs-percentage tension above. See
`designer_hover_overlay.js`'s section below for that change.

## designer_hover_overlay.js

**Tag positioning (`computeTagPosition`)**: a tag must never touch the
node's own layout (padding/margin/width/height/etc). Both tags are
`position:fixed` on `document.body` — a pure visual overlay, not a
descendant of the node they're labeling — so painting one never adds to
that node's own box in any way.

An earlier version reserved space for the tag via `.db-node`'s own
`padding-top: 15px` instead, letting the tag overlap into that permanent
gap. That worked for a single node, but the padding was real layout space
— every `.db-node` got 15px taller, *including splitters*, whose own
children (further nested splitters, each with their own 15px) compounded
it at every level of nesting. That's what caused a real ~3-5px
height-miscalculation bug on nested splitters (percentage-based flexBasis
math resolving against a container height 15px-per-level too tall) — see
the historyManager memory (`project_history_manager`) for the full
investigation. Switching the tag to a pure overlay — floats just above the
node (`top: rect.top - TAG_HEIGHT`) when there's room in the canvas
viewport, falls back to overlapping the node's own top-left corner when
there isn't (e.g. the node sits right at the top of a scrolled canvas) —
removes the padding-top reservation from `.db-node` entirely, so nothing
about labeling a node ever affects flex/height math again, at any nesting
depth. A few px of visual overlap in that edge-case fallback is still a far
smaller cost than ever mutating node layout.

**Delete button only on the selection tag**: a hover preview is transient
and can appear under the cursor anywhere just from moving the mouse across
the canvas (including as a side effect of a programmatic/test click, which
moves the mouse to the target first). With a clickable delete button on it
too, a click aimed at the node underneath could land on the button instead
— confirmed: on a narrow pane, a plain click meant for e.g. the splitter
tool silently deleted the node instead, because the hover tag's delete
button happened to be sitting right at that screen position. Only a
deliberate selection should be able to delete something.

**`showHoverTag`'s own `mouseleave` listener**: both tags are
`position:fixed` on `document.body`, not descendants of
`#designerCanvasBody`, so moving between them and the canvas correctly
fires real mouseleave/mouseenter (caught by `bindHover`'s own mouseleave
guards, which ignore transitions onto either tag) — but nothing was
listening for leaving *this* tag itself, so it stayed stuck on screen once
the mouse moved off it to anywhere that wasn't back over the canvas.

**`bindHover`**:
- `mouseover`, not `mousemove` — mousemove fires on every single pixel of
  cursor movement, so doing this work (`closest()`, `getBoundingClientRect`,
  a full-document querySelector for the drag check) on every tick got slow.
  `mouseover` only fires when the topmost element under the cursor actually
  changes, and `e.target` is still always that innermost element — same
  "not delegated mouseenter" reasoning as the click binding below (jQuery's
  delegated `mouseenter` fires once per matching ancestor, `e.target` on a
  direct `mouseover` binding doesn't) — so targeting is identical, just far
  fewer calls.
- Click needs its own, separately-shaped binding — `tools/select.js`
  has a *delegated* `.on('click', '.db-node', ...)` handler on this same
  `canvasBody` that calls `e.stopPropagation()`. jQuery's dispatch loop
  treats "delegated matches at the target" and "direct handlers bound
  straight to canvasBody" as separate queue entries, and `stopPropagation`
  partway through the delegated entry skips the rest of the queue entirely
  — so a plain `.on('click', fn)` here never ran for clicks on a node, only
  for clicks that started with no matching `.db-node` at all. Binding
  delegated to the same `.db-node` selector puts this handler in the *same*
  queue entry as the select tool's, which `stopPropagation()` doesn't skip
  (only `stopImmediatePropagation` would, and it doesn't use that) — so
  both fire.

**CSS notes** (`injectCSS`):
- `.db-node { min-height: 40px; padding-top: 15px; }` — a permanent
  baseline (not driven by hover/selection state), kept intentionally taller
  than the tag's own height, for easier drop-targeting.
- `#designerCanvasBody .db-node:hover:not(.db-selected)` — a plain CSS
  `:hover` has no idea about the selected node's own outline
  (`.db-selected`, `designer_objectmodel.js`) and would still draw its own
  outline on top of it, making the two indistinguishable/colliding on that
  one node — `:not(.db-selected)` excludes just that node. Scoped to the
  node itself (a class CSS can already see), not to "is anything at all
  selected" — an earlier version toggled a canvas-wide `db-canvas-pinned`
  class on any selection and scoped the whole rule behind
  `:not(.db-canvas-pinned)`, which suppressed the hover outline on *every*
  node the moment anything was selected, not just the selected one — a real
  regression reported live ("saknar border outline hover"), fixed by
  keying the exclusion off `.db-selected` directly instead. The *hover
  tag* itself is unaffected either way — it can still show alongside the
  selection tag on a different node — this only ever covered the free CSS
  `:hover` outline.
- `.db-hover-tag { pointer-events: none }` — the tag is `position:fixed`
  right on top of the node's own top-left corner (same screen position), so
  with pointer-events left on, a click there landed on the tag instead of
  the node underneath: the tag isn't a descendant of `#designerCanvasBody`,
  so that click never reached the select tool's or this file's own
  canvasBody-bound handlers at all, silently breaking click-to-select in
  exactly that spot. Only the delete × needs to stay clickable.
- `.db-hover-tag` z-index must stay under `app.ui.tooltip`'s `.ui-tooltip`
  (z-index:9999, `sandstorm/components/ui.js`) — this tag needs to sit
  above ordinary canvas content but a real tooltip should still be able to
  cover it.
- `body.db-tool-select .db-hover-tag-clear { pointer-events: auto }` — only
  clickable while the Select tool is active (toggled by
  `designer_objectmodel.js`'s `setActiveTool()`); the tag is appended
  straight to `document.body`, not under `#designerCanvasBody`, so it can't
  be scoped through the canvas's own tool-mode classes — `document.body` is
  a genuine ancestor of both, so this can be. Without this, an
  already-selected node's delete button could sit right where a *different*
  tool's own click (e.g. the splitter tool, on a narrow pane) was aimed,
  silently deleting the node instead of doing what that tool does.

**`init`**:
- A re-render replaces every `.db-node`, so both tags' element references
  would go stale. The hover tag is purely transient — just drop it, the
  next mouseover re-shows it on whatever's live. The selection tag re-shows
  itself on the fresh element for the current selection (if any) —
  `designer_selection.js`'s own render hook handles dropping the selection
  entirely if that node no longer exists at all.
- **Tag reposition `ResizeObserver`**: both tags are `position:fixed`,
  computed once from `getBoundingClientRect` at show time — nothing kept
  them in sync with the node afterward, so resizing the browser window, or
  the dock panel next to the canvas (jQuery UI resizable — see
  `designer_dock_resizable.js`), silently left them frozen at their old
  screen coordinates while the actual node moved out from under them.
  `#designerCanvasContent` changes size for both of those triggers (it's
  the `flex:1` sibling filling whatever space the window/dock split leaves
  it). That alone doesn't cover the device-mode dropdown though (see
  `designer_devicemode.js`) — it sets width/height directly on
  `#designerCanvasBody` (the artboard), not on `#designerCanvasContent`
  (the outer scroll viewport around it, which stays the same size no matter
  what preset is picked) — so a tag on a node whose position shifted purely
  from a device-mode change never got repositioned at all. One
  `ResizeObserver` watching *both* elements — same pattern
  `designer_ruler.js` already uses for its own redraw — covers every case
  without needing separate hooks per trigger.

## tools/split.js

**`currentDirection()` derives from `app.designer.activeTool` on every
call, not a separate variable of its own** — this used to keep its own
`activeDirection` copy, set only through this file's own `setActive()`.
Switching tools via *any other* path (e.g. clicking the Cursor tool icon,
which calls `app.designer.selectTool.activate()` ->
`app.designer.setActiveTool('select')` directly, never routing through
this file at all) left that copy stale and truthy — so clicking canvas
nodes kept splitting them even after the user had switched away to the
Cursor tool. `app.designer.activeTool` is the single source of truth for
which tool is active; deriving from it here can't desync the way a second
copy could.

**"Add Pane or Split?" dialog**: `splitNode()`'s in-place-conversion
nesting behavior used to be the only option when clicking a node that's
already one pane of an existing splitter — ambiguous whether "split" here
means "add another pane at this same level" (parent ends up with 3+ direct
children, each getting an equal share) or "nest a new split inside this
one pane" (this pane's own share subdivides further, siblings unchanged).
The dialog asks instead of silently picking one. See
[[project_split_tool_inplace_conversion]] for the full architecture.

## designer_ruler.js

**Left ruler's rotated tick labels** (`Ruler.draw`, vertical side): wanted
the number to trail *after* its tick (larger y, "behind" it going down the
ruler) — the mirror of the top ruler's own "+2, grows away toward larger x"
behavior. The default `textAlign` ('left') anchors at the *start* of the
text and grows from there in local +X, which after the -90° rotation maps
to global -Y (upward) — the opposite of what's wanted, and anchoring near
the tick either way put the text on the wrong side of it. `textAlign`
'right' anchors at the text's *end* instead, so it grows in local -X —
which maps to global +Y (downward) — meaning the anchor itself becomes the
near/top edge of the rendered text and it trails away downward from there,
matching the top ruler's own relationship along its axis.

## designer_objectmodel.js

See `NOTES.md`'s `blocks/splitter.js` section above for the
`.db-splitter-pane`/root-height CSS reasoning, and
[[project_split_tool_inplace_conversion]] for the in-place conversion
approach (now `convertToRowSplitter`/`convertToColumnSplitter` — split into
two standalone functions, no shared `direction` param, so a rows-only fix
can never regress columns or vice versa).

---

# program/solitaire/NOTES.md

# program/solitaire — implementation notes

## solitaire.js

**Touch drag failsafe** (droppables init): `touchcancel` can abort a drag
without touch-punch ever emitting the `mouseup` it normally translates
`touchend` into, so jQuery UI's own stop/revert never runs and a card is
left stuck mid-drag. `touchend` is also covered as a secondary safety net —
delayed so the normal stop handler runs first and this only fires if
something is still stuck afterwards. Guarded (`_touchFailsafeBound`) so
re-running `initialize()` on every new game doesn't stack duplicate
document-level listeners.

**`onStop` missed-drop handling**: if a drop misses every droppable slot
entirely (no `drop` event ever fired on any slot), jQuery UI's own
`revert:"invalid"` does not reliably snap the dragged card back on its own,
and the companion cards in a multi-card stack (positioned manually in
`onDrag`, not tracked by jQuery UI at all) are never reset by anything else
either. Left alone, every card in the stack stays stranded at the drop
point — a "ghost" card sitting away from its pile. A drop that *did* hit a
slot (valid or rejected) already resets everyone via `onDrop`/`rejectDrop`,
so only the missed case needs handling here.

**Card-tier resize — skipping stock/waste**: foundation and tableau slots
use `updateCardPositions()`'s own branches correctly. Stock and waste are
skipped: the stock pile must always stay `left:0` (fully stacked, never
fanned — its cards never go through `updateCardPositions()` during normal
play either), and the waste pile only fans its most recent draw batch
rather than every card it has ever held — running the generic "space cards
out by full index" branch on either one would re-fan the whole pile out
incorrectly. The waste pile's visible batch is re-fanned separately, at the
new spacing.

**Resize measurement** (`measureAvailableWidth`): measures the outer
`.window` chrome instead of `.solitaire-game` itself — `.solitaire-game`'s
own width can wobble by a scrollbar's worth of pixels when dealing/
cascading cards changes its content height (the window's `.content`
wrapper is `overflow:auto`), which flips the size tier mid-game with no
actual window resize. The `.window` element's width is set directly by the
resizable widget and isn't affected by its own descendants' scrollbars.
</content>
