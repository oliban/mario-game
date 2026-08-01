#!/bin/zsh
# Paint a screen-filling block of ONE tile char into a real level and capture it,
# so a repeat can be judged as a RUN rather than as a single tile on a contact
# sheet. A tile that looks fine in isolation can wallpaper badly across 30
# columns, and that is invisible on a sheet.
#
#   tools/rig.sh 1-2 '#' shots/rig-ground.png     the underground floor
#   tools/rig.sh 1-4 L   shots/rig-lava.png       a full lava lake
#   tools/rig.sh 1-1 S   shots/rig-stair.png      staircase stone
#
# usage: rig.sh <level> <tile-char> <out.png>
cd "$(dirname "$0")/.." || exit 1
node tools/shot.mjs --out "$3" --script "
await g.loadLevel('$1');
const w = g.world;
const code = '$2'.charCodeAt(0) & 0x7f;
if (!w.recByCode[code]) w._makeRec(code);
for (let y = 3; y < w.h; y++) for (let x = 10; x < 40; x++) w.map[y * w.w + x] = code;
g.teleport(22, 2);
g.tick(2);
"
