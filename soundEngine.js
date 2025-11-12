import { state } from './state.js';
import { config, toggleConfigs } from './presets.js';
import { emit } from './eventBus.js';
import { getSingingBowlWavetable } from './wavetables.js';

// This string contains the code for our custom AudioWorkletProcessors.
// It's defined here to avoid needing a separate file, which simplifies local usage (file://).
const workletProcessorsString = `
// --- Processor 1: Phase-Controlled LFO ---
class PhaseControlledLfoProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.phase = options.processorOptions.startPhase || 0;
  }
  
  static get parameterDescriptors() {
    return [
        { name: 'frequency', defaultValue: 1, automationRate: 'a-rate' },
        { name: 'amplitude', defaultValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const frequency = parameters.frequency;
    const amplitude = parameters.amplitude;

    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; i++) {
        const freq = frequency.length > 1 ? frequency[i] : frequency[0];
        const amp = amplitude.length > 1 ? amplitude[i] : amplitude[0];
        
        outputChannel[i] = Math.sin(this.phase) * amp;
        this.phase += 2 * Math.PI * freq / sampleRate;
        if (this.phase > 2 * Math.PI) {
          this.phase -= 2 * Math.PI;
        }
      }
    }
    return true; // Keep processor alive
  }
}
registerProcessor('lfo-processor', PhaseControlledLfoProcessor);


// --- Processor 2: Living Modulator (LFO) ---
class ModulatorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.phase1 = options.processorOptions.startPhase || 0;
    // Offset other phases to prevent them from starting in sync
    this.phase2 = (this.phase1 + 0.25) % (2 * Math.PI);
    this.phase3 = (this.phase1 + 0.5) % (2 * Math.PI);

    // Non-integer frequency ratios for organic, non-repeating patterns
    this.freqRatio1 = 1.0;
    this.freqRatio2 = 1.414; // sqrt(2)
    this.freqRatio3 = 1.732; // sqrt(3)

    // Weights for combining the sine waves. Sum must be <= 1.0 to be self-limiting.
    this.ampWeight1 = 0.6;
    this.ampWeight2 = 0.3;
    this.ampWeight3 = 0.1;
  }
  
  static get parameterDescriptors() {
    return [
        { name: 'frequency', defaultValue: 1, automationRate: 'a-rate' },
        { name: 'amplitude', defaultValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const frequency = parameters.frequency;
    const amplitude = parameters.amplitude;
    const step = 2 * Math.PI / sampleRate;

    for (let channel = 0; channel < output.length; channel++) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; i++) {
        const freq = frequency.length > 1 ? frequency[i] : frequency[0];
        const amp = amplitude.length > 1 ? amplitude[i] : amplitude[0];
        
        const s1 = Math.sin(this.phase1) * this.ampWeight1;
        const s2 = Math.sin(this.phase2) * this.ampWeight2;
        const s3 = Math.sin(this.phase3) * this.ampWeight3;
        
        outputChannel[i] = (s1 + s2 + s3) * amp;
        
        this.phase1 += step * freq * this.freqRatio1;
        this.phase2 += step * freq * this.freqRatio2;
        this.phase3 += step * freq * this.freqRatio3;

        if (this.phase1 > 2 * Math.PI) this.phase1 -= 2 * Math.PI;
        if (this.phase2 > 2 * Math.PI) this.phase2 -= 2 * Math.PI;
        if (this.phase3 > 2 * Math.PI) this.phase3 -= 2 * Math.PI;
      }
    }
    return true;
  }
}
registerProcessor('modulator-processor', ModulatorProcessor);


// --- Processor 3: Waveform Core Synthesizer ---
class WaveformCoreProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.phase = 0;
        this.wavetable = new Float32Array([0, 0]); // Default silent wavetable
        
        // Envelope state
        this.envelopeState = 'idle'; // idle, attack, decay, sustain, release
        this.envelopeValue = 0;
        this.envelopeTime = 0;

        this.port.onmessage = (event) => {
            if (event.data.wavetable) {
                this.wavetable = event.data.wavetable;
            }
        };
    }

    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, automationRate: 'a-rate' },
            { name: 'gate', defaultValue: 0, automationRate: 'k-rate' },
            { name: 'attack', defaultValue: 0.01, automationRate: 'k-rate' },
            { name: 'decay', defaultValue: 0.1, automationRate: 'k-rate' },
            { name: 'sustain', defaultValue: 0.5, automationRate: 'k-rate' },
            { name: 'release', defaultValue: 0.2, automationRate: 'k-rate' },
            { name: 'drive', defaultValue: 0, automationRate: 'a-rate' }
        ];
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];
        
        const frequency = parameters.frequency;
        const gate = parameters.gate[0];
        const attack = parameters.attack[0];
        const decay = parameters.decay[0];
        const sustain = parameters.sustain[0];
        const release = parameters.release[0];
        const drive = parameters.drive;

        const invSampleRate = 1.0 / sampleRate;

        for (let i = 0; i < channel.length; ++i) {
            // --- Envelope Logic ---
            if (this.envelopeState === 'idle' && gate > 0.5) {
                this.envelopeState = 'attack';
                this.envelopeTime = 0;
            } else if (this.envelopeState !== 'idle' && this.envelopeState !== 'release' && gate < 0.5) {
                this.envelopeState = 'release';
                this.envelopeTime = 0;
            }

            switch (this.envelopeState) {
                case 'attack':
                    this.envelopeValue += invSampleRate / attack;
                    if (this.envelopeValue >= 1.0) {
                        this.envelopeValue = 1.0;
                        this.envelopeState = 'decay';
                        this.envelopeTime = 0;
                    }
                    break;
                case 'decay':
                    const decayBase = (this.envelopeValue - sustain) * Math.exp(-invSampleRate / decay);
                    this.envelopeValue = sustain + decayBase;
                    if (this.envelopeValue <= sustain) {
                        this.envelopeValue = sustain;
                        this.envelopeState = 'sustain';
                    }
                    break;
                case 'sustain':
                    this.envelopeValue = sustain;
                    break;
                case 'release':
                    this.envelopeValue *= Math.exp(-invSampleRate / release);
                    if (this.envelopeValue < 0.0001) {
                        this.envelopeValue = 0;
                        this.envelopeState = 'idle';
                    }
                    break;
                default: // idle
                    this.envelopeValue = 0;
            }

            // --- Oscillator Logic ---
            const freq = frequency.length > 1 ? frequency[i] : frequency[0];
            const readIndex = this.phase * (this.wavetable.length - 1);
            const index1 = Math.floor(readIndex);
            const index2 = (index1 + 1);
            const fraction = readIndex - index1;
            
            // Linear interpolation
            const s1 = this.wavetable[index1];
            const s2 = this.wavetable[index2] || s1; // handle edge case
            let sample = s1 + (s2 - s1) * fraction;

            this.phase += freq * invSampleRate;
            if (this.phase >= 1.0) this.phase -= 1.0;

            // --- Waveshaping & Output ---
            const drv = drive.length > 1 ? drive[i] : drive[0];
            const shapedSample = Math.tanh(sample * (1 + drv));

            channel[i] = shapedSample * this.envelopeValue;
        }

        // Copy mono output to other channels if they exist
        for (let j = 1; j < output.length; j++) {
            output[j].set(channel);
        }

        return true;
    }
}
registerProcessor('waveform-core-processor', WaveformCoreProcessor);
`;


let ctx = null;
let masterGain = null;
let effectsGain = null;
export let nodes = {};

