# kakao-devtools — PRODUCT_SPEC

> Draft. Section structure is provisional until aligned with the REPLWorks standard PRODUCT_SPEC prompt.
> Items marked **[ASSUMPTION]** were inferred, not stated, and need confirmation.

## 1. Overview

`kakao-devtools` is an npm package that makes bugs inside the KakaoTalk in-app browser debuggable, by humans and by AI agents, without native remote debugging (which KakaoTalk disables in production builds).

There is no v0/v1 split. The product is one scope, built to answer one question: **does debugging in the KakaoTalk in-app browser actually work end to end with this tool?**

## 2. Problem

- Safari Web Inspector and `chrome://inspect` cannot attach to the KakaoTalk in-app browser. This is a KakaoTalk build-option limit and cannot be bypassed from the client side.
- Developers fall back to `alert(JSON.stringify(err))`, re-assembling eruda / scrcpy / Proxyman per project.
- Open Graph scrape caching on the Kakao side slows the edit-and-verify loop.
- Humans copy-pasting screenshots and console logs to AI agents is itself the bottleneck.

## 3. Goals

- G1. Show a usable console/network/DOM inspector inside the KakaoTalk in-app browser, only when running in it.
- G2. Make Kakao SDK failures (`Kakao.Link`, `Kakao.Share`, `Kakao.Auth`) visible and explained in Korean.
- G3. Stream browser logs and errors to the developer's machine so an AI agent (Claude Code etc.) can read them through MCP.
- G4. Reduce stale-cache friction for OG metadata and static resources.
- G5. Work with any web stack through a plain JS snippet; Express middleware is optional.

## 4. Non-goals

- Official iOS/Android remote debugging workaround (not possible).
- Team collaboration / session recording dashboard (a business hypothesis, not part of validating that the tool works).
- Market-size validation. Building the tool does not answer it; it stays an open question.

## 5. Users

- Primary: the author, dogfooding on own projects. **Which project first: undecided.**
- Secondary: developers of Korean web services that rely on KakaoTalk sharing or Kakao login.

## 6. Success criteria

The project is considered working if a bug that behaves differently in the KakaoTalk in-app browser than in Safari/Chrome is successfully debugged using this tool.

- SC1. The reproduced difference is identified (cause located) using only the tool's output, with no `alert` debugging.
- SC2. The same loop works with an AI agent reading logs through MCP, without a human pasting logs.
- SC3. The in-app verification is automated on real devices (a harness opens the test page in the KakaoTalk in-app browser and checks the delivered logs), not a manual checklist.
- **[ASSUMPTION]** The specific test bug should be chosen before building, so the criterion is falsifiable.

## 7. Functional requirements

### 7.1 In-app inspector

- FR-1. Detect `KAKAOTALK` in the user agent and inject eruda automatically.
- FR-2. Do nothing in other browsers and in production unless explicitly enabled.
- FR-3. eruda is used as a dependency, not reimplemented.

### 7.2 Kakao SDK error overlay

- FR-4. Wrap `Kakao.Link`, `Kakao.Share`, `Kakao.Auth` calls; on failure, show the error on screen.
- FR-5. Map common error codes to a Korean explanation of the likely cause (e.g. `-401` unregistered domain, `-10` rate limit, `4019` auth failure).
- FR-6. Unknown codes are shown raw, never swallowed.

### 7.3 Login popup no-response detection

- FR-7. After a click on `[data-kakao-login]`, if nothing responds within a configurable time, warn that a popup may be blocked.
- FR-8. This is a heuristic; it must be labelled as a possibility, not a diagnosis.

### 7.4 Cache helpers

- FR-9. Optional Express middleware that appends a cache-busting parameter to OG URLs; disabled in production.
- FR-10. Optional middleware for static resource versioning.
- FR-11. Document that OG busting works by creating a new URL, not by clearing Kakao's cache, and how that interacts with canonical URLs and analytics.

### 7.5 MCP server (`kakao-devtools-mcp`)

- FR-12. One process receives browser logs over WebSocket and exposes them to MCP clients over stdio.
- FR-13. Tools: `get_kakao_logs`, `get_kakao_errors`, `clear_kakao_logs`, `get_kakao_devtools_status`.
- FR-14. The WebSocket receiver listens on a configurable port (default 7890). The browser snippet's destination host, port and scheme (`ws`/`wss`) are configurable so a phone can reach the PC through Tailscale or ngrok. Using one of them is the baseline setup.
- FR-15. The browser snippet reconnects automatically, so server start order does not matter. It must also survive the page being backgrounded while Kakao login/share switches to another app.
- FR-16. Production guard: the snippet and server refuse to collect when `NODE_ENV` is production unless explicitly overridden, and the server warns loudly on any non-loopback exposure without auth. **[ASSUMPTION]** Decided here because the decision was delegated.

### 7.6 CLI

- FR-17. `kakao-devtools-cli init` scaffolds the browser snippet.

## 8. Non-functional requirements

- NFR-1. Framework-agnostic: works in any page by snippet; tested with at least a plain HTML page and one SPA framework. **[ASSUMPTION]** "Full version" means all stacks via snippet.
- NFR-2. Minimum Node version: **[ASSUMPTION]** current LTS only.
- NFR-3. Zero impact on non-KakaoTalk visitors.
- NFR-4. Packaged as npm package `kakao-devtools` (MCP server binary `kakao-devtools-mcp`). The license is all rights reserved, and nothing is published until the real-device verification passes.

## 9. Constraints and risks

- KakaoTalk behavior varies by app version and OS; claims must be verified on real devices.
- HTTPS pages block plain `ws://`; the tunnel path must provide `wss://`.
- eruda wrapping and error-code mapping are easy to copy; the MCP loop is the main differentiator.
- Full autonomy is not possible: a human still opens the shared link in KakaoTalk on a phone.

## 10. Open questions

1. Which project is dogfooded first?
2. Which concrete bug is the success test (SC1)?
3. Is "KakaoTalk only" a deliberate limit, or should the MCP layer be generic for any in-app webview?
4. Are Kakao share-debugger cache resets automatable with the current Kakao API? Needs verification.
5. Market size remains unverified.
