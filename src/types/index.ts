// Type definitions for Digitick drum machine

/**
 * Supported filter types matching Web Audio BiquadFilterType
 */
export type FilterType =
    | 'lowpass'
    | 'highpass'
    | 'bandpass'
    | 'notch'
    | 'allpass'
    | 'peaking'
    | 'lowshelf'
    | 'highshelf';

/**
 * Parameter locks - per-step parameter overrides
 */
export interface ParameterLocks {
    volume?: number;
    filterFreq?: number;
    filterType?: FilterType;
    filterQ?: number;
    [key: string]: number | string | boolean | undefined;
}

/**
 * A single step in the pattern sequencer
 */
export interface SequenceStep {
    trig: boolean;
    locks: ParameterLocks;
}

/**
 * Parameters that can be passed to Track.trigger()
 */
export interface TriggerParams {
    volume?: number;
    filterFreq?: number;
    filterType?: FilterType;
    filterQ?: number;
}

/**
 * Detail payload for the 'track-trigger' CustomEvent
 */
export interface TrackTriggerEventDetail {
    trackIndex: number;
    step: number;
    time: number;
}

/**
 * Custom event type for track triggers
 */
export type TrackTriggerEvent = CustomEvent<TrackTriggerEventDetail>;

/**
 * Function type for getting playback start time
 */
export type PlaybackStartTimeGetter = () => number | null;

// Global augmentations
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }

    interface DocumentEventMap {
        'track-trigger': TrackTriggerEvent;
    }
}