// A cache for computationally expensive, pre-rendered AudioBuffers.
// This is cleared whenever the AudioContext is recreated.
let memoizedBuffers = new Map();
let carrierWavetable = null;
let isoWavetable = null;
let resonantPulseWavetable = null;

// Manage worklet loading state per AudioContext instance to prevent race conditions.
const workletReadyPromises = new WeakMap();

/**
 * Creates a normalized wavetable from a sine wave with added harmonics.
 * @param {number} size The size of the wavetable array.
 * @param {Array<Object>} harmonics An array of harmonic objects {amp, freq}.
 * @returns {Float32Array} The generated wavetable.
 */
function _createHarmonicSineWavetable(size = 4096, harmonics = [{ amp: 1.0, freq: 1 }]) {
    const wavetable = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const phase = (i / size) * 2 * Math.PI;
        let sample = 0;
        harmonics.forEach(h => {
            sample += h.amp * Math.sin(phase * h.freq);
        });
        wavetable[i] = sample;
    }
    // Normalize the wavetable
    let max = 0;
    for (let i = 0; i < size; i++) {
        if (Math.abs(wavetable[i]) > max) {
            max = Math.abs(wavetable[i]);
        }
    }
    if (max > 0) {
        for (let i = 0; i < size; i++) {
            wavetable[i] /= max;
        }
    }
    return wavetable;
}

/**
 * Utility to safely schedule a linear ramp for an AudioParam.
 * @param {AudioParam} param The AudioParam to change.
 * @param {number} value The target value.
 * @param {number} rampTime The duration of the ramp in seconds.
 * @param {number} when The time (from audioCtx.currentTime) when the ramp should start.
 */
function _rampParam(param, value, rampTime, when) {
    if (!param) return;
    param.linearRampToValueAtTime(value, when + rampTime);
}

// A handler function that will be bound to the context.
function handleContextStateChange() {
    if (!ctx) return;
    state.audioEngineStatus = ctx.state;
    emit('engine:contextStateChanged', { state: ctx.state });
}

// --- Engine Lifecycle ---
export function init() {
    // A-OK
}

export async function prewarmContext() {
    if (ctx) return;
    await createContext();
}

export async function resumeSuspendedContext() {
    if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
    }
}

export async function initAudio(initialStageRecipe, activeToggles, initialIntensity) {
    if (!ctx) await createContext();
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.connect(ctx.destination);
    
    nodes = await _createAudioGraph(ctx, masterGain, activeToggles, initialIntensity);
    effectsGain = nodes.effectsGain;
    setStage(initialStageRecipe, nodes, ctx.currentTime, 0.1);
}

export function resume() {
    if (!ctx || !masterGain) return;
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    _rampParam(masterGain.gain, state.masterVolume, config.RESUME_FADE_DURATION_S, ctx.currentTime);
    
    if (nodes.bowl && state.isBowlEnabled) nodes.bowl.startLoop();
}

export async function stop() {
    if (!ctx) return;

    if (nodes.bowl) nodes.bowl.stopLoop();
    state.isPlaying = false;

    if (masterGain && masterGain.gain) {
        try {
            masterGain.gain.cancelScheduledValues(ctx.currentTime);
            _rampParam(masterGain.gain, config.MIN_GAIN, config.FADE_DURATION_S, ctx.currentTime);
        } catch (e) { console.error("Error stopping gain ramp:", e); }
    }

    return new Promise(resolve => {
        setTimeout(() => {
            try { 
                if (ctx && ctx.state !== 'closed') {
                    ctx.removeEventListener('statechange', handleContextStateChange);
                    _clearAudioGraph();
                    ctx.close().then(() => {
                       ctx = null;
                       masterGain = null;
                       state.audioEngineStatus = 'closed';
                       emit('engine:contextStateChanged', { state: 'closed' });
                    });
                }
            } catch (e) {}
            state.currentStage = -1;
            emit('engine:stopped');
            resolve();
        }, config.FADE_DURATION_S * 1000);
    });
}

export function pause() {
    if (!ctx || !masterGain) return;
    if (nodes.bowl) nodes.bowl.stopLoop();
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    _rampParam(masterGain.gain, config.MIN_GAIN, config.PAUSE_FADE_DURATION_S, ctx.currentTime);
}

export async function transitionToPreset(preset) {
    // Check for necessary nodes/state
    if (!ctx || ctx.state !== 'running' || !masterGain || !effectsGain) return;
    
    // Constants for timing
    const FADE_S = 1.5;
    const RAMP_S = FADE_S / 2;
    const now = ctx.currentTime;

    // 1. Fade master volume down to avoid clicks during reconfiguration
    masterGain.gain.cancelScheduledValues(now);
    _rampParam(masterGain.gain, config.MIN_GAIN, RAMP_S, now);
    
    // 2. Reconfigure the existing audio graph while it's faded out.
    // The controller has already updated the global `state` object, so we can
    // just make the audio engine match it.

    // 2a. Update effect toggles by ramping their individual gain switches
    const newToggles = preset.toggles;
    for (const conf of toggleConfigs) {
        const effectNode = nodes[conf.nodeKey];
        if (effectNode && effectNode.gainSwitch) {
            const isEnabled = !!newToggles[conf.nodeKey] && !state.disabledEffects.has(conf.nodeKey);
            const targetGain = isEnabled ? 1 : 0;
            _rampParam(effectNode.gainSwitch.gain, targetGain, RAMP_S, now);

            // Also manage schedulers for looping sounds
            if (effectNode.startLoop && effectNode.stopLoop && state.isPlaying) {
                if (isEnabled) effectNode.startLoop();
                else effectNode.stopLoop();
            }
        }
    }
    
    // 2b. Update the overall effects intensity
    _rampParam(effectsGain.gain, preset.intensity, RAMP_S, now);

    // 2c. Set the specific parameters for the first stage of the new preset
    const initialStageRecipe = preset.stages[0];
    // We schedule this change to happen during the fade, using a standard ramp time
    setStage(initialStageRecipe, nodes, RAMP_S, config.STAGE_CHANGE_RAMP_S);
    
    // 3. Wait for the fade-out and reconfiguration period to complete
    await new Promise(resolve => setTimeout(resolve, RAMP_S * 1000));
    
    // 4. Fade master volume back up to the user-set level
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    _rampParam(masterGain.gain, state.masterVolume, RAMP_S, ctx.currentTime);

    // 5. Reset session timing state for the new preset and notify the UI
    state.currentStage = 0;
    state.sessionElapsedTime = 0;
    if (state.autoplayInterval) state.lastTickTime = performance.now();
    
    emit('engine:stageChanged', { stageIndex: state.currentStage });
}

export function setMasterVolume(value, ramp = 0.1) {
    if (masterGain && state.isPlaying) {
        _rampParam(masterGain.gain, value, ramp, ctx.currentTime);
    }
}

export function setIntensity(value, ramp = 0.1) {
    if (effectsGain) {
        _rampParam(effectsGain.gain, value, ramp, ctx.currentTime);
    }
}

export function toggleEffect(effectKey, isEnabled) {
    if (ctx && nodes[effectKey] && nodes[effectKey].gainSwitch) {
        const node = nodes[effectKey];
        const targetGain = isEnabled ? 1 : 0;
        _rampParam(node.gainSwitch.gain, targetGain, 0.5, ctx.currentTime);
        if (node.startLoop && node.stopLoop && state.isPlaying) {
            if (isEnabled) node.startLoop(); else node.stopLoop();
        }
    }
}

