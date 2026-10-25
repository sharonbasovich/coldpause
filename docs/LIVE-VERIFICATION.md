# Public demo verification — October 25, 2026

Live application: https://sharonbasovich.github.io/coldpause/

Repository: https://github.com/sharonbasovich/coldpause

The reviewed runtime was deployed from source commit `075d7548eea917761474589a3797b4d627053a95`. Subsequent documentation updates do not change the runtime or food rules.

- [Non-network CI run](https://github.com/sharonbasovich/coldpause/actions/runs/40235897562): success, Node 24.21.0, 39 tests passed, zero failed/cancelled/skipped.
- [Pages deployment run](https://github.com/sharonbasovich/coldpause/actions/runs/40235991130): success, same source commit. Main branch, repository root, default HTTPS project URL.
- Real public-host Chrome 155.0.8059.85 run at 21:34–21:35 UTC: **74 checks passed**, comprising 52 functional assertions and 22 deployment checks. Repeated focus assertions are included; this is not 74 separate workflows.
- Exact source comparison: all 23 reviewed published files matched their source Git objects byte for byte, with no extra files, before this documentation update. Private machine-specific helpers and raw diagnostics were excluded.

## Actual live checks

HTTP 200, canonical trailing slash and exact SHA-256 content for index.html, styles.css, app.mjs, rules.mjs, icon.svg and sw.js. Both .mjs modules served as text/javascript. Service-worker scope, active script and controller stayed under `/coldpause/`; the expected cache held all six runtime URLs. No captured app exceptions, console errors or external page requests. The owned test browser exited successfully.

The functional checks exercised missing/contradictory input, outage minutes 239/240/241, measured warm minutes 119/120/121, restoration-only cold readings, unknown history, qualified chart categories, stale guidance removal, food switching, persisted choices without persisted decisions, repeated clear, native keyboard focus, 390 by 844 layout and reduced motion. Chrome offline emulation reloaded the live cached application, restored synthetic choices, produced guidance and supported clear/reload while offline.

Two actual public-host viewport images were captured and visually inspected. The repository's `assets/` images remain the earlier final local captures of the identical runtime; they are explicitly labeled that way. All examples are synthetic.

## Limits and availability

This is a tested hackathon prototype, not a safety certification or professionally validated food assessment. Unknown facts remain unknown. No physical-food/thermometer validation, user study, screen-reader speech test, full WCAG audit, physical-phone/other-browser testing or physical network disconnection was performed. Storage eviction, browser restart, private mode and the full old-cache upgrade lifecycle remain unverified. See VERIFICATION.md and SOURCE-RULES.md for scope and assumptions.

The free static Pages deployment has no application server to keep running and no configured expiry or scheduled takedown. It is intended to remain available through November 24, 2026. Availability depends on GitHub and browser storage; no uptime guarantee or continuous monitoring is claimed. Original official pages require a connection and may change after the source-review date.

Nothing in this report claims a Devpost submission, prize result, government endorsement or medical/food-safety-professional approval.
