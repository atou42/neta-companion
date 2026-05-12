import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const sourcePath = path.resolve(root, "output/neta-fm-suno/generated-index.json");
const outputDir = path.resolve(root, "output/neta-fm-suno");
const publicDir = path.resolve(root, "public/fm");
const distDir = path.resolve(root, "dist/fm");
const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.split("=")[1]) : crypto.randomInt(1, 2 ** 31 - 1);

function mulberry32(initialSeed) {
  let state = initialSeed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(seed);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const modes = {
  Study: {
    label: "陪我学习",
    includeMoods: ["focus", "cozy", "reset"],
    weights: { focus: 60, cozy: 30, reset: 10 },
    maxVocalRatio: 0.08,
    attentionMax: 2,
  },
  Work: {
    label: "陪我干活",
    includeMoods: ["flow", "cozy", "motion"],
    weights: { flow: 45, cozy: 30, motion: 25 },
    maxVocalRatio: 0.15,
    energyRange: [2, 4],
  },
  Coding: {
    label: "陪我写代码",
    includeMoods: ["focus", "flow", "night"],
    weights: { focus: 45, flow: 35, night: 20 },
    preferVocalType: "instrumental",
    attentionMax: 2,
  },
  Night: {
    label: "夜间工作",
    includeMoods: ["night", "focus", "reset"],
    weights: { night: 50, focus: 30, reset: 20 },
    preferVocalType: "instrumental",
  },
  Reset: {
    label: "休息一下",
    includeMoods: ["reset", "cozy", "night"],
    weights: { reset: 45, cozy: 35, night: 20 },
    energyMax: 2,
  },
  Vocal: {
    label: "有人陪我",
    includeMoods: ["vocal", "cozy", "flow"],
    weights: { vocal: 70, cozy: 15, flow: 15 },
    targetVocalRatio: 0.7,
  },
  Boost: {
    label: "冲刺一下",
    includeMoods: ["motion", "spark", "flow"],
    weights: { motion: 45, spark: 25, flow: 30 },
    maxConsecutiveSpark: 1,
  },
};

const tracks = source.tracks.map((track, index) => {
  const candidates = track.candidates || [];
  if (!candidates.length) {
    throw new Error(`Track has no usable candidate: ${track.id}`);
  }
  const selectedIndex = Math.floor(random() * candidates.length);
  const selected = candidates[selectedIndex];
  return {
    id: track.id,
    title: track.title,
    displayTitle: track.title,
    artist: "Neta FM / Suno",
    source: "suno",
    sunoId: selected.id,
    candidateIndex: selectedIndex,
    url: selected.audio_url,
    durationHint: "",
    mode: track.mode,
    mood: track.mood,
    vocalType: track.vocalType,
    energy: track.energy,
    attention: track.attention,
    tempo: track.tempo,
    texture: track.texture,
    style: track.style,
    useCase: track.useCase,
    lane: track.lane,
    queueOrder: index + 1,
    alternates: candidates
      .filter((candidate) => candidate.id !== selected.id)
      .map((candidate) => ({
        sunoId: candidate.id,
        url: candidate.audio_url,
      })),
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  source: path.relative(root, sourcePath),
  selectionSeed: seed,
  totalTracks: tracks.length,
  byMood: {},
  byVocalType: {},
  byMode: {},
};

for (const track of tracks) {
  summary.byMood[track.mood] = (summary.byMood[track.mood] || 0) + 1;
  summary.byVocalType[track.vocalType] = (summary.byVocalType[track.vocalType] || 0) + 1;
  summary.byMode[track.mode] = (summary.byMode[track.mode] || 0) + 1;
}

const playlist = {
  schemaVersion: 1,
  name: "Neta FM Companion Work Radio",
  summary,
  modes,
  rules: {
    primaryClassification: "mood",
    vocalSeparation: "vocalType separates instrumental and vocal libraries",
    styleUsage: "style is descriptive and should not drive core playback modes",
    sparkPolicy: "spark tracks are opt-in boost material and should not enter default Study or Work playback",
  },
  tracks,
};

if (tracks.length !== 96) throw new Error(`Expected 96 selected tracks, got ${tracks.length}`);
if (new Set(tracks.map((track) => track.id)).size !== tracks.length) throw new Error("Duplicate track id in selection");
if (tracks.some((track) => !track.url || !track.sunoId || !track.mood || !track.vocalType)) {
  throw new Error("Selected playlist contains missing url or classification fields");
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const playlistJson = `${JSON.stringify(playlist, null, 2)}\n`;
fs.writeFileSync(path.join(outputDir, "selected-playlist.json"), playlistJson);
fs.writeFileSync(path.join(outputDir, "selected-playlist.jsonl"), `${tracks.map((track) => JSON.stringify(track)).join("\n")}\n`);
fs.writeFileSync(path.join(publicDir, "playlist.json"), playlistJson);
fs.writeFileSync(path.join(distDir, "playlist.json"), playlistJson);

console.log(JSON.stringify(summary, null, 2));
