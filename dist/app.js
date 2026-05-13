const playlistUrl = "fm/playlist.json";
let tracks = [];

const room = document.getElementById("room");
const audio = document.getElementById("audio");
audio.crossOrigin = "anonymous";
const stateChip = document.getElementById("stateChip");
const syncState = document.getElementById("syncState");
const nowCard = document.querySelector(".now-card");
const trackKicker = document.getElementById("trackKicker");
const trackTitle = document.getElementById("trackTitle");
const trackSub = document.getElementById("trackSub");
const discLabel = document.getElementById("discLabel");
const toneArmBtn = document.getElementById("toneArmBtn");
const playBtn = document.getElementById("playBtn");
const playModeBtn = document.getElementById("playModeBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");
const progress = document.getElementById("progress");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const queueList = document.getElementById("queueList");
const queueCount = document.getElementById("queueCount");
const companionMood = document.getElementById("companionMood");
const spriteEl = document.getElementById("companionSprite");
const spriteDragger = document.getElementById("spriteDragger");
const dragPill = document.getElementById("dragPill");
const spriteReaction = document.getElementById("spriteReaction");
const spriteParticles = document.getElementById("spriteParticles");
const fmConsole = document.querySelector(".fm-console");
const mobileTabButtons = Array.from(document.querySelectorAll("[data-fm-tab]"));
const spriteTuneBtn = document.getElementById("spriteTuneBtn");
const spriteTunePanel = document.getElementById("spriteTunePanel");
const spriteTuneClose = document.getElementById("spriteTuneClose");
const spriteSizeTune = document.getElementById("spriteSizeTune");
const spritePlayingTune = document.getElementById("spritePlayingTune");
const spriteIdleTune = document.getElementById("spriteIdleTune");
const spriteSpecialTune = document.getElementById("spriteSpecialTune");
const spriteShuffleTune = document.getElementById("spriteShuffleTune");
const spriteWalkTune = document.getElementById("spriteWalkTune");
const spriteSizeValue = document.getElementById("spriteSizeValue");
const spritePlayingValue = document.getElementById("spritePlayingValue");
const spriteIdleValue = document.getElementById("spriteIdleValue");
const spriteSpecialValue = document.getElementById("spriteSpecialValue");
const spriteShuffleValue = document.getElementById("spriteShuffleValue");
const spriteWalkValue = document.getElementById("spriteWalkValue");
const spriteTuneStorageKey = "netaSpriteTune";
const playerModeStorageKey = "netaFmPlayerMode";
const volumeStorageKey = "netaFmVolume";
const spriteTuneDefaults = {
  size: 1.08,
  playingSpeed: .72,
  idleSpeed: 1,
  specialSpeed: 1,
  shuffleEvery: 9,
  walkEvery: 12,
};

let currentIndex = 0;
let currentStatus = "ready";
let isSeeking = false;
let spriteAction = "idle";
let spriteFrame = 0;
let spriteLastTick = 0;
let wasPlayingBeforeSwitch = false;
let idleShuffleTimer = 0;
let playingShuffleTimer = 0;
let lastIdleAction = "idle";
let lastPlayingAction = "playing";
let shouldStartWithQuietIdle = true;
let reactionTimer = 0;
let tapActionTimer = 0;
let updateSpriteWalkForStatus = () => {};
let spriteTune = { ...spriteTuneDefaults };
let playMode = "list";
let shuffleEnabled = false;
let repeatMode = "all";
let shuffleQueue = [];
let shuffleBackStack = [];
let lastAudibleVolume = .82;
let outputVolume = .82;
let outputMuted = false;
let audioContext = null;
let mediaSourceNode = null;
let analyserNode = null;
let gainNode = null;
let frequencyData = null;
let waveformFrame = 0;
let liveWaveLevels = [];

const spriteActions = {
  idle: { row: 0, frames: 8, sequence: [0, 1, 2, 1, 0, 4, 5, 4, 0, 6, 7, 6], label: "Idle", mood: "The sprite is waiting for the room signal.", tick: 440 },
  idleBook: { row: 1, frames: 8, sequence: [0, 2, 3, 2, 0, 4, 5, 6, 7, 6, 5, 4], label: "Book", mood: "The sprite is keeping a quiet note beside the radio.", tick: 460 },
  idleLook: { row: 2, frames: 8, sequence: [0, 1, 2, 1, 0, 4, 5, 4, 0, 6, 7, 6], label: "Look", mood: "The sprite is looking around the room.", tick: 470 },
  idleFocus: { row: 3, frames: 8, sequence: [0, 1, 2, 1, 0, 4, 5, 6, 7, 6, 5, 4], label: "Focus", mood: "The sprite is checking the staff signal.", tick: 470 },
  playing: { row: 4, frames: 8, label: "Listen", mood: "The sprite is listening closely to the song.", tick: 190 },
  playingSoftStep: { row: 5, frames: 8, label: "Step", mood: "The sprite is moving gently with the song.", tick: 180 },
  playingFocus: { row: 6, frames: 8, label: "Beat", mood: "The sprite is keeping time with the staff signal.", tick: 185 },
  paused: { row: 7, frames: 8, label: "Paused", mood: "The sprite is calm. The room is still watching.", tick: 220 },
  switching: { row: 8, frames: 8, label: "Casting", mood: "The sprite is casting the next track into place.", tick: 90 },
  loading: { row: 9, frames: 8, label: "Tuning", mood: "The sprite is tuning the signal.", tick: 135 },
  error: { row: 10, frames: 8, label: "Lost", mood: "The sprite caught a broken signal.", tick: 180 },
  grabbed: { row: 11, frames: 8, label: "Caught", mood: "The sprite is in your hand for a second.", tick: 110 },
  walkRight: { row: 12, frames: 8, label: "Right", mood: "The sprite is wandering across the room.", tick: 115 },
  walkLeft: { row: 13, frames: 8, label: "Left", mood: "The sprite is wandering across the room.", tick: 115 },
  poke: { row: 14, frames: 8, label: "Poke", mood: "The sprite noticed you.", tick: 75 },
};

const idleActionNames = ["idle", "idleBook", "idleLook", "idleFocus"];
const tapIdleActionNames = ["idle", "idleBook", "idleLook", "idleFocus"];
const playingActionNames = ["playing", "playingSoftStep", "playingFocus"];

