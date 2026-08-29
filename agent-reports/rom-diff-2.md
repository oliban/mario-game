# ROM diff audit, second pass (rom-diff-2)

**Audit in progress.** Findings are appended as soon as they are proved. Scope is
what `rom-diff.md` did not reach: the three unproven suspicions it left, plus
Bowser, blooper/cheep-cheep swimming, the vine, jumpsprings, and the block/coin
scoring path.

Nothing already fixed this session is re-audited here.

---

## Finding 1 — Bowser's flame homes in on the player; the ROM's picks one of three fixed lanes and commits

**What the ROM does.** A flame is created by `SpawnFromMouth` (asm:8592-8613). It is
placed 14 px left of Bowser and 8 px below his y. Then it takes two LSFR bits and
uses them to index `FlameYPosData` (asm:8548-8549) — a four-entry table of
**absolute screen heights**, one of which is repeated, so the target is 144 px half
the time and 128 or 112 a quarter each. It compares that target with its own
current y once, at spawn, and stores `+1` or `-1` in `Enemy_Y_MoveForce` from the
two-entry `FlameYMFAdderData` (asm:8551-8552, 8606-8611).

`ProcBowserFlame` (asm:10342-10348) then adds that ±1 to the flame's y every frame
until y is exactly equal to the table value, and stops. **The player's position is
never consulted, at spawn or after.** The flame drifts at 1 px/frame into one of
three lanes and then flies flat forever.

**What we do.** `bowser.js:84-93`: for the first `TRACK_FRAMES` = 26 frames the
flame reads `playerOf(world).centerY` every frame and steers toward it at up to
1.1 px/frame, then freezes its vy. It is a homing missile with a 26-frame fuse.

**Measured** (8-4, player teleported to tile row 2 — well above every flame lane —
and held there, first flame tracked frame by frame):

```
player centerY                     24
flame spawn y                     138.9
flame vy while tracking            -1.1  (constant, toward the player)
flame y when tracking stopped     111.4   after 26 frames, 27.5 px of climb
```

The ROM flame would have gone to 144, 128 or 112 and ignored the player entirely.
Ours climbed *because* the player was up there. This changes how the fight is
fought: in the original you survive by learning three lanes and standing in the
gap; here the flame follows you for the first 26 frames, so standing still is
punished and a late jump is rewarded.

**Confidence: high.** ROM side is an unambiguous read of two tiny tables plus the
one-line update in `ProcBowserFlame`; our side is measured. **Not verified:** how
the ROM's absolute y values 112/128/144 map onto our level geometry (our floor sits
one row lower), so I am claiming the *homing*, not the lane heights.

---

## Finding 2 — Bowser's flame travels 1.6x too fast (and our own comment says so)

**What the ROM does.** `ProcBowserFlame` (asm:10327-10338) subtracts a movement
force of `$40` from the flame's subpixel accumulator each frame — `$60` when
`SecondaryHardMode` is set — and then subtracts a flat `$01` from the pixel
coordinate with the borrow. That is **1 + 64/256 = 1.25 px/frame** normally and
**1 + 96/256 = 1.375 px/frame** in secondary hard mode (which `SetSecHard`,
asm:2703, turns on from 5-3 onward, so every Bowser from 6-4 up is the fast one).
The flame always moves **left**; there is no facing.

**What we do.** `bowser.js:69`: `hardPick(world, 2.0, 2.2)`. The comment directly
above it (`bowser.js:65-68`) derives 1.25 and 1.375 correctly from the same
disassembly lines — and then the constant on the next line is a different number.

**Measured** (8-4, first flame, per-frame vx):

```
flame vx      -2.2 px/frame        ROM (8-4 is secondary hard): -1.375
```

That is **60% too fast**. Combined with Finding 1 it is the single largest change
to the 8-4 fight: a flame that both chases you vertically and closes 1.6x quicker
leaves far less reaction time than the original's.

**Confidence: high.** Both numbers are exact — ours measured, the ROM's read off
two immediate operands on the same scale the repo already uses for the bullet bill
(`cannons.js:40`, `$18` = 1.5).

---

## Finding 3 — Bowser throws one hammer every ~2 seconds; the ROM throws a volley on every hop

