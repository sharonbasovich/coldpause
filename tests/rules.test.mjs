import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, FOODS, SOURCES, normalize, validate, evaluate } from '../rules.mjs';

const known = { ...DEFAULTS, food: 'milk', durationKnown: 'known', outageMinutes: '180', doors: 'closed', initialCold: 'yes', coldSource: 'no', spoilage: 'no' };
const check = overrides => evaluate({ ...known, ...overrides });

test('the two clocks have separate 239/240/241 and 119/120/121 boundaries', () => {
  for (const [outageMinutes, kind] of [['239','conditional'],['240','uncertain'],['241','discard']]) assert.equal(check({outageMinutes}).kind, kind, outageMinutes);
  for (const [warmMinutes, kind] of [['119','uncertain'],['120','uncertain'],['121','discard']]) assert.equal(check({evidence:'warm',warmMinutes}).kind, kind, warmMinutes);
  assert.match(check({outageMinutes:'240'}).title, /window has been reached/);
  assert.match(check({evidence:'warm',warmMinutes:'120'}).message, /boundary, not a positive safety rule/);
});

test('food exposure is not derived from outage duration', () => {
  const r = check({outageMinutes:'239'});
  assert.match(r.message, /timing guide, not a measurement/);
  assert.ok(r.gaps.some(s => s.includes('no reliable')));
  assert.equal(check({outageMinutes:'180',evidence:'warm',warmMinutes:'121'}).kind, 'discard');
});

test('all ten catalog mappings follow the item chart at established exposure', () => {
  assert.equal(Object.keys(FOODS).length, 10);
  for (const [food, item] of Object.entries(FOODS)) {
    const r = check({food,evidence:'warm',warmMinutes:'121'});
    assert.equal(r.kind, item.chart === 'discard' ? 'discard' : 'chart', food);
    assert.ok(r.rule.includes(item.row));
  }
  assert.match(FOODS.cheddar.note,/Shredded, low-fat and soft/);
  assert.match(FOODS.apple.note,/Whole and uncut/);
  assert.equal(check({food:'shreddedcheddar'}).kind,'invalid');
});

test('unknown conditions never lead with a Keep headline', () => {
  const unknownButter = evaluate({...DEFAULTS,food:'butter',evidence:'warm',warmMinutes:'121'});
  assert.equal(unknownButter.kind,'uncertain');
  assert.doesNotMatch(unknownButter.title,/Keep|safe/);
  assert.ok(unknownButter.gaps.length >= 5);
  for (const override of [{durationKnown:'unknown'}, {doors:'unknown'}, {doors:'opened'}, {initialCold:'unknown'}, {initialCold:'no'}, {coldSource:'unknown'}, {coldSource:'yes'}, {spoilage:'unknown'}]) {
    assert.equal(check({...override,food:'butter',evidence:'warm',warmMinutes:'121'}).kind,'uncertain',JSON.stringify(override));
    assert.equal(check(override).kind,'uncertain',JSON.stringify(override));
  }
});

test('restoration-only cold reading never clears earlier exposure', () => {
  for (const outageMinutes of ['0','180','239','240']) {
    const r = check({outageMinutes,evidence:'restored'});
    assert.equal(r.kind,'uncertain'); assert.match(r.message,/does not show how warm/);
  }
  assert.equal(check({outageMinutes:'241',evidence:'restored'}).kind,'discard');
  assert.equal(check({durationKnown:'unknown',evidence:'restored'}).kind,'uncertain');
});

test('closed-door timing needs every source-supported assumption', () => {
  assert.equal(check({}).kind,'conditional');
  for (const evidence of ['unknown','cold']) assert.equal(check({evidence}).kind,'conditional');
  for (const evidence of ['unknown','cold','warm']) {
    assert.equal(check({durationKnown:'unknown',evidence,warmMinutes:'0'}).kind,'uncertain');
  }
  const fullColdLong = check({outageMinutes:'300',evidence:'cold'});
  assert.equal(fullColdLong.kind,'uncertain'); assert.match(fullColdLong.title,/evidence needs review/);
});

