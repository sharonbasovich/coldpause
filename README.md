# ColdPause

A small refrigerator-outage prototype that keeps unknowns visible. Choose one of ten foods, enter only the facts you know, and see item-specific U.S. official guidance with its sources and assumptions.

[Live demo](https://sharonbasovich.github.io/coldpause/) · [Source and CI](https://github.com/sharonbasovich/coldpause/actions/workflows/test.yml) · [Live verification](docs/LIVE-VERIFICATION.md)

**Prototype, not a safety certification.** It cannot measure food, reconstruct temperatures or clear an uncertain history. It is not Ontario-specific advice. Do not taste food to test safety. If in doubt about food safety, CDC advises discarding it.

## Try it

1. Choose an exact catalog match.
2. Record known or unknown outage duration, door conditions, initial cold conditions, added cooling and food-temperature evidence.
3. Review the result and its assumptions. Changing any fact removes the old guidance. Changing food clears food-specific observations.
4. If you leave and return, check your entries before reviewing again. Update outage minutes if power is still out. A returned or restored snapshot is not a current reading.
5. After one successful online visit, wait for “Offline copy ready.” A supported browser can then reload the application offline. The original official pages still need a connection.

When browser storage and Web Locks are available, choices are saved locally. A successful Clear session removes saved choices and the displayed result while retaining the offline application and a nonpersonal coordination counter. That counter prevents a suspended, updated tab from recreating choices after a clear, even when storage events have not arrived. Newer changes or a reset in another updated tab are never silently overwritten: this tab retains its draft with an explicit reload/discard option. Without safe storage access, choices remain in this tab only and the status explains whether a clear reached saved data. Reload all older open tabs to use the same protection; already-open old code does not check the counter. Clearing browser site data removes the counter too and is outside this cross-tab protection. The application has no accounts, uploads, analytics or external alerts. GitHub Pages supplies ordinary hosting infrastructure; this is not a claim that the host receives no request metadata.

## Protecting choices before leaving

A pending save or choices that a reload would not recover request the browser's
standard leave-page warning. This includes failed saving, unavailable Web Locks,
failed clears, and another tab replacing or clearing the saved choices. When
choices match freshly verified recovery, no warning is requested. An unverified
Clear remains protected even if this tab has only ever been blank, because an
unobserved peer may have saved choices. Recovery comparisons match actual control coercion, including saved food
identifiers and malformed numeric text that restores as an empty field. The explicit
“Discard this tab’s choices and reload saved choices” control intentionally
continues without that warning.

This is best-effort protection, not a backup or a guarantee: browsers can suppress
prompts, particularly without prior interaction or on mobile. If storage is
unavailable, leaving can still lose the choices. No food data is saved during the
exit check, and a conflicted tab never restores data cleared by another tab.

## Run locally

Use Node.js 24 or later. No packages need to be installed.

```sh
git clone https://github.com/sharonbasovich/coldpause.git
cd coldpause
npm test
npm start
```

Open http://127.0.0.1:4173/ in a current browser. The helper binds only to loopback. Service workers require localhost or HTTPS; opening index.html directly does not provide the offline workflow.

## Returning to a check

When a reviewed page becomes hidden and returns, or a browser restores it from back/forward history, the displayed result pauses. Inputs stay unchanged. The reminder asks you to check every entry and update the outage duration if power is still out; pressing Review does not make old facts current. A prior disposal warning and the original tasting caution remain explicit. Opening an official-source tab intentionally follows the same rule when that tab hides the app. Focus changes alone do not pause a visible page.

Saved choices restore without a result and with the same fact-check reminder. This is a UI snapshot safeguard, not a food-safety time limit. ColdPause does not run an outage timer, infer temperatures or detect changed conditions. A continuously visible page still requires manual updates.

## Two rules, different evidence

- The general four-hour refrigerator window assumes closed doors and a refrigerator that started cold. It is not a temperature estimate. Exactly four hours is treated as the window reached, with no clearance.
- FoodSafety.gov’s refrigerator chart addresses documented exposure at or above 40°F for longer than two hours. Exactly two hours does not establish that threshold and does not prove safety. Outage minutes are never substituted for measured warm-exposure minutes.
- Unknown duration, uncertain conditions and a cold measurement taken only after restoration stay unresolved. A chart “Keep” category is not a universal safety badge.

[Source-to-rule mapping](docs/SOURCE-RULES.md) records the dated October 24, 2026 review and conservative prototype choices. Official sources: [FoodSafety.gov refrigerator chart](https://www.foodsafety.gov/food-safety-charts/food-safety-during-power-outage) and [CDC emergency food guidance](https://www.cdc.gov/food-safety/foods/keep-food-safe-after-emergency.html). No government endorsement is implied. Check the original pages when online because guidance can change.

## Scope

U.S. household refrigerator power outages only. Ten exact catalog entries; no substitutions. No medication, infant feeding, freezers, commercial kitchens, flood/fire contamination, recognition, personal data, accounts or alerts. Added ice/cooler conditions are outside this prototype’s timing assessment. It does not assess prior handling, expiration, all contamination hazards or individual health circumstances.

## Verification and accessibility

The original October 24 candidate passed **39 non-network Node tests** and **52 actual Chrome assertions**. The latter include repeated focus assertions, not 52 distinct workflows. They cover timing boundaries, missing/contradictory inputs, repeated edits, persistence, clear session, keyboard interactions, reduced motion and Chrome-emulated offline reload. [Verification details and limitations](docs/VERIFICATION.md).

The November 3 review-freshness update has **52 non-network Node tests**. Its additional browser script is `scripts/freshness-browser-check.mjs`; the Review freshness workflow runs real Chromium keyboard, history, reload and offline checks at desktop and 390px widths, alongside the existing storage and offline suites. Paused-state rendering uses a labeled synthetic lifecycle event because the test driver keeps native tab visibility active; hidden/visible events are also covered by handler tests. The workflow uploads screenshots and a report rather than treating handler simulations as browser evidence.

Native controls, associated labels/hints/errors, a skip link, live announcements and visible keyboard focus are included. No complete WCAG audit or screen-reader speech test has been performed. Chrome desktop and a resized mobile viewport were tested; physical devices, other browsers, physical network disconnection and full storage/cache lifecycle were not.

## Build and AI credit

Built for the SafeSpace hackathon starting October 24, 2026. OpenAI Codex assisted with source-to-rule review, implementation, test development, independent code review and documentation. Decisions are deterministic JavaScript; the application makes no AI/API calls. All demonstrated inputs and screenshots are synthetic. No food-safety-professional, physical food or thermometer validation is claimed.

The repository makes the project source available for inspection. No open-source license grant has been selected for this prototype.

## November 4 reset-integrity repair

Storage comparisons now include a monotonic coordination counter as well as the
exact saved JSON. Every save and clear advances the counter under the same Web
Lock, including an empty clear. The counter contains no food or observation data.
Marker-write failures prevent changes; failed food writes after marker advancement
retain the saved food choices and force a conflict before another attempt. Legacy
choices remain readable. Malformed or exhausted counters fail closed.

The final Node suite has 64 tests, including delayed-event ABA reproductions,
partial failures, legacy migration, startup interleaving and queued writes. The
Chromium storage script adds two scenarios with explicitly suppressed storage
events; this models delayed delivery rather than proving native tab suspension.
Browser execution and release verification are recorded separately in the repair
report. Food evaluation and official-guidance content are unchanged.

## November 6 unreleased exit-protection candidate

The expanded non-network handler tests cover settled save failures, absent locks,
failed clears, delayed cross-tab changes, normalized reversion and intentional
discard. They are not evidence of native dialog behavior. Native browser checks,
offline update behavior and release verification remain pending for this candidate.
Food evaluation, official-source rules, styling and the submitted entry are unchanged.

## November 7 unreleased exit-protection repair

The non-network suite now has 90 tests, including failed Clear with an unseen
peer save, fresh recovery checks, repeated Clear, one-use discard, and malformed
or valid stored numeric text. The additional browser-script cases cover the same
Clear failure and number-control restoration, but are not yet executed. Native
Cancel/Leave, offline update and release checks remain separate pending gates.
