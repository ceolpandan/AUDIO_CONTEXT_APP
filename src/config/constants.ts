// Application-level constants shared across engine and UI
export const DEFAULT_BPM: number = 120;
export const STEPS: number = 16;
export const TRACK_COUNT: number = 8;
export const FFT_SIZE: number = 2048;
export const LOOKAHEAD: number = 0.1;
export const STEPS_PER_BEAT: number = 4;
export const DEFAULT_FILTER_FREQ: number = 2000;
export const DEFAULT_FILTER_Q: number = 1;
export const DEFAULT_VOLUME: number = 0.8;

// Oscillator fallback constants
export const OSC_BASE_FREQ: number = 200;
export const OSC_FREQ_STEP: number = 60;
export const OSC_ATTACK_TIME: number = 0.02;
export const OSC_RELEASE_TIME: number = 0.18;
export const OSC_TOTAL_DURATION: number = 0.2;

// Samples loaded by default
export const sampleUrls: readonly string[] = [
    'samples/kick1.wav',
    'samples/snare.wav',
    'samples/hat1.wav',
    'samples/hat2.wav',
    'samples/clap.wav',
    'samples/perc1.wav',
    'samples/perc2.wav',
    'samples/perc3.wav',
] as const;

export const defaultBPM: number = 120;
