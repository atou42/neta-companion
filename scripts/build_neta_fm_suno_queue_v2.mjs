import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("output/neta-fm-suno-v2");
const queuePath = path.join(outDir, "queue-v2.json");
const jsonlPath = path.join(outDir, "queue-v2.jsonl");
const blueprintPath = path.join(outDir, "queue-v2-blueprint.md");
const lyricsPath = path.join(outDir, "queue-v2-lyrics-book.md");

const generationRule = {
  minIntervalSeconds: 65,
  candidatesPerTrack: 2,
  rejectIfShorterThanTarget: true,
  noLoopMaterial: true,
  selectionRule: "Filter by measured duration first. If both candidates pass, choose one. If one passes, choose it. If none pass, repair-regenerate the track.",
};

const structures = {
  instrumental: "gentle intro, main theme, developed second section, variation bridge, return of theme, soft outro",
  vocal: "brief intro, verse 1, hook, verse 2, bridge, final hook, soft outro",
  spark: "quick intro, main riff/theme, variation, lift, controlled finale, clean ending",
};

const instrumentalLanes = [
  {
    lane: "focus_lofi_long",
    mode: "Study",
    mood: "focus",
    count: 12,
    targetDuration: "2:45-3:45",
    energy: 2,
    attention: 1,
    tempo: "mid",
    texture: "dusty",
    style: ["lofi", "jazzhop", "soft keys"],
    useCase: ["study", "write", "code"],
    titles: ["Paper Lantern Desk", "Margin Garden", "Quiet Compile Room", "Library Rain Map", "Soft Cursor Glow", "Ink After Midnight", "Desk Orbit Theory", "Warm Refactor Lane", "Pencil Satellite", "Index Card Weather", "Lamp Beside Tabs", "Footnote Coffee"],
    baseStyle: "instrumental full-length companion track for studying and writing, warm lofi jazzhop, soft electric piano, brushed drums, gentle bass, subtle paper-room ambience, complete arrangement, no vocals, no spoken words, no sudden drop, low attention, emotionally warm but not sleepy",
    tags: "instrumental, full-length, lofi, jazzhop, study, soft keys, warm, no vocals",
  },
  {
    lane: "focus_piano_long",
    mode: "Study",
    mood: "focus",
    count: 12,
    targetDuration: "3:00-4:00",
    energy: 1,
    attention: 1,
    tempo: "slow",
    texture: "clean",
    style: ["felt piano", "ambient", "minimal"],
    useCase: ["study", "write", "lateNight"],
    titles: ["Felt Page Atlas", "Pencil Snow Room", "Small Silence Index", "Slow Bookmark Light", "Window Grammar", "Plain Tea Proof", "Moonlit Appendix", "Quiet Theorem", "Soft Equation", "Desk Rain Sonata", "Noiseless Outline", "Blue Pencil Rest"],
    baseStyle: "instrumental full-length focus composition, felt piano, soft pad, minimal supporting pulse, gentle room tone, developed melodic arc, complete arrangement, no vocals, no dramatic chorus, low attention, calm but emotionally present",
    tags: "instrumental, full-length, felt piano, ambient, study, minimal, no vocals",
  },
  {
    lane: "flow_rnb_long",
    mode: "Work",
    mood: "flow",
    count: 14,
    targetDuration: "2:40-3:40",
    energy: 3,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["light r&b", "neo soul", "chillhop"],
    useCase: ["work", "design", "code"],
    titles: ["Soft Compile Avenue", "Velvet Keyboard Club", "Coffee Bureau", "Neon Notebook Draft", "Warm Tab Session", "Browser Soul Kitchen", "Gentle Merge Motel", "Low Battery Glow", "Side Quest Inbox", "Tender Spreadsheet", "Clipboard Moonwalk", "Modal Window Groove", "Sync Button Velvet", "Calendar Afterglow"],
    baseStyle: "instrumental full-length work companion track, light r&b groove, neo soul chords, soft bass, relaxed pocket drums, warm room radio mix, complete arrangement, no vocals, smooth and low attention, enough movement for work momentum",
    tags: "instrumental, full-length, r&b, neo soul, chillhop, work, warm, no vocals",
  },
  {
    lane: "flow_citypop_long",
    mode: "Work",
    mood: "flow",
    count: 10,
    targetDuration: "2:40-3:40",
    energy: 3,
    attention: 2,
    tempo: "mid",
    texture: "glossy",
    style: ["city pop lite", "soft funk", "chill disco"],
    useCase: ["work", "chores", "design"],
    titles: ["Chrome Mug Express", "Afternoon Terminal", "Metro Tabs", "Pastel Errand", "Signal Elevator", "Clean Desk Disco", "Soft Neon Lane", "Calendar Breeze", "Browser Arcade", "Plastic Folder Sunset"],
    baseStyle: "instrumental full-length city pop lite for work, soft funk guitar, rounded bass, clean drums, pastel synths, complete arrangement, cheerful but not distracting, no vocals, no big drop, polished but gentle",
    tags: "instrumental, full-length, city pop, soft funk, work, upbeat, no vocals",
  },
  {
    lane: "cozy_swing_long",
    mode: "Room",
    mood: "cozy",
    count: 12,
    targetDuration: "2:45-3:50",
    energy: 2,
    attention: 2,
    tempo: "mid",
    texture: "warm",
    style: ["swing", "jazzhop", "room radio"],
    useCase: ["work", "study", "break"],
    titles: ["Mug on Desk Parade", "Bookmark Swing", "Tiny Brass Lamp", "Cookie Static Radio", "Desk Pet Waltz", "Paper Moon Bureau", "Soft Shoe Notes", "Warm Shelf Club", "Postcard Stroll", "Velvet Stapler", "Pocket Gramophone", "Window Seat Swing"],
    baseStyle: "instrumental full-length cozy swinghop companion track, gentle swing drums, small brass answers, upright bass, warm tape radio, cute room feeling, complete arrangement, no vocals, light and low attention",
    tags: "instrumental, full-length, swinghop, jazzhop, cozy, room radio, no vocals",
  },
  {
    lane: "motion_breakbeat_long",
    mode: "Motion",
    mood: "motion",
    count: 10,
    targetDuration: "2:15-3:20",
    energy: 4,
    attention: 2,
    tempo: "up",
    texture: "clean",
    style: ["soft breakbeat", "uk garage lite", "chill electronic"],
    useCase: ["work", "chores", "boost"],
    titles: ["Click Sprint Avenue", "Clean Break Notebook", "Inbox Skater", "Fast Tea Method", "Task Runner Radio", "Window Dash", "Lightweight Rush", "Pocket Momentum", "Keyboard Roller", "Tiny Deadline Glide"],
    baseStyle: "instrumental full-length light motion track, soft breakbeat, gentle uk garage rhythm, clean bass, bright keys, complete arrangement, productive energy, no harsh drops, no vocals, controlled momentum",
    tags: "instrumental, full-length, breakbeat, garage lite, motion, work, no vocals",
  },
  {
    lane: "night_synth_long",
    mode: "Night",
    mood: "night",
    count: 12,
    targetDuration: "3:00-4:10",
    energy: 2,
    attention: 1,
    tempo: "mid",
    texture: "dark",
    style: ["ambient synth", "downtempo", "minimal electronic"],
    useCase: ["code", "lateNight", "study"],
    titles: ["Midnight Build Room", "Glass Cursor", "Dark Mode Tea", "Satellite Notes", "Blue Hour Merge", "Quiet Server", "Late Window", "Noir Debug", "Moon Cache", "Terminal Snowfall", "Silent Commit", "Deep Desk Signal"],
    baseStyle: "instrumental full-length night coding companion, ambient synth pads, downtempo pulse, glassy arps, deep soft bass, minimal melody, complete arrangement, no vocals, no sudden drop, focused and calm for late-night work",
    tags: "instrumental, full-length, ambient synth, downtempo, night, coding, no vocals",
  },
  {
    lane: "reset_acoustic_long",
    mode: "Reset",
    mood: "reset",
    count: 8,
    targetDuration: "3:00-4:30",
    energy: 1,
    attention: 1,
    tempo: "slow",
    texture: "warm",
    style: ["soft guitar", "felt piano", "ambient"],
    useCase: ["break", "study", "write"],
    titles: ["Teacup Pause Room", "Blank Page Rest", "Window Breath", "Slow Blanket", "Little Porch Light", "Breathing Bookmark", "Half Closed Notebook", "Rainy Desk Reset"],
    baseStyle: "instrumental full-length reset companion, soft nylon guitar, felt piano, tiny tape hiss, slow breathing rhythm, calm room ambience, complete arrangement, no vocals, no dramatic movement, restorative but not sleep music",
    tags: "instrumental, full-length, acoustic, reset, soft guitar, calm, no vocals",
  },
  {
    lane: "spark_clean_boost",
    mode: "Boost",
    mood: "spark",
    count: 8,
    targetDuration: "1:45-2:45",
    energy: 5,
    attention: 3,
    tempo: "rush",
    texture: "clean",
    style: ["metal-lite", "dnb lite", "math rock"],
    useCase: ["boost", "chores", "work"],
    titles: ["Deadline Star Engine", "Tiny Blade Runner", "Pink Armor Sprint", "Clean Riff Sprint", "Fast Compile", "Signal Dash", "Angle Bracket", "Bright Refactor"],
    baseStyle: "instrumental complete boost track, controlled intensity, clean energetic mix, melodic hook, tight drums, no screaming, no harsh noise, no vocals, strong work sprint energy with a clean ending",
    tags: "instrumental, complete boost track, metal-lite, dnb-lite, math-rock, no vocals",
    structureType: "spark",
  },
];

