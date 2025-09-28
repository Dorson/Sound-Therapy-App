export const PRESETS = {
    none: { stages: [{name:'Grounding', base:55, beat:2.5, padCut:900, iso:2.0, noise:0.08}, {name:'Energetic', base:95, beat:6.5, padCut:1200, iso:4.5, noise:0.095}, {name:'Focus', base:140, beat:10.0, padCut:1800, iso:3.0, noise:0.06}, {name:'Intuitive', base:160, beat:7.5, padCut:2500, iso:2.0, noise:0.045}, {name:'Bliss', base:240, beat:40.0, padCut:4800, iso:0.8, noise:0.02}], toggles: { iso: true, noise: true, wind: true, drum: true, bowl: true, deepSleep: false, brainPulse: false }, intensity: 0.6 },
    focus: { stages: [{name:'Beta Wave', base:140, beat:18.0, padCut:1500, iso:10.0, noise:0.05}, {name:'Gamma Wave', base:200, beat:40.0, padCut:2500, iso:25.0, noise:0.0}], toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: false, brainPulse: false }, intensity: 0.8 },
    meditation: { stages: [{name:'Alpha Wave', base:90, beat:10.0, padCut:800, iso:5.0, noise:0.04}, {name:'Theta Wave', base:60, beat:6.0, padCut:500, iso:3.0, noise:0.02}, {name:'Deep Theta', base:40, beat:4.0, padCut:300, iso:1.5, noise:0.01}], toggles: { iso: true, noise: true, wind: false, drum: true, bowl: true, deepSleep: false, brainPulse: false }, intensity: 0.5 },
    relaxation: { stages: [{name:'Relax', base:120, beat:8.0, padCut:1000, iso:4.0, noise:0.03}, {name:'Deep Calm', base:80, beat:6.0, padCut:700, iso:2.0, noise:0.01}], toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false }, intensity: 0.4 },
    deep_sleep: { stages: [{name:'Delta Wave', base:100, beat:2.0, padCut:250, iso:0.8, noise:0.05}, {name:'Deep Delta', base:100, beat:0.5, padCut:150, iso:0.5, noise:0.08}, {name:'3D Delta', base:110, beat:1.5, padCut:100, iso:0.3, noise:0.0, deepSleepOn: true}], toggles: { iso: true, noise: true, wind: false, drum: false, bowl: false, deepSleep: true, brainPulse: false }, intensity: 0.3 },
    rem_sleep: {
       stages: [
           {name:'Alpha Relaxation', base:120, beat:10.0, padCut:900, iso:5.0, noise:0.03, deepSleepOn: false},
           {name:'Theta Transition', base:90, beat:6.0, padCut:600, iso:3.0, noise:0.04, deepSleepOn: true},
           {name:'Delta Deep Sleep', base:80, beat:2.0, padCut:300, iso:1.0, noise:0.05, deepSleepOn: true},
           {name:'REM Phase', base:100, beat:4.5, padCut:400, iso:2.5, noise:0.04, deepSleepOn: true}
       ],
       toggles: { iso: true, noise: true, wind: false, drum: false, bowl: true, deepSleep: true, brainPulse: false },
       intensity: 0.25
    },
    energetic: { stages: [{name:'Energetic', base:95, beat:6.5, padCut:1200, iso:4.5, noise:0.095}], toggles: { iso: true, noise: true, wind: true, drum: true, bowl: false, deepSleep: false, brainPulse: false }, intensity: 0.6 },
    bliss: { stages: [{name:'Bliss', base:240, beat:40.0, padCut:4800, iso:0.8, noise:0.02}], toggles: { iso: true, noise: true, wind: true, drum: false, bowl: true, deepSleep: false, brainPulse: false }, intensity: 0.7 }
};
   
export const config = {
    APP_NAME: 'Binaural Beats & Sound Therapy',
    MASTER_GAIN_MULTIPLIER: 0.45,
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