**What the ROM does.** In `RunBowser`, hammers are gated on `HammerChk`
(asm:10215-10224): they are spawned **only while `EnemyFrameTimer` is zero**, which
is exactly Bowser's airborne phase, and within that phase `SpawnHammerObj` is
called on **every fourth frame** (`lda FrameCounter / and #%00000011`), in worlds 6
and up. The airborne phase runs from the frame the timer expires until his y comes
back down to `$80` (asm:10225-10227). With an initial speed of `$fe` = -2 px/frame
and `MoveEnemySlowVert`'s gravity of `$0f`/256 (asm:7635-7637), that arc is about
**68 frames**, so there are roughly **17 spawn attempts per hop**.

**What we do.** `bowser.js:247-258`: a single `hammerPeriod` = 84 frame counter,
one hammer per expiry, suppressed while breathing.

**Measured** (8-4, 900 frames, every hammer entity counted as it appeared):

```
hammers in 900 frames        8
spawn frames                 19, 137, 255, 373, 491, 575, 693, 811
intervals                    118, 118, 118, 118, 84, 118, 118
```

One hammer every ~118 frames (84 plus the 34-frame breath that keeps interrupting
it), evenly spaced. The original's are clustered — nothing at all while he hovers,
then a burst as he leaves the ground. That burst-and-lull rhythm is what makes the
6-4/7-4/8-4 approach a timing problem rather than a dodging one.

**Confidence: high** for the gate and the every-fourth-frame rate (both are single
unambiguous branches) and for our measured cadence. **Not verified:** how many of
the ~17 attempts actually produce a hammer. `SpawnHammerObj` (asm:6873-6896) picks
a misc slot from the LSFR and bails if that slot is occupied, so the realised count
is lower than 17 and depends on how long hammers live; I did not simulate the slot
contention. The claim I am making is *volley vs metronome*, not a hammer count.

---

## Finding 4 — Bowser walks smoothly at 0.35 px/frame over a fixed 34 px; the ROM steps 1 px every fourth frame over a range it re-rolls

**What the ROM does.** `GetPRCmp`/`GetDToO` (asm:10186-10214) move Bowser's x **only
on every fourth frame** (`lda FrameCounter / and #%00000011 / bne HammerChk`), by
`BowserMovementSpeed`. `InitBowser` (asm:8518-8521) seeds that speed at `$02`, so
his first swing is 2 px per 4 frames = **0.5 px/frame**; once he reaches the edge of
his range the speed is rewritten to `$01`/`$ff` (asm:10204-10214), i.e.
**0.25 px/frame** for the rest of the fight.

The range itself is not a constant. Whenever his x is exactly back at
`BowserOrigXPos`, he draws two LSFR bits and reloads `MaxRangeFromOrigin` from
`PRandomRange` (asm:10131-10132, 10189-10196): **17, 33, 49 or 65 px**. So his
patrol half-width changes every time he crosses his starting point.

There is also a chase override we have no equivalent for: `B_FaceP`
(asm:10172-10185) checks `PlayerEnemyDiff` while his frame timer is running, and if
Bowser is to the **left** of the player he snaps to moving right at `$02`, resets his
frame timer to `$20`, **and resets `BowserFireBreathTimer` to `$20`** — i.e. getting
behind Bowser makes him turn, charge, and breathe fire 32 frames later regardless
of where the flame cadence was.

**What we do.** `bowser.js:147` `speed` = 0.35 applied every frame, `bowser.js:146`
`range` = 34 fixed, direction flipped purely by the range test.

**Measured** (8-4, 900 frames, histogram of per-frame x deltas and the extremes):

```
per-frame dx      -0.35 (271 frames), +0.35 (390), 0 (238, breathing/hop)
                  ROM: 0 on three frames in four, then +-1 on the fourth
x range           4685.75 .. 4754    home 4720   -> +-34.25 px, every cycle
                  ROM: +-17, +-33, +-49 or +-65, re-rolled at the origin
mean speed        0.35 px/frame      ROM: 0.25 px/frame after the first swing
```

**Confidence: high.** Our numbers are measured; the ROM's are three immediate
operands and a four-byte table. **Not verified:** the `B_FaceP` chase branch — I
read it but did not build a scenario that forces it, so I am reporting it as part
of this finding's ROM description rather than as its own measured claim.

---

