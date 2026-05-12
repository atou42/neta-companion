const playlistUrl = "fm/playlist.json";
let tracks = [];

const room = document.getElementById("room");
const audio = document.getElementById("audio");
const stateChip = document.getElementById("stateChip");
const syncState = document.getElementById("syncState");
const trackKicker = document.getElementById("trackKicker");
const trackTitle = document.getElementById("trackTitle");
const trackSub = document.getElementById("trackSub");
const discLabel = document.getElementById("discLabel");
const playBtn = document.getElementById("playBtn");
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
const spriteSizeValue = document.getElementById("spriteSizeValue");
const spritePlayingValue = document.getElementById("spritePlayingValue");
const spriteIdleValue = document.getElementById("spriteIdleValue");
const spriteSpecialValue = document.getElementById("spriteSpecialValue");
const spriteShuffleValue = document.getElementById("spriteShuffleValue");
const spriteTuneStorageKey = "netaSpriteTune";
const playerModeStorageKey = "netaFmPlayerMode";
const spriteTuneDefaults = {
  size: 1.08,
  playingSpeed: .72,
  idleSpeed: 1,
  specialSpeed: 1,
  shuffleEvery: 9,
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
let reactionTimer = 0;
let tapActionTimer = 0;
let updateSpriteWalkForStatus = () => {};
let spriteTune = { ...spriteTuneDefaults };
let shuffleEnabled = false;
let repeatMode = "all";
let shuffleQueue = [];
let shuffleBackStack = [];

const spriteActions = {
  idle: { row: 0, frames: 8, label: "Idle", mood: "The sprite is waiting for the room signal.", tick: 190 },
  idleBook: { row: 1, frames: 8, label: "Book", mood: "The sprite is keeping a quiet note beside the radio.", tick: 210 },
  idleLook: { row: 2, frames: 8, label: "Look", mood: "The sprite is looking around the room.", tick: 180 },
  idleFocus: { row: 3, frames: 8, label: "Focus", mood: "The sprite is checking the staff signal.", tick: 170 },
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

const idleActionNames = ["idle", "idleLook", "idleFocus"];
const tapIdleActionNames = ["idle", "idleBook", "idleLook", "idleFocus"];
const playingActionNames = ["playing", "playingSoftStep", "playingFocus"];
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
    return {
      shuffle: saved.shuffle === true,
      repeat: ["off", "all", "one"].includes(saved.repeat) ? saved.repeat : "all",
    };
  } catch {
    return { shuffle: false, repeat: "all" };
  }
}

function savePlayerMode() {
  localStorage.setItem(playerModeStorageKey, JSON.stringify({
    shuffle: shuffleEnabled,
    repeat: repeatMode,
  }));
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
  const shuffleBtn = document.getElementById("shuffleBtn");
  const loopBtn = document.getElementById("loopBtn");
  if (shuffleBtn) {
    shuffleBtn.classList.toggle("active", shuffleEnabled);
    shuffleBtn.setAttribute("aria-pressed", String(shuffleEnabled));
    shuffleBtn.setAttribute("aria-label", shuffleEnabled ? "Shuffle on" : "Shuffle off");
    shuffleBtn.title = shuffleEnabled ? "Shuffle on" : "Shuffle off";
  }
  if (loopBtn) {
    loopBtn.classList.toggle("active", repeatMode !== "off");
    loopBtn.dataset.repeat = repeatMode;
    loopBtn.setAttribute("aria-label", repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off");
    loopBtn.title = repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off";
    loopBtn.textContent = repeatMode === "one" ? "↺1" : repeatMode === "all" ? "↻" : "→";
  }
}

function setupPlayerMode() {
  const saved = readPlayerMode();
  shuffleEnabled = saved.shuffle;
  repeatMode = saved.repeat;
  if (shuffleEnabled) refillShuffleQueue();
  updatePlayerModeButtons();
}

function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled;
  shuffleBackStack = [];
  if (shuffleEnabled) refillShuffleQueue();
  else shuffleQueue = [];
  savePlayerMode();
  updatePlayerModeButtons();
}

function cycleRepeatMode() {
  const next = { all: "one", one: "off", off: "all" };
  repeatMode = next[repeatMode] || "all";
  audio.loop = false;
  savePlayerMode();
  updatePlayerModeButtons();
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
  if (spriteSizeValue) spriteSizeValue.textContent = `${Math.round(spriteTune.size * 100)}%`;
  if (spritePlayingValue) spritePlayingValue.textContent = `${spriteTune.playingSpeed.toFixed(2)}×`;
  if (spriteIdleValue) spriteIdleValue.textContent = `${spriteTune.idleSpeed.toFixed(2)}×`;
  if (spriteSpecialValue) spriteSpecialValue.textContent = `${spriteTune.specialSpeed.toFixed(2)}×`;
  if (spriteShuffleValue) spriteShuffleValue.textContent = `${Math.round(spriteTune.shuffleEvery)}s`;
}