const waveformMoodThemes = {
  focus: { a: "#ff64b7", b: "#9a58ff", c: "#5be4ff", d: "#ffe071", glow: "#ff4fa8", speed: 1.7, shift: 14, density: .72 },
  flow: { a: "#ff76b9", b: "#68d9ff", c: "#8cffbd", d: "#d386ff", glow: "#c45bff", speed: 1.35, shift: 11, density: .86 },
  cozy: { a: "#ffd38a", b: "#ff70b5", c: "#8fded4", d: "#fff2d2", glow: "#ff9f6e", speed: 1.95, shift: 18, density: .6 },
  motion: { a: "#ff4fa8", b: "#ffc759", c: "#55e0ff", d: "#ff7d54", glow: "#ff4fa8", speed: 1.05, shift: 8, density: 1 },
  night: { a: "#8c6dff", b: "#ff70d0", c: "#56d7ff", d: "#ffd778", glow: "#8a5cff", speed: 2.15, shift: 21, density: .64 },
  reset: { a: "#ffe0a3", b: "#8fded4", c: "#ff83bc", d: "#b9a7ff", glow: "#ffd28a", speed: 2.25, shift: 24, density: .52 },
  spark: { a: "#ff477e", b: "#ffe66d", c: "#6af7ff", d: "#b767ff", glow: "#ff477e", speed: .9, shift: 7, density: 1.12 },
  vocal: { a: "#fff0c9", b: "#ff5cac", c: "#7fe9ff", d: "#c7ff84", glow: "#ff8fc8", speed: 1.45, shift: 12, density: .82 },
};
const tapMessages = ["换个姿势", "在这呢", "收到", "嗯？", "再点一下"];
const listeningMessages = ["听这首", "换个节奏", "进入状态", "轻轻摇"];
const grabMessages = ["抓住啦", "轻一点", "别晃太快", "在手里了"];

function currentTrack() {
  return tracks[currentIndex];
}

function compactTitle(title) {
  const value = String(title || "").trim();
  if (value.length <= 13) return value;
  const words = value.split(/\s+/);
  if (words.length < 2) return value;
  const midpoint = Math.ceil(words.length / 2);
  return `${words.slice(0, midpoint).join(" ")}\n${words.slice(midpoint).join(" ")}`;
}

function normalizePlaylistTrack(track, index) {
  const style = Array.isArray(track.style) ? track.style : [];
  const useCase = Array.isArray(track.useCase) ? track.useCase : [];
  if (!track?.url || !track?.title || !track?.mood || !track?.vocalType) {
    throw new Error(`Invalid FM playlist track at index ${index}`);
  }
  return {
    ...track,
    id: track.id || `signal-${String(index + 1).padStart(3, "0")}`,
    title: track.displayTitle || track.title,
    shortTitle: compactTitle(track.displayTitle || track.title),
    artist: track.artist || "Neta FM / Suno",
    description: `${track.mood} / ${style.slice(0, 2).join(" + ")} / ${track.vocalType}`,
    durationHint: track.durationHint || track.mode || track.mood,
    style,
    useCase,
  };
}

