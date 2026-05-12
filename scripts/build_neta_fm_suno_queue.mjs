import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("output/neta-fm-suno");
const queuePath = path.join(outDir, "queue.json");
const jsonlPath = path.join(outDir, "queue.jsonl");
const summaryPath = path.join(outDir, "library-blueprint.md");

const intervalSeconds = 65;

const lanes = [
  {
    lane: "focus_lofi",
    mode: "Study",
    mood: "focus",
    vocalType: "instrumental",
    energy: 2,
    attention: 1,
    tempo: "mid",
    texture: "dusty",
    style: ["lofi", "jazzhop", "soft keys"],
    useCase: ["study", "write", "code"],
    titles: ["Paper Lamp", "Margin Notes", "Quiet Compile", "Library Window", "Soft Cursor", "Ink Break", "Desk Orbit", "Warm Refactor"],
    prompt: "instrumental study companion, warm lofi jazzhop, soft electric piano, brushed drums, gentle bass, paper-room ambience, loopable, no vocals, no sudden drop, low attention",
    tags: "instrumental, lofi, jazzhop, study, soft keys, warm, no vocals",
  },
  {
    lane: "focus_piano",
    mode: "Study",
    mood: "focus",
    vocalType: "instrumental",
    energy: 1,
    attention: 1,
    tempo: "slow",
    texture: "clean",
    style: ["felt piano", "ambient", "minimal"],
    useCase: ["study", "write", "lateNight"],
    titles: ["Felt Page", "Pencil Snow", "Small Silence", "Slow Bookmark", "Window Grammar", "Plain Tea", "Moonlit Index", "Quiet Proof"],
    prompt: "instrumental focus music, felt piano, soft pad, minimal melody, gentle room tone, slow steady pulse, loopable, no vocals, no dramatic chorus, low attention",
    tags: "instrumental, felt piano, ambient, study, minimal, no vocals",
  },
  {
    lane: "flow_rnb",
    mode: "Work",
    mood: "flow",
    vocalType: "instrumental",
    energy: 3,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["light r&b", "neo soul", "chillhop"],
    useCase: ["work", "design", "code"],
    titles: ["Soft Compile", "Velvet Keyboard", "Coffee Loop", "Neon Notebook", "Warm Tab", "Browser Soul", "Gentle Merge", "Low Battery Glow"],
    prompt: "instrumental work companion, light r&b groove, neo soul chords, soft bass, relaxed pocket drums, warm room radio, loopable, no vocals, smooth and low attention",
    tags: "instrumental, r&b, neo soul, chillhop, work, warm, no vocals",
  },
  {
    lane: "flow_citypop",
    mode: "Work",
    mood: "flow",
    vocalType: "instrumental",
    energy: 3,
    attention: 2,
    tempo: "mid",
    texture: "glossy",
    style: ["city pop lite", "soft funk", "chill disco"],
    useCase: ["work", "chores", "design"],
    titles: ["Chrome Mug", "Afternoon Terminal", "Metro Tabs", "Pastel Errand", "Signal Elevator", "Clean Desk Disco", "Soft Neon Lane", "Calendar Breeze"],
    prompt: "instrumental city pop lite for work, soft funk guitar, rounded bass, clean drums, pastel synths, cheerful but not distracting, loopable, no vocals, no big drop",
    tags: "instrumental, city pop, soft funk, work, upbeat, no vocals",
  },
  {
    lane: "cozy_swing",
    mode: "Room",
    mood: "cozy",
    vocalType: "instrumental",
    energy: 2,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["swing", "jazzhop", "room radio"],
    useCase: ["work", "study", "break"],
    titles: ["Mug on Desk", "Bookmark Swing", "Tiny Brass Lamp", "Cookie Static", "Desk Pet Waltz", "Paper Moon Radio", "Soft Shoe Notes", "Warm Shelf"],
    prompt: "instrumental cozy swinghop, gentle swing drums, small brass stabs, upright bass, warm tape radio, cute room feeling, loopable, no vocals, light and low attention",
    tags: "instrumental, swinghop, jazzhop, cozy, room radio, no vocals",
  },
  {
    lane: "motion_breakbeat",
    mode: "Motion",
    mood: "motion",
    vocalType: "instrumental",
    energy: 4,
    attention: 2,
    tempo: "up",
    texture: "clean",
    style: ["soft breakbeat", "uk garage lite", "chill electronic"],
    useCase: ["work", "chores", "boost"],
    titles: ["Click Sprint", "Clean Break", "Inbox Skater", "Fast Tea", "Task Runner", "Window Dash", "Lightweight Rush", "Pocket Momentum"],
    prompt: "instrumental light motion track, soft breakbeat, gentle uk garage rhythm, clean bass, bright keys, productive energy, no harsh drops, loopable, no vocals",
    tags: "instrumental, breakbeat, garage lite, motion, work, no vocals",
  },
  {
    lane: "night_synth",
    mode: "Night",
    mood: "night",
    vocalType: "instrumental",
    energy: 2,
    attention: 1,
    tempo: "mid",
    texture: "dark",
    style: ["ambient synth", "downtempo", "minimal electronic"],
    useCase: ["code", "lateNight", "study"],
    titles: ["Midnight Build", "Glass Cursor", "Dark Mode Tea", "Satellite Notes", "Blue Hour Merge", "Quiet Server", "Late Window", "Noir Debug"],
    prompt: "instrumental night coding companion, ambient synth pads, downtempo pulse, glassy arps, deep soft bass, minimal melody, no vocals, no sudden drop, focused and calm",
    tags: "instrumental, ambient synth, downtempo, night, coding, no vocals",
  },
  {
    lane: "reset_acoustic",
    mode: "Reset",
    mood: "reset",
    vocalType: "instrumental",
    energy: 1,
    attention: 1,
    tempo: "slow",
    texture: "warm",
    style: ["soft guitar", "felt piano", "ambient"],
    useCase: ["break", "study", "write"],
    titles: ["Teacup Pause", "Blank Page Rest", "Window Breath", "Slow Blanket"],
    prompt: "instrumental reset music, soft nylon guitar, felt piano, tiny tape hiss, slow breathing rhythm, calm room ambience, loopable, no vocals, no dramatic movement",
    tags: "instrumental, acoustic, reset, soft guitar, calm, no vocals",
  },
  {
    lane: "vocal_whisper",
    mode: "Vocal",
    mood: "vocal",
    vocalType: "vocal",
    energy: 2,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["whisper pop", "lofi", "soft r&b"],
    useCase: ["work", "study", "break"],
    titles: ["Stay a Little", "Still Here", "Tiny Signal", "Room Light", "Next Page", "Softly On", "Low Voice Radio", "With You"],
    prompt: "[Verse]\nstay a little, turn the page\nsoft light on the desk\nwe can move at the same pace\nnothing heavy, just the next\n\n[Hook]\ni am here, keep going\nsoft and slow, keep going\n\nSparse soft vocal, intimate room radio, low attention lyrics, gentle lofi r&b, no dramatic chorus.",
    tags: "soft vocal, whisper pop, lofi r&b, room radio, gentle",
  },
  {
    lane: "vocal_tiny_hook",
    mode: "Vocal",
    mood: "vocal",
    vocalType: "vocal",
    energy: 3,
    attention: 2,
    tempo: "mid",
    texture: "glossy",
    style: ["soft pop", "city pop lite", "tiny hook"],
    useCase: ["work", "chores", "design"],
    titles: ["Little Win", "One More Tab", "Good Enough Glow", "Almost Done", "Bright Minute", "Save Point", "Tiny Yes", "Paper Star"],
    prompt: "[Verse]\none more tab, one more line\nlittle win in borrowed time\nkeep it light, keep it kind\nleave the heavy noise behind\n\n[Hook]\nwe got this, tiny yes\none small step, tiny yes\n\nShort catchy hook, soft pop, light city pop groove, low attention lyrics, not dramatic.",
    tags: "soft vocal, tiny hook, city pop lite, work, light pop",
  },
  {
    lane: "vocal_roommate_rnb",
    mode: "Vocal",
    mood: "vocal",
    vocalType: "vocal",
    energy: 2,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["roommate r&b", "neo soul", "chillhop"],
    useCase: ["work", "write", "break"],
    titles: ["Desk Side", "Warm Enough", "Slow Reply", "Half Past Cozy", "No Rush", "Same Room", "Small Promise", "Coffee Steam"],
    prompt: "[Verse]\nno rush, we can take it slow\nsame room, quiet radio\ncoffee steam and a steady glow\none more line and then we know\n\n[Hook]\nno rush tonight\nwe keep the little light\n\nGentle roommate r&b vocal, sparse words, soft neo soul chords, relaxed groove, low attention.",
    tags: "soft vocal, r&b, neo soul, roommate radio, gentle",
  },
  {
    lane: "spark_metal_lite",
    mode: "Boost",
    mood: "spark",
    vocalType: "instrumental",
    energy: 5,
    attention: 3,
    tempo: "rush",
    texture: "clean",
    style: ["metal-lite", "clean riff", "cute heavy"],
    useCase: ["boost", "chores"],
    titles: ["Deadline Star", "Tiny Blade Runner", "Pink Armor", "Clean Riff Sprint"],
    prompt: "instrumental work sprint boost, metal-lite clean guitar riffs, tight drums, cute heavy energy, melodic and controlled, not harsh, no screaming, no vocals, short focused intensity",
    tags: "instrumental, metal-lite, boost, clean guitar, no vocals",
  },
  {
    lane: "spark_dnb_soft",
    mode: "Boost",
    mood: "spark",
    vocalType: "instrumental",
    energy: 5,
    attention: 3,
    tempo: "rush",
    texture: "glossy",
    style: ["dnb lite", "glitch", "bright electronic"],
    useCase: ["boost", "work"],
    titles: ["Fast Compile", "Signal Dash", "Glitter Break", "No Sleep Tab"],
    prompt: "instrumental boost track, drum and bass lite, bright synth stabs, clean sub bass, fast but not abrasive, work sprint energy, no vocals, controlled mix",
    tags: "instrumental, dnb lite, electronic, boost, no vocals",
  },
  {
    lane: "spark_math_rock",
    mode: "Boost",
    mood: "spark",
    vocalType: "instrumental",
    energy: 4,
    attention: 3,
    tempo: "up",
    texture: "clean",
    style: ["math rock", "clean guitar", "post rock lite"],
    useCase: ["boost", "code", "design"],
    titles: ["Angle Bracket", "Odd Meter Tea", "Clean Little Chaos", "Bright Refactor"],
    prompt: "instrumental clean math rock for work sprint, bright interlocking guitar, tight drums, melodic bass, energetic but not chaotic, no vocals, crisp and controlled",
    tags: "instrumental, math rock, clean guitar, boost, no vocals",
  },
];