export function setStage(stageRecipe, nodeSet, scheduleTime, ramp) {
    const audioContext = nodeSet.carrier?.leftOsc?.context;
    if (!audioContext || !nodeSet.carrier) return;

    const isOffline = audioContext.constructor.name.includes('Offline');
    const now = isOffline ? scheduleTime : audioContext.currentTime + scheduleTime;
    
    if (isOffline && scheduleTime === 0) {
        nodeSet.carrier.leftOsc.parameters.get('frequency').setValueAtTime(Math.max(8, stageRecipe.base - stageRecipe.beat / 2), 0);
        nodeSet.carrier.rightOsc.parameters.get('frequency').setValueAtTime(Math.max(8, stageRecipe.base + stageRecipe.beat / 2), 0);
        nodeSet.pad.filter.frequency.setValueAtTime(stageRecipe.padCut, 0);
        if (nodeSet.iso) nodeSet.iso.lfo.frequency.setValueAtTime(stageRecipe.iso, 0);
        if (nodeSet.noise) nodeSet.noise.source.gain.setValueAtTime(stageRecipe.noise, 0);
        if (nodeSet.deepSleep) {
             nodeSet.deepSleep.leftOsc.parameters.get('frequency').setValueAtTime(Math.max(8, stageRecipe.base - stageRecipe.beat / 2), 0);
             nodeSet.deepSleep.rightOsc.parameters.get('frequency').setValueAtTime(Math.max(8, stageRecipe.base + stageRecipe.beat / 2), 0);
             if (nodeSet.deepSleep.pulseLFO) nodeSet.deepSleep.pulseLFO.parameters.get('frequency').setValueAtTime(stageRecipe.beat, 0);
        }
    }

    nodeSet.carrier.setBinaural(stageRecipe.base, stageRecipe.beat, now, ramp);
    nodeSet.pad.setFilter(stageRecipe.padCut, now, ramp);
    if (nodeSet.iso) nodeSet.iso.setRate(stageRecipe.iso, now, ramp);
    if (nodeSet.noise) _rampParam(nodeSet.noise.source.gain, stageRecipe.noise, ramp, now);
    if (nodeSet.deepSleep && nodeSet.deepSleep.setBinaural && nodeSet.deepSleep.setPulse) {
        nodeSet.deepSleep.setBinaural(stageRecipe.base, stageRecipe.beat, now, ramp);
        nodeSet.deepSleep.setPulse(stageRecipe.beat, now, ramp);
    }
    
    if (!isOffline) {
        const stageIndex = state.STAGES.findIndex(s => s.name === stageRecipe.name);
        if (stageIndex !== -1) state.currentStage = stageIndex;
        emit('engine:stageChanged', { stageIndex: state.currentStage });
    }
}

// --- Audio Node Creation (Private) ---
function _clearAudioGraph() {
    if (!nodes || Object.keys(nodes).length === 0) return;
    Object.values(nodes).forEach(node => {
        if (node.output) node.output.disconnect();
        else if (node.disconnect) node.disconnect();
        if(node.leftOsc) { node.leftOsc.disconnect(); }
        if(node.rightOsc) { node.rightOsc.disconnect(); }
        if (node.stopLoop) node.stopLoop();
        if (node.source && node.source.stop) node.source.stop();
    });
    nodes = {};
}

export async function createContext() {
    if (ctx) { 
        try { 
            ctx.removeEventListener('statechange', handleContextStateChange);
            await ctx.close(); 
        } catch(e) {} 
    }
    const context = new (window.AudioContext || window.webkitAudioContext)();
    memoizedBuffers.clear();
    carrierWavetable = null;
    isoWavetable = null;
    resonantPulseWavetable = null;
    ctx = context;
    ctx.addEventListener('statechange', handleContextStateChange);
    handleContextStateChange(); // Set initial state
}

async function _ensureWorkletReady(audioCtx) {
    if (workletReadyPromises.has(audioCtx)) {
        return workletReadyPromises.get(audioCtx);
    }

    // Create a new promise and store it immediately. This handles race conditions
    // where _ensureWorkletReady is called multiple times before the first one settles.
    const loadingPromise = (async () => {
        let blobURL;
        try {
            const blob = new Blob([workletProcessorsString], { type: "application/javascript" });
            blobURL = URL.createObjectURL(blob);
            await audioCtx.audioWorklet.addModule(blobURL);
        } catch (e) {
            console.error("Error adding AudioWorklet module.", e);
            emit('engine:worklet-error');
            // Re-throw the error to make the promise reject.
            throw e; 
        } finally {
            if (blobURL) {
                URL.revokeObjectURL(blobURL);
            }
        }
    })();

    workletReadyPromises.set(audioCtx, loadingPromise);
    return loadingPromise;
}


async function _createLFO(audioCtx, options) {
    const useWorklet = 'audioWorklet' in audioCtx && audioCtx.constructor.name !== 'OfflineAudioContext';
    
    if (useWorklet) {
        try {
            // Await the single, shared loading promise for this context.
            await _ensureWorkletReady(audioCtx);
            
            // If the above promise resolved, the worklet is ready.
            const lfoNode = new AudioWorkletNode(audioCtx, 'lfo-processor', {
                processorOptions: { startPhase: options.startPhase || 0 }
            });
            lfoNode.parameters.get('frequency').setValueAtTime(options.frequency, audioCtx.currentTime);
            lfoNode.parameters.get('amplitude').setValueAtTime(options.amplitude || 1, audioCtx.currentTime);
            return lfoNode;

        } catch (e) {
            // The promise from _ensureWorkletReady rejected, or AudioWorkletNode creation failed.
            // The error is already logged. We just fall through to the fallback.
            console.warn("AudioWorklet LFO failed, using fallback OscillatorNode.");
        }
    }

    // Fallback implementation for browsers without AudioWorklet or if it fails
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = options.frequency;
    
    const gain = audioCtx.createGain();
    gain.gain.value = options.amplitude;
    
    osc.connect(gain);
    osc.start();

    gain.parameters = {
        get: (param) => {
            if (param === 'frequency') return osc.frequency;
            if (param === 'amplitude') return gain.gain;
            return undefined;
        }
    };
    return gain;
}

async function _createLivingLFO(audioCtx, options) {
    const useWorklet = 'audioWorklet' in audioCtx && audioCtx.constructor.name !== 'OfflineAudioContext';
    
    if (useWorklet) {
        try {
            await _ensureWorkletReady(audioCtx);
            
            const lfoNode = new AudioWorkletNode(audioCtx, 'modulator-processor', {
                processorOptions: { startPhase: options.startPhase || 0 }
            });
            lfoNode.parameters.get('frequency').setValueAtTime(options.frequency, audioCtx.currentTime);
            lfoNode.parameters.get('amplitude').setValueAtTime(options.amplitude || 1, audioCtx.currentTime);
            return lfoNode;

        } catch (e) {
            console.warn("AudioWorklet Modulator failed, using fallback OscillatorNode.");
        }
    }

    // Fallback: Gracefully degrade to a standard LFO
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = options.frequency;
    
    const gain = audioCtx.createGain();
    gain.gain.value = options.amplitude;
    
    osc.connect(gain);
    osc.start();

    gain.parameters = {
        get: (param) => {
            if (param === 'frequency') return osc.frequency;
            if (param === 'amplitude') return gain.gain;
            return undefined;
        }
    };
    return gain;
}

