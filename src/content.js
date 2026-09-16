const api = globalThis.browser ?? chrome;

let currentUrl = location.href;
let session = 0;
let host = null;

const TICK = 250;

function teardown() {
  session++;
  if (host) {
    host.remove();
    host = null;
  }
}

async function whenDomReady() {
  if (document.readyState !== 'loading') return;
  await new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

// Chrome can load a page before it's shown. Wait until it is, so the countdown
// doesn't run out while nobody can see it.
async function whenActivated() {
  if (!document.prerendering) return;
  await new Promise((resolve) => {
    document.addEventListener('prerenderingchange', resolve, { once: true });
  });
}

function showCountdown({ seconds, pauseWhenHidden }) {
  const id = session;

  host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .card {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 240px;
        box-sizing: border-box;
        padding: 14px 16px 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        background: #22222a;
        color: #f4f4f6;
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
        animation: slide-in 160ms ease-out;
      }
      @keyframes slide-in {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .title { font-weight: 600; letter-spacing: 0.2px; }
      .track {
        margin: 10px 0 12px;
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.15);
        overflow: hidden;
      }
      .bar {
        height: 100%;
        background: #ff6b5e;
        transform: scaleX(0);
        transform-origin: left;
      }
      button {
        display: block;
        width: 100%;
        padding: 7px 10px;
        border: 0;
        border-radius: 6px;
        background: #3a3a44;
        color: #f4f4f6;
        font: inherit;
        font-weight: 500;
        cursor: pointer;
      }
      button:hover { background: #4a4a56; }
    </style>
    <div class="card">
      <div class="title">Auto-closing&hellip;</div>
      <div class="track"><div class="bar"></div></div>
      <button type="button">Keep Open</button>
    </div>
  `;
  (document.body || document.documentElement).appendChild(host);

  root.querySelector('button').addEventListener('click', () => {
    teardown();
    api.runtime.sendMessage({ type: 'keep' });
  });

  const bar = root.querySelector('.bar');
  bar.style.transition = `transform ${TICK}ms linear`;
  const total = seconds * 1000;
  let elapsed = 0;
  let last = performance.now();

  // The bar is moved by a CSS transition towards where it will be at the next
  // tick, which keeps it smooth without repainting on every frame.
  function tick() {
    if (id !== session) {
      clearInterval(timer);
      return;
    }
    const now = performance.now();
    const paused = pauseWhenHidden && document.hidden;
    if (!paused) elapsed += now - last;
    last = now;
    if (elapsed >= total) {
      clearInterval(timer);
      bar.style.transform = 'scaleX(1)';
      api.runtime.sendMessage({ type: 'close' });
      return;
    }
    const target = paused ? elapsed : elapsed + TICK;
    bar.style.transform = `scaleX(${Math.min(1, target / total)})`;
  }

  const timer = setInterval(tick, TICK);
  bar.getBoundingClientRect();
  tick();
}

async function check() {
  currentUrl = location.href;
  teardown();
  const id = session;

  let settings;
  try {
    await whenActivated();
    // Read settings here so pages that don't match never wake the background.
    settings = await api.storage.sync.get(DEFAULTS);
    if (id !== session || !settings.enabled || !matchesAny(currentUrl, settings.patterns)) return;
    if (await api.runtime.sendMessage({ type: 'kept' })) return;
  } catch {
    return;
  }

  await whenDomReady();
  if (id === session) showCountdown(settings);
}

api.runtime.onMessage.addListener((message) => {
  if (message.type === 'recheck' && location.href !== currentUrl) check();
});

// Timers pause while a page sits in the back/forward cache, and would count the
// time away as elapsed once it's restored. Start over instead.
window.addEventListener('pagehide', (event) => {
  if (event.persisted) teardown();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) check();
});

check();