const items = [];
for (const lane of lanes) {
  lane.titles.forEach((title, index) => {
    const serial = String(index + 1).padStart(3, "0");
    items.push({
      id: `${lane.lane}_${serial}_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      title,
      lane: lane.lane,
      mode: lane.mode,
      mood: lane.mood,
      vocalType: lane.vocalType,
      energy: lane.energy,
      attention: lane.attention,
      tempo: lane.tempo,
      texture: lane.texture,
      style: lane.style,
      useCase: lane.useCase,
      tags: lane.tags,
      prompt: `${lane.prompt}\n\nVariant cue: ${title}. Keep the same lane function, but use a distinct melody, arrangement detail, and intro texture.`,
    });
  });
}

if (items.length !== 96) {
  throw new Error(`Expected 96 queue items, got ${items.length}`);
}

const queue = {
  name: "Neta FM Companion Work Radio",
  createdAt: new Date().toISOString(),
  intervalSeconds,
  generationRule: "Run one Suno generate command per queue item, then wait at least 65 seconds before the next item.",
  classificationRule: "Each item has exactly one primary mood and one vocalType. Style is descriptive only and must not drive core playback modes.",
  items,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
fs.writeFileSync(jsonlPath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`);

const moodCounts = items.reduce((acc, item) => {
  acc[item.mood] = (acc[item.mood] || 0) + 1;
  return acc;
}, {});
const vocalCounts = items.reduce((acc, item) => {
  acc[item.vocalType] = (acc[item.vocalType] || 0) + 1;
  return acc;
}, {});
const laneRows = lanes.map((lane) => `| ${lane.lane} | ${lane.mode} | ${lane.mood} | ${lane.vocalType} | ${lane.titles.length} | ${lane.style.join(", ")} |`).join("\n");

fs.writeFileSync(summaryPath, `# Neta FM Suno Library Blueprint

Generated queue: \`${path.relative(process.cwd(), queuePath)}\`

Generation interval: ${intervalSeconds}s minimum between Suno submissions.

Total queue items: ${items.length}

Mood counts: ${Object.entries(moodCounts).map(([key, value]) => `${key} ${value}`).join(", ")}

Vocal counts: ${Object.entries(vocalCounts).map(([key, value]) => `${key} ${value}`).join(", ")}

| Lane | Mode | Mood | Vocal | Count | Style |
| --- | --- | --- | --- | ---: | --- |
${laneRows}
`);

console.log(queuePath);
console.log(summaryPath);