async function loadFmPlaylist() {
  const response = await fetch(`${playlistUrl}?v=20260512`, { cache: "no-store" });
  if (!response.ok) throw new Error(`FM playlist failed to load: ${response.status}`);
  const playlist = await response.json();
  if (!Array.isArray(playlist.tracks) || !playlist.tracks.length) {
    throw new Error("FM playlist has no tracks");
  }
  tracks = playlist.tracks.map(normalizePlaylistTrack);
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function hashString(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function trackTheme(track) {
  return waveformMoodThemes[track?.mood] || waveformMoodThemes.focus;
}

function setTrackVisuals(track) {
  if (!nowCard || !track) return;
  const theme = trackTheme(track);
  const energy = clampNumber(track.energy, 1, 5, 2);
  const density = Math.max(.45, theme.density + (energy - 3) * .08);
  const tempoSpeed = track.tempo === "fast" ? .82 : track.tempo === "slow" ? 1.24 : 1;
  nowCard.dataset.mood = track.mood || "focus";
  nowCard.dataset.tempo = track.tempo || "mid";
  nowCard.dataset.vocal = track.vocalType || "instrumental";
  nowCard.style.setProperty("--wave-a", theme.a);
  nowCard.style.setProperty("--wave-b", theme.b);
  nowCard.style.setProperty("--wave-c", theme.c);
  nowCard.style.setProperty("--wave-d", theme.d);
  nowCard.style.setProperty("--wave-glow", theme.glow);
  nowCard.style.setProperty("--wave-speed", `${Math.max(.72, theme.speed * tempoSpeed)}s`);
  nowCard.style.setProperty("--wave-shift-speed", `${Math.max(7, theme.shift - energy * .75)}s`);
  nowCard.style.setProperty("--wave-energy", String(clampNumber(.7 + energy * .16, .8, 1.55, 1)));
  nowCard.style.setProperty("--wave-density", String(density.toFixed(2)));
  nowCard.style.setProperty("--wave-live", ".24");
  nowCard.style.setProperty("--disc-speed", `${Math.max(4.8, 9.2 - energy * .72)}s`);

  const bars = Array.from(document.querySelectorAll("#waveform span"));
  liveWaveLevels = new Array(bars.length).fill(0);
  const seed = hashString(`${track.id || track.title || ""}:${track.mood || ""}:${track.tempo || ""}`);
  const phase = (seed % 360) * Math.PI / 180;
  bars.forEach((bar, index) => {
    const wave = Math.sin(index * .62 + phase) * .5 + .5;
    const pulse = Math.sin(index * 1.37 + phase * .7) * .5 + .5;
    const accent = ((seed + index * 17) % 11) === 0 ? 1.24 : 1;
    const voiceLift = track.vocalType === "vocal" && index % 7 === 0 ? 1.18 : 1;
    const height = Math.round(clampNumber((18 + wave * 58 + pulse * 24) * density * accent * voiceLift, 14, 108));
    bar.style.setProperty("--h", `${height}px`);
    bar.style.setProperty("--peak", `${Math.round(clampNumber(height * (1.08 + energy * .05), 20, 122))}px`);
    bar.style.setProperty("--d", `${(index * .028 + (seed % 7) * .018).toFixed(3)}s`);
    bar.style.setProperty("--tone", `${Math.round((index / Math.max(1, bars.length - 1)) * 100)}%`);
  });
}

function ensureAudioAnalysis() {
  if (analyserNode) return true;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    nowCard.dataset.waveSource = "metadata";
    return false;
  }
  try {
    audioContext = audioContext || new AudioContextCtor();
    mediaSourceNode = mediaSourceNode || audioContext.createMediaElementSource(audio);
    analyserNode = audioContext.createAnalyser();
    gainNode = gainNode || audioContext.createGain();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = .78;
    frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
    mediaSourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    syncOutputVolume();
    nowCard.dataset.waveSource = "audio";
    return true;
  } catch (error) {
    console.warn("Audio analyser unavailable", error);
    nowCard.dataset.waveSource = "metadata";
    return false;
  }
}

async function resumeAudioAnalysis() {
  if (!ensureAudioAnalysis()) return false;
  if (audioContext.state === "suspended") await audioContext.resume();
  nowCard.dataset.waveSource = "audio";
  startAudioWaveform();
  return true;
}

function renderAudioWaveform() {
  waveformFrame = 0;
  if (!analyserNode || !frequencyData || audio.paused || currentStatus !== "playing") return;
  analyserNode.getByteFrequencyData(frequencyData);
  const bars = Array.from(document.querySelectorAll("#waveform span"));
  if (!bars.length) return;
  if (liveWaveLevels.length !== bars.length) liveWaveLevels = new Array(bars.length).fill(0);
  const usableBins = Math.floor(frequencyData.length * .62);
  let liveTotal = 0;
  bars.forEach((bar, index) => {
    const startRatio = index / bars.length;
    const endRatio = (index + 1) / bars.length;
    const start = Math.floor(Math.pow(startRatio, 1.72) * usableBins);
    const end = Math.max(start + 1, Math.floor(Math.pow(endRatio, 1.72) * usableBins));
    let total = 0;
    for (let bin = start; bin < end; bin += 1) total += frequencyData[bin];
    const raw = total / ((end - start) * 255);
    const curved = Math.pow(raw, .72);
    liveTotal += curved;
    liveWaveLevels[index] = liveWaveLevels[index] * .58 + curved * .42;
    const height = Math.round(clampNumber(14 + liveWaveLevels[index] * 108, 14, 122));
    bar.style.setProperty("--h", `${height}px`);
    bar.style.setProperty("--peak", `${Math.round(clampNumber(height * 1.12, 20, 128))}px`);
  });
  nowCard.style.setProperty("--wave-live", String(clampNumber(liveTotal / bars.length, .08, .95, .24).toFixed(3)));
  waveformFrame = requestAnimationFrame(renderAudioWaveform);
}

function startAudioWaveform() {
  if (!waveformFrame) waveformFrame = requestAnimationFrame(renderAudioWaveform);
}

function stopAudioWaveform() {
  if (waveformFrame) cancelAnimationFrame(waveformFrame);
  waveformFrame = 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function setRoomClass(status) {
  room.classList.remove("room-ready", "room-playing", "room-paused", "room-loading", "room-switching", "room-error");
  room.classList.add(`room-${status}`);
}

function setSpriteAction(actionName) {
  window.clearTimeout(tapActionTimer);
  tapActionTimer = 0;
  const action = spriteActions[actionName] || spriteActions.idle;
  if (spriteAction !== actionName) {
    spriteFrame = 0;
    spriteAction = actionName;
    applySpriteFrame(action);
  }
  spriteDragger.dataset.action = spriteActions[actionName] ? actionName : "idle";
  syncState.textContent = action.label;
  dragPill.textContent = action.label;
  companionMood.textContent = action.mood;
}

function pickIdleAction() {
  if (shouldStartWithQuietIdle) {
    shouldStartWithQuietIdle = false;
    lastIdleAction = "idle";
    return "idle";
  }
  const choices = idleActionNames.filter((name) => name !== lastIdleAction);
  const actionName = choices[Math.floor(Math.random() * choices.length)] || "idle";
  lastIdleAction = actionName;
  return actionName;
}

function nextIdleAction() {
  const current = tapIdleActionNames.includes(spriteAction) ? spriteAction : lastIdleAction;
  const index = tapIdleActionNames.indexOf(current);
  const actionName = tapIdleActionNames[(index + 1 + tapIdleActionNames.length) % tapIdleActionNames.length];
  lastIdleAction = actionName;
  return actionName;
}

function pickPlayingAction() {
  const choices = playingActionNames.filter((name) => name !== spriteAction && name !== lastPlayingAction);
  const actionName = choices[Math.floor(Math.random() * choices.length)] || "playing";
  lastPlayingAction = actionName;
  return actionName;
}

function nextPlayingAction() {
  const current = playingActionNames.includes(spriteAction) ? spriteAction : lastPlayingAction;
  const index = playingActionNames.indexOf(current);
  const actionName = playingActionNames[(index + 1 + playingActionNames.length) % playingActionNames.length];
  lastPlayingAction = actionName;
  return actionName;
}

function setPlayingSpriteAction(force = false) {
  if (spriteDragger?.classList.contains("walking")) return;
  if (!force && playingActionNames.includes(spriteAction)) return;
  setSpriteAction(pickPlayingAction());
}

function showReaction(text, duration = 1200) {
  if (!spriteReaction) return;
  window.clearTimeout(reactionTimer);
  spriteReaction.textContent = text;
  spriteReaction.classList.remove("show");
  void spriteReaction.offsetWidth;
  spriteReaction.classList.add("show");
  reactionTimer = window.setTimeout(() => {
    spriteReaction.classList.remove("show");
  }, duration);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] || "";
}

function readPlayerMode() {
  try {
    const saved = JSON.parse(localStorage.getItem(playerModeStorageKey) || "{}");
    if (["list", "shuffle", "one", "off"].includes(saved.mode)) return saved.mode;
    if (saved.shuffle === true) return "shuffle";
    if (saved.repeat === "one") return "one";
    if (saved.repeat === "off") return "off";
    return "list";
  } catch {
    return "list";
  }
}

function savePlayerMode() {
  localStorage.setItem(playerModeStorageKey, JSON.stringify({
    mode: playMode,
    shuffle: shuffleEnabled,
    repeat: repeatMode,
  }));
}

function applyPlayerMode() {
  const mapped = {
    list: { shuffle: false, repeat: "all" },
    shuffle: { shuffle: true, repeat: "all" },
    one: { shuffle: false, repeat: "one" },
    off: { shuffle: false, repeat: "off" },
  }[playMode] || { shuffle: false, repeat: "all" };
  const wasShuffle = shuffleEnabled;
  shuffleEnabled = mapped.shuffle;
  repeatMode = mapped.repeat;
  audio.loop = false;
  if (shuffleEnabled && (!wasShuffle || !shuffleQueue.length)) refillShuffleQueue();
  if (!shuffleEnabled) {
    shuffleQueue = [];
    shuffleBackStack = [];
  }
}

function shuffleIndexes(indexes) {
  const next = [...indexes];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function refillShuffleQueue() {
  shuffleQueue = shuffleIndexes(tracks
    .map((_, index) => index)
    .filter((index) => index !== currentIndex));
}

function updatePlayerModeButtons() {
  if (!playModeBtn) return;
  const meta = {
    list: { icon: "↻", label: "List loop" },
    shuffle: { icon: "↝", label: "Shuffle play" },
    one: { icon: "↺1", label: "Repeat one" },
    off: { icon: "→", label: "Play once" },
  }[playMode] || { icon: "↻", label: "List loop" };
  playModeBtn.textContent = meta.icon;
  playModeBtn.dataset.mode = playMode;
  playModeBtn.classList.toggle("active", playMode !== "off");
  playModeBtn.setAttribute("aria-label", meta.label);
  playModeBtn.title = meta.label;
}

function setupPlayerMode() {
  playMode = readPlayerMode();
  applyPlayerMode();
  updatePlayerModeButtons();
}

function cyclePlayerMode() {
  const modes = ["list", "shuffle", "one", "off"];
  const current = modes.indexOf(playMode);
  playMode = modes[(current + 1) % modes.length] || "list";
  applyPlayerMode();
  savePlayerMode();
  updatePlayerModeButtons();
}

function readVolumeState() {
  try {
    const saved = JSON.parse(localStorage.getItem(volumeStorageKey) || "{}");
    return {
      volume: clampNumber(saved.volume, 0, 1, .82),
      muted: saved.muted === true,
    };
  } catch {
    return { volume: .82, muted: false };
  }
}

function syncOutputVolume() {
  const nextGain = outputMuted ? 0 : outputVolume;
  try {
    audio.volume = outputVolume;
  } catch {
    // Some mobile browsers expose volume but ignore or reject changes.
  }
  audio.muted = outputMuted;
  if (gainNode && audioContext) {
    const now = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(nextGain, now, .015);
  }
  window.__netaAudioOutput = {
    volume: outputVolume,
    muted: outputMuted,
    gain: nextGain,
    hasGainNode: Boolean(gainNode),
  };
}

function saveVolumeState() {
  localStorage.setItem(volumeStorageKey, JSON.stringify({
    volume: outputVolume,
    muted: outputMuted,
  }));
}

function updateVolumeUi() {
  const percent = Math.round(outputVolume * 100);
  if (volumeSlider) {
    volumeSlider.value = String(percent);
    volumeSlider.style.setProperty("--volume", `${percent}%`);
  }
  if (muteBtn) {
    const muted = outputMuted || outputVolume === 0;
    muteBtn.textContent = muted ? "Off" : "Vol";
    muteBtn.classList.toggle("active", muted);
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    muteBtn.title = muted ? "Unmute" : "Mute";
  }
}

function applyVolumeState(volume, muted) {
  outputVolume = clampNumber(volume, 0, 1, .82);
  outputMuted = muted === true || outputVolume === 0;
  if (outputVolume > 0) lastAudibleVolume = outputVolume;
  syncOutputVolume();
  updateVolumeUi();
}

function setupVolume() {
  const saved = readVolumeState();
  applyVolumeState(saved.volume, saved.muted);
  const setFromSlider = (event) => {
    const nextVolume = clampNumber(Number(event.currentTarget.value) / 100, 0, 1, .82);
    outputVolume = nextVolume;
    outputMuted = nextVolume === 0;
    if (nextVolume > 0) lastAudibleVolume = nextVolume;
    syncOutputVolume();
    updateVolumeUi();
    saveVolumeState();
  };
  volumeSlider?.addEventListener("input", setFromSlider);
  volumeSlider?.addEventListener("change", setFromSlider);
  muteBtn?.addEventListener("click", () => {
    if (outputMuted || outputVolume === 0) {
      outputMuted = false;
      if (outputVolume === 0) outputVolume = lastAudibleVolume || .82;
    } else {
      if (outputVolume > 0) lastAudibleVolume = outputVolume;
      outputMuted = true;
    }
    syncOutputVolume();
    updateVolumeUi();
    saveVolumeState();
  });
}

function nextTrackIndex({ manual = false } = {}) {
  if (tracks.length <= 1) return tracks.length ? currentIndex : null;
  if (repeatMode === "one" && !manual) return currentIndex;
  if (shuffleEnabled) {
    if (!shuffleQueue.length) {
      if (repeatMode === "off" && !manual) return null;
      refillShuffleQueue();
    }
    const nextIndex = shuffleQueue.shift();
    if (Number.isInteger(nextIndex)) {
      shuffleBackStack.push(currentIndex);
      return nextIndex;
    }
  }
  const sequentialNext = currentIndex + 1;
  if (sequentialNext < tracks.length) return sequentialNext;
  if (repeatMode === "all" || manual) return 0;
  return null;
}

function previousTrackIndex() {
  if (!tracks.length) return null;
  if (shuffleEnabled && shuffleBackStack.length) return shuffleBackStack.pop();
  if (currentIndex > 0) return currentIndex - 1;
  return repeatMode === "all" ? tracks.length - 1 : 0;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function readSpriteTune() {
  try {
    const saved = JSON.parse(localStorage.getItem(spriteTuneStorageKey) || "{}");
    return {
      size: clampNumber(saved.size, .82, 1.32, spriteTuneDefaults.size),
      playingSpeed: clampNumber(saved.playingSpeed, .45, 1.2, spriteTuneDefaults.playingSpeed),
      idleSpeed: clampNumber(saved.idleSpeed, .6, 1.4, spriteTuneDefaults.idleSpeed),
      specialSpeed: clampNumber(saved.specialSpeed, .6, 1.4, spriteTuneDefaults.specialSpeed),
      shuffleEvery: clampNumber(saved.shuffleEvery, 5, 16, spriteTuneDefaults.shuffleEvery),
      walkEvery: clampNumber(saved.walkEvery, 0, 30, spriteTuneDefaults.walkEvery),
    };
  } catch {
    return { ...spriteTuneDefaults };
  }
}

function saveSpriteTune() {
  localStorage.setItem(spriteTuneStorageKey, JSON.stringify(spriteTune));
}

function updateSpriteTuneUi() {
  document.documentElement.style.setProperty("--sprite-scale", spriteTune.size.toFixed(2));
  if (spriteSizeTune) spriteSizeTune.value = spriteTune.size.toFixed(2);
  if (spritePlayingTune) spritePlayingTune.value = spriteTune.playingSpeed.toFixed(2);
  if (spriteIdleTune) spriteIdleTune.value = spriteTune.idleSpeed.toFixed(2);
  if (spriteSpecialTune) spriteSpecialTune.value = spriteTune.specialSpeed.toFixed(2);
  if (spriteShuffleTune) spriteShuffleTune.value = String(Math.round(spriteTune.shuffleEvery));
  if (spriteWalkTune) spriteWalkTune.value = String(Math.round(spriteTune.walkEvery));
  if (spriteSizeValue) spriteSizeValue.textContent = `${Math.round(spriteTune.size * 100)}%`;
  if (spritePlayingValue) spritePlayingValue.textContent = `${spriteTune.playingSpeed.toFixed(2)}×`;
  if (spriteIdleValue) spriteIdleValue.textContent = `${spriteTune.idleSpeed.toFixed(2)}×`;
  if (spriteSpecialValue) spriteSpecialValue.textContent = `${spriteTune.specialSpeed.toFixed(2)}×`;
  if (spriteShuffleValue) spriteShuffleValue.textContent = `${Math.round(spriteTune.shuffleEvery)}s`;
  if (spriteWalkValue) spriteWalkValue.textContent = spriteTune.walkEvery <= 0 ? "Off" : `${Math.round(spriteTune.walkEvery)}s`;
}

function setSpriteTuneValue(key, value) {
  const next = { ...spriteTune };
  if (key === "size") next.size = clampNumber(value, .82, 1.32, spriteTuneDefaults.size);
  if (key === "playingSpeed") next.playingSpeed = clampNumber(value, .45, 1.2, spriteTuneDefaults.playingSpeed);
  if (key === "idleSpeed") next.idleSpeed = clampNumber(value, .6, 1.4, spriteTuneDefaults.idleSpeed);
  if (key === "specialSpeed") next.specialSpeed = clampNumber(value, .6, 1.4, spriteTuneDefaults.specialSpeed);
  if (key === "shuffleEvery") next.shuffleEvery = clampNumber(value, 5, 16, spriteTuneDefaults.shuffleEvery);
  if (key === "walkEvery") next.walkEvery = clampNumber(value, 0, 30, spriteTuneDefaults.walkEvery);
  spriteTune = next;
  updateSpriteTuneUi();
  saveSpriteTune();
  if (key === "shuffleEvery" && currentStatus === "playing") schedulePlayingShuffle();
  if (key === "walkEvery") updateSpriteWalkForStatus(currentStatus);
}

function speedForSpriteAction(actionName) {
  if (playingActionNames.includes(actionName)) return spriteTune.playingSpeed;
  if (idleActionNames.includes(actionName)) return spriteTune.idleSpeed;
  return spriteTune.specialSpeed;
}

function burstParticles(kind = "tap") {
  if (!spriteParticles) return;
  const count = kind === "grab" ? 8 : 5;
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = `sprite-pop ${kind}`;
    particle.textContent = kind === "grab" && index % 3 === 0 ? "✦" : "♥";
    const angle = (-120 + index * (240 / Math.max(1, count - 1))) * Math.PI / 180;
    const distance = 34 + Math.random() * 34;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance - 18}px`);
    particle.style.setProperty("--delay", `${index * 28}ms`);
    spriteParticles.appendChild(particle);
    const cleanup = window.setTimeout(() => particle.remove(), 2200);
    particle.addEventListener("animationend", () => {
      window.clearTimeout(cleanup);
      particle.remove();
    }, { once: true });
  }
}

function clearIdleShuffle() {
  if (!idleShuffleTimer) return;
  window.clearTimeout(idleShuffleTimer);
  idleShuffleTimer = 0;
}

function clearPlayingShuffle() {
  if (!playingShuffleTimer) return;
  window.clearTimeout(playingShuffleTimer);
  playingShuffleTimer = 0;
}

function scheduleIdleShuffle() {
  clearIdleShuffle();
  if (currentStatus !== "ready") return;
  idleShuffleTimer = window.setTimeout(() => {
    if (currentStatus !== "ready") return;
    setSpriteAction(pickIdleAction());
    scheduleIdleShuffle();
  }, 11000 + Math.random() * 7000);
}

function setIdleSpriteAction() {
  setSpriteAction(pickIdleAction());
  scheduleIdleShuffle();
}

function schedulePlayingShuffle() {
  clearPlayingShuffle();
  if (currentStatus !== "playing") return;
  playingShuffleTimer = window.setTimeout(() => {
    if (currentStatus !== "playing") return;
    setPlayingSpriteAction(true);
    schedulePlayingShuffle();
  }, spriteTune.shuffleEvery * 1000 + Math.random() * 4200);
}

function setStatus(status) {
  currentStatus = status;
  setRoomClass(status);
  const labels = {
    ready: "Ready",
    loading: "Tuning",
    playing: "On air",
    paused: "Paused",
    switching: "Switching",
    error: "Lost",
  };
  stateChip.textContent = labels[status] || "Ready";
  stateChip.className = `state-chip ${status}`;
  playBtn.textContent = status === "playing" ? "Pause" : "Play";
  if (toneArmBtn) {
    const isPlaying = status === "playing";
    toneArmBtn.setAttribute("aria-pressed", String(isPlaying));
    toneArmBtn.setAttribute("aria-label", isPlaying ? "Pause from tone arm" : "Play from tone arm");
    toneArmBtn.title = isPlaying ? "Pause" : "Play";
  }
  updateSpriteWalkForStatus(status);
  if (status !== "playing") clearPlayingShuffle();
  if (status === "ready") {
    setIdleSpriteAction();
    return;
  }
  clearIdleShuffle();
  if (status === "playing") {
    setPlayingSpriteAction();
    schedulePlayingShuffle();
  }
  else if (status === "paused") setSpriteAction("paused");
  else if (status === "switching") setSpriteAction("switching");
  else if (status === "loading") setSpriteAction("loading");
  else if (status === "error") setSpriteAction("error");
  else setIdleSpriteAction();
}

function renderTrack() {
  const track = currentTrack();
  if (!track) return;
  setTrackVisuals(track);
  trackKicker.textContent = `Signal ${String(currentIndex + 1).padStart(3, "0")}`;
  discLabel.textContent = String(currentIndex + 1).padStart(3, "0");
  trackTitle.textContent = track.shortTitle;
  trackSub.textContent = `${track.artist} / ${track.description}`;
  durationEl.textContent = track.durationHint;
  currentTimeEl.textContent = "0:00";
  progress.value = 0;
  progress.style.setProperty("--progress", "0%");
  renderQueue();
}

function renderQueue() {
  queueCount.textContent = `${tracks.length} tracks`;
  queueList.innerHTML = tracks.map((track, index) => {
    const active = index === currentIndex;
    const number = active && currentStatus === "playing" ? "♪" : String(index + 1).padStart(2, "0");
    return `<button class="queue-item ${active ? "active" : ""}" data-index="${index}">
      <span class="queue-num">${number}</span>
      <span><span class="queue-title">${escapeHtml(track.title)}</span><span class="queue-artist">${escapeHtml(track.artist)}</span></span>
      <span class="queue-time">${escapeHtml(track.durationHint)}</span>
    </button>`;
  }).join("");
}

function loadTrack(index, shouldPlay = currentStatus === "playing") {
  if (!tracks.length) return;
  currentIndex = (index + tracks.length) % tracks.length;
  audio.src = currentTrack().url;
  audio.load();
  renderTrack();
  if (shouldPlay) play();
  else setStatus("ready");
}

async function play() {
  try {
    setStatus("loading");
    await resumeAudioAnalysis();
    await audio.play();
    setStatus("playing");
    startAudioWaveform();
    renderQueue();
  } catch (error) {
    setStatus("error");
    companionMood.textContent = error?.message || "Playback failed.";
  }
}

function pause() {
  audio.pause();
}

function switchTrack(nextIndex) {
  wasPlayingBeforeSwitch = currentStatus === "playing" || currentStatus === "loading";
  setStatus("switching");
  window.setTimeout(() => loadTrack(nextIndex, wasPlayingBeforeSwitch), 720);
}

function nextTrack() {
  const nextIndex = nextTrackIndex({ manual: true });
  if (nextIndex !== null) switchTrack(nextIndex);
}

function previousTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const nextIndex = previousTrackIndex();
  if (nextIndex !== null) switchTrack(nextIndex);
}

function finishTrack() {
  const nextIndex = nextTrackIndex();
  if (nextIndex === null) {
    audio.pause();
    audio.currentTime = 0;
    updateProgress();
    setStatus("paused");
    renderQueue();
    return;
  }
  switchTrack(nextIndex);
}

function updateProgress() {
  const duration = audio.duration;
  const current = audio.currentTime;
  currentTimeEl.textContent = formatTime(current);
  if (Number.isFinite(duration)) {
    durationEl.textContent = formatTime(duration);
    if (!isSeeking && duration > 0) {
      const value = Math.round((current / duration) * 1000);
      progress.value = value;
      progress.style.setProperty("--progress", `${value / 10}%`);
    }
  }
}

function spriteFrameIndex(action) {
  if (Array.isArray(action.sequence) && action.sequence.length) {
    return action.sequence[spriteFrame % action.sequence.length];
  }
  return spriteFrame % action.frames;
}

function applySpriteFrame(action) {
  spriteEl.style.backgroundPosition = `-${spriteFrameIndex(action) * 192}px -${action.row * 208}px`;
}

function renderSprite(now = 0) {
  const action = spriteActions[spriteAction] || spriteActions.idle;
  const speed = speedForSpriteAction(spriteAction);
  const tick = action.tick / Math.max(.1, speed);
  const frameCount = Array.isArray(action.sequence) && action.sequence.length ? action.sequence.length : action.frames;
  if (now - spriteLastTick > tick) {
    spriteFrame = (spriteFrame + 1) % frameCount;
    spriteLastTick = now;
    applySpriteFrame(action);
  }
  requestAnimationFrame(renderSprite);
}

function setupSpriteTune() {
  spriteTune = readSpriteTune();
  updateSpriteTuneUi();
  spriteTuneBtn?.addEventListener("click", () => {
    const nextOpen = spriteTunePanel.hidden;
    spriteTunePanel.hidden = !nextOpen;
    spriteTuneBtn.setAttribute("aria-expanded", String(nextOpen));
  });
  spriteTuneClose?.addEventListener("click", () => {
    spriteTunePanel.hidden = true;
    spriteTuneBtn?.setAttribute("aria-expanded", "false");
  });
  spriteSizeTune?.addEventListener("input", (event) => setSpriteTuneValue("size", event.currentTarget.value));
  spritePlayingTune?.addEventListener("input", (event) => setSpriteTuneValue("playingSpeed", event.currentTarget.value));
  spriteIdleTune?.addEventListener("input", (event) => setSpriteTuneValue("idleSpeed", event.currentTarget.value));
  spriteSpecialTune?.addEventListener("input", (event) => setSpriteTuneValue("specialSpeed", event.currentTarget.value));
  spriteShuffleTune?.addEventListener("input", (event) => setSpriteTuneValue("shuffleEvery", event.currentTarget.value));
  spriteWalkTune?.addEventListener("input", (event) => setSpriteTuneValue("walkEvery", event.currentTarget.value));
}

function buildWaveform() {
  const waveform = document.getElementById("waveform");
  if (!waveform) return;
  waveform.innerHTML = "";
  Array.from({ length: 44 }).forEach((_, index) => {
    const bar = document.createElement("span");
    bar.style.setProperty("--h", "42px");
    bar.style.setProperty("--peak", "68px");
    bar.style.setProperty("--d", `${index * .035}s`);
    waveform.appendChild(bar);
  });
  liveWaveLevels = new Array(waveform.children.length).fill(0);
}

function setupTransport() {
  const togglePlayback = () => {
    if (audio.paused) play();
    else pause();
  };
  document.getElementById("playBtn").addEventListener("click", togglePlayback);
  toneArmBtn?.addEventListener("click", togglePlayback);
  document.getElementById("nextBtn").addEventListener("click", nextTrack);
  document.getElementById("prevBtn").addEventListener("click", previousTrack);
  playModeBtn?.addEventListener("click", cyclePlayerMode);
  queueList.addEventListener("click", (event) => {
    const item = event.target.closest(".queue-item");
    if (!item) return;
    if (shuffleEnabled) {
      shuffleBackStack.push(currentIndex);
      shuffleQueue = shuffleQueue.filter((index) => index !== Number(item.dataset.index));
    }
    switchTrack(Number(item.dataset.index));
  });
  progress.addEventListener("input", () => {
    isSeeking = true;
    const value = Number(progress.value);
    progress.style.setProperty("--progress", `${value / 10}%`);
    if (Number.isFinite(audio.duration)) currentTimeEl.textContent = formatTime(audio.duration * (value / 1000));
  });
  progress.addEventListener("change", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * (Number(progress.value) / 1000);
    isSeeking = false;
    updateProgress();
  });
}

function setMobileTab(tabName) {
  const normalized = tabName === "queue" ? "queue" : "player";
  fmConsole.dataset.mobileTab = normalized;
  for (const button of mobileTabButtons) {
    const active = button.dataset.fmTab === normalized;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function setupMobileTabs() {
  setMobileTab("player");
  for (const button of mobileTabButtons) {
    button.addEventListener("click", () => setMobileTab(button.dataset.fmTab));
  }
}

function setupAudio() {
  audio.addEventListener("play", () => {
    setStatus("playing");
    startAudioWaveform();
    renderQueue();
  });
  audio.addEventListener("pause", () => {
    stopAudioWaveform();
    if (currentStatus !== "error" && currentStatus !== "switching") setStatus("paused");
    renderQueue();
  });
  audio.addEventListener("waiting", () => {
    if (currentStatus !== "switching") setStatus("loading");
  });
  audio.addEventListener("canplay", () => {
    if (!audio.paused && currentStatus !== "switching") {
      setStatus("playing");
      startAudioWaveform();
      renderQueue();
    }
  });
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("ended", finishTrack);
  audio.addEventListener("error", () => setStatus("error"));
}

function setupSpriteDrag() {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let viewportTier = getViewportTier();
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerLastX = 0;
  let pointerLastY = 0;
  let pointerStartAt = 0;
  let movedSincePointerDown = false;
  let grabbedPreviousAction = "idle";
  let activePointerId = null;
  let walkTimer = 0;
  let walking = false;
  let walkEndTimer = 0;
  let grabFeedbackActive = false;

  function getViewportTier() {
    if (window.innerWidth <= 980 && window.innerWidth > window.innerHeight) return "landscape";
    if (window.innerWidth <= 620) return "mobile";
    if (window.innerWidth <= 980) return "tablet";
    return "desktop";
  }

  function defaultSpritePositionForTier(tier) {
    if (tier === "mobile") return [window.innerWidth * .72, window.innerHeight * .37];
    if (tier === "landscape") return [window.innerWidth * .42, window.innerHeight * .62];
    if (tier === "tablet") return [window.innerWidth * .72, window.innerHeight * .52];
    return [window.innerWidth * .56, window.innerHeight * .66];
  }

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setPosition(clientX, clientY) {
    const rect = spriteDragger.getBoundingClientRect();
    const marginX = Math.max(48, Math.ceil(rect.width / 2));
    const marginY = Math.max(48, Math.ceil(rect.height / 2));
    const minY = Math.max(marginY, Math.ceil(rect.height / 2 + 58));
    const maxX = Math.max(marginX, window.innerWidth - marginX);
    const maxY = Math.max(minY, window.innerHeight - marginY);
    const nextX = clampValue(clientX - offsetX, marginX, maxX);
    const nextY = clampValue(clientY - offsetY, minY, maxY);
    spriteDragger.style.left = `clamp(${marginX}px, ${nextX}px, calc(100vw - ${marginX}px))`;
    spriteDragger.style.top = `clamp(${minY}px, ${nextY}px, calc(100svh - ${marginY}px))`;
  }

  function keepSpriteInViewport() {
    const nextTier = getViewportTier();
    if (nextTier !== viewportTier) {
      viewportTier = nextTier;
      offsetX = 0;
      offsetY = 0;
      const [x, y] = defaultSpritePositionForTier(nextTier);
      setPosition(x, y);
      return;
    }
    const rect = spriteDragger.getBoundingClientRect();
    offsetX = 0;
    offsetY = 0;
    setPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function clearSpriteWalkTimers() {
    window.clearTimeout(walkTimer);
    window.clearTimeout(walkEndTimer);
    walkTimer = 0;
    walkEndTimer = 0;
  }

  function stopSpriteWalk() {
    clearSpriteWalkTimers();
    walking = false;
    spriteDragger.classList.remove("walking", "walk-left", "walk-right");
  }

  function canScheduleSpriteWalk() {
    return spriteTune.walkEvery > 0 && (currentStatus === "ready" || currentStatus === "playing");
  }

  function scheduleSpriteWalk(delay) {
    window.clearTimeout(walkTimer);
    if (!canScheduleSpriteWalk()) return;
    const nextDelay = Number.isFinite(delay)
      ? delay
      : spriteTune.walkEvery * 1000 + Math.random() * Math.max(1800, spriteTune.walkEvery * 420);
    walkTimer = window.setTimeout(startSpriteWalk, nextDelay);
  }

  function startSpriteWalk() {
    if (dragging || walking || !canScheduleSpriteWalk()) {
      scheduleSpriteWalk();
      return;
    }
    walking = true;
    clearIdleShuffle();
    clearPlayingShuffle();
    const rect = spriteDragger.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const tier = getViewportTier();
    const consoleRect = fmConsole.getBoundingClientRect();
    const autoMinX = rect.width / 2;
    const autoMaxX = tier === "desktop" && consoleRect.left > 0
      ? Math.max(autoMinX, consoleRect.left - rect.width * .25)
      : window.innerWidth - rect.width / 2;
    let direction = Math.random() > .5 ? 1 : -1;
    if (centerX > autoMaxX - 32) direction = -1;
    if (centerX < autoMinX + 32) direction = 1;
    const distance = Math.min(180, 76 + Math.random() * 110, window.innerWidth * .28);
    const nextX = clampValue(centerX + direction * distance, autoMinX, autoMaxX);
    const nextY = centerY + (Math.random() * 26 - 13);
    const actualDistance = Math.hypot(nextX - centerX, nextY - centerY);
    const walkDuration = Math.round(clampValue(actualDistance / 0.075, 900, 2600));
    offsetX = 0;
    offsetY = 0;
    spriteDragger.style.setProperty("--sprite-walk-duration", `${walkDuration}ms`);
    spriteDragger.classList.add("walking", direction < 0 ? "walk-left" : "walk-right");
    spriteDragger.classList.remove(direction < 0 ? "walk-right" : "walk-left");
    setSpriteAction(direction < 0 ? "walkLeft" : "walkRight");
    setPosition(nextX, nextY);
    walkEndTimer = window.setTimeout(() => {
      walking = false;
      spriteDragger.classList.remove("walking", "walk-left", "walk-right");
      if (currentStatus === "ready") setIdleSpriteAction();
      else if (currentStatus === "playing") {
        setPlayingSpriteAction(true);
        schedulePlayingShuffle();
      } else if (spriteActions[currentStatus]) setSpriteAction(currentStatus);
      scheduleSpriteWalk();
    }, walkDuration + 80);
  }

  updateSpriteWalkForStatus = (status) => {
    if ((status !== "ready" && status !== "playing") || spriteTune.walkEvery <= 0) {
      stopSpriteWalk();
      return;
    }
    scheduleSpriteWalk(Math.max(4200, spriteTune.walkEvery * 1000 + Math.random() * 4200));
  };

  function restoreSpriteActionAfterDrag() {
    if (currentStatus === "ready") {
      setSpriteAction(idleActionNames.includes(grabbedPreviousAction) ? grabbedPreviousAction : pickIdleAction());
      scheduleIdleShuffle();
      scheduleSpriteWalk();
    } else if (currentStatus === "playing") {
      if (playingActionNames.includes(grabbedPreviousAction)) setSpriteAction(grabbedPreviousAction);
      else setPlayingSpriteAction(true);
      schedulePlayingShuffle();
      scheduleSpriteWalk();
    } else if (spriteActions[currentStatus]) {
      setSpriteAction(currentStatus);
    } else {
      setIdleSpriteAction();
    }
  }

  function activateGrabFeedback() {
    if (grabFeedbackActive) return;
    grabFeedbackActive = true;
    spriteDragger.classList.add("grabbed");
    clearIdleShuffle();
    setSpriteAction("grabbed");
    showReaction(randomItem(grabMessages), 3200);
    burstParticles("grab");
  }

  function triggerSpriteTap() {
    spriteDragger.classList.add("poked");
    window.setTimeout(() => spriteDragger.classList.remove("poked"), 520);
    showReaction(randomItem(currentStatus === "playing" ? listeningMessages : tapMessages), 2400);
    burstParticles("tap");
    let nextAction = null;
    if (currentStatus === "playing") {
      nextAction = nextPlayingAction();
      schedulePlayingShuffle();
      scheduleSpriteWalk();
    } else if (currentStatus === "ready") {
      nextAction = nextIdleAction();
      scheduleIdleShuffle();
      scheduleSpriteWalk();
    } else if (currentStatus === "paused") {
      nextAction = nextIdleAction();
    } else {
      restoreSpriteActionAfterDrag();
      return;
    }
    setSpriteAction("poke");
    tapActionTimer = window.setTimeout(() => {
      tapActionTimer = 0;
      if (!spriteDragger.classList.contains("dragging")) setSpriteAction(nextAction);
    }, 640);
  }

  spriteDragger.addEventListener("pointerdown", (event) => {
    if (dragging || event.isPrimary === false) return;
    stopSpriteWalk();
    dragging = true;
    activePointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerLastX = event.clientX;
    pointerLastY = event.clientY;
    pointerStartAt = performance.now();
    movedSincePointerDown = false;
    grabbedPreviousAction = spriteAction;
    spriteDragger.classList.add("dragging");
    grabFeedbackActive = false;
    const rect = spriteDragger.getBoundingClientRect();
    offsetX = event.clientX - (rect.left + rect.width / 2);
    offsetY = event.clientY - (rect.top + rect.height / 2);
    spriteDragger.setPointerCapture?.(event.pointerId);
  });

  spriteDragger.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    pointerLastX = event.clientX;
    pointerLastY = event.clientY;
    if (Math.hypot(pointerStartX - pointerLastX, pointerStartY - pointerLastY) > 8) {
      movedSincePointerDown = true;
      activateGrabFeedback();
      setPosition(event.clientX, event.clientY);
    }
  });

  function stopDrag(event) {
    if (!dragging || event.pointerId !== activePointerId) return;
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      pointerLastX = event.clientX;
      pointerLastY = event.clientY;
    }
    const travel = Math.hypot(pointerStartX - pointerLastX, pointerStartY - pointerLastY);
    const wasTap = travel < 12 && performance.now() - pointerStartAt < 900 && !movedSincePointerDown;
    const wasCanceled = event.type === "pointercancel";
    dragging = false;
    activePointerId = null;
    grabFeedbackActive = false;
    spriteDragger.classList.remove("dragging");
    spriteDragger.classList.remove("grabbed");
    spriteDragger.releasePointerCapture?.(event.pointerId);
    if (wasCanceled) {
      restoreSpriteActionAfterDrag();
      return;
    }
    if (wasTap) {
      triggerSpriteTap();
      return;
    }
    restoreSpriteActionAfterDrag();
  }

  spriteDragger.addEventListener("pointerup", stopDrag);
  spriteDragger.addEventListener("pointercancel", stopDrag);
  spriteDragger.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    grabbedPreviousAction = spriteAction;
    clearIdleShuffle();
    triggerSpriteTap();
  });
  window.addEventListener("resize", keepSpriteInViewport);
}

function setupCuiMao() {
  const portrait = document.getElementById("cuimaoPortrait");
  const front = document.getElementById("cuimaoFront");
  const cursor = document.getElementById("customCursor");
  const gazeStatus = document.getElementById("gazeStatus");
  const cols = 11;
  const frames = 121;
  const upWindow = 10;
  const angleKeys = [[10, 0], [30, 12], [45, 18], [60, 24], [75, 30], [90, 36], [105, 42], [120, 48], [135, 54], [150, 60], [165, 66], [180, 72], [195, 78], [210, 84], [225, 90], [240, 96], [255, 102], [270, 108], [285, 112], [300, 116], [315, 120], [330, 120], [350, 0]];
  const hoverNoneQuery = window.matchMedia("(hover: none)");
  let rect = null;
  let consoleLeft = Number.POSITIVE_INFINITY;
  let mouseX = -1000;
  let mouseY = -1000;
  let lastFrame = -1;
  let scheduled = false;
  let pointerOverFm = false;
  let cursorVisible = false;
  let lastFrontShown = true;
  let lastStatusText = "";
  let lastSpriteFollowAt = 0;
  const gazePerf = { pointerMoves: 0, renders: 0, frameWrites: 0 };
  window.__netaGazePerf = gazePerf;

  function updateRect() {
    rect = portrait.getBoundingClientRect();
    consoleLeft = fmConsole.getBoundingClientRect().left;
  }

  function shouldLookAtSprite() {
    if (hoverNoneQuery.matches || window.innerWidth <= 980) return true;
    return pointerOverFm;
  }

  function updateSpriteTarget() {
    const spriteRect = spriteDragger.getBoundingClientRect();
    mouseX = spriteRect.left + spriteRect.width * .5;
    mouseY = spriteRect.top + spriteRect.height * .42;
  }

  function angleToFrame(deg) {
    deg = ((deg % 360) + 360) % 360;
    if (deg >= 360 - upWindow || deg <= upWindow) return 0;
    for (let i = 0; i < angleKeys.length - 1; i += 1) {
      const [a0, f0] = angleKeys[i];
      const [a1, f1] = angleKeys[i + 1];
      if (deg >= a0 && deg <= a1) {
        const t = (deg - a0) / (a1 - a0);
        return ((Math.round(f0 + (f1 - f0) * t) % frames) + frames) % frames;
      }
    }
    return 0;
  }

  function setFrame(index) {
    if (index === lastFrame) return;
    lastFrame = index;
    gazePerf.frameWrites += 1;
    const col = index % cols;
    const row = Math.floor(index / cols);
    portrait.style.backgroundPosition = `${(col / (cols - 1)) * 100}% ${(row / (cols - 1)) * 100}%`;
  }

  function setFrontVisible(show) {
    if (show === lastFrontShown) return;
    lastFrontShown = show;
    front.classList.toggle("show", show);
  }

  function setGazeStatus(text) {
    if (text === lastStatusText) return;
    lastStatusText = text;
    gazeStatus.textContent = text;
  }

  function updateCursor(show) {
    if (show === cursorVisible) {
      if (show) cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
      return;
    }
    cursorVisible = show;
    cursor.style.opacity = show ? "1" : "0";
    if (show) cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
  }

  function render() {
    scheduled = false;
    gazePerf.renders += 1;
    if (!rect) updateRect();
    const lookingAtSprite = shouldLookAtSprite();
    if (lookingAtSprite) updateSpriteTarget();
    updateCursor(!lookingAtSprite);
    const cx = rect.left + rect.width * .5;
    const cy = rect.top + rect.height * .5;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distance = Math.hypot(dx, dy);
    const radius = rect.width * .5;
    if (distance < radius * .18) {
      setFrontVisible(true);
      setFrame(0);
      setGazeStatus("Near");
      return;
    }
    setFrontVisible(false);
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    setFrame(angleToFrame(deg));
    setGazeStatus("Active");
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  window.addEventListener("resize", () => {
    updateRect();
    schedule();
  });
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    gazePerf.pointerMoves += 1;
    pointerOverFm = event.clientX >= consoleLeft;
    mouseX = event.clientX;
    mouseY = event.clientY;
    schedule();
  }, { passive: true });
  window.addEventListener("mouseleave", () => {
    if (shouldLookAtSprite()) return;
    updateCursor(false);
    setFrontVisible(true);
    setFrame(0);
  });
  function followSpriteLoop(now) {
    if (shouldLookAtSprite() && now - lastSpriteFollowAt > 90) {
      lastSpriteFollowAt = now;
      schedule();
    }
    requestAnimationFrame(followSpriteLoop);
  }
  updateRect();
  setFrame(0);
  requestAnimationFrame(followSpriteLoop);
}

async function bootstrap() {
  try {
    await loadFmPlaylist();
    audio.src = currentTrack().url;
    buildWaveform();
    setupTransport();
    setupMobileTabs();
    setupAudio();
    setupPlayerMode();
    setupVolume();
    setupSpriteTune();
    setupSpriteDrag();
    setupCuiMao();
    renderTrack();
    setStatus("ready");
    requestAnimationFrame(renderSprite);
  } catch (error) {
    setStatus("error");
    stateChip.textContent = "Playlist error";
    queueCount.textContent = "0 tracks";
    queueList.innerHTML = "";
    trackTitle.textContent = "FM Error";
    trackSub.textContent = error?.message || "Playlist failed to load.";
    companionMood.textContent = trackSub.textContent;
  }
}

bootstrap();
