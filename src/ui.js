import {
  audioCtx,
  tracks,
  STEPS,
  TRACK_COUNT,
  updateMixerGains,
  setBpm,
  getBpm,
} from "./engine.js";

let uiRaf = null;
let lastUiStep = -1;
let selectedTrack = 0;

function startUI(playbackStartTimeRef) {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  function frame() {
    updatePlayhead(playbackStartTimeRef);
    uiRaf = requestAnimationFrame(frame);
  }
  uiRaf = requestAnimationFrame(frame);
}

function stopUI() {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  uiRaf = null;
  document
    .querySelectorAll(".step--playhead")
    .forEach((el) => el.classList.remove("step--playhead"));
  lastUiStep = -1;
}

function updatePlayhead(playbackStartTimeRef) {
  const playbackStartTime = playbackStartTimeRef();
  if (playbackStartTime == null) return;
  const elapsed = audioCtx.currentTime - playbackStartTime;
  const dur = 1 / ((getBpm() / 60) * 4);
  if (dur <= 0) return;
  const floatStep = Math.floor(elapsed / dur);
  const uiStep = ((floatStep % STEPS) + STEPS) % STEPS;
  if (uiStep === lastUiStep) return;

  const displayRoot = document.querySelector(".track-display");
  if (!displayRoot) return;

  if (lastUiStep >= 0) {
    displayRoot
      .querySelectorAll(`.step[data-step="${lastUiStep}"]`)
      .forEach((el) => el.classList.remove("step--playhead"));
  }

  displayRoot
    .querySelectorAll(`.step[data-step="${uiStep}"]`)
    .forEach((el) => el.classList.add("step--playhead"));
  lastUiStep = uiStep;
}

