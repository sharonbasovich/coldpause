export const SOURCES = Object.freeze({
  fsg: { label: 'FoodSafety.gov — refrigerator introduction and item chart', url: 'https://www.foodsafety.gov/food-safety-charts/food-safety-during-power-outage' },
  cdc: { label: 'CDC — during and after a power outage', url: 'https://www.cdc.gov/food-safety/foods/keep-food-safe-after-emergency.html' }
});

export const FOODS = Object.freeze({
  chicken: { name: 'Chicken, raw or cooked', chart: 'discard', row: 'Poultry, including cooked leftovers', note: 'For chicken in a refrigerator, not a frozen item.' },
  rice: { name: 'Cooked rice', chart: 'discard', row: 'Cooked rice / pasta / potatoes', note: 'Prepared rice only; dry uncooked rice is a different food.' },
  milk: { name: 'Milk', chart: 'discard', row: 'Milk and related dairy', note: 'Refrigerated milk, not an unopened shelf-stable carton.' },
  eggs: { name: 'Shell eggs', chart: 'discard', row: 'Eggs and egg preparations', note: 'Refrigerated eggs in their shells.' },
  cutfruit: { name: 'Cut fresh fruit', chart: 'discard', row: 'Cut fresh fruit', note: 'Cut fruit has different guidance from a whole, uncut apple.' },
  creamcheese: { name: 'Cream cheese', chart: 'discard', row: 'Soft cheese', note: 'A soft cheese; do not substitute the hard-cheese category.' },
  cheddar: { name: 'Full-fat Cheddar block', chart: 'keep', row: 'Hard cheese', note: 'Only full-fat block Cheddar. Shredded, low-fat and soft cheeses have different chart guidance.' },
  butter: { name: 'Butter', chart: 'keep', row: 'Butter / margarine', note: 'Plain butter, not a prepared dish or a cream-cheese spread.' },
  apple: { name: 'Whole, uncut apple', chart: 'keep', row: 'Uncut fresh fruit', note: 'Whole and uncut only. Cut fruit has different chart guidance.' },
  mustard: { name: 'Mustard', chart: 'keep', row: 'Mustard and similar condiments', note: 'Mustard itself, not a salad or dish containing mustard.' }
});

export const DEFAULTS = Object.freeze({ food: '', durationKnown: 'unknown', outageMinutes: '', doors: 'unknown', initialCold: 'unknown', coldSource: 'unknown', evidence: 'unknown', warmMinutes: '', spoilage: 'unknown' });
const enums = { durationKnown: ['unknown', 'known'], doors: ['unknown', 'closed', 'opened'], initialCold: ['unknown', 'yes', 'no'], coldSource: ['unknown', 'no', 'yes'], evidence: ['unknown', 'warm', 'cold', 'restored'], spoilage: ['unknown', 'no', 'yes'] };
const isMinutes = value => /^(0|[1-9]\d*)$/.test(String(value)) && Number(value) <= 10080;

export function normalize(raw) {
  const data = { ...DEFAULTS };
  data.food = Object.hasOwn(FOODS, raw?.food) ? raw.food : '';
  for (const [key, choices] of Object.entries(enums)) data[key] = choices.includes(raw?.[key]) ? raw[key] : DEFAULTS[key];
  data.outageMinutes = data.durationKnown === 'known' ? String(raw?.outageMinutes ?? '') : '';
  data.warmMinutes = data.evidence === 'warm' ? String(raw?.warmMinutes ?? '') : '';
  return data;
}

export function validate(raw) {
  const d = normalize(raw), errors = [];
  if (!d.food) errors.push({ field: 'food', text: 'Choose an exact food from the catalog.' });
  if (d.durationKnown === 'known' && !isMinutes(d.outageMinutes)) errors.push({ field: 'outageMinutes', text: 'Enter total outage minutes as a whole number from 0 to 10080, or choose No / unsure.' });
  if (d.evidence === 'warm' && !isMinutes(d.warmMinutes)) errors.push({ field: 'warmMinutes', text: 'Enter measured exposure minutes as a whole number from 0 to 10080, or choose no reliable history.' });
  if (d.durationKnown === 'known' && d.evidence === 'warm' && isMinutes(d.outageMinutes) && isMinutes(d.warmMinutes) && Number(d.warmMinutes) > Number(d.outageMinutes)) errors.push({ field: 'warmMinutes', text: 'Measured exposure cannot exceed the total outage in this check. Correct the times; prior handling is outside this prototype.' });
  return errors;
}