## Finding 5 — Bowser hops 47 px on a fixed 132-frame beat; the ROM hops 34 px on a randomised one

**What the ROM does.** Bowser has no gravity while his frame timer runs — `MakeBJump`
(asm:10234-10239) does nothing until the timer reaches **1**, at which point it
decrements his y by one, zeroes his movement accumulator via `InitVStf`
(asm:8227) and sets `Enemy_Y_Speed` to `$fe` = **-2 px/frame**. On the next frame the
timer is 0, so `HammerChk` falls through to `MoveEnemySlowVert` (asm:7635-7637):
movement amount `$0f` = **15/256 = 0.0586 px/frame²**, maximum speed **2 px/frame**.
Rise from 2 px/frame at that acceleration is **2²/(2 x 0.0586) = 34 px** over ~34
frames, and the fall back takes about as long. When his y is back at or below `$80`
he reloads the frame timer from `PRandomRange` — **17, 33, 49 or 65 frames** of hover
(asm:10225-10232).

So the ROM cycle is: hover 17-65 frames, then a slow floaty 34 px arc lasting ~68
frames. Period 85-133 frames, **re-rolled every hop**, and the whole hop is spent
in the air throwing hammers.

**What we do.** `bowser.js:42` `HOP_RISE` = 49 px, solved against the shared
`enemyGravity()` (61/256 = 0.238) into an impulse of
`sqrt(2 x 0.238 x 49)` = **4.83 px/frame**, on a fixed `hopPeriod` of 132 frames
(`bowser.js:154`), and he is grounded between hops rather than hovering.

**Measured** (8-4, 900 frames, y extremes):

```
y range        81.39 .. 128     -> rise 46.6 px      ROM: ~34 px
hop period     132 frames, fixed                     ROM: 85-133, re-rolled
impulse        4.83 px/frame                         ROM: 2.0 px/frame
gravity        0.238 px/frame^2                      ROM: 0.0586, capped at 2 px/frame
```

Ours is a short sharp jump; the original's is a slow high float that takes twice as
long to come down. Since the hammer volley is tied to that airborne window
(Finding 3), the two errors compound.

**Confidence: high** on every number; ours measured, the ROM's from the `$fe`
impulse and `MoveEnemySlowVert`'s two constants through the `ImposeGravity`
1/256 accumulator the repo already models. **Not verified:** whether the ROM
Bowser's y ever interacts with the bridge tiles — the code path I traced never
consults the background, so I treated the hop as pure kinematics.

---

## Finding 6 — the flame cadence is a constant 134 frames; the ROM's alternates between ~207 and ~80

**What the ROM does.** `ChkFireB` (asm:10245-10258) toggles Bowser's mouth bit each
time `BowserFireBreathTimer` (a **frame** timer — `$0790`, offset `$10` off `Timers`,
inside the per-frame band `$00-$14`, asm:786-796) expires. Opening the mouth sets
the timer to `$20` = 32 and spawns nothing; closing it spawns the flame and reloads
the timer from `SetFlameTimer` (asm:10315-10321), which walks an eight-entry
`FlameTimerData` table (asm:10312-10313) holding five long values (`$bf` = 191) and
three short ones (`$40` = 64) in a fixed order, minus `$10` in secondary hard mode.

So the gap between successive flames is table value + 32:

```
normal (worlds 1-5 Bowser):  223, 96, 223, 223, 223, 96, 96, 223  (cycling)
secondary hard (6-4 on):     207, 80, 207, 207, 207, 80, 80, 207
```

Three long breaths, a short one, three long, three short — never the same twice in
a row for long, which is what makes the pattern something you read rather than count.

**What we do.** `bowser.js:159` `firePeriod` = `hardPick(world, 116, 100)` plus the
34-frame breath animation (`bowser.js:226-236`), so the interval is a flat 150
frames normally and **134 in hard mode**.

**Measured** (8-4 = secondary hard, 900 frames, frame index of each flame spawn):

```
flame spawn frames   62, 196, 464, 598, 732
intervals            134, 268, 134, 134         (268 = one flame lost offscreen)
ROM                  207, 80, 207, 207, 207, 80, 80, 207
```