function renderTrackUI(trackIndex) {
  const track = tracks[trackIndex];
  const display = document.querySelector(".track-display");
  const info = document.getElementById("track-info");
  if (!display) return;

  lastUiStep = -1;
  display.innerHTML = "";

  const header = document.createElement("div");
  header.className = "track";
  header.innerHTML = `
    <h2>Track ${trackIndex + 1}</h2>
    <div class="knobs">
      <label>
        Vol
        <input class="knob volume" type="range" min="0" max="1" step="0.01" value="${
          track.volume
        }" />
      </label>
      <label>
        Tone
        <input class="knob tone" type="range" min="100" max="8000" step="100" value="${
          track.filterFreq
        }" />
      </label>
    </div>
  `;

  const stepsWrap = document.createElement("div");
  stepsWrap.className = "steps";

  for (let s = 0; s < STEPS; s++) {
    const btn = document.createElement("button");
    btn.className = "step";
    btn.dataset.step = String(s);
    if (track.pattern[s] && track.pattern[s].trig) btn.classList.add("active");
    btn.addEventListener("click", () => {
      track.pattern[s].trig = !track.pattern[s].trig;
      btn.classList.toggle("active", track.pattern[s].trig);
    });
    stepsWrap.appendChild(btn);
  }

  header.appendChild(stepsWrap);
  display.appendChild(header);

  const volEl = display.querySelector(".volume");
  if (volEl)
    volEl.addEventListener("input", () => (track.volume = Number(volEl.value)));
  const toneEl = display.querySelector(".tone");
  if (toneEl)
    toneEl.addEventListener(
      "input",
      () => (track.filterFreq = Number(toneEl.value))
    );

  if (info) {
    const sampleLabel = track.sampleUrl
      ? track.sampleUrl.replace(/^.*\//, "")
      : "—";
    info.innerHTML = `<span class="meta">Track ${
      trackIndex + 1
    }</span><span>Sample: ${sampleLabel}</span><span>Vol: ${track.volume.toFixed(
      2
    )}</span><span>Tone: ${Math.round(track.filterFreq)}</span>`;
  }
}

function renderMixer() {
  const mixerRoot = document.getElementById("mixer");
  if (!mixerRoot) return;
  mixerRoot.innerHTML = "";
  const header = document.createElement("div");
  header.className = "track-info";
  header.innerHTML = `<div class="meta">Mixer</div><div class="muted">Mute / Solo per track</div>`;
  mixerRoot.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "mixer-grid";

  tracks.forEach((t, i) => {
    const ch = document.createElement("div");
    ch.className = "channel";
    ch.dataset.track = String(i);
    const hue = Math.round((i * 360) / Math.max(1, TRACK_COUNT));
    const color = `hsl(${hue} 75% 48%)`;
    ch.style.setProperty("--channel-accent", color);

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = t.sampleUrl
      ? t.sampleUrl.replace(/^.*\//, "")
      : `Track ${i + 1}`;

    const controls = document.createElement("div");
    controls.className = "controls";

    const mute = document.createElement("button");
    mute.className = "mute";
    mute.title = "Mute";
    mute.textContent = "M";
    mute.addEventListener("click", (e) => {
      e.stopPropagation();
      t.muted = !t.muted;
      updateMixerGains();
      updateMixerUI();
    });

    const solo = document.createElement("button");
    solo.className = "solo";
    solo.title = "Solo";
    solo.textContent = "S";
    solo.addEventListener("click", (e) => {
      e.stopPropagation();
      t.solo = !t.solo;
      updateMixerGains();
      updateMixerUI();
    });

    controls.appendChild(mute);
    controls.appendChild(solo);

    ch.appendChild(label);
    ch.appendChild(controls);

    ch.addEventListener("click", (e) => {
      if (
        e.target &&
        (e.target.classList.contains("mute") ||
          e.target.classList.contains("solo"))
      )
        return;
      selectedTrack = i;
      renderTrackUI(selectedTrack);
      updateMixerUI();
    });

    grid.appendChild(ch);
  });

  mixerRoot.appendChild(grid);
  updateMixerUI();
}

function updateMixerUI() {
  const grid = document.querySelector(".mixer-grid");
  if (!grid) return;
  grid.querySelectorAll(".channel").forEach((el) => {
    const idx = Number(el.dataset.track);
    const track = tracks[idx];
    const muteBtn = el.querySelector(".mute");
    const soloBtn = el.querySelector(".solo");
    if (muteBtn) muteBtn.classList.toggle("active", !!track.muted);
    if (soloBtn) soloBtn.classList.toggle("active", !!track.solo);
    el.classList.toggle("active", idx === selectedTrack);
  });
}

function init(playbackStartTimeRefGetter) {
  // Build UI shell
  const tracksContainer = document.querySelector(".tracks");
  if (tracksContainer) {
    tracksContainer.innerHTML = `
      <div class="sequencer-controls">
        <button id="prev-track" class="nav-btn" aria-label="Previous track">◀</button>
        <div class="track-screen">
          <div id="track-info" class="track-info"></div>
          <section class="track-display"></section>
        </div>
        <button id="next-track" class="nav-btn" aria-label="Next track">▶</button>
      </div>
    `;

    renderTrackUI(selectedTrack);
    renderMixer();

    document.getElementById("prev-track").addEventListener("click", () => {
      selectedTrack = (selectedTrack - 1 + TRACK_COUNT) % TRACK_COUNT;
      renderTrackUI(selectedTrack);
      updateMixerUI();
    });
    document.getElementById("next-track").addEventListener("click", () => {
      selectedTrack = (selectedTrack + 1) % TRACK_COUNT;
      renderTrackUI(selectedTrack);
      updateMixerUI();
    });
  }

  const bpmEl = document.getElementById("bpm");
  if (bpmEl) {
    bpmEl.value = getBpm();
    bpmEl.addEventListener("input", () => {
      setBpm(Number(bpmEl.value));
    });
  }

  // Play/Stop are handled by the application bootstrap (app2.js).
}

export { init, renderTrackUI, renderMixer, updateMixerUI, startUI, stopUI };
