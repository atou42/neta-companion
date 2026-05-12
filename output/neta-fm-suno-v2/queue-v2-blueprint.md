# Neta FM Suno Queue v2

Queue file: `output/neta-fm-suno-v2/queue-v2.json`

Total tracks: 128

Minimum interval between Suno submissions: 65s

Mood counts: focus 24, flow 24, cozy 12, motion 10, night 12, reset 8, spark 8, vocal 30

Vocal counts: instrumental 98, vocal 30

Language counts: none 98, English 7, Chinese 5, Japanese 4, Korean 2, Spanish 3, French 2, English + Chinese 1, English + Japanese 1, English + Spanish 2, French + Korean 1, Italian 1, English + German 1

## Generation Rules

- Instrumental tracks use instrumental generation and `stylePrompt`; lyrics are empty.
- Vocal tracks use `lyrics` plus `stylePrompt`.
- Reject candidates below `minAcceptDurationSeconds`.
- Ask for complete pieces with clear development and endings.
- Every track requests 2 candidates.

## Lanes

| Lane | Mode | Mood | Vocal | Count | Target Duration | Style |
| --- | --- | --- | --- | ---: | --- | --- |
| focus_lofi_long | Study | focus | instrumental | 12 | 2:45-3:45 | lofi, jazzhop, soft keys |
| focus_piano_long | Study | focus | instrumental | 12 | 3:00-4:00 | felt piano, ambient, minimal |
| flow_rnb_long | Work | flow | instrumental | 14 | 2:40-3:40 | light r&b, neo soul, chillhop |
| flow_citypop_long | Work | flow | instrumental | 10 | 2:40-3:40 | city pop lite, soft funk, chill disco |
| cozy_swing_long | Room | cozy | instrumental | 12 | 2:45-3:50 | swing, jazzhop, room radio |
| motion_breakbeat_long | Motion | motion | instrumental | 10 | 2:15-3:20 | soft breakbeat, uk garage lite, chill electronic |
| night_synth_long | Night | night | instrumental | 12 | 3:00-4:10 | ambient synth, downtempo, minimal electronic |
| reset_acoustic_long | Reset | reset | instrumental | 8 | 3:00-4:30 | soft guitar, felt piano, ambient |
| spark_clean_boost | Boost | spark | instrumental | 8 | 1:45-2:45 | metal-lite, dnb lite, math rock |
| vocal_english_whisper | Vocal | vocal | vocal | 2 | 2:40-3:30 | whisper pop, lofi r&b, soft vocal |
| vocal_english_tiny_hook | Vocal | vocal | vocal | 1 | 2:35-3:25 | soft pop, city pop lite, tiny hook |
| vocal_english_roommate_rnb | Vocal | vocal | vocal | 1 | 2:50-3:40 | roommate r&b, neo soul, warm vocal |
| vocal_chinese_soft | Vocal | vocal | vocal | 4 | 2:45-3:40 | 中文轻唱, lofi pop, room radio |
| vocal_japanese_soft | Vocal | vocal | vocal | 3 | 2:45-3:35 | Japanese soft pop, lofi, gentle vocal |
| vocal_korean_soft | Vocal | vocal | vocal | 2 | 2:45-3:35 | Korean soft r&b, lofi, gentle vocal |
| vocal_spanish_soft | Vocal | vocal | vocal | 2 | 2:45-3:35 | Spanish soft pop, bossa lofi, gentle vocal |
| vocal_french_soft | Vocal | vocal | vocal | 2 | 2:45-3:35 | French soft pop, lofi chanson, gentle vocal |
| vocal_mixed_global | Vocal | vocal | vocal | 5 | 2:45-3:35 | soft global pop, lofi r&b, room radio |
| vocal_english_reset | Vocal | vocal | vocal | 1 | 3:00-4:00 | soft folk, felt piano, gentle vocal |
| vocal_english_focus | Vocal | vocal | vocal | 1 | 3:00-3:50 | minimal pop, soft piano, gentle vocal |
| vocal_chinese_reset | Vocal | vocal | vocal | 1 | 3:00-4:00 | 中文民谣流行, felt piano, soft vocal |
| vocal_japanese_reset | Vocal | vocal | vocal | 1 | 3:00-4:00 | Japanese soft folk, ambient piano, gentle vocal |
| vocal_spanish_reset | Vocal | vocal | vocal | 1 | 3:00-4:00 | Spanish soft folk, ambient pop, gentle vocal |
| vocal_english_boost | Vocal | vocal | vocal | 1 | 2:10-2:50 | clean boost pop, bright rock, controlled vocal |
| vocal_mixed_boost | Vocal | vocal | vocal | 1 | 2:10-2:50 | bright boost pop, clean breakbeat, light vocal |
| vocal_italian_soft | Vocal | vocal | vocal | 1 | 2:45-3:35 | Italian soft pop, lofi bossa, gentle vocal |

