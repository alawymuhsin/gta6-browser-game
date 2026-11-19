# Solara Bay — Street Heat

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/alawymuhsin/gta6-browser-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/alawymuhsin/gta6-browser-game/reward.svg)](https://make.fun/bounty/gta6-01)

A home-grown open-world crime game built for make.fun's [gta6-01](https://make.fun/bounty/gta6-01) bounty — "Make GTA 6". It plays in a desktop browser straight from static files: no network requests, no build step, nothing to install.

## The game

Solara Bay is a sun-soaked coastal city. You are **Jax Marlowe**, a driver with no wheels and a debt to pay. **Maya Solis**, the fixer who runs the town from a garage in Old Town, has ten jobs for you — and after the last one, the city is yours.

- **A city to explore** on foot and by car: eight districts — Old Town, Downtown, the Industrial yards, the Marina, Calle Ocho, Northside, Portside and Vista Heights — each with its own roof palette, with traffic on the roads, pedestrians on the sidewalks, and Viper gang members standing their ground on their own turf.
- **Cars to steal and drive**: walk up to any car and press E. Traffic cars have drivers who run; parked cars are free for the taking. Seven types on the road, from taxis to limousines.
- **A wanted level that answers back**: steal, hit a pedestrian, fire a gun in front of a cop — stars rise, cop cars spawn and chase, ram your car, and bust you on foot. At three stars a roadblock goes down on the road ahead; at four stars the police helicopter comes up and keeps its searchlight on you.
- **Ten story missions**: First Wheels, The Package, Viper Nest, Heat, The Big Score, Radio Silence (steal a broadcast van), Grand Prix (a four-checkpoint street race), The Safehouse (take the block back and keep it), Air Support (survive the helicopter), and the Harbor Heist — plus repeatable taxi fares, package deliveries and street races once the story is done.
- **Combat**: fists (F) and a pistol (mouse aim, click to shoot), against the Vipers and their enforcers — and a shotgun in the safehouse closet once the block is yours (Q switches weapons).
- **The city lives after the story**: 12 hidden packages stashed at the city's corners (find them all for a bonus), a safehouse that heals you and saves with E, and a car radio with three synth stations (R cycles them).
- **Day and night**: a five-minute day runs from dawn to dusk to night, with a clock on the HUD, headlights after dark, and the helicopter's searchlight cutting through the dark.
- **HUD with a minimap**: money, health, wanted stars, ammo, weapon, the current objective, and a live map with the police, the helicopter, the roadblocks, the mission marker, the race checkpoint, the fares, the deliveries and the hidden packages.
- **Start screen and save**: progress saves automatically and on pause; the title screen offers Continue or a new game.

## Controls

| Keys | What they do |
| --- | --- |
| WASD / arrows | Walk, or drive (W accelerate, S brake / reverse, A/D steer) |
| Shift | Run |
| E | Enter / steal a car, get out, pick up, hold at the vault |
| F | Punch |
| Mouse + click | Aim and fire the pistol / shotgun |
| Q | Switch pistol / shotgun (once the safehouse is yours) |
| R | Car radio: Solara FM → Bay Beats → Coast Talk → off |
| H | Horn (in a car) |
| Space | Handbrake in a car |
| P / Esc | Pause |
| M | Mute |
| S (on the pause screen) | Save and quit to the title |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

The entrypoint `node main.ts` resolves game/ and screenshots/ from its own folder, so it builds the dossier correctly from any working directory.

`game/index.html` and its ES modules are the whole game — no library, no assets fetched over the network, all sound synthesised in WebAudio.

## For the judge

The screenshots show the game itself: the cover is the Harbor Heist escape at dusk — five stars, the helicopter overhead, a roadblock on the road ahead, wanted level, minimap, mission objective and the city in one frame; the others show Calle Ocho on foot, the Grand Prix mid-race down the coastal avenue, and the Harbor Heist shootout at the Port Gate with the shotgun out. The source is split by job — `city.js` builds the map, `vehicles.js` drives the traffic, `police.js` runs the chase (cars, helicopter, roadblocks), `missions.js` tells the story, `activities.js` runs the races, deliveries and hidden packages, `combat.js` fights, `audio.js` plays (including the car radio), `world.js` holds the rules, `render.js` paints, `input.js` listens, `shots.js` stages the screenshots, `main.js` runs the loop.

Solara Bay, Jax Marlowe, Maya Solis, the Vipers and every street in the game are invented for it. Nothing is taken from Rockstar Games' Grand Theft Auto series or any other commercial game.
