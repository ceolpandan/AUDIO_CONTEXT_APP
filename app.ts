import { STEPS, defaultBPM, sampleUrls } from './src/config/constants.ts';
// New app entry point. Boots engine + UI modules.
import {
    audioCtx,
    createTracksFromUrls,
    start as engineStart,
    stop as engineStop,
    setBpm,
    tracks,
    updateMixerGains,
} from './src/engine.ts';
import { startUI, stopUI, init as uiInit, updateMixerUI } from './src/ui.ts';

let playbackStartTime: number | null = null;

async function boot(): Promise<void> {
    await createTracksFromUrls([...sampleUrls]);
    setBpm(defaultBPM);

    if (tracks && tracks.length > 0) {
        for (const track of tracks) {
            for (const pattern of track.pattern) {
                pattern.trig = false;
            }
        }
        // Track mapping:
        // 0: kick, 1: snare, 2: closed hat, 3: open hat, 4: clap, 5: perc1, 6: perc2, 7: perc3

        // Kick (punchy hiphop pattern)
        [0, 3, 7, 10, 12].forEach((s) => {
            if (tracks[0]?.pattern[s]) {
                tracks[0].pattern[s].trig = true;
            }
        });

        // Snare on backbeat
        [4, 12].forEach((s) => {
            if (tracks[1]?.pattern[s]) {
                tracks[1].pattern[s].trig = true;
            }
        });

        // Closed hats: steady 8th notes (every 2 steps)
        for (let s = 0; s < STEPS; s += 2) {
            if (tracks[2]?.pattern[s]) {
                tracks[2].pattern[s].trig = true;
            }
        }

        // Open hat accents
        [6, 14].forEach((s) => {
            if (tracks[3]?.pattern[s]) {
                tracks[3].pattern[s].trig = true;
            }
        });

        // Clap layered with snare for feel
        [4, 12].forEach((s) => {
            if (tracks[4]?.pattern[s]) {
                tracks[4].pattern[s].trig = true;
            }
        });

        // Percussion: shuffled syncopation
        [2, 6, 11, 15].forEach((s) => {
            if (tracks[5]?.pattern[s]) {
                tracks[5].pattern[s].trig = true;
            }
        });

        // Low percussion hits for groove
        [8, 14].forEach((s) => {
            if (tracks[6]?.pattern[s]) {
                tracks[6].pattern[s].trig = true;
            }
        });

        // Flavor percussion
        [7, 13].forEach((s) => {
            if (tracks[7]?.pattern[s]) {
                tracks[7].pattern[s].trig = true;
            }
        });

        // channel volumes
        if (tracks[0]) {
            tracks[0].volume = 1.0; // kick
        }
        if (tracks[1]) {
            tracks[1].volume = 0.9; // snare
        }
        if (tracks[2]) {
            tracks[2].volume = 0.55; // hats
        }
        if (tracks[3]) {
            tracks[3].volume = 0.5; // open hat
        }
        if (tracks[4]) {
            tracks[4].volume = 0.6; // clap
        }
        if (tracks[5]) {
            tracks[5].volume = 0.6;
        }
        if (tracks[6]) {
            tracks[6].volume = 0.5;
        }
        if (tracks[7]) {
            tracks[7].volume = 0.45;
        }

        // gentle filter tweaks for character
        if (tracks[0]) {
            tracks[0].filterFreq = 1800;
        }
        if (tracks[1]) {
            tracks[1].filterFreq = 2200;
        }
        if (tracks[2]) {
            tracks[2].filterFreq = 7000;
        }
    }

    // initialise the UI; provide a getter for playback start time for playhead sync
    uiInit(() => playbackStartTime);

    // Wire play/stop to set playbackStartTime for UI
    const playBtn = document.getElementById('play-btn') as HTMLButtonElement | null;
    const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement | null;
    if (playBtn) {
        playBtn.addEventListener('click', async () => {
            await engineStart();
            // use exported audioCtx for an accurate time reference
            playbackStartTime = audioCtx.currentTime;
            // start UI playhead loop
            startUI(() => playbackStartTime);
        });
    }
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            engineStop();
            playbackStartTime = null;
            stopUI();
        });
    }

    // initial mixer UI update
    updateMixerGains();
    updateMixerUI();

    console.log('App booted — press Play');
}

boot().catch((err: Error) => console.error('Boot failed:', err));