**Confidence: high** on the mechanism and the table shape, and on our measured 134.
**Not verified:** the phase the ROM starts on — `InitBowser` (asm:8513) seeds the
timer at `$df` = 223, so the first breath is late, and `BowserFlameTimerCtrl` is not
reset per fight, meaning the *starting index* into the table carries over from
earlier flames in the level. I also did not chase the 268-frame gap in our own run;
it is one flame that never entered `world.entities` within camera range, not a
cadence change, since the surrounding intervals are exactly 134.

---

## Finding 7 — the blooper is a homing missile; the ROM's is a two-axis machine that only ever swims *up*

**What the ROM does.** `MoveBloober`/`BlooberSwim`/`ProcSwimmingB` (asm:9468-9574)
run a four-state counter, and the vertical and horizontal halves are the *same
variable*:

* States 0 and 1 are the stroke. On every eighth frame (`lda FrameCounter /
  and #%00000111`) `Enemy_Y_MoveForce` is incremented (asm:9532-9539) until it
  reaches 2, then decremented (asm:9545-9551) until it reaches 0. Every frame,
  `BlooberSwim` **subtracts** that force from the blooper's y (asm:9489-9494) — it
  is always a rise, never a dive — and adds/subtracts `BlooperMoveSpeed` to its x
  (asm:9498-9514). `BlooperMoveSpeed` is written from the *same* byte
  (asm:9536, 9549), so the stroke is a square profile 1, 2, 2, 1 px/frame on both
  axes: **exactly 32 px of rise and 32 px of drift over 32 frames.**
* State 2 is the sink. `Floatdown` (asm:9560-9565) increments y by 1 on **every
  other frame** — a flat **0.5 px/frame** — and touches x not at all, so
  `BlooperMoveSpeed` is still the 0 it was left at: **the ROM blooper does not move
  horizontally while it sinks.**
* The sink runs for `EnemyIntervalTimer` = 2 units. That timer is `$0796`, offset
  `$16` off `Timers` — an *interval* timer at 21 frames a unit (asm:788-793) — so
  42 frames minimum, and then `ChkNearPlayer` (asm:9567-9574) keeps it sinking
  until its y plus 16 reaches the player's y, i.e. until it is level with him.
  Only then does it stroke again.

**What we do.** `blooper.js:82-100` builds a normalised 2-D vector toward the
player (`dx` toward `chaseDir`, `dy = player.centerY - centerY - 14`), scales it by
`power` = 1.55, and coasts it with a 0.962 decay for 26 frames, then drifts for 34
with a 0.93 horizontal decay and gravity 0.055 up to a terminal 0.85. So ours
accelerates diagonally, keeps drifting sideways while it sinks, and — if the player
is below it — thrusts *downward*.

**Measured** (2-2, first blooper, player pinned above it for 400 frames):

```
peak rise speed         1.976 px/frame, decaying smoothly to 0
                        ROM: a square 1, 2, 2, 1 over 32 frames
sink speed              0.85 px/frame max      ROM: 0.5 flat, 1 px every other frame
horizontal peak         1.55 px/frame          ROM: 2, but ONLY while stroking
horizontal while sinking  nonzero (0.93/frame decay)   ROM: exactly 0
stroke->stroke cycle    60 frames (26 + 34), fixed
                        ROM: 32 + at least 42, longer until level with the player
```

The stroke-and-stall silhouette is the whole character of the enemy: the original's
blooper hangs above you, sinks straight down onto your head and cannot follow you
sideways while it does it, which is why swimming *under* one works. Ours tracks
horizontally throughout the sink and closes on the diagonal.

**Confidence: high.** ROM side is a close read of three short routines with no
ambiguous branches; our side is measured. **Not verified:** the `Enemy_State`
d5 defeated path, and the LSFR re-aim odds — `blooper.js:74-80` already implements
the 1/64 vs 1/4 `BlooberBitmasks` rule and I did not re-measure it, since it is
correct on a read.

---

## Finding 8 — swimming cheep-cheeps are up to 2.5x too fast and bob half as far, three times as often

**What the ROM does.** `MoveSwimmingCheepCheep` (asm:9595-9661).

*Horizontal:* `SwimCCXMoveData` (asm:9591-9592) is indexed by enemy id minus `$0a`
— grey cheep `$0a` gets `$40`, red cheep `$0b` gets `$80` (asm:603-604). That value
is subtracted from the subpixel force each frame with the borrow taken out of the
pixel coordinate, so it is **0.25 px/frame** for a grey and **0.5 px/frame** for a
red, always leftward (there is no facing — it is `sbc` throughout).

