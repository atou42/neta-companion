import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const queuePath = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "output/neta-fm-suno/queue.json";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const intervalArg = process.argv.find((arg) => arg.startsWith("--interval="));
const overrideInterval = intervalArg ? Number(intervalArg.split("=")[1]) : null;
const sunoSkillDir = process.env.SUNO_SKILL_DIR || "/Users/atou/codex-skills-shared/skills/suno-agent";
const sunoAgent = path.join(sunoSkillDir, "scripts/suno-agent");
const logPath = path.resolve(root, "output/neta-fm-suno/generated-log.jsonl");
const queue = JSON.parse(fs.readFileSync(path.resolve(root, queuePath), "utf8"));
const intervalSeconds = Number.isFinite(overrideInterval) ? overrideInterval : queue.intervalSeconds;

function readDoneIds() {
  if (!fs.existsSync(logPath)) return new Set();
  return new Set(fs.readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).queueId));
}

function runGenerate(item) {
  const args = [
    "generate",
    "--prompt", item.prompt,
    "--tags", item.tags,
    "--title", item.title,
    "--json",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(sunoAgent, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`suno-agent exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runRefresh() {
  return new Promise((resolve, reject) => {
    const child = spawn(sunoAgent, ["refresh"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`suno-agent refresh exited ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
  });
}

function parseSunoClips(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.clips)) return parsed.clips;
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const done = readDoneIds();
const pending = queue.items.filter((item) => !done.has(item.id)).slice(0, limit);
console.log(`Queue items: ${queue.items.length}`);
console.log(`Pending in this run: ${pending.length}`);
console.log(`Interval seconds: ${intervalSeconds}`);

for (let index = 0; index < pending.length; index += 1) {
  const item = pending[index];
  const startedAt = new Date().toISOString();
  console.log(`\n[${index + 1}/${pending.length}] ${item.id} | ${item.title}`);
  await runRefresh();
  const result = await runGenerate(item);
  const clips = parseSunoClips(result.stdout.trim());
  fs.appendFileSync(logPath, `${JSON.stringify({
    queueId: item.id,
    title: item.title,
    lane: item.lane,
    mode: item.mode,
    mood: item.mood,
    vocalType: item.vocalType,
    startedAt,
    finishedAt: new Date().toISOString(),
    clips,
    stdout: result.stdout.trim(),
  })}\n`);
  if (index < pending.length - 1) {
    console.log(`Waiting ${intervalSeconds}s before next Suno submission.`);
    await sleep(intervalSeconds * 1000);
  }
}
