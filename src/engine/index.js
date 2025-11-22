// Application-level config (shared constants)
import {
  DEFAULT_BPM,
  STEPS,
  TRACK_COUNT,
  FFT_SIZE,
  LOOKAHEAD,
  STEPS_PER_BEAT,
  DEFAULT_FILTER_FREQ,
  DEFAULT_FILTER_Q,
  DEFAULT_VOLUME,
} from "../config/index.js";

// Audio engine: audio context, Track, scheduling, and helper APIs
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Master output chain (master gain -> analyser -> destination)
const masterGain = audioCtx.createGain();
masterGain.gain.setValueAtTime(1, audioCtx.currentTime);
const analyser = audioCtx.createAnalyser();
// FFT size pulled from shared config
analyser.fftSize = FFT_SIZE;
masterGain.connect(analyser);
analyser.connect(audioCtx.destination);

class Track {
  constructor(context, sampleUrl, index = 0) {
    this.context = context;
    this.sampleUrl = sampleUrl;
    this.index = index;
    this.buffer = null;

    this.pattern = Array(STEPS)
      .fill(null)
      .map(() => ({
        trig: false,
        locks: {},
      }));

    this.volume = DEFAULT_VOLUME;
    this.filterFreq = DEFAULT_FILTER_FREQ;
    // filter type and resonance (Q)
    this.filterType = "lowpass";
    this.filterQ = 1;

    this.gainNode = context.createGain();
    // route track outputs into the master bus
    this.gainNode.connect(masterGain);
    // Channel fader level (0..1) — separate from per-hit envelope volume
    this.level = 1;
    this.gainNode.gain.setValueAtTime(this.level, this.context.currentTime);
    this.muted = false;
    this.solo = false;
  }

  async load() {
    try {
      const res = await fetch(this.sampleUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      this.buffer = await this.context.decodeAudioData(buf);
    } catch (err) {
      console.warn(`Could not load sample "${this.sampleUrl}":`, err);
      this.buffer = null;
    }
  }

  trigger(time, params = {}) {
    const merged = {
      volume: this.volume,
      filterFreq: this.filterFreq,
      ...params,
    };

    if (this.buffer) {
      const src = this.context.createBufferSource();
      src.buffer = this.buffer;

      const filter = this.context.createBiquadFilter();
      filter.type = merged.filterType || "lowpass";
      filter.frequency.value = merged.filterFreq;
      if (typeof merged.filterQ === "number") filter.Q.value = merged.filterQ;

      const env = this.context.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(merged.volume, time + 0.005);

      src.connect(filter);
      filter.connect(env);
      env.connect(this.gainNode);

      src.start(time);
    } else {
      // Oscillator fallback
      const osc = this.context.createOscillator();
      const baseFreq = 200 + (this.index % 8) * 60;
      osc.type = "square";
      osc.frequency.setValueAtTime(baseFreq, time);

      const filter = this.context.createBiquadFilter();
      filter.type = merged.filterType || "lowpass";
      filter.frequency.setValueAtTime(merged.filterFreq, time);
      try {
        if (typeof merged.filterQ === "number")
          filter.Q.setValueAtTime(merged.filterQ, time);
      } catch (e) {}

      const env = this.context.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(merged.volume, time + 0.02);
      env.gain.linearRampToValueAtTime(0, time + 0.18);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.gainNode);

      osc.start(time);
      osc.stop(time + 0.2);
    }
  }
}

// Sequencer state
let bpm = DEFAULT_BPM;

function stepDuration(localBpm = bpm) {
  const beatsPerSecond = localBpm / 60;
  return 1 / (beatsPerSecond * STEPS_PER_BEAT);
}

let isPlaying = false;
let currentStep = 0;
let nextEventTime = 0;
const lookahead = LOOKAHEAD;

let tracks = [];

function scheduleStep(stepIndex, time) {
  tracks.forEach((track) => {
    const step = track.pattern[stepIndex];
    if (!step || !step.trig) return;

    // notify UI that this track will trigger (UI can use this to flash mixers etc.)
    try {
      if (typeof document !== "undefined") {
        document.dispatchEvent(
          new CustomEvent("track-trigger", {
            detail: { trackIndex: track.index, step: stepIndex, time },
          })
        );
      }
    } catch (e) {
      // ignore (non-DOM environments)
    }

    track.trigger(time, step.locks);
  });
}

function scheduler() {
  if (!isPlaying) return;

  const now = audioCtx.currentTime;
  while (nextEventTime < now + lookahead) {
    scheduleStep(currentStep, nextEventTime);
    nextEventTime += stepDuration();
    currentStep = (currentStep + 1) % STEPS;
  }

  requestAnimationFrame(scheduler);
}

let playbackStartTime = 0;

async function start() {
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  isPlaying = true;
  currentStep = 0;
  nextEventTime = audioCtx.currentTime;
  playbackStartTime = audioCtx.currentTime;
  scheduler();
}

function stop() {
  isPlaying = false;
}

async function createTracksFromUrls(urls) {
  tracks = urls.map((url, i) => new Track(audioCtx, url, i));
  await Promise.all(tracks.map((t) => t.load()));
  return tracks;
}

// Mixer helper
function updateMixerGains() {
  const soloActive = tracks.some((t) => t.solo);
  const now = audioCtx.currentTime;
  tracks.forEach((t) => {
    const enabled = soloActive ? t.solo : !t.muted;
    const val = enabled ? 1 : 0;
    try {
      t.gainNode.gain.cancelScheduledValues(now);
      // multiply channel level by mute/solo state
      t.gainNode.gain.setValueAtTime(t.level * val, now);
    } catch (e) {
      // ignore
    }
  });
}

function getAnalyser() {
  return analyser;
}

function setTrackLevel(index, value, ramp = 0.03) {
  const t = tracks[index];
  if (!t) return;
  const now = audioCtx.currentTime;
  try {
    t.gainNode.gain.cancelScheduledValues(now);
    // ensure we start from the current scheduled value
    t.gainNode.gain.setValueAtTime(t.gainNode.gain.value, now);
    t.gainNode.gain.linearRampToValueAtTime(
      value * (t.muted || t.solo ? (t.solo ? 1 : 0) : 1),
      now + ramp
    );
  } catch (e) {
    try {
      t.gainNode.gain.setValueAtTime(value, now);
    } catch (e2) {
      // ignore
    }
  }
  t.level = value;
}

function setBpm(v) {
  bpm = v;
}

function getBpm() {
  return bpm;
}

export {
  audioCtx,
  Track,
  STEPS,
  TRACK_COUNT,
  stepDuration,
  start,
  stop,
  createTracksFromUrls,
  tracks,
  updateMixerGains,
  setTrackLevel,
  setBpm,
  getAnalyser,
  getBpm,
};
