# ROM diff audit (rom-diff)

Audit in progress. Findings are appended as they are proved.

Method note: `src/data/levels/*.js` was checked for drift first — the eight
`smb-gen-world*.mjs` were re-run into a scratch copy of the tree and every one of
the 33 generated modules came back byte-identical, and `smb-build.mjs --unhandled`
reports nothing dropped across all 34 areas. So the level *data* is in sync with
the builder; anything wrong there has to be wrong in the builder's reading of the
disassembly, not stale output.

---

## Finding 1 — a defeated Lakitu never comes back (we lose the reappearance timer entirely)

**What the ROM does.** `LakituAndSpinyHandler` (asm:8275-8306) runs off the enemy
frenzy buffer. Every frame that a live Lakitu is in its normal state,
`MoveLakitu`'s `Fr12S` branch (asm:9979-9981) re-stamps the Spiny identifier into
`EnemyFrenzyBuffer`, which is what keeps the handler alive. The handler gates
itself on `FrenzyEnemyTimer`, which it reloads with `$80` (asm:8280-8281), so it
does one unit of work every 128 frames. That unit is: scan the five enemy slots
for a Lakitu; if one is found, throw a spiny (`CreateSpiny`, asm:8310); if none is
found, `inc LakituReappearTimer`, and once that counter reaches `$07`
(asm:8288-8291) take a free slot, write a fresh Lakitu into it, `SetupLakitu`, and
`PutAtRightExtent` with `#$20` — i.e. a new Lakitu enters from the right edge of
the screen at y=32.

