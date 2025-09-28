import { PRESETS, config, toggleConfigs } from './presets.js';
import { soundEngine } from './soundEngine.js';
import * as uiController from './ui.js';

const app = {
    // --- DATA ---
    PRESETS,
    config,
    toggleConfigs,

    // --- STATE ---
    state: {
        STAGES: PRESETS.none.stages,
        currentStage: -1,
        autoplayInterval: null,
        sessionElapsedTime: 0,
        lastTickTime: 0,
        isIsoEnabled: true,
        isNoiseEnabled: true,
        isWindEnabled: true,
        isDrumEnabled: true,
        isBowlEnabled: true,
        isDeepSleepEnabled: false,
        isBrainPulseEnabled: false,
        isInteracting: false,
        isPlaying: false,
    },

    ui: uiController.ui,
    soundEngine: soundEngine,
    uiController: uiController,

    // --- CORE "CONTROLLER" METHODS ---
    debounce(func, delay) {
       let timeoutId;
       return function(...args) {
           clearTimeout(timeoutId);
           timeoutId = setTimeout(() => {
               func.apply(this, args);
           }, delay);
       };
    },
    
    init() {
        this.soundEngine.app = this; // Provide reference to sound engine

        // Populate UI elements object
        this.ui.playPauseBtn = document.getElementById('playPauseBtn');
        this.ui.playIcon = document.getElementById('playIcon');
        this.ui.playPauseLabel = document.getElementById('playPauseLabel');
        this.ui.nextStageBtn = document.getElementById('nextStageBtn');
        this.ui.saveAudioBtn = document.getElementById('saveAudioBtn');
        this.ui.lengthSlider = document.getElementById('lengthSlider');
        this.ui.intensitySlider = document.getElementById('intensity');
        this.ui.lenLabel = document.getElementById('lenLabel');
        this.ui.intLabel = document.getElementById('intLabel');
        this.ui.stageName = document.getElementById('stageName');
        this.ui.stageSub = document.getElementById('stageSub');
        this.ui.progressBar = document.getElementById('progressBar');
        this.ui.presetSelector = document.getElementById('presetSelector');
        this.ui.installAppBtn = document.getElementById('installAppBtn');
        this.ui.installInstructions = document.getElementById('install-instructions');
        
        this.toggleConfigs.forEach(config => {
            this.ui[config.optionId] = document.getElementById(config.optionId);
            this.ui[config.chkId] = document.getElementById(config.chkId);
        });

        uiController.checkPWA(this);

        // Wire up event listeners
        this.ui.playPauseBtn.addEventListener('click', this.handlePlayPause.bind(this));
        this.ui.nextStageBtn.addEventListener('click', this.goToNextStage.bind(this));
        this.ui.saveAudioBtn.addEventListener('click', this.handleSaveAudio.bind(this));
        this.ui.lengthSlider.addEventListener('input', this.debounce(e => this.ui.lenLabel.textContent = e.target.value, 50));
        this.ui.intensitySlider.addEventListener('input', this.debounce((e) => this.handleIntensityChange(e.target.value), 50));
        this.ui.presetSelector.addEventListener('change', this.debounce(this.handlePresetChange.bind(this), 100));
        
        this.toggleConfigs.forEach(config => {
            this.ui[config.optionId].addEventListener('click', this.debounce(() => {
                this.handleToggle(config.stateKey, this.ui[config.optionId], this.ui[config.chkId], config.nodeKey);
            }, 50));
        });
        
        uiController.initUIState(this);
        this.setupMediaSessionHandlers();
    },

    // --- Media Session API & PWA ---
    setupMediaSessionHandlers() {
       if (!('mediaSession' in navigator)) return;
       navigator.mediaSession.setActionHandler('play', this.handlePlayPause.bind(this));
       navigator.mediaSession.setActionHandler('pause', this.handlePlayPause.bind(this));
       navigator.mediaSession.setActionHandler('nexttrack', this.goToNextStage.bind(this));
       navigator.mediaSession.setActionHandler('previoustrack', this.goToPreviousStage.bind(this));
    },
   
    updateMediaSessionMetadata(idx) {
       if (!('mediaSession' in navigator)) return;
       if (idx < 0 || this.state.STAGES.length === 0) {
           navigator.mediaSession.metadata = null;
           return;
       }
       
       const stage = this.state.STAGES[idx];
       const presetSelector = this.ui.presetSelector;
       const presetName = presetSelector.options[presetSelector.selectedIndex].text;
       
       const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 496"><circle cx="252.1" cy="246.6" r="241.2" fill="#a2008a"/><ellipse cx="176.3" cy="177" fill="#ebff3f" rx="70.6" ry="66.9"/><path fill="#ebff3f" d="M302 183h97v37h-97z"/><path fill="#ebff3f" stroke="#ebff3f" stroke-width="25.9" d="M111 308c72 90 167 115 252 69"/></svg>`;
       const iconUrl = `data:image/svg+xml;base64,${btoa(iconSvg)}`;
   
       navigator.mediaSession.metadata = new MediaMetadata({
           title: stage.name,
           artist: this.config.APP_NAME,
           album: `Preset: ${presetName}`,
           artwork: [ { src: iconUrl, sizes: '496x496', type: 'image/svg+xml' } ]
       });
    },

    // --- Autoplay ---
    startAuto() {
        this.stopAuto();
        this.state.lastTickTime = performance.now();
        this.state.autoplayInterval = setInterval(this.soundEngine.tickAutoplay.bind(this.soundEngine), this.config.AUTOPLAY_TICK_MS);
    },

    stopAuto() {
        clearInterval(this.state.autoplayInterval);
        this.state.autoplayInterval = null;
    },

    // --- Event Handlers ---
    async handlePlayPause() {
        if (this.state.isInteracting) return;
        this.state.isInteracting = true;
    
        try {
            const engine = this.soundEngine;
            
            if (!engine.ctx || engine.ctx.state === 'closed') {
                engine.ctx = engine._createContext();
            }
    
            if (engine.ctx.state === 'suspended') {
                await engine.ctx.resume();
            }
    
            if (this.state.isPlaying) {
                engine.pause();
                uiController.updatePlayPauseButton(this);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                this.state.isPlaying = false;
            } else {
                if (Object.keys(engine.nodes).length === 0) { 
                    const initialStageRecipe = this.state.STAGES[0] || this.PRESETS.none.stages[0];
                    const activeToggles = this.toggleConfigs.reduce((acc, conf) => {
                        acc[conf.nodeKey] = this.state[conf.stateKey];
                        return acc;
                    }, {});
                    await engine.init(initialStageRecipe, activeToggles, this.ui.intensitySlider.value);
                    this.state.sessionElapsedTime = 0;
                    this.updateMediaSessionMetadata(0);
                }
                engine.resume();
                uiController.updatePlayPauseButton(this);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                this.state.isPlaying = true;
            }
        } finally {
            this.state.isInteracting = false;
        }
    },
   
    async goToNextStage() {
       if (this.state.isInteracting) return;
       this.state.isInteracting = true;
       try {
           if (!this.soundEngine.ctx) {
               await this.handlePlayPause();
               return;
           }
           if (this.state.currentStage >= this.state.STAGES.length - 1) {
               await this.soundEngine.stop();
               return;
           }
           const nextStageIndex = this.state.currentStage + 1;
           const totalDur = parseInt(this.ui.lengthSlider.value, 10) * 60;
           const stageDur = totalDur / this.state.STAGES.length;
           this.state.sessionElapsedTime = nextStageIndex * stageDur;
           if(this.state.autoplayInterval) this.state.lastTickTime = performance.now();
           
           const stageRecipe = this.state.STAGES[nextStageIndex];
           this.soundEngine.setStage(stageRecipe);
   
           if (this.state.isPlaying && this.soundEngine.ctx.state === 'suspended') {
               await this.soundEngine.resume();
           }
       } finally {
           this.state.isInteracting = false;
       }
    },
   
    async goToPreviousStage() {
       if (this.state.isInteracting || !this.soundEngine.ctx || this.state.currentStage <= 0) return;
       this.state.isInteracting = true;
       try {
           const prevStageIndex = this.state.currentStage - 1;
           const totalDur = parseInt(this.ui.lengthSlider.value, 10) * 60;
           const stageDur = totalDur / this.state.STAGES.length;
           this.state.sessionElapsedTime = prevStageIndex * stageDur;
           if(this.state.autoplayInterval) this.state.lastTickTime = performance.now();
           
           const stageRecipe = this.state.STAGES[prevStageIndex];
           this.soundEngine.setStage(stageRecipe);
   
           if (this.state.isPlaying && this.soundEngine.ctx.state === 'suspended') {
               await this.soundEngine.resume();
           }
       } finally {
           this.state.isInteracting = false;
       }
    },
   
    handleIntensityChange(value) {
        this.ui.intLabel.textContent = value;
        if (this.soundEngine.ctx) {
            this.soundEngine.setIntensity(parseFloat(value));
        }
    },
   
    handleToggle(stateKey, button, checkmark, nodeKey) {
        this.state[stateKey] = !this.state[stateKey];
        uiController.toggleCheckmark(button, checkmark, this.state[stateKey]);
        this.soundEngine.toggleEffect(nodeKey, this.state[stateKey]);
    },
   
    async handlePresetChange(e) {
       if (this.state.isInteracting) return;
       this.state.isInteracting = true;
       try {
           const presetName = e.target.value;
           const preset = this.PRESETS[presetName];
           if (!preset) return;
   
           this.state.STAGES = preset.stages;
           uiController.updatePresetUI(this, preset);
   
           if (this.state.isPlaying) {
               await this.soundEngine.transitionToPreset(preset);
           } else {
               if (this.soundEngine.ctx && this.soundEngine.ctx.state !== 'closed') {
                   await this.soundEngine.stop();
               } else {
                   uiController.updateUIStage(this);
               }
           }
       } finally {
           this.state.isInteracting = false;
       }
    },
    
    handleSaveAudio() {
       const btn = this.ui.saveAudioBtn;
       btn.disabled = true;
       btn.textContent = 'Generating... Please Wait';
    
       setTimeout(async () => {
           try {
               const durationSeconds = parseInt(this.ui.lengthSlider.value, 10) * 60;
               const sampleRate = 44100;
               const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, sampleRate * durationSeconds, sampleRate);
               
               const initialStageRecipe = this.state.STAGES[0] || this.PRESETS.none.stages[0];
               const activeToggles = this.toggleConfigs.reduce((acc, conf) => {
                   acc[conf.nodeKey] = this.state[conf.stateKey];
                   return acc;
               }, {});
               const intensity = parseFloat(this.ui.intensitySlider.value);
   
               const offlineMasterGain = offlineCtx.createGain();
               offlineMasterGain.connect(offlineCtx.destination);
               
               const nodes = await this.soundEngine._createAudioGraph(offlineCtx, offlineMasterGain, initialStageRecipe, activeToggles, intensity);
               offlineMasterGain.gain.setValueAtTime(this.config.MASTER_GAIN_MULTIPLIER, 0);
   
               const stageDur = durationSeconds / this.state.STAGES.length;
               this.state.STAGES.forEach((stage, idx) => {
                   const startTime = idx * stageDur;
                   this.soundEngine.setStage(stage, nodes, startTime);
               });
   
               if (nodes.bowl && activeToggles.bowl) {
                   for (let t = 0; t < durationSeconds; t += 60) {
                       nodes.bowl.trigger(t);
                   }
               }
               
               const renderedBuffer = await offlineCtx.startRendering();
   
               btn.textContent = 'Encoding WAV...';
               const wavBlob = this.bufferToWav(renderedBuffer);
               const url = URL.createObjectURL(wavBlob);
               const a = document.createElement('a');
               a.style.display = 'none';
               a.href = url;
               a.download = `binaural-soundscape-${this.ui.presetSelector.value}-${this.ui.lengthSlider.value}min.wav`;
               document.body.appendChild(a);
               a.click();
               window.URL.revokeObjectURL(url);
               a.remove();
   
           } catch (error) {
               console.error('Failed to save audio:', error);
               alert('An error occurred while saving the audio. Please check the console for details.');
           } finally {
               btn.disabled = false;
               btn.textContent = 'Save Audio';
           }
       }, 100);
    },
   
    bufferToWav(buffer) {
        const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44;
        const bufferOut = new ArrayBuffer(length), view = new DataView(bufferOut);
        const channels = [];
        let i, sample, offset = 0, pos = 0;
   
        const writeString = (v, o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
   
        writeString(view, pos, 'RIFF'); pos += 4;
        view.setUint32(pos, length - 8, true); pos += 4;
        writeString(view, pos, 'WAVE'); pos += 4;
        writeString(view, pos, 'fmt '); pos += 4;
        view.setUint32(pos, 16, true); pos += 4;
        view.setUint16(pos, 1, true); pos += 2;
        view.setUint16(pos, numOfChan, true); pos += 2;
        view.setUint32(pos, buffer.sampleRate, true); pos += 4;
        view.setUint32(pos, buffer.sampleRate * 2 * numOfChan, true); pos += 4;
        view.setUint16(pos, numOfChan * 2, true); pos += 2;
        view.setUint16(pos, 16, true); pos += 2;
        writeString(view, pos, 'data'); pos += 4;
        view.setUint32(pos, length - pos - 4, true); pos += 4;
        for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
        return new Blob([view], { type: 'audio/wav' });
    },
};
  
app.init();