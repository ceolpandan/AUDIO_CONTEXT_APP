// New app entry point. Boots engine + UI modules.
import {
  audioCtx,
  createTracksFromUrls,
  tracks,
  start as engineStart,
  stop as engineStop,
  updateMixerGains,
} from "./src/engine.js";
import { init as uiInit, updateMixerUI, startUI, stopUI } from "./src/ui.js";

let playbackStartTime = null;

function getPlaybackStartTime() {
  return playbackStartTime;
}

async function boot() {
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

  await createTracksFromUrls(sampleUrls);

  // small demo patterns so steps are visible
  if (tracks && tracks.length > 0) {
    [0, 4, 8, 12].forEach((stepIdx) => {
      if (tracks[0] && tracks[0].pattern[stepIdx])
        tracks[0].pattern[stepIdx].trig = true;
    });
    [4, 12].forEach((stepIdx) => {
      if (tracks[1] && tracks[1].pattern[stepIdx])
        tracks[1].pattern[stepIdx].trig = true;
    });
    for (let i = 0; i < 16; i += 2) {
      if (tracks[2] && tracks[2].pattern[i]) tracks[2].pattern[i].trig = true;
    }
    [10, 11, 14, 15].forEach((stepIdx) => {
      if (tracks[3] && tracks[3].pattern[stepIdx])
        tracks[3].pattern[stepIdx].trig = true;
    });

    // small channel tweaks
    if (tracks[0]) tracks[0].volume = 0.9;
    if (tracks[1]) tracks[1].volume = 0.8;
    if (tracks[2]) tracks[2].volume = 0.6;
    if (tracks[3]) tracks[3].volume = 0.7;

    if (tracks[2]) tracks[2].filterFreq = 8000;
    if (tracks[0]) tracks[0].filterFreq = 2000;
  }

  // initialise the UI; provide a getter for playback start time for playhead sync
  uiInit(() => playbackStartTime);

  // Wire play/stop to set playbackStartTime for UI
  const playBtn = document.getElementById("play-btn");
  const stopBtn = document.getElementById("stop-btn");
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      await engineStart();
      // use exported audioCtx for an accurate time reference
      playbackStartTime = audioCtx.currentTime;
      // start UI playhead loop
      startUI(() => playbackStartTime);
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      engineStop();
      playbackStartTime = null;
      stopUI();
    });
  }

  // initial mixer UI update
  updateMixerGains();
  updateMixerUI();

  console.log("App booted — press Play");
}

boot().catch((err) => console.error("Boot failed:", err));