function _createLimiterCompressor(audioCtx) {
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(config.engine.LIMITER_THRESHOLD, audioCtx.currentTime);
    compressor.knee.setValueAtTime(config.engine.LIMITER_KNEE, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(config.engine.LIMITER_RATIO, audioCtx.currentTime);
    compressor.attack.setValueAtTime(config.engine.LIMITER_ATTACK_S, audioCtx.currentTime);
    compressor.release.setValueAtTime(config.engine.LIMITER_RELEASE_S, audioCtx.currentTime);
    return compressor;
}

function _createReverb(audioCtx) {
    const { REVERB_DURATION_S, REVERB_DECAY } = config.engine;
    const rate = audioCtx.sampleRate, len = Math.floor(REVERB_DURATION_S * rate), buf = audioCtx.createBuffer(2, len, rate);
    for(let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / rate) / REVERB_DURATION_S, REVERB_DECAY);
    }
    const conv = audioCtx.createConvolver(); conv.buffer = buf; return conv;
}

async function _createCarrierPair(audioCtx, globalTimeOffset = 0) {
    // Ensure worklet is ready before proceeding. This will throw if it fails.
    await _ensureWorkletReady(audioCtx);
    
    if (!carrierWavetable) {
        carrierWavetable = _createHarmonicSineWavetable(4096, [
            { amp: 1.0, freq: 1 }, // Fundamental
            { amp: 0.15, freq: 2 }, // Octave
            { amp: 0.1, freq: 3 }, // Fifth
        ]);
    }

    const { CARRIER_VIBRATO_FREQ_HZ, CARRIER_VIBRATO_GAIN, CARRIER_PAN_LEFT, CARRIER_PAN_RIGHT, CARRIER_GAIN } = config.engine;
    
    const createCarrierNode = () => {
        const node = new AudioWorkletNode(audioCtx, 'waveform-core-processor');
        node.port.postMessage({ wavetable: carrierWavetable });
        
        // Set envelope for continuous tone
        node.parameters.get('gate').setValueAtTime(1, 0);
        node.parameters.get('attack').setValueAtTime(0.005, 0);
        node.parameters.get('decay').setValueAtTime(0.1, 0);
        node.parameters.get('sustain').setValueAtTime(1.0, 0);
        node.parameters.get('release').setValueAtTime(0.1, 0);
        
        // Add warmth with the built-in waveshaper
        node.parameters.get('drive').setValueAtTime(0.1, 0);
        
        return node;
    };

    const left = createCarrierNode();
    const right = createCarrierNode();
    
    const vibLFOPhase = (2 * Math.PI * CARRIER_VIBRATO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const lfo = await _createLFO(audioCtx, { frequency: CARRIER_VIBRATO_FREQ_HZ, amplitude: CARRIER_VIBRATO_GAIN, startPhase: vibLFOPhase});
    if (lfo) {
        lfo.connect(left.parameters.get('frequency'));
        lfo.connect(right.parameters.get('frequency'));
    }

    const panL = audioCtx.createStereoPanner(); panL.pan.value = CARRIER_PAN_LEFT;
    const panR = audioCtx.createStereoPanner(); panR.pan.value = CARRIER_PAN_RIGHT;
    const gL = audioCtx.createGain(), gR = audioCtx.createGain(); gL.gain.value = gR.gain.value = CARRIER_GAIN;
    
    const limiter = _createLimiterCompressor(audioCtx);

    left.connect(panL); right.connect(panR); panL.connect(gL); panR.connect(gR);
    gL.connect(limiter); gR.connect(limiter);

    return {
        // Use the same property names for backward compatibility with `setStage`
        leftOsc: left, 
        rightOsc: right, 
        output: limiter,
        setBinaural: (base, beat, when, ramp) => {
            _rampParam(left.parameters.get('frequency'), Math.max(8, base - beat / 2), ramp, when);
            _rampParam(right.parameters.get('frequency'), Math.max(8, base + beat / 2), ramp, when);
        }
    };
}

async function _createPadLayer(audioCtx, globalTimeOffset = 0) {
    const { PAD_LOOP_S, PAD_FILTER_Q, PAD_BASE_FREQ, PAD_OSC_DETUNE, PAD_CHORUS_LFO_MIN_FREQ, PAD_CHORUS_LFO_RANGE, PAD_CHORUS_LFO_MIN_GAIN, PAD_CHORUS_LFO_GAIN_RANGE, PAD_AMP_LFO_FREQ_HZ, PAD_AMP_LFO_GAIN, PAD_AMP_BASE_GAIN } = config.engine;
    const LOOP_DURATION_S = PAD_LOOP_S;
    
    let renderedBuffer;
    if (memoizedBuffers.has('pad')) {
        renderedBuffer = memoizedBuffers.get('pad');
    } else {
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * audioCtx.sampleRate), audioCtx.sampleRate);

        const master = offlineCtx.createGain(); master.gain.value = 0.0;
        const offlineFilter = offlineCtx.createBiquadFilter(); 
        offlineFilter.type = 'lowpass'; 
        offlineFilter.frequency.value = 4000; // Start high, it will be controlled by the real context filter
        offlineFilter.Q.value = PAD_FILTER_Q;
        master.connect(offlineFilter).connect(offlineCtx.destination);
        
        for (let i = 0; i < 3; i++) {
            const osc = offlineCtx.createOscillator();
            osc.type = 'sine';
            const startFreq = PAD_BASE_FREQ * (1 + (i - 1) * PAD_OSC_DETUNE);
            osc.frequency.value = startFreq;
            
            const freq = PAD_CHORUS_LFO_MIN_FREQ + Math.random() * PAD_CHORUS_LFO_RANGE;
            const amp = PAD_CHORUS_LFO_MIN_GAIN + Math.random() * PAD_CHORUS_LFO_GAIN_RANGE;
            const lfo = await _createLFO(offlineCtx, { frequency: freq, amplitude: amp });
            
            if (lfo) {
                const lfoGain = offlineCtx.createGain();
                lfoGain.gain.value = 1.0; // Control amplitude via gain
                lfo.connect(lfoGain);
                
                const constantSource = offlineCtx.createConstantSource();
                constantSource.offset.value = startFreq;
                constantSource.start();
                
                constantSource.connect(osc.frequency);
                lfoGain.connect(osc.frequency);
            }
            osc.start(0);
            osc.connect(master);
        }
        
        const ampLFO = await _createLFO(offlineCtx, { frequency: PAD_AMP_LFO_FREQ_HZ, amplitude: PAD_AMP_LFO_GAIN });
        if (ampLFO) ampLFO.connect(master.gain);
        const ampBase = offlineCtx.createConstantSource(); ampBase.offset.value = PAD_AMP_BASE_GAIN; ampBase.start(); ampBase.connect(master.gain);
        
        renderedBuffer = await offlineCtx.startRendering();
        memoizedBuffers.set('pad', renderedBuffer);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = renderedBuffer;
    source.loop = true;
    const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
    source.start(0, loopStartOffset);
    
    const filter = audioCtx.createBiquadFilter(); 
    filter.type = 'lowpass'; 
    filter.frequency.value = 1200; // Default, will be overridden by stage
    filter.Q.value = PAD_FILTER_Q;

    // --- Add real-time "living" filter modulation ---
    const { PAD_FILTER_LFO_FREQ_HZ, PAD_FILTER_LFO_GAIN } = config.engine;
    const filterLFOPhase = (2 * Math.PI * PAD_FILTER_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const filterLFO = await _createLivingLFO(audioCtx, {
        frequency: PAD_FILTER_LFO_FREQ_HZ,
        amplitude: PAD_FILTER_LFO_GAIN,
        startPhase: filterLFOPhase
    });
    if (filterLFO) {
        filterLFO.connect(filter.frequency);
    }
    // --- End of modulation section ---
    
    const out = audioCtx.createGain(); 
    out.gain.value = config.PAD_GAIN_MULTIPLIER; 
    
    const limiter = _createLimiterCompressor(audioCtx);
    source.connect(filter).connect(out).connect(limiter);

    return { 
        output: limiter, 
        filter, 
        setFilter: (cut, when, ramp) => _rampParam(filter.frequency, cut, ramp, when) 
    };
}


function _createPinkNoise(audioCtx) {
    const bufferSize = audioCtx.sampleRate * config.engine.PINK_NOISE_BUFFER_S;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Paul Kellett's refined method for pink noise generation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for(let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        data[i] *= 0.11; // (roughly) compensate for gain
        b6 = white * 0.115926;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const g = audioCtx.createGain(); src.connect(g); src.start(); return g;
}

async function _createIsoLayer(audioCtx, globalTimeOffset = 0) {
    await _ensureWorkletReady(audioCtx);

    const { ISO_BASE_FREQ } = config.engine;

    // 1. Create and cache the wavetable
    if (!isoWavetable) {
        // A simple sine wave is sufficient for a clean pluck sound.
        isoWavetable = _createHarmonicSineWavetable(4096, [{ amp: 1.0, freq: 1 }]);
    }

    // 2. Instantiate and configure the synth worklet from "Project Quantum Aura"
    const synthNode = new AudioWorkletNode(audioCtx, 'waveform-core-processor');
    synthNode.port.postMessage({ wavetable: isoWavetable });

    // Set the audible pitch of the pluck sound
    synthNode.parameters.get('frequency').value = ISO_BASE_FREQ;
    
    // Envelope settings from TODO to create a "pluck"
    synthNode.parameters.get('attack').value = 0.005;
    synthNode.parameters.get('decay').value = 0.3;
    synthNode.parameters.get('sustain').value = 0.0;
    synthNode.parameters.get('release').value = 0.1;
    
    // Drive setting from TODO to add a subtle "thump"
    synthNode.parameters.get('drive').value = 0.2;

    // 3. Create the clock/trigger LFO using a square wave oscillator
    const clockLFO = audioCtx.createOscillator();
    clockLFO.type = 'square';
    // Start with a default frequency; setStage will provide the correct one.
    clockLFO.frequency.value = 1.0; 

    // 4. Scale and offset the LFO's -1 to 1 output to be a 0 to 1 gate signal
    // The `gate` parameter of our worklet expects this range.
    const gateGain = audioCtx.createGain();
    gateGain.gain.value = 0.5;
    const gateOffset = audioCtx.createConstantSource();
    gateOffset.offset.value = 0.5;

    // Connect the clock to the scaling/offsetting nodes, then to the synth's gate
    clockLFO.connect(gateGain);
    gateOffset.connect(synthNode.parameters.get('gate'));
    gateGain.connect(synthNode.parameters.get('gate'));
    
    // 5. Connect to output chain and start the nodes that need starting
    const limiter = _createLimiterCompressor(audioCtx);
    synthNode.connect(limiter);

    clockLFO.start();
    gateOffset.start();

    // 6. Return the node object with the updated setRate method
    return { 
        output: limiter, 
        lfo: clockLFO, // The LFO is now the clock trigger
        setRate: (hz, when, ramp) => {
            // Ramping the frequency of the clock LFO changes the isochronic rate
            _rampParam(clockLFO.frequency, hz, ramp, when);
        }
    };
}

async function _createWindSound(audioCtx, globalTimeOffset = 0) {
    const { WIND_BUFFER_S, WIND_FILTER_FREQ_HZ, WIND_FILTER_Q, WIND_GAIN_LFO_FREQ_HZ, WIND_GAIN_LFO_GAIN, WIND_BASE_GAIN, WIND_PAN_LFO_FREQ_HZ, WIND_PAN_LFO_GAIN } = config.engine;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * WIND_BUFFER_S, audioCtx.sampleRate), output = buffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = WIND_FILTER_FREQ_HZ; filter.Q.value = WIND_FILTER_Q;
    
    const gainLFOPhase = (2 * Math.PI * WIND_GAIN_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const gainLFO = await _createLivingLFO(audioCtx, { frequency: WIND_GAIN_LFO_FREQ_HZ, amplitude: WIND_GAIN_LFO_GAIN, startPhase: gainLFOPhase });
    
    const mainGain = audioCtx.createGain(); mainGain.gain.value = WIND_BASE_GAIN;
    const panner = audioCtx.createStereoPanner(); panner.pan.value = 0;

    const panLFOPhase = (2 * Math.PI * WIND_PAN_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLivingLFO(audioCtx, { frequency: WIND_PAN_LFO_FREQ_HZ, amplitude: WIND_PAN_LFO_GAIN, startPhase: panLFOPhase });

    const limiter = _createLimiterCompressor(audioCtx);

    if (panLFO) panLFO.connect(panner.pan);
    if (gainLFO) gainLFO.connect(mainGain.gain);
    source.connect(filter); filter.connect(mainGain); mainGain.connect(panner).connect(limiter);
    source.start();
    return { output: limiter, gainNode: mainGain };
}

function _createDrumWave(audioCtx) {
    const numHarmonics = 32, real = new Float32Array(numHarmonics), imag = new Float32Array(numHarmonics);
    real[0] = 0; imag[0] = 0;
    for (let i = 1; i < numHarmonics; ++i) {
        real[i] = (i % 2 !== 0) ? ((-1) ** ((i - 1) / 2)) * (1 / (i * i)) : 0;
        imag[i] = 0;
    }
    return audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
}

async function _createShamanicDrum(audioCtx, globalTimeOffset = 0) {
    const { DRUM_LOOP_S, DRUM_MAIN_GAIN, DRUM_FILTER_FREQ, DRUM_FILTER_Q, DRUM_PAN_RANGE } = config.engine;
    const LOOP_DURATION_S = DRUM_LOOP_S;
    
    let renderedBuffer;
    if (memoizedBuffers.has('drum')) {
        renderedBuffer = memoizedBuffers.get('drum');
    } else {
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * audioCtx.sampleRate), audioCtx.sampleRate);
        const mainGain = offlineCtx.createGain(); mainGain.gain.value = DRUM_MAIN_GAIN; mainGain.connect(offlineCtx.destination);
        const customWave = _createDrumWave(offlineCtx);
        const scheduleBeat = (frequency, time, decay, gain) => {
            const osc = offlineCtx.createOscillator(); osc.setPeriodicWave(customWave);
            osc.frequency.setValueAtTime(frequency + (Math.random() - 0.5) * 2, time);
            const oscGain = offlineCtx.createGain(), lowpass = offlineCtx.createBiquadFilter(), panner = offlineCtx.createStereoPanner();
            lowpass.type = 'lowpass'; lowpass.frequency.setValueAtTime(DRUM_FILTER_FREQ, time); lowpass.Q.value = DRUM_FILTER_Q;
            panner.pan.setValueAtTime((Math.random() - 0.5) * DRUM_PAN_RANGE, time);
            osc.connect(oscGain); oscGain.connect(lowpass); lowpass.connect(panner); panner.connect(mainGain);
            oscGain.gain.setValueAtTime(0, time);
            oscGain.gain.linearRampToValueAtTime(gain + (Math.random() - 0.5) * 0.2, time + 0.01);
            oscGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
            osc.start(time); osc.stop(time + decay + 0.1);
        };
        scheduleBeat(40, 0, 12.0, 0.65); scheduleBeat(55, 0, 4.0, 0.45);
        renderedBuffer = await offlineCtx.startRendering();
        memoizedBuffers.set('drum', renderedBuffer);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = renderedBuffer;
    source.loop = true;
    const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
    
    const limiter = _createLimiterCompressor(audioCtx);
    source.connect(limiter);
    source.start(0, loopStartOffset);
    return { output: limiter, source };
}

async function _createSingingBowl(audioCtx, globalTimeOffset = 0) {
    const { BOWL_MAIN_GAIN, BOWL_PAN_LFO_FREQ_HZ, BOWL_PAN_LFO_GAIN, BOWL_ATTACK_S, BOWL_DECAY_S, BOWL_INTERVAL_S, BOWL_SCHEDULER_INTERVAL_MS, BOWL_SCHEDULER_LOOKAHEAD_S } = config.engine;

    const mainGain = audioCtx.createGain();
    mainGain.gain.value = BOWL_MAIN_GAIN;
    const panner = audioCtx.createStereoPanner();
    mainGain.connect(panner);

    const panLFOPhase = (2 * Math.PI * BOWL_PAN_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLFO(audioCtx, { frequency: BOWL_PAN_LFO_FREQ_HZ, amplitude: BOWL_PAN_LFO_GAIN, startPhase: panLFOPhase });
    if (panLFO) panLFO.connect(panner.pan);

    const envelope = audioCtx.createGain();
    envelope.gain.value = 0.0;

    const wavetable = await getSingingBowlWavetable();
    const source = audioCtx.createBufferSource();
    source.buffer = wavetable;
    source.loop = true;
    
    const limiter = _createLimiterCompressor(audioCtx);
    source.connect(envelope).connect(mainGain).connect(limiter);
    source.start();

    // --- Click-free AD envelope using ramps ---
    let nextStrikeTime = 0;
    let schedulerTimeoutId = null;

    const scheduleStrike = (time) => {
        try {
            const rampToSilenceDuration = 0.05;
            envelope.gain.cancelScheduledValues(time);
            envelope.gain.setValueAtTime(envelope.gain.value, time);
            _rampParam(envelope.gain, config.MIN_GAIN, rampToSilenceDuration, time);

            const strikeTime = time + rampToSilenceDuration;
            const peakTime = strikeTime + BOWL_ATTACK_S;
            
            _rampParam(envelope.gain, 1.0, BOWL_ATTACK_S, strikeTime);
            envelope.gain.setTargetAtTime(config.MIN_GAIN, peakTime, BOWL_DECAY_S / 5);

        } catch (e) {
            console.error("Error scheduling singing bowl strike:", e);
        }
    };

    const scheduler = () => {
        const now = audioCtx.currentTime;
    
        // Schedule any notes that fall within the lookahead window.
        while (nextStrikeTime < now + BOWL_SCHEDULER_LOOKAHEAD_S) {
            scheduleStrike(nextStrikeTime);
            nextStrikeTime += BOWL_INTERVAL_S;
        }
    
        // Set a timeout for the next time we need to check.
        // This will be shortly before the next note is due.
        const timeUntilNextEvent = nextStrikeTime - now;
        // We subtract a small amount of time (our lookahead) to wake up *before* the event.
        // The result is in seconds, so we multiply by 1000 for setTimeout.
        const timeoutDuration = (timeUntilNextEvent - BOWL_SCHEDULER_LOOKAHEAD_S) * 1000;
        
        // We need to ensure we don't set a timeout for the past or for too soon.
        // The BOWL_SCHEDULER_INTERVAL_MS can serve as a minimum polling interval if events are very close.
        schedulerTimeoutId = setTimeout(scheduler, Math.max(BOWL_SCHEDULER_INTERVAL_MS, timeoutDuration));
    };

    const startLoop = () => {
        if (schedulerTimeoutId) clearTimeout(schedulerTimeoutId);
        // Schedule the first strike to happen very soon after starting.
        // This avoids a long initial wait if BOWL_INTERVAL_S is large.
        nextStrikeTime = audioCtx.currentTime + 0.1;
        scheduler(); // Kick off the scheduling loop.
    };

    const stopLoop = () => {
        if (schedulerTimeoutId) clearTimeout(schedulerTimeoutId);
        schedulerTimeoutId = null;
        envelope.gain.cancelScheduledValues(audioCtx.currentTime);
        _rampParam(envelope.gain, 0, 0.5, ctx.currentTime);
    };

    return { output: limiter, gainNode: mainGain, startLoop, stopLoop, envelope };
}


async function _createDeepSleepBinaural(audioCtx, globalTimeOffset = 0) {
    const { DEEP_SLEEP_PULSE_LFO_GAIN, DEEP_SLEEP_PULSE_BASE_GAIN, DEEP_SLEEP_PAN_LFO_FREQ_HZ, DEEP_SLEEP_PAN_LFO_GAIN, DEEP_SLEEP_PAN_INVERTER_GAIN } = config.engine;

    await _ensureWorkletReady(audioCtx);
    if (!carrierWavetable) {
        carrierWavetable = _createHarmonicSineWavetable(4096, [
            { amp: 1.0, freq: 1 }, { amp: 0.15, freq: 2 }, { amp: 0.1, freq: 3 },
        ]);
    }

    const createDeepSleepNode = () => {
        const node = new AudioWorkletNode(audioCtx, 'waveform-core-processor');
        node.port.postMessage({ wavetable: carrierWavetable });
        node.parameters.get('gate').setValueAtTime(1, 0);
        node.parameters.get('attack').setValueAtTime(0.01, 0);
        node.parameters.get('sustain').setValueAtTime(1.0, 0);
        node.parameters.get('release').setValueAtTime(0.1, 0);
        node.parameters.get('drive').setValueAtTime(0.05, 0);
        return node;
    };

    const leftOsc = createDeepSleepNode();
    const rightOsc = createDeepSleepNode();

    const outputGain = audioCtx.createGain();
    outputGain.gain.value = config.DEEP_SLEEP_GAIN_MULTIPLIER;

    const pulseGain = audioCtx.createGain();
    pulseGain.gain.value = 0;
    
    const limiter = _createLimiterCompressor(audioCtx);
    pulseGain.connect(limiter).connect(outputGain);

    const pulseFreq = 1.0; // Default, will be overridden by stage
    const pulsePhase = (2 * Math.PI * pulseFreq * globalTimeOffset) % (2 * Math.PI);
    
    const pulseLFO = await _createLFO(audioCtx, { 
        frequency: pulseFreq, 
        amplitude: DEEP_SLEEP_PULSE_LFO_GAIN,
        startPhase: pulsePhase 
    });
    
    const baseGain = audioCtx.createConstantSource();
    baseGain.offset.value = DEEP_SLEEP_PULSE_BASE_GAIN;
    baseGain.start();

    if (pulseLFO) pulseLFO.connect(pulseGain.gain);
    baseGain.connect(pulseGain.gain);
    
    const leftPanner = audioCtx.createStereoPanner(), rightPanner = audioCtx.createStereoPanner(), panInverter = audioCtx.createGain(), merger = audioCtx.createChannelMerger(2);
    panInverter.gain.value = DEEP_SLEEP_PAN_INVERTER_GAIN;
    const panLFOPhase = (2 * Math.PI * DEEP_SLEEP_PAN_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLFO(audioCtx, { frequency: DEEP_SLEEP_PAN_LFO_FREQ_HZ, amplitude: DEEP_SLEEP_PAN_LFO_GAIN, startPhase: panLFOPhase });

    if (panLFO) {
        panLFO.connect(leftPanner.pan); panLFO.connect(panInverter); panInverter.connect(rightPanner.pan);
    }
    leftOsc.connect(leftPanner); rightOsc.connect(rightPanner);
    leftPanner.connect(merger, 0, 0); rightPanner.connect(merger, 0, 1); 
    
    merger.connect(pulseGain);
    
    return { 
        output: outputGain, 
        gainNode: outputGain, 
        leftOsc, 
        rightOsc, 
        pulseLFO,
        setBinaural: (base, beat, when, ramp) => {
            _rampParam(leftOsc.parameters.get('frequency'), Math.max(8, base - beat / 2), ramp, when);
            _rampParam(rightOsc.parameters.get('frequency'), Math.max(8, base + beat / 2), ramp, when);
        },
        setPulse: (hz, when, ramp) => {
            if (pulseLFO) {
                _rampParam(pulseLFO.parameters.get('frequency'), hz, ramp, when);
            }
        }
    };
}

async function _createBrainPulse(audioCtx, globalTimeOffset = 0) {
    const { BRAIN_PULSE_LOOP_S, BRAIN_PULSE_COMPRESSOR_THRESHOLD, BRAIN_PULSE_COMPRESSOR_KNEE, BRAIN_PULSE_COMPRESSOR_RATIO, BRAIN_PULSE_COMPRESSOR_ATTACK, BRAIN_PULSE_COMPRESSOR_RELEASE } = config.engine;
    const LOOP_DURATION_S = BRAIN_PULSE_LOOP_S;
    
    let renderedBuffer;
    if (memoizedBuffers.has('brainPulse')) {
        renderedBuffer = memoizedBuffers.get('brainPulse');
    } else {
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * audioCtx.sampleRate), audioCtx.sampleRate);
        const masterOutput = offlineCtx.createGain();
        const compressor = offlineCtx.createDynamicsCompressor();
        compressor.threshold.value = BRAIN_PULSE_COMPRESSOR_THRESHOLD; 
        compressor.knee.value = BRAIN_PULSE_COMPRESSOR_KNEE;
        compressor.ratio.value = BRAIN_PULSE_COMPRESSOR_RATIO;
        compressor.attack.value = BRAIN_PULSE_COMPRESSOR_ATTACK;
        compressor.release.value = BRAIN_PULSE_COMPRESSOR_RELEASE;
        masterOutput.connect(compressor); compressor.connect(offlineCtx.destination);
        const localNodes = ['mainOscillator', 'lfoOscillator', 'pannerLFO', 'chorusOscillator1', 'chorusOscillator2'].reduce((acc, k) => (acc[k] = offlineCtx.createOscillator(), acc), {});
        const gains = ['tremoloGain', 'volumeRampGain', 'chorusGain1', 'chorusGain2'].reduce((acc, k) => (acc[k] = offlineCtx.createGain(), acc), {});
        const pannerNode = offlineCtx.createStereoPanner();
        localNodes.mainOscillator.type = 'sine'; localNodes.mainOscillator.frequency.value = 55;
        localNodes.lfoOscillator.type = 'sine'; localNodes.lfoOscillator.frequency.value = 4;
        localNodes.pannerLFO.type = 'sine'; localNodes.pannerLFO.frequency.value = 0.1;
        localNodes.chorusOscillator1.type = 'sine'; localNodes.chorusOscillator1.frequency.value = 27.5;
        localNodes.chorusOscillator2.type = 'sine'; localNodes.chorusOscillator2.frequency.value = 27.5;
        gains.volumeRampGain.gain.value = 0; gains.chorusGain1.gain.value = 0;
        gains.chorusGain2.gain.value = 0; gains.tremoloGain.gain.value = 0.5;
        localNodes.mainOscillator.connect(gains.volumeRampGain).connect(pannerNode).connect(masterOutput);
        localNodes.lfoOscillator.connect(gains.tremoloGain).connect(gains.volumeRampGain.gain);
        localNodes.pannerLFO.connect(pannerNode.pan);
        localNodes.chorusOscillator1.connect(gains.chorusGain1).connect(masterOutput);
        localNodes.chorusOscillator2.connect(gains.chorusGain2).connect(masterOutput);
        const now = 0, endTime = now + LOOP_DURATION_S, FADE_IN_TIME = 0.02, FADE_OUT_TIME = 1.5;
        localNodes.mainOscillator.frequency.setValueAtTime(55, now);
        localNodes.mainOscillator.frequency.linearRampToValueAtTime(20, endTime);
        gains.volumeRampGain.gain.setValueAtTime(0, now);
        gains.volumeRampGain.gain.linearRampToValueAtTime(1.0, now + FADE_IN_TIME);
        gains.volumeRampGain.gain.setValueAtTime(1.0, endTime - FADE_OUT_TIME);
        gains.volumeRampGain.gain.linearRampToValueAtTime(0, endTime);
        localNodes.lfoOscillator.frequency.setValueAtTime(4, now);
        localNodes.lfoOscillator.frequency.linearRampToValueAtTime(1, endTime);
        localNodes.chorusOscillator1.frequency.setValueAtTime(27.5, now);
        localNodes.chorusOscillator1.frequency.linearRampToValueAtTime(20, endTime);
        localNodes.chorusOscillator2.frequency.setValueAtTime(27.5, now);
        localNodes.chorusOscillator2.frequency.linearRampToValueAtTime(20, endTime);
        gains.chorusGain1.gain.setValueAtTime(0, now);
        gains.chorusGain1.gain.linearRampToValueAtTime(0.05, now + FADE_IN_TIME);
        gains.chorusGain1.gain.setValueAtTime(0.3, endTime - FADE_OUT_TIME);
        gains.chorusGain1.gain.linearRampToValueAtTime(0, endTime);
        gains.chorusGain2.gain.setValueAtTime(0, now);
        gains.chorusGain2.gain.linearRampToValueAtTime(0.05, now + FADE_IN_TIME);
        gains.chorusGain2.gain.setValueAtTime(0.3, endTime - FADE_OUT_TIME);
        gains.chorusGain2.gain.linearRampToValueAtTime(0, endTime);
        Object.values(localNodes).forEach(n => n.start(now));
        renderedBuffer = await offlineCtx.startRendering();
        memoizedBuffers.set('brainPulse', renderedBuffer);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = renderedBuffer;
    source.loop = true;
    const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
    
    const limiter = _createLimiterCompressor(audioCtx);
    source.connect(limiter);
    source.start(0, loopStartOffset);
    return { output: limiter, source };
}

async function _createResonantPulse(audioCtx, globalTimeOffset = 0) {
    const { RESONANT_PULSE_MAIN_GAIN, RESONANT_PULSE_BASE_FREQ, RESONANT_PULSE_BEAT_FREQ, RESONANT_PULSE_SWELL_LFO_FREQ_HZ, RESONANT_PULSE_SWELL_LFO_GAIN, RESONANT_PULSE_SWELL_BASE_GAIN } = config.engine;
    
    await _ensureWorkletReady(audioCtx);
    if (!resonantPulseWavetable) {
        resonantPulseWavetable = _createHarmonicSineWavetable(4096, [
            { amp: 1.0, freq: 1 },
            { amp: 0.4, freq: 0.5 },
            { amp: 0.15, freq: 2.0 }
        ]);
    }

    const createResonantNode = (freq) => {
        const node = new AudioWorkletNode(audioCtx, 'waveform-core-processor');
        node.port.postMessage({ wavetable: resonantPulseWavetable });
        node.parameters.get('frequency').value = freq;
        node.parameters.get('gate').setValueAtTime(1, 0);
        node.parameters.get('attack').setValueAtTime(0.01, 0);
        node.parameters.get('sustain').setValueAtTime(1.0, 0);
        node.parameters.get('release').setValueAtTime(0.1, 0);
        node.parameters.get('drive').setValueAtTime(0.1, 0);
        return node;
    };
    
    const output = audioCtx.createGain();
    output.gain.value = RESONANT_PULSE_MAIN_GAIN;

    const osc1 = createResonantNode(RESONANT_PULSE_BASE_FREQ);
    const osc2 = createResonantNode(RESONANT_PULSE_BASE_FREQ + RESONANT_PULSE_BEAT_FREQ);

    const swellGain = audioCtx.createGain();
    
    const swellLFOPhase = (2 * Math.PI * RESONANT_PULSE_SWELL_LFO_FREQ_HZ * globalTimeOffset) % (2 * Math.PI);
    const swellLFO = await _createLFO(audioCtx, { 
        frequency: RESONANT_PULSE_SWELL_LFO_FREQ_HZ, 
        amplitude: RESONANT_PULSE_SWELL_LFO_GAIN,
        startPhase: swellLFOPhase 
    });

    const swellBaseGain = audioCtx.createConstantSource();
    swellBaseGain.offset.value = RESONANT_PULSE_SWELL_BASE_GAIN;

    if (swellLFO) swellLFO.connect(swellGain.gain);
    swellBaseGain.connect(swellGain.gain);

    const limiter = _createLimiterCompressor(audioCtx);
    osc1.connect(swellGain);
    osc2.connect(swellGain);
    swellGain.connect(limiter).connect(output);

    swellBaseGain.start();

    return { 
        output: output,
        gainNode: output
    };
}

async function _createAudioGraph(audioCtx, destinationNode, activeToggles, initialIntensity, globalTimeOffset = 0) {
    const newEffectsGain = audioCtx.createGain(); newEffectsGain.gain.value = initialIntensity; newEffectsGain.connect(destinationNode);
    const newNodes = { effectsGain: newEffectsGain };

    // --- Create essential, non-optional nodes first ---
    // These will throw an error and stop execution if they fail, which is intended
    // as the app cannot function without them.
    newNodes.reverb = _createReverb(audioCtx); newNodes.reverb.connect(destinationNode);
    newNodes.carrier = await _createCarrierPair(audioCtx, globalTimeOffset);
    newNodes.carrier.output.connect(destinationNode); 
    newNodes.carrier.output.connect(newNodes.reverb); 
    newNodes.pad = await _createPadLayer(audioCtx, globalTimeOffset); 
    newNodes.pad.output.connect(destinationNode); newNodes.pad.output.connect(newNodes.reverb);

    // --- Create optional effect nodes with graceful degradation ---
    const creators = {
        iso: _createIsoLayer, noise: _createPinkNoise, wind: _createWindSound,
        drum: _createShamanicDrum, bowl: _createSingingBowl, deepSleep: _createDeepSleepBinaural,
        brainPulse: _createBrainPulse, resonantPulse: _createResonantPulse
    };
    
    for (const conf of toggleConfigs) {
        const { nodeKey } = conf;
        if (!creators[nodeKey]) continue;

        try {
            const node = await creators[nodeKey](audioCtx, globalTimeOffset);
            
            const gainSwitch = audioCtx.createGain(); 
            gainSwitch.gain.value = activeToggles[conf.stateKey] ? 1 : 0;
            const output = node.output || node; 
            output.connect(gainSwitch);
            gainSwitch.connect(newEffectsGain);

            if(!['deepSleep', 'brainPulse', 'resonantPulse'].includes(nodeKey)) {
                gainSwitch.connect(newNodes.reverb);
            }
            newNodes[nodeKey] = { ...node, gainSwitch, source: output };

        } catch (error) {
            console.error(`Failed to create audio node '${nodeKey}':`, error);
            emit('engine:node-creation-failed', { nodeKey });
            // Continue to the next node, allowing the app to run without this effect.
        }
    }
    return newNodes;
}

// --- Audio Rendering ---

function _convertBufferTo16BitPcm(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const numSamples = audioBuffer.length;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    const pcm16 = new Int16Array(numSamples * numChannels);
    let offset = 0;
    for (let i = 0; i < numSamples; i++) {
        for (let j = 0; j < numChannels; j++) {
            let sample = Math.max(-1, Math.min(1, channels[j][i]));
            sample = sample < 0 ? sample * 32768 : sample * 32767;
            pcm16[offset++] = sample;
        }
    }
    return pcm16;
}

function _createWavBlobFromPcm(pcmData, numChannels, sampleRate) {
    const pcmDataLength = pcmData.byteLength;
    const headerLength = 44;
    const totalLength = headerLength + pcmDataLength;
    
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);

    let pos = 0;
    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952); // "RIFF"
    setUint32(totalLength - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // format chunk size
    setUint16(1); // PCM
    setUint16(numChannels);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numChannels); // avg bytes/sec
    setUint16(numChannels * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" chunk
    setUint32(pcmDataLength);

    new Uint8Array(buffer, headerLength).set(new Uint8Array(pcmData.buffer));

    return new Blob([view], { type: 'audio/wav' });
}

export async function renderOffline(progressCallback, mimeType, bitrate) {
    if (mimeType !== 'audio/wav') {
        throw new Error('Sorry, only WAV export is currently supported.');
    }
    
    const CHUNK_DURATION_S = 60.0;
    const totalDuration = state.sessionLengthMinutes * 60;
    const sampleRate = 44100;
    const stagesToRender = state.STAGES;
    const stageDuration = totalDuration / stagesToRender.length;
    
    if (stagesToRender.length === 0) {
        throw new Error("No stages to render.");
    }
    
    const activeToggles = toggleConfigs.reduce((acc, conf) => {
        acc[conf.stateKey] = state[conf.stateKey];
        return acc;
    }, {});
    
    const allPcmChunks = [];
    let processedTime = 0;

    while (processedTime < totalDuration) {
        if (state.renderProcess.cancel) return null;

        const chunkStartTime = processedTime;
        const currentChunkDuration = Math.min(CHUNK_DURATION_S, totalDuration - chunkStartTime);
        const chunkEndTime = chunkStartTime + currentChunkDuration;
        
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            2, currentChunkDuration * sampleRate, sampleRate
        );
        
        const offlineMasterGain = offlineCtx.createGain();
        offlineMasterGain.connect(offlineCtx.destination);
        offlineMasterGain.gain.value = state.masterVolume;
        
        const offlineNodes = await _createAudioGraph(offlineCtx, offlineMasterGain, activeToggles, state.effectsIntensity, chunkStartTime);

        // Schedule all relevant stages for this chunk
        for (let i = 0; i < stagesToRender.length; i++) {
            const stageStartTime = i * stageDuration;
            const stageEndTime = (i + 1) * stageDuration;

            // Check if the stage overlaps with the current chunk
            if (stageStartTime < chunkEndTime && stageEndTime > chunkStartTime) {
                const rampStartTimeInChunk = Math.max(0, stageStartTime - chunkStartTime);
                setStage(stagesToRender[i], offlineNodes, rampStartTimeInChunk, config.STAGE_CHANGE_RAMP_S);
            }
        }
        
        const renderedBuffer = await offlineCtx.startRendering();
        const pcmData = _convertBufferTo16BitPcm(renderedBuffer);
        allPcmChunks.push(pcmData);

        processedTime += currentChunkDuration;
        progressCallback(processedTime, processedTime);
    }
    
    if (state.renderProcess.cancel) return null;

    // Concatenate all PCM data chunks
    const totalPcmLength = allPcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const finalPcmData = new Int16Array(totalPcmLength);
    let offset = 0;
    for (const chunk of allPcmChunks) {
        finalPcmData.set(chunk, offset);
        offset += chunk.length;
    }

    return _createWavBlobFromPcm(finalPcmData, 2, sampleRate);
}