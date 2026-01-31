# Digitick Audio Engine Architecture

Low-level documentation of how triggers are dispatched and sound is output.

---

## Audio Engine Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SCHEDULING LOOP                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  scheduler() - runs via requestAnimationFrame while isPlaying=true      │    │
│  │                                                                          │    │
│  │  while (nextEventTime < audioCtx.currentTime + LOOKAHEAD) {             │    │
│  │      scheduleStep(currentStep, nextEventTime)  ───────────────────┐     │    │
│  │      nextEventTime += stepDuration()           ◄── BPM/60 * 4     │     │    │
│  │      currentStep = (currentStep + 1) % 16                         │     │    │
│  │  }                                                                 │     │    │
│  └────────────────────────────────────────────────────────────────────│─────┘    │
└───────────────────────────────────────────────────────────────────────│──────────┘
                                                                        │
                                                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           scheduleStep(stepIndex, time)                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  for (const track of tracks) {                                          │    │
│  │      if (!track.pattern[stepIndex].trig) return; ◄── BUG! should be     │    │
│  │                                                       "continue"         │    │
│  │      ┌──────────────────────────────────────────────────────────────┐   │    │
│  │      │  1. DISPATCH UI EVENT                                         │   │    │
│  │      │     document.dispatchEvent(                                   │   │    │
│  │      │       new CustomEvent('track-trigger', {                      │   │    │
│  │      │         detail: { trackIndex, step, time }                    │   │    │
│  │      │       })                                                      │   │    │
│  │      │     )                                                         │   │    │
│  │      └─────────────────────────────────────────────────────│─────────┘   │    │
│  │                                                             │            │    │
│  │      ┌──────────────────────────────────────────────────────│────────┐   │    │
│  │      │  2. TRIGGER AUDIO                                    ▼        │   │    │
│  │      │     track.trigger(time, step.locks)  ──► Track.trigger()      │   │    │
│  │      └───────────────────────────────────────────────────────────────┘   │    │
│  │  }                                                                       │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Audio Graph (per trigger)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        Track.trigger(time, params)                                │
│                                                                                   │
│  SAMPLE PATH (if buffer exists):                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                             │  │
│  │  AudioBufferSourceNode ──► BiquadFilterNode ──► GainNode (env) ──┐         │  │
│  │         │                        │                    │           │         │  │
│  │         │                        │                    │           │         │  │
│  │    src.buffer             filter.type          env.gain           │         │  │
│  │    = this.buffer          = filterType         0 → volume         │         │  │
│  │                           filter.frequency     (5ms ramp)         │         │  │
│  │    src.start(time)        = filterFreq                            │         │  │
│  │                           filter.Q = filterQ                      │         │  │
│  │                                                                   │         │  │
│  └───────────────────────────────────────────────────────────────────│─────────┘  │
│                                                                      │            │
│  OSCILLATOR FALLBACK (if buffer is null):                            │            │
│  ┌───────────────────────────────────────────────────────────────────│─────────┐  │
│  │                                                                   │         │  │
│  │  OscillatorNode ──► BiquadFilterNode ──► GainNode (env) ──────────┤         │  │
│  │       │                    │                   │                  │         │  │
│  │  type='square'        same as above      0 → vol → 0              │         │  │
│  │  freq=OSC_BASE_FREQ                      (attack/release)         │         │  │
│  │      +(idx*OSC_FREQ_STEP)                                         │         │  │
│  │                                                                   │         │  │
│  │  osc.start(time)                                                  │         │  │
│  │  osc.stop(time + OSC_TOTAL_DURATION)                              │         │  │
│  │                                                                   │         │  │
│  └───────────────────────────────────────────────────────────────────│─────────┘  │
│                                                                      │            │
└──────────────────────────────────────────────────────────────────────│────────────┘
                                                                       │
                                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              MASTER OUTPUT CHAIN                                  │
│                                                                                   │
│   Track 0 ──► track.gainNode ──┐                                                 │
│   Track 1 ──► track.gainNode ──┤                                                 │
│   Track 2 ──► track.gainNode ──┼──► masterGain ──► analyser ──► destination      │
│   ...                          │         │            │             │             │
│   Track 7 ──► track.gainNode ──┘         │            │             │             │
│                                          │            │             │             │
│                               level * mute/solo    FFT_SIZE      speakers        │
│                                                    (2048)                         │
│                                                       │                           │
│                                                       ▼                           │
│                                              UI oscilloscope                      │
│                                              (drawScope)                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Event Flow (Engine → UI)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EVENT DISPATCH FLOW                                 │
│                                                                                  │
│  ENGINE (src/engine/engine.ts:48)                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │  document.dispatchEvent(                                                │     │
│  │    new CustomEvent('track-trigger', {                                   │     │
│  │      detail: { trackIndex: track.index, step: stepIndex, time }        │     │
│  │    })                                                                   │     │
│  │  )                                                                      │     │
│  └─────────────────────────────────────────────────│───────────────────────┘     │
│                                                    │                             │
│                                                    ▼                             │
│  UI (src/ui/ui.ts:17-28) - registered at module load                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  document.addEventListener('track-trigger', (e: TrackTriggerEvent) => { │    │
│  │      const idx = e.detail.trackIndex;                                   │    │
│  │      flashChannel(idx);  ───────────────────────────────────────┐       │    │
│  │  });                                                             │       │    │
│  └──────────────────────────────────────────────────────────────────│───────┘    │
│                                                                     │            │
│                                                                     ▼            │
│  flashChannel(index, ms=160)                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1. Find: .mixer-grid .channel[data-track="${index}"]                   │    │
│  │  2. Add class: 'channel--hit'                                           │    │
│  │  3. setTimeout → remove class after 160ms                               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Timing Diagram

```
           AudioContext.currentTime
                    │
    ┌───────────────┼───────────────────────────────────────────────┐
    │               │                                               │
    │   ◄───────────┼── LOOKAHEAD (0.1s) ───►                      │
    │               │                                               │
    │    already    │     schedule window      │    future          │
    │    played     │                          │    (not scheduled) │
    │               │                          │                    │
────┴───────────────┴────●────●────●────●──────┴────────────────────►
                    now  │    │    │    │                    time
                         │    │    │    │
                         │    │    │    └── step 3 @ nextEventTime+3*dur
                         │    │    └─────── step 2 @ nextEventTime+2*dur
                         │    └──────────── step 1 @ nextEventTime+dur
                         └───────────────── step 0 @ nextEventTime

    stepDuration = 1 / (BPM/60 * STEPS_PER_BEAT)
                 = 60 / (BPM * STEPS_PER_BEAT)
                 = 0.125s @ 120 BPM (with STEPS_PER_BEAT=4)
```

---

## Critical Bug

**Location:** `src/engine/engine.ts:38`

```typescript
function scheduleStep(stepIndex: number, time: number): void {
    for (const track of tracks) {
        const step = track.pattern[stepIndex];
        if (!step?.trig) {
            return;    // ← BUG: should be "continue"
        }
        // ...
    }
}
```

**Problem:** `return` exits the entire function on the first track without a trigger. If Track 0 has no trig at step N, **no other tracks will play at step N**.

**Fix:** Change `return` to `continue`.

---

## Data Flow Summary

```
boot() ─► createTracksFromUrls() ─► Track[] created
                │
                ├── Track.load() ─► fetch() ─► decodeAudioData() ─► buffer
                │
                └── Track.gainNode ─► masterGain ─► analyser ─► destination

start() ─► audioCtx.resume() ─► isPlaying=true ─► scheduler()
                                                      │
           ┌──────────────────────────────────────────┘
           ▼
      scheduler() ─► scheduleStep() ─┬─► CustomEvent('track-trigger')
           │                         │
           │                         └─► track.trigger(time) ─► AudioNode graph
           │
           └─► requestAnimationFrame(scheduler)  [loop]

stop() ─► isPlaying=false ─► scheduler() exits
```

---

## Key Constants (from src/config/constants.ts)

| Constant | Purpose |
|----------|---------|
| `STEPS` | Number of steps per pattern (16) |
| `TRACK_COUNT` | Number of tracks (8) |
| `DEFAULT_BPM` | Initial tempo |
| `LOOKAHEAD` | Scheduler lookahead window (0.1s) |
| `STEPS_PER_BEAT` | Steps per beat for timing calculation (4) |
| `FFT_SIZE` | Analyser FFT size for oscilloscope (2048) |
| `OSC_BASE_FREQ` | Base frequency for oscillator fallback |
| `OSC_FREQ_STEP` | Frequency increment per track index |
| `OSC_ATTACK_TIME` | Oscillator envelope attack |
| `OSC_RELEASE_TIME` | Oscillator envelope release |
| `OSC_TOTAL_DURATION` | Total oscillator duration |

---

## File References

| File | Responsibility |
|------|----------------|
| `src/engine/engine.ts` | AudioContext, scheduling loop, master bus |
| `src/engine/Track.ts` | Track class, sample loading, trigger logic |
| `src/ui/ui.ts` | DOM rendering, event listeners, visual feedback |
| `src/types/index.ts` | Type definitions, event interfaces |
| `src/config/constants.ts` | Application constants |
| `app.ts` | Bootstrap, pattern initialization, button wiring |
