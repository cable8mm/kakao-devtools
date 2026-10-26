# kakao-devtools — TASKS

- [x] T-001 Project foundation
  - Satisfies: PRODUCT_SPEC.md §8 (NFR-2, NFR-4)
  - External boundary: no
  - Acceptance criteria:
    - Every constraint in TECH_STACK.md is satisfied by the repository.
    - Every check defined in TECH_STACK.md passes on a repository that contains no product code.
    - Publishing the package is impossible by configuration (TECH_STACK.md §4, §8).

- [ ] T-002 Verify automated launch of a test page in the KakaoTalk in-app browser on the live Android device
  - Satisfies: PRODUCT_SPEC.md §6 (SC3), §7.5 (FR-14)
  - External boundary: yes (verification)
  - Acceptance criteria:
    - A probe executable by one command automates, on the live Android device, steps 1–3 of the tier 3 loop in TECH_STACK.md §7 against a trivial test page that sends one message to a receiving endpoint reached through the tunnel path required by FR-14.
    - The probe configures the browser destination host, port and scheme separately from the local receiver port; the run record includes those values and the local receiver port.
    - The observed live result is recorded in the repository: whether the receiving endpoint gets a message whose user agent identifies the in-app browser.
    - Pass: 5 of 5 consecutive probe runs each observe that message within 60 seconds.
    - On any failed run, a device screenshot and the native UI hierarchy are saved (ARCHITECTURE.md §9).
    - If the pass condition is not met, the task stays [ ], the observed failure modes are recorded, and dependent tasks are not started.

- [ ] T-003 Verify automated launch of a test page in the KakaoTalk in-app browser on the live iPhone
  - Satisfies: PRODUCT_SPEC.md §6 (SC3), §7.5 (FR-14)
  - External boundary: yes (verification)
  - Acceptance criteria:
    - The same probe and pass condition as T-002 run against the live iPhone.
    - The probe configures the browser destination host, port and scheme separately from the local receiver port; the run record includes those values and the local receiver port.
    - The observed live result and the device signing expiry behavior encountered during the run are recorded in the repository.
    - On any failed run, a device screenshot and the native UI hierarchy are saved (ARCHITECTURE.md §9).
    - If the pass condition is not met, the task stays [ ], the observed failure modes are recorded, and dependent tasks are not started.

- [ ] T-004 Verify live page lifecycle and connection behavior during the Kakao login and share flows
  - Satisfies: PRODUCT_SPEC.md §7.5 (FR-15), §7.3 (FR-7)
  - External boundary: yes (verification)
  - Acceptance criteria:
    - A probe page started from the in-app browser triggers the Kakao login flow and the Kakao share flow on each platform that passed T-002 or T-003.
    - For each flow and platform, the probe records the ordered page lifecycle events observed and whether an already-open connection to the receiving endpoint stays open or closes.
    - Pass: the record exists for every flow and platform, and the recorded sequence is identical in 3 consecutive runs.
    - The recorded observations are committed to the repository.

- [ ] T-005 Verify the live Kakao SDK failure outputs
  - Satisfies: PRODUCT_SPEC.md §7.2 (FR-4, FR-5)
  - External boundary: yes (verification)
  - Acceptance criteria:
    - A probe forces each failure class that can be produced on demand for the share and authorization calls in the live in-app browser, on each platform that passed T-002 or T-003.
    - For each forced failure, the probe records the exact code and message delivered to the page, for each call style the SDK offers.
    - Pass: every forced failure class has a recorded code and message on each tested platform.
    - The recorded observations are committed to the repository.

- [ ] T-006 Verify live KakaoTalk share-preview behavior for unchanged and parameter-modified URLs
  - Satisfies: PRODUCT_SPEC.md §7.4 (FR-9), §3 (G4)
  - External boundary: yes (verification)
  - Acceptance criteria:
    - A probe shares a URL through the live KakaoTalk, changes the page's preview metadata, then shares the unchanged URL and a parameter-modified URL.
    - The preview shown in the live chat for each share is recorded.
    - Pass: the record states, for the unchanged URL and for the parameter-modified URL, whether the preview reflects the changed metadata.
    - The recorded observations are committed to the repository.

