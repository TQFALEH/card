# Neon Memory Match (GSAP)

Production-quality Memory Match (Pairs) game with a premium neon UI, smooth GSAP animations, and modular game logic.

## Stack

- React 18 + TypeScript + Vite
- GSAP for key gameplay/screen animations
- Lucide React SVG icon set (free, MIT)

## Why this stack

- React + Vite gives fast iteration and strong runtime performance.
- TypeScript keeps core logic deterministic and testable.
- GSAP provides smooth, frame-friendly transform/opacity animation control.
- Game engine is separated from UI for maintainability.

## Features

- Full playable game loop with turn logic and scoring
- Modes: Single Player (vs memory AI), Local 2P, Local 4P
- Difficulty: Easy, Medium, Hard
- Board sizes: 4x4, 6x6, 8x8
- Match coin markers (carrom-inspired)
- Match keeps turn, mismatch waits 1000ms and passes turn
- End results with winner, time, moves, accuracy, replay
- Input locking during turn resolution to prevent race conditions
- Responsive mobile-first layout

## GSAP Animations

- 3D card flip
- Match glow burst
- Wrong match shake
- Coin marker drop + bounce
- Screen transitions (menu/game/results)

## Run

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
npm run preview
```

## Project Structure

- `src/core/gameEngine.ts`: pure game state and rules
- `src/core/ai.ts`: bot memory and difficulty behavior
- `src/core/icons.ts`: SVG icon pool and tint palette
- `src/components/`: board/cards/HUD/screen shells/background
- `src/App.tsx`: screen flow + orchestration

## Notes

- The icon pool includes 32 distinct SVG icons to support 8x8 boards (32 pairs).
- For 60 FPS feel, animations avoid layout-triggering properties and rely on transforms/opacity.
