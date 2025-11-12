export const PRESETS = {
    none: { 
        stages: [{name:'Grounding', base:55, beat:2.5, padCut:900, iso:2.0, noise:0.08}], 
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
        intensity: 0.6,
        description: { title: 'Custom', shortDesc: 'Manual or custom session.' }
    },
    full_spectrum: {
        stages: [{name:'Grounding', base:55, beat:2.5, padCut:900, iso:2.0, noise:0.08}, {name:'Energetic', base:95, beat:6.5, padCut:1200, iso:4.5, noise:0.095}, {name:'Focus', base:140, beat:10.0, padCut:1800, iso:3.0, noise:0.06}, {name:'Intuitive', base:160, beat:7.5, padCut:2500, iso:2.0, noise:0.045}, {name:'Bliss', base:240, beat:40.0, padCut:4800, iso:0.8, noise:0.02}], 
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
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
        toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: false, brainPulse: false, resonantPulse: false }, 
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
        toggles: { iso: true, noise: true, wind: false, drum: true, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
        intensity: 0.5,
        description: {
            title: 'Meditation',
            shortDesc: 'Achieve a state of deep relaxation and heightened awareness.',
            effect: 'Transitions the mind from a calm Alpha state to deep, intuitive Theta, suitable for mindfulness and introspection.',
            useCases: 'Mindfulness, Introspection, Creative Visualization',
            freqRange: 'Alpha & Theta (4-10Hz)'
        }
    },
    contemplative_state: {
        stages: [
            {name:'Alpha Opening', base:90, beat:11.0, padCut:800, iso:5.5, noise:0.03}, 
            {name:'Theta Insight', base:60, beat:5.0, padCut:400, iso:2.5, noise:0.01}
        ], 
        toggles: { iso: true, noise: true, wind: false, drum: true, bowl: true, deepSleep: false, brainPulse: true, resonantPulse: false }, 
        intensity: 0.55,
        description: {
            title: 'Contemplative State',
            shortDesc: 'Facilitate deep introspection, creative thinking, and insight.',
            effect: 'Guides the brain from a calm Alpha state to the insightful Theta border, ideal for accessing subconscious thoughts and creative problem-solving.',
            useCases: 'Journaling, Philosophical Thought, Creative Brainstorming, Reviewing Memories',
            freqRange: 'Alpha & Theta (5-11Hz)'
        }
    },
    resting_state: { 
        stages: [{name:'Alpha Rest', base:120, beat:10.0, padCut:1000, iso:5.0, noise:0.04}], 
        toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
        intensity: 0.5,
        description: {
            title: 'Resting State',
            shortDesc: 'Calm the mind and encourage a natural state of restfulness.',
            effect: "Targets the 10Hz Alpha frequency, associated with the brain's 'Default Mode Network,' promoting relaxation and mental quiet.",
            useCases: 'Mind-wandering, Reducing Overthinking, Taking a Mental Break, Gentle Relaxation',
            freqRange: 'Alpha (10Hz)'
        }
    },
    relaxation: { 
        stages: [{name:'Relax', base:120, beat:8.0, padCut:1000, iso:4.0, noise:0.03}, {name:'Deep Calm', base:80, beat:6.0, padCut:700, iso:2.0, noise:0.01}], 
        toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
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
        toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: true, brainPulse: false, resonantPulse: false }, 
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
       toggles: { iso: true, noise: true, wind: false, drum: false, bowl: true, deepSleep: true, brainPulse: false, resonantPulse: false },
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
        toggles: { iso: true, noise: true, wind: true, drum: true, bowl: false, deepSleep: false, brainPulse: false, resonantPulse: false }, 
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
        toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false, resonantPulse: false }, 
        intensity: 0.7,
        description: {
            title: 'Bliss',
            shortDesc: 'Induce a state of peak awareness and harmonic well-being.',
            effect: 'Targets high-frequency Gamma waves, associated with moments of insight, high-level processing, and euphoria.',
            useCases: 'Peak Experience, Deep Contemplation, Mood Elevation',
            freqRange: 'Gamma (40Hz)'
        }
    },
    brain_flow: {
        stages: [
            {name:'Alpha Entry', base:120, beat:12.0, padCut:1000, iso:6.0, noise:0.04}, 
            {name:'Theta Border', base:90, beat:7.83, padCut:700, iso:4.0, noise:0.02}, 
            {name:'Gamma Insight', base:180, beat:40.0, padCut:2000, iso:20.0, noise:0.01}
        ], 
        toggles: { iso: true, noise: true, wind: false, drum: false, bowl: true, deepSleep: false, brainPulse: true, resonantPulse: false }, 
        intensity: 0.5,
        description: {
            title: 'Brain Flow State',
            shortDesc: 'Activate and maintain a state of deep, effortless concentration.',
            effect: 'Guides the brain from relaxed Alpha into the creative Theta zone, punctuated by Gamma bursts for peak cognitive performance and insight.',
            useCases: 'Creative Work, Problem Solving, Learning, Coding, Any task requiring deep focus.',
            freqRange: 'Alpha, Theta & Gamma (7.83Hz - 40Hz)'
        }
    },
    vibrational_state: {
        stages: [
            {name:'Subtle Hum', base:30, beat:0.5, padCut:200, iso:0, noise:0.01}, 
            {name:'Rhythmic Pulse', base:35, beat:0.2, padCut:250, iso:0, noise:0.01},
            {name:'Deep Resonance', base:28, beat:0.1, padCut:180, iso:0, noise:0.01}
        ],
        toggles: { iso: false, noise: true, wind: false, drum: false, bowl: false, deepSleep: false, brainPulse: false, resonantPulse: true },
        intensity: 0.7,
        description: {
            title: 'Vibrational State',
            shortDesc: 'Induce a physical sensation of vibration in the skull. Use with caution.',
            effect: 'Uses low-frequency beating and slow amplitude swells to create a psychoacoustic illusion of physical resonance, enhancing bodily awareness. WARNING: Start at very low volume. Discontinue use if any discomfort occurs.',
            useCases: 'Deep Body Awareness, Trance States, Somatic Exploration',
            freqRange: 'Sub-audible & Delta (0.1Hz - 35Hz)'
        }
    }
};
   
