# Solara Bay — Street Heat

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/alawymuhsin/gta6-browser-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/alawymuhsin/gta6-browser-game/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for make.fun's [gta6-01](https://make.fun/bounty/gta6-01) bounty — "Make GTA 6". It runs in a desktop browser from static files, with no network request and no build step.

## The game

Solara Bay is a sun-soaked coastal city. You are **Jax Marlowe**, a driver with no wheels and a debt to pay. **Maya Solis**, the fixer who runs the town from a garage in Old Town, has five jobs for you — and after the last one, the city is yours.

- **A city to explore** on foot and by car: Old Town, Downtown, the Industrial yards and the Marina, with traffic on the roads and pedestrians on the sidewalks.
- **Cars to steal and drive**: walk up to any car and press E. Traffic cars have drivers who run; parked cars are free for the taking.
- **A wanted level that answers back**: steal, hit a pedestrian, fire a gun in front of a cop — stars rise, cop cars spawn and chase, ram your car, and bust you on foot.
- **Five story missions**: First Wheels, The Package, Viper Nest, Heat, and The Big Score — plus repeatable taxi fares once the story is done.
- **Combat**: fists (F) and a pistol (mouse aim, click to shoot), against the Vipers and anyone else in the way.
- **HUD with a minimap**: money, health, wanted stars, ammo, the current objective, and a live map with the police, the mission marker and the fares.
- **Start screen and save**: progress saves automatically and on pause; the title screen offers Continue or a new game.

## Controls

| Keys | What they do |
| --- | --- |
| WASD / arrows | Walk, or drive (W accelerate, S brake / reverse, A/D steer) |
| Shift | Run |
| E | Enter / steal a car, get out, pick up, hold at the vault |
| F | Punch |
| Mouse + click | Aim and fire the pistol |
| Space | Handbrake in a car |
| P / Esc | Pause |
| M | Mute |
| S (on the pause screen) | Save and quit to the title |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

`game/index.html` and its ES modules are the whole game — no library, no assets fetched over the network, all sound synthesised in WebAudio.

## For the judge

The screenshots show the game itself: the cover is a police chase during the Big Score's escape (wanted level, minimap, mission objective and the city in one frame); the others show the city on foot, driving down the coastal avenue, and the Viper Nest fight. The source is split by job — `city.js` builds the map, `vehicles.js` drives the traffic, `police.js` runs the chase, `missions.js` tells the story, `combat.js` fights, `audio.js` plays, `world.js` holds the rules, `render.js` paints, `input.js` listens, `shots.js` stages the screenshots, `main.js` runs the loop.

Solara Bay, Jax Marlowe, Maya Solis, the Vipers and every street in the game are invented for it. Nothing is taken from Rockstar Games' Grand Theft Auto series or any other commercial game.