function setSpriteTuneValue(key, value) {
  const next = { ...spriteTune };
  if (key === "size") next.size = clampNumber(value, .82, 1.32, spriteTuneDefaults.size);
  if (key === "playingSpeed") next.playingSpeed = clampNumber(value, .45, 1.2, spriteTuneDefaults.playingSpeed);
  if (key === "idleSpeed") next.idleSpeed = clampNumber(value, .6, 1.4, spriteTuneDefaults.idleSpeed);
  if (key === "specialSpeed") next.specialSpeed = clampNumber(value, .6, 1.4, spriteTuneDefaults.specialSpeed);
  if (key === "shuffleEvery") next.shuffleEvery = clampNumber(value, 5, 16, spriteTuneDefaults.shuffleEvery);
  spriteTune = next;
  updateSpriteTuneUi();
  saveSpriteTune();
  if (key === "shuffleEvery" && currentStatus === "playing") schedulePlayingShuffle();
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
    await audio.play();
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

function applySpriteFrame(action) {
  spriteEl.style.backgroundPosition = `-${spriteFrame * 192}px -${action.row * 208}px`;
}

function renderSprite(now = 0) {
  const action = spriteActions[spriteAction] || spriteActions.idle;
  const speed = speedForSpriteAction(spriteAction);
  const tick = action.tick / Math.max(.1, speed);
  if (now - spriteLastTick > tick) {
    spriteFrame = (spriteFrame + 1) % action.frames;
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
}

function buildWaveform() {
  const waveform = document.getElementById("waveform");
  [24, 38, 18, 62, 44, 31, 70, 22, 55, 36, 28, 64, 42, 21, 58, 35, 76, 40, 26, 52, 30, 67, 46, 23, 60, 34, 72, 39, 25, 56, 33, 48].forEach((height, index) => {
    const bar = document.createElement("span");
    bar.style.setProperty("--h", `${height}px`);
    bar.style.setProperty("--d", `${index * .035}s`);
    waveform.appendChild(bar);
  });
}

function setupTransport() {
  document.getElementById("playBtn").addEventListener("click", () => {
    if (audio.paused) play();
    else pause();
  });
  document.getElementById("nextBtn").addEventListener("click", nextTrack);
  document.getElementById("prevBtn").addEventListener("click", previousTrack);
  document.getElementById("shuffleBtn").addEventListener("click", toggleShuffle);
  document.getElementById("loopBtn").addEventListener("click", cycleRepeatMode);
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
    renderQueue();
  });
  audio.addEventListener("pause", () => {
    if (currentStatus !== "error" && currentStatus !== "switching") setStatus("paused");
    renderQueue();
  });
  audio.addEventListener("waiting", () => {
    if (currentStatus !== "switching") setStatus("loading");
  });
  audio.addEventListener("canplay", () => {
    if (!audio.paused && currentStatus !== "switching") setStatus("playing");
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

  function scheduleSpriteWalk(delay = 12000 + Math.random() * 16000) {
    window.clearTimeout(walkTimer);
    walkTimer = window.setTimeout(startSpriteWalk, delay);
  }

  function startSpriteWalk() {
    if (dragging || walking || currentStatus !== "ready") {
      scheduleSpriteWalk();
      return;
    }
    walking = true;
    clearIdleShuffle();
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
    offsetX = 0;
    offsetY = 0;
    spriteDragger.classList.add("walking", direction < 0 ? "walk-left" : "walk-right");
    spriteDragger.classList.remove(direction < 0 ? "walk-right" : "walk-left");
    setSpriteAction(direction < 0 ? "walkLeft" : "walkRight");
    setPosition(nextX, nextY);
    walkEndTimer = window.setTimeout(() => {
      walking = false;
      spriteDragger.classList.remove("walking", "walk-left", "walk-right");
      if (currentStatus === "ready") setIdleSpriteAction();
      else if (spriteActions[currentStatus]) setSpriteAction(currentStatus);
      scheduleSpriteWalk();
    }, 1900);
  }

  updateSpriteWalkForStatus = (status) => {
    if (status !== "ready") {
      stopSpriteWalk();
      return;
    }
    scheduleSpriteWalk(8000 + Math.random() * 10000);
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
  let rect = null;
  let mouseX = -1000;
  let mouseY = -1000;
  let lastFrame = -1;
  let scheduled = false;
  let pointerOverFm = false;

  function updateRect() {
    rect = portrait.getBoundingClientRect();
  }

  function shouldLookAtSprite() {
    if (window.matchMedia("(hover: none)").matches || window.innerWidth <= 980) return true;
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
    const col = index % cols;
    const row = Math.floor(index / cols);
    portrait.style.backgroundPosition = `${(col / (cols - 1)) * 100}% ${(row / (cols - 1)) * 100}%`;
  }

  function render() {
    scheduled = false;
    if (!rect) updateRect();
    if (shouldLookAtSprite()) updateSpriteTarget();
    const cx = rect.left + rect.width * .5;
    const cy = rect.top + rect.height * .5;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distance = Math.hypot(dx, dy);
    const radius = rect.width * .5;
    if (distance < radius * .18) {
      front.classList.add("show");
      setFrame(0);
      gazeStatus.textContent = "Near";
      return;
    }
    front.classList.remove("show");
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    setFrame(angleToFrame(deg));
    gazeStatus.textContent = "Active";
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
  window.addEventListener("mousemove", (event) => {
    const consoleRect = fmConsole.getBoundingClientRect();
    pointerOverFm = event.clientX >= consoleRect.left;
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (shouldLookAtSprite()) {
      cursor.style.opacity = "0";
      schedule();
      return;
    }
    cursor.style.opacity = "1";
    cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    schedule();
  }, { passive: true });
  window.addEventListener("mouseleave", () => {
    if (shouldLookAtSprite()) return;
    front.classList.add("show");
    setFrame(0);
  });
  function followSpriteLoop() {
    if (shouldLookAtSprite()) schedule();
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
