# kakao-devtools — ARCHITECTURE

> Inputs: PRODUCT_SPEC.md, TECH_STACK.md. Items marked **[ASSUMPTION]** are design choices made here that the author has not confirmed.

## 1. System overview

```
 KakaoTalk in-app browser (phone)                    Developer machine
┌─────────────────────────────────┐   wss://      ┌────────────────────────────────┐
│ page + snippet (IIFE)           │  (tunnel)     │ kakao-devtools-mcp (one process)│
│  ua-detect → guard              │──────────────▶│  ┌──────────┐   ┌────────────┐ │
│  eruda (bundled)                │               │  │ WS server│──▶│ log store  │ │
│  capture: console/error/network │◀──────────────│  └──────────┘   │ (ring buf) │ │
│  kakao-sdk wrapper + overlay    │   ack         │        ▲        └─────┬──────┘ │
│  login no-response watcher      │               │        │ in-process   │        │
│  ws-client (queue, reconnect)   │               │  ┌─────┴─────┐  ┌─────▼──────┐ │
└─────────────────────────────────┘               │  │ test      │  │ MCP tools  │ │
                                                  │  │ harness   │  │ (stdio)    │ │
 Express app (optional)                           │  └───────────┘  └─────┬──────┘ │
┌─────────────────────────────────┐               └────────────────────────┼───────┘
│ og-bust + static-version        │                                        ▼
│ middleware                      │                                 Claude Code / Desktop
└─────────────────────────────────┘
```

Components:

| Component          | Runs in                  | Responsibility                                         |
| ------------------ | ------------------------ | ------------------------------------------------------ |
| Snippet            | KakaoTalk in-app browser | Activate only in KakaoTalk, capture, display, transmit |
| Log server core    | Node                     | Accept WebSocket sessions, store logs, answer queries  |
| MCP adapter        | Node (same process)      | Expose the store as MCP tools over stdio               |
| Express middleware | Developer's server       | OG URL cache busting, static asset versioning          |
| CLI                | Node                     | Scaffold snippet and configuration                     |
| Test harness       | Node (tests only)        | Drive real devices and assert on delivered logs        |

The core is a library; the MCP bin and the test harness both import it. This keeps one implementation of the store and protocol.

## 2. Snippet (browser side)

Activation pipeline, in order, each step able to stop everything:

1. `config.enabled` is true. The CLI writes it from the environment at scaffold time; production builds set it false.
2. User agent matches `KAKAOTALK`.
3. Production guard passes (see section 6).

Modules:

- **capture**: hooks `console.*`, `window.onerror`, `unhandledrejection`, and `fetch` / `XMLHttpRequest` metadata (URL, method, status, duration; bodies off by default). Values are serialized with a safe serializer: depth limit, circular-reference marker, per-entry size cap.
- **eruda loader**: eruda is bundled and initialized only after activation, so non-KakaoTalk visitors pay only for the file size, not execution.
- **kakao-sdk wrapper**: see section 5.
- **login watcher**: see section 5.
- **overlay**: minimal DOM layer, independent of eruda, so errors are visible even if eruda fails to render.
- **ws-client**: connects to the configured destination host, port and scheme (`ws` or `wss`); see section 4.

All code in the snippet is wrapped so that a failure in the tool never breaks the host page. Every hook is try/catch guarded and restores the original behavior on error.

## 3. Log server core (Node)

- WebSocket server (`ws`) bound to `127.0.0.1`, default port 7890 (`KAKAO_DEVTOOLS_WS_PORT`). The browser destination host, port and scheme are separate client settings; a tunnel maps its reachable endpoint to this local listener.
- **Session registry**: one session per connected page, identified by a client-generated `sessionId`. Stores platform (derived from UA: iOS or Android), page URL, connect time, last seen.
- **Log store**: in-memory ring buffer per session. **[ASSUMPTION]** 5,000 entries and 2 MB per session, oldest dropped first. A reconnecting client with the same `sessionId` resumes its session.
- Stderr only for server diagnostics. stdout belongs to the MCP stdio protocol and is never written by anything else.
- If the port is taken, startup fails with a clear message naming the port and the environment variable.

Binding to loopback is sufficient for tunnels: Tailscale Serve and ngrok both forward to a local port, so the server never needs a non-loopback bind.

The CLI-generated snippet configuration exposes the WebSocket destination host, port and scheme (`ws` or `wss`). The tunnel's reachable host and port are configured there, while the local receiver port is configured independently.

## 4. Wire protocol and reconnection

JSON text frames, protocol version field `v: 1`.

Client to server:

| `type`      | Fields                                                   |
| ----------- | -------------------------------------------------------- |
| `hello`     | `v`, `token`, `sessionId`, `ua`, `url`, `lastAckedSeq`   |
| `log`       | `seq`, `ts`, `level`, `args`                             |
| `error`     | `seq`, `ts`, `message`, `stack`, `source`                |
| `sdk_error` | `seq`, `ts`, `api`, `code`, `raw`, `explanation`         |
| `event`     | `seq`, `ts`, `name` (e.g. `login_no_response`), `detail` |
| `ping`      |                                                          |

Server to client:

| `type`    | Fields                                            |
| --------- | ------------------------------------------------- |
| `welcome` | `ackSeq` (highest `seq` stored for this session)  |
| `ack`     | `ackSeq` (sent periodically and after bursts)     |
| `reject`  | `reason` (`bad_token`, `bad_version`, `disabled`) |
| `pong`    |                                                   |

Reconnection (the main fix for the known v0 weakness):

- Every message carries a monotonically increasing `seq`. Unacknowledged messages stay in a bounded client queue (**[ASSUMPTION]** 500 messages / 256 KB, oldest dropped, with a single `dropped` event noting the count).
- On disconnect, retry with exponential backoff, 0.5 s doubling to a 10 s cap, with jitter.
- Retry immediately on `visibilitychange` to visible, `pageshow`, and `online`. This matters because Kakao login and share switch to another app and the webview may be suspended.
- On reconnect the client sends `hello` with `lastAckedSeq`; the server answers `welcome` and the client resends everything after `ackSeq`. The server deduplicates by `(sessionId, seq)`.
- Server start order no longer matters: a client started before the server simply keeps retrying.

## 5. Kakao-specific behavior

**SDK wrapper** (table-driven):

- A list of method paths (`Kakao.Share.*`, `Kakao.Link.*`, `Kakao.Auth.*` entries) is wrapped when present. Missing methods are skipped silently, because SDK generations differ.
- The wrapper intercepts both callback-style `fail` handlers and rejected promises, forwards the original outcome unchanged, and additionally emits `sdk_error` and shows the overlay.
- `window.Kakao` may load after the snippet, so the wrapper installs when the global appears (property setter, with a short polling fallback).
- **Error-code table**: a data file mapping code to Korean cause and suggested fix. Seed entries come from the author's notes (`-401` unregistered domain, `-10` rate limit, `4019` auth failure); each entry must be verified against Kakao's official error documentation before it ships. Unknown codes display raw with no explanation.

**Login no-response watcher** (heuristic):

- Capture-phase click listener on `[data-kakao-login]` starts a timer (**[ASSUMPTION]** 3 s, configurable).
- The timer is cancelled by `visibilitychange` to hidden, `pagehide`, `blur`, a navigation, or an SDK callback.
- If it fires, emit event `login_no_response` and show a warning worded as "popup may have been blocked", not as a conclusion.

## 6. Security model

- WebSocket requires a **shared token**. `kakao-devtools-cli init` generates a random token on first initialization, stores it in the generated local configuration, and writes the same value into the snippet configuration. Later `init` runs reuse the existing token. A wrong or missing token gets `reject: bad_token`. This protects the case where a tunnel makes the port reachable from the internet (ngrok), not only the tailnet case.
- Production guard: if `NODE_ENV` is `production`, the CLI-generated config has `enabled: false`; the snippet refuses to connect when disabled, the server refuses sessions that announce a production environment unless `KAKAO_DEVTOOLS_ALLOW_PRODUCTION` is set.
- The server warns loudly on stderr at startup if a non-loopback bind is requested, and requires an explicit flag for it.
- Logs may contain tokens, cookies or personal data from the page. Request and response bodies and headers are not captured by default; storage is in memory only and is cleared on exit.

## 7. Express middleware

- **og-bust**: in non-production, rewrites `og:url`, `og:image` and similar meta URLs in HTML responses to carry a cache-busting parameter. Disabled in production. The middleware does not clear Kakao's cache; it makes the shared URL look new. Its effects on canonical URLs and analytics are described in the usage guide required by PRODUCT_SPEC FR-11.
- **static-version**: in non-production, appends a version parameter derived from file mtime to local asset URLs in HTML responses and sets `Cache-Control: no-cache` on them.
- Both are optional and independent of the snippet and the server.

## 8. MCP tools

All tools accept an optional `sessionId` so that an iPhone and an Android phone can be connected at once; without it, results include all sessions, labelled by platform.

| Tool                        | Input                                      | Output                                                            |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `get_kakao_logs`            | `sessionId?`, `since?`, `level?`, `limit?` | Ordered entries                                                   |
| `get_kakao_errors`          | `sessionId?`, `since?`, `limit?`           | `error` and `sdk_error` entries and warning events                |
| `clear_kakao_logs`          | `sessionId?`                               | Count cleared                                                     |
| `get_kakao_devtools_status` | none                                       | Listening port, sessions (platform, URL, last seen), buffer usage |

Input schemas use `zod`. Output is compact text by default so it fits an agent's context.

## 9. Test architecture

- Tier 1 and 2 (Vitest, Playwright) run against the core and snippet in a desktop browser with a spoofed UA, as described in TECH_STACK.
- **Device harness** (tier 3): imports the core in-process, so tests can `waitForLog(predicate, timeout)` without going through MCP stdio.
  - `probe/` serves the test page whose behavior differs in-app (UA, `window.Kakao`, popups, forced `Kakao.Share` / `Kakao.Auth` failures).
  - `drivers/android.ts` and `drivers/ios.ts` wrap Appium sessions: open KakaoTalk, send the URL to the account's own chat, tap it, collect screenshots and native page source on failure.
  - The tunnel is started by the author before the run; the harness reads `KAKAO_TEST_BASE_URL` and `KAKAO_TEST_WS_URL`. **[ASSUMPTION]** Tunnel automation is out of scope until the spikes pass.
- Spike A (Android) and Spike B (iOS, signing with the free Apple account, which re-signs weekly) precede all other implementation.

## 10. Directory layout

```
src/
  browser/      snippet modules (capture, eruda-loader, kakao-sdk, login-watch, ws-client, overlay)
  core/         ws server, session registry, log store, protocol types
  mcp/          MCP adapter and bin
  express/      og-bust, static-version
  cli/          kakao-devtools-cli
test/
  unit/ e2e/ device/ probe/
dist/           Node output; dist/browser/ for the IIFE bundle
```

## 11. Failure modes

| Failure                                           | Behavior                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| WebSocket unreachable                             | Snippet queues, retries with backoff, overlay shows connection state    |
| Token mismatch                                    | Server rejects; snippet shows `bad_token` in overlay and stops retrying |
| Webview suspended during login or share           | Reconnect on resume, resend from `lastAckedSeq`                         |
| `window.Kakao` absent or different SDK generation | Wrapper installs nothing, capture still works                           |
| eruda fails to initialize                         | Overlay and WebSocket logging continue                                  |
| MCP port in use                                   | Server exits with an explicit message                                   |
| Unknown Kakao error code                          | Shown raw, never hidden                                                 |

## 12. Open items

1. Single tunnel vs two: the page and the WebSocket server are different ports, so two tunnel endpoints are needed. Tailscale Serve handles multiple ports; whether ngrok's free plan allows two simultaneous endpoints is unverified. Option: mount the WebSocket endpoint on the app's own HTTP server where the app is under the author's control.
2. Verify every entry of the Kakao error-code table against official documentation.
3. Buffer, queue and timer defaults are provisional until the first real-device runs.
