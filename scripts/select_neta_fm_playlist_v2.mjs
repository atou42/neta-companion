import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.resolve(root, "output/neta-fm-suno-v2/generated-index.json");
const outputDir = path.resolve(root, "output/neta-fm-suno-v2");
const publicDir = path.resolve(root, "public/fm");
const distDir = path.resolve(root, "dist/fm");

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function pickCandidate(track) {
  const usable = (track.candidates || []).filter((candidate) => (
    candidate.status === "complete"
    && candidate.audio_url
    && Number.isFinite(candidate.durationSeconds)
    && candidate.durationSeconds >= track.minAcceptDurationSeconds
  ));
  if (!usable.length) return null;
  return usable
    .map((candidate) => {
      const preferred = Number(track.preferredDurationSeconds || track.minAcceptDurationSeconds);
      const maxPreferred = Number(track.maxPreferredDurationSeconds || preferred + 60);
      const overPreferred = candidate.durationSeconds >= preferred ? 1 : 0;
      const underMax = candidate.durationSeconds <= maxPreferred ? 1 : 0;
      const closeness = Math.abs(candidate.durationSeconds - preferred);
      return {
        candidate,
        score: (overPreferred * 10000) + (underMax * 1000) - closeness,
      };
    })
    .sort((a, b) => b.score - a.score)[0].candidate;
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const repairNeeded = source.tracks
  .filter((track) => !pickCandidate(track))
  .map((track) => ({
    id: track.id,
    title: track.title,
    candidates: (track.candidates || []).map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      durationSeconds: candidate.durationSeconds,
      rejectionReasons: candidate.rejectionReasons,
    })),
  }));

fs.writeFileSync(path.join(outputDir, "repair-needed.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: repairNeeded.length,
  tracks: repairNeeded,
}, null, 2)}\n`);

if (repairNeeded.length) {
  throw new Error(`Cannot build playlist; ${repairNeeded.length} tracks need regeneration. See output/neta-fm-suno-v2/repair-needed.json`);
}

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

const tracks = source.tracks.map((track) => {
  const selected = pickCandidate(track);
  const alternates = track.candidates
    .filter((candidate) => candidate.id !== selected.id)
    .map((candidate) => ({
      sunoId: candidate.id,
      sourceVersion: candidate.sourceVersion,
      candidateVersion: candidate.candidateVersion,
      url: candidate.audio_url,
      status: candidate.status,
      durationSeconds: candidate.durationSeconds,
      rejectionReasons: candidate.rejectionReasons,
    }));
  return {
    id: track.id,
    title: track.title,
    displayTitle: track.title,
    artist: "Neta FM / Suno",
    source: "suno",
    sunoId: selected.id,
    sourceVersion: selected.sourceVersion,
    candidateVersion: selected.candidateVersion,
    url: selected.audio_url,
    durationHint: formatDuration(selected.durationSeconds),
    durationSeconds: selected.durationSeconds,
    mode: track.mode,
    mood: track.mood,
    vocalType: track.vocalType,
    language: track.language,
    energy: track.energy,
    attention: track.attention,
    tempo: track.tempo,
    texture: track.texture,
    style: track.style,
    useCase: track.useCase,
    lane: track.lane,
    queueOrder: track.queueOrder,
    targetDuration: track.targetDuration,
    minAcceptDurationSeconds: track.minAcceptDurationSeconds,
    prompt: selected.submittedStylePrompt || track.stylePrompt,
    lyrics: selected.submittedLyrics || track.lyrics,
    alternates,
    selectionReason: "complete audio URL, duration passed, closest to preferred companion-song duration",
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  source: path.relative(root, sourcePath),
  totalTracks: tracks.length,
  byMood: {},
  byVocalType: {},
  byMode: {},
  byLanguage: {},
};

for (const track of tracks) {
  summary.byMood[track.mood] = (summary.byMood[track.mood] || 0) + 1;
  summary.byVocalType[track.vocalType] = (summary.byVocalType[track.vocalType] || 0) + 1;
  summary.byMode[track.mode] = (summary.byMode[track.mode] || 0) + 1;
  summary.byLanguage[track.language] = (summary.byLanguage[track.language] || 0) + 1;
}

const playlist = {
  schemaVersion: 2,
  name: "Neta FM Companion Work Radio v2",
  summary,
  modes,
  rules: {
    primaryClassification: "mood",
    vocalSeparation: "vocalType separates instrumental and vocal libraries",
    languageSeparation: "language is preserved for future vocal and mood filters",
    selectionPolicy: "Use only complete clips with audio URLs and measured duration above the track minimum.",
    sparkPolicy: "spark tracks are opt-in boost material and should not enter default Study or Work playback",
  },
  tracks,
};

if (tracks.length !== 128) throw new Error(`Expected 128 selected tracks, got ${tracks.length}`);
if (new Set(tracks.map((track) => track.id)).size !== tracks.length) throw new Error("Duplicate track id in selection");
if (tracks.some((track) => !track.url || !track.sunoId || !track.mood || !track.vocalType || !track.language)) {
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