test('equivalent whole-period cold records share long-outage uncertainty without clearing positive exposure', () => {
  for (const food of Object.keys(FOODS).filter(key => FOODS[key].chart === 'discard')) {
    for (const outageMinutes of ['241','300','10080']) {
      const cold = check({food,outageMinutes,evidence:'cold'});
      const zeroWarm = check({food,outageMinutes,evidence:'warm',warmMinutes:'0'});
      assert.equal(zeroWarm.kind,'uncertain',`${food} ${outageMinutes}`);
      for (const key of ['title','message','next','rule']) assert.equal(zeroWarm[key],cold[key],key);
      assert.match(zeroWarm.next,/Do not use this result as clearance/);
      for (const warmMinutes of ['1','119','120','121']) {
        assert.equal(check({food,outageMinutes,evidence:'warm',warmMinutes}).kind,'discard',`${food} ${outageMinutes} ${warmMinutes}`);
      }
    }
  }
});

test('added cooling stays outside the timing assessment', () => {
  for (const evidence of ['unknown','cold','restored']) assert.equal(check({coldSource:'yes',evidence,outageMinutes:'300'}).kind,'uncertain');
  assert.equal(check({coldSource:'yes',evidence:'warm',warmMinutes:'121'}).kind,'discard');
  assert.equal(check({coldSource:'yes',food:'butter',evidence:'warm',warmMinutes:'121'}).kind,'uncertain');
});

test('unusual spoilage signs override all catalog categories and evidence modes', () => {
  for (const food of Object.keys(FOODS)) for (const evidence of ['unknown','warm','cold','restored']) {
    const r = check({food,evidence,warmMinutes:'0',spoilage:'yes'});
    assert.equal(r.kind,'discard',`${food} ${evidence}`); assert.match(r.rule,/CDC/);
  }
});

test('invalid, missing and contradictory numeric entries are rejected', () => {
  for (const value of ['', '-1', '1.5','1e2','Infinity','NaN','10081',' 12','12 ','01','<script>']) {
    assert.equal(check({outageMinutes:value}).kind,'invalid',value);
    assert.equal(check({evidence:'warm',warmMinutes:value}).kind,'invalid',value);
  }
  assert.equal(check({outageMinutes:'0'}).kind,'conditional');
  assert.equal(check({outageMinutes:'10080'}).kind,'discard');
  assert.equal(check({outageMinutes:'120',evidence:'warm',warmMinutes:'121'}).kind,'invalid');
  assert.ok(validate({...known,outageMinutes:'120',evidence:'warm',warmMinutes:'121'})[0].text.includes('cannot exceed'));
});

test('normalization discards inactive, foreign and stale fields', () => {
  const normalized = normalize({...known,durationKnown:'unknown',outageMinutes:'500',evidence:'cold',warmMinutes:'500',personalData:'must not save'});
  assert.equal(normalized.outageMinutes,''); assert.equal(normalized.warmMinutes,''); assert.ok(!Object.hasOwn(normalized,'personalData'));
  assert.deepEqual(normalize(null),DEFAULTS);
  assert.equal(normalize({food:'__proto__'}).food,'');
});

test('result evidence includes exact source URLs, assumptions, facts and tasting caution', () => {
  for (const result of [check({}),check({outageMinutes:'241'}),check({durationKnown:'unknown'}),check({food:'butter',evidence:'warm',warmMinutes:'121'})]) {
    assert.equal(result.facts.length,6); assert.ok(result.assumptions.length >= 2); assert.ok(result.gaps); assert.equal(result.sources.length,2);
    assert.match(result.caution,/Never taste/); assert.match(result.caution,/discarding/);
    assert.ok(!/\bsafe\b/i.test(result.title));
    result.sources.forEach(key => assert.ok(SOURCES[key].url.startsWith('https://')));
  }
});

test('safety invariants across 7776 synthetic input combinations', () => {
  let count=0;
  for (const food of ['milk','butter']) for(const durationKnown of ['known','unknown']) for(const outageMinutes of ['119','120','121','239','240','241']) for(const doors of ['closed','opened','unknown']) for(const initialCold of ['yes','no','unknown']) for(const coldSource of ['no','yes','unknown']) for(const evidence of ['unknown','restored','cold','warm']) for(const spoilage of ['yes','no','unknown']) {
    const r = check({food,durationKnown,outageMinutes,doors,initialCold,coldSource,evidence,warmMinutes:'0',spoilage}); count++;
    if (r.kind === 'invalid' || r.kind === 'discard') continue;
    if(durationKnown==='unknown' || doors!=='closed' || initialCold!=='yes' || coldSource!=='no' || spoilage!=='no' || evidence==='restored') assert.equal(r.kind,'uncertain');
    assert.ok(!/\bsafe\b/i.test(r.title));
  }
  assert.equal(count,7776);
});
