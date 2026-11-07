import { DEFAULTS, FOODS, SOURCES, evaluate, normalize } from './rules.mjs';

const KEY = 'coldpause-session-v1';
// Nonpersonal coordination metadata survives Clear; food choices do not.
const GENERATION_KEY = `${KEY}.generation`;
function nextGeneration(value) {
  if (value !== null && !/^(0|[1-9]\d{0,15})$/.test(value)) throw Error('Invalid storage generation');
  const current = value === null ? 0 : Number(value);
  if (!Number.isSafeInteger(current) || current >= Number.MAX_SAFE_INTEGER) throw Error('Storage generation exhausted');
  return String(current + 1);
}
const form = document.querySelector('#food-form');
const resultPanel = document.querySelector('#result');
const initialResult = resultPanel.innerHTML;
const errors = document.querySelector('#errors');
const sessionStatus = document.querySelector('#session-status');
const announcement = document.querySelector('#announcement');
let reviewed = false;
let reviewedResult = null, reviewInterrupted = false, pausedReview = false;
const factCheckNote = document.querySelector('#fact-check-note');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };

function readForm() { return normalize(Object.fromEntries(new FormData(form))); }
function restoredChoices(raw) {
  const data = normalize(raw);
  // Match writeForm's select/number coercion without touching the live form.
  // Deep clones retain food options; number controls sanitize malformed text.
  // The other fields are already exact string enum values after normalize.
  for (const key of ['food', 'outageMinutes', 'warmMinutes']) {
    const control = form.elements.namedItem(key).cloneNode(true);
    control.value = data[key];
    data[key] = control.value;
  }
  return data;
}
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
let storageSnapshot = null, storageGeneration = null, storageReadable = true, storageConflict = false;
let writeVersion = 0, pendingWrite = false, writeController;
const defaultChoices = JSON.stringify(DEFAULTS);
let lastRecoverableChoices = defaultChoices, discardNextExit = false, clearUnverified = false;
function recoverableChoicesNow() {
  // Read the same effective choices a fresh page would restore. Storage
  // events can be delayed, so the last local save is not enough evidence.
  const generation = localStorage.getItem(GENERATION_KEY);
  nextGeneration(generation);
  const saved = localStorage.getItem(KEY);
  if (localStorage.getItem(GENERATION_KEY) !== generation) throw Error('Storage changed during exit check');
  const recoverable = JSON.stringify(restoredChoices(saved === null ? DEFAULTS : JSON.parse(saved)));
  // Remember peer changes too, so a later read failure cannot erase known
  // recovery differences, especially when a blank Clear has not been saved.
  lastRecoverableChoices = recoverable;
  clearUnverified = false;
  return recoverable;
}
function choicesNeedExitWarning() {
  if (pendingWrite) return true;
  const choices = JSON.stringify(readForm());
  try { return choices !== recoverableChoicesNow(); }
  catch {
    // An untouched blank page needs no protection. A failed Clear is different:
    // even an earlier verified empty store can since have received a peer save
    // whose event has not arrived. Keep that uncertainty until a fresh check or
    // successful write establishes what reload will restore.
    return clearUnverified || choices !== defaultChoices || choices !== lastRecoverableChoices;
  }
}
const reloadChoices = document.querySelector('#reload-choices');
const conflictMessage = 'Saved choices changed in another tab. This tab keeps its choices and will not overwrite them. Reload to discard this tab’s choices and use the saved choices.';
function showStorageConflict(clear = false) {
  try { recoverableChoicesNow(); } catch { /* Keep the last verified recovery state. */ }
  storageConflict = true;
  sessionStatus.textContent = clear ? 'Form cleared in this tab only. Saved choices changed in another tab and are unchanged. Further edits stay in this tab. Reload to discard this tab’s choices and use the saved choices.' : conflictMessage;
  reloadChoices.hidden = false;
}
async function persist(clear = false) {
  discardNextExit = false;
  if (clear) clearUnverified = true;
  const version = ++writeVersion;
  writeController?.abort();
  pendingWrite = false;
  if (storageConflict) { showStorageConflict(clear); return; }
  if (!storageReadable || !navigator.locks?.request) {
    sessionStatus.textContent = clear
      ? 'Form cleared in this tab only. Browser storage could not be safely changed; stored data could not be checked or removed.'
      : 'Local saving is unavailable. Choices stay in this tab and will be lost on reload. Saved food choices are unchanged.';
    return;
  }
  const snapshot = clear ? null : JSON.stringify(readForm());
  const controller = new AbortController(); writeController = controller;
  pendingWrite = true;
  sessionStatus.textContent = clear ? 'Clearing saved choices…' : 'Saving choices…';
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    // Short synchronous critical section: compare and write under one shared lock.
    const outcome = await navigator.locks.request(`${KEY}.write`, { signal: controller.signal }, () => {
      if (controller.signal.aborted || version !== writeVersion) return 'cancelled';
      if (localStorage.getItem(GENERATION_KEY) !== storageGeneration || localStorage.getItem(KEY) !== storageSnapshot) return 'conflict';
      const generation = nextGeneration(storageGeneration);
      // Advance first. If the following food-data mutation fails, peers still
      // reject stale writes; this tab must reload before trying again.
      localStorage.setItem(GENERATION_KEY, generation);
      if (clear) localStorage.removeItem(KEY); else localStorage.setItem(KEY, snapshot);
      storageGeneration = generation; storageSnapshot = snapshot;
      lastRecoverableChoices = clear ? defaultChoices : snapshot;
      clearUnverified = false;
      return 'saved';
    });
    if (version !== writeVersion) return;
    if (outcome === 'conflict') showStorageConflict(clear);
    else if (outcome === 'saved') sessionStatus.textContent = clear
      ? 'Session cleared. No food choices saved. Offline cache settings are unchanged.'
      : 'Choices saved in this browser. Clear session removes your choices and result.';
  } catch {
    if (version === writeVersion) sessionStatus.textContent = clear
      ? 'Form cleared in this tab only. Saved choices could not be removed. Coordination metadata may have changed; reload before trying again.'
      : 'Local saving is unavailable. Choices stay in this tab and will be lost on reload. Saved food choices are unchanged.';
  } finally {
    clearTimeout(timer);
    if (version === writeVersion) pendingWrite = false;
  }
}
window.addEventListener('storage', event => {
  if (event.key !== KEY && event.key !== GENERATION_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== localStorage) return;
    if (localStorage.getItem(GENERATION_KEY) === storageGeneration && localStorage.getItem(KEY) === storageSnapshot) return;
  } catch { storageReadable = false; }
  ++writeVersion; writeController?.abort(); pendingWrite = false;
  showStorageConflict();
});
window.addEventListener('beforeunload', event => {
  if (discardNextExit) { discardNextExit = false; return; }
  if (!choicesNeedExitWarning()) return;
  event.preventDefault(); event.returnValue = '';
});
reloadChoices.addEventListener('click', () => {
  // This control explicitly offers to discard this tab's choices. Consume the
  // exemption once, so a later canceled navigation cannot disable protection.
  discardNextExit = true;
  try { location.reload(); } catch { discardNextExit = false; }
});
function invalidate() {
  if (reviewed || pausedReview) {
    resultPanel.className = 'result empty';
    const symbol = el('div', 'Ⅱ', 'result-symbol'); symbol.setAttribute('aria-hidden', 'true');
    resultPanel.replaceChildren(symbol, el('h2', 'Facts changed. Review again.'), el('p', 'The previous guidance has been removed. Review this food with the updated facts.'));
    resultPanel.querySelector('h2').id = 'result-title'; resultPanel.querySelector('h2').tabIndex = -1;
    announcement.textContent = 'Facts changed. Previous guidance removed.';
    reviewed = false; reviewedResult = null; reviewInterrupted = false; pausedReview = false;
  }
}
function pauseInterruptedReview() {
  if (!reviewed || !reviewInterrupted) return;
  const previous = reviewedResult;
  const focusWasInResult = resultPanel.contains(document.activeElement);
  reviewed = false; reviewedResult = null; reviewInterrupted = false; pausedReview = true;
  factCheckNote.hidden = false;
  resultPanel.className = `result ${previous.kind === 'discard' ? 'discard' : 'uncertain'}`;
  const heading = el('h2', 'Check your facts after returning'); heading.id = 'result-title'; heading.tabIndex = -1;
  resultPanel.replaceChildren(el('p', previous.food.name, 'result-food'), heading);
  if (previous.kind === 'discard') resultPanel.append(el('p', 'Your previous review advised: Discard this food. Leaving the page does not reverse that advice.', 'next-action'));
  resultPanel.append(el('p', 'The previous result was based on the facts entered before you left. Your entries are unchanged; check them before reviewing again.'), el('p', 'If power is still out, update the total outage minutes. ColdPause is not a running timer and does not infer temperatures.', 'review-reminder'));
  const check = el('button', 'Check outage facts', 'primary'); check.type = 'button';
  check.addEventListener('click', () => {
    const target = document.querySelector('#outage-facts'); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
  resultPanel.append(check, el('p', previous.caution, 'result-footnote'));
  // Preserve focus in the replaced panel, but never steal it from the form or
  // scroll the page on a lifecycle event.
  if (focusWasInResult) heading.focus({ preventScroll: true });
  announcement.textContent = `Check your facts after returning. ${previous.kind === 'discard' ? 'Your previous review advised discarding this food. ' : ''}If power is still out, update the total outage minutes before reviewing again.`;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (reviewed) reviewInterrupted = true; }
  else pauseInterruptedReview();
});
window.addEventListener('pagehide', () => { if (reviewed) reviewInterrupted = true; });
window.addEventListener('pageshow', event => {
  discardNextExit = false;
  if (event.persisted && reviewed) reviewInterrupted = true;
  if (document.visibilityState !== 'hidden') pauseInterruptedReview();
});
window.addEventListener('focus', () => {
  if (document.visibilityState !== 'hidden') pauseInterruptedReview();
});
function renderResult(result) {
  resultPanel.className = `result ${result.kind}`;
  resultPanel.replaceChildren();
  resultPanel.append(el('p', result.food.name, 'result-food'));
  const heading = el('h2', result.title); heading.id = 'result-title'; heading.tabIndex = -1;
  resultPanel.append(heading, el('p', result.message), el('p', result.next, 'next-action'));
  resultPanel.append(el('p', 'Based on your entered facts, not a live reading. If power is still out, update the duration yourself.', 'review-reminder'));
  resultPanel.append(el('h3', 'Why this guidance appears'), el('p', result.rule, 'rule-text'));
  if (result.gaps.length) { resultPanel.append(el('h3', 'Still unknown or limited')); const ul = el('ul'); result.gaps.forEach(gap => ul.append(el('li', gap))); resultPanel.append(ul); }
  const details = el('details'); details.append(el('summary', 'Your facts and assumptions'));
  const dl = el('dl'); result.facts.forEach(([term, description]) => dl.append(el('dt', term), el('dd', description))); details.append(dl, el('h3', 'Assumptions'));
  const assumptions = el('ul'); result.assumptions.forEach(item => assumptions.append(el('li', item))); details.append(assumptions); resultPanel.append(details);
  resultPanel.append(el('h3', 'Official rule sources'));
  const links = el('ul', '', 'result-sources'); result.sources.forEach(key => { const li = el('li'), link = el('a', `${SOURCES[key].label} (online)`); link.href = SOURCES[key].url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `${SOURCES[key].label}, opens a new tab, online`); li.append(link); links.append(li); }); resultPanel.append(links, el('p', result.caution, 'result-footnote'));
  reviewed = true; reviewedResult = result; reviewInterrupted = false; pausedReview = false; factCheckNote.hidden = true;
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
  form.reset(); writeForm(DEFAULTS); clearErrors(); reviewed = false; reviewedResult = null; reviewInterrupted = false; pausedReview = false; factCheckNote.hidden = true; resultPanel.className = 'result empty'; resultPanel.innerHTML = initialResult;
  persist(true);
  announcement.textContent = 'Form cleared in this tab.'; document.querySelector('#food').focus();
});