- [x] T-007 A log or error emitted by a page running the Snippet is retrievable from the Log server core
  - Satisfies: PRODUCT_SPEC.md §7.5 (FR-12, FR-14), §3 (G3)
  - External boundary: no
  - Acceptance criteria:
    - A console message and an uncaught error emitted by a page running the Snippet are retrievable from the Log server core in emission order with level and timestamp.
    - A connection with a wrong or missing token is rejected and the Snippet stops retrying (ARCHITECTURE.md §4, §11).
    - A Log server core started while its port is in use exits with a message naming the port and its configuration variable (ARCHITECTURE.md §3, §11).
    - A page loaded before the Log server core starts delivers its queued entries after the Log server core starts (ARCHITECTURE.md §4, §11).
    - Per-session buffer caps drop oldest entries first (ARCHITECTURE.md §3).
    - The browser destination supports configured host, port and `ws`/`wss` scheme; unit tests cover destination construction and the receiver's default port 7890 plus a configured override.
    - Unit tests for the store, protocol validation and queue pass.

- [x] T-008 The Snippet activates only in the KakaoTalk in-app browser, only when enabled, and never in production
  - Satisfies: PRODUCT_SPEC.md §7.1 (FR-2), §7.5 (FR-16), §8 (NFR-3)
  - External boundary: no
  - Acceptance criteria:
    - With a non-KakaoTalk user agent, the Snippet installs no hooks, executes no inspector code, opens no connection, and the page's console behavior is unchanged.
    - With activation disabled by configuration, the same holds with a KakaoTalk user agent.
    - In a production environment, the Log server core rejects sessions unless the explicit override is set.
    - A non-loopback bind is refused without the explicit flag and logs a warning to the diagnostic stream (ARCHITECTURE.md §6).
    - Unit tests pass.

- [ ] T-009 The in-app inspector and log delivery work in the live KakaoTalk in-app browser
  - Satisfies: PRODUCT_SPEC.md §7.1 (FR-1, FR-3), §7.5 (FR-12), §6 (SC3)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: on each platform that passed T-002 or T-003, opening the probe page through the live KakaoTalk delivers its logs to the Log server core.
    - The probe page reports that the inspector is present in the page.
    - An E2E test through the live in-app browser passes on each such platform.
    - Failure behavior: when inspector initialization is forced to fail, the overlay is shown and log delivery continues (ARCHITECTURE.md §11).
    - A failure inside any Snippet hook leaves the host page's behavior unchanged (ARCHITECTURE.md §2).
    - Unit tests pass.

- [ ] T-010 Logs survive suspension and reconnection across the Kakao app-switch flows
  - Satisfies: PRODUCT_SPEC.md §7.5 (FR-15)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: per the T-004 record, on each tested platform, entries emitted before, during and after a Kakao login flow and a Kakao share flow arrive at the Log server core in order, without duplicates and without loss within the queue limits.
    - An E2E test through the live in-app browser passes for both flows on each tested platform.
    - Failure behavior: entries dropped by queue overflow produce a single dropped-count notice; a token mismatch stops retries; an unreachable Log server core leaves the overlay showing the connection state (ARCHITECTURE.md §4, §11).
    - Unit tests simulating connection drops, delays and resume pass.

- [ ] T-011 An MCP client reads live device logs through the four MCP tools
  - Satisfies: PRODUCT_SPEC.md §7.5 (FR-12, FR-13), §6 (SC2)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: a real MCP client connects over stdio and lists the four tools defined in PRODUCT_SPEC.md FR-13.
    - With the live device logging, the log tool, error tool, clear tool and status tool each return the results defined in ARCHITECTURE.md §8, including filtering by session when an iPhone and an Android session are connected at once.
    - An E2E test through the live boundary passes.
    - Failure behavior: a port in use exits with the message defined in ARCHITECTURE.md §11; stdout carries only protocol traffic, with diagnostics on stderr (ARCHITECTURE.md §3).
    - Unit tests pass.

