import { audioCtx, tracks, updateMixerGains, setBpm, getBpm, getAnalyser } from '../engine.js';
import { STEPS, TRACK_COUNT } from '../config/constants.js';

let uiRaf = null;
let lastUiStep = -1;
let selectedTrack = 0;
let scopeRaf = null;
let scopeCanvas = null;
let scopeCtx = null;
let analyserNode = null;
let scopeData = null;
// map to hold pending flash timeouts per channel
const _flashTimeouts = new Map();

// listen for scheduled trigger events from the engine
if (typeof document !== 'undefined') {
  document.addEventListener('track-trigger', (e) => {
    try {
      const idx = e?.detail?.trackIndex;
      if (typeof idx === 'number') flashChannel(idx);
    } catch (err) {
      /* ignore */
    }
  });
}

function startUI(playbackStartTimeRef) {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  function frame() {
    updatePlayhead(playbackStartTimeRef);
    uiRaf = requestAnimationFrame(frame);
  }
  uiRaf = requestAnimationFrame(frame);
  startScope();
}

function stopUI() {
  if (uiRaf) cancelAnimationFrame(uiRaf);
  uiRaf = null;
  document
    .querySelectorAll('.step--playhead')
    .forEach((el) => el.classList.remove('step--playhead'));
  lastUiStep = -1;
  stopScope();
}

function initScopeCanvas() {
  scopeCanvas = document.getElementById('scope-canvas');
  if (!scopeCanvas) return false;
  const dpr = window.devicePixelRatio || 1;
  const rect = scopeCanvas.getBoundingClientRect();
  scopeCanvas.width = Math.max(300, rect.width * dpr);
  scopeCanvas.height = Math.max(120, rect.height * dpr);
  scopeCtx = scopeCanvas.getContext('2d');
  scopeCtx.scale(dpr, dpr);
  analyserNode = getAnalyser();
  if (!analyserNode) return false;
  const size = analyserNode.fftSize || 2048;
  scopeData = new Uint8Array(size);
  return true;
}

function drawScope() {
  if (!scopeCtx || !analyserNode) return;
  const rect = scopeCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  analyserNode.getByteTimeDomainData(scopeData);

  scopeCtx.clearRect(0, 0, w, h);
  // background
  scopeCtx.fillStyle = 'rgba(0,0,0,0.02)';
  scopeCtx.fillRect(0, 0, w, h);

  scopeCtx.lineWidth = 2;
  scopeCtx.strokeStyle = 'hsl(160 80% 60%)';
  scopeCtx.beginPath();
  const step = scopeData.length / w;
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * step);
    const v = scopeData[idx] / 128.0 - 1.0;
    const y = h / 2 + v * (h / 2) * 0.9;
    if (x === 0) scopeCtx.moveTo(x, y);
    else scopeCtx.lineTo(x, y);
  }
  scopeCtx.stroke();

  scopeRaf = requestAnimationFrame(drawScope);
}

function startScope() {
  if (scopeRaf) return;
  if (!initScopeCanvas()) return;
  drawScope();
}

function stopScope() {
  if (scopeRaf) cancelAnimationFrame(scopeRaf);
  scopeRaf = null;
}

function updatePlayhead(playbackStartTimeRef) {
  const playbackStartTime = playbackStartTimeRef();
  if (playbackStartTime === null) return;
  const elapsed = audioCtx.currentTime - playbackStartTime;
  const dur = 1 / ((getBpm() / 60) * 4);
  if (dur <= 0) return;
  const floatStep = Math.floor(elapsed / dur);
  const uiStep = ((floatStep % STEPS) + STEPS) % STEPS;
  if (uiStep === lastUiStep) return;

  const displayRoot = document.querySelector('.track-display');
  if (!displayRoot) return;

  if (lastUiStep >= 0) {
    displayRoot
      .querySelectorAll(`.step[data-step="${lastUiStep}"]`)
      .forEach((el) => el.classList.remove('step--playhead'));
  }

  displayRoot
    .querySelectorAll(`.step[data-step="${uiStep}"]`)
    .forEach((el) => el.classList.add('step--playhead'));
  lastUiStep = uiStep;
}

