# ColdPause — submission draft

## Short description

Refrigerator-outage guidance that keeps unknowns visible: ten foods, two distinct clocks, exact official sources and an offline copy.

## Inspiration

After a power outage, “how long was the power out?” and “how long was this food warm?” are different questions. A later cold reading can make that difference easy to miss. ColdPause gives uncertainty a visible place in the decision.

## What it does

Choose an exact food from a small catalog, enter known or unknown conditions, and review item-specific U.S. official guidance. Every result shows its facts, assumptions and source links. Unknown history stays unresolved. Edits remove stale guidance; Clear session erases the choices. After a successful first visit and cache confirmation, the app can reload offline in a supported browser.

## How it was built

The source-to-rule review came first, using FoodSafety.gov and CDC. A deterministic JavaScript rule engine keeps the general four-hour closed-door outage window separate from the item chart for recorded exposure at or above 40°F for more than two hours. The frontend uses native HTML controls, CSS and a service worker, with no application dependencies or AI/API calls. Codex assisted with research, code, tests, independent review and documentation.

## Responsible design

No temperature inference and no universal “safe” badge. Restoration-only cold readings never erase unknown history. The scope is deliberately limited to household refrigerator outages and ten exact food entries. This is U.S. official guidance, not Ontario-specific advice or professional validation. All demo facts are synthetic.

## Verified progress

The final local candidate passed 39 non-network tests and 52 actual Chrome assertions, including boundary values, contradictions, edits, persistence, reset, keyboard focus, reduced motion and Chrome-emulated offline reload. A real mobile screenshot exposed a clarity defect; aligning the full result panel made the caveat and action visible with the headline. Public deployment results should be added only after separate live verification.

## 60-second synthetic walkthrough

1. Choose milk. Enter 239 outage minutes, closed doors, initially cold, no added cooling, no spoilage signs. Review the conditional closed-door window and its assumptions.
2. Edit to 240 minutes: the old guidance disappears; review the reached limit. Edit to 241: disposal guidance appears.
3. Use 180 outage minutes and recorded warm exposure of 121 minutes: disposal comes from the separate food-exposure chart.
4. Select a cold reading only after restoration: earlier exposure remains unknown.
5. Reload offline after “Offline copy ready,” then Clear session. Do not describe this as measuring food or certifying safety.

## Submission assets

- Desktop screenshot: assets/desktop-initial-viewport.png (1280×900).
- Mobile result screenshot: assets/mobile-result-viewport.png (390×844).
- Source mapping: docs/SOURCE-RULES.md.
- Verification limits: docs/VERIFICATION.md.

No submitted-entry, prize, user-study, medical-professional or real-world food-validation claim is made. Video is not included in this package.