- [ ] T-012 Kakao SDK failures are shown on screen and delivered with Korean causes where verified
  - Satisfies: PRODUCT_SPEC.md §7.2 (FR-4, FR-5, FR-6)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: per the T-005 record, each recorded failure is shown on screen in the live in-app browser and delivered as an SDK error entry containing its code.
    - Every code recorded in T-005 and confirmed against Kakao's official documentation has a Korean cause explanation; every other code is shown raw with no explanation.
    - The original success and failure outcome seen by the host page is unchanged.
    - An E2E test through the live in-app browser passes.
    - Failure behavior: when the Kakao SDK global is absent or of a different generation, capture continues and no wrapper is installed (ARCHITECTURE.md §11).
    - Unit tests pass.

- [ ] T-013 Login no-response detection warns on an unresponsive login element
  - Satisfies: PRODUCT_SPEC.md §7.3 (FR-7, FR-8)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: per the T-004 record, on each tested platform, a click on the login element of a page where nothing responds produces a no-response event at the Log server core after the configured timeout.
    - The event is not produced when the click leads to a visibility change, page hide, blur, navigation, or an SDK callback within the timeout (ARCHITECTURE.md §5).
    - The timeout is configurable.
    - An E2E test through the live in-app browser passes.
    - Unit tests pass.

- [ ] T-014 OG URL cache-busting in the Express middleware
  - Satisfies: PRODUCT_SPEC.md §7.4 (FR-9, FR-11)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: per the T-006 record, a URL shared with the middleware's parameter produces the preview behavior recorded there.
    - In a non-production environment the OG URLs in served HTML carry the cache-busting parameter; in a production environment the served HTML is unchanged.
    - `.replworks/guides/og-cache-busting.md` explains that URL busting creates a different URL instead of clearing Kakao's cache, and describes canonical URL and analytics implications.
    - An E2E test through the live KakaoTalk share flow passes.
    - Unit tests pass.

- [ ] T-015 Static resource versioning in the Express middleware
  - Satisfies: PRODUCT_SPEC.md §7.4 (FR-10)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: after a served static resource changes, the live in-app browser loads the new content without manual cache clearing, as reported by the probe page.
    - In a non-production environment local asset URLs carry a version parameter and resources are served with a no-cache directive; in a production environment both are absent.
    - An E2E test through the live in-app browser passes.
    - Unit tests pass.

- [ ] T-016 CLI init scaffolds a working setup
  - Satisfies: PRODUCT_SPEC.md §7.6 (FR-17), §7.5 (FR-14, FR-16)
  - External boundary: no
  - Acceptance criteria:
    - Running the CLI init in an empty sample project produces a setup in which a page using the scaffolded Snippet, with a KakaoTalk user agent, delivers a log to a started Log server core.
    - The generated configuration contains the token and has activation disabled when the environment is production.
    - The generated configuration exposes the browser WebSocket destination host, port and `ws`/`wss` scheme.
    - Running init a second time does not overwrite an existing token.
    - Unit tests pass.

- [ ] T-017 The Snippet works unchanged in a plain page and in a single-page application
  - Satisfies: PRODUCT_SPEC.md §8 (NFR-1)
  - External boundary: no
  - Acceptance criteria:
    - A plain static page and one single-page-application page each load the Snippet through a script tag or an import and deliver a log to the Log server core.
    - Both tests pass without framework-specific configuration.

- [ ] T-018 The real-device suite runs on both phones with one command
  - Satisfies: PRODUCT_SPEC.md §6 (SC3)
  - External boundary: yes
  - Acceptance criteria:
    - Required live behavior observed: one command runs the device suite on each platform that passed T-002 or T-003 and reports pass or fail per platform.
    - The suite covers the behaviors verified by T-009 through T-013.
    - Two consecutive full runs pass.
    - Failure behavior: on any failed test, a device screenshot and the native UI hierarchy are saved (ARCHITECTURE.md §9).
