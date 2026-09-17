#!/usr/bin/env node
// Boots the real main process against stand-in pages and checks the whole chain works:
// preload bridge -> IPC -> validation -> reducer -> storage, and the pushes back out.
//
// The pages have no UI; the dashboard stand-in runs a scripted sequence and reports its
// results by adding a task called "SMOKE ...". That means the result has to survive the
// round trip through the reducer and onto disk to be seen at all, which is the point.
//
//   node scripts/smoke.mjs         (needs a display: xvfb-run -a node scripts/smoke.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, '.smoke');
const userData = path.join(work, 'user-data');
const pages = path.join(work, 'pages');
const dataFile = path.join(userData, 'allbee-focus-data.json');
const logFile = path.join(userData, 'allbee-focus.log');

const BOOT_TIMEOUT_MS = 60_000;
const EXIT_TIMEOUT_MS = 15_000;

/** Errors that only happen because this is a Linux container, not Windows. */
const EXPECTED_ERRORS = [/tray could not be created/i, /failed to load .* ENOENT/i];

const wanted = ['snap', 'onb', 'rej', 'rejc', 'hist', 'fg', 'data', 'ui'];

// ---------------------------------------------------------------------------
// stand-in pages

const INDEX_JS = `
const api = window.allbee;
const flags = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for a push to arrive, returning how long it took, or -1 if it never did. */
async function until(check, limit) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if (check()) return Date.now() - start;
    await wait(25);
  }
  return -1;
}

async function run() {
  const snap = await api.getSnapshot();
  flags.snap = snap && snap.data && snap.runtime && snap.data.settings ? 1 : 0;

  const onboard = await api.dispatch({
    type: 'onboarding/finish',
    payload: {
      companionId: 'bee',
      companionName: 'Allie',
      userName: 'Smoke',
      dailyGoalMinutes: 60,
      rules: [{ pattern: 'youtube.com', limitMinutes: 15 }],
      patrolEnabled: true,
      mode: 'complain',
      countdownSeconds: 10,
      notifications: false,
      sounds: true,
      startWithWindows: false,
    },
  });
  flags.onb = onboard.ok ? 1 : 0;

  // A made-up action and a command with the wrong field type must both be refused.
  const bad = await api.dispatch({ type: 'evil/drop-tables' });
  flags.rej = bad.ok === false ? 1 : 0;
  const badCmd = await api.command({ type: 'dev/simulate', url: 42 });
  flags.rejc = badCmd.ok === false ? 1 : 0;

  const history = await api.command({ type: 'history/get', limit: 5 });
  flags.hist = history.ok && Array.isArray(history.value) ? 1 : 0;

  let sawForeground = false;
  api.onRuntime((rt) => {
    if (rt.foreground && String(rt.foreground.host || '').includes('youtube.com')) sawForeground = true;
  });
  await api.command({ type: 'dev/simulate', url: 'https://www.youtube.com/shorts/abc' });
  flags.fg = (await until(() => sawForeground, 4000)) >= 0 ? 1 : 0;

  let sawData = false;
  api.onData((d) => {
    if (d && d.timer && d.timer.status === 'running') sawData = true;
  });
  await api.dispatch({ type: 'timer/start', minutes: 15 });
  const dataMs = await until(() => sawData, 4000);
  flags.data = dataMs >= 0 ? 1 : 0;

  let sawUi = false;
  api.onUiEvent((e) => {
    if (e && e.kind === 'focusMode' && e.on === true) sawUi = true;
  });
  await api.command({ type: 'focusMode/set', on: true });
  flags.ui = (await until(() => sawUi, 4000)) >= 0 ? 1 : 0;

  // Reported so a slow batch shows up as a number rather than a silent pass.
  flags.dms = dataMs;

  return Object.entries(flags).map(([k, v]) => k + '=' + v).join(' ');
}

run()
  .then((summary) => api.dispatch({ type: 'tasks/add', task: { title: 'SMOKE ' + summary } }))
  .catch((err) => api.dispatch({ type: 'tasks/add', task: { title: 'SMOKE failed=' + String(err).slice(0, 80) } }));
`;

const COMPANION_JS = `
window.allbee.onView(() => {});
window.allbee.ready();
`;

const AUDIO_JS = `
window.allbee.onState(() => {});
window.allbee.onChime(() => {});
window.allbee.ready();
`;

const html = (script) =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'" />
    <title>AllBee Focus smoke</title>
  </head>
  <body>
    <script src="${script}"></script>
  </body>