## Tracks

| # | Title | Mode | Mood | Vocal | Language | Target Duration | Energy | Attention |
| ---: | --- | --- | --- | --- | --- | --- | ---: | ---: |
| 001 | Paper Lantern Desk | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 002 | Margin Garden | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 003 | Quiet Compile Room | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 004 | Library Rain Map | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 005 | Soft Cursor Glow | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 006 | Ink After Midnight | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 007 | Desk Orbit Theory | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 008 | Warm Refactor Lane | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 009 | Pencil Satellite | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 010 | Index Card Weather | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 011 | Lamp Beside Tabs | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 012 | Footnote Coffee | Study | focus | instrumental | none | 2:45-3:45 | 2 | 1 |
| 013 | Felt Page Atlas | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 014 | Pencil Snow Room | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 015 | Small Silence Index | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 016 | Slow Bookmark Light | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 017 | Window Grammar | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 018 | Plain Tea Proof | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 019 | Moonlit Appendix | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 020 | Quiet Theorem | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 021 | Soft Equation | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 022 | Desk Rain Sonata | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 023 | Noiseless Outline | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 024 | Blue Pencil Rest | Study | focus | instrumental | none | 3:00-4:00 | 1 | 1 |
| 025 | Soft Compile Avenue | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 026 | Velvet Keyboard Club | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 027 | Coffee Bureau | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 028 | Neon Notebook Draft | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 029 | Warm Tab Session | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 030 | Browser Soul Kitchen | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 031 | Gentle Merge Motel | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 032 | Low Battery Glow | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 033 | Side Quest Inbox | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 034 | Tender Spreadsheet | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 035 | Clipboard Moonwalk | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 036 | Modal Window Groove | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 037 | Sync Button Velvet | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 038 | Calendar Afterglow | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 039 | Chrome Mug Express | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 040 | Afternoon Terminal | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 041 | Metro Tabs | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 042 | Pastel Errand | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 043 | Signal Elevator | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 044 | Clean Desk Disco | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 045 | Soft Neon Lane | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 046 | Calendar Breeze | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 047 | Browser Arcade | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 048 | Plastic Folder Sunset | Work | flow | instrumental | none | 2:40-3:40 | 3 | 2 |
| 049 | Mug on Desk Parade | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 050 | Bookmark Swing | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 051 | Tiny Brass Lamp | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 052 | Cookie Static Radio | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 053 | Desk Pet Waltz | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 054 | Paper Moon Bureau | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 055 | Soft Shoe Notes | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 056 | Warm Shelf Club | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 057 | Postcard Stroll | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 058 | Velvet Stapler | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 059 | Pocket Gramophone | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 060 | Window Seat Swing | Room | cozy | instrumental | none | 2:45-3:50 | 2 | 2 |
| 061 | Click Sprint Avenue | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 062 | Clean Break Notebook | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 063 | Inbox Skater | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 064 | Fast Tea Method | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 065 | Task Runner Radio | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 066 | Window Dash | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 067 | Lightweight Rush | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 068 | Pocket Momentum | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 069 | Keyboard Roller | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 070 | Tiny Deadline Glide | Motion | motion | instrumental | none | 2:15-3:20 | 4 | 2 |
| 071 | Midnight Build Room | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 072 | Glass Cursor | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 073 | Dark Mode Tea | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 074 | Satellite Notes | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 075 | Blue Hour Merge | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 076 | Quiet Server | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 077 | Late Window | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 078 | Noir Debug | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 079 | Moon Cache | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 080 | Terminal Snowfall | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 081 | Silent Commit | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 082 | Deep Desk Signal | Night | night | instrumental | none | 3:00-4:10 | 2 | 1 |
| 083 | Teacup Pause Room | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 084 | Blank Page Rest | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 085 | Window Breath | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 086 | Slow Blanket | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 087 | Little Porch Light | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 088 | Breathing Bookmark | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 089 | Half Closed Notebook | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 090 | Rainy Desk Reset | Reset | reset | instrumental | none | 3:00-4:30 | 1 | 1 |
| 091 | Deadline Star Engine | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 092 | Tiny Blade Runner | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 093 | Pink Armor Sprint | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 094 | Clean Riff Sprint | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 095 | Fast Compile | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 096 | Signal Dash | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 097 | Angle Bracket | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 098 | Bright Refactor | Boost | spark | instrumental | none | 1:45-2:45 | 5 | 3 |
| 099 | Stay a Little | Vocal | vocal | vocal | English | 2:40-3:30 | 2 | 2 |
| 100 | One More Tab | Vocal | vocal | vocal | English | 2:35-3:25 | 3 | 2 |
| 101 | Same Room | Vocal | vocal | vocal | English | 2:50-3:40 | 2 | 2 |
| 102 | Softly On | Vocal | vocal | vocal | English | 2:40-3:30 | 2 | 2 |
| 103 | 小灯还亮着 | Vocal | vocal | vocal | Chinese | 2:45-3:40 | 2 | 2 |
| 104 | 再写一点点 | Vocal | vocal | vocal | Chinese | 2:40-3:30 | 2 | 2 |
| 105 | 夜里有电台 | Vocal | vocal | vocal | Chinese | 3:00-3:50 | 2 | 2 |
| 106 | 今天也可以 | Vocal | vocal | vocal | Chinese | 2:35-3:25 | 3 | 2 |
| 107 | 灯りのそばで | Vocal | vocal | vocal | Japanese | 2:45-3:35 | 2 | 2 |
| 108 | もう少しだけ | Vocal | vocal | vocal | Japanese | 2:40-3:30 | 2 | 2 |
| 109 | 窓辺のリズム | Vocal | vocal | vocal | Japanese | 2:35-3:25 | 3 | 2 |
| 110 | 작은 불빛 | Vocal | vocal | vocal | Korean | 2:45-3:35 | 2 | 2 |
| 111 | 한 줄 더 | Vocal | vocal | vocal | Korean | 2:35-3:25 | 3 | 2 |
| 112 | Luz de Mesa | Vocal | vocal | vocal | Spanish | 2:45-3:35 | 2 | 2 |
| 113 | Un Poco Más | Vocal | vocal | vocal | Spanish | 2:35-3:25 | 3 | 2 |
| 114 | Petite Lumière | Vocal | vocal | vocal | French | 2:45-3:35 | 2 | 2 |
| 115 | Encore Une Ligne | Vocal | vocal | vocal | French | 2:35-3:25 | 3 | 2 |
| 116 | Room Radio | Vocal | vocal | vocal | English + Chinese | 2:45-3:35 | 2 | 2 |
| 117 | Daijoubu Little Star | Vocal | vocal | vocal | English + Japanese | 2:45-3:35 | 2 | 2 |
| 118 | Despacio Glow | Vocal | vocal | vocal | English + Spanish | 2:35-3:25 | 3 | 2 |
| 119 | Bonjour 작은 별 | Vocal | vocal | vocal | French + Korean | 2:45-3:35 | 2 | 2 |
| 120 | Slow Blanket | Vocal | vocal | vocal | English | 3:00-4:00 | 1 | 1 |
| 121 | Quiet Proof | Vocal | vocal | vocal | English | 3:00-3:50 | 1 | 1 |
| 122 | 慢慢落地 | Vocal | vocal | vocal | Chinese | 3:00-4:00 | 1 | 1 |
| 123 | 静かな帰り道 | Vocal | vocal | vocal | Japanese | 3:00-4:00 | 1 | 1 |
| 124 | Descansa Aquí | Vocal | vocal | vocal | Spanish | 3:00-4:00 | 1 | 1 |
| 125 | Small Fire | Vocal | vocal | vocal | English | 2:10-2:50 | 4 | 3 |
| 126 | Vamos Go | Vocal | vocal | vocal | English + Spanish | 2:10-2:50 | 4 | 3 |
| 127 | Piccola Luce | Vocal | vocal | vocal | Italian | 2:45-3:35 | 2 | 2 |
| 128 | Hallo Soft Signal | Vocal | vocal | vocal | English + German | 2:45-3:35 | 2 | 2 |