*Vertical:* the bob accumulates `$20` = **0.125 px/frame** (asm:9617-9645) and
`ChkSwimYPos` (asm:9646-9660) reverses it when the fish is **15 px** from its
original y. So the excursion is +-15 px and one full cycle is 4 x 15 / 0.125 =
**480 frames**, on a triangle wave. And it is gated: `cpx #$02 / bcc ExSwCC`
(asm:9619-9620) — a cheep in **enemy slot 0 or 1 does not bob at all** and swims
dead flat.

**What we do.** `cheep.js:68` `base` = 0.95 red / **0.62 grey**; `cheep.js:26-27`
`bob` = 8 px and `bobRate` = 0.045 rad/frame, applied as a **sine**
(`cheep.js:93`) — period 2 pi / 0.045 = **140 frames** — to every swimming cheep,
whatever slot it is in.

**Measured:**

```
2-3, the hand-placed grey cheep at column 144:
  per-frame dx      -0.620            ROM (grey, $40):  -0.25
  bob amplitude      8.0 px           ROM: 15 px
  bob period       ~140 frames        ROM: 480 frames, triangle not sine

2-2, cheeps arriving from the frenzy objects (3 of them, 600 frames):
  grey vx           -0.25   correct
  red  vx           -0.50   correct
  bob amplitude     ~7.3 px            ROM: 15 px (and 0 for the first two slots)
```

So the **frenzy path already carries the ROM's horizontal speeds** and only the
class defaults used by hand-placed records are wrong — which is exactly the two
grey cheeps in 2-3 and 7-3. The bob is wrong on every path.

**Confidence: high.** Every number here is measured or a single table byte.
**Not verified:** whether our entity ordering has any analogue of the ROM's enemy
slot index, so I am reporting the "slots 0-1 do not bob" rule as ROM behaviour
without claiming which of our cheeps it would map to.

---

## Finding 9 — SUSPICION SETTLED: Lakitu's chase law has the wrong *sign*, and our flee rule is unreachable

The first pass suspected `PlayerLakituDiff` (asm:10002-10062) made it impossible to
outrun Lakitu, and could not measure it. Both halves are now settled, and the
answer is more interesting than the suspicion.

**What the ROM does.** `MoveLakitu` calls `PlayerLakituDiff` every frame with the
three bytes of `LakituDiffAdj` (asm:9965-9966) — `$15`, `$30`, `$40` — in zero
page. The routine:

1. takes `|player x - lakitu x|` and **clamps it to `$3c` = 60 px** (asm:10012-10016);
2. picks an adjuster: index 0 if the player's x speed or the scroll is zero, 1 if
   he is moving, 2 if his speed is at least `$19` = 2.5 px/frame *and* the scroll is
   at least 2 (asm:10035-10047) — i.e. **Lakitu's top speed is a function of how
   fast the player is going**;
3. reduces that adjuster by `(clamped difference >> 2) + 1` (asm:10056-10061) — so
   **the further away he is, the SLOWER he moves**;
4. returns the result as `Enemy_X_Speed`, which `MoveObjectHorizontally`
   (asm:7541-7566) reads on the /16 scale.

There is one more thing, and it is not a typo in the disassembly: `Enemy_Y_Speed`
and `LakituMoveDirection` are **the same address, `$a0`** (asm:311, 471). So the
`lda Enemy_Y_Speed,x / bne SubDifAdj / ldy #$00` at asm:10053-10055 is really
reading the move *direction*: when Lakitu is heading **left** the adjuster is
forced back to `$15`, and only when he is heading **right** — the direction the
player runs — does he get the `$30`/`$40` band. He lunges forward and dawdles back.

Working the arithmetic out in px/frame:

```
player standing still  ($15 = 21):   (20 - d/4)/16  =  1.25 px/f touching him
                                                       0.31 px/f at 60 px away
player walking         ($30 = 48):   2.94 .. 2.00 px/f
player running         ($40 = 64):   3.94 .. 3.00 px/f
```

The player's own maximum run is `$28` = 2.5 px/frame, so a chasing Lakitu is
**always faster than a running player** — 3.0 px/frame at his slowest. The first
pass's suspicion was right: there is no way to outrun him, and there is no flee
branch anywhere in the routine.

