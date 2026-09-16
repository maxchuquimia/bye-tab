import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');
const base = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));

const targets = {
  firefox: {
    ...base,
    background: { scripts: ['match.js', 'background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'bye-tab@mergeable.io',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
  chrome: {
    ...base,
    background: { service_worker: 'service-worker.js' },
    minimum_chrome_version: '102',
  },
  safari: {
    ...base,
    background: { service_worker: 'service-worker.js' },
    options_ui: { page: base.options_ui.page },
  },
};

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(targets);

for (const name of names) {
  const manifest = targets[name];
  if (!manifest) throw new Error(`Unknown target: ${name}`);

  // Only clear this target, so building one browser leaves the others alone.
  const out = join(dist, name);
  const zip = join(dist, `bye-tab-${name}-${base.version}.zip`);
  rmSync(out, { recursive: true, force: true });
  rmSync(zip, { force: true });
  cpSync(src, out, {
    recursive: true,
    filter: (path) => !path.endsWith('.svg') && !path.endsWith('.DS_Store'),
  });
  if (name === 'firefox') rmSync(join(out, 'service-worker.js'));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
  console.log(`Built ${zip}`);

  if (name === 'safari') packageSafari(out);
}

// Wraps the extension in an Xcode project (macOS and iOS apps) using the Safari packager.
function packageSafari(extension) {
  if (process.platform !== 'darwin') {
    console.log('Skipping Safari Xcode project, it needs macOS with Xcode');
    return;
  }
  const project = join(dist, 'safari-xcode');
  execFileSync('xcrun', [
    'safari-web-extension-packager', extension,
    '--project-location', project,
    '--app-name', 'Bye Tab',
    '--bundle-identifier', 'io.mergeable.bye-tab',
    '--swift',
    '--copy-resources',
    '--no-open',
    '--no-prompt',
    '--force',
  ], { stdio: 'inherit' });
  console.log(`Built ${join(project, 'Bye Tab', 'Bye Tab.xcodeproj')}`);
}