const vocalSongs = [
  {
    lane: "vocal_english_whisper",
    title: "Stay a Little",
    language: "English",
    style: ["whisper pop", "lofi r&b", "soft vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:40-3:30",
    lyrics: `[Intro]\nSoft light on the desk\nWe start again\n\n[Verse 1]\nStay a little, turn the page\nThere is no race inside this room\nLet the quiet set the pace\nLet the lamp become the moon\n\n[Hook]\nI am here, keep going\nSoft and slow, keep going\nOne small line, keep going\nI am here, keep going\n\n[Verse 2]\nTabs are open, tea is warm\nRain is tapping out the time\nIf the thought comes out half formed\nWe can shape it line by line\n\n[Bridge]\nBreathe in, breathe out\nNothing has to shine too loud\nBreathe in, breathe out\nLittle steps are still allowed\n\n[Final Hook]\nI am here, keep going\nSoft and slow, keep going\nOne small line, keep going\nI am here, keep going\n\n[Outro]\nSoft light on the desk\nWe start again`,
  },
  {
    lane: "vocal_english_tiny_hook",
    title: "One More Tab",
    language: "English",
    style: ["soft pop", "city pop lite", "tiny hook"],
    lyricsDensity: "low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\nOne more tab, one more line\n\n[Verse 1]\nThe window glows in violet blue\nA little task is passing through\nNo need to win the whole night now\nJust find the next good sentence somehow\n\n[Hook]\nOne more tab, one more line\nTiny spark, borrowed time\nOne more tab, one more line\nWe are doing fine\n\n[Verse 2]\nThe kettle clicks, the cursor waits\nA small idea unlocks the gate\nIf it is messy, let it be\nThe first draft only has to breathe\n\n[Bridge]\nSave the page\nStretch your hands\nCome back light\nMake no grand demands\n\n[Final Hook]\nOne more tab, one more line\nTiny spark, borrowed time\nOne more tab, one more line\nWe are doing fine\n\n[Outro]\nOne more tab\nOne more line`,
  },
  {
    lane: "vocal_english_roommate_rnb",
    title: "Same Room",
    language: "English",
    style: ["roommate r&b", "neo soul", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 2,
    attention: 2,
    targetDuration: "2:50-3:40",
    lyrics: `[Intro]\nSame room, quiet radio\n\n[Verse 1]\nNo rush, we can take it slow\nSame room, quiet radio\nCoffee steam and a steady glow\nOne more line and then we know\n\n[Hook]\nNo rush tonight\nWe keep the little light\nNo rush tonight\nYou write, I stay nearby\n\n[Verse 2]\nHalf the plan is on the floor\nHalf is knocking at the door\nWe can leave the heavy part\nFor tomorrow's stronger heart\n\n[Bridge]\nIf the minute slips away\nLet it go, let it go\nWe can find another way\nSoft and low, soft and low\n\n[Final Hook]\nNo rush tonight\nWe keep the little light\nNo rush tonight\nYou write, I stay nearby\n\n[Outro]\nSame room, quiet radio`,
  },
  {
    lane: "vocal_english_whisper",
    title: "Softly On",
    language: "English",
    style: ["whisper pop", "ambient r&b", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:40-3:30",
    lyrics: `[Intro]\nSoftly on, softly on\n\n[Verse 1]\nThe night is not asking for more than a start\nA sentence, a sketch, a small open heart\nThe room hums low like it knows what to do\nI will keep the soft signal for you\n\n[Hook]\nSoftly on, softly on\nNothing here has to be strong\nSoftly on, softly on\nStay with me and move along\n\n[Verse 2]\nThe page is patient, the clock is kind\nThe better word can take its time\nIf you get lost in the quiet part\nFollow the glow from the little star\n\n[Bridge]\nRest your eyes for a breath\nLeave the hard thought on the shelf\nCome back when the feeling clears\nI will still be here\n\n[Final Hook]\nSoftly on, softly on\nNothing here has to be strong\nSoftly on, softly on\nStay with me and move along\n\n[Outro]\nSoftly on`,
  },
  {
    lane: "vocal_chinese_soft",
    title: "小灯还亮着",
    language: "Chinese",
    style: ["中文轻唱", "lofi pop", "room radio"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:40",
    lyrics: `[前奏]\n小灯还亮着\n别急着关掉\n\n[主歌一]\n桌上的纸还没有写完\n杯里的茶慢慢变淡\n今天不用变得多勇敢\n先把这一页轻轻看完\n\n[副歌]\n我在这里陪你慢慢来\n一句一句也算抵达\n我在这里陪你慢慢来\n小小的光不会离开\n\n[主歌二]\n窗外的雨把夜色放软\n光标停在安静一端\n如果思路忽然走散\n就让它绕个弯再回来\n\n[桥段]\n深呼吸一下\n别责怪停顿\n慢一点也好\n还在往前就很好\n\n[最终副歌]\n我在这里陪你慢慢来\n一句一句也算抵达\n我在这里陪你慢慢来\n小小的光不会离开\n\n[尾声]\n小灯还亮着\n你也还在`,
  },
  {
    lane: "vocal_chinese_soft",
    title: "再写一点点",
    language: "Chinese",
    style: ["中文轻流行", "soft r&b", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 2,
    attention: 2,
    targetDuration: "2:40-3:30",
    lyrics: `[前奏]\n再写一点点\n就一点点\n\n[主歌一]\n别急着把答案找全\n有些路要绕过房间\n键盘声轻轻落在耳边\n像一场不吵的雨天\n\n[副歌]\n再写一点点\n再近一点点\n哪怕只是把标题改好一点\n再写一点点\n再亮一点点\n小小进度也值得被看见\n\n[主歌二]\n列表还长也没有关系\n先从最近的那件事开始\n灵感有时候很孩子气\n躲在杯底等你注意\n\n[桥段]\n如果累了就停一拍\n把肩膀慢慢放下来\n等风从窗口经过\n再回来\n\n[最终副歌]\n再写一点点\n再近一点点\n哪怕只是把标题改好一点\n再写一点点\n再亮一点点\n小小进度也值得被看见\n\n[尾声]\n再写一点点\n就一点点`,
  },
  {
    lane: "vocal_chinese_soft",
    title: "夜里有电台",
    language: "Chinese",
    style: ["中文卧室流行", "downtempo", "soft vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "3:00-3:50",
    lyrics: `[前奏]\n夜里有电台\n轻轻响起来\n\n[主歌一]\n城市睡得很慢\n屏幕亮得很乖\n你把今天摊开\n像一张小小海\n\n[副歌]\n夜里有电台\n陪你把心放下来\n不要追太快\n慢慢也会到未来\n\n[主歌二]\n有些字还空白\n有些梦还没来\n没关系别责怪\n先把呼吸找回来\n\n[桥段]\n听见吗\n窗边的风在说话\n别怕呀\n你不是一个人在抵达\n\n[最终副歌]\n夜里有电台\n陪你把心放下来\n不要追太快\n慢慢也会到未来\n\n[尾声]\n夜里有电台\n我还在`,
  },
  {
    lane: "vocal_chinese_soft",
    title: "今天也可以",
    language: "Chinese",
    style: ["中文轻唱", "soft pop", "gentle beat"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[前奏]\n今天也可以\n\n[主歌一]\n先别管远处的山\n先把手边的灯点燃\n桌面有点乱也不算坏\n说明这里真的有人在\n\n[副歌]\n今天也可以\n慢慢走也可以\n小小的胜利\n藏在下一行里\n今天也可以\n不完美也可以\n把心放轻一点\n就继续\n\n[主歌二]\n有风穿过便利贴\n提醒你换一口新鲜\n如果还没有想明白\n就让音乐先把路铺开\n\n[桥段]\n三分钟也算开始\n一页纸也有意义\n不用证明给谁看\n你已经在这里\n\n[最终副歌]\n今天也可以\n慢慢走也可以\n小小的胜利\n藏在下一行里\n今天也可以\n不完美也可以\n把心放轻一点\n就继续\n\n[尾声]\n今天也可以`,
  },
  {
    lane: "vocal_japanese_soft",
    title: "灯りのそばで",
    language: "Japanese",
    style: ["Japanese soft pop", "lofi", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\n灯りのそばで\nゆっくり始めよう\n\n[Verse 1]\nページの上に 小さな夜\n鉛筆の音 そっと踊る\n急がなくていい ここにいるよ\n君のペースで 進めばいい\n\n[Hook]\nだいじょうぶ だいじょうぶ\n一行ずつでいい\nだいじょうぶ だいじょうぶ\n灯りは消えない\n\n[Verse 2]\n窓の向こうで 雨が歌う\n迷った言葉も 眠らせよう\nまた戻ればいい ここにいるよ\n小さな夢を ほどいていこう\n\n[Bridge]\n深呼吸して\n肩の力を抜いて\n静かな夜に\n名前をつけよう\n\n[Final Hook]\nだいじょうぶ だいじょうぶ\n一行ずつでいい\nだいじょうぶ だいじょうぶ\n灯りは消えない\n\n[Outro]\n灯りのそばで\nゆっくり続けよう`,
  },
  {
    lane: "vocal_japanese_soft",
    title: "もう少しだけ",
    language: "Japanese",
    style: ["Japanese bedroom pop", "soft r&b", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 2,
    attention: 2,
    targetDuration: "2:40-3:30",
    lyrics: `[Intro]\nもう少しだけ\n\n[Verse 1]\n机の上に 夜が来て\nカップの影が 揺れている\n答えはまだ 遠くても\n今日の君は ここにいる\n\n[Hook]\nもう少しだけ 書いてみよう\n小さな光を 追いかけよう\nもう少しだけ そばにいるよ\nゆっくりでいいよ\n\n[Verse 2]\n消した言葉も 道になる\nため息さえも リズムになる\n眠い星が まばたきして\n次の一歩を 教えてる\n\n[Bridge]\n止まってもいい\n戻ってもいい\n静かな声で\nまた始めよう\n\n[Final Hook]\nもう少しだけ 書いてみよう\n小さな光を 追いかけよう\nもう少しだけ そばにいるよ\nゆっくりでいいよ\n\n[Outro]\nもう少しだけ`,
  },
  {
    lane: "vocal_japanese_soft",
    title: "窓辺のリズム",
    language: "Japanese",
    style: ["Japanese city pop lite", "soft groove", "gentle vocal"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\n窓辺のリズム\n\n[Verse 1]\n青い画面に 朝が来る\n少し眠たい コードの海\n忘れたメモを 探しながら\n軽いステップで 進んでいく\n\n[Hook]\n窓辺のリズムで\n今日をほどいて\n小さなビートで\n手を動かして\n\n[Verse 2]\n予定通りじゃ なくてもいい\n回り道にも 名前がある\nコーヒーの香り 浮かんだら\n新しい線を 引いてみよう\n\n[Bridge]\nゆらり ゆらり\n焦らないで\nひかり ひかり\nここにあるよ\n\n[Final Hook]\n窓辺のリズムで\n今日をほどいて\n小さなビートで\n手を動かして\n\n[Outro]\n窓辺のリズム`,
  },
  {
    lane: "vocal_korean_soft",
    title: "작은 불빛",
    language: "Korean",
    style: ["Korean soft r&b", "lofi", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\n작은 불빛 옆에\n천천히 앉아\n\n[Verse 1]\n책상 위에 밤이 내려와\n조용한 숨처럼 머물러\n급하지 않아도 괜찮아\n한 줄씩 마음을 열어봐\n\n[Hook]\n괜찮아 천천히 가\n작은 불빛은 여기 있어\n괜찮아 조금씩만\n오늘도 너를 기다려\n\n[Verse 2]\n커피 향이 살짝 식어도\n생각은 다시 따뜻해져\n흐린 문장도 길이 되고\n손끝에 리듬이 돌아와\n\n[Bridge]\n숨을 쉬어\n어깨를 내려놔\n작은 밤이\n너를 안아줄 거야\n\n[Final Hook]\n괜찮아 천천히 가\n작은 불빛은 여기 있어\n괜찮아 조금씩만\n오늘도 너를 기다려\n\n[Outro]\n작은 불빛 옆에`,
  },
  {
    lane: "vocal_korean_soft",
    title: "한 줄 더",
    language: "Korean",
    style: ["Korean bedroom pop", "soft beat", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\n한 줄 더\n\n[Verse 1]\n창문 밖은 조용해지고\n화면 속엔 작은 별 하나\n완벽하지 않아도 좋아\n지금은 시작이면 돼\n\n[Hook]\n한 줄 더 써볼까\n작은 걸음 괜찮아\n한 줄 더 가볼까\n너의 속도 그대로\n\n[Verse 2]\n지워진 말도 남아 있어\n다른 길을 알려주니까\n손끝에서 빛이 나면\n오늘도 조금 가까워져\n\n[Bridge]\n쉬어도 돼\n다시 와도 돼\n여기 음악은\n계속 기다려\n\n[Final Hook]\n한 줄 더 써볼까\n작은 걸음 괜찮아\n한 줄 더 가볼까\n너의 속도 그대로\n\n[Outro]\n한 줄 더`,
  },
  {
    lane: "vocal_spanish_soft",
    title: "Luz de Mesa",
    language: "Spanish",
    style: ["Spanish soft pop", "bossa lofi", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nLuz de mesa, voz pequeña\n\n[Verse 1]\nLa noche cae sin prisa aquí\nTu cuaderno vuelve a respirar\nNo hay montaña que subir\nSolo una línea para empezar\n\n[Hook]\nSigue despacio, estoy aquí\nPaso pequeño, sigue así\nSigue despacio, no hay final\nLa luz aprende a acompañar\n\n[Verse 2]\nLa lluvia toca el ventanal\nComo un compás de claridad\nSi una palabra sale mal\nLa dejamos descansar\n\n[Bridge]\nRespira un poco\nSuelta el ruido\nVuelve suave\nAl mismo sitio\n\n[Final Hook]\nSigue despacio, estoy aquí\nPaso pequeño, sigue así\nSigue despacio, no hay final\nLa luz aprende a acompañar\n\n[Outro]\nLuz de mesa, voz pequeña`,
  },
  {
    lane: "vocal_spanish_soft",
    title: "Un Poco Más",
    language: "Spanish",
    style: ["Spanish indie pop", "soft r&b", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\nUn poco más\n\n[Verse 1]\nEl cursor parpadea sin hablar\nLa taza se enfría junto al plan\nNo tienes todo que arreglar\nSolo volver a comenzar\n\n[Hook]\nUn poco más, un poco más\nLa noche nos puede esperar\nUn poco más, sin correr\nLo pequeño también va a crecer\n\n[Verse 2]\nHay notas sueltas en la pared\nY una idea tímida al volver\nSi el mundo pesa sobre ti\nYo bajo el volumen para seguir\n\n[Bridge]\nManos quietas\nLuz abierta\nRespira lento\nLa puerta está cerca\n\n[Final Hook]\nUn poco más, un poco más\nLa noche nos puede esperar\nUn poco más, sin correr\nLo pequeño también va a crecer\n\n[Outro]\nUn poco más`,
  },
  {
    lane: "vocal_french_soft",
    title: "Petite Lumière",
    language: "French",
    style: ["French soft pop", "lofi chanson", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nPetite lumière\nReste près de moi\n\n[Verse 1]\nLa page attend sans faire de bruit\nLe soir s'installe au bord du thé\nTu n'as pas besoin d'aller vite\nUn mot suffit pour commencer\n\n[Hook]\nDoucement, je reste là\nPetite lumière, guide nos pas\nDoucement, on continuera\nMême si la phrase hésite parfois\n\n[Verse 2]\nLa pluie dessine sur la vitre\nUn vieux refrain très familier\nSi ton idée devient timide\nLaisse-la revenir respirer\n\n[Bridge]\nFerme les yeux\nLe monde peut attendre\nRouvre les mains\nLe calme va descendre\n\n[Final Hook]\nDoucement, je reste là\nPetite lumière, guide nos pas\nDoucement, on continuera\nMême si la phrase hésite parfois\n\n[Outro]\nPetite lumière\nReste près de moi`,
  },
  {
    lane: "vocal_french_soft",
    title: "Encore Une Ligne",
    language: "French",
    style: ["French bedroom pop", "soft groove", "warm vocal"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\nEncore une ligne\n\n[Verse 1]\nLe clavier chante doucement\nLa ville dort à moitié seulement\nOn garde un peu de courage\nDans le coin clair de la page\n\n[Hook]\nEncore une ligne, pas plus\nUn petit pas, pas plus\nEncore une ligne, tu vois\nLe calme travaille avec toi\n\n[Verse 2]\nMême les idées sans couleur\nPeuvent revenir avec douceur\nSi la route tourne un peu\nOn suivra le fil lumineux\n\n[Bridge]\nLaisse le doute\nSur la table\nReviens léger\nReviens capable\n\n[Final Hook]\nEncore une ligne, pas plus\nUn petit pas, pas plus\nEncore une ligne, tu vois\nLe calme travaille avec toi\n\n[Outro]\nEncore une ligne`,
  },
  {
    lane: "vocal_mixed_global",
    title: "Room Radio",
    language: "English + Chinese",
    style: ["soft global pop", "lofi r&b", "room radio"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nRoom radio\n小小电台\n\n[Verse 1]\nKeep the light low, keep the page near\nNo need to hurry, I am right here\n窗外的风慢慢吹来\n把乱掉的心轻轻打开\n\n[Hook]\nRoom radio, stay with me\n慢慢来, just let it be\nRoom radio, soft and clear\n你写一句, I stay here\n\n[Verse 2]\nThe tiny clock is not a judge\nA quiet start can be enough\n桌上的梦还没醒来\n我们就先陪它等待\n\n[Bridge]\nBreathe in, breathe out\n别急着回答\nBreathe in, breathe out\n小光也会长大\n\n[Final Hook]\nRoom radio, stay with me\n慢慢来, just let it be\nRoom radio, soft and clear\n你写一句, I stay here\n\n[Outro]\nRoom radio\n小小电台`,
  },
  {
    lane: "vocal_mixed_global",
    title: "Daijoubu Little Star",
    language: "English + Japanese",
    style: ["soft pop", "Japanese lofi", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nLittle star, daijoubu\n\n[Verse 1]\nA quiet desk, a sleepy moon\nKimi no pace de, start it soon\nNo need to carry all the sky\nJust keep one small light nearby\n\n[Hook]\nDaijoubu, little star\nYou are closer than you are\nDaijoubu, softly start\nOne more line can be a heart\n\n[Verse 2]\nMado no ame, gentle sound\nLost ideas can still be found\nIf the night is feeling far\nFollow the pencil like a star\n\n[Bridge]\nYukkuri, breathe again\nNo need to know the end\nYukkuri, stay with me\nLet the page be free\n\n[Final Hook]\nDaijoubu, little star\nYou are closer than you are\nDaijoubu, softly start\nOne more line can be a heart\n\n[Outro]\nLittle star, daijoubu`,
  },
  {
    lane: "vocal_mixed_global",
    title: "Despacio Glow",
    language: "English + Spanish",
    style: ["soft r&b", "Latin lofi", "gentle vocal"],
    lyricsDensity: "medium-low",
    energy: 3,
    attention: 2,
    targetDuration: "2:35-3:25",
    lyrics: `[Intro]\nDespacio glow\n\n[Verse 1]\nKeep the rhythm under the rain\nUna línea, then breathe again\nThe page is not a battlefield\nIt is a place where thoughts can heal\n\n[Hook]\nDespacio, glow, glow\nLittle steps know where to go\nDespacio, slow, slow\nStay with me and let it flow\n\n[Verse 2]\nLa taza fría, la luz azul\nNo pasa nada, we move through\nIf the answer hides away\nWe can find another phrase\n\n[Bridge]\nNo rush, no rush\nBaja la voz\nNo rush, no rush\nWe still have a choice\n\n[Final Hook]\nDespacio, glow, glow\nLittle steps know where to go\nDespacio, slow, slow\nStay with me and let it flow\n\n[Outro]\nDespacio glow`,
  },
  {
    lane: "vocal_mixed_global",
    title: "Bonjour 작은 별",
    language: "French + Korean",
    style: ["soft global pop", "warm lofi", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nBonjour, 작은 별\n\n[Verse 1]\nPetite lumière sur la table\n조용한 밤이 내려와\nLe monde peut attendre un peu\n너의 속도로 괜찮아\n\n[Hook]\nBonjour, 작은 별\nDoucement, 천천히 가\nBonjour, 작은 별\nLa nuit nous gardera\n\n[Verse 2]\nUn mot, puis une respiration\n한 줄 더 써도 좋아\nLes idées reviennent parfois\n작은 빛을 따라와\n\n[Bridge]\nRespire doucement\n숨을 쉬어 천천히\nReste simplement\n여기 있어 같이\n\n[Final Hook]\nBonjour, 작은 별\nDoucement, 천천히 가\nBonjour, 작은 별\nLa nuit nous gardera\n\n[Outro]\nBonjour, 작은 별`,
  },
  {
    lane: "vocal_english_reset",
    title: "Slow Blanket",
    language: "English",
    style: ["soft folk", "felt piano", "gentle vocal"],
    lyricsDensity: "low",
    energy: 1,
    attention: 1,
    targetDuration: "3:00-4:00",
    lyrics: `[Intro]\nLay the day down\n\n[Verse 1]\nYou do not have to finish now\nThe room can hold the open page\nLet the tired minutes bow\nLet the quiet rearrange\n\n[Hook]\nSlow blanket, cover the noise\nSoft landing, small voice\nSlow blanket, nothing to prove\nRest a little, then move\n\n[Verse 2]\nThe pencil waits beside the tea\nThe window keeps a silver rain\nNot every thought must turn the key\nNot every pause becomes a chain\n\n[Bridge]\nClose the list\nOpen your hand\nLeave the weight\nWhere it can stand\n\n[Final Hook]\nSlow blanket, cover the noise\nSoft landing, small voice\nSlow blanket, nothing to prove\nRest a little, then move\n\n[Outro]\nLay the day down`,
  },
  {
    lane: "vocal_english_focus",
    title: "Quiet Proof",
    language: "English",
    style: ["minimal pop", "soft piano", "gentle vocal"],
    lyricsDensity: "low",
    energy: 1,
    attention: 1,
    targetDuration: "3:00-3:50",
    lyrics: `[Intro]\nQuiet proof\n\n[Verse 1]\nA page can grow without a sound\nA thought can turn itself around\nNo need to make the moment bright\nThe small proof gathers in the night\n\n[Hook]\nQuiet proof, line by line\nLittle truth, taking time\nQuiet proof, stay with me\nSoft work becomes memory\n\n[Verse 2]\nThe desk is warm, the world is low\nThe better answer moves in slow\nIf you forget the reason why\nLook at the lamp and let it try\n\n[Bridge]\nNothing loud\nNothing grand\nJust the page\nAnd your hand\n\n[Final Hook]\nQuiet proof, line by line\nLittle truth, taking time\nQuiet proof, stay with me\nSoft work becomes memory\n\n[Outro]\nQuiet proof`,
  },
  {
    lane: "vocal_chinese_reset",
    title: "慢慢落地",
    language: "Chinese",
    style: ["中文民谣流行", "felt piano", "soft vocal"],
    lyricsDensity: "low",
    energy: 1,
    attention: 1,
    targetDuration: "3:00-4:00",
    lyrics: `[前奏]\n慢慢落地\n\n[主歌一]\n把今天先放在桌边\n让没做完的事安静一点\n你不需要马上改变\n先把呼吸还给时间\n\n[副歌]\n慢慢落地\n风会接住你\n慢慢落地\n夜也有缝隙\n\n[主歌二]\n杯子里还剩一点温度\n窗外的雨走得很轻\n如果心里还有雾\n就让音乐陪你等一等\n\n[桥段]\n不用解释\n不用证明\n你已经走了\n很长很长的路\n\n[最终副歌]\n慢慢落地\n风会接住你\n慢慢落地\n夜也有缝隙\n\n[尾声]\n慢慢落地`,
  },
  {
    lane: "vocal_japanese_reset",
    title: "静かな帰り道",
    language: "Japanese",
    style: ["Japanese soft folk", "ambient piano", "gentle vocal"],
    lyricsDensity: "low",
    energy: 1,
    attention: 1,
    targetDuration: "3:00-4:00",
    lyrics: `[Intro]\n静かな帰り道\n\n[Verse 1]\n今日の荷物を そっと置いて\n小さな息を ひとつ数える\n全部できなくても いいよ\n夜は君を 責めたりしない\n\n[Hook]\n静かな帰り道\nゆっくり歩こう\n静かな帰り道\n明かりはまだある\n\n[Verse 2]\n窓に映った 疲れた顔も\n少し笑えば 戻ってくる\n忘れた夢は ポケットの中\n明日の朝に また会える\n\n[Bridge]\n目を閉じて\n雨を聞いて\n何もしない\n時間をあげよう\n\n[Final Hook]\n静かな帰り道\nゆっくり歩こう\n静かな帰り道\n明かりはまだある\n\n[Outro]\n静かな帰り道`,
  },
  {
    lane: "vocal_spanish_reset",
    title: "Descansa Aquí",
    language: "Spanish",
    style: ["Spanish soft folk", "ambient pop", "gentle vocal"],
    lyricsDensity: "low",
    energy: 1,
    attention: 1,
    targetDuration: "3:00-4:00",
    lyrics: `[Intro]\nDescansa aquí\n\n[Verse 1]\nDeja el día sobre la mesa\nNo hace falta resolver\nLa noche tiene voz pequeña\nY te invita a volver\n\n[Hook]\nDescansa aquí, sin correr\nTodo puede esperar\nDescansa aquí, otra vez\nMañana va a llegar\n\n[Verse 2]\nLa lluvia guarda tus papeles\nLa lámpara sabe escuchar\nSi el cansancio te sostiene\nYo te ayudo a respirar\n\n[Bridge]\nCierra los ojos\nSuelta el final\nLo que no pesa\nPuede sanar\n\n[Final Hook]\nDescansa aquí, sin correr\nTodo puede esperar\nDescansa aquí, otra vez\nMañana va a llegar\n\n[Outro]\nDescansa aquí`,
  },
  {
    lane: "vocal_english_boost",
    title: "Small Fire",
    language: "English",
    style: ["clean boost pop", "bright rock", "controlled vocal"],
    lyricsDensity: "medium",
    energy: 4,
    attention: 3,
    targetDuration: "2:10-2:50",
    lyrics: `[Intro]\nSmall fire, clean wire\n\n[Verse 1]\nWake the screen, clear the floor\nWe have been slow, now we need one more\nNot a storm, not a fight\nJust a spark with a steady light\n\n[Hook]\nSmall fire, get it done\nOne clean push, then we run\nSmall fire, bright and clear\nFinish line is almost here\n\n[Verse 2]\nStack the tasks, name the first\nTiny engine, useful burst\nNo big noise, no heavy crown\nJust enough to move it down\n\n[Bridge]\nCount it in\nTwo, three, go\nKeep it sharp\nKeep it low\n\n[Final Hook]\nSmall fire, get it done\nOne clean push, then we run\nSmall fire, bright and clear\nFinish line is almost here\n\n[Outro]\nSmall fire, clean wire`,
  },
  {
    lane: "vocal_mixed_boost",
    title: "Vamos Go",
    language: "English + Spanish",
    style: ["bright boost pop", "clean breakbeat", "light vocal"],
    lyricsDensity: "medium",
    energy: 4,
    attention: 3,
    targetDuration: "2:10-2:50",
    lyrics: `[Intro]\nVamos, go\n\n[Verse 1]\nClear the desk, open the door\nTenemos ritmo, one task more\nNo heavy drama, no big show\nJust enough fire, vamos go\n\n[Hook]\nVamos, go, go\nLittle engine, steady flow\nVamos, go, go\nFinish clean and let it glow\n\n[Verse 2]\nClick by click, we make a road\nUna cosa, then unload\nIf it feels too loud, turn it low\nStill we move, vamos go\n\n[Bridge]\nRespira\nNow begin\nSmall spark\nUseful win\n\n[Final Hook]\nVamos, go, go\nLittle engine, steady flow\nVamos, go, go\nFinish clean and let it glow\n\n[Outro]\nVamos, go`,
  },
  {
    lane: "vocal_italian_soft",
    title: "Piccola Luce",
    language: "Italian",
    style: ["Italian soft pop", "lofi bossa", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nPiccola luce\nResta con me\n\n[Verse 1]\nLa sera posa piano qui\nSul foglio bianco davanti a te\nNon devi correre così\nUn passo piccolo va bene\n\n[Hook]\nPiano piano, resto qua\nPiccola luce guiderà\nPiano piano, senza rumore\nUna parola apre il cuore\n\n[Verse 2]\nLa tazza guarda la finestra\nLa pioggia scrive per metà\nSe manca ancora una risposta\nLa calma la ritroverà\n\n[Bridge]\nRespira adesso\nLascia il peso\nTorna leggero\nAl tuo pensiero\n\n[Final Hook]\nPiano piano, resto qua\nPiccola luce guiderà\nPiano piano, senza rumore\nUna parola apre il cuore\n\n[Outro]\nPiccola luce\nResta con me`,
  },
  {
    lane: "vocal_mixed_global",
    title: "Hallo Soft Signal",
    language: "English + German",
    style: ["soft global pop", "warm synth", "gentle vocal"],
    lyricsDensity: "low",
    energy: 2,
    attention: 2,
    targetDuration: "2:45-3:35",
    lyrics: `[Intro]\nHallo, soft signal\n\n[Verse 1]\nThe desk light hums, der Abend ist klein\nOne little task, one quiet line\nNo need to carry the whole wide sky\nWir bleiben hier, you and I\n\n[Hook]\nHallo, soft signal\nBleib noch ein bisschen hier\nHallo, soft signal\nI write, you stay near\n\n[Verse 2]\nThe window holds a silver rain\nEin neuer Satz kommt irgendwann\nIf the thought needs time to appear\nWe keep the channel clear\n\n[Bridge]\nLangsam atmen\nLet it be\nKleine Schritte\nStay with me\n\n[Final Hook]\nHallo, soft signal\nBleib noch ein bisschen hier\nHallo, soft signal\nI write, you stay near\n\n[Outro]\nHallo, soft signal`,
  },
];

const vocalCommon = {
  mode: "Vocal",
  mood: "vocal",
  vocalType: "vocal",
  tempo: "mid",
  texture: "warm",
  useCase: ["work", "study", "break"],
};

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "track";
}

function buildInstrumentalPrompt(lane, title) {
  return [
    lane.baseStyle,
    `Target duration ${lane.targetDuration}.`,
    `Structure: ${structures[lane.structureType || "instrumental"]}.`,
    "This must feel like a complete piece of music with full musical development and a satisfying ending.",
    "Use clear section changes, subtle development, and a satisfying soft ending.",
    `Variant cue: ${title}. Keep the lane function, but create a distinct melody, arrangement detail, and intro texture.`,
  ].join(" ");
}

function buildVocalStylePrompt(song) {
  return [
    "full-length companion song with gentle complete arrangement",
    song.style.join(", "),
    `language: ${song.language}`,
    `target duration ${song.targetDuration}`,
    `structure: ${structures.vocal}`,
    "low distraction vocal production, intimate room radio feeling, no dramatic belting, no huge EDM drop, clear soft ending",
  ].join(", ");
}

function itemBase(track, index) {
  return {
    id: `${track.lane}_${String(index + 1).padStart(3, "0")}_${slug(track.title)}`,
    schemaVersion: 2,
    title: track.title,
    lane: track.lane,
    mode: track.mode,
    mood: track.mood,
    vocalType: track.vocalType,
    generationType: track.vocalType === "instrumental" ? "instrumental" : "vocal",
    targetDuration: track.targetDuration,
    minAcceptDurationSeconds: track.mood === "spark" ? 105 : 150,
    preferredDurationSeconds: track.mood === "spark" ? 135 : 195,
    maxPreferredDurationSeconds: track.mood === "reset" || track.mood === "night" ? 270 : 240,
    structure: track.structure,
    energy: track.energy,
    attention: track.attention,
    tempo: track.tempo,
    texture: track.texture,
    style: track.style,
    useCase: track.useCase,
    tags: track.tags,
    stylePrompt: track.stylePrompt,
    lyrics: track.lyrics,
    language: track.language || "none",
    lyricsDensity: track.lyricsDensity || "none",
    candidatesRequested: generationRule.candidatesPerTrack,
  };
}

const items = [];

for (const lane of instrumentalLanes) {
  lane.titles.forEach((title, index) => {
    items.push(itemBase({
      ...lane,
      title,
      vocalType: "instrumental",
      generationType: "instrumental",
      structure: structures[lane.structureType || "instrumental"],
      lyrics: "",
      language: "none",
      lyricsDensity: "none",
      stylePrompt: buildInstrumentalPrompt(lane, title),
    }, index));
  });
}

for (const [index, song] of vocalSongs.entries()) {
  items.push(itemBase({
    ...vocalCommon,
    ...song,
    structure: structures.vocal,
    stylePrompt: buildVocalStylePrompt(song),
    tags: `${song.style.join(", ")}, full-length, companion vocal, ${song.language}`,
  }, index));
}

if (items.length !== 128) {
  throw new Error(`Expected 128 queue items, got ${items.length}`);
}

const queue = {
  name: "Neta FM Companion Work Radio v2",
  createdAt: new Date().toISOString(),
  generationRule,
  classificationRule: "Each item has one primary mood and one vocalType. Style is descriptive only; playback modes use mode, mood, vocalType, energy, attention, and useCase.",
  promptRule: "Pure instrumental tracks must use instrumental generation and stylePrompt only. Vocal tracks use lyrics plus stylePrompt. Do not put style prose into lyrics for instrumental tracks.",
  items,
};

const moodCounts = items.reduce((acc, item) => {
  acc[item.mood] = (acc[item.mood] || 0) + 1;
  return acc;
}, {});
const vocalCounts = items.reduce((acc, item) => {
  acc[item.vocalType] = (acc[item.vocalType] || 0) + 1;
  return acc;
}, {});
const languageCounts = items.reduce((acc, item) => {
  acc[item.language] = (acc[item.language] || 0) + 1;
  return acc;
}, {});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
fs.writeFileSync(jsonlPath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`);

const laneRows = [...instrumentalLanes.map((lane) => ({
  lane: lane.lane,
  mode: lane.mode,
  mood: lane.mood,
  vocalType: "instrumental",
  count: lane.titles.length,
  targetDuration: lane.targetDuration,
  style: lane.style.join(", "),
})), ...vocalSongs.reduce((acc, song) => {
  const existing = acc.find((row) => row.lane === song.lane);
  if (existing) existing.count += 1;
  else acc.push({
    lane: song.lane,
    mode: "Vocal",
    mood: "vocal",
    vocalType: "vocal",
    count: 1,
    targetDuration: song.targetDuration,
    style: song.style.join(", "),
  });
  return acc;
}, [])].map((row) => `| ${row.lane} | ${row.mode} | ${row.mood} | ${row.vocalType} | ${row.count} | ${row.targetDuration} | ${row.style} |`).join("\n");

const trackRows = items.map((item, index) => `| ${String(index + 1).padStart(3, "0")} | ${item.title} | ${item.mode} | ${item.mood} | ${item.vocalType} | ${item.language} | ${item.targetDuration} | ${item.energy} | ${item.attention} |`).join("\n");

fs.writeFileSync(blueprintPath, `# Neta FM Suno Queue v2

Queue file: \`${path.relative(process.cwd(), queuePath)}\`

Total tracks: ${items.length}

Minimum interval between Suno submissions: ${generationRule.minIntervalSeconds}s

Mood counts: ${Object.entries(moodCounts).map(([key, value]) => `${key} ${value}`).join(", ")}

Vocal counts: ${Object.entries(vocalCounts).map(([key, value]) => `${key} ${value}`).join(", ")}

Language counts: ${Object.entries(languageCounts).map(([key, value]) => `${key} ${value}`).join(", ")}

## Generation Rules

- Instrumental tracks use instrumental generation and \`stylePrompt\`; lyrics are empty.
- Vocal tracks use \`lyrics\` plus \`stylePrompt\`.
- Reject candidates below \`minAcceptDurationSeconds\`.
- Ask for complete pieces with clear development and endings.
- Every track requests ${generationRule.candidatesPerTrack} candidates.

## Lanes

| Lane | Mode | Mood | Vocal | Count | Target Duration | Style |
| --- | --- | --- | --- | ---: | --- | --- |
${laneRows}

## Tracks

| # | Title | Mode | Mood | Vocal | Language | Target Duration | Energy | Attention |
| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: |
${trackRows}
`);

const lyricSections = vocalSongs.map((song, index) => `## ${String(index + 1).padStart(2, "0")}. ${song.title}

Language: ${song.language}

Style: ${song.style.join(", ")}

Target duration: ${song.targetDuration}

\`\`\`text
${song.lyrics}
\`\`\`
`).join("\n");

fs.writeFileSync(lyricsPath, `# Neta FM v2 Lyrics Book

All lyrics are original draft lyrics for low-distraction companion listening.

${lyricSections}`);

console.log(queuePath);
console.log(blueprintPath);
console.log(lyricsPath);
console.log(JSON.stringify({ total: items.length, moodCounts, vocalCounts, languageCounts }, null, 2));
