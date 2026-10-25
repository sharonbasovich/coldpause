# ColdPause

A small refrigerator-outage prototype that keeps unknowns visible. Choose one of ten foods, enter only the facts you know, and see item-specific U.S. official guidance with its sources and assumptions.

[Live demo](https://sharonbasovich.github.io/coldpause/) · [Source and CI](https://github.com/sharonbasovich/coldpause/actions/workflows/test.yml) · [Live verification](docs/LIVE-VERIFICATION.md)

**Prototype, not a safety certification.** It cannot measure food, reconstruct temperatures or clear an uncertain history. It is not Ontario-specific advice. Do not taste food to test safety. If in doubt about food safety, CDC advises discarding it.

## Try it

1. Choose an exact catalog match.
2. Record known or unknown outage duration, door conditions, initial cold conditions, added cooling and food-temperature evidence.
3. Review the result and its assumptions. Changing any fact removes the old guidance. Changing food clears food-specific observations.
4. After one successful online visit, wait for “Offline copy ready.” A supported browser can then reload the application offline. The original official pages still need a connection.

Choices stay in browser local storage. Clear session removes choices and the displayed result while retaining the offline application. The application has no accounts, uploads, analytics or external alerts. GitHub Pages supplies ordinary hosting infrastructure; this is not a claim that the host receives no request metadata.

## Run locally

Use Node.js 24 or later. No packages need to be installed.

```sh
git clone https://github.com/sharonbasovich/coldpause.git
cd coldpause
npm test
npm start
```

Open http://127.0.0.1:4173/ in a current browser. The helper binds only to loopback. Service workers require localhost or HTTPS; opening index.html directly does not provide the offline workflow.

## Two rules, different evidence

- The general four-hour refrigerator window assumes closed doors and a refrigerator that started cold. It is not a temperature estimate. Exactly four hours is treated as the window reached, with no clearance.
- FoodSafety.gov’s refrigerator chart addresses documented exposure at or above 40°F for longer than two hours. Exactly two hours does not establish that threshold and does not prove safety. Outage minutes are never substituted for measured warm-exposure minutes.
- Unknown duration, uncertain conditions and a cold measurement taken only after restoration stay unresolved. A chart “Keep” category is not a universal safety badge.

[Source-to-rule mapping](docs/SOURCE-RULES.md) records the dated October 24, 2026 review and conservative prototype choices. Official sources: [FoodSafety.gov refrigerator chart](https://www.foodsafety.gov/food-safety-charts/food-safety-during-power-outage) and [CDC emergency food guidance](https://www.cdc.gov/food-safety/foods/keep-food-safe-after-emergency.html). No government endorsement is implied. Check the original pages when online because guidance can change.

## Scope

U.S. household refrigerator power outages only. Ten exact catalog entries; no substitutions. No medication, infant feeding, freezers, commercial kitchens, flood/fire contamination, recognition, personal data, accounts or alerts. Added ice/cooler conditions are outside this prototype’s timing assessment. It does not assess prior handling, expiration, all contamination hazards or individual health circumstances.

## Verification and accessibility

The final local candidate passed **39 non-network Node tests** and **52 actual Chrome assertions**. The latter include repeated focus assertions, not 52 distinct workflows. They cover timing boundaries, missing/contradictory inputs, repeated edits, persistence, clear session, keyboard interactions, reduced motion and Chrome-emulated offline reload. [Verification details and limitations](docs/VERIFICATION.md).

Native controls, associated labels/hints/errors, a skip link, live announcements and visible keyboard focus are included. No complete WCAG audit or screen-reader speech test has been performed. Chrome desktop and a resized mobile viewport were tested; physical devices, other browsers, physical network disconnection and full storage/cache lifecycle were not.

## Build and AI credit

Built for the SafeSpace hackathon starting October 24, 2026. OpenAI Codex assisted with source-to-rule review, implementation, test development, independent code review and documentation. Decisions are deterministic JavaScript; the application makes no AI/API calls. All demonstrated inputs and screenshots are synthetic. No food-safety-professional, physical food or thermometer validation is claimed.

The repository makes the project source available for inspection. No open-source license grant has been selected for this prototype.
