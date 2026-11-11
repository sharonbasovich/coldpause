# Verification snapshot — October 25, 2026

## Completed locally

- 39/39 non-network Node tests, zero failed/skipped/cancelled. Run `npm test`. The server tests use mocks and open no sockets.
- 52/52 real Chrome assertions on the final application, Chrome 155.0.8059.85. These include repeated result-focus assertions, not 52 distinct workflows.
- Actual HTTP 200 for runtime assets; real service-worker control and complete cache readiness.
- Milk outage boundaries 239/240/241 minutes and measured warm-exposure boundaries 119/120/121 minutes; contradictory times, restoration-only cold reading, unknown facts and butter’s qualified chart category.
- Stale-result removal on edits; food-switch resets; synthetic input restoration without restoring a decision; repeated clear and reload.
- Chrome offline emulation: cached reload, restored choices, working guidance and repeated clear/reload while offline.
- Native keyboard flow, visible focus, label/error/hint associations, initial/error/result accessibility-tree inspection, reduced-motion emulation, 390×844 horizontal-overflow check.
- Two actual viewport screenshots, visually inspected after the final correction: [desktop](../assets/desktop-initial-viewport.png), [mobile result](../assets/mobile-result-viewport.png).

The last product correction aligned the entire result panel near the viewport top after submission. The mobile check confirmed that the selected food, headline, uncertainty explanation and next action were immediately visible together. No rule was changed by that correction.

The pure-rule suite covers all ten catalog mappings and 7,776 synthetic combinations. Source rules and application state tests are included in this repository; machine-specific browser automation and raw local diagnostics are excluded to avoid publishing private environment paths.

## Public hosting verification

The public GitHub Pages deployment was separately verified on October 25, 2026: **74/74 actual Chrome checks passed**, comprising the same 52 functional assertions plus 22 deployment checks. All six runtime assets matched the reviewed source byte for byte, including module MIME types, canonical subpath service-worker control and offline cache URLs. Live Chrome-emulated offline reload, edit/reset/persistence, keyboard interactions and reduced motion passed. GitHub CI separately passed all 39 tests on Node 24.21.0. See [live verification and exact run links](LIVE-VERIFICATION.md). These results do not remove the limitations below.

## Remaining limitations

No screen-reader speech test, complete WCAG audit, other-browser or physical-phone validation. Offline testing used Chrome emulation, not a physical disconnection. Browser restart, storage eviction/quotas/private mode, and a full old-cache upgrade lifecycle were not fully exercised. Two visual frames were manually inspected; other result states received functional/DOM checks. No real food, sensor, prior-handling or food-safety-professional validation; no government endorsement. Source summaries are a dated snapshot and the originals require a connection. The prototype cannot establish the truth of supplied facts.

## Controlled worker upgrade regression

`scripts/upgrade-browser-check.mjs` serves two releases sequentially on the same
loopback origin at the deployed `/coldpause/` project subpath in real Chromium. The baseline is pinned to accepted main
`bcfdf382de596fc3d00ae2ffb210203a69a76317` (tree
`e8e30ca89fbdd2253289cbcea402770f7aa8b368`).
`scripts/upgrade-baseline.json` records its six runtime Git blob identities.
The script verifies all six before starting any server or browser. No duplicate
product runtime is committed as a fixture. The offline workflow checks out this
read-only baseline into ignored `.upgrade-baseline` **after** `npm test`, then
runs the upgrade check with its existing installed Chromium/Playwright. Node's
normal test command enumerates only `tests/*.test.mjs`.

For local use in an environment authorized for browser launch, supply a checkout
of that commit with `UPGRADE_BASELINE=/path/to/baseline node
scripts/upgrade-browser-check.mjs`. Optional `PLAYWRIGHT_MODULE` selects an
installed Playwright module. Add `--verify-only` to verify baseline blobs and
candidate cache separation without importing Playwright, opening a socket or
launching Chromium.

The regression saves synthetic choices through the baseline UI, waits for the
committed save, then explicitly calls registration.update() without unregistering
or clearing storage. It verifies a different activated controller, exact `/coldpause/` registration scope and
`/coldpause/sw.js` controller URL, byte-exact
candidate cache contents, old-cache removal, unrelated-cache preservation and
unchanged choices/generation. It reloads offline, fetches all six cached routes
byte-for-byte, checks decorative SVG geometry, and triggers a settled save failure.
An actual native beforeunload Cancel must retain the unsaved draft; accepted
reload must restore the earlier saved choices. A second isolated browser context
repeats the upgrade with the pinned old app substituted into the new cache. That
negative control must fail specifically because the settled unsaved draft does
not receive a native exit warning. Other failures do not count as a successful
negative control.

Evidence is written to `evidence/upgrade/` and included in the existing offline
workflow artifact. This is Chromium with browser-emulated offline and a synthetic
storage error, not physical-device, cross-browser or screen-reader verification.
Source preparation and `--verify-only` do not establish browser acceptance; a
successful exact-source hosted run is required before claiming this regression
passed. The check does not itself authorize merging or deploying a held draft.