export function evaluate(raw) {
  const d = normalize(raw), errors = validate(d);
  if (errors.length) return { kind: 'invalid', errors };
  const food = FOODS[d.food];
  const outage = d.durationKnown === 'known' ? Number(d.outageMinutes) : null;
  const warm = d.evidence === 'warm' ? Number(d.warmMinutes) : null;
  const gaps = [];
  if (outage === null) gaps.push('The total outage duration is unknown.');
  if (d.doors !== 'closed') gaps.push(d.doors === 'opened' ? 'The doors opened, so the closed-door window cannot be assumed.' : 'The door history is uncertain.');
  if (d.initialCold !== 'yes') gaps.push(d.initialCold === 'no' ? 'The food did not start at the recommended refrigerator temperature.' : 'The starting cold conditions are unknown.');
  if (d.coldSource !== 'no') gaps.push(d.coldSource === 'yes' ? 'Added cooling needs a separate assessment under CDC guidance.' : 'Whether extra cooling was used is unknown.');
  if (d.spoilage === 'unknown') gaps.push('Spoilage signs are uncertain. Their absence would not establish safety.');
  if (d.evidence === 'restored') gaps.push('A cold reading only after restoration cannot establish earlier food temperatures.');
  if (d.evidence === 'unknown') gaps.push('There is no reliable food-temperature history.');
  const facts = [
    ['Outage', outage === null ? 'Unknown duration' : `${outage} minutes without power`],
    ['Doors', { unknown: 'Uncertain', closed: 'Closed throughout', opened: 'Opened' }[d.doors]],
    ['Starting temperature', { unknown: 'Uncertain', yes: 'Known at 40°F or below', no: 'Not at 40°F or below' }[d.initialCold]],
    ['Added cooling', { unknown: 'Uncertain', yes: 'Ice / another source / cooler', no: 'None' }[d.coldSource]],
    ['Food-temperature evidence', { unknown: 'No reliable history', cold: 'Recorded below 40°F throughout', restored: 'Cold reading only after restoration', warm: `${warm} recorded minutes at / above 40°F` }[d.evidence]],
    ['Spoilage signs', { unknown: 'Uncertain / unchecked', no: 'None noticed (not proof)', yes: 'Unusual signs reported' }[d.spoilage]]
  ];
  const base = { food, facts, gaps, sources: ['fsg', 'cdc'], assumptions: ['Only the exact selected food and this refrigerator outage are assessed.', 'No conclusion about contamination, earlier handling or other hazards.'], caution: 'Never taste food to test it. When uncertain about safety, CDC advises discarding it.' };
  const result = (kind, title, message, next, extra = {}) => ({ ...base, kind, title, message, next, ...extra });
  if (d.spoilage === 'yes') return result('discard', 'Discard this food', 'CDC advises disposal when food has an unusual odor, color or texture. A short outage or a chart Keep category does not override those signs.', 'Do not taste it to check.', { rule: 'CDC: after-outage disposal guidance.' });
  if (warm !== null && warm > 120) {
    if (food.chart === 'discard') return result('discard', 'Discard this food', `The FoodSafety.gov refrigerator chart lists disposal for this food category after exposure at or above 40°F lasting longer than two hours. Your recorded exposure is ${warm} minutes.`, 'A short outage or a later cold reading cannot undo this exposure.', { rule: `FoodSafety.gov item category: ${food.row}.`, assumptions: [...base.assumptions, 'The entered exposure is a reliable measurement history for this food.'] });
    if (gaps.length) return result('uncertain', 'The food history remains unresolved', `The FoodSafety.gov chart lists Keep for the ${food.row.toLowerCase()} category under its stated exposure condition. Your other unknown or limited conditions prevent this prototype from clearing the food.`, 'Review the unresolved facts below. If in doubt about safety, discard it.', { rule: `FoodSafety.gov item category: ${food.row}. Its category outcome does not settle the missing history.` });
    return result('chart', 'The chart lists Keep for this category', `For ${food.name.toLowerCase()}, the FoodSafety.gov refrigerator chart has a Keep outcome under its longer-than-two-hours exposure condition. This is an item-category rule, not a safety certification.`, 'Check the exact food match and all assumptions below. If in doubt about safety, discard it.', { rule: `FoodSafety.gov item category: ${food.row}.`, assumptions: [...base.assumptions, 'The entered exposure is a reliable measurement history for this food.'] });
  }
  if (food.chart === 'discard' && outage !== null && outage > 240 && d.coldSource === 'no') {
    if (d.evidence === 'cold' || warm === 0) return result('uncertain', 'The evidence needs review', 'You entered a full-period cold record and more than four hours without power or an added cold source. The official general timing advice calls for discarding perishables after four hours. This prototype cannot reconcile that with your record.', 'Do not use this result as clearance. Review the official guidance; if in doubt, discard it.', { rule: 'CDC and FoodSafety.gov: general perishable-food outage limit.' });
    return result('discard', 'Discard this food', 'Official guidance calls for disposal of refrigerated perishables after four hours without power or another cold source. Your entered duration exceeds that limit.', 'A cold reading after restoration does not reverse the time without cooling.', { rule: 'CDC and FoodSafety.gov: general perishable-food outage limit.' });
  }
  if (d.evidence === 'restored') return result('uncertain', 'Earlier exposure is still unknown', 'A cold reading after power returned describes the food now. It does not show how warm it became, or for how long, during the outage.', 'Use the official disposal guidance when the history cannot establish safety.', { rule: 'Conservative uncertainty handling; no source rule reconstructs prior temperatures.' });
  if (outage === null || d.doors !== 'closed' || d.initialCold !== 'yes' || d.coldSource !== 'no' || d.spoilage === 'unknown') return result('uncertain', 'There is not enough evidence', 'At least one needed condition is unknown or outside this timing check. ColdPause cannot turn missing facts into reassurance.', d.coldSource === 'yes' ? 'Read CDC’s added-cooling instructions. This prototype does not assess a cooler or added cold source.' : 'Keep the unknowns visible. If you are unsure whether the food is safe, discard it.', { rule: `FoodSafety.gov category: ${food.row}; chart outcome ${food.chart === 'keep' ? 'Keep' : 'Discard'} only under the chart’s stated exposure conditions.` });
  if (warm !== null && warm > 0) return result('uncertain', 'The chart cannot clear this food', `Your record shows ${warm} minutes at or above 40°F. The chart’s disposal condition uses longer than 120 minutes; ${warm === 120 ? 'exactly 120 minutes is the boundary, not a positive safety rule' : 'a shorter duration does not establish safety'}.`, 'Do not treat the absence of a chart disposal trigger as permission to eat it.', { rule: 'FoodSafety.gov: food exposure at or above 40°F for longer than two hours.', gaps: [...gaps, 'At exactly 40°F, CDC’s storage target and the chart’s exposure heading overlap; no clearance is inferred.'] });
  if (outage >= 240) return result('uncertain', outage === 240 ? 'The four-hour window has been reached' : 'Beyond the general outage window', 'The closed-door refrigerator timing window has ended. CDC recommends a cooler with ice at four hours when available. Outage time does not establish this food’s temperature exposure.', food.chart === 'keep' ? 'This food has a Keep category in the exposure chart, but the supplied history does not establish that chart condition or overall safety.' : 'Follow the official perishable-food disposal guidance; do not use this result as clearance.', { rule: 'CDC: closed-door outage window and action at four hours.' });
  if (d.evidence === 'cold' || warm === 0) return result('conditional', 'A cold record supports the storage target', 'You report a reliable whole-outage food record below 40°F, or zero recorded time at or above 40°F. That supports the temperature condition; it does not certify the food against other hazards.', 'Keep it cold. Reassess if the facts change or the outage continues.', { rule: 'CDC: refrigerator storage target; the entered history is not inferred.', assumptions: [...base.assumptions, 'Your record covers the whole period, without missing intervals.', 'The food started cold, the doors stayed closed, no added cooling was used, and the outage is under four hours.'] });
  return result('conditional', 'Within the general closed-door window', 'Your entered outage is under four hours and the stated conditions match the general closed-door refrigerator guidance. This is a timing guide, not a measurement of this food.', 'Keep the doors closed. Update the duration if power is still out; at four hours, CDC recommends a cooler with ice when available.', { rule: 'CDC and FoodSafety.gov: general closed-door refrigerator window.', assumptions: [...base.assumptions, 'Initially cold, doors closed throughout, no added cooling, no unusual spoilage signs, and outage under four hours.'] });
}
