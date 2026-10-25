import { DEFAULTS, FOODS, SOURCES, evaluate, normalize } from './rules.mjs';

const KEY = 'coldpause-session-v1';
const form = document.querySelector('#food-form');
const resultPanel = document.querySelector('#result');
const initialResult = resultPanel.innerHTML;
const errors = document.querySelector('#errors');
const sessionStatus = document.querySelector('#session-status');
const announcement = document.querySelector('#announcement');
let reviewed = false;
const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };

function readForm() { return normalize(Object.fromEntries(new FormData(form))); }
function writeForm(data) {
  for (const [key, value] of Object.entries(data)) {
    const control = form.elements.namedItem(key);
    if (control) control.value = value;
  }
  syncFields();
}
function syncFields() {
  const d = readForm();
  document.querySelector('#duration-fields').hidden = d.durationKnown !== 'known';
  document.querySelector('#outageMinutes').disabled = d.durationKnown !== 'known';
  document.querySelector('#warm-fields').hidden = d.evidence !== 'warm';
  document.querySelector('#warmMinutes').disabled = d.evidence !== 'warm';
  document.querySelector('#food-note').textContent = FOODS[d.food]?.note || 'Choose the exact type. Guidance for one food does not apply to the whole refrigerator.';
}
function clearErrors() {
  errors.hidden = true;
  errors.replaceChildren();
  for (const field of form.querySelectorAll('[aria-invalid]')) { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-errormessage'); }
}
function showErrors(items) {
  clearErrors();
  errors.hidden = false;
  errors.append(el('h2', 'Check these details'));
  const list = el('ul');
  items.forEach((item, i) => {
    const li = el('li'), link = el('a', item.text); link.href = `#${item.field}`; link.id = `error-${i}`;
    link.addEventListener('click', event => { event.preventDefault(); document.getElementById(item.field).focus(); });
    li.append(link); list.append(li);
    const field = document.getElementById(item.field); field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-errormessage', link.id);
  });
  errors.append(list); errors.focus();
}
function persist() {
  let message;
  try { localStorage.setItem(KEY, JSON.stringify(readForm())); message = 'Choices saved in this browser. Clear session removes your choices and result.'; }
  catch { message = 'Local saving is unavailable. Choices will be lost on reload.'; }
  if (sessionStatus.textContent !== message) sessionStatus.textContent = message;
}
function invalidate() {
  if (reviewed) {
    resultPanel.className = 'result empty';
    const symbol = el('div', 'Ⅱ', 'result-symbol'); symbol.setAttribute('aria-hidden', 'true');
    resultPanel.replaceChildren(symbol, el('h2', 'Facts changed. Review again.'), el('p', 'The previous guidance has been removed. Review this food with the updated facts.'));
    resultPanel.querySelector('h2').id = 'result-title'; resultPanel.querySelector('h2').tabIndex = -1;
    announcement.textContent = 'Facts changed. Previous guidance removed.';
    reviewed = false;
  }
}
function renderResult(result) {
  resultPanel.className = `result ${result.kind}`;
  resultPanel.replaceChildren();
  resultPanel.append(el('p', result.food.name, 'result-food'));
  const heading = el('h2', result.title); heading.id = 'result-title'; heading.tabIndex = -1;
  resultPanel.append(heading, el('p', result.message), el('p', result.next, 'next-action'));
  resultPanel.append(el('h3', 'Why this guidance appears'), el('p', result.rule, 'rule-text'));
  if (result.gaps.length) { resultPanel.append(el('h3', 'Still unknown or limited')); const ul = el('ul'); result.gaps.forEach(gap => ul.append(el('li', gap))); resultPanel.append(ul); }
  const details = el('details'); details.append(el('summary', 'Your facts and assumptions'));
  const dl = el('dl'); result.facts.forEach(([term, description]) => dl.append(el('dt', term), el('dd', description))); details.append(dl, el('h3', 'Assumptions'));
  const assumptions = el('ul'); result.assumptions.forEach(item => assumptions.append(el('li', item))); details.append(assumptions); resultPanel.append(details);
  resultPanel.append(el('h3', 'Official rule sources'));
  const links = el('ul', '', 'result-sources'); result.sources.forEach(key => { const li = el('li'), link = el('a', `${SOURCES[key].label} (online)`); link.href = SOURCES[key].url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `${SOURCES[key].label}, opens a new tab, online`); li.append(link); links.append(li); }); resultPanel.append(links, el('p', result.caution, 'result-footnote'));
  reviewed = true;
  heading.focus({ preventScroll: true });
  resultPanel.scrollIntoView({ block: 'start', behavior: 'auto' });
  announcement.textContent = `${result.food.name}. ${result.title}.`;
}

form.addEventListener('input', () => { clearErrors(); syncFields(); invalidate(); persist(); });
form.addEventListener('change', event => {
  if (event.target.name === 'food') {
    form.elements.initialCold.value = 'unknown'; form.elements.coldSource.value = 'unknown';
    form.elements.evidence.value = 'unknown'; form.elements.warmMinutes.value = ''; form.elements.spoilage.value = 'unknown';
    announcement.textContent = 'Food changed. Enter starting conditions, added cooling, temperature evidence and spoilage observations for this food.';
  }
  if (form.elements.durationKnown.value !== 'known') form.elements.outageMinutes.value = '';
  if (form.elements.evidence.value !== 'warm') form.elements.warmMinutes.value = '';
  clearErrors(); syncFields(); invalidate(); persist();
});
form.addEventListener('submit', event => { event.preventDefault(); syncFields(); const result = evaluate(readForm()); if (result.kind === 'invalid') { invalidate(); showErrors(result.errors); } else { clearErrors(); renderResult(result); persist(); } });
document.querySelector('#clear-session').addEventListener('click', () => {
  form.reset(); writeForm(DEFAULTS); clearErrors(); reviewed = false; resultPanel.className = 'result empty'; resultPanel.innerHTML = initialResult;
  try { localStorage.removeItem(KEY); sessionStatus.textContent = 'Session cleared. No food choices saved. Offline cache settings are unchanged.'; } catch { sessionStatus.textContent = 'Form cleared. Browser storage is unavailable; stored data could not be checked.'; }
  announcement.textContent = 'Session cleared.'; document.querySelector('#food').focus();
});

try { const saved = localStorage.getItem(KEY); if (saved) { writeForm(normalize(JSON.parse(saved))); sessionStatus.textContent = 'Saved choices restored. Review this food again for fresh guidance.'; } } catch { sessionStatus.textContent = 'Saved choices could not be restored. Start a new check.'; }
syncFields();

const offline = document.querySelector('#offline-status');
let offlineReady = false;
function updateOffline() { offline.textContent = offlineReady ? `Offline copy ready${navigator.onLine ? '' : ' · offline detected'}` : 'Offline copy not ready'; offline.classList.toggle('ready', offlineReady); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(async registration => {
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (worker) { const channel = new MessageChannel(); channel.port1.onmessage = event => { offlineReady = event.data?.ready === true; updateOffline(); }; worker.postMessage('cache-status', [channel.port2]); }
    updateOffline();
  }).catch(() => { offlineReady = false; updateOffline(); });
} else updateOffline();
window.addEventListener('online', updateOffline); window.addEventListener('offline', updateOffline);