</html>`;

// ---------------------------------------------------------------------------
// helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return null;
  }
}

function smokeTask(data) {
  return data?.tasks?.find((t) => typeof t?.title === 'string' && t.title.startsWith('SMOKE ')) ?? null;
}

function readLog() {
  try {
    return fs.readFileSync(logFile, 'utf8');
  } catch {
    return '';
  }
}

function fail(message, output) {
  console.error(`\nSMOKE FAILED: ${message}`);
  if (output) console.error(`\n--- electron output (last 60 lines) ---\n${output.split('\n').slice(-60).join('\n')}`);
  const logged = readLog();
  if (logged) console.error(`\n--- app log (last 40 lines) ---\n${logged.split('\n').slice(-40).join('\n')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(pages, { recursive: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(pages, 'index.html'), html('index.js'));
fs.writeFileSync(path.join(pages, 'index.js'), INDEX_JS);
fs.writeFileSync(path.join(pages, 'companion.html'), html('companion.js'));
fs.writeFileSync(path.join(pages, 'companion.js'), COMPANION_JS);
fs.writeFileSync(path.join(pages, 'audio.html'), html('audio.js'));
fs.writeFileSync(path.join(pages, 'audio.js'), AUDIO_JS);

if (!fs.existsSync(path.join(root, 'dist/main/main.js'))) fail('dist/main/main.js is missing — run `npm run build:main` first');

const electron = require('electron');
const args = [];
// Chromium refuses its own sandbox when running as root, which CI containers often do.
if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');
args.push(root);

console.log('smoke: starting AllBee Focus…');
const child = spawn(electron, args, {
  cwd: root,
  env: {
    ...process.env,
    ALLBEE_USER_DATA: userData,
    ALLBEE_RENDERER_DIR: pages,
    ALLBEE_SIMULATE: '1',
    ALLBEE_DEBUG: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (c) => (output += c));
child.stderr.on('data', (c) => (output += c));

let exited = null;
child.on('exit', (code, signal) => (exited = { code, signal }));

const started = Date.now();
let task = null;
while (Date.now() - started < BOOT_TIMEOUT_MS) {
  if (exited) fail(`the app exited early (code ${exited.code}, signal ${exited.signal})`, output);
  task = smokeTask(readData());
  if (task) break;
  await sleep(400);
}
if (!task) fail('the stand-in dashboard never reported a result', output);

// ---------------------------------------------------------------------------
// checks

const problems = [];
const summary = task.title.replace(/^SMOKE /, '');
const flags = Object.fromEntries(summary.split(' ').map((p) => p.split('=')));
for (const key of wanted) {
  if (flags[key] !== '1') problems.push(`check "${key}" did not pass (got ${flags[key] ?? 'nothing'})`);
}

const logged = readLog();
if (!/companion window ready/.test(logged)) problems.push('the companion window never reported ready');
if (!/audio window ready/.test(logged)) problems.push('the audio window never reported ready');

const errors = logged
  .split('\n')
  .filter((line) => line.includes(' ERROR '))
  .filter((line) => !EXPECTED_ERRORS.some((re) => re.test(line)));
if (errors.length) problems.push(`the log has ${errors.length} unexpected error(s):\n    ${errors.slice(0, 5).join('\n    ')}`);

// The onboarding, timer and task all have to be on disk, not just in memory.
const saved = readData();
if (!saved?.onboarded) problems.push('onboarding was not saved');
if (saved?.timer?.status !== 'running') problems.push('the running timer was not saved');
if (!saved?.rules?.some((r) => r.pattern === 'youtube.com')) problems.push('the site rule from onboarding was not saved');

// ---------------------------------------------------------------------------
// shut down cleanly

console.log('smoke: asking the app to quit…');
child.kill('SIGTERM');
const quitAt = Date.now();
while (!exited && Date.now() - quitAt < EXIT_TIMEOUT_MS) await sleep(200);
if (!exited) {
  child.kill('SIGKILL');
  problems.push('the app did not shut down within 15s of SIGTERM');
} else if (exited.code !== 0 && exited.signal !== 'SIGTERM') {
  problems.push(`the app exited with code ${exited.code} (signal ${exited.signal})`);
}
if (!/shutting down/.test(readLog())) problems.push('the shutdown path did not run');

if (problems.length) fail(`\n  - ${problems.join('\n  - ')}`, output);

console.log(`smoke: ${summary}`);
console.log('smoke: PASSED');
