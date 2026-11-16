# threejs-fps-02 — GLASSHOUSE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/diimzyy/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/diimzyy/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**GLASSHOUSE** — a round-based tactical FPS in a glassworks at night. Your crew plants the
furnace charge; the guards defuse. First to 7 rounds.

- Two bomb sites (A: the furnace hall, B: the annealing racks), three lanes, a catwalk,
  glass partitions, staggered cover — an original map, not a copy
- Economy: $800 start, kill and round rewards, a buy menu (SMG / bolt rifle / battle rifle,
  plus a thrown charge jar)
- Bots on both teams: four crew attackers with route plans, four guards holding site lines;
  they spot by line of sight, aim with error, duel-strafe and reload
- Gunplay: hitscan with headshot multipliers, legs reduced damage, spread that punishes
  movement, recoil kick, semi/auto trigger rules
- Objective: plant with E (3.2 s), defuse with E (5.0 s), a 40 s charge timer, guards that
  run to defuse, win by elimination, detonation, defusal or time
- Fixed 60 Hz simulation kept apart from rendering; seeded RNG; deterministic
  `?shot=start|play|end` capture mode for screenshots

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Hand-in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`

## Repository layout

- `game/` — the game: `index.html` (HUD + import map), `src/` modules (`palette`, `world`,
  `player`, `weapon`, `bots`, `input`, `hud`, `main`), vendored three.js 0.187.0
- `screenshots/` — three real renders from the game's own capture mode
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to `/output` and writes
  `dossier.json` via the kit's `vendor/makefun-threejs.ts`
- `serve.ts` — zero-dependency static server for local play

---

<sub>Entered on [make.fun](https://make.fun/?ref=98bg858x&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
