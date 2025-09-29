export const PRESETS = {
    none: { 
        stages: [{name:'Grounding', base:55, beat:2.5, padCut:900, iso:2.0, noise:0.08}], 
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: true, deepSleep: false, brainPulse: false }, 
        intensity: 0.6,
        description: { title: 'Custom', shortDesc: 'Manual or custom session.' }
    },
    full_spectrum: {
        stages: [{name:'Grounding', base:55, beat:2.5, padCut:900, iso:2.0, noise:0.08}, {name:'Energetic', base:95, beat:6.5, padCut:1200, iso:4.5, noise:0.095}, {name:'Focus', base:140, beat:10.0, padCut:1800, iso:3.0, noise:0.06}, {name:'Intuitive', base:160, beat:7.5, padCut:2500, iso:2.0, noise:0.045}, {name:'Bliss', base:240, beat:40.0, padCut:4800, iso:0.8, noise:0.02}], 
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: true, deepSleep: false, brainPulse: false }, 
        intensity: 0.6,
        description: {
            title: 'Full Spectrum Session',
            shortDesc: 'A comprehensive 5-stage journey through various brainwave states.',
            effect: 'Guides the mind from grounding Delta/Theta, through focused Beta, to blissful Gamma states for a complete mental reset.',
            useCases: 'Full Session Meditation, Mental Exploration, Resetting Mindset',
            freqRange: 'Full Spectrum (2.5Hz - 40Hz)'
        }
    },
    focus: { 
        stages: [{name:'Beta Wave', base:140, beat:18.0, padCut:1500, iso:10.0, noise:0.05}, {name:'Gamma Wave', base:200, beat:40.0, padCut:2500, iso:25.0, noise:0.0}], 
        toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: false, brainPulse: false }, 
        intensity: 0.8,
        description: {
            title: 'Focus',
            shortDesc: 'Enhance concentration and mental clarity for cognitive tasks.',
            effect: 'Guides the brain into active Beta and Gamma wave states, ideal for problem-solving and high-level learning.',
            useCases: 'Studying, Working, Learning, Problem Solving',
            freqRange: 'Beta & Gamma (18-40Hz)'
        }
    },
    meditation: { 
        stages: [{name:'Alpha Wave', base:90, beat:10.0, padCut:800, iso:5.0, noise:0.04}, {name:'Theta Wave', base:60, beat:6.0, padCut:500, iso:3.0, noise:0.02}, {name:'Deep Theta', base:40, beat:4.0, padCut:300, iso:1.5, noise:0.01}], 
        toggles: { iso: true, noise: true, wind: false, drum: true, bowl: true, deepSleep: false, brainPulse: false }, 
        intensity: 0.5,
        description: {
            title: 'Meditation',
            shortDesc: 'Achieve a state of deep relaxation and heightened awareness.',
            effect: 'Transitions the mind from a calm Alpha state to deep, intuitive Theta, suitable for mindfulness and introspection.',
            useCases: 'Mindfulness, Introspection, Creative Visualization',
            freqRange: 'Alpha & Theta (4-10Hz)'
        }
    },
    relaxation: { 
        stages: [{name:'Relax', base:120, beat:8.0, padCut:1000, iso:4.0, noise:0.03}, {name:'Deep Calm', base:80, beat:6.0, padCut:700, iso:2.0, noise:0.01}], 
        toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false }, 
        intensity: 0.4,
        description: {
            title: 'Relaxation',
            shortDesc: 'Unwind your mind and release daily stress and tension.',
            effect: 'Gently eases brain activity into the Alpha and high-Theta range, promoting calm and reducing anxiety.',
            useCases: 'Stress Relief, Unwinding, Anxiety Reduction',
            freqRange: 'Alpha & Theta (6-8Hz)'
        }
    },
    deep_sleep: { 
        stages: [{name:'Delta Wave', base:100, beat:2.0, padCut:250, iso:0.8, noise:0.05}, {name:'Deep Delta', base:100, beat:0.5, padCut:150, iso:0.5, noise:0.08}, {name:'3D Delta', base:110, beat:1.5, padCut:100, iso:0.3, noise:0.0, deepSleepOn: true}], 
        toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: true, brainPulse: false }, 
        intensity: 0.3,
        description: {
            title: 'Deep Sleep',
            shortDesc: 'Support the body’s natural restorative sleep cycles.',
            effect: 'Targets low-frequency Delta waves, associated with the deepest, most restorative stages of dreamless sleep.',
            useCases: 'Insomnia Aid, Improving Sleep Quality, Pre-Sleep Routine',
            freqRange: 'Delta (0.5-2Hz)'
        }
    },
    rem_sleep: {
       stages: [
           {name:'Alpha Relaxation', base:120, beat:10.0, padCut:900, iso:5.0, noise:0.03, deepSleepOn: false},
           {name:'Theta Transition', base:90, beat:6.0, padCut:600, iso:3.0, noise:0.04, deepSleepOn: true},
           {name:'Delta Deep Sleep', base:80, beat:2.0, padCut:300, iso:1.0, noise:0.05, deepSleepOn: true},
           {name:'REM Phase', base:100, beat:4.5, padCut:400, iso:2.5, noise:0.04, deepSleepOn: true}
       ],
       toggles: { iso: true, noise: true, wind: false, drum: false, bowl: true, deepSleep: true, brainPulse: false },
       intensity: 0.25,
       description: {
            title: 'REM Sleep Cycle',
            shortDesc: 'Aids in cycling through the natural stages of sleep.',
            effect: 'Guides the brain through Alpha, Theta, and Delta waves to support a full and healthy sleep cycle, including REM sleep.',
            useCases: 'Sleep Cycle Support, Napping, Dream Enhancement',
            freqRange: 'Alpha, Theta & Delta (2-10Hz)'
        }
    },
    energetic: { 
        stages: [{name:'Energetic', base:95, beat:6.5, padCut:1200, iso:4.5, noise:0.095}], 
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: false, deepSleep: false, brainPulse: false }, 
        intensity: 0.6,
        description: {
            title: 'Energetic',
            shortDesc: 'A stimulating session to awaken the mind and senses.',
            effect: 'Uses mid-range Theta frequencies to promote a state of energized creativity and gentle alertness.',
            useCases: 'Pre-Workout, Creative Brainstorming, Morning Wake-up',
            freqRange: 'Theta (6.5Hz)'
        }
    },
    bliss: { 
        stages: [{name:'Bliss', base:240, beat:40.0, padCut:4800, iso:0.8, noise:0.02}], 
        toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false }, 
        intensity: 0.7,
        description: {
            title: 'Bliss',
            shortDesc: 'Induce a state of peak awareness and harmonic well-being.',
            effect: 'Targets high-frequency Gamma waves, associated with moments of insight, high-level processing, and euphoria.',
            useCases: 'Peak Experience, Deep Contemplation, Mood Elevation',
            freqRange: 'Gamma (40Hz)'
        }
    }
};
   
export const config = {
    APP_NAME: 'Binaural Beats & Sound Therapy',
    DEFAULT_MASTER_GAIN: 0.45, // Serves as default/initial value and render volume.
    PAD_GAIN_MULTIPLIER: 0.6,
    DEEP_SLEEP_GAIN_MULTIPLIER: 0.15,
    FADE_DURATION_S: 3,
    PAUSE_FADE_DURATION_S: 1,
    RESUME_FADE_DURATION_S: 2,
    STAGE_CHANGE_RAMP_S: 4,
    MIN_GAIN: 0.0001,
    AUTOPLAY_TICK_MS: 250,
};
    
export const toggleConfigs = [
    { stateKey: 'isIsoEnabled', optionId: 'isoOption', chkId: 'isoChk', nodeKey: 'iso' },
    { stateKey: 'isNoiseEnabled', optionId: 'noiseOption', chkId: 'noiseChk', nodeKey: 'noise' },
    { stateKey: 'isWindEnabled', optionId: 'windOption', chkId: 'windChk', nodeKey: 'wind' },
    { stateKey: 'isDrumEnabled', optionId: 'drumOption', chkId: 'drumChk', nodeKey: 'drum' },
    { stateKey: 'isBowlEnabled', optionId: 'bowlOption', chkId: 'bowlChk', nodeKey: 'bowl' },
    { stateKey: 'isDeepSleepEnabled', optionId: 'deepSleepOption', chkId: 'deepSleepChk', nodeKey: 'deepSleep' },
    { stateKey: 'isBrainPulseEnabled', optionId: 'brainPulseOption', chkId: 'brainPulseChk', nodeKey: 'brainPulse' },
];