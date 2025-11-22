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

    // per-channel fader control
    const faderWrap = document.createElement("div");
    faderWrap.className = "fader-wrap";
    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = "0";
    fader.max = "1";
    fader.step = "0.01";
    const currentLevel =
      typeof t.level === "number" ? t.level : t.gainNode?.gain?.value ?? 1;
    fader.value = String(currentLevel);
    fader.title = "Level";
    faderWrap.appendChild(fader);
    // bind fader to track gain with smoothing
    fader.addEventListener("input", () => {
      const v = Number(fader.value);
      const now = audioCtx.currentTime;
      try {
        t.gainNode.gain.cancelScheduledValues(now);
        t.gainNode.gain.setValueAtTime(t.gainNode.gain.value, now);
        const soloActive = tracks.some((x) => x.solo);
        const enabled = soloActive ? t.solo : !t.muted;
        const effective = v * (enabled ? 1 : 0);
        t.gainNode.gain.linearRampToValueAtTime(effective, now + 0.03);
      } catch (e) {
        try {
          t.gainNode.gain.setValueAtTime(v, now);
        } catch (e2) {}
      }
      t.level = v;
    });
    controls.appendChild(faderWrap);

    ch.appendChild(label);
    ch.appendChild(controls);

    ch.addEventListener("click", (e) => {
      if (
        e.target &&
        (e.target.classList.contains("mute") ||
          e.target.classList.contains("solo"))
      )
        return;
      // Toggle sequencer visibility when clicking the same channel;
      // otherwise select and show the sequencer for the clicked channel.
      const trackScreen = document.querySelector(".track-screen");
      const wasSelected = selectedTrack === i;
      if (wasSelected && trackScreen) {
        trackScreen.classList.toggle("collapsed");
      } else {
        if (trackScreen) trackScreen.classList.remove("collapsed");
        selectedTrack = i;
        renderTrackUI(selectedTrack);
      }
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
    const faderEl = el.querySelector(".fader-wrap input");
    if (faderEl) {
      const val =
        typeof track.level === "number"
          ? track.level
          : track.gainNode?.gain?.value ?? 1;
      faderEl.value = String(val);
    }
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

  // Keyboard shortcuts: keys 1..N select tracks (toggle if same key pressed twice)
  window.addEventListener("keydown", (e) => {
    try {
      const tgt = e.target;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      )
        return;

      const k = e.key;
      if (!/^[1-9]$/.test(k)) return;
      const idx = Number(k) - 1;
      if (idx < 0 || idx >= TRACK_COUNT) return;

      const trackScreen = document.querySelector(".track-screen");
      if (selectedTrack === idx) {
        if (trackScreen) trackScreen.classList.toggle("collapsed");
      } else {
        if (trackScreen) trackScreen.classList.remove("collapsed");
        selectedTrack = idx;
        renderTrackUI(selectedTrack);
      }
      updateMixerUI();
    } catch (err) {
      console.warn("Keyboard handler error", err);
    }
  });
}

export { init, renderTrackUI, renderMixer, updateMixerUI, startUI, stopUI };
