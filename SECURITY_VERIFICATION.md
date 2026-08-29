# Security verification — stored-XSS hardening pass

Manual runtime verification for the `app.util.escapeHtml()` XSS-hardening
patch (Explorer, Control Panel Users, Mail, Language, Recycle Bin, desktop
icons, Network Monitor, Media Player, Solitaire, window titles, and the
`avatarUrl` scheme/size validation). No automated test suite exists in this
project yet — this note is the verification record for this patch; a
Playwright-based regression suite is tracked as a separate follow-up, not
bundled into this change.

Method: served the repo over a local static HTTP server, drove the real
app in headless Chromium (Playwright), and read back the actual rendered
DOM — not just a code review.

## Results

- **Boot application**: OK — zero console errors across the full boot
  sequence with all patched systemfiles/programs loaded.
- **Explorer rename payload**
  `"><svg/onload=alert(1)>` and `<img src=x onerror=alert(1)>`
  → rendered as inert text in tree/list/grid/breadcrumb/search/file-op
  views; `alert()` never fired.
- **Recycle Bin flow**: renamed a folder to `<img src=x onerror=alert(2)>`,
  deleted it, reopened Recycle Bin → name and original path shown as text,
  `alert()` never fired.
- **Control Panel → Users**: injected a user with
  `name: '<img src=x onerror=alert(1)>'` → rendered as text in the user
  card, `alert()` never fired.
- **Mail**: composed and sent a message with
  `Hello <img src=x onerror=alert(1)> world` as the body → Sent-folder
  detail view shows the literal text, `alert()` never fired.
- **Users avatarUrl** (`_isSafeAvatarUrl`) — 5 cases, all correct:
  | Input | Expected | Result |
  |---|---|---|
  | Valid `data:image/png;base64,...` | render `<img>` | ✅ rendered |
  | `data:image/svg+xml;base64,...` (SVG with `onload=`) | reject | ✅ fell back to initials avatar |
  | `javascript:alert(1)` | reject | ✅ fell back to initials avatar |
  | `data:image/png;base64,not-real-base64!!!<script>` | reject | ✅ fell back to initials avatar |
  | Valid prefix, 2,000,000-char payload (over the 1.4M cap) | reject | ✅ fell back to initials avatar |

  `alert()` never fired in any case.
- **No nested `escapeHtml()` calls found** — grepped every
  `app.util.escapeHtml(...)` call site repo-wide; none wrap an
  already-escaped value. The one remaining partial `.replace(/"/g,'&quot;')`
  pattern lives only in `explorer_windows.js`/`explorer_api.js`, which are
  dead code (unreferenced anywhere, confirmed by grep) and cannot execute.
- **No unsafe inline-handler interpolations found** — grepped for
  `on(click|error|load|...)="...${...}"` across the repo; no matches. The
  only URL-attribute sink found (`avatarUrl` → `<img src="...">`) now has
  scheme + base64-validity + size validation in front of it.

## Syntax verification

All 22 files touched by this patch were checked with
`node --input-type=module --check` (ES-module syntax) — zero errors.

## Files changed

`sandstorm/components/util.js` (new — shared `app.util.escapeHtml()`),
`sandstorm/components/load.js`, `sandstorm/components/explorer/explorer.js`,
`sandstorm/components/explorer/setup.js`,
`sandstorm/components/controlpanel/programs/users.js`,
`sandstorm/components/controlpanel/controlpanel.js`,
`sandstorm/components/language/language.js`,
`sandstorm/components/desktop/icons.js`,
`sandstorm/components/recyclebin/recyclebin.js`,
`sandstorm/components/networkmonitor/setup.js`,
`sandstorm/components/aichat.js`,
`program/mail/mail_data.js`, `program/mail/mail_api.js`,
`program/mail/setup.js`,
`program/mediaplayer/mediaplayer_data.js`,
`program/mediaplayer/setup.js`,
`program/solitaire/solitaire.js`,
`program/fotoviewer/fotoviewer.js`,
`program/formbuilder/formbuilder.js`.

Comment-only (dead-code warnings, no behavior change):
`sandstorm/components/explorer/explorer_windows.js`,
`sandstorm/components/explorer/explorer_api.js`.

Deliberately unchanged: `program/designer/core/style.js` (Designer's own
`escapeHTML` — a pure, dependency-free ES module by design; coupling it to
`app.util` would be an architectural regression for no security benefit,
since it's already the single source of truth within Designer's own module
boundary).

## Follow-up (not in this patch)

Open a separate task for a minimal Playwright regression suite
(`tests/security/xss.spec.js`) covering: boot smoke test, Explorer filename
payload, Users avatar payload, and one metadata-rendering payload — start
small, expand later rather than standing up a full test platform in the
same change as the security fix.
