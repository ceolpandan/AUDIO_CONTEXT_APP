# Digitick

A web-based drum machine inspired by the Elektron Digitakt, built with vanilla JavaScript ES modules and the Web Audio API.

## About This Project

**Digitick** is a personal learning project with multiple objectives:

- 💼 **Resume Building**: A portfolio piece demonstrating modern JavaScript development skills
- 📚 **Deep Learning**: Hands-on experience with ES modules, Web Audio API, and browser capabilities
- 🤖 **AI-Assisted Development**: Exploring effective collaboration with AI tools in software development
- 🎵 **Feature Implementation**: Progressively replicating Digitakt features (step sequencer, parameter locks, per-track filters, etc.)

The project started from a desire to recreate the beloved Elektron Digitakt drum machine for the web, making electronic music production tools accessible through the browser.

**Technical Overview**

- **Purpose**: Modular web-audio application with clean separation between audio engine and UI
- **Stack**: Vanilla JavaScript (ES modules), Web Audio API, DOM APIs, Node.js dev server with live reload
- **Architecture**: Engine handles all audio (scheduling, mixing, sample playback); UI handles all DOM rendering and user interaction

**Quick Start**

- **Requirements:**: Node.js (>=12) for the dev server and a modern browser for the Web Audio API.
- **Run dev server (recommended):**
  - Via npm (recommended):

    ```cmd
    npm run dev
    ```

  - Or directly:

    ```cmd
    node scripts/dev-server.js
    ```

- **Open:**: Visit `http://localhost:3000` in your browser. The page auto-connects to the live-reload client injected in `index.html`.

**Project Structure (top-level)**

- **`index.html`**: The HTML entry (loads `app.js`).
- **`app.js`**: Application bootstrap — wires engine + UI, presets, and Play/Stop controls.
- **`package.json`**: Minimal project metadata and scripts (e.g., `dev`).
- **`styles/`**: CSS files (tokens, utilities, components).
- **`samples/`**: (Expected) folder for audio sample WAV/MP3 files used by tracks.
- **`scripts/`**: Build and development scripts:
  - **`scripts/dev-server.js`**: Tiny Node dev server with SSE live-reload (`/events`) and static serving.
  - **`scripts/livereload.js`**: Client that listens for SSE reload events and refreshes the page.
  - **`scripts/build-esbuild.js`**: Production build script.
- **`src/`**: Application source (modular):
  - **`src/config/constants.js`**: Canonical app-level constants (BPM, steps, FFT size, defaults).
  - **`src/engine/engine.js`**: Audio engine implementation (AudioContext, Track class, scheduler, mixer helpers).
  - **`src/engine.js`**: Lightweight shim that re-exports `src/engine/engine.js` (keeps compatibility with older imports).
  - **`src/ui/ui.js`**: UI implementation (sequencer view, mixer rendering, filter panel, oscilloscope, keyboard shortcuts).
  - **`src/ui.js`**: Lightweight shim that re-exports `src/ui/ui.js`.
  - **`src/ui/*/index.js`**: Small shims for UI submodules (`mixer`, `filter`, `scope`, `sequencer`) re-exporting the canonical `ui.js` functions.

**Core Concepts**

- **Engine vs UI (Separation of Concerns)**
  - **Engine (`src/engine/engine.js`)**: Responsible for audio scheduling, track state, mixing and producing an `AnalyserNode` for the UI scope. It exposes functions such as:
    - `audioCtx` — the shared `AudioContext` instance.
    - `createTracksFromUrls(urls)` — loads samples and creates `Track` objects.
    - `start()` / `stop()` — start and stop the scheduler.
    - `updateMixerGains()` / `setTrackLevel(index, value)` — mixer helpers.
    - `setBpm(v)` / `getBpm()` — tempo controls.
    - `getAnalyser()` — returns the master `AnalyserNode` used by the oscilloscope.
  - **UI (`src/ui/ui.js`)**: Renders the sequencer, mixer and filter UI and binds events. The UI subscribes to semantic DOM events from the engine (see below) and updates visuals.

- **Track model**
  - Each `Track` contains:
    - `pattern`: Array of `STEPS` objects { trig: boolean, locks: {} }.
    - `buffer`: decoded sample data or `null` (oscillator fallback).
    - `gainNode`, `level`, `muted`, `solo`, `volume`, `filterFreq`, `filterType`, `filterQ`.
  - `Track.trigger(time, params)` schedules audio playback (sample or fallback oscillator) at the given `time`.

- **Scheduling & Events**
  - The engine uses a lookahead scheduler. Each scheduled step calls `scheduleStep(stepIndex, time)`.
  - When a track is scheduled to play, the engine dispatches a DOM `CustomEvent` named `track-trigger`:
    - Example: `document.dispatchEvent(new CustomEvent('track-trigger', { detail: { trackIndex, step, time } }))`.
  - The UI listens for `track-trigger` and flashes the corresponding mixer channel (CSS class `channel--hit`) so visual feedback is emitted close to the scheduling moment.

**Configuration & Constants**

- All application-level constants are in `src/config/constants.js`:
  - `DEFAULT_BPM`, `STEPS`, `TRACK_COUNT`, `FFT_SIZE`, `LOOKAHEAD`, `STEPS_PER_BEAT`, `DEFAULT_FILTER_FREQ`, `DEFAULT_VOLUME`, etc.
- Prefer adjusting constants here for global changes.

**How to Add Samples and Presets**

- Place audio files under the `samples/` directory (e.g., `samples/kick1.wav`).
- `app.js` currently contains a hiphop default preset that calls `createTracksFromUrls(sampleUrls)` and then sets triggers on `tracks[i].pattern[...]`.
- To add more presets, create a `presets/` file or add functions in `app.js` returning pattern arrays.

**Development Notes**

- Use `cmd.exe` to run `node dev-server.js` to avoid PowerShell script policy problems on Windows.
- If the dev server reports `EADDRINUSE`, run:
  ```cmd
  netstat -ano | findstr :3000
  tasklist /FI "PID eq <PID>"
  taskkill /PID <PID> /F
  ```
- If file watching misses events on your platform, consider switching `dev-server.js` to use `chokidar` for robust cross-platform watching.

**Extending the App**

- Add tracks: update `app.js` sample list and call `createTracksFromUrls`.
- Add UI components: prefer adding a clear `src/ui/<component>.js` file and expose functions in `src/ui/ui.js` (keep small shims for compatibility if needed).
- Visual sync: the `track-trigger` event contains the scheduled audio `time` (AudioContext time). If you need frame-perfect visuals, use the engine-provided `time` and schedule UI changes via `setTimeout` for `(time - audioCtx.currentTime) * 1000` ms.

**Coding Conventions**

- Keep audio logic in `src/engine/*` and DOM/UI logic in `src/ui/*`.
- Centralize app-level constants in `src/config/constants.js`.
- Use descriptive filenames for canonical modules (e.g., `engine.js`, `ui.js`, `constants.js`); keep `index.js` shims only if necessary for compatibility.

**Troubleshooting**

- No audio in browser: ensure the page received a user gesture (click Play) to resume the `AudioContext`. The app bootstraps but resumes the context on `start()`.
- Samples not loading: check `samples/` paths in `app.js` and that the dev server serves those files.
- UI not showing: open Console for JS errors. Missing imports or broken shims will show stack traces pointing to file and line.

**Next Steps / Suggestions**

- Add unit/integration tests (e.g., test engine scheduling logic by mocking `audioCtx`).
- Replace `dev-server.js` `fs.watch` with `chokidar` for more robust live-reload.
- Split `src/ui/ui.js` into smaller component files for maintainability (e.g., `ui/mixer.js`, `ui/filter.js`) and import them into `ui.js`.
- Add a `CONTRIBUTING.md` and `ISSUE_TEMPLATE.md` if you plan to accept contributions.

---

If you want, I can also:

- Convert this README into a more compact `docs/` site (static HTML) or generate a `README.html` preview.
- Run an automated smoke-test (start `dev-server.js` here and fetch `/`) and report any runtime errors.

Tell me which follow-up you'd like next and I will implement it.

**Publishing to GitHub**

- **Check `.gitignore`:** Ensure large or private files (for example `samples/` if you prefer) are excluded. The repo already contains a basic `.gitignore` but review it before publishing.
- **Create a new repository & push:** Run these commands from a Windows `cmd.exe` shell in the project root:

  ```cmd
  git init
  git add .
  git commit -m "Initial commit: Audio Context App"
  git branch -M main
  git remote add origin https://github.com/<your-username>/<repo-name>.git
  git push -u origin main
  ```

- **Create the repo with GitHub CLI (optional):** If you have `gh` installed you can create and push in one step:

  ```cmd
  gh repo create <your-username>/<repo-name> --public --source=. --remote=origin --push
  ```

- **Large files / LFS:** If you plan to include large audio files, consider using `git lfs` or hosting samples elsewhere (CDN or cloud storage) and keeping lightweight references in the repo.
- **CI & Badges:** The included GitHub Actions workflow is a minimal smoke test. After pushing, enable the workflow and add a badge to this README if you want build status visible.

If you'd like, I can run through the exact `git` commands for you here (I won't run them without permission), or prepare a `publish.sh`/`publish.cmd` script you can run locally.