**What we do.** `lakitu.js:122-125` is a damped spring: `vx += (target - x) *
0.0062`, `vx *= 0.966`, clamped to +-3.2, where `target = player.x + facing*22 +
player.vx*9`. Speed therefore **rises** with distance — the opposite of the ROM —
and does not depend on the player's speed at all.

**Measured** (4-1, player pinned motionless, Lakitu placed at four gaps, peak
closing speed over 90 frames):

```
gap      ours (peak px/frame)     ROM (player still)
16 px          0.345                    1.00
32 px          0.575                    0.75
60 px          2.185                    0.31
100 px         3.200 (at the cap)       0.31  (difference is clamped at 60)
```

At arm's length ours is a third of the original's speed; at 60 px it is **seven
times** the original's. In play that inverts the enemy: the ROM's Lakitu hovers
almost still while you stand and pounces when you commit to a run, and ours
sprints to close a gap and then goes limp when it is on top of you.

**The flee rule is a red herring.** `lakitu.js:130-136` gives up when the player is
112 px ahead for 70 frames. I could not make it fire:

```
running right at full speed for 660 frames:  gap never exceeded -12 px
                                             (Lakitu stayed ahead throughout)
player forcibly pinned 200 px ahead:         spring closed the gap in ~27 frames,
                                             passT never reached 70, never fled
```

`opts.leaveX`, the other route into `_flee`, is not set by any level in the repo
(it appears only at `lakitu.js:80` and `:130`). So the flee rule is effectively dead
code — a deviation on paper, no measurable effect. **The chase law is the real
finding; the flee rule is not.**

**Confidence: high** on the ROM arithmetic and on both measurements.
**Not verified:** the `$a0` address aliasing is read off two `=` lines in the
disassembly's symbol block, not observed running; if the disassembly's symbol
values are wrong there, the left/right asymmetry falls (the distance inversion and
the player-speed dependence do not — those are independent of it).

---

## Finding 10 — the vine grows six times too fast and is grabbable almost instantly

**What the ROM does.** `VineObjectHandler` (asm:6705-6754). The vine grows by one
pixel only on the frames where d1 of `FrameCounter` is set (`lsr / lsr / bcc
RunVSubs`, asm:6713-6720) — two frames in every four, so **0.5 px/frame**. It stops
at `VineHeightData` (asm:6702-6703): `$30` = **48 px** for the first vine and `$60`
= **96 px** for the second, so a full vine takes **96 or 192 frames**. And the
climbing metatile that actually makes it climbable is not written into the block
buffer until `VineHeight` reaches `$20` = 32 px (asm:6741-6754) — **64 frames after
it sprouts**.

**What we do.** `vine.js:65`: `growRate = targetH / 60`, so the vine reaches full
height in exactly 60 frames whatever its height is; `vine.js:99` makes it climbable
at `h >= 8`, i.e. after 3 frames.

