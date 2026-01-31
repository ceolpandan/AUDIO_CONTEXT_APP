import {
    DEFAULT_FILTER_FREQ,
    DEFAULT_VOLUME,
    OSC_ATTACK_TIME,
    OSC_BASE_FREQ,
    OSC_FREQ_STEP,
    OSC_RELEASE_TIME,
    OSC_TOTAL_DURATION,
    STEPS,
    TRACK_COUNT,
} from '../config/constants.ts';
import type { FilterType, PatternStep, TriggerParams } from '../types';

export class Track {
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

    constructor(context: AudioContext, sampleUrl: string, masterGain: GainNode, index = 0) {
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
