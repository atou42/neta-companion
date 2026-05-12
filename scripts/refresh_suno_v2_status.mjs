import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const outDir = path.resolve(root, "output/neta-fm-suno-v2");
const queuePath = path.join(outDir, "queue-v2.json");
const logPath = path.join(outDir, "generated-log.jsonl");
const statusPath = path.join(outDir, "status.json");
const batchLogPath = path.join(outDir, "status-batches.jsonl");
const indexPath = path.join(outDir, "generated-index.json");
const sunoSkillDir = process.env.SUNO_SKILL_DIR || "/Users/atou/codex-skills-shared/skills/suno-agent";
const sunoAgent = path.join(sunoSkillDir, "scripts/suno-agent");

const args = process.argv.slice(2);
const skipDuration = args.includes("--skip-duration");
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? Number(batchSizeArg.split("=")[1]) : 40;

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function run(command, argsForCommand) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argsForCommand, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${argsForCommand.join(" ")} exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getStatus(ids) {
  const stdout = await run(sunoAgent, ["status", "--ids", ids.join(","), "--json"]);
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error(`Unexpected status response: ${stdout}`);
  fs.appendFileSync(batchLogPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), ids, clips: parsed })}\n`);
  return parsed;
}

async function measureDurationSeconds(url) {
  if (!url) return null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const stdout = await run("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        url,
      ]);
      const value = Number(stdout.trim());
      if (!Number.isFinite(value)) throw new Error(`ffprobe returned non-numeric duration: ${stdout}`);
      return Math.round(value * 100) / 100;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw new Error(`Failed to measure audio duration after 3 attempts: ${url}\n${lastError?.message || lastError}`);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const logs = readJsonl(logPath).filter((entry) => entry.ok);
const logsByQueueId = new Map();
for (const entry of logs) {
  if (!logsByQueueId.has(entry.queueId)) logsByQueueId.set(entry.queueId, []);
  logsByQueueId.get(entry.queueId).push(entry);
}
const clipRecords = logs.flatMap((entry, logIndex) => (entry.clips || []).map((clip, index) => ({
  ...clip,
  queueId: entry.queueId,
  sourceVersion: "suno-v2",
  attempt: entry.attempt || logIndex + 1,
  candidateVersion: `${entry.attempt || logIndex + 1}-${index + 1}`,
})));
const uniqueIds = [...new Set(clipRecords.map((clip) => clip.id).filter(Boolean))];

fs.writeFileSync(batchLogPath, "");

const statusRows = [];
for (let index = 0; index < uniqueIds.length; index += batchSize) {
  const ids = uniqueIds.slice(index, index + batchSize);
  statusRows.push(...await getStatus(ids));
}

const statusById = new Map(statusRows.map((clip) => [clip.id, clip]));
const mergedClips = clipRecords.map((clip) => ({
  ...clip,
  ...(statusById.get(clip.id) || {}),
}));

if (!skipDuration) {
  const completeWithUrl = mergedClips.filter((clip) => clip.status === "complete" && clip.audio_url);
  const durations = await mapLimit(completeWithUrl, 4, async (clip) => ({
    id: clip.id,
    durationSeconds: await measureDurationSeconds(clip.audio_url),
  }));
  const durationById = new Map(durations.map((row) => [row.id, row.durationSeconds]));
  for (const clip of mergedClips) {
    clip.durationSeconds = durationById.get(clip.id) ?? null;
  }
}

const clipById = new Map(mergedClips.map((clip) => [clip.id, clip]));
const tracks = queue.items.map((item, index) => {
  const itemLogs = logsByQueueId.get(item.id) || [];
  const seenCandidateIds = new Set();
  const candidates = itemLogs.flatMap((log, logIndex) => (log.clips || []).map((clip, clipIndex) => {
    if (seenCandidateIds.has(clip.id)) return null;
    seenCandidateIds.add(clip.id);
    const merged = clipById.get(clip.id) || clip;
    const durationSeconds = merged.durationSeconds ?? null;
    const rejectionReasons = [];
    if (merged.status !== "complete") rejectionReasons.push(`status:${merged.status || "unknown"}`);
    if (!merged.audio_url) rejectionReasons.push("missing-audio-url");
    if (durationSeconds !== null && durationSeconds < item.minAcceptDurationSeconds) rejectionReasons.push("too-short");
    return {
      id: merged.id,
      title: merged.title || item.title,
      status: merged.status || "",
      audio_url: merged.audio_url || "",
      video_url: merged.video_url || "",
      created_at: merged.created_at || "",
      sourceVersion: "suno-v2",
      attempt: log.attempt || logIndex + 1,
      candidateVersion: `${log.attempt || logIndex + 1}-${clipIndex + 1}`,
      submittedLyrics: log.submitted?.lyrics ?? "",
      submittedStylePrompt: log.submitted?.stylePrompt ?? item.stylePrompt,
      submittedDurationSeconds: log.submitted?.durationSeconds ?? null,
      durationSeconds,
      targetDuration: item.targetDuration,
      minAcceptDurationSeconds: item.minAcceptDurationSeconds,
      passesDuration: durationSeconds !== null && durationSeconds >= item.minAcceptDurationSeconds,
      rejectionReasons,
    };
  })).filter(Boolean);
  return {
    id: item.id,
    queueOrder: index + 1,
    title: item.title,
    lane: item.lane,
    mode: item.mode,
    mood: item.mood,
    vocalType: item.vocalType,
    language: item.language,
    energy: item.energy,
    attention: item.attention,
    tempo: item.tempo,
    texture: item.texture,
    style: item.style,
    useCase: item.useCase,
    tags: item.tags,
    targetDuration: item.targetDuration,
    minAcceptDurationSeconds: item.minAcceptDurationSeconds,
    preferredDurationSeconds: item.preferredDurationSeconds,
    maxPreferredDurationSeconds: item.maxPreferredDurationSeconds,
    stylePrompt: item.stylePrompt,
    lyrics: item.lyrics,
    candidates,
    rejected: candidates.filter((candidate) => candidate.rejectionReasons.length > 0),
    needsRegeneration: candidates.length < 2 || candidates.every((candidate) => candidate.rejectionReasons.length > 0),
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  totalQueueTracks: queue.items.length,
  generatedTracks: logs.length,
  totalCandidateRefs: clipRecords.length,
  uniqueCandidateIds: uniqueIds.length,
  statusCounts: mergedClips.reduce((acc, clip) => {
    acc[clip.status || "unknown"] = (acc[clip.status || "unknown"] || 0) + 1;
    return acc;
  }, {}),
  completeWithAudio: mergedClips.filter((clip) => clip.status === "complete" && clip.audio_url).length,
  measuredDurations: mergedClips.filter((clip) => typeof clip.durationSeconds === "number").length,
  tracksNeedingRegeneration: tracks.filter((track) => track.needsRegeneration).map((track) => track.id),
};

fs.writeFileSync(statusPath, `${JSON.stringify({ summary, clips: mergedClips }, null, 2)}\n`);
fs.writeFileSync(indexPath, `${JSON.stringify({ summary, tracks }, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