**Measured** (2-1, vine spawned from the level's own record):

```
target height        160 px (176 when the level's `height: 11` is applied)
grow rate            2.66 px/frame        ROM: 0.5
frames to full        59                  ROM: 96 (first vine) / 192 (second)
frames to grabbable    2                  ROM: 64
```

Five times too fast, and the 64-frame window in which the original's vine is
visibly growing but cannot yet be grabbed does not exist for us at all.

**Confidence: high** on both sides. **Not verified:** the *height* comparison is not
apples to apples — the ROM ends the climb by taking Mario above the status bar and
changing area (`Vine_AutoClimb`, asm:5666-5679), so 48/96 px is all it ever needs,
whereas ours has to physically reach the destination platform. I am reporting the
**rate** and the **grabbable threshold**, not the height.

---

## Finding 11 — SUSPICION SETTLED: `CreateSpiny`'s ceiling rule is missing, and it is observable

**What the ROM does.** `CreateSpiny` (asm:8310-8315) opens with two guards before it
will build a spiny: `lda Player_Y_Position / cmp #$2c / bcc ExLSHand` — **if the
player's screen y is above 44, no spiny is thrown at all** — and then a check that
Lakitu is in his normal state. Since the status bar occupies the top 32 px, the
rule is "the player is within ~12 px of the status bar", i.e. right at the top of
the screen.

**What we do.** `lakitu.js:137-147` has no such guard; the throw fires whenever
`throwT` reaches `period` and Lakitu is on screen.

**Measured** (4-1, player's screen y pinned for 400 frames, new spinies counted):

```
player screen y = 30 (above the ROM's cutoff):   3 spinies in 400 frames
player screen y = 120 (normal):                  3 spinies in 400 frames
                                                 ROM at y=30: 0
```

The first pass called this "impossible to observe"; pinning the player's screen y
makes it observable, and the answer is that the rule simply is not there.

**Confidence: high.** Both sides are unambiguous. **Not verified:** how `$2c` should
map to our screen — I used our own `player.y - cam.y` on the assumption that our
camera-relative y is the analogue of `Player_Y_Position`, which is the same
assumption `lakitu.js:126` already makes when it hovers at `cam.y + 40`.

**Impact: low.** In practice a player is rarely that high in a Lakitu level. Worth
listing because it is one branch and the throw period (`period` = 128) already
matches the ROM's `$80` `FrenzyEnemyTimer` reload exactly (asm:8280-8281), so this
is the only thing left wrong about the throw.

---

## Finding 12 — SUSPICION SETTLED: the fireball has one probe point in the ROM, four in ours — and it does *not* ignore walls

The first pass suspected `FireballBGCollision` might mean "a ROM fireball does not
explode on a vertical wall" and did not chase it. That reading was too strong. The
truth is narrower and testable.

**What the ROM does.** `FireballBGCollision` (asm:12726-12750) makes exactly one
background query per frame, via `BlockBufferChk_FBall` (asm:13015-13020), which
loads adder index `$1a` = 26. Entry 26 of `BlockBuffer_X_Adder` (asm:13030-13034) is
`$04` and of `BlockBuffer_Y_Adder` (asm:13036-13040) is `$08`, so the probe point is
**(x + 4, y + 8)** — the bottom-centre pixel of the 8x8 ball, and nothing else.
`MoveObjectHorizontally` (asm:7541-7566) does no collision at all. Therefore:

* there is **no horizontal collision test** and **no ceiling test** — a wall is
  detected only once the ball's bottom-centre pixel is already 4 px inside it;
* when it is detected, the ordinary *ground* rule runs: if the ball is moving up,
  or `FireballBouncingFlag` is already set, it explodes (asm:12734-12737,
  12752-12756); otherwise it **bounces off the wall** — `Fireball_Y_Speed` = `$fd`
  = -3, y truncated with `and #$f8` (asm:12738-12744) — and only explodes on a
  later frame.

**What we do.** `fireball.js:209-235` runs a four-point AABB: leading edge at
`y+1` and `y+7` for the horizontal test, `x+1`/`x+7` for the vertical. Any
horizontal contact explodes the ball immediately, with no bounce, and a rising ball
is stopped dead at a ceiling and given `vy = 0.5`.

**Measured.** Both cases were run against our own `world.solidAt` map so the
geometry is identical; the ROM column is a frame-exact simulation of the routine
above.

*Fireball driven into the face of the first pipe in 1-1 (face at x = 448), from
x = 416, y = 184, vx = 4, vy = 0.5:*

```
                    ours                 ROM rule
explodes at x       440                  448      (8 px further in)
explodes on frame     5                    7      (2 frames later)
bounced off the wall first?   no          yes, once
```

*Fireball launched straight up at 3 px/frame under a solid tile whose underside is
at y = 160:*

```
ours    stopped flat at y = 160, vy forced to +0.5, no explosion
ROM     climbs on through to y = 157.06 -- about 3 px inside the block --
        before gravity brings it back; nothing is ever tested above the ball
```

**Verdict on the suspicion: half right.** A ROM fireball does react to a vertical
wall, so "range past a pipe differs" is not the consequence; what differs is that
ours dies 8 px earlier and 2 frames sooner, never bounces off a wall face, and is
blocked by ceilings the original passes through.

**Confidence: high** on the probe-point derivation (two table lookups at a
literal index) and on both measurements. **Not verified:** whether the extra 8 px
ever changes whether an enemy standing against a wall gets hit — I did not build
that case. **Impact: low**; listing it because the suspicion was explicitly left
open and now is not.
