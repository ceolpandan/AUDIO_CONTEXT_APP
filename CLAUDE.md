# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Digitick** - A web-based drum machine inspired by the Elektron Digitakt, built with TypeScript and the Web Audio API.

### Project Intent

This is a personal learning project with the following goals:
- **Portfolio piece**: Demonstrating full-stack TypeScript development skills for resume building
- **Deep TypeScript learning**: Understanding ES modules, Web Audio API, and modern browser APIs with type safety
- **AI-assisted development**: Learning to effectively collaborate with AI tools for software development
- **Feature implementation**: Progressively implementing Digitakt-inspired features (step sequencer, parameter locks, filters, etc.)

The architecture strictly separates audio engine logic from DOM/UI rendering, making it easy to extend with new features.

## Development Commands

### Running the App
```cmd
npm run dev
```
or
```cmd
npm start
```
Both commands run `node scripts/dev-server.js`. Visit `http://localhost:3000`. The dev server includes SSE-based live reload and on-the-fly TypeScript transpilation via esbuild.

**Windows-specific:** Use `cmd.exe` instead of PowerShell to avoid script execution policy issues.

### Building for Production
```cmd
npm run build
```
Bundles with esbuild into `dist/`, minifies code, strips live-reload script from HTML, and copies static assets.

### Type Checking
```cmd
npm run typecheck        # Run TypeScript type checking
npm run typecheck:watch  # Run type checking in watch mode
```

### Linting and Formatting
```cmd
npm run lint        # Run Biome linter with auto-fix
npm run lint:ci     # Run Biome linter without fixes (for CI)
npm run format      # Format all files with Biome
npm run format:check # Check formatting without changes
npm run check       # Run both linting and formatting with auto-fix
npm run check:ci    # Run both linting and formatting without fixes
```

### Code Quality
The project is configured for SonarQube analysis via `sonar-project.properties`. To run SonarQube locally:
```cmd
sonar-scanner
```

**Code quality practices:**
- All magic numbers are extracted to constants in `src/config/constants.ts`
- Security: innerHTML usage minimized; dynamic content uses textContent
- Empty catch blocks include explanatory comments
- Biome rules enforced for consistency (linting and formatting)
- TypeScript with moderate strictness (`noImplicitAny`, `strictNullChecks`)

### Troubleshooting Port Conflicts (Windows)
If `EADDRINUSE` error occurs on port 3000:
```cmd
netstat -ano | findstr :3000
tasklist /FI "PID eq <PID>"
taskkill /PID <PID> /F
```

## Architecture

### Core Separation: Engine vs UI

**Engine** (`src/engine/engine.ts`):
- Manages AudioContext, audio scheduling, Track state, mixing
- No DOM dependencies
- Exports: `audioCtx`, `tracks`, `createTracksFromUrls()`, `start()`, `stop()`, `setBpm()`, `getBpm()`, `setTrackLevel()`, `updateMixerGains()`, `getAnalyser()`
- Dispatches `CustomEvent('track-trigger', {detail: {trackIndex, step, time}})` when tracks are scheduled

**UI** (`src/ui/ui.ts`):
- Renders sequencer grid, mixer channels, filter controls, oscilloscope
- Listens to `track-trigger` events and updates visual feedback (e.g., channel flashes)
- Exports: `init()`, `startUI()`, `stopUI()`, `updateMixerUI()`
- No audio scheduling or sample triggering

### Type Definitions

Shared types are defined in `src/types/index.ts`:
- `FilterType` - Union of BiquadFilter types (`'lowpass'`, `'highpass'`, etc.)
- `PatternStep` - Step structure `{trig: boolean, locks: ParameterLocks}`
- `TriggerParams` - Optional parameters for triggering samples
- `TrackTriggerEventDetail` - Custom event payload structure
- `PlaybackStartTimeGetter` - Function type for playback time reference

Global augmentations extend `Window` (for `webkitAudioContext`) and `DocumentEventMap` (for custom events).

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

All application-level constants live in `src/config/constants.ts`:
- `DEFAULT_BPM`, `STEPS`, `TRACK_COUNT`, `FFT_SIZE`, `LOOKAHEAD`, `STEPS_PER_BEAT`
- `DEFAULT_FILTER_FREQ`, `DEFAULT_FILTER_Q`, `DEFAULT_VOLUME`

