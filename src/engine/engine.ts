// Application-level config (shared constants)
import {
    DEFAULT_BPM,
    DEFAULT_FILTER_FREQ,
    DEFAULT_VOLUME,
    FFT_SIZE,
    LOOKAHEAD,
    OSC_ATTACK_TIME,
    OSC_BASE_FREQ,
    OSC_FREQ_STEP,
    OSC_RELEASE_TIME,
    OSC_TOTAL_DURATION,
    STEPS,
    STEPS_PER_BEAT,
    TRACK_COUNT,
} from '../config/constants.ts';
import type {
    FilterType,
    PatternStep,
    TrackTriggerEventDetail,
    TriggerParams,
} from '../types/index.ts';

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

class Track {
    readonly context: AudioContext;
    readonly sampleUrl: string;
    readonly index: number;
    buffer: AudioBuffer | null;
    pattern: PatternStep[];
    volume: number;
    filterFreq: number;
    filterType: FilterType;
    filterQ: number;
    gainNode: GainNode;
    level: number;
    muted: boolean;
    solo: boolean;

    constructor(context: AudioContext, sampleUrl: string, index = 0) {
        this.context = context;
        this.sampleUrl = sampleUrl;
        this.index = index;
        this.buffer = null;

        this.pattern = new Array<PatternStep>(STEPS)
            .fill(null as unknown as PatternStep)
            .map(() => ({
                trig: false,
                locks: {},
            }));

        this.volume = DEFAULT_VOLUME;
        this.filterFreq = DEFAULT_FILTER_FREQ;
        // filter type and resonance (Q)
        this.filterType = 'lowpass';
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

    async load(): Promise<void> {
        try {
            const res = await fetch(this.sampleUrl);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const buf = await res.arrayBuffer();
            this.buffer = await this.context.decodeAudioData(buf);
        } catch (err) {
            console.warn(`Could not load sample "${this.sampleUrl}":`, err);
            this.buffer = null;
        }
    }

    trigger(time: number, params: TriggerParams = {}): void {
        const merged = {
            volume: params.volume ?? this.volume,
            filterFreq: params.filterFreq ?? this.filterFreq,
            filterType: params.filterType ?? this.filterType,
            filterQ: params.filterQ ?? this.filterQ,
        };

        if (this.buffer) {
            const src: AudioBufferSourceNode = this.context.createBufferSource();
            src.buffer = this.buffer;

            const filter: BiquadFilterNode = this.context.createBiquadFilter();
            filter.type = merged.filterType || 'lowpass';
            filter.frequency.value = merged.filterFreq;
            if (typeof merged.filterQ === 'number') {
                filter.Q.value = merged.filterQ;
            }

            const env: GainNode = this.context.createGain();
            env.gain.setValueAtTime(0, time);
            env.gain.linearRampToValueAtTime(merged.volume, time + 0.005);

            src.connect(filter);
            filter.connect(env);
            env.connect(this.gainNode);

            src.start(time);
        } else {
            // Oscillator fallback
            const osc: OscillatorNode = this.context.createOscillator();
            const baseFreq = OSC_BASE_FREQ + (this.index % TRACK_COUNT) * OSC_FREQ_STEP;
            osc.type = 'square';
            osc.frequency.setValueAtTime(baseFreq, time);

            const filter: BiquadFilterNode = this.context.createBiquadFilter();
            filter.type = merged.filterType || 'lowpass';
            filter.frequency.setValueAtTime(merged.filterFreq, time);
            try {
                if (typeof merged.filterQ === 'number') {
                    filter.Q.setValueAtTime(merged.filterQ, time);
                }
            } catch (e) {
                const error = e as Error;
                console.warn(`Filter Q setting failed: ${error.message}`);
            }

            const env: GainNode = this.context.createGain();
            env.gain.setValueAtTime(0, time);
            env.gain.linearRampToValueAtTime(merged.volume, time + OSC_ATTACK_TIME);
            env.gain.linearRampToValueAtTime(0, time + OSC_RELEASE_TIME);

            osc.connect(filter);
            filter.connect(env);
            env.connect(this.gainNode);

            osc.start(time);
            osc.stop(time + OSC_TOTAL_DURATION);
        }
    }
}

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
    tracks.forEach((track) => {
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
    });
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
    tracks = urls.map((url, i) => new Track(audioCtx, url, i));
    await Promise.all(tracks.map((t) => t.load()));
    return tracks;
}

// Mixer helper
function updateMixerGains(): void {
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
            const error = e as Error;
            console.log(`Exception while doing something: ${error.message}`);
        }
    });
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
