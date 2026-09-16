const api = globalThis.browser ?? chrome;

const patternsEl = document.getElementById('patterns');
const enabledEl = document.getElementById('enabled');
const pauseEl = document.getElementById('pauseWhenHidden');
const secondsEl = document.getElementById('seconds');
const testUrlEl = document.getElementById('testUrl');
const testResultEl = document.getElementById('testResult');
const importEl = document.getElementById('importText');
const transferStatusEl = document.getElementById('transferStatus');
const statusEl = document.getElementById('status');
let statusTimer;
let saveTimer;

function addRow(value = '') {
  const row = document.createElement('div');
  row.className = 'row';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = 'example.com/*';
  input.addEventListener('input', () => {
    runTest();
    scheduleSave();
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    row.remove();
    if (!patternsEl.querySelector('input')) addRow();
    runTest();
    save();
  });

  row.append(input, remove);
  patternsEl.appendChild(row);
  return input;
}

function currentPatterns() {
  return Array.from(patternsEl.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function currentSeconds() {
  return Math.min(120, Math.max(1, Math.round(Number(secondsEl.value)) || DEFAULTS.seconds));
}

function runTest() {
  const url = testUrlEl.value.trim();
  if (!url) {
    testResultEl.textContent = 'Type a URL to check it against the patterns above.';
    testResultEl.className = 'no';
    return;
  }
  const hit = matchesAny(url, currentPatterns());
  testResultEl.textContent = hit ? 'Match. This tab would close.' : 'No match. This tab would stay open.';
  testResultEl.className = hit ? '' : 'no';
}

function flash(el, text) {
  el.textContent = text;
  clearTimeout(el.flashTimer);
  el.flashTimer = setTimeout(() => (el.textContent = ''), 2500);
}

async function load() {
  const settings = await api.storage.sync.get(DEFAULTS);
  enabledEl.checked = settings.enabled;
  pauseEl.checked = settings.pauseWhenHidden;
  secondsEl.value = settings.seconds;
  if (settings.patterns.length === 0) addRow();
  else settings.patterns.forEach((pattern) => addRow(pattern));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

async function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  clearTimeout(statusTimer);
  try {
    await api.storage.sync.set({
      enabled: enabledEl.checked,
      pauseWhenHidden: pauseEl.checked,
      seconds: currentSeconds(),
      patterns: currentPatterns(),
    });
  } catch (error) {
    // Sync storage caps each setting at about 8 KB, which a long pattern list can pass.
    statusEl.textContent = /quota/i.test(error?.message)
      ? "Couldn't save. There are too many patterns to sync, remove some and try again."
      : `Couldn't save your changes. ${error?.message ?? ''}`.trim();
    statusEl.classList.add('visible', 'error');
    return;
  }
  statusEl.textContent = 'Saved';
  statusEl.classList.remove('error');
  statusEl.classList.add('visible');
  statusTimer = setTimeout(() => statusEl.classList.remove('visible'), 1500);
}

async function exportPatterns() {
  const patterns = currentPatterns();
  if (patterns.length === 0) {
    flash(transferStatusEl, 'No patterns to copy.');
    return;
  }
  await navigator.clipboard.writeText(patterns.join(', '));
  flash(transferStatusEl, `Copied ${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'}.`);
}

function importPatterns() {
  const existing = new Set(currentPatterns().map((p) => p.toLowerCase()));
  const added = [];
  for (const pattern of importEl.value.split(/[\s,]+/)) {
    if (!pattern || existing.has(pattern.toLowerCase())) continue;
    existing.add(pattern.toLowerCase());
    added.push(pattern);
  }
  importEl.value = '';

  if (added.length === 0) {
    flash(transferStatusEl, 'Nothing new to add.');
    return;
  }
  // Fill blank rows first so an empty list doesn't keep a stray empty input.
  const blanks = Array.from(patternsEl.querySelectorAll('input')).filter((input) => !input.value.trim());
  for (const pattern of added) {
    const blank = blanks.shift();
    if (blank) blank.value = pattern;
    else addRow(pattern);
  }
  flash(transferStatusEl, `Added ${added.length} ${added.length === 1 ? 'pattern' : 'patterns'}.`);
  runTest();
  save();
}

async function init() {
  // Wait for the stored settings before listening, or an early click would save
  // the empty form over them.
  await load();

  document.getElementById('add').addEventListener('click', () => addRow().focus());
  document.getElementById('export').addEventListener('click', exportPatterns);
  document.getElementById('import').addEventListener('click', importPatterns);
  importEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') importPatterns();
  });
  enabledEl.addEventListener('change', save);
  pauseEl.addEventListener('change', save);
  secondsEl.addEventListener('input', scheduleSave);
  secondsEl.addEventListener('change', () => {
    secondsEl.value = currentSeconds();
    save();
  });
  testUrlEl.addEventListener('input', runTest);
  window.addEventListener('pagehide', () => {
    if (saveTimer) save();
  });
}

init();