Adjust these for global changes rather than hardcoding values.

## Future Development Roadmap

As this project aims to replicate Digitakt features, planned implementations include:
- **Parameter locks**: Per-step parameter automation (pitch, filter, volume, etc.)
- **Conditional trigs**: Probability, fill conditions, retrigs
- **Sound design**: Advanced filter controls, LFO, envelope controls
- **Pattern management**: Multiple patterns, pattern chaining
- **Sample management**: Sample browser, waveform display, slice editing
- **MIDI support**: MIDI input/output for external gear integration
- **Effects**: Reverb, delay, compression per track
- **Song mode**: Arranging patterns into complete tracks

### Project Structure

```
Digitick/
├── index.html              # HTML entry point
├── app.ts                  # Application bootstrap
├── tsconfig.json           # TypeScript configuration
├── src/                    # Application source code
│   ├── engine.ts           # Re-exports from engine/engine.ts
│   ├── ui.ts               # Re-exports from ui/ui.ts
│   ├── config/
│   │   ├── constants.ts    # Application constants
│   │   └── model.ts        # Enums and models
│   ├── engine/
│   │   └── engine.ts       # Audio engine implementation
│   ├── types/
│   │   └── index.ts        # Shared type definitions
│   └── ui/
│       └── ui.ts           # UI implementation
├── styles/                 # CSS files
│   ├── tokens.css          # Design tokens (colors, spacing)
│   ├── utilities.css       # Utility classes
│   └── styles.css          # Component styles
├── samples/                # Audio sample files (.wav, .mp3)
├── scripts/                # Build and development scripts (JS)
│   ├── build-esbuild.js    # Production build script
│   ├── dev-server.js       # Development server with live reload + TS transpilation
│   └── livereload.js       # Live reload client script
└── dist/                   # Build output (generated)
```

**Import pattern:** `app.ts` imports from `./src/engine.ts` and `./src/ui.ts`, which are lightweight shims that re-export from the actual implementation files. This allows the implementation code to live in organized subdirectories while keeping import paths simple.

## Adding Features

### Adding Samples and Presets

1. Place audio files in `samples/` directory (e.g., `samples/kick1.wav`)
2. Update `app.ts` sample URLs in `createTracksFromUrls(sampleUrls)`
3. Set pattern triggers: `tracks[i].pattern[stepIndex].trig = true`
4. Adjust track volumes/filters after track creation

### Adding UI Components

Currently, all UI code lives in `src/ui/ui.ts`. To add new UI functionality:

1. Add the new functions directly to `src/ui/ui.ts`
2. Export them so they're available when importing from `src/ui.ts`

If the file grows too large, you can split it into separate files (e.g., `src/ui/mixer.ts`, `src/ui/filter.ts`) and import them into `src/ui/ui.ts` to re-export.

### Adding New Types

Add shared types to `src/types/index.ts`. For module-specific types, define them in the module file itself.

### Visual Synchronization

The `track-trigger` event includes the scheduled audio `time` (AudioContext time). For frame-perfect visuals, calculate delay as `(time - audioCtx.currentTime) * 1000` ms and use `setTimeout`.

## Coding Conventions

- Keep audio logic in `src/engine/*` and DOM/UI logic in `src/ui/*`
- Centralize constants in `src/config/constants.ts`
- Use descriptive filenames for canonical modules; keep shims only for compatibility
- Follow Biome rules: prefer `const`, use `===`, enable multi-line curly braces
- Use explicit type annotations for function parameters and return types
- Prefer `as const` for literal type narrowing
- No console warnings in production builds (but `console.log` is allowed)

## Common Issues

### No Audio in Browser
Ensure the page received a user gesture (click Play) to resume the AudioContext. The app resumes context on `start()`.

### Samples Not Loading
Check `samples/` paths in `app.ts` match actual files. Verify dev server is serving those files (check browser Network tab).

### UI Not Showing
Open browser Console for JS errors. Missing imports or broken shims will show stack traces with file/line info.

### TypeScript Errors
Run `npm run typecheck` to see all type errors. The project uses moderate strictness - ensure proper null checks and explicit types for function parameters.

### Live Reload Not Working
File watching uses `fs.watch`. On some platforms, consider switching `dev-server.js` to use `chokidar` for more robust cross-platform watching.
