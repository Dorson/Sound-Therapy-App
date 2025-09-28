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


export const soundEngine = {
    app: null, ctx: null, masterGain: null, effectsGain: null, nodes: {},

    // --- Engine Lifecycle ---
    async init(initialStageRecipe, activeToggles, initialIntensity) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        
        this.nodes = await this._createAudioGraph(this.ctx, this.masterGain, initialStageRecipe, activeToggles, initialIntensity);
        this.effectsGain = this.nodes.effectsGain;
        this.setStage(initialStageRecipe, this.nodes, this.ctx.currentTime, 0.1);
    },

    resume() {
        if (!this.ctx || !this.masterGain) return;
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        const targetGain = parseFloat(this.app.ui.masterVolumeSlider.value);
        this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + this.app.config.RESUME_FADE_DURATION_S);
        
        if (this.nodes.bowl && this.app.state.isBowlEnabled) this.nodes.bowl.startLoop();
        this.app.startAuto();
    },

    async stop() {
        if (!this.ctx) return;
        this.app.stopAuto();
        if (this.nodes.bowl) this.nodes.bowl.stopLoop();
        this.app.state.sessionElapsedTime = 0;
        this.app.state.isPlaying = false;

        try {
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(this.app.config.MIN_GAIN, this.ctx.currentTime + this.app.config.FADE_DURATION_S);
        } catch (e) { console.error("Error stopping gain ramp:", e); }

        return new Promise(resolve => {
            setTimeout(() => {
                try { 
                    if (this.ctx && this.ctx.state !== 'closed') {
                        this._clearAudioGraph();
                        this.ctx.close().then(() => {
                           this.ctx = null;
                        });
                    }
                } catch (e) {}
                this.app.state.currentStage = -1;
                this.app.uiController.updatePlayPauseButton(this.app);
                this.app.uiController.updateUIStage(this.app);
                this.app.updateMediaSessionMetadata(-1);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
                resolve();
            }, this.app.config.FADE_DURATION_S * 1000);
        });
    },

    pause() {
        if (!this.ctx || !this.masterGain) return;
        this.app.stopAuto();
        if (this.nodes.bowl) this.nodes.bowl.stopLoop();
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.linearRampToValueAtTime(this.app.config.MIN_GAIN, this.ctx.currentTime + this.app.config.PAUSE_FADE_DURATION_S);
    },

    async transitionToPreset(preset) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const fadeS = 1.0;

        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.linearRampToValueAtTime(this.app.config.MIN_GAIN, this.ctx.currentTime + fadeS);
        await new Promise(resolve => setTimeout(resolve, fadeS * 1000));
        
        this._clearAudioGraph();
        
        const initialStageRecipe = preset.stages[0];
        const activeToggles = this.app.toggleConfigs.reduce((acc, conf) => {
            acc[conf.nodeKey] = this.app.state[conf.stateKey];
            return acc;
        }, {});
        const initialIntensity = parseFloat(this.app.ui.intensitySlider.value);
        
        this.nodes = await this._createAudioGraph(this.ctx, this.masterGain, initialStageRecipe, activeToggles, initialIntensity);
        this.effectsGain = this.nodes.effectsGain;
        
        this.setStage(initialStageRecipe, this.nodes, this.ctx.currentTime, 0.1);
        if (this.nodes.bowl && this.app.state.isBowlEnabled) this.nodes.bowl.startLoop();
        
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        const targetGain = parseFloat(this.app.ui.masterVolumeSlider.value);
        this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + fadeS);

        this.app.state.currentStage = 0;
        this.app.state.sessionElapsedTime = 0;
        if (this.app.state.autoplayInterval) this.app.state.lastTickTime = performance.now();
        this.app.uiController.updateUIStage(this.app);
        this.app.updateMediaSessionMetadata(0);
    },

    setMasterVolume(value, ramp = 0.1) {
        if (this.masterGain && this.app.state.isPlaying) {
            this.masterGain.gain.linearRampToValueAtTime(value, this.ctx.currentTime + ramp);
        }
    },

    setIntensity(value, ramp = 0.1) {
        if (this.effectsGain) {
            this.effectsGain.gain.linearRampToValueAtTime(value, this.ctx.currentTime + ramp);
        }
    },

    toggleEffect(effectKey, isEnabled) {
        if (this.ctx && this.nodes[effectKey] && this.nodes[effectKey].gainSwitch) {
            const node = this.nodes[effectKey];
            const targetGain = isEnabled ? 1 : 0;
            node.gainSwitch.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 0.5);
            if (node.startLoop && node.stopLoop && this.app.state.isPlaying) {
                if (isEnabled) node.startLoop(); else node.stopLoop();
            }
        }
    },

    setStage(stageRecipe, nodeSet = this.nodes, scheduleTime, ramp, globalTimeOffset, chunkDuration) {
        if (!this.ctx || !nodeSet.carrier) return;
    
        const isOffline = globalTimeOffset !== undefined;
        const now = isOffline ? 0 : this.ctx.currentTime;
        let scheduleStart = isOffline ? scheduleTime : now + scheduleTime;
    
        const calculateInitialValue = (paramKey) => {
            let valueAtStart = this.app.state.STAGES[0][paramKey];
            if (!isOffline) return valueAtStart; // Not needed for live context
    
            const totalDur = parseInt(this.app.ui.lengthSlider.value, 10) * 60;
            const stageDur = totalDur / this.app.state.STAGES.length;
    
            for (let i = 0; i < this.app.state.STAGES.length; i++) {
                const s = this.app.state.STAGES[i];
                const prev_s = this.app.state.STAGES[i - 1] || s;
                const stageStartTime = i * stageDur;
                const rampEndTime = stageStartTime + ramp;
    
                if (globalTimeOffset >= rampEndTime) {
                    valueAtStart = s[paramKey];
                } else if (globalTimeOffset > stageStartTime && globalTimeOffset < rampEndTime) {
                    const progress = (globalTimeOffset - stageStartTime) / ramp;
                    valueAtStart = prev_s[paramKey] + (s[paramKey] - prev_s[paramKey]) * progress;
                    break;
                } else if (globalTimeOffset <= stageStartTime) {
                    valueAtStart = prev_s[paramKey];
                    break;
                }
            }
            return valueAtStart;
        };
    
        // Handle Binaural Beats
        const base = calculateInitialValue('base');
        const beat = calculateInitialValue('beat');
        nodeSet.carrier.leftOsc.frequency.setValueAtTime(Math.max(8, base - beat / 2), now);
        nodeSet.carrier.rightOsc.frequency.setValueAtTime(Math.max(8, base + beat / 2), now);
        if (isOffline) {
            if (scheduleStart >= 0 && scheduleStart < chunkDuration) {
                nodeSet.carrier.setBinaural(stageRecipe.base, stageRecipe.beat, scheduleStart, ramp);
            }
        } else {
            nodeSet.carrier.setBinaural(stageRecipe.base, stageRecipe.beat, scheduleStart, ramp);
        }

        // Handle Pad Filter
        const padCut = calculateInitialValue('padCut');
        nodeSet.pad.filter.frequency.setValueAtTime(padCut, now);
        if (isOffline) {
            if (scheduleStart >= 0 && scheduleStart < chunkDuration) {
                nodeSet.pad.setFilter(stageRecipe.padCut, scheduleStart, ramp);
            }
        } else {
            nodeSet.pad.setFilter(stageRecipe.padCut, scheduleStart, ramp);
        }

        // Handle Isochronic Gating
        if (nodeSet.iso) {
            const isoRate = calculateInitialValue('iso');
            nodeSet.iso.lfo.parameters.get('frequency').setValueAtTime(isoRate, now);
            if (isOffline) {
                if (scheduleStart >= 0 && scheduleStart < chunkDuration) {
                    nodeSet.iso.setRate(stageRecipe.iso, scheduleStart, ramp);
                }
            } else {
                nodeSet.iso.setRate(stageRecipe.iso, scheduleStart, ramp);
            }
        }

        // Handle Pink Noise
        if (nodeSet.noise) {
            const noiseGain = calculateInitialValue('noise');
            nodeSet.noise.source.gain.setValueAtTime(noiseGain, now);
             if (isOffline) {
                if (scheduleStart >= 0 && scheduleStart < chunkDuration) {
                   nodeSet.noise.source.gain.linearRampToValueAtTime(stageRecipe.noise, scheduleStart + ramp);
                }
            } else {
                 nodeSet.noise.source.gain.linearRampToValueAtTime(stageRecipe.noise, scheduleStart + ramp);
            }
        }
        
        // Update UI only for live context
        if (!isOffline) {
            const stageIndex = this.app.state.STAGES.findIndex(s => s.name === stageRecipe.name);
            if (stageIndex !== -1) this.app.state.currentStage = stageIndex;
            this.app.uiController.updateUIStage(this.app);
            this.app.updateMediaSessionMetadata(this.app.state.currentStage);
        }
    },
    
    // --- Audio Node Creation (Private) ---
    _clearAudioGraph() {
        if (!this.nodes || Object.keys(this.nodes).length === 0) return;
        Object.values(this.nodes).forEach(node => {
            if (node.output) node.output.disconnect();
            else if (node.disconnect) node.disconnect();
            if(node.leftOsc) { node.leftOsc.stop(); node.leftOsc.disconnect(); }
            if(node.rightOsc) { node.rightOsc.stop(); node.rightOsc.disconnect(); }
            if (node.stopLoop) node.stopLoop();
            if (node.source && node.source.stop) node.source.stop();
        });
        this.nodes = {};
    },

    _createContext() {
        if (this.ctx) { try { this.ctx.close(); } catch(e) {} }
        const context = new (window.AudioContext || window.webkitAudioContext)();
        context.lfoModuleAdded = false; // Flag for worklet
        return context;
    },

    async _createLFO(ctx, options) {
        if (!ctx.lfoModuleAdded) {
            try {
                const blob = new Blob([lfoProcessorString], { type: "application/javascript" });
                const blobURL = URL.createObjectURL(blob);
                await ctx.audioWorklet.addModule(blobURL);
                ctx.lfoModuleAdded = true;
            } catch (e) {
                console.error("Error adding AudioWorklet module.", e);
                // Fallback or error handling
                return null;
            }
        }
        const lfoNode = new AudioWorkletNode(ctx, 'lfo-processor', {
            processorOptions: { startPhase: options.startPhase || 0 }
        });
        lfoNode.parameters.get('frequency').setValueAtTime(options.frequency, ctx.currentTime);
        lfoNode.parameters.get('amplitude').setValueAtTime(options.amplitude || 1, ctx.currentTime);
        return lfoNode;
    },
    
    _createReverb(ctx, duration = 3, decay = 2.0) {
        const rate = ctx.sampleRate, len = Math.floor(duration * rate), buf = ctx.createBuffer(2, len, rate);
        for(let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / rate) / duration, decay);
        }
        const conv = ctx.createConvolver(); conv.buffer = buf; return conv;
    },
    
    async _createCarrierPair(ctx, stageRecipe, globalTimeOffset = 0) {
        const left = ctx.createOscillator(), right = ctx.createOscillator(); left.type = right.type = 'sine'; left.start(); right.start();
        
        const vibLFOPhase = (2 * Math.PI * 0.06 * globalTimeOffset) % (2 * Math.PI);
        const lfo = await this._createLFO(ctx, { frequency: 0.06, amplitude: 1.6, startPhase: vibLFOPhase});

        lfo.connect(left.frequency); lfo.connect(right.frequency);

        const panL = ctx.createStereoPanner(); panL.pan.value = -0.6;
        const panR = ctx.createStereoPanner(); panR.pan.value = 0.6;
        const gL = ctx.createGain(), gR = ctx.createGain(); gL.gain.value = gR.gain.value = 0.45;
        left.connect(panL); right.connect(panR); panL.connect(gL); panR.connect(gR);

        return {
            leftOsc: left, rightOsc: right, outputLeft: gL, outputRight: gR,
            setBinaural: (base, beat, when, ramp) => {
                left.frequency.linearRampToValueAtTime(Math.max(8, base - beat / 2), when + ramp);
                right.frequency.linearRampToValueAtTime(Math.max(8, base + beat / 2), when + ramp);
            }
        };
    },

    async _createPadLayer(ctx, globalTimeOffset = 0) {
        const master = ctx.createGain(); master.gain.value = 0.0;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 0.7;
        master.connect(filter);

        const out = ctx.createGain(); out.gain.value = this.app.config.PAD_GAIN_MULTIPLIER; filter.connect(out);
        const base = 110;
        for(let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = base * (1 + (i-1)*0.02);
            const freq = 0.02 + Math.random()*0.04;
            const phase = (2 * Math.PI * freq * globalTimeOffset) % (2 * Math.PI);
            const lfo = await this._createLFO(ctx, { frequency: freq, amplitude: 0.5 + Math.random()*0.6, startPhase: phase});
            lfo.connect(osc.frequency); osc.start(); osc.connect(master);
        }

        const ampFreq = 0.03;
        const ampPhase = (2 * Math.PI * ampFreq * globalTimeOffset) % (2 * Math.PI);
        const ampLFO = await this._createLFO(ctx, { frequency: ampFreq, amplitude: 0.25, startPhase: ampPhase });
        ampLFO.connect(master.gain);
        return { output: out, filter, setFilter: (cut, when, ramp) => filter.frequency.linearRampToValueAtTime(cut, when + ramp) };
    },

    _createPinkNoise(ctx) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0;
        for(let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.0990460; b1 = 0.96300 * b1 + white * 0.2965164;
            data[i] = (b0 + b1 + white * 0.1848) * 0.25;
        }
        const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
        const g = ctx.createGain(); src.connect(g); src.start(); return g;
    },

    async _createIsoLayer(ctx, stageRecipe, globalTimeOffset = 0) {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 80;
        const outG = ctx.createGain(); 

        const isoFreq = stageRecipe.iso;
        const phase = (2 * Math.PI * isoFreq * globalTimeOffset) % (2 * Math.PI);
        const lfo = await this._createLFO(ctx, { frequency: isoFreq, amplitude: 0.4, startPhase: phase });
        lfo.connect(outG.gain);

        const baseGain = ctx.createConstantSource(); baseGain.offset.value = 0.5;
        baseGain.connect(outG.gain);

        osc.connect(outG);
        osc.start(); baseGain.start();
        return { output: outG, gainNode: outG, lfo, setRate: (hz, when, ramp) => lfo.parameters.get('frequency').linearRampToValueAtTime(hz, when + ramp) };
    },

    async _createWindSound(ctx, stageRecipe, globalTimeOffset = 0) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), output = buffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5;
        
        const gainLFOFreq = 0.08;
        const gainLFOPhase = (2 * Math.PI * gainLFOFreq * globalTimeOffset) % (2 * Math.PI);
        const gainLFO = await this._createLFO(ctx, { frequency: gainLFOFreq, amplitude: 0.3, startPhase: gainLFOPhase });
        
        const mainGain = ctx.createGain(); mainGain.gain.value = 0.15;
        const panner = ctx.createStereoPanner(); panner.pan.value = 0;

        const panLFOFreq = 0.05;
        const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
        const panLFO = await this._createLFO(ctx, { frequency: panLFOFreq, amplitude: 0.8, startPhase: panLFOPhase });

        panLFO.connect(panner.pan);
        source.connect(filter); filter.connect(mainGain); gainLFO.connect(mainGain.gain); mainGain.connect(panner);
        source.start();
        return { output: panner, gainNode: mainGain };
    },
    
    _createDrumWave(ctx) {
        const numHarmonics = 32, real = new Float32Array(numHarmonics), imag = new Float32Array(numHarmonics);
        real[0] = 0; imag[0] = 0;
        for (let i = 1; i < numHarmonics; ++i) {
            real[i] = (i % 2 !== 0) ? ((-1) ** ((i - 1) / 2)) * (1 / (i * i)) : 0;
            imag[i] = 0;
        }
        return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    },

    async _createShamanicDrum(ctx, stageRecipe, globalTimeOffset = 0) {
        const LOOP_DURATION_S = 10.0; // 6 BPM
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * ctx.sampleRate), ctx.sampleRate);
        const mainGain = offlineCtx.createGain(); mainGain.gain.value = 0.847; mainGain.connect(offlineCtx.destination);
        const customWave = this._createDrumWave(offlineCtx);
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
        const source = ctx.createBufferSource();
        source.buffer = await offlineCtx.startRendering();
        source.loop = true;
        const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
        source.start(0, loopStartOffset);
        return { output: source, source };
    },

    async _createSingingBowl(ctx, stageRecipe, globalTimeOffset = 0) {
        const partials = [{ f: 1, g: 1.0 }, { f: 2.005, g: 0.7 }, { f: 3.42, g: 0.55 }, { f: 4.0, g: 0.25 }, { f: 5.71, g: 0.35 }];
        const mainGain = ctx.createGain(); mainGain.gain.value = 0.35;
        const panner = ctx.createStereoPanner(); mainGain.connect(panner);

        const panLFOFreq = 0.025;
        const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
        const panLFO = await this._createLFO(ctx, { frequency: panLFOFreq, amplitude: 0.9, startPhase: panLFOPhase });
        panLFO.connect(panner.pan);
        
        const envelope = ctx.createGain(); envelope.gain.value = 0.0; envelope.connect(mainGain);
        for(const p of partials) {
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 90 * p.f;
            const vibFreq = 2.5 + Math.random() * 2;
            const vibPhase = (2 * Math.PI * vibFreq * globalTimeOffset) % (2 * Math.PI);
            const vibLFO = await this._createLFO(ctx, { frequency: vibFreq, amplitude: 90 * p.f * 0.004, startPhase: vibPhase });
            
            const partialGain = ctx.createGain(); partialGain.gain.value = p.g;
            vibLFO.connect(osc.frequency);
            osc.connect(partialGain); partialGain.connect(envelope);
            osc.start();
        };

        const trigger = (time) => {
            try {
                envelope.gain.cancelScheduledValues(time);
                envelope.gain.setValueAtTime(0, time);
                envelope.gain.linearRampToValueAtTime(1.0, time + 0.2);
                envelope.gain.exponentialRampToValueAtTime(this.app.config.MIN_GAIN, time + 45);
            } catch (e) { console.error("Error scheduling singing bowl:", e); }
        };
        let intervalId = null;
        const startLoop = () => {
            if (intervalId) clearInterval(intervalId);
            trigger(ctx.currentTime);
            intervalId = setInterval(() => { if (ctx.state === 'running') trigger(ctx.currentTime); }, 60000);
        };
        const stopLoop = () => {
            if (intervalId) clearInterval(intervalId); intervalId = null;
            envelope.gain.cancelScheduledValues(ctx.currentTime);
            envelope.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        };
        return { output: panner, gainNode: mainGain, trigger, startLoop, stopLoop, envelope };
    },

    async _createDeepSleepBinaural(ctx, stageRecipe, globalTimeOffset = 0) {
        const leftOsc = ctx.createOscillator(), rightOsc = ctx.createOscillator(); leftOsc.type = rightOsc.type = 'sine';
        leftOsc.start(); rightOsc.start();
        
        const volLFOFreq = 0.08;
        const volLFOPhase = (2 * Math.PI * volLFOFreq * globalTimeOffset) % (2 * Math.PI);
        const volumeLFO = await this._createLFO(ctx, { frequency: volLFOFreq, amplitude: 0.1, startPhase: volLFOPhase });
        const masterGain = ctx.createGain(); masterGain.gain.value = this.app.config.DEEP_SLEEP_GAIN_MULTIPLIER;
        volumeLFO.connect(masterGain.gain);
        
        const leftPanner = ctx.createStereoPanner(), rightPanner = ctx.createStereoPanner(), panInverter = ctx.createGain(), merger = ctx.createChannelMerger(2);
        panInverter.gain.value = -1;
        const panLFOFreq = 0.015;
        const panLFOPhase = (2 * Math.PI * panLFOFreq * globalTimeOffset) % (2 * Math.PI);
        const panLFO = await this._createLFO(ctx, { frequency: panLFOFreq, amplitude: 1.0, startPhase: panLFOPhase });

        panLFO.connect(leftPanner.pan); panLFO.connect(panInverter); panInverter.connect(rightPanner.pan);
        leftOsc.connect(leftPanner); rightOsc.connect(rightPanner);
        leftPanner.connect(merger, 0, 0); rightPanner.connect(merger, 0, 1); merger.connect(masterGain);
        
        return { output: masterGain, gainNode: masterGain, leftOsc, rightOsc, setBinaural: (base, beat, when, ramp) => {
            leftOsc.frequency.linearRampToValueAtTime(Math.max(8, base - beat / 2), when + ramp);
            rightOsc.frequency.linearRampToValueAtTime(Math.max(8, base + beat / 2), when + ramp);
        }};
    },
    
    async _createBrainPulse(ctx, stageRecipe, globalTimeOffset = 0) {
        const LOOP_DURATION_S = 15;
        // Pre-rendering is fast and ensures phase consistency. We don't need a worklet here.
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * ctx.sampleRate), ctx.sampleRate);
        const masterOutput = offlineCtx.createGain();
        const compressor = offlineCtx.createDynamicsCompressor();
        compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 12;
        compressor.attack.value = 0.003; compressor.release.value = 0.25;
        masterOutput.connect(compressor); compressor.connect(offlineCtx.destination);
        const nodes = ['mainOscillator', 'lfoOscillator', 'pannerLFO', 'chorusOscillator1', 'chorusOscillator2'].reduce((acc, k) => (acc[k] = offlineCtx.createOscillator(), acc), {});
        const gains = ['tremoloGain', 'volumeRampGain', 'chorusGain1', 'chorusGain2'].reduce((acc, k) => (acc[k] = offlineCtx.createGain(), acc), {});
        const pannerNode = offlineCtx.createStereoPanner();
        nodes.mainOscillator.type = 'sine'; nodes.mainOscillator.frequency.value = 55;
        nodes.lfoOscillator.type = 'sine'; nodes.lfoOscillator.frequency.value = 4;
        nodes.pannerLFO.type = 'sine'; nodes.pannerLFO.frequency.value = 0.1;
        nodes.chorusOscillator1.type = 'sine'; nodes.chorusOscillator1.frequency.value = 27.5;
        nodes.chorusOscillator2.type = 'sine'; nodes.chorusOscillator2.frequency.value = 27.5;
        gains.volumeRampGain.gain.value = 0; gains.chorusGain1.gain.value = 0;
        gains.chorusGain2.gain.value = 0; gains.tremoloGain.gain.value = 0.5;
        nodes.mainOscillator.connect(gains.volumeRampGain).connect(pannerNode).connect(masterOutput);
        nodes.lfoOscillator.connect(gains.tremoloGain).connect(gains.volumeRampGain.gain);
        nodes.pannerLFO.connect(pannerNode.pan);
        nodes.chorusOscillator1.connect(gains.chorusGain1).connect(masterOutput);
        nodes.chorusOscillator2.connect(gains.chorusGain2).connect(masterOutput);
        const now = 0, endTime = now + LOOP_DURATION_S, FADE_IN_TIME = 0.02, FADE_OUT_TIME = 1.5;
        nodes.mainOscillator.frequency.setValueAtTime(55, now);
        nodes.mainOscillator.frequency.linearRampToValueAtTime(20, endTime);
        gains.volumeRampGain.gain.setValueAtTime(0, now);
        gains.volumeRampGain.gain.linearRampToValueAtTime(1.0, now + FADE_IN_TIME);
        gains.volumeRampGain.gain.setValueAtTime(1.0, endTime - FADE_OUT_TIME);
        gains.volumeRampGain.gain.linearRampToValueAtTime(0, endTime);
        nodes.lfoOscillator.frequency.setValueAtTime(4, now);
        nodes.lfoOscillator.frequency.linearRampToValueAtTime(1, endTime);
        nodes.chorusOscillator1.frequency.setValueAtTime(27.5, now);
        nodes.chorusOscillator1.frequency.linearRampToValueAtTime(20, endTime);
        nodes.chorusOscillator2.frequency.setValueAtTime(27.5, now);
        nodes.chorusOscillator2.frequency.linearRampToValueAtTime(20, endTime);
        gains.chorusGain1.gain.setValueAtTime(0, now);
        gains.chorusGain1.gain.linearRampToValueAtTime(0.05, now + FADE_IN_TIME);
        gains.chorusGain1.gain.setValueAtTime(0.3, endTime - FADE_OUT_TIME);
        gains.chorusGain1.gain.linearRampToValueAtTime(0, endTime);
        gains.chorusGain2.gain.setValueAtTime(0, now);
        gains.chorusGain2.gain.linearRampToValueAtTime(0.05, now + FADE_IN_TIME);
        gains.chorusGain2.gain.setValueAtTime(0.3, endTime - FADE_OUT_TIME);
        gains.chorusGain2.gain.linearRampToValueAtTime(0, endTime);
        Object.values(nodes).forEach(n => n.start(now));
        const source = ctx.createBufferSource();
        source.buffer = await offlineCtx.startRendering();
        source.loop = true;
        const loopStartOffset = (globalTimeOffset || 0) % LOOP_DURATION_S;
        source.start(0, loopStartOffset);
        return { output: source, source };
    },

    async _createAudioGraph(ctx, destinationNode, initialStage, activeToggles, initialIntensity, globalTimeOffset = 0) {
        const effectsGain = ctx.createGain(); effectsGain.gain.value = initialIntensity; effectsGain.connect(destinationNode);
        const nodes = { effectsGain };

        nodes.reverb = this._createReverb(ctx); nodes.reverb.connect(destinationNode);
        nodes.carrier = await this._createCarrierPair(ctx, initialStage, globalTimeOffset);
        nodes.carrier.outputLeft.connect(destinationNode); nodes.carrier.outputRight.connect(destinationNode);
        nodes.carrier.outputLeft.connect(nodes.reverb); nodes.carrier.outputRight.connect(nodes.reverb);
        nodes.pad = await this._createPadLayer(ctx, globalTimeOffset); 
        nodes.pad.output.connect(destinationNode); nodes.pad.output.connect(nodes.reverb);

        const creators = {
            iso: this._createIsoLayer, noise: this._createPinkNoise, wind: this._createWindSound,
            drum: this._createShamanicDrum, bowl: this._createSingingBowl, deepSleep: this._createDeepSleepBinaural,
            brainPulse: this._createBrainPulse
        };
        
        for (const config of this.app.toggleConfigs) {
            const { nodeKey } = config;
            if (!creators[nodeKey]) continue;

            const node = await creators[nodeKey].call(this, ctx, initialStage, globalTimeOffset);
            
            const gainSwitch = ctx.createGain(); gainSwitch.gain.value = activeToggles[nodeKey] ? 1 : 0;
            const output = node.output || node; output.connect(gainSwitch);
            gainSwitch.connect(effectsGain);
            if(!['deepSleep', 'brainPulse'].includes(nodeKey)) gainSwitch.connect(nodes.reverb);
            nodes[nodeKey] = { ...node, gainSwitch, source: output };
        }
        return nodes;
    },
    
    // --- Autoplay ---
    tickAutoplay() {
        const now = performance.now();
        const delta = (now - this.app.state.lastTickTime) / 1000;
        this.app.state.lastTickTime = now;
        this.app.state.sessionElapsedTime += delta;
        
        const totalDur = parseInt(this.app.ui.lengthSlider.value, 10) * 60;
        if (this.app.state.sessionElapsedTime >= totalDur) {
            this.stop(); return;
        }
        
        const stageDur = totalDur / this.app.state.STAGES.length;
        const expectedStage = Math.floor(this.app.state.sessionElapsedTime / stageDur);

        if (expectedStage < this.app.state.STAGES.length && expectedStage !== this.app.state.currentStage) {
            const stageRecipe = this.app.state.STAGES[expectedStage];
            this.setStage(stageRecipe, this.nodes, 0, this.app.config.STAGE_CHANGE_RAMP_S);
        }
    },
};