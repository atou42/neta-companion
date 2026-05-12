import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const queuePath = path.resolve(root, "output/neta-fm-suno-v2/queue-v2.json");
const outDir = path.resolve(root, "output/neta-fm-suno-v2");
const logPath = path.join(outDir, "generated-log.jsonl");
const dryRunLogPath = path.join(outDir, "dry-run-log.jsonl");
const statePath = path.join(outDir, "generated-state.json");
const sunoSkillDir = process.env.SUNO_SKILL_DIR || "/Users/atou/codex-skills-shared/skills/suno-agent";
const cdpModulePath = path.join(sunoSkillDir, "scripts/suno-agent-cli/src/cdp.mjs");

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const intervalArg = args.find((arg) => arg.startsWith("--interval="));
const modelArg = args.find((arg) => arg.startsWith("--model="));
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const repairNeeded = args.includes("--repair-needed");
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const modelName = modelArg ? modelArg.split("=")[1] : (process.env.SUNO_MODEL || "chirp-fenix");

const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const intervalSeconds = intervalArg
  ? Number(intervalArg.split("=")[1])
  : Number(queue.generationRule?.minIntervalSeconds || 65);

const { defaultConfig, withSunoPage } = await import(pathToFileURL(cdpModulePath).href);
const config = defaultConfig({});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readDoneIds() {
  if (!fs.existsSync(logPath)) return new Set();
  return new Set(fs.readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.ok && Array.isArray(entry.clips) && entry.clips.length >= 2)
    .map((entry) => entry.queueId));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readRepairIds() {
  const indexPath = path.join(outDir, "generated-index.json");
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return new Set((index.tracks || [])
      .filter((track) => track.needsRegeneration)
      .map((track) => track.id));
  }
  const repairPath = path.join(outDir, "repair-needed.json");
  if (fs.existsSync(repairPath)) {
    const repair = JSON.parse(fs.readFileSync(repairPath, "utf8"));
    return new Set((repair.tracks || []).map((track) => track.id));
  }
  return new Set();
}

function countAttempts(queueId) {
  return readJsonl(logPath).filter((entry) => entry.queueId === queueId).length;
}

function clampDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return 180;
  return Math.max(15, Math.min(480, Math.round(value)));
}

function expandVocalLyrics(lyrics) {
  const text = String(lyrics || "").trim();
  if (!text) return "";
  const singingLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^\[.*\]$/.test(line));
  const firstLines = singingLines.slice(0, 4).join("\n") || singingLines.join("\n");
  const hookLines = singingLines.slice(-4).join("\n") || firstLines;
  const outroLines = singingLines.slice(-2).join("\n") || hookLines;
  return [
    text,
    "[Instrumental Break]",
    "[Verse 3]",
    firstLines,
    "[Pre-Chorus]",
    hookLines,
    "[Chorus]",
    hookLines,
    "[Instrumental Bridge]",
    "[Final Chorus]",
    hookLines,
    "[Outro]",
    outroLines,
  ].join("\n\n");
}

function buildSubmission(item) {
  const baseDurationSeconds = item.maxPreferredDurationSeconds || item.preferredDurationSeconds || item.minAcceptDurationSeconds || 180;
  const durationFloorSeconds = item.minAcceptDurationSeconds >= 150 ? 480 : 240;
  const durationSeconds = clampDuration(Math.max(baseDurationSeconds, durationFloorSeconds));
  const lyrics = item.vocalType === "instrumental" ? "" : expandVocalLyrics(item.lyrics);
  const stylePrompt = [
    item.stylePrompt,
    `Generation target: about ${Math.round(durationSeconds / 60)} minutes.`,
    "Do not make a short preview, sting, sketch, or loop.",
    item.vocalType === "instrumental"
      ? "The piece must have a real intro, developed middle, variation section, return, and complete ending."
      : "Use all lyric sections, include the instrumental breaks, and make it a complete vocal song with multiple verses, repeated hook, bridge, final chorus, and outro.",
  ].join(" ");
  return {
    queueId: item.id,
    title: item.title,
    stylePrompt,
    lyrics,
    instrumental: item.vocalType === "instrumental",
    durationSeconds,
    modelName,
    metadata: {
      title: item.title,
      lane: item.lane,
      mode: item.mode,
      mood: item.mood,
      vocalType: item.vocalType,
      language: item.language,
      style: item.style,
      useCase: item.useCase,
      tags: item.tags,
      targetDuration: item.targetDuration,
      minAcceptDurationSeconds: item.minAcceptDurationSeconds,
      preferredDurationSeconds: item.preferredDurationSeconds,
      submittedDurationSeconds: durationSeconds,
      submittedModelName: modelName,
      attention: item.attention,
      energy: item.energy,
    },
  };
}

function generationScript(input) {
  return `(async () => {
const input = ${JSON.stringify(input)};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let token = null;
    if (window.Clerk?.session?.getToken) token = await window.Clerk.session.getToken();
    if (!token) {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.includes('clerk-db-session')) continue;
        const value = JSON.parse(localStorage.getItem(key));
        token = value?.token || value?.last_active_token?.jwt || null;
        if (token) break;
      }
    }
    if (token) return token;
    await wait(500);
  }
  return null;
}

async function getTurnstileToken() {
  const scriptSrc = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  if (!window.turnstile) {
    await new Promise((resolve) => {
      const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        setTimeout(resolve, 3000);
        return;
      }
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }
  if (!window.turnstile) return null;

  if (window.__netaSunoTurnstileWidget !== undefined) {
    try {
      window.turnstile.remove(window.__netaSunoTurnstileWidget);
    } catch {
      // A missing old widget should not block a fresh captcha token request.
    }
    window.__netaSunoTurnstileWidget = undefined;
  }

  let container = document.getElementById('generation-turnstile-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'generation-turnstile-container';
    document.body.appendChild(container);
  }
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1px';
  container.style.height = '1px';

  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => done(null), 15000);
    try {
      const widgetId = window.turnstile.render('#generation-turnstile-container', {
        sitekey: '0x4AAAAAADI7xDNyj-3LcIbi',
        size: 'invisible',
        callback: done,
        'error-callback': () => done(null),
        'expired-callback': () => done(null),
        'timeout-callback': () => done(null),
      });
      window.__netaSunoTurnstileWidget = widgetId;
      window.turnstile.execute(widgetId);
    } catch {
      done(null);
    }
  });
}

async function getHcaptchaToken() {
  const scriptSrc = 'https://hcaptcha-endpoint-prod.suno.com/1/api.js?render=explicit&endpoint=https%3A%2F%2Fhcaptcha-endpoint-prod.suno.com&assethost=https%3A%2F%2Fhcaptcha-assets-prod.suno.com&imghost=https%3A%2F%2Fhcaptcha-imgs-prod.suno.com&reportapi=https%3A%2F%2Fhcaptcha-reportapi-prod.suno.com';
  if (!window.hcaptcha) {
    await new Promise((resolve) => {
      const existing = document.querySelector('script[src*="hcaptcha-endpoint-prod.suno.com"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        setTimeout(resolve, 3000);
        return;
      }
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }
  if (!window.hcaptcha) return null;

  if (window.__netaSunoHcaptchaWidget !== undefined) {
    try {
      window.hcaptcha.remove(window.__netaSunoHcaptchaWidget);
    } catch {
      // A missing old widget should not block a fresh captcha token request.
    }
    window.__netaSunoHcaptchaWidget = undefined;
  }

  let container = document.getElementById('neta-hcaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'neta-hcaptcha-container';
    document.body.appendChild(container);
  }
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1px';
  container.style.height = '1px';

  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value || null);
    };
    const timer = setTimeout(() => done(null), 30000);
    try {
      const widgetId = window.hcaptcha.render(container, {
        sitekey: 'd65453de-3f1a-4aac-9366-a0f06e52b2ce',
        size: 'invisible',
        sentry: false,
        endpoint: 'https://hcaptcha-endpoint-prod.suno.com',
        assethost: 'https://hcaptcha-assets-prod.suno.com',
        imghost: 'https://hcaptcha-imgs-prod.suno.com',
        reportapi: 'https://hcaptcha-reportapi-prod.suno.com',
        callback: done,
        'error-callback': () => done(null),
        'expired-callback': () => done(null),
        'chalexpired-callback': () => done(null),
      });
      window.__netaSunoHcaptchaWidget = widgetId;
      const executed = window.hcaptcha.execute(widgetId);
      if (executed && typeof executed.then === 'function') {
        executed.catch(() => done(null));
      }
    } catch {
      done(null);
    }
  });
}

async function getGenerationCaptcha(jwt) {
  const captchaCheck = await fetch('https://studio-api-prod.suno.com/api/c/check', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + jwt,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ctype: 'generation' }),
  });
  if (!captchaCheck.ok) {
    return {
      ok: false,
      code: 'CAPTCHA_CHECK_ERROR',
      status: captchaCheck.status,
      body: await captchaCheck.text(),
    };
  }
  const captchaJson = await captchaCheck.json();
  if (!captchaJson.required) {
    return { ok: true, required: false, token: null, provider: null };
  }

  const provider = captchaJson.captcha_version === 2 ? 2 : 1;
  const captchaToken = provider === 2 ? await getTurnstileToken() : await getHcaptchaToken();
  if (!captchaToken) {
    return {
      ok: false,
      code: 'CAPTCHA_TOKEN_REQUIRED',
      message: provider === 2
        ? 'Could not get a Suno generation Turnstile token.'
        : 'Could not get a Suno generation hCaptcha token.',
      provider,
    };
  }
  return { ok: true, required: true, token: captchaToken, provider };
}

const token = await getToken();
if (!token) return { ok: false, code: 'AUTH_REQUIRED', message: 'Suno JWT token not found.' };

const requestBody = {
  transaction_uuid: crypto.randomUUID(),
  token: null,
  token_provider: null,
  task: null,
  generation_type: 'TEXT',
  title: input.title,
  tags: input.stylePrompt,
  negative_tags: '',
  mv: input.modelName,
  prompt: input.lyrics,
  make_instrumental: input.instrumental,
  user_uploaded_images_b64: null,
  duration: input.durationSeconds,
  metadata: {
    web_client_pathname: window.location.pathname,
    is_max_mode: false,
    create_mode: 'custom',
    user_tier: null,
    create_session_token: crypto.randomUUID(),
    disable_volume_normalization: false,
  },
};

const safeRequestBody = () => ({
  ...requestBody,
  token: requestBody.token ? '[present]' : null,
});

if (input.dryRun) {
  return {
    ok: true,
    dryRun: true,
    title: input.title,
    instrumental: input.instrumental,
    modelName: input.modelName,
    durationSeconds: input.durationSeconds,
    lyricsLength: input.lyrics.length,
    styleLength: input.stylePrompt.length,
    requestBody: safeRequestBody(),
  };
}

const before = await fetch('https://studio-api-prod.suno.com/api/feed/v2?page_size=30', {
  headers: { Authorization: 'Bearer ' + token },
});
if (!before.ok) return { ok: false, code: 'SUNO_API_ERROR', status: before.status, body: await before.text() };
const beforeJson = await before.json();
const existingIds = new Set((beforeJson.clips || []).map((song) => song.id));

const captcha = await getGenerationCaptcha(token);
if (!captcha.ok) {
  return {
    ok: false,
    ...captcha,
    requestBody: safeRequestBody(),
  };
}
requestBody.token = captcha.token;
requestBody.token_provider = captcha.provider;

const createResponse = await fetch('https://studio-api-prod.suno.com/api/generate/v2-web/', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),
});
if (!createResponse.ok) {
  return {
    ok: false,
    code: 'SUNO_GENERATE_ERROR',
    status: createResponse.status,
    body: await createResponse.text(),
    requestBody: safeRequestBody(),
  };
}
const createJson = await createResponse.json();
await wait(15000);

for (let attempt = 0; attempt < 10; attempt += 1) {
  const feed = await fetch('https://studio-api-prod.suno.com/api/feed/v2?page_size=30', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!feed.ok) return { ok: false, code: 'SUNO_API_ERROR', status: feed.status, body: await feed.text() };
  const feedJson = await feed.json();
  const clips = (feedJson.clips || [])
    .filter((song) => !existingIds.has(song.id))
    .map((song) => ({
      id: song.id,
      title: song.title || input.title,
      status: song.status,
      audio_url: song.audio_url || '',
      video_url: song.video_url || '',
      created_at: song.created_at || '',
    }));
  if (clips.length > 0) {
    return {
      ok: true,
      requestId: createJson.id || '',
      clips,
      requestBody: safeRequestBody(),
    };
  }
  await wait(3000);
}

return {
  ok: false,
  code: 'PENDING',
  message: 'Generation was submitted, but new clip IDs were not visible yet.',
  requestId: createJson.id || '',
  requestBody: safeRequestBody(),
};
})()`;
}

async function submit(item) {
  const input = { ...buildSubmission(item), dryRun };
  return withSunoPage(config, (page) => page.evaluate(generationScript(input), 150000));
}

function writeState(extra = {}) {
  const done = readDoneIds();
  const state = {
    updatedAt: new Date().toISOString(),
    queue: path.relative(root, queuePath),
    log: path.relative(root, dryRun ? dryRunLogPath : logPath),
    total: queue.items.length,
    completed: done.size,
    pending: queue.items.length - done.size,
    intervalSeconds,
    modelName,
    dryRun,
    ...extra,
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

fs.mkdirSync(outDir, { recursive: true });

const done = readDoneIds();
const repairIds = repairNeeded ? readRepairIds() : new Set();
const pending = queue.items
  .filter((item) => {
    if (force) return true;
    if (repairNeeded) return repairIds.has(item.id);
    return !done.has(item.id);
  })
  .slice(0, limit);

console.log(JSON.stringify({
  total: queue.items.length,
  alreadyDone: done.size,
  repairNeeded,
  repairCount: repairIds.size,
  pendingThisRun: pending.length,
  intervalSeconds,
  modelName,
  dryRun,
}, null, 2));

writeState();

for (let index = 0; index < pending.length; index += 1) {
  const item = pending[index];
  const startedAt = new Date().toISOString();
  console.log(`[${index + 1}/${pending.length}] ${item.id} | ${item.title}`);
  const submission = buildSubmission(item);
  const result = await submit(item);
  const entry = {
    ok: Boolean(result.ok),
    queueId: item.id,
    title: item.title,
    attempt: countAttempts(item.id) + 1,
    repairRun: repairNeeded,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...submission.metadata,
    submitted: {
      title: submission.title,
      instrumental: submission.instrumental,
      modelName: submission.modelName,
      durationSeconds: submission.durationSeconds,
      lyrics: submission.lyrics,
      stylePrompt: submission.stylePrompt,
    },
    clips: result.clips || [],
    result,
  };
  fs.appendFileSync(dryRun ? dryRunLogPath : logPath, `${JSON.stringify(entry)}\n`);
  if (!result.ok) {
    writeState({ lastError: result, lastFailedQueueId: item.id });
    throw new Error(`Suno generation failed for ${item.id}: ${JSON.stringify(result)}`);
  }
  writeState({ lastQueueId: item.id });
  if (!dryRun && index < pending.length - 1) {
    console.log(`Waiting ${intervalSeconds}s before next Suno submission.`);
    await sleep(intervalSeconds * 1000);
  }
}
