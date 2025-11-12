import { PRESETS } from './presets.js';

export const state = {
    // Session settings
    sessionLengthMinutes: 10,
    effectsIntensity: 0.6,
    masterVolume: 0.45,

    // Soundscape layers
    isIsoEnabled: true,
    isNoiseEnabled: true,
    isWindEnabled: true,
    isDrumEnabled: true,
    isBowlEnabled: true,
    isDeepSleepEnabled: false,
    isBrainPulseEnabled: false,
    isResonantPulseEnabled: false,

    // Playback state
    STAGES: PRESETS.full_spectrum.stages,
    activePreset: 'full_spectrum',
    currentStage: -1,
    isPlaying: false,
    autoplayInterval: null,
    sessionElapsedTime: 0,
    lastTickTime: 0,

    // Engine state
    audioEngineStatus: 'closed', // 'closed', 'running', 'suspended', 'interrupted'
    wasPlayingBeforeInterruption: false,
    disabledEffects: new Set(),

    // Internal/transient state
    isInteracting: false,
    isRendering: false,
    renderProcess: {
        cancel: false,
        progressInterval: null,
        onlineCtx: null,
        source: null,
    },
};