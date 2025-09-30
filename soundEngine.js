import { state } from './state.js';
import { config, toggleConfigs } from './presets.js';

// This string contains the code for our custom AudioWorkletProcessor.
// It's defined here to avoid needing a separate file, which simplifies local usage (file://).
const lfoProcessorString = `
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
`;


export let ctx = null;
export let masterGain = null;
export let effectsGain = null;
export let nodes = {};
let callbacks = {};


// --- Engine Lifecycle ---
export function init(cb, initialStageRecipe, activeToggles, initialIntensity) {
    if (cb) { // Allow setting/updating callbacks
        callbacks = cb;
    }
    
    // Only initialize the audio graph if a recipe is provided AND the audio context exists.
    if (initialStageRecipe && ctx) {
        return _initializeAudio(initialStageRecipe, activeToggles, initialIntensity);
    }
}

async function _initializeAudio(initialStageRecipe, activeToggles, initialIntensity) {
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.connect(ctx.destination);
    
    nodes = await _createAudioGraph(ctx, masterGain, initialStageRecipe, activeToggles, initialIntensity);
    effectsGain = nodes.effectsGain;
    setStage(initialStageRecipe, nodes, ctx.currentTime, 0.1);
}

export function resume() {
    if (!ctx || !masterGain) return;
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(state.masterVolume, ctx.currentTime + config.RESUME_FADE_DURATION_S);
    
    if (nodes.bowl && state.isBowlEnabled) nodes.bowl.startLoop();
    if (callbacks.startAuto) callbacks.startAuto();
}

export async function stop() {
    if (!ctx) return;
    if (callbacks.stopAuto) callbacks.stopAuto();

    if (nodes.bowl) nodes.bowl.stopLoop();
    state.sessionElapsedTime = 0;
    state.isPlaying = false;

    try {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(config.MIN_GAIN, ctx.currentTime + config.FADE_DURATION_S);
    } catch (e) { console.error("Error stopping gain ramp:", e); }

    return new Promise(resolve => {
        setTimeout(() => {
            try { 
                if (ctx && ctx.state !== 'closed') {
                    _clearAudioGraph();
                    ctx.close().then(() => {
                       ctx = null;
                    });
                }
            } catch (e) {}
            state.currentStage = -1;
            if (callbacks.onStop) callbacks.onStop();
            resolve();
        }, config.FADE_DURATION_S * 1000);
    });
}

export function pause() {
    if (!ctx || !masterGain) return;
    if (callbacks.stopAuto) callbacks.stopAuto();

    if (nodes.bowl) nodes.bowl.stopLoop();
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(config.MIN_GAIN, ctx.currentTime + config.PAUSE_FADE_DURATION_S);
}

export async function transitionToPreset(preset) {
    if (!ctx || ctx.state !== 'running') return;
    const fadeS = 1.0;

    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(config.MIN_GAIN, ctx.currentTime + fadeS);
    await new Promise(resolve => setTimeout(resolve, fadeS * 1000));
    
    _clearAudioGraph();
    
    const initialStageRecipe = preset.stages[0];
    const activeToggles = toggleConfigs.reduce((acc, conf) => {
        acc[conf.nodeKey] = state[conf.stateKey];
        return acc;
    }, {});
    
    nodes = await _createAudioGraph(ctx, masterGain, initialStageRecipe, activeToggles, state.effectsIntensity);
    effectsGain = nodes.effectsGain;
    
    setStage(initialStageRecipe, nodes, ctx.currentTime, 0.1);
    if (nodes.bowl && state.isBowlEnabled) nodes.bowl.startLoop();
    
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(state.masterVolume, ctx.currentTime + fadeS);

    state.currentStage = 0;
    state.sessionElapsedTime = 0;
    if (state.autoplayInterval) state.lastTickTime = performance.now();
    
    if (callbacks.onStageChange) callbacks.onStageChange(state.currentStage);
}

export function setMasterVolume(value, ramp = 0.1) {
    if (masterGain && state.isPlaying) {
        masterGain.gain.linearRampToValueAtTime(value, ctx.currentTime + ramp);
    }
}

export function setIntensity(value, ramp = 0.1) {
    if (effectsGain) {
        effectsGain.gain.linearRampToValueAtTime(value, ctx.currentTime + ramp);
    }
}

export function toggleEffect(effectKey, isEnabled) {
    if (ctx && nodes[effectKey] && nodes[effectKey].gainSwitch) {
        const node = nodes[effectKey];
        const targetGain = isEnabled ? 1 : 0;
        node.gainSwitch.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.5);
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
        nodeSet.carrier.leftOsc.frequency.setValueAtTime(Math.max(8, stageRecipe.base - stageRecipe.beat / 2), 0);
        nodeSet.carrier.rightOsc.frequency.setValueAtTime(Math.max(8, stageRecipe.base + stageRecipe.beat / 2), 0);
        nodeSet.pad.filter.frequency.setValueAtTime(stageRecipe.padCut, 0);
        if (nodeSet.iso) nodeSet.iso.lfo.parameters.get('frequency').setValueAtTime(stageRecipe.iso, 0);
        if (nodeSet.noise) nodeSet.noise.source.gain.setValueAtTime(stageRecipe.noise, 0);
    }

    nodeSet.carrier.setBinaural(stageRecipe.base, stageRecipe.beat, now, ramp);
    nodeSet.pad.setFilter(stageRecipe.padCut, now, ramp);
    if (nodeSet.iso) nodeSet.iso.setRate(stageRecipe.iso, now, ramp);
    if (nodeSet.noise) nodeSet.noise.source.gain.linearRampToValueAtTime(stageRecipe.noise, now + ramp);
    
    if (!isOffline) {
        const stageIndex = state.STAGES.findIndex(s => s.name === stageRecipe.name);
        if (stageIndex !== -1) state.currentStage = stageIndex;
        if (callbacks.onStageChange) callbacks.onStageChange(state.currentStage);
    }
}

// --- Audio Node Creation (Private) ---
function _clearAudioGraph() {
    if (!nodes || Object.keys(nodes).length === 0) return;
    Object.values(nodes).forEach(node => {
        if (node.output) node.output.disconnect();
        else if (node.disconnect) node.disconnect();
        if(node.leftOsc) { node.leftOsc.stop(); node.leftOsc.disconnect(); }
        if(node.rightOsc) { node.rightOsc.stop(); node.rightOsc.disconnect(); }
        if (node.stopLoop) node.stopLoop();
        if (node.source && node.source.stop) node.source.stop();
    });
    nodes = {};
}

export function createContext() {
    if (ctx) { try { ctx.close(); } catch(e) {} }
    const context = new (window.AudioContext || window.webkitAudioContext)();
    context.lfoModuleAdded = false; // Flag for worklet
    ctx = context;
}

async function _createLFO(audioCtx, options) {
    if (!audioCtx.lfoModuleAdded) {
        try {
            const blob = new Blob([lfoProcessorString], { type: "application/javascript" });
            const blobURL = URL.createObjectURL(blob);
            await audioCtx.audioWorklet.addModule(blobURL);
            audioCtx.lfoModuleAdded = true;
        } catch (e) {
            console.error("Error adding AudioWorklet module.", e);
            return null;
        }
    }
    const lfoNode = new AudioWorkletNode(audioCtx, 'lfo-processor', {
        processorOptions: { startPhase: options.startPhase || 0 }
    });
    lfoNode.parameters.get('frequency').setValueAtTime(options.frequency, audioCtx.currentTime);
    lfoNode.parameters.get('amplitude').setValueAtTime(options.amplitude || 1, audioCtx.currentTime);
    return lfoNode;
}

function _createReverb(audioCtx, duration = 3, decay = 2.0) {
    const rate = audioCtx.sampleRate, len = Math.floor(duration * rate), buf = audioCtx.createBuffer(2, len, rate);
    for(let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / rate) / duration, decay);
    }
    const conv = audioCtx.createConvolver(); conv.buffer = buf; return conv;
}

async function _createCarrierPair(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const left = audioCtx.createOscillator(), right = audioCtx.createOscillator(); left.type = right.type = 'sine'; left.start(); right.start();
    
    const vibLFOPhase = (2 * Math.PI * 0.06 * globalTimeOffset) % (2 * Math.PI);
    const lfo = await _createLFO(audioCtx, { frequency: 0.06, amplitude: 1.6, startPhase: vibLFOPhase});

    lfo.connect(left.frequency); lfo.connect(right.frequency);

    const panL = audioCtx.createStereoPanner(); panL.pan.value = -0.6;
    const panR = audioCtx.createStereoPanner(); panR.pan.value = 0.6;
    const gL = audioCtx.createGain(), gR = audioCtx.createGain(); gL.gain.value = gR.gain.value = 0.45;
    left.connect(panL); right.connect(panR); panL.connect(gL); panR.connect(gR);

    return {
        leftOsc: left, rightOsc: right, outputLeft: gL, outputRight: gR,
        setBinaural: (base, beat, when, ramp) => {
            left.frequency.linearRampToValueAtTime(Math.max(8, base - beat / 2), when + ramp);
            right.frequency.linearRampToValueAtTime(Math.max(8, base + beat / 2), when + ramp);
        }
    };
}

async function _createPadLayer(audioCtx, globalTimeOffset = 0) {
    const master = audioCtx.createGain(); master.gain.value = 0.0;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 0.7;
    master.connect(filter);

    const out = audioCtx.createGain(); out.gain.value = config.PAD_GAIN_MULTIPLIER; filter.connect(out);
    const base = 110;
    for(let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = base * (1 + (i-1)*0.02);
        const freq = 0.02 + Math.random()*0.04;
        const phase = (2 * Math.PI * freq * globalTimeOffset) % (2 * Math.PI);
        const lfo = await _createLFO(audioCtx, { frequency: freq, amplitude: 0.5 + Math.random()*0.6, startPhase: phase});
        lfo.connect(osc.frequency); osc.start(); osc.connect(master);
    }

    const ampFreq = 0.03;
    const ampPhase = (2 * Math.PI * ampFreq * globalTimeOffset) % (2 * Math.PI);
    const ampLFO = await _createLFO(audioCtx, { frequency: ampFreq, amplitude: 0.25, startPhase: ampPhase });
    ampLFO.connect(master.gain);
    return { output: out, filter, setFilter: (cut, when, ramp) => filter.frequency.linearRampToValueAtTime(cut, when + ramp) };
}

function _createPinkNoise(audioCtx) {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate), data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0;
    for(let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460; b1 = 0.96300 * b1 + white * 0.2965164;
        data[i] = (b0 + b1 + white * 0.1848) * 0.25;
    }
    const src = audioCtx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const g = audioCtx.createGain(); src.connect(g); src.start(); return g;
}

async function _createIsoLayer(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 80;
    const outG = audioCtx.createGain(); 

    const isoFreq = stageRecipe.iso;
    const phase = (2 * Math.PI * isoFreq * globalTimeOffset) % (2 * Math.PI);
    const lfo = await _createLFO(audioCtx, { frequency: isoFreq, amplitude: 0.4, startPhase: phase });
    lfo.connect(outG.gain);

    const baseGain = audioCtx.createConstantSource(); baseGain.offset.value = 0.5;
    baseGain.connect(outG.gain);

    osc.connect(outG);
    osc.start(); baseGain.start();
    return { output: outG, gainNode: outG, lfo, setRate: (hz, when, ramp) => lfo.parameters.get('frequency').linearRampToValueAtTime(hz, when + ramp) };
}

async function _createWindSound(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate), output = buffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5;
    
    const gainLFOFreq = 0.08;
    const gainLFOPhase = (2 * Math.PI * gainLFOFreq * globalTimeOffset) % (2 * Math.PI);
    const gainLFO = await _createLFO(audioCtx, { frequency: gainLFOFreq, amplitude: 0.3, startPhase: gainLFOPhase });
    
    const mainGain = audioCtx.createGain(); mainGain.gain.value = 0.15;
    const panner = audioCtx.createStereoPanner(); panner.pan.value = 0;

    const panLFOFreq = 0.05;
    const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLFO(audioCtx, { frequency: panLFOFreq, amplitude: 0.8, startPhase: panLFOPhase });

    panLFO.connect(panner.pan);
    source.connect(filter); filter.connect(mainGain); gainLFO.connect(mainGain.gain); mainGain.connect(panner);
    source.start();
    return { output: panner, gainNode: mainGain };
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

async function _createShamanicDrum(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const LOOP_DURATION_S = 10.0; // 6 BPM
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * audioCtx.sampleRate), audioCtx.sampleRate);
    const mainGain = offlineCtx.createGain(); mainGain.gain.value = 0.847; mainGain.connect(offlineCtx.destination);
    const customWave = _createDrumWave(offlineCtx);
    const scheduleBeat = (frequency, time, decay, gain) => {
        const osc = offlineCtx.createOscillator(); osc.setPeriodicWave(customWave);
        osc.frequency.setValueAtTime(frequency + (Math.random() - 0.5) * 2, time);
        const oscGain = offlineCtx.createGain(), lowpass = offlineCtx.createBiquadFilter(), panner = offlineCtx.createStereoPanner();
        lowpass.type = 'lowpass'; lowpass.frequency.setValueAtTime(350, time); lowpass.Q.value = 0.2;
        panner.pan.setValueAtTime((Math.random() - 0.5) * 1.8, time);
        osc.connect(oscGain); oscGain.connect(lowpass); lowpass.connect(panner); panner.connect(mainGain);
        oscGain.gain.setValueAtTime(0, time);
        oscGain.gain.linearRampToValueAtTime(gain + (Math.random() - 0.5) * 0.2, time + 0.01);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
        osc.start(time); osc.stop(time + decay + 0.1);
    };
    scheduleBeat(40, 0, 12.0, 0.65); scheduleBeat(55, 0, 4.0, 0.45);
    const source = audioCtx.createBufferSource();
    source.buffer = await offlineCtx.startRendering();
    source.loop = true;
    const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
    source.start(0, loopStartOffset);
    return { output: source, source };
}

async function _createSingingBowl(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const partials = [{ f: 1, g: 1.0 }, { f: 2.005, g: 0.7 }, { f: 3.42, g: 0.55 }, { f: 4.0, g: 0.25 }, { f: 5.71, g: 0.35 }];
    const mainGain = audioCtx.createGain(); mainGain.gain.value = 0.35;
    const panner = audioCtx.createStereoPanner(); mainGain.connect(panner);

    const panLFOFreq = 0.025;
    const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLFO(audioCtx, { frequency: panLFOFreq, amplitude: 0.9, startPhase: panLFOPhase });
    panLFO.connect(panner.pan);
    
    const envelope = audioCtx.createGain(); envelope.gain.value = 0.0; envelope.connect(mainGain);
    for(const p of partials) {
        const osc = audioCtx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 90 * p.f;
        const vibFreq = 2.5 + Math.random() * 2;
        const vibPhase = (2 * Math.PI * vibFreq * globalTimeOffset) % (2 * Math.PI);
        const vibLFO = await _createLFO(audioCtx, { frequency: vibFreq, amplitude: 90 * p.f * 0.004, startPhase: vibPhase });
        
        const partialGain = audioCtx.createGain(); partialGain.gain.value = p.g;
        vibLFO.connect(osc.frequency);
        osc.connect(partialGain); partialGain.connect(envelope);
        osc.start();
    };

    const trigger = (time) => {
        try {
            envelope.gain.cancelScheduledValues(time);
            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(1.0, time + 0.2);
            envelope.gain.exponentialRampToValueAtTime(config.MIN_GAIN, time + 45);
        } catch (e) { console.error("Error scheduling singing bowl:", e); }
    };
    let intervalId = null;
    const startLoop = () => {
        if (intervalId) clearInterval(intervalId);
        trigger(audioCtx.currentTime);
        intervalId = setInterval(() => { if (audioCtx.state === 'running') trigger(audioCtx.currentTime); }, 60000);
    };
    const stopLoop = () => {
        if (intervalId) clearInterval(intervalId); intervalId = null;
        envelope.gain.cancelScheduledValues(audioCtx.currentTime);
        envelope.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    };
    return { output: panner, gainNode: mainGain, trigger, startLoop, stopLoop, envelope };
}

async function _createDeepSleepBinaural(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const leftOsc = audioCtx.createOscillator(), rightOsc = audioCtx.createOscillator(); leftOsc.type = rightOsc.type = 'sine';
    leftOsc.start(); rightOsc.start();
    
    const volLFOFreq = 0.08;
    const volLFOPhase = (2 * Math.PI * volLFOFreq * globalTimeOffset) % (2 * Math.PI);
    const volumeLFO = await _createLFO(audioCtx, { frequency: volLFOFreq, amplitude: 0.1, startPhase: volLFOPhase });
    const masterGain = audioCtx.createGain(); masterGain.gain.value = config.DEEP_SLEEP_GAIN_MULTIPLIER;
    volumeLFO.connect(masterGain.gain);
    
    const leftPanner = audioCtx.createStereoPanner(), rightPanner = audioCtx.createStereoPanner(), panInverter = audioCtx.createGain(), merger = audioCtx.createChannelMerger(2);
    panInverter.gain.value = -1;
    const panLFOFreq = 0.015;
    const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
    const panLFO = await _createLFO(audioCtx, { frequency: panLFOFreq, amplitude: 1.0, startPhase: panLFOPhase });

    panLFO.connect(leftPanner.pan); panLFO.connect(panInverter); panInverter.connect(rightPanner.pan);
    leftOsc.connect(leftPanner); rightOsc.connect(rightPanner);
    leftPanner.connect(merger, 0, 0); rightPanner.connect(merger, 0, 1); merger.connect(masterGain);
    
    return { output: masterGain, gainNode: masterGain, leftOsc, rightOsc, setBinaural: (base, beat, when, ramp) => {
        leftOsc.frequency.linearRampToValueAtTime(Math.max(8, base - beat / 2), when + ramp);
        rightOsc.frequency.linearRampToValueAtTime(Math.max(8, base + beat / 2), when + ramp);
    }};
}

async function _createBrainPulse(audioCtx, stageRecipe, globalTimeOffset = 0) {
    const LOOP_DURATION_S = 15;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * audioCtx.sampleRate), audioCtx.sampleRate);
    const masterOutput = offlineCtx.createGain();
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 12;
    compressor.attack.value = 0.003; compressor.release.value = 0.25;
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
    const source = audioCtx.createBufferSource();
    source.buffer = await offlineCtx.startRendering();
    source.loop = true;
    const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
    source.start(0, loopStartOffset);
    return { output: source, source };
}

async function _createAudioGraph(audioCtx, destinationNode, initialStage, activeToggles, initialIntensity, globalTimeOffset = 0) {
    const newEffectsGain = audioCtx.createGain(); newEffectsGain.gain.value = initialIntensity; newEffectsGain.connect(destinationNode);
    const newNodes = { effectsGain: newEffectsGain };

    newNodes.reverb = _createReverb(audioCtx); newNodes.reverb.connect(destinationNode);
    newNodes.carrier = await _createCarrierPair(audioCtx, initialStage, globalTimeOffset);
    newNodes.carrier.outputLeft.connect(destinationNode); newNodes.carrier.outputRight.connect(destinationNode);
    newNodes.carrier.outputLeft.connect(newNodes.reverb); newNodes.carrier.outputRight.connect(newNodes.reverb);
    newNodes.pad = await _createPadLayer(audioCtx, globalTimeOffset); 
    newNodes.pad.output.connect(destinationNode); newNodes.pad.output.connect(newNodes.reverb);

    const creators = {
        iso: _createIsoLayer, noise: _createPinkNoise, wind: _createWindSound,
        drum: _createShamanicDrum, bowl: _createSingingBowl, deepSleep: _createDeepSleepBinaural,
        brainPulse: _createBrainPulse
    };
    
    for (const conf of toggleConfigs) {
        const { nodeKey } = conf;
        if (!creators[nodeKey]) continue;

        const node = await creators[nodeKey](audioCtx, initialStage, globalTimeOffset);
        
        const gainSwitch = audioCtx.createGain(); gainSwitch.gain.value = activeToggles[nodeKey] ? 1 : 0;
        const output = node.output || node; output.connect(gainSwitch);
        gainSwitch.connect(newEffectsGain);
        if(!['deepSleep', 'brainPulse'].includes(nodeKey)) gainSwitch.connect(newNodes.reverb);
        newNodes[nodeKey] = { ...node, gainSwitch, source: output };
    }
    return newNodes;
}

// --- Audio Rendering ---

function bufferToWave(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };
    const setUint32 = (data) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (let i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = sample < 0 ? sample * 32768 : sample * 32767;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
        if (offset >= abuffer.length) break;
    }
    return new Blob([view], { type: 'audio/wav' });
}

export async function renderOffline(progressCallback, mimeType, bitrate) {
    // For now, only support WAV as it doesn't need a live context trick.
    if (mimeType !== 'audio/wav') {
        throw new Error('Sorry, only WAV export is currently supported.');
    }
    
    const totalDuration = state.sessionLengthMinutes * 60;
    const sampleRate = 44100;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, totalDuration * sampleRate, sampleRate);
    
    const activeToggles = toggleConfigs.reduce((acc, conf) => {
        acc[conf.nodeKey] = state[conf.stateKey];
        return acc;
    }, {});
    
    const offlineMasterGain = offlineCtx.createGain();
    offlineMasterGain.connect(offlineCtx.destination);
    offlineMasterGain.gain.value = config.DEFAULT_MASTER_GAIN;
    
    const stagesToRender = state.STAGES;
    if (stagesToRender.length === 0) {
        throw new Error("No stages to render.");
    }
    
    const offlineNodes = await _createAudioGraph(offlineCtx, offlineMasterGain, stagesToRender[0], activeToggles, state.effectsIntensity, 0);

    const stageDuration = totalDuration / stagesToRender.length;
    for (let i = 0; i < stagesToRender.length; i++) {
        const stageTime = i * stageDuration;
        setStage(stagesToRender[i], offlineNodes, stageTime, config.STAGE_CHANGE_RAMP_S);
    }
    
    const renderPromise = offlineCtx.startRendering();
    
    const interval = 250;
    let elapsed = 0;
    state.renderProcess.progressInterval = setInterval(() => {
        if (elapsed >= totalDuration || state.renderProcess.cancel) {
            clearInterval(state.renderProcess.progressInterval);
            return;
        }
        elapsed += (interval / 1000);
        progressCallback(elapsed, elapsed);
    }, interval);

    const renderedBuffer = await renderPromise;
    clearInterval(state.renderProcess.progressInterval);
    
    if (state.renderProcess.cancel) return null;
    progressCallback(totalDuration, totalDuration);

    return bufferToWave(renderedBuffer);
}