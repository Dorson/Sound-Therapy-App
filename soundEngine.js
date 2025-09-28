export const soundEngine = {
    app: null, // Will be set on init
    ctx: null, masterGain: null, effectsGain: null, nodes: {},

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
        this.masterGain.gain.linearRampToValueAtTime(this.app.config.MASTER_GAIN_MULTIPLIER, this.ctx.currentTime + this.app.config.RESUME_FADE_DURATION_S);
        
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
        this.masterGain.gain.linearRampToValueAtTime(this.app.config.MASTER_GAIN_MULTIPLIER, this.ctx.currentTime + fadeS);

        this.app.state.currentStage = 0;
        this.app.state.sessionElapsedTime = 0;
        if (this.app.state.autoplayInterval) this.app.state.lastTickTime = performance.now();
        this.app.uiController.updateUIStage(this.app);
        this.app.updateMediaSessionMetadata(0);
    },

    // --- Engine Public API ---
    setStage(stageRecipe, nodeSet = this.nodes, when = this.ctx.currentTime, ramp = this.app.config.STAGE_CHANGE_RAMP_S) {
        if (!this.ctx && !nodeSet.carrier) return;
        const stageIndex = this.app.state.STAGES.findIndex(s => s.name === stageRecipe.name);
        if (stageIndex !== -1) this.app.state.currentStage = stageIndex;
        
        nodeSet.carrier.setBinaural(stageRecipe.base, stageRecipe.beat, when, ramp);
        nodeSet.pad.setFilter(stageRecipe.padCut, when, ramp);
        if (nodeSet.iso) nodeSet.iso.setRate(stageRecipe.iso, when, ramp);
        if (nodeSet.noise) nodeSet.noise.source.gain.linearRampToValueAtTime(stageRecipe.noise, when + ramp);
        if (nodeSet.deepSleep) {
            const targetGain = stageRecipe.deepSleepOn ? this.app.config.DEEP_SLEEP_GAIN_MULTIPLIER : 0;
            nodeSet.deepSleep.setBinaural(stageRecipe.base, stageRecipe.beat, when, ramp);
            nodeSet.deepSleep.gainNode.gain.linearRampToValueAtTime(targetGain, when + ramp);
        }
        
        if (this.ctx && this.ctx.state !== 'closed') { // Only update UI for live engine
            this.app.uiController.updateUIStage(this.app);
            this.app.updateMediaSessionMetadata(this.app.state.currentStage);
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

    // --- Audio Node Creation (Private) ---
    _clearAudioGraph() {
        if (!this.nodes || Object.keys(this.nodes).length === 0) return;
        
        try { this.nodes.carrier.outputLeft.disconnect(); } catch(e){}
        try { this.nodes.carrier.outputRight.disconnect(); } catch(e){}
        try { this.nodes.pad.output.disconnect(); } catch(e){}
        try { this.nodes.effectsGain.disconnect(); } catch(e){}
        try { this.nodes.reverb.disconnect(); } catch(e){}

        try { this.nodes.carrier.leftOsc.stop(); } catch(e){}
        try { this.nodes.carrier.rightOsc.stop(); } catch(e){}
        
        this.app.toggleConfigs.forEach(config => {
            const node = this.nodes[config.nodeKey];
            if (!node) return;
            
            if (node.stopLoop) try { node.stopLoop(); } catch(e) {}
            if (node.source && node.source.stop) try { node.source.stop(); } catch(e) {}
            if (node.gate && node.gate.stop) try { node.gate.stop(); } catch(e) {}
            if (node.baseGain && node.baseGain.stop) try { node.baseGain.stop(); } catch(e) {}
        });

        this.nodes = {};
    },

    _createContext() {
        if (this.ctx) { try { this.ctx.close(); } catch(e) {} }
        return new (window.AudioContext || window.webkitAudioContext)();
    },

    _createReverb(ctx, duration = 3, decay = 2.0) {
        const rate = ctx.sampleRate, len = Math.floor(duration * rate), buf = ctx.createBuffer(2, len, rate);
        for(let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / rate) / duration, decay);
        }
        const conv = ctx.createConvolver(); conv.buffer = buf; return conv;
    },
    
    _createCarrierPair(ctx, stageRecipe) {
        const left = ctx.createOscillator(), right = ctx.createOscillator(); left.type = right.type = 'sine';
        left.frequency.setValueAtTime(Math.max(8, stageRecipe.base - stageRecipe.beat / 2), ctx.currentTime);
        right.frequency.setValueAtTime(Math.max(8, stageRecipe.base + stageRecipe.beat / 2), ctx.currentTime);
        left.start(); right.start();
        
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
        const lfoG = ctx.createGain(); lfoG.gain.value = 1.6;
        lfo.connect(lfoG); lfoG.connect(left.frequency); lfoG.connect(right.frequency); lfo.start();

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

    _createPadLayer(ctx) {
        const master = ctx.createGain(); master.gain.value = 0.0;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 0.7;
        master.connect(filter);

        const out = ctx.createGain(); out.gain.value = this.app.config.PAD_GAIN_MULTIPLIER; filter.connect(out);
        const base = 110;
        for(let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = base * (1 + (i-1)*0.02);
            const lfo = ctx.createOscillator(); lfo.frequency.value = 0.02 + Math.random()*0.04;
            const lg = ctx.createGain(); lg.gain.value = 0.5 + Math.random()*0.6;
            lfo.connect(lg); lg.connect(osc.frequency); lfo.start(); osc.start(); osc.connect(master);
        }

        const ampLFO = ctx.createOscillator(); ampLFO.frequency.value = 0.03;
        const ampG = ctx.createGain(); ampG.gain.value = 0.25;
        ampLFO.connect(ampG); ampG.connect(master.gain); ampLFO.start();
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

    _createIsoLayer(ctx, stageRecipe) {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 80;
        const outG = ctx.createGain(); // Final output gain, which will be modulated

        // Create the LFO for a smooth tremolo effect
        const gate = ctx.createOscillator(); gate.type = 'sine'; // Use a smooth sine wave to prevent clicks
        gate.frequency.setValueAtTime(stageRecipe.iso, ctx.currentTime);

        // This gain node controls the depth of the modulation (how much the volume changes)
        const tremoloDepth = ctx.createGain();
        tremoloDepth.gain.value = 0.4; // A depth of 0.4 means volume oscillates by +/- 40%

        // A constant source provides the base (center) gain level for the tremolo.
        const baseGain = ctx.createConstantSource();
        baseGain.offset.value = 0.5; // Center the volume at 50%

        // Connect the LFO (gate) through its depth control to the output gain parameter
        gate.connect(tremoloDepth);
        tremoloDepth.connect(outG.gain);

        // Connect the base gain level to the output gain parameter as well.
        // The final gain will be the sum: 0.5 + (sine wave from -0.4 to +0.4), resulting in a smooth 0.1 to 0.9 oscillation.
        baseGain.connect(outG.gain);

        // Connect the sound source (osc) to the now-modulated gain node
        osc.connect(outG);
        
        // Start all the audio sources
        osc.start();
        gate.start();
        baseGain.start();

        return { output: outG, gainNode: outG, gate, baseGain, setRate: (hz, when, ramp) => gate.frequency.linearRampToValueAtTime(hz, when + ramp) };
    },

    _createWindSound(ctx) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), output = buffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5;
        const gainLFO = ctx.createOscillator(); gainLFO.type = 'sine'; gainLFO.frequency.value = 0.08;
        const gainMod = ctx.createGain(); gainMod.gain.value = 0.3; gainLFO.connect(gainMod);
        const mainGain = ctx.createGain(); mainGain.gain.value = 0.15;
        const panner = ctx.createStereoPanner(); panner.pan.value = 0;
        const panLFO = ctx.createOscillator(); panLFO.type = 'sine'; panLFO.frequency.value = 0.05;
        const panMod = ctx.createGain(); panMod.gain.value = 0.8; panLFO.connect(panMod); panMod.connect(panner.pan);
        source.connect(filter); filter.connect(mainGain); gainMod.connect(mainGain.gain); mainGain.connect(panner);
        source.start(); gainLFO.start(); panLFO.start();
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

    async _createShamanicDrum(ctx) {
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
        const source = ctx.createBufferSource(); source.buffer = await offlineCtx.startRendering();
        source.loop = true; source.start();
        return { output: source };
    },

    _createSingingBowl(ctx) {
        const partials = [{ f: 1, g: 1.0 }, { f: 2.005, g: 0.7 }, { f: 3.42, g: 0.55 }, { f: 4.0, g: 0.25 }, { f: 5.71, g: 0.35 }];
        const mainGain = ctx.createGain(); mainGain.gain.value = 0.35;
        const panner = ctx.createStereoPanner(); mainGain.connect(panner);
        const panLFO = ctx.createOscillator(); panLFO.type = 'sine'; panLFO.frequency.value = 0.025;
        const panMod = ctx.createGain(); panMod.gain.value = 0.9; panLFO.connect(panMod); panMod.connect(panner.pan); panLFO.start();
        const envelope = ctx.createGain(); envelope.gain.value = 0.0; envelope.connect(mainGain);
        partials.forEach(p => {
            const osc = ctx.createOscillator(), vibLFO = ctx.createOscillator(), vibDepth = ctx.createGain(), partialGain = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = 90 * p.f;
            vibLFO.type = 'sine'; vibLFO.frequency.value = 2.5 + Math.random() * 2;
            vibDepth.gain.value = 90 * p.f * 0.004; vibLFO.connect(vibDepth); vibDepth.connect(osc.frequency);
            partialGain.gain.value = p.g; osc.connect(partialGain); partialGain.connect(envelope);
            osc.start(); vibLFO.start();
        });
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

    _createDeepSleepBinaural(ctx, stageRecipe) {
        const leftOsc = ctx.createOscillator(), rightOsc = ctx.createOscillator(); leftOsc.type = rightOsc.type = 'sine';
        leftOsc.frequency.setValueAtTime(Math.max(8, stageRecipe.base - stageRecipe.beat / 2), ctx.currentTime);
        rightOsc.frequency.setValueAtTime(Math.max(8, stageRecipe.base + stageRecipe.beat / 2), ctx.currentTime);
        leftOsc.start(); rightOsc.start();
        
        const volumeLFO = ctx.createOscillator(); volumeLFO.type = 'sine'; volumeLFO.frequency.value = 0.08; volumeLFO.start();
        const masterGain = ctx.createGain(); masterGain.gain.value = this.app.config.DEEP_SLEEP_GAIN_MULTIPLIER;
        const volGainMod = ctx.createGain(); volGainMod.gain.value = 0.1;
        volumeLFO.connect(volGainMod); volGainMod.connect(masterGain.gain);
        
        const leftPanner = ctx.createStereoPanner(), rightPanner = ctx.createStereoPanner(), panLFO = ctx.createOscillator(), panMod = ctx.createGain(), panInverter = ctx.createGain(), merger = ctx.createChannelMerger(2);
        panLFO.type = 'sine'; panLFO.frequency.value = 0.015; panLFO.start(); panMod.gain.value = 1.0; panInverter.gain.value = -1;
        panLFO.connect(panMod); panMod.connect(leftPanner.pan); panMod.connect(panInverter); panInverter.connect(rightPanner.pan);
        leftOsc.connect(leftPanner); rightOsc.connect(rightPanner);
        leftPanner.connect(merger, 0, 0); rightPanner.connect(merger, 0, 1); merger.connect(masterGain);
        
        return { output: masterGain, gainNode: masterGain, leftOsc, rightOsc, setBinaural: (base, beat, when, ramp) => {
            leftOsc.frequency.linearRampToValueAtTime(Math.max(8, base - beat / 2), when + ramp);
            rightOsc.frequency.linearRampToValueAtTime(Math.max(8, base + beat / 2), when + ramp);
        }};
    },
    
    async _createBrainPulse(ctx) {
        const LOOP_DURATION_S = 15;
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(LOOP_DURATION_S * ctx.sampleRate), ctx.sampleRate);
        const masterOutput = offlineCtx.createGain();
        const compressor = offlineCtx.createDynamicsCompressor();
        
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        masterOutput.connect(compressor);
        compressor.connect(offlineCtx.destination);

        const nodes = ['mainOscillator', 'lfoOscillator', 'pannerLFO', 'chorusOscillator1', 'chorusOscillator2'].reduce((acc, k) => (acc[k] = offlineCtx.createOscillator(), acc), {});
        const gains = ['tremoloGain', 'volumeRampGain', 'chorusGain1', 'chorusGain2'].reduce((acc, k) => (acc[k] = offlineCtx.createGain(), acc), {});
        const pannerNode = offlineCtx.createStereoPanner();
        
        nodes.mainOscillator.type = 'sine';
        nodes.mainOscillator.frequency.value = 55;
        nodes.lfoOscillator.type = 'sine';
        nodes.lfoOscillator.frequency.value = 4;
        nodes.pannerLFO.type = 'sine';
        nodes.pannerLFO.frequency.value = 0.1;
        nodes.chorusOscillator1.type = 'sine';
        nodes.chorusOscillator1.frequency.value = 27.5;
        nodes.chorusOscillator2.type = 'sine';
        nodes.chorusOscillator2.frequency.value = 27.5;
        
        gains.volumeRampGain.gain.value = 0;
        gains.chorusGain1.gain.value = 0;
        gains.chorusGain2.gain.value = 0;
        gains.tremoloGain.gain.value = 0.5;
        
        nodes.mainOscillator.connect(gains.volumeRampGain).connect(pannerNode).connect(masterOutput);
        nodes.lfoOscillator.connect(gains.tremoloGain).connect(gains.volumeRampGain.gain);
        nodes.pannerLFO.connect(pannerNode.pan);
        nodes.chorusOscillator1.connect(gains.chorusGain1).connect(masterOutput);
        nodes.chorusOscillator2.connect(gains.chorusGain2).connect(masterOutput);

        const now = 0, endTime = now + LOOP_DURATION_S;
        const FADE_IN_TIME = 0.02;
        const FADE_OUT_TIME = 1.5;

        // Main Oscillator
        nodes.mainOscillator.frequency.setValueAtTime(55, now);
        nodes.mainOscillator.frequency.linearRampToValueAtTime(20, endTime);
        gains.volumeRampGain.gain.setValueAtTime(0, now);
        gains.volumeRampGain.gain.linearRampToValueAtTime(1.0, now + FADE_IN_TIME);
        gains.volumeRampGain.gain.setValueAtTime(1.0, endTime - FADE_OUT_TIME);
        gains.volumeRampGain.gain.linearRampToValueAtTime(0, endTime);

        // LFO
        nodes.lfoOscillator.frequency.setValueAtTime(4, now);
        nodes.lfoOscillator.frequency.linearRampToValueAtTime(1, endTime);

        // Chorus Oscillators
        nodes.chorusOscillator1.frequency.setValueAtTime(27.5, now);
        nodes.chorusOscillator1.frequency.linearRampToValueAtTime(20, endTime);
        nodes.chorusOscillator2.frequency.setValueAtTime(27.5, now);
        nodes.chorusOscillator2.frequency.linearRampToValueAtTime(20, endTime);
        
        // Chorus Gains with fade in/out
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
        source.start();
        return { output: source };
    },

    async _createAudioGraph(ctx, destinationNode, initialStage, activeToggles, initialIntensity) {
        const effectsGain = ctx.createGain(); effectsGain.gain.value = initialIntensity; effectsGain.connect(destinationNode);
        const nodes = { effectsGain };

        nodes.reverb = this._createReverb(ctx); nodes.reverb.connect(destinationNode);
        nodes.carrier = this._createCarrierPair(ctx, initialStage);
        nodes.carrier.outputLeft.connect(destinationNode); nodes.carrier.outputRight.connect(destinationNode);
        nodes.carrier.outputLeft.connect(nodes.reverb); nodes.carrier.outputRight.connect(nodes.reverb);
        nodes.pad = this._createPadLayer(ctx); nodes.pad.output.connect(destinationNode); nodes.pad.output.connect(nodes.reverb);

        const creators = {
            iso: this._createIsoLayer, noise: this._createPinkNoise, wind: this._createWindSound,
            drum: this._createShamanicDrum, bowl: this._createSingingBowl, deepSleep: this._createDeepSleepBinaural,
            brainPulse: this._createBrainPulse
        };
        
        for (const config of this.app.toggleConfigs) {
            const { nodeKey } = config;
            if (!creators[nodeKey]) continue;

            let node;
            if (['brainPulse', 'drum'].includes(nodeKey)) node = await creators[nodeKey].call(this, ctx);
            else if (['iso', 'deepSleep'].includes(nodeKey)) node = creators[nodeKey].call(this, ctx, initialStage);
            else node = creators[nodeKey].call(this, ctx);
            
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
            this.setStage(stageRecipe);
        }
    },
};