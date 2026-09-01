# Update readiness protocol

The client/server contract for `app.updates`. Sandstorm is the **readiness
agent + cutover UX**, never the deploy engine. The server prepares the new
version (blue-green), runs health checks, owns rollback and the dependency
graph, and makes the **final go/no-go decision**.

Three layers:

```
                 SANDSTORM (client)
                      │
           ┌──────────┴──────────┐
      HARD SIGNALS          SOFT SIGNALS
     "is anything in       "when is it least
      the way right now"    disruptive"
           │                     │
           └──────────┬──────────┘
                      ▼   observations only, no verdict
                  BACKEND
                      │
               STRATEGY ENGINE  (A swap / B drain / C db-compat / D wait)
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        SWAP        DRAIN       DEFER
          │
          ▼
       ROLLBACK
```

The client **must not** be able to say "ready" on its own. It reports what
it sees; the server decides.

---

## Transport

Transport is pluggable and knows nothing about readiness/handoff. Every
inbound message goes through **`app.updates.signal(message)`**.

### Primary: polling (works today, no new infra)

```js
app.updates.configure({
  transport: 'poll',
  url: null,                 // defaults to config.local.jsapiLink
  action: 'update.poll',
  intervalMs: 30000
});
```

Each poll is a `POST` and **doubles as the lease heartbeat**.

**Request body** → server:

```json
{
  "action": "update.poll",
  "clientId": "c_ab12…",
  "currentUpdateId": "2026-09-01-42" | null,
  "state": "idle" | "waiting-for-readiness" | "lease-active" | …,
  "observations": {
    "timestamp": 1735732800000,
    "clientId": "c_ab12…",
    "updateId": "2026-09-01-42" | null,
    "openPrograms": [
      { "id": "designer", "windows": 1, "undoHistory": true, "touchedByUpdate": true }
    ],
    "sessionsWithUndoHistory": ["designer"],
    "inFlightWrites": 0,
    "runningJobs": [],
    "activeOperations": [],
    "softScore": 0.18
  }
}
```

> `undoHistory` / `sessionsWithUndoHistory` is a **risk indicator, not a
> dirty flag** — Sandstorm has no real unsaved-changes tracking yet. Treat
> it as "work may be in progress here", not "unsaved data".

### Alternative: `document` event (future SSE / WebSocket)

```js
document.dispatchEvent(new CustomEvent('sandstorm:update', { detail: <same message shape as a poll response> }));
```

A future push layer feeds `signal()` the exact same messages — no other
code changes.

---

## Server → client messages (poll response, or event `detail`)

```json
{
  "updateId": "2026-09-01-42",
  "directive": "idle" | "prepare-handoff" | "cutover-now" | "aborted",
  "lease": { "id": "lease_x9", "expiresAt": "2026-09-01T21:00:10Z" },
  "affectedPrograms": ["designer", "media-editor"],
  "affectedServices": ["php-runtime"],
  "affectedCapabilities": ["file-write", "upload"],
  "checks": { "backup": true, "tested": true, "rollback": true },
  "estimatedDisruptionMs": 20000,
  "currentVersion": "Sandstorm CMS OS — Build 1.0.1",
  "retryAfter": 5000
}
```

| directive | meaning | client does |
|---|---|---|
| `idle` | nothing prepared / update cancelled | if mid-flight → `abort('server idle')` |
| `prepare-handoff` | new version staged; start tracking, keep working | `handoff.adopt()` → state `waiting-for-readiness`; if `lease` present → `lease-active` |
| `cutover-now` | swap now | **only with a currently-valid lease** → flush → freeze → `waitForCutover()` → `reconnect()` → restore |
| `aborted` | stop, roll client state back | `handoff.abort('server aborted')` |

### Rules

- **`cutover-now` without a valid `lease` (`lease.id` present and `expiresAt`
  in the future) is refused** by the client and emits `update.refused`.
- **The server renews the lease only when the observations are valid** and
  the client meets the requirements — *not* automatically on every poll.
- **Every message carries `updateId`.** A message whose `updateId` ≠
  `app.updates.currentUpdateId` is ignored (a stale poll / replayed event
  cannot revive a finished update).
- A missed poll advances nothing — it just means the lease is not renewed.
  Fail-safe by omission.

---

## Client state machine (`app.updates.state`)

```
idle → preparing → waiting-for-readiness → lease-active
     → handoff → cutover → reconnecting → complete
```

From (almost) any state: **`→ aborted → idle`**.

`app.lifecycle.emit('update.state', { state, updateId })` fires on every
transition. Also emitted: `update.frozen`, `update.unfrozen`,
`update.flushed`, `update.refused`.

---

## Handoff steps

| step | status | notes |
|---|---|---|
| `flushSessions()` | real (best-effort) | dispatches `sandstorm:flush` CustomEvent per window; a program saves and calls `detail.done()`; 2.5 s deadline; also nudges Notepad's known `save()`. Returns `{ flushed, unflushed }` — `unflushed` is reported, not fatal. |
| `freeze()` / `unfreeze()` | real, reversible | `html.sandstorm-updating` + a transparent full-screen scrim so no new work can start |
| `waitForCutover()` | **STUB — fail-closed** | returns `{ status: 'not-implemented', safe: false }`. Backend must implement: poll/read transport until the new version is confirmed live + healthy. |
| `reconnect()` | **STUB — fail-closed** | returns `{ status: 'not-implemented', safe: false }`. Backend must implement: re-verify the client is now talking to the new version (version marker / health endpoint). |
| `restoreSessions()` | real | `unfreeze()` + notify "System updated — you can continue" + return to `idle` |

**Fail-closed guarantee:** a handoff that reaches the stubbed steps calls
`abort()` (unfreeze + notify "postponed, nothing changed"). It is
impossible to get a false "all done" while the transport is unimplemented.

---

## What the backend team must build

1. `POST <jsapiLink> { action: 'update.poll', … }` → the response shape above.
2. **Impact analysis** → `affectedPrograms / affectedServices / affectedCapabilities`
   from the dependency graph (which files change → which services/capabilities
   → which client programs use them).
3. **Lease issuance** — short TTL (e.g. 10 s), renewed only while observations
   stay safe. `cutover-now` only inside a live lease.
4. **Blue-green prepare + health checks + rollback** — entirely server-side.
5. Wire the client's `waitForCutover()` / `reconnect()`:
   - during `cutover`, keep answering polls with `directive: 'cutover-now'`
     and a `cutoverPhase` field until the swap is done, then flip to a
     response the client reads as "new version live" (spec this when built).
   - `reconnect()` verifies via a version/health endpoint on the new server.
6. **Strategy engine** — pick A (fast swap) / B (process drain) / C (db-compat
   migrate) / D (defer) from the impact + observations + the soft
   activity model. The client only supplies signals for this.

## What stays client-side forever

- readiness observations (this module)
- the handoff state machine + flush/freeze/restore
- all cutover UX (pre-swap panel, waiting state, countdown, success/fail)