export const config = {
    // App level
    APP_NAME: 'Binaural Beats & Sound Therapy',
    AUTOPLAY_TICK_MS: 250,

    // Audio lifecycle
    DEFAULT_MASTER_GAIN: 0.45,
    MIN_GAIN: 0.0001,
    FADE_DURATION_S: 3,
    PAUSE_FADE_DURATION_S: 1,
    RESUME_FADE_DURATION_S: 2,
    STAGE_CHANGE_RAMP_S: 4,
    
    // Layer gains
    PAD_GAIN_MULTIPLIER: 0.6,
    DEEP_SLEEP_GAIN_MULTIPLIER: 0.1,

    // Architectural audio engine constants
    engine: {
        // --- General ---
        LIMITER_THRESHOLD: -12.0,
        LIMITER_KNEE: 15.0,
        LIMITER_RATIO: 2.0,
        LIMITER_ATTACK_S: 0.005,
        LIMITER_RELEASE_S: 0.1,
        REVERB_DURATION_S: 3.0,
        REVERB_DECAY: 2.0,
        // --- Carrier Pair ---
        CARRIER_VIBRATO_FREQ_HZ: 0.06,
        CARRIER_VIBRATO_GAIN: 1.6,
        CARRIER_PAN_LEFT: -0.6,
        CARRIER_PAN_RIGHT: 0.6,
        CARRIER_GAIN: 0.45,
        // --- Pad Layer ---
        PAD_LOOP_S: 30.0,
        PAD_FILTER_Q: 0.7,
        PAD_FILTER_LFO_FREQ_HZ: 0.04,
        PAD_FILTER_LFO_GAIN: 150, // modulation depth in Hz
        PAD_BASE_FREQ: 110.0,
        PAD_OSC_DETUNE: 0.02,
        PAD_CHORUS_LFO_MIN_FREQ: 0.02,
        PAD_CHORUS_LFO_RANGE: 0.04,
        PAD_CHORUS_LFO_MIN_GAIN: 0.5,
        PAD_CHORUS_LFO_GAIN_RANGE: 0.6,
        PAD_AMP_LFO_FREQ_HZ: 0.03,
        PAD_AMP_LFO_GAIN: 0.25,
        PAD_AMP_BASE_GAIN: 0.3,
        // --- Pink Noise ---
        PINK_NOISE_BUFFER_S: 2.0,
        // --- Isochronic Layer ---
        ISO_BASE_FREQ: 80.0,
        ISO_LFO_GAIN: 0.4,
        ISO_BASE_GAIN: 0.5,
        // --- Wind ---
        WIND_BUFFER_S: 2.0,
        WIND_FILTER_FREQ_HZ: 400.0,
        WIND_FILTER_Q: 0.5,
        WIND_GAIN_LFO_FREQ_HZ: 0.08,
        WIND_GAIN_LFO_GAIN: 0.3,
        WIND_BASE_GAIN: 0.15,
        WIND_PAN_LFO_FREQ_HZ: 0.05,
        WIND_PAN_LFO_GAIN: 0.8,
        // --- Shamanic Drum ---
        DRUM_LOOP_S: 10.0,
        DRUM_MAIN_GAIN: 0.847,
        DRUM_FILTER_FREQ: 350.0,
        DRUM_FILTER_Q: 0.2,
        DRUM_PAN_RANGE: 1.8,
        // --- Singing Bowl ---
        BOWL_MAIN_GAIN: 0.35,
        BOWL_PAN_LFO_FREQ_HZ: 0.025,
        BOWL_PAN_LFO_GAIN: 0.9,
        BOWL_ATTACK_S: 0.5,
        BOWL_DECAY_S: 45.0,
        BOWL_INTERVAL_S: 60.0,
        BOWL_SCHEDULER_INTERVAL_MS: 25,
        BOWL_SCHEDULER_LOOKAHEAD_S: 0.1,
        // --- Deep Sleep ---
        DEEP_SLEEP_PULSE_LFO_GAIN: 0.5,
        DEEP_SLEEP_PULSE_BASE_GAIN: 0.5,
        DEEP_SLEEP_PAN_LFO_FREQ_HZ: 0.015,
        DEEP_SLEEP_PAN_LFO_GAIN: 1.0,
        DEEP_SLEEP_PAN_INVERTER_GAIN: -1.0,
        // --- Brain Pulse ---
        BRAIN_PULSE_LOOP_S: 15.0,
        BRAIN_PULSE_COMPRESSOR_THRESHOLD: -24.0,
        BRAIN_PULSE_COMPRESSOR_KNEE: 30.0,
        BRAIN_PULSE_COMPRESSOR_RATIO: 12.0,
        BRAIN_PULSE_COMPRESSOR_ATTACK: 0.003,
        BRAIN_PULSE_COMPRESSOR_RELEASE: 0.25,
        // --- Resonant Pulse ---
        RESONANT_PULSE_MAIN_GAIN: 0.4,
        RESONANT_PULSE_BASE_FREQ: 30.0,
        RESONANT_PULSE_BEAT_FREQ: 0.2,
        RESONANT_PULSE_SWELL_LFO_FREQ_HZ: 0.05,
        RESONANT_PULSE_SWELL_LFO_GAIN: 0.5,
        RESONANT_PULSE_SWELL_BASE_GAIN: 0.5,
    }
};
    
export const toggleConfigs = [
    { stateKey: 'isIsoEnabled', optionId: 'isoOption', chkId: 'isoChk', nodeKey: 'iso' },
    { stateKey: 'isNoiseEnabled', optionId: 'noiseOption', chkId: 'noiseChk', nodeKey: 'noise' },
    { stateKey: 'isWindEnabled', optionId: 'windOption', chkId: 'windChk', nodeKey: 'wind' },
    { stateKey: 'isDrumEnabled', optionId: 'drumOption', chkId: 'drumChk', nodeKey: 'drum' },
    { stateKey: 'isBowlEnabled', optionId: 'bowlOption', chkId: 'bowlChk', nodeKey: 'bowl' },
    { stateKey: 'isDeepSleepEnabled', optionId: 'deepSleepOption', chkId: 'deepSleepChk', nodeKey: 'deepSleep' },
    { stateKey: 'isBrainPulseEnabled', optionId: 'brainPulseOption', chkId: 'brainPulseChk', nodeKey: 'brainPulse' },
    { stateKey: 'isResonantPulseEnabled', optionId: 'resonantPulseOption', chkId: 'resonantPulseChk', nodeKey: 'resonantPulse' },
];