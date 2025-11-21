const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

class Track {
  constructor(context, sampleUrl, index = 0) {
    this.context = context;
    this.sampleUrl = sampleUrl;
    this.index = index;
    this.buffer = null;

    this.pattern = Array(16)
      .fill(null)
      .map(() => ({
        trig: false,
        locks: {},
      }));

    this.volume = 0.8;
    this.filterFreq = 2000;

    this.gainNode = context.createGain();
    this.gainNode.connect(context.destination);
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
      filter.type = "lowpass";
      filter.frequency.value = merged.filterFreq;

      const env = this.context.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(merged.volume, time + 0.005);

      src.connect(filter);
      filter.connect(env);
      env.connect(this.gainNode);

      src.start(time);
    } else {
      // Oscillator fallback so missing samples still make audible feedback
      const osc = this.context.createOscillator();
      // Map track index to a frequency spread for quick distinction
      const baseFreq = 200 + (this.index % 8) * 60;
      osc.type = "square";
      osc.frequency.setValueAtTime(baseFreq, time);

      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(merged.filterFreq, time);

      const env = this.context.createGain();
      env.gain.setValueAtTime(0.0001, time);
      // quick attack, fast decay for percussive feel
      env.gain.exponentialRampToValueAtTime(
        Math.max(0.001, merged.volume),
        time + 0.002
      );
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.gainNode);

      osc.start(time);
      // stop shortly after the decay
      try {
        osc.stop(time + 0.2);
      } catch (e) {
        // some browsers throw if stop called twice — ignore
      }
    }
  }
}

let bpm = 120;
const STEPS = 16;
const TRACK_COUNT = 8;

function stepDuration() {
  const beatsPerSecond = bpm / 60;
  const stepsPerBeat = 4; // if 16 steps per bar: 4 steps per beat
  return 1 / (beatsPerSecond * stepsPerBeat);
}

let isPlaying = false;
let currentStep = 0;
let nextEventTime = 0;
const lookahead = 0.1; // seconds

function scheduleStep(stepIndex, time) {
  tracks.forEach((track) => {
    const step = track.pattern[stepIndex];
    if (!step || !step.trig) return;

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

async function start() {
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  isPlaying = true;
  currentStep = 0;
  nextEventTime = audioCtx.currentTime;
  playbackStartTime = audioCtx.currentTime;
  scheduler();
  startUI();
}

function stop() {
  isPlaying = false;
  stopUI();
}

let tracks = [];
let playbackStartTime = 0;
let uiRaf = null;
let lastUiStep = -1;

function startUI() {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  function frame() {
    updatePlayhead();
    uiRaf = requestAnimationFrame(frame);
  }
  uiRaf = requestAnimationFrame(frame);
}

function stopUI() {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  uiRaf = null;
  // remove playhead markers
  document
    .querySelectorAll(".step--playhead")
    .forEach((el) => el.classList.remove("step--playhead"));
  lastUiStep = -1;
}

function updatePlayhead() {
  if (!isPlaying) return;
  const elapsed = audioCtx.currentTime - playbackStartTime;
  const dur = stepDuration();
  if (dur <= 0) return;
  const floatStep = Math.floor(elapsed / dur);
  const uiStep = ((floatStep % STEPS) + STEPS) % STEPS;

  if (uiStep === lastUiStep) return;

  // remove previous
  if (lastUiStep >= 0) {
    document
      .querySelectorAll(`.step[data-step="${lastUiStep}"]`)
      .forEach((el) => el.classList.remove("step--playhead"));
  }

  // add new
  document
    .querySelectorAll(`.step[data-step="${uiStep}"]`)
    .forEach((el) => el.classList.add("step--playhead"));
  lastUiStep = uiStep;
}

async function main() {
  const sampleUrls = [
    "samples/kick1.wav",
    "samples/snare.wav",
    "samples/hat1.wav",
    "samples/hat2.wav",
    "samples/clap.wav",
    "samples/perc1.wav",
    "samples/perc2.wav",
    "samples/perc3.wav",
  ];

  tracks = sampleUrls.map((url, i) => new Track(audioCtx, url, i));

  await Promise.all(tracks.map((t) => t.load()));

  [0, 4, 8, 12].forEach((stepIdx) => {
    tracks[0].pattern[stepIdx].trig = true;
  });

  [4, 12].forEach((stepIdx) => {
    tracks[1].pattern[stepIdx].trig = true;
  });

  for (let i = 0; i < STEPS; i += 2) {
    tracks[2].pattern[i].trig = true;
  }
  tracks[2].pattern[4].locks.volume = 0.5;
  tracks[2].pattern[12].locks.volume = 0.5;

  [10, 11, 14, 15].forEach((stepIdx) => {
    tracks[3].pattern[stepIdx].trig = true;
  });

  tracks[0].volume = 0.9;
  tracks[1].volume = 0.8;
  tracks[2].volume = 0.6;
  tracks[3].volume = 0.7;

  tracks[2].filterFreq = 8000;
  tracks[0].filterFreq = 2000;

  // Build the UI dynamically so tracks/steps always match the engine
  const tracksContainer = document.querySelector(".tracks");
  if (tracksContainer) {
    tracksContainer.innerHTML = "";

    for (let t = 0; t < TRACK_COUNT; t++) {
      const trackEl = document.createElement("section");
      trackEl.className = "track";
      trackEl.dataset.track = String(t);

      trackEl.innerHTML = `
        <h2>Track ${t + 1}</h2>
        <div class="knobs">
          <label>
            Vol
            <input class="knob volume" type="range" min="0" max="1" step="0.01" value="${
              tracks[t] ? tracks[t].volume : 0.8
            }" />
          </label>
          <label>
            Tone
            <input class="knob tone" type="range" min="100" max="8000" step="100" value="${
              tracks[t] ? tracks[t].filterFreq : 2000
            }" />
          </label>
        </div>
        <div class="steps">
        </div>
      `;

      const stepsEl = trackEl.querySelector(".steps");
      for (let s = 0; s < STEPS; s++) {
        const btn = document.createElement("button");
        btn.className = "step";
        btn.dataset.step = String(s);
        stepsEl.appendChild(btn);
      }

      tracksContainer.appendChild(trackEl);
    }
  }

  const bpmEl = document.getElementById("bpm");
  if (bpmEl) {
    bpmEl.value = bpm;
    bpmEl.addEventListener("input", () => {
      bpm = Number(bpmEl.value);
    });
  }

  const playBtn = document.getElementById("play-btn");
  const stopBtn = document.getElementById("stop-btn");

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      start();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stop();
    });
  }

  // Bind events for the dynamically-created track UI
  document.querySelectorAll(".track").forEach((trackEl) => {
    const trackIndex = Number(trackEl.dataset.track);
    const track = tracks[trackIndex];
    if (!track) return;

    trackEl.querySelectorAll(".step").forEach((stepBtn) => {
      const stepIndex = Number(stepBtn.dataset.step);
      const step = track.pattern[stepIndex];

      if (step && step.trig) stepBtn.classList.add("active");

      stepBtn.addEventListener("click", () => {
        step.trig = !step.trig;
        stepBtn.classList.toggle("active", step.trig);
      });
    });

    const volEl = trackEl.querySelector(".volume");
    if (volEl) {
      volEl.value = track.volume;
      volEl.addEventListener("input", () => {
        track.volume = Number(volEl.value);
      });
    }

    const toneEl = trackEl.querySelector(".tone");
    if (toneEl) {
      toneEl.value = track.filterFreq;
      toneEl.addEventListener("input", () => {
        track.filterFreq = Number(toneEl.value);
      });
    }
  });

  console.log("Demo preset initialised – press Play!");
}

main().catch(console.error);
