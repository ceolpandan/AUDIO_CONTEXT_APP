# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modular web-audio step sequencer (mini drum-machine) built with vanilla JavaScript ES modules and the Web Audio API. The architecture strictly separates audio engine logic from DOM/UI rendering.

## Development Commands

### Running the App
```cmd
node dev-server.js
```
or
```cmd
npm run dev
```
Visit `http://localhost:3000`. The dev server includes SSE-based live reload.

**Windows-specific:** Use `cmd.exe` instead of PowerShell to avoid script execution policy issues.

### Building for Production
```cmd
npm run build
```
Bundles with esbuild into `dist/`, minifies code, strips live-reload script from HTML, and copies static assets.

### Linting and Formatting
```cmd
npm run lint        # Run eslint with auto-fix
npm run lint:ci     # Run eslint without fixes (for CI)
npm run format      # Format all files with Prettier
npm run format:check # Check formatting without changes
```

### Troubleshooting Port Conflicts (Windows)
If `EADDRINUSE` error occurs on port 3000:
```cmd
netstat -ano | findstr :3000
tasklist /FI "PID eq <PID>"
taskkill /PID <PID> /F
```

## Architecture

### Core Separation: Engine vs UI

**Engine** (`src/engine/engine.js`):
- Manages AudioContext, audio scheduling, Track state, mixing
- No DOM dependencies
- Exports: `audioCtx`, `tracks`, `createTracksFromUrls()`, `start()`, `stop()`, `setBpm()`, `getBpm()`, `setTrackLevel()`, `updateMixerGains()`, `getAnalyser()`
- Dispatches `CustomEvent('track-trigger', {detail: {trackIndex, step, time}})` when tracks are scheduled

**UI** (`src/ui/ui.js`):
- Renders sequencer grid, mixer channels, filter controls, oscilloscope
- Listens to `track-trigger` events and updates visual feedback (e.g., channel flashes)
- Exports: `init()`, `startUI()`, `stopUI()`, `updateMixerUI()`
- No audio scheduling or sample triggering

### Track Model

Each `Track` instance contains:
- `pattern`: Array of `STEPS` objects `{trig: boolean, locks: {}}`
- `buffer`: Decoded audio sample or `null` (falls back to oscillator)
- Audio graph nodes: `gainNode` (routes to master bus)
- Parameters: `level`, `volume`, `muted`, `solo`, `filterFreq`, `filterType`, `filterQ`
- `trigger(time, params)`: Schedules playback at given AudioContext time

### Scheduling & Events

The engine uses a lookahead scheduler. When a step is scheduled, the engine dispatches a DOM `CustomEvent` named `track-trigger` containing `{trackIndex, step, time}`. The UI subscribes to this event to flash the corresponding mixer channel near the scheduling moment.

### Configuration

All application-level constants live in `src/config/constants.js`:
- `DEFAULT_BPM`, `STEPS`, `TRACK_COUNT`, `FFT_SIZE`, `LOOKAHEAD`, `STEPS_PER_BEAT`
- `DEFAULT_FILTER_FREQ`, `DEFAULT_FILTER_Q`, `DEFAULT_VOLUME`

Adjust these for global changes rather than hardcoding values.

### Module Organization

- `app.js`: Bootstrap — loads engine + UI, applies preset pattern, wires Play/Stop buttons
- `src/engine/engine.js`: Canonical audio engine implementation
- `src/engine.js`: Lightweight shim re-exporting `src/engine/engine.js`
- `src/ui/ui.js`: Canonical UI implementation
- `src/ui.js`: Lightweight shim re-exporting `src/ui/ui.js`
- `src/ui/*/index.js`: Small compatibility shims for UI submodules
- `src/config/constants.js`: Centralized constants

**Shim pattern:** The project uses `index.js` or top-level shims for backwards compatibility. Canonical implementations are in `engine/engine.js` and `ui/ui.js`. Prefer editing the canonical files.

## Adding Features

### Adding Samples and Presets

1. Place audio files in `samples/` directory (e.g., `samples/kick1.wav`)
2. Update `app.js` sample URLs in `createTracksFromUrls(sampleUrls)`
3. Set pattern triggers: `tracks[i].pattern[stepIndex].trig = true`
4. Adjust track volumes/filters after track creation

### Adding UI Components

1. Create a new file in `src/ui/<component>.js` if needed
2. Expose functions in `src/ui/ui.js`
3. Keep small shims in `src/ui/<component>/index.js` only for compatibility

### Visual Synchronization

The `track-trigger` event includes the scheduled audio `time` (AudioContext time). For frame-perfect visuals, calculate delay as `(time - audioCtx.currentTime) * 1000` ms and use `setTimeout`.

## Coding Conventions

- Keep audio logic in `src/engine/*` and DOM/UI logic in `src/ui/*`
- Centralize constants in `src/config/constants.js`
- Use descriptive filenames for canonical modules; keep `index.js` shims only for compatibility
- Follow ESLint rules: prefer `const`, use `===`, enable multi-line curly braces
- No console warnings in production builds (but `console.log` is allowed)

## Common Issues

### No Audio in Browser
Ensure the page received a user gesture (click Play) to resume the AudioContext. The app resumes context on `start()`.

### Samples Not Loading
Check `samples/` paths in `app.js` match actual files. Verify dev server is serving those files (check browser Network tab).

### UI Not Showing
Open browser Console for JS errors. Missing imports or broken shims will show stack traces with file/line info.

### Live Reload Not Working
File watching uses `fs.watch`. On some platforms, consider switching `dev-server.js` to use `chokidar` for more robust cross-platform watching.
