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

The local results above do not by themselves verify a public deployment. A release report must separately confirm the deployed commit, CI outcome, module MIME types, subpath service-worker scope and live offline flow. Until that report exists, those public-host checks remain unverified.

## Remaining limitations

No screen-reader speech test, complete WCAG audit, other-browser or physical-phone validation. Offline testing used Chrome emulation, not a physical disconnection. Browser restart, storage eviction/quotas/private mode, and a full old-cache upgrade lifecycle were not fully exercised. Two visual frames were manually inspected; other result states received functional/DOM checks. No real food, sensor, prior-handling or food-safety-professional validation; no government endorsement. Source summaries are a dated snapshot and the originals require a connection. The prototype cannot establish the truth of supplied facts.
