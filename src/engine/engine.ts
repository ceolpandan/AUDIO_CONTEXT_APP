// Application-level config (shared constants)
import { DEFAULT_BPM, FFT_SIZE, LOOKAHEAD, STEPS, STEPS_PER_BEAT } from '../config/constants.ts';
import type { TrackTriggerEventDetail } from '../types/index.ts';
import { Track } from './Track.ts';

// Audio engine: audio context, Track, scheduling, and helper APIs
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioCtx: AudioContext = new AudioContextClass();

// Master output chain (master gain -> analyser -> destination)
const masterGain: GainNode = audioCtx.createGain();
masterGain.gain.setValueAtTime(1, audioCtx.currentTime);
const analyser: AnalyserNode = audioCtx.createAnalyser();
// FFT size pulled from shared config
analyser.fftSize = FFT_SIZE;
masterGain.connect(analyser);
analyser.connect(audioCtx.destination);

// Sequencer state
let bpm: number = DEFAULT_BPM;

function stepDuration(localBpm: number = bpm): number {
    const beatsPerSecond = localBpm / 60;
    return 1 / (beatsPerSecond * STEPS_PER_BEAT);
}

let isPlaying = false;
let currentStep = 0;
let nextEventTime = 0;
const lookahead: number = LOOKAHEAD;

let tracks: Track[] = [];

function scheduleStep(stepIndex: number, time: number): void {
    for (const track of tracks) {
        const step = track.pattern[stepIndex];
        if (!step?.trig) {
            return;
        }
        // notify UI that this track will trigger (UI can use this to flash mixers etc.)
        try {
            if (typeof document !== 'undefined') {
                const detail: TrackTriggerEventDetail = {
                    trackIndex: track.index,
                    step: stepIndex,
                    time,
                };
                document.dispatchEvent(new CustomEvent('track-trigger', { detail }));
            }
        } catch (e) {
            const error = e as Error;
            console.log(`Exception while doing something: ${error.message}`);
        }

        track.trigger(time, step.locks);
    }
}

function scheduler(): void {
    if (!isPlaying) {
        return;
    }

    const now = audioCtx.currentTime;
    while (nextEventTime < now + lookahead) {
        scheduleStep(currentStep, nextEventTime);
        nextEventTime += stepDuration();
        currentStep = (currentStep + 1) % STEPS;
    }

    requestAnimationFrame(scheduler);
}

async function start(): Promise<void> {
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    isPlaying = true;
    currentStep = 0;
    nextEventTime = audioCtx.currentTime;
    scheduler();
}

function stop(): void {
    isPlaying = false;
}

async function createTracksFromUrls(urls: string[]): Promise<Track[]> {
    tracks = urls.map((url, i) => new Track(audioCtx, url, masterGain, i));
    await Promise.all(tracks.map((t) => t.load()));
    return tracks;
}

// Mixer helper
function updateMixerGains(): void {
    const soloActive = tracks.some((t) => t.solo);
    const now = audioCtx.currentTime;
    for (const track of tracks) {
        const enabled = soloActive ? track.solo : !track.muted;
        const val = enabled ? 1 : 0;
        try {
            track.gainNode.gain.cancelScheduledValues(now);
            // multiply channel level by mute/solo state
            track.gainNode.gain.setValueAtTime(track.level * val, now);
        } catch (e) {
            const error = e as Error;
            console.log(`Exception while doing something: ${error.message}`);
        }
    }
}

function getAnalyser(): AnalyserNode {
    return analyser;
}

function setTrackLevel(index: number, value: number, ramp = 0.03): void {
    const t = tracks[index];
    if (!t) {
        return;
    }
    const now = audioCtx.currentTime;
    try {
        t.gainNode.gain.cancelScheduledValues(now);
        // ensure we start from the current scheduled value
        t.gainNode.gain.setValueAtTime(t.gainNode.gain.value, now);
        t.gainNode.gain.linearRampToValueAtTime(
            value * (t.muted || t.solo ? (t.solo ? 1 : 0) : 1),
            now + ramp
        );
    } catch (_e) {
        try {
            t.gainNode.gain.setValueAtTime(value, now);
        } catch (_e2) {
            // ignore
        }
    }
    t.level = value;
}

function setBpm(v: number): void {
    bpm = v;
}

function getBpm(): number {
    return bpm;
}

export {
    audioCtx,
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