function renderTrackUI(trackIndex) {
  const track = tracks[trackIndex];
  const display = document.querySelector('.track-display');
  const info = document.getElementById('track-info');
  if (!display) return;

  lastUiStep = -1;
  display.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'track';
  header.innerHTML = `
    <h2>Track ${trackIndex + 1}</h2>
  `;

  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'steps';

  // per-track accent color mapped to the steps (used for active triggers)
  const hue = Math.round((trackIndex * 360) / Math.max(1, TRACK_COUNT));
  const color = `hsl(${hue} 75% 48%)`;
  stepsWrap.style.setProperty('--track-accent', color);

  for (let s = 0; s < STEPS; s++) {
    const btn = document.createElement('button');
    btn.className = 'step';
    btn.dataset.step = String(s);
    if (track.pattern[s] && track.pattern[s].trig) btn.classList.add('active');
    btn.addEventListener('click', () => {
      track.pattern[s].trig = !track.pattern[s].trig;
      btn.classList.toggle('active', track.pattern[s].trig);
    });
    stepsWrap.appendChild(btn);
  }

  header.appendChild(stepsWrap);
  display.appendChild(header);

  // No per-track knobs in the sequencer view — the sequencer only displays triggers.
  if (info) {
    const sampleLabel = track.sampleUrl ? track.sampleUrl.replace(/^.*\//, '') : '—';
    info.innerHTML = '';
    const metaSpan = document.createElement('span');
    metaSpan.className = 'meta';
    metaSpan.textContent = `Track ${trackIndex + 1}`;
    const sampleSpan = document.createElement('span');
    sampleSpan.textContent = `Sample: ${sampleLabel}`;
    info.appendChild(metaSpan);
    info.appendChild(sampleSpan);
  }
}

function renderMixer() {
  const mixerRoot = document.getElementById('mixer');
  if (!mixerRoot) return;
  mixerRoot.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'track-info';
  header.innerHTML = `<div class="meta">Mixer</div><div class="muted">Mute / Solo per track</div>`;
  mixerRoot.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'mixer-grid';

  tracks.forEach((t, i) => {
    const ch = document.createElement('div');
    ch.className = 'channel';
    ch.dataset.track = String(i);
    const hue = Math.round((i * 360) / Math.max(1, TRACK_COUNT));
    const color = `hsl(${hue} 75% 48%)`;
    ch.style.setProperty('--channel-accent', color);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = t.sampleUrl ? t.sampleUrl.replace(/^.*\//, '') : `Track ${i + 1}`;

    const controls = document.createElement('div');
    controls.className = 'controls';

    const mute = document.createElement('button');
    mute.className = 'mute';
    mute.title = 'Mute';
    mute.textContent = 'M';
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      t.muted = !t.muted;
      updateMixerGains();
      updateMixerUI();
    });

    const solo = document.createElement('button');
    solo.className = 'solo';
    solo.title = 'Solo';
    solo.textContent = 'S';
    solo.addEventListener('click', (e) => {
      e.stopPropagation();
      t.solo = !t.solo;
      updateMixerGains();
      updateMixerUI();
    });

    controls.appendChild(mute);
    controls.appendChild(solo);

    // per-channel fader control
    const faderWrap = document.createElement('div');
    faderWrap.className = 'fader-wrap';
    const fader = document.createElement('input');
    fader.type = 'range';
    fader.min = '0';
    fader.max = '1';
    fader.step = '0.01';
    const currentLevel = typeof t.level === 'number' ? t.level : (t.gainNode?.gain?.value ?? 1);
    fader.value = String(currentLevel);
    fader.title = 'Level';
    faderWrap.appendChild(fader);
    // bind fader to track gain with smoothing
    fader.addEventListener('input', () => {
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
        } catch (e2) {
          // Ignore - AudioContext may be in invalid state
        }
      }
      t.level = v;
    });
    controls.appendChild(faderWrap);

    ch.appendChild(label);
    ch.appendChild(controls);

    ch.addEventListener('click', (e) => {
      if (
        e.target &&
        (e.target.classList.contains('mute') || e.target.classList.contains('solo'))
      ) {
        return;
      }
      // select and show the sequencer for the clicked channel.
      const trackScreen = document.querySelector('.track-screen');
      const wasSelected = selectedTrack === i;
      if (wasSelected && trackScreen) {
        return; //TO DO: play track
      } else {
        if (trackScreen) trackScreen.classList.remove('collapsed');
        selectedTrack = i;
        renderTrackUI(selectedTrack);
        renderFilterUI(selectedTrack);
      }
      updateMixerUI();
    });

    grid.appendChild(ch);
  });

  mixerRoot.appendChild(grid);
  updateMixerUI();
}