The buffer is not cleared when the stomped Lakitu is erased. `MoveLakitu` takes
the `d5`-set branch straight to `MoveD_EnemyVertically` (asm:9968-9971) while the
defeated Lakitu falls, so the `sta EnemyFrenzyBuffer` at asm:9974 (the "Lakitu is
leaving" path) is never reached, and `EraseEnemyObject` does not touch the buffer
either — only Bowser's flame init (asm:8613), `KillAllEnemies` (asm:10147),
`BowserControl` (asm:10153) and `EndFrenzy` do. Net effect, and it is the
behaviour everyone remembers from 4-1: killing Lakitu buys you roughly
7 x 128 = 896 frames (about 15 s) of peace and then he is back.

**What we do.** `src/game/entities/lakitu.js` has no reappearance path at all. A
stomp calls `enemyDie()` and the entity is gone for the rest of the level (unless
the level data happens to hold another `lakitu` record further along — 4-1 has
three, 6-1 two, 8-2 one, and each is a one-shot).

**Measured** (probe on 4-1, teleport to column 28, kill the active Lakitu, then
idle):

```
before kill:        3 lakitu entities in the level (1 active, 2 not yet reached)
after kill:         0 active
frames until a lakitu is active again, over 1400 frames of waiting:  none
```

The ROM's answer to that last line is ~896. In 8-2 — one Lakitu record for the
whole level — this means a single stomp permanently disarms an enemy the original
never lets you be rid of.

**Confidence: high** for the ROM side (the code path is unambiguous) and for our
side (measured). **Not verified:** the exact 896-frame figure against real
hardware; I derived it from the `$80` timer reload times the `$07` threshold, and
the first increment happens on the handler's first post-death run, so the true
window is between 768 and 896 frames.

**Related deviation, same file, unproven as a *bug* but worth stating:** our
Lakitu gives up the chase when the player outruns him by 112 px for 70 frames
(`lakitu.js:126-127`, `_flee`). `PlayerLakituDiff` (asm:10002-10062) has no such
rule — it clamps the tracked difference to `$3c` and picks the chase adjuster
from `LakituDiffAdj` (`$15/$30/$40`, asm:9965-9966) according to whether the
player is still, walking or running, which is precisely a mechanism for *not*
being outrun. We also do not implement `CreateSpiny`'s suppression when the
player is above y=`$2c` (asm:8311-8313).

---

## Finding 2 — the post-hit invincibility window is a little over half the original's

**What the ROM does.** `ForceInjury` (asm:11402-11419) does three things when a big
player is hit: drops `PlayerStatus` to small, sets `InjuryTimer` to `$08`, and
goes through `SetPRout` — which sets `GameEngineSubroutine` to `$0a`
(`PlayerInjuryBlink`) and `TimerControl` to `$ff`.

Those two clocks stack, and neither runs at one unit per frame:

* `TimerControl` is the master halt. While it is nonzero the NMI's `DecTimers`
  block (asm:786-796) decrements *it* and nothing else. `PlayerInjuryBlink`
  (asm:5744-5751) freezes the player entirely while `TimerControl >= $f0`
  (15 frames), then hands control back, and clears the halt at `TimerControl ==
  $c8` — so `$ff` down to `$c8` is **55 frames** during which `InjuryTimer` has
  not moved at all.
* `InjuryTimer` lives at `$079e`. `Timers` is `$0780`, so its offset is `$1e` =
  30, which is inside the **interval** timer band `$15-$23` — those decrement
  only on the frame `IntervalTimerControl` underflows, i.e. once every 21 frames
  (asm:788-793). `$08` interval ticks is therefore **~168 frames**.

Total protection from the moment of the hit: about **223 frames, ~3.7 s**
(`InjuryTimer` is what `PlayerEnemyCollision` checks at asm:11390 and again at
asm:11402-11403, so nothing can touch the player for the whole of it).

**What we do.** `player.js:1568` enters the `shrinking` state (intangible for
`P.growFrames` = 30 frames), and only when that animation ends does
`_updateChangeSize` (player.js:1859-1860) set `invulnFrames = P.invulnFrames`,
which is **90** (player.js:224). One unit per frame (player.js:899).

**Measured** (probe: 1-1 with entities cleared, player made big, `hurt()` called,
then counting frames until `canBeHurt()` goes true again):

```
frames of invulnerability after a hit:   126     ROM: ~223
  of which the shrink animation:          36     ROM: 55 (TimerControl $ff -> $c8)
```

That is 2.1 s against 3.7 s. It matters most in the places the original uses the
window as a mercy: walking out of a hammer bro's rain, or being clipped in a
corridor with a second enemy right behind the first.

**Confidence: high.** Both halves are directly measured/derived. **Not verified:**
the exact interval-timer phase at the moment of the hit, which makes the ROM
figure a range of roughly 203-223 frames rather than a single number; and I did
not check whether anything else in the ROM shortens the window early.

---

## Finding 3 — star invincibility is 660 frames; the ROM's is ~735

**What the ROM does.** The power-up grab handler sets `StarInvincibleTimer` to
`#$23` (asm:11248-11249) = 35. `StarInvincibleTimer` is `$079f`, offset `$1f` =
31 off `Timers` — again inside the interval band, so it sheds one unit every 21
frames (asm:788-793). 35 x 21 = **735 frames, ~12.2 s**. The player is invincible
for exactly as long as the timer is nonzero (asm:9801, 11228, 11321).

**What we do.** `P.starFrames` = **660** (player.js:225), decremented once per
frame in `_updateStar` (player.js:1836).

**Measured** (probe: `giveStar()`, then count frames until `starPower` goes false):

```
star duration:  660 frames (11.0 s)      ROM: 735 frames (~12.2 s)
```

**Confidence: high** on both sides — the ROM value follows from the same
frame-vs-interval timer split proved in Finding 2, and 660 is measured. It is a
10% shortfall; small, but it is the kind of thing the star run in 8-3 is timed
against.

**Adjacent, same mechanism, smaller:** the grow animation. `PlayerChangeSize`
(asm:5732-5740) starts the size change at `TimerControl == $f8` and calls
`DonePlayerTask` at `$c4`, so a mushroom freezes the game for **59 frames**
(`$ff` -> `$c4`). We measure **34** (probe: `powerUp('mushroom')`, frames until
`state` returns to `normal`), from `P.growFrames` = 30 (player.js:223).

---

## Finding 4 — podoboos leap a third as high as the original's, and on a metronome

**What the ROM does.** `MovePodoboo` (asm:9187-9199) relaunches a podoboo when its
`EnemyIntervalTimer` expires. On each launch it:

* calls `InitPodoboo` (asm:8144-8152), which does **not** use the enemy record's
  row at all — it hard-sets `Enemy_Y_HighPos` and `Enemy_Y_Position` to `$02`,
  i.e. a fixed point 18 px below the bottom of the screen, whatever column the
  record sat on;
* seeds `Enemy_Y_MoveForce` from the LSFR with d7 forced (so 128-255 of 256);
* sets `EnemyIntervalTimer` to `(LSFR & $0f) | $06` — 6 to 15 units. That timer
  is `$0796`, offset `$16` off `Timers`, so it is an **interval** timer at 21
  frames a unit: **126 to 315 frames**, re-rolled every leap;
* sets `Enemy_Y_Speed` to `$f9` = **-7 px/frame**.

Gravity then comes from `MoveJ_EnemyVertically` (asm:7642-7648): `ldy #$1c`, so
`ImposeGravity` (asm:7704-7735) adds **28/256 = 0.109 px/frame²** to the speed,
with a downward cap of 3 px/frame.

Simulating that loop exactly (integer speed, 8-bit move force, the `$03` clamp)
over the three possible starting move forces gives:

```
rise            196 - 227 px   (12.3 - 14.2 tiles)
frames to peak  55 - 60
total flight    140 - 154 frames
peak screen y   31 - 62        (i.e. it very nearly reaches the top of the screen)
```

**What we do.** `podoboo.js:74-76`: `power` 6.4, `gravity` 0.25, `period` 128, and
the launch is scheduled so the cycle is exactly `period` frames
(`podoboo.js:91-92`). Home is the entity's own y from the level record.

**Measured** (probe on 8-4, the podoboo at column 279, 900 frames):

```
home y                    208
peak y                    129.25
rise                       78.75 px  (4.9 tiles)      ROM: 196-227 px
frames between launches   127, 127                    ROM: 126-315, re-rolled each leap
```

So ours clears about five tiles on a fixed 127-frame beat; the original's clears
twelve to fourteen and never twice at the same interval. In the castles this is
the difference between a hazard you have to wait out and one you can walk past
by counting, and it changes which parts of the room a podoboo threatens at all.

**Confidence: high.** Our side is measured; the ROM side is a direct simulation of
`ImposeGravity` with the constants from `InitPodoboo`/`MoveJ_EnemyVertically`.
**Not verified:** how the fixed "18 px below the screen" spawn point maps onto our
geometry, since our floor sits one row lower than SMB's — I compared rise
distances rather than absolute y. I also did not check whether a podoboo whose
interval timer expires mid-flight visibly teleports in the original (the code says
it does).

---

## Finding 5 — the player's fireball is a quarter slower than the ROM's, and hops lower

**What the ROM does.** `FireballObjCore` (asm:6327-6375) sets a new fireball's
horizontal speed from `FireballXSpdData` (asm:6324): `$40` right, `$c0` left.
`MoveObjectHorizontally` (asm:7541-7566) splits that byte into a whole-pixel high
nybble and a 1/16-pixel low nybble, so `$40` is exactly **4.0 px/frame** (the same
scale that makes the bullet bill's `$18` = 1.5, which `cannons.js:40` already
uses). It also sets `Fireball_Y_Speed` to `$04` and then runs `ImposeGravity`
with `$00 = $50` and `$02 = $03`: **gravity 80/256 = 0.3125 px/frame², maximum
fall 3 px/frame**. `FireballBGCollision` (asm:12726-12744) gives the bounce:
`lda #$fd / sta Fireball_Y_Speed,x` = **-3 px/frame**, plus a snap of the y
coordinate to a multiple of 8.

**What we do** (`physics.js:106-108`, `physics.js:117-122`):

```
                ROM                    ours
horizontal      4.0  px/frame          3.0
gravity         0.3125 px/frame^2      0.28125
bounce          -3.0 px/frame          -2.5
max fall        3.0  px/frame          4.5
initial vy      +4 (clamped to 3)      +1.0
```

**Measured** (probe on 1-1, entities cleared, fire power, one fireball thrown,
per-frame deltas):

```
horizontal step per frame:   3.000  (x6)              ROM: 4.000
vertical step after bounce:  -2.219 rising            ROM: -3
frames between bounces:      22                       ROM: ~19
```

Combining those: our fireball covers about **66 px per hop**; the original's
covers about **78**, and reaches any given target ~25% sooner. Against a hammer
bro or a bowser you are trading fireballs with, that is the whole difference.

**Confidence: high** — every number on both sides is either measured or read
straight off a constant plus the `MoveObjectHorizontally` scaling, which the repo
already relies on elsewhere. **Not verified:** the `and #$f8` landing snap, and
whether `FireballBGCollision`'s below-only test means the original's fireball
passes through vertical walls (it only ever probes the tile *under* the ball);
I did not test our wall behaviour against that.

---

## Finding 6 (minor, but proven) — falling enemies accelerate at 0.1875, the ROM's at 0.238

**What the ROM does.** A walking enemy that steps off a ledge has d6 set in
`Enemy_State`, which sends `MoveNormalEnemy` (asm:9294-9311) to `FallE` and thence
to `MoveD_EnemyVertically` (asm:7599-7607). That loads `ldy #$3d` — 61 — as the
movement amount and falls through `SetHiMax` to a maximum speed of `$03`. Through
`ImposeGravity`'s 1/256 accumulator that is **61/256 = 0.2383 px/frame², terminal
3 px/frame**. (Only a spiny's egg, state `$05`, takes the softer `$20` = 0.125.)

**What we do.** `PHYS.enemyGravity` = **0.1875** (48/256), `enemyMaxFall` = 3.0
(`physics.js:101-102`).

**Measured** (probe: a goomba spawned over a carved-out void in 1-1, per-frame y
deltas):

```
0.1875, 0.375, 0.5625, ... 2.8125, 3, 3, 3 ...   terminal reached at frame 16
ROM: 0.2383, 0.4766, ...                          terminal reached at frame ~13
```

Terminal velocity matches, so long drops are identical; only the first ~15 frames
differ. Over a four-tile drop it costs about 3 frames and ~10 px of horizontal
travel — enough to move where an enemy lands off a staircase, not enough to change
anything structural. Listing it because it is a single wrong constant with a clean
ROM source.

**Confidence: high.** Measured on our side, single constant on the ROM's.

---

## Unproven suspicions

* **Lakitu's flee rule** (detailed at the end of Finding 1): we let the player
  outrun him; `PlayerLakituDiff` appears to make that impossible in the original.
  I could not measure the ROM's chase, so I am not calling it a finding.
* **Fireball wall collision**: `FireballBGCollision` (asm:12726-12731) probes only
  the tile *under* the fireball and `MoveObjectHorizontally` does no collision at
  all, which reads as "a ROM fireball does not explode on a vertical wall". That
  contradicts my memory of the game, so I did not chase it; if it is true and we
  explode on walls, fireball range past a pipe differs.
* **`CreateSpiny`'s ceiling check** (asm:8311-8313): the original throws no spiny
  while the player is above y=`$2c`. We have no equivalent. Trivial to add,
  impossible to observe without a Lakitu level with high ground.

## What I did not get to

Bowser's movement/hammer/flame timing (the file is already annotated against
`BowserControl` and looked right on a read, but I did not measure it), blooper and
cheep-cheep swimming, the vine, jumpsprings, and the whole of the block/coin
scoring path — `stompchain`, `stomptimer`, `multicoin` and `groupspawn` agents were
working those areas this session.
