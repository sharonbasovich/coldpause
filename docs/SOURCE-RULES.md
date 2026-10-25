# ColdPause source-to-rule review

Reviewed 2026-10-24 before implementation. Independently reviewed in a separate agent. U.S. household refrigerator guidance only; not Ontario-specific advice. This document records conservative prototype choices, not an official endorsement.

## Official sources

- **FSG**: https://www.foodsafety.gov/food-safety-charts/food-safety-during-power-outage — refrigerator introduction and refrigerator item table; page review date August 8, 2024.
- **CDC**: https://www.cdc.gov/food-safety/foods/keep-food-safe-after-emergency.html — preparation, during-outage and after-outage sections; page date November 24, 2025.

## Separate clocks

The closed-door refrigerator window concerns elapsed time without power. It is not a temperature model. CDC conditions its window on closed doors and directs disposal of perishables after four hours without power or cooling. At four hours CDC recommends a cooler with ice if available.

The FSG refrigerator table instead applies to documented food exposure at **40°F or higher for longer than 120 minutes**. It does not establish that shorter exposure is safe. The chart includes exactly 40°F; CDC's refrigerator target includes 40°F too. The prototype surfaces this boundary rather than resolving it with false precision. It uses Fahrenheit, preserving the published 40°F boundary instead of relying on a rounded Celsius conversion.

## Curated catalog mapping

| Prototype item | FSG refrigerator category (paraphrased) | Table outcome |
|---|---|---|
| Chicken | Raw/cooked poultry | Discard |
| Cooked rice | Prepared rice/pasta/potatoes | Discard |
| Milk | Milk and related dairy | Discard |
| Shell eggs | Eggs and egg preparations | Discard |
| Cut fruit | Cut fresh fruit | Discard |
| Cream cheese | Soft cheese | Discard |
| Full-fat Cheddar block | Hard cheese | Keep |
| Butter | Butter/margarine | Keep |
| Whole apple | Uncut fresh fruit | Keep |
| Mustard | Mustard and similar condiments | Keep |

Full-fat block cheese excludes shredded, low-fat and soft variants. A whole apple excludes cut fruit. No substitutions to an unlisted food. Mayonnaise is omitted because its exception needs another rule. These table outcomes concern the stated outage exposure, not every possible food hazard.

## Decision order

1. Invalid or contradictory inputs: ask for correction and show no decision. Warm exposure longer than the outage contradicts this tool's whole-outage scope. A full-period below-40°F record cannot coexist with warm-exposure minutes because the form permits only one evidence mode.
2. Unusual appearance, odor or texture: CDC disposal guidance applies to any selected food. Absence of those signs never proves safety. Never use tasting as a test.
3. Established exposure longer than 120 minutes at/above 40°F: item-specific FSG table outcome. A short outage cannot override disposal. A Keep category is a secondary explanation under an unresolved headline whenever other conditions remain unknown or outside scope; with complete conditions it is described as a chart result, never a universal safety certification.
4. Perishable item, outage longer than 240 minutes, confirmed no added cold source: official disposal guidance. A later cold reading cannot reverse it. A full-period cold record contradicts applying a no-cooling timing inference, so show conflicting evidence and official guidance without a positive decision.
5. All remaining unknown duration, uncertain doors, uncertain starting cold conditions, uncertain spoilage conditions, or restoration-only reading: unresolved. Source guidance and missing assumptions remain visible.
6. Added ice/cooler/other cold source: v1 cannot resolve its special conditions; show CDC guidance, except independently established disposal triggers above. No invented cooler rule.
7. Reliable full-period food record below 40°F, known starting cold, known duration and door conditions: describe cold-storage guidance with its assumptions; never assert food is safe. At four hours or longer without added cooling, show the source timing caution and no clearance.
8. Exactly 120 warm-exposure minutes: chart disposal threshold not established, but no reverse safety inference; unresolved. Any shorter positive warm-exposure record likewise produces unresolved guidance.
9. Exactly 240 outage minutes: general window reached; show CDC cooler/ice guidance and no clearance.
10. Known outage shorter than 240 minutes, initially cold, closed doors, no other uncertainties, no positive warm exposure: within the general closed-door window, with all assumptions visible. Zero documented warm minutes can support a cold-history explanation; duration alone never supplies a temperature.

## Uncertainty requirements

- A cold reading only after restoration describes the present, not the outage history.
- No temperature inferred from outage length, door status, touch, appearance or smell.
- Unknown duration does not become zero. Empty required numbers are errors.
- Every result displays the selected food, supplied facts, relevant sources, assumptions, and unresolved facts.
- Results are invalidated on every edit; restored choices require an explicit fresh review. Changing food resets initial cold conditions, added cooling, food-temperature evidence and spoilage observations. Only the shared outage duration and refrigerator door history remain.
- Source summaries remain offline; source links require a connection and may change after the review date.

## Scope and verification

No freezer, infant feeding, medication, commercial, flood/fire contamination, recognition, alerts, uploads, accounts or personal data. Synthetic examples only. Local assets only; local choices can be cleared separately from the offline application cache.

Verify outage minutes 239/240/241; exposure minutes 119/120/121; chart categories; unknown inputs; restoration-only cold readings; added cooling; invalid/contradictory entries; repeated edits; reset; reload offline; native keyboard controls; focus, labels, live announcements, responsive layout and reduced motion. See VERIFICATION.md for the completed checks and remaining limitations.
