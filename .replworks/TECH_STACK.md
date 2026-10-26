# kakao-devtools — TECH_STACK

> Input: PRODUCT_SPEC.md. Decisions below were confirmed by the author unless marked **[ASSUMPTION]**.
> Versions marked **verified** were checked against public sources in Oct 2026. Everything else is pinned to a major only and must be confirmed (`pnpm view <pkg> version`) when the project is scaffolded; the lockfile then fixes exact versions.

## 1. Principles

1. The project exists to answer "does debugging work inside the KakaoTalk in-app browser?" Anything that can fail silently in that environment is avoided.
2. Real-device verification is automated and is a first-class test tier, not a manual checklist.
3. No release or publish tooling until the real-device tests pass.
4. Fewer moving parts beats nicer tooling.

## 2. Runtime and language

| Item              | Decision                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js           | `>=24` (**verified**: 24 is Active LTS, supported to 2028-04-30; 26 enters LTS on 2026-10-28). Node 22 was considered and dropped: it reaches end of life on 2027-04-30. |
| Language          | TypeScript, `strict` on                                                                                                                                                  |
| Node-side modules | ESM only                                                                                                                                                                 |
| Browser snippet   | Single IIFE file usable with a plain `<script>` tag, also importable. Includes eruda (bundled, no runtime fetch).                                                        |
| Browser target    | **[ASSUMPTION]** ES2017 syntax, no top-level await, no optional dependencies on newer Web APIs, to survive older Android System WebView and iOS versions.                |
| Package manager   | pnpm (npm is used only for publishing, later)                                                                                                                            |

## 3. Build

- Node code: `tsc` to `dist/` (ESM + `.d.ts`).
- Browser snippet: `esbuild` to `dist/browser/kakao-devtools.js` (IIFE, minified, sourcemap).
- tsup/tsdown were considered and not chosen: one more abstraction layer, and their maintenance status was not verified. `tsc` + `esbuild` are the minimal, stable pair.
- tsconfig: `tsconfig.json` (Node), `tsconfig.browser.json` (type-check only for the snippet).

## 4. Package layout

One repository, one npm package `kakao-devtools`, with:

- `exports`: `.` (Express middleware and Node API), `./snippet` (path to the IIFE file).
- `bin`: `kakao-devtools-cli` (scaffolding), `kakao-devtools-mcp` (MCP + WebSocket server).
- `express` is an optional peer dependency.
- `"private": true` until validation passes, so an accidental publish is impossible.

## 5. Dependencies

| Package                     | Role                                        | Version                                                                                                                                           |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eruda`                     | In-page inspector, bundled into the snippet | major to confirm                                                                                                                                  |
| `ws`                        | WebSocket server in the MCP process         | major to confirm                                                                                                                                  |
| `@modelcontextprotocol/sdk` | MCP server over stdio                       | **verified** 1.30.x (v1 line). A v2 generation with split packages (`@modelcontextprotocol/server`) exists on the SDK's main branch; not adopted. |
| `zod`                       | Tool input schemas                          | use the major the SDK version declares support for (to confirm)                                                                                   |

Dev tooling: Biome (**verified** 2.4.x line), Vitest (**verified** 4.1.x line), Playwright, WebdriverIO client, Appium server and drivers (majors to confirm), `esbuild`, `typescript`, `@types/express`, `@types/ws`.

## 6. Lint and format

Biome only (lint + format + import sorting). No ESLint, no Prettier.

## 7. Test strategy

Three tiers. Tiers 1 and 2 cannot prove in-app behavior; tier 3 is the one that decides the project.

### Tier 1 — Unit (Vitest)

Kakao error-code mapping, UA detection, production guard, WebSocket message protocol, reconnect logic with a fake socket. No coverage threshold.

### Tier 2 — Desktop E2E (Playwright)

Chromium with the user agent spoofed to contain `KAKAOTALK`: probe page + snippet → WebSocket → MCP server → MCP tool call returns the logs. Verifies the pipeline, not the in-app environment.

### Tier 3 — Real-device E2E (automated)

Goal: reproduce what a developer does by hand, without a human.

Loop:

1. Harness starts the probe page server, the log server (same core as `kakao-devtools-mcp`, imported in-process), and the tunnel.
2. Appium drives the KakaoTalk app on a real device: send the probe URL to the account's own chat ("나와의 채팅"), tap the link.
3. The in-app browser loads the probe page. The snippet sends logs over WebSocket.
4. Harness asserts on the received logs.
5. On failure, Appium saves a screenshot and the native page source (the webview itself cannot be inspected, because debugging is disabled by KakaoTalk).

Design points:

- The tool is its own oracle: the assertions use the logs it delivers. A broken delivery shows up as a failed test, and the screenshot shows whether eruda rendered.
- Probe page: emits deterministic signals that differ between a normal browser and the in-app browser (UA, `window.Kakao` behavior, popup behavior, a deliberately failing `Kakao.Share` / `Kakao.Auth` call to check the Korean error mapping).
- Tunnel: Tailscale or ngrok, both baseline. HTTPS pages require `wss://`, so the tunnel must terminate TLS (Tailscale Serve or ngrok).
- Platforms: Android (UiAutomator2) first, iOS (XCUITest driver) second. Both are in scope.
- Runner: Vitest project `device`, using the WebdriverIO client against an Appium server. Run locally (`pnpm test:device`). **[ASSUMPTION]** Not in CI, since CI would need a self-hosted runner with a device attached.

**Unverified feasibility, must be proven first (Spike A and B, before any other code):**

- Spike A (Android): can Appium on a real device see and tap inside KakaoTalk (chat list, own chat, a message link) reliably? KakaoTalk may restrict accessibility-based automation or behave differently on automation. Unknown until tried.
- Spike B (iOS): same on a real iPhone. Needs a Mac, Xcode, and signing WebDriverAgent; free Apple accounts re-sign weekly.
- Pass condition: the loop above opens a trivial page in the in-app browser and the harness sees one log line.
- If a spike fails, the fallback is a human-triggered step with automated assertions. Revisit the success criterion in PRODUCT_SPEC before continuing.

Needs from the author: a dedicated KakaoTalk test account kept logged in on the test device(s), and the physical devices. Automating a real account may trigger Kakao abuse or security checks; use a test account, never a production one.

## 8. Distribution and licensing

- License: all rights reserved. `package.json` uses `"license": "UNLICENSED"`, with a `LICENSE` file stating it.
- Bundled third-party code (eruda, others) keeps its own license notices: a `THIRD_PARTY_NOTICES` file is generated and shipped with the build. eruda is MIT, which requires its notice to be retained.
- Release (**deferred**): no GitHub Actions, no publish workflow, no provenance setup until tier 3 passes. Planned shape afterwards: GitHub tag `vX.Y.Z` (semver) triggers an automated npm publish with provenance.

## 9. Open items

1. Devices: one iPhone and one Android phone (model and OS versions still to be recorded). A Mac is available for iOS automation (Xcode, WebDriverAgent signing).
2. Which KakaoTalk test account to use?
3. Exact browser target and the oldest WebView to support.
4. `zod` major compatible with the chosen MCP SDK.
5. Whether the distribution model (all rights reserved) matches the eventual plan: PRODUCT_SPEC previously assumed a free public release.