try {
  storageGeneration = localStorage.getItem(GENERATION_KEY);
  nextGeneration(storageGeneration); // Validate before restoring or saving.
  storageSnapshot = localStorage.getItem(KEY);
  if (localStorage.getItem(GENERATION_KEY) !== storageGeneration) throw Error('Storage changed during restore');
} catch { storageReadable = false; }
try { if (!storageReadable) throw Error('Storage unavailable'); if (storageSnapshot) { writeForm(normalize(JSON.parse(storageSnapshot))); lastRecoverableChoices = JSON.stringify(readForm()); sessionStatus.textContent = 'Saved choices restored, not a current reading. Check every entry and update the duration if power is still out before you review this food again.'; factCheckNote.hidden = false; } } catch { sessionStatus.textContent = 'Saved choices could not be restored. Start a new check.'; }
syncFields();

const offline = document.querySelector('#offline-status');
let offlineReady = false;
function updateOffline() { offline.textContent = offlineReady ? `Offline copy ready${navigator.onLine ? '' : ' · offline detected'}` : 'Offline copy not ready'; offline.classList.toggle('ready', offlineReady); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // A failed first install leaves serviceWorker.ready pending forever. Bound both
  // activation and the cache reply; neither a registered worker nor a timeout
  // establishes that all offline assets are available.
  function bounded(promise, milliseconds) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Offline readiness timed out')), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }
  navigator.serviceWorker.register('./sw.js').then(async () => {
    const registration = await bounded(navigator.serviceWorker.ready, 10000);
    const worker = registration.active;
    if (!worker) throw new Error('No active offline worker');
    const channel = new MessageChannel();
    try {
      offlineReady = await bounded(new Promise((resolve, reject) => {
        channel.port1.onmessage = event => resolve(event.data?.ready === true);
        channel.port1.onmessageerror = () => reject(new Error('Invalid offline cache reply'));
        worker.postMessage('cache-status', [channel.port2]);
      }), 5000);
      updateOffline();
    } finally {
      channel.port1.close(); channel.port2.close();
    }
  }).catch(() => { offlineReady = false; updateOffline(); });
} else updateOffline();
window.addEventListener('online', updateOffline); window.addEventListener('offline', updateOffline);