function flashChannel(index, ms = 160) {
  const el = document.querySelector(`.mixer-grid .channel[data-track="${index}"]`);
  if (!el) return;
  // clear existing timeout
  const prev = _flashTimeouts.get(index);
  if (prev) {
    clearTimeout(prev);
    _flashTimeouts.delete(index);
  }
  el.classList.add('channel--hit');
  const tid = setTimeout(() => {
    el.classList.remove('channel--hit');
    _flashTimeouts.delete(index);
  }, ms);
  _flashTimeouts.set(index, tid);
}

// Render filter controls for the selected track into the right-side filter panel
function renderFilterUI(trackIndex) {
  const panel = document.getElementById('filter');
  if (!panel) return;
  const track = tracks[trackIndex];
  panel.innerHTML = '';

  const FREQ_MIN = 20;
  const FREQ_MAX = 20000;
  const Q_MIN = 0.1;
  const Q_MAX = 30;

  const title = document.createElement('h3');
  title.textContent = `Filter — Track ${trackIndex + 1}`;
  panel.appendChild(title);

  const sampleLabel = document.createElement('div');
  sampleLabel.className = 'filter-note';
  sampleLabel.textContent = track.sampleUrl ? track.sampleUrl.replace(/^.*\//, '') : '—';
  panel.appendChild(sampleLabel);

  // Type buttons
  const types = [
    ['lowpass', 'LP'],
    ['highpass', 'HP'],
    ['bandpass', 'BP'],
    ['notch', 'NT'],
    ['allpass', 'AP'],
    ['peaking', 'PK'],
  ];
  const typeRow = document.createElement('div');
  typeRow.className = 'filter-type-row';
  types.forEach(([val, label]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-type-btn';
    btn.type = 'button';
    btn.textContent = label;
    if (track.filterType === val) btn.classList.add('active');
    btn.addEventListener('click', () => {
      track.filterType = val;
      typeRow
        .querySelectorAll('.filter-type-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
    typeRow.appendChild(btn);
  });
  panel.appendChild(typeRow);

  // Frequency slider
  const rowFreq = document.createElement('div');
  rowFreq.className = 'filter-row';

  const lblFreqText = document.createElement('span');
  lblFreqText.textContent = 'Freq';

  const freqDisplay = document.createElement('span');
  freqDisplay.className = 'filter-value';
  freqDisplay.textContent = `${Math.round(track.filterFreq || 2000)}Hz`;

  const freq = document.createElement('input');
  freq.type = 'range';
  freq.min = '0';
  freq.max = '1000';
  freq.step = '1';

  // Convert frequency to logarithmic slider position
  const freqToSlider = (f) => {
    const logMin = Math.log10(FREQ_MIN);
    const logMax = Math.log10(FREQ_MAX);
    const logF = Math.log10(f);
    return ((logF - logMin) / (logMax - logMin)) * 1000;
  };
  const sliderToFreq = (s) => {
    const logMin = Math.log10(FREQ_MIN);
    const logMax = Math.log10(FREQ_MAX);
    const t = s / 1000;
    return Math.pow(10, logMin + t * (logMax - logMin));
  };

  freq.value = String(freqToSlider(track.filterFreq || 2000));
  freq.className = 'control';
  freq.addEventListener('input', () => {
    const newFreq = sliderToFreq(Number(freq.value));
    track.filterFreq = newFreq;
    freqDisplay.textContent = `${Math.round(newFreq)}Hz`;
  });

  rowFreq.appendChild(lblFreqText);
  rowFreq.appendChild(freqDisplay);
  rowFreq.appendChild(freq);
  panel.appendChild(rowFreq);

  // Q (Resonance) slider
  const rowQ = document.createElement('div');
  rowQ.className = 'filter-row';

  const lblQText = document.createElement('span');
  lblQText.textContent = 'Res';

  const qDisplay = document.createElement('span');
  qDisplay.className = 'filter-value';
  qDisplay.textContent = (track.filterQ || 1).toFixed(2);

  const q = document.createElement('input');
  q.type = 'range';
  q.min = '0';
  q.max = '1000';
  q.step = '1';

  // Convert Q to logarithmic slider position
  const qToSlider = (qVal) => {
    const logMin = Math.log10(Q_MIN);
    const logMax = Math.log10(Q_MAX);
    const logQ = Math.log10(qVal);
    return ((logQ - logMin) / (logMax - logMin)) * 1000;
  };
  const sliderToQ = (s) => {
    const logMin = Math.log10(Q_MIN);
    const logMax = Math.log10(Q_MAX);
    const t = s / 1000;
    return Math.pow(10, logMin + t * (logMax - logMin));
  };

  q.value = String(qToSlider(track.filterQ || 1));
  q.className = 'control';
  q.addEventListener('input', () => {
    const newQ = sliderToQ(Number(q.value));
    track.filterQ = newQ;
    qDisplay.textContent = newQ.toFixed(2);
  });

  rowQ.appendChild(lblQText);
  rowQ.appendChild(qDisplay);
  rowQ.appendChild(q);
  panel.appendChild(rowQ);
}

function updateMixerUI() {
  const grid = document.querySelector('.mixer-grid');
  if (!grid) return;
  grid.querySelectorAll('.channel').forEach((el) => {
    const idx = Number(el.dataset.track);
    const track = tracks[idx];
    const muteBtn = el.querySelector('.mute');
    const soloBtn = el.querySelector('.solo');
    if (muteBtn) muteBtn.classList.toggle('active', !!track.muted);
    if (soloBtn) soloBtn.classList.toggle('active', !!track.solo);
    const faderEl = el.querySelector('.fader-wrap input');
    if (faderEl) {
      const val =
        typeof track.level === 'number' ? track.level : (track.gainNode?.gain?.value ?? 1);
      faderEl.value = String(val);
    }
    el.classList.toggle('active', idx === selectedTrack);
  });
}

function init(playbackStartTimeRefGetter) {
  // Build UI shell
  const tracksContainer = document.querySelector('.tracks');
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
    renderFilterUI(selectedTrack);

    document.getElementById('prev-track').addEventListener('click', () => {
      selectedTrack = (selectedTrack - 1 + TRACK_COUNT) % TRACK_COUNT;
      renderTrackUI(selectedTrack);
      updateMixerUI();
      renderFilterUI(selectedTrack);
    });
    document.getElementById('next-track').addEventListener('click', () => {
      selectedTrack = (selectedTrack + 1) % TRACK_COUNT;
      renderTrackUI(selectedTrack);
      updateMixerUI();
      renderFilterUI(selectedTrack);
    });
  }

  const bpmEl = document.getElementById('bpm');
  if (bpmEl) {
    bpmEl.value = getBpm();
    bpmEl.addEventListener('input', () => {
      setBpm(Number(bpmEl.value));
    });
  }

  // Play/Stop are handled by the application bootstrap (app2.js).

  // Keyboard shortcuts: keys 1..N select tracks (toggle if same key pressed twice)
  window.addEventListener('keydown', (e) => {
    try {
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        return;
      }

      const k = e.key;
      if (!/^[1-9]$/.test(k)) return;
      const idx = Number(k) - 1;
      if (idx < 0 || idx >= TRACK_COUNT) return;

      const trackScreen = document.querySelector('.track-screen');
      if (selectedTrack === idx) {
        if (trackScreen) {
          return; //TO DO: play track
        }
      } else {
        if (trackScreen) trackScreen.classList.remove('collapsed');
        selectedTrack = idx;
        renderTrackUI(selectedTrack);
        renderFilterUI(selectedTrack);
      }
      updateMixerUI();
    } catch (err) {
      console.warn('Keyboard handler error', err);
    }
  });
}

export { init, renderTrackUI, renderMixer, updateMixerUI, startUI, stopUI };
