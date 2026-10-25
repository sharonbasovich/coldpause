import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
function luminance(hex){const values=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

test('static markup has unique IDs, language, landmarks and a skip link',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  assert.match(html,/<html lang="en">/);assert.match(html,/<main id="main"/);assert.match(html,/class="skip-link" href="#main"/);assert.equal((html.match(/<h1>/g)||[]).length,1);
});
test('each select and number field has a visible label and valid hint references',()=>{
  for(const m of html.matchAll(/<(select|input)\b([^>]+)>/g)){
    if(m[2].includes('type="radio"'))continue;
    const id=m[2].match(/id="([^"]+)"/)[1];assert.ok(html.includes(`<label for="${id}">`),id);
    const described=m[2].match(/aria-describedby="([^"]+)"/);if(described)for(const ref of described[1].split(' '))assert.ok(html.includes(`id="${ref}"`),ref);
  }
  assert.match(html,/<fieldset><legend>Do you know/);assert.match(html,/role="alert" tabindex="-1"/);assert.match(html,/aria-live="polite" aria-atomic="true"/);
});
test('contrast reaches AA text minimums and 3:1 field boundaries',()=>{
  for(const [foreground,background] of [['#172b45','#eef3f8'],['#4e6176','#eef3f8'],['#4e6176','#ffffff'],['#ffffff','#284da0'],['#d4dfed','#172b45'],['#172b45','#fff1ce']])assert.ok(contrast(foreground,background)>=4.5,`${foreground} ${background}`);
  assert.ok(contrast('#6f839c','#ffffff')>=3);assert.ok(contrast('#6f839c','#eef3f8')>=3);
  assert.ok(contrast('#b75b13','#ffffff')>=3);assert.ok(contrast('#b75b13','#172b45')>=3);
});
test('focus styling, reduced motion, forced colors and mobile stacking are specified',()=>{
  assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/forced-colors:active/);assert.match(css,/@media\(max-width:680px\)/);assert.match(css,/\.workspace\{grid-template-columns:1fr/);
});
test('runtime stays local and scope and jurisdiction are explicit',()=>{
  assert.match(html,/Not Ontario-specific advice/);assert.match(html,/U\.S\. official/);assert.match(html,/Local prototype/);
  for(const m of html.matchAll(/<(script|link|img)\b([^>]+)>/g))assert.doesNotMatch(m[2],/(src|href)="https?:/);
  assert.match(html,/Synthetic demos only/);assert.match(html,/No accounts or uploads/);
});
