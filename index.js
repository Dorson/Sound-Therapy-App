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
        isRendering: false,
        renderProcess: {
            cancel: false,
            progressInterval: null,
            onlineCtx: null,
            source: null,
        },
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
        this.ui.masterVolumeSlider = document.getElementById('masterVolumeSlider');
        this.ui.volLabel = document.getElementById('volLabel');
        this.ui.lenLabel = document.getElementById('lenLabel');
        this.ui.intLabel = document.getElementById('intLabel');
        this.ui.stageName = document.getElementById('stageName');
        this.ui.stageSub = document.getElementById('stageSub');
        this.ui.progressBar = document.getElementById('progressBar');
        this.ui.presetSelector = document.getElementById('presetSelector');
        this.ui.installAppBtn = document.getElementById('installAppBtn');
        this.ui.installInstructions = document.getElementById('install-instructions');
        
        // Modal UI Elements
        this.ui.saveModal = document.getElementById('saveModal');
        this.ui.saveModalBackdrop = document.getElementById('saveModalBackdrop');
        this.ui.saveModalCloseBtn = document.getElementById('saveModalCloseBtn');
        this.ui.saveSettingsView = document.getElementById('saveSettingsView');
        this.ui.saveProgressView = document.getElementById('saveProgressView');
        this.ui.formatSelector = document.getElementById('formatSelector');
        this.ui.formatInfo = document.getElementById('formatInfo');
        this.ui.startRenderBtn = document.getElementById('startRenderBtn');
        this.ui.cancelModalBtn = document.getElementById('cancelModalBtn');
        this.ui.progressStatusText = document.getElementById('progressStatusText');
        this.ui.renderProgressBar = document.getElementById('renderProgressBar');
        this.ui.progressTimeText = document.getElementById('progressTimeText');
        this.ui.cancelRenderBtn = document.getElementById('cancelRenderBtn');

        this.toggleConfigs.forEach(config => {
            this.ui[config.optionId] = document.getElementById(config.optionId);
            this.ui[config.chkId] = document.getElementById(config.chkId);
        });

        uiController.checkPWA(this);
        this.checkSupportedFormats();

        // Wire up event listeners
        this.ui.playPauseBtn.addEventListener('click', this.handlePlayPause.bind(this));
        this.ui.nextStageBtn.addEventListener('click', this.goToNextStage.bind(this));
        this.ui.lengthSlider.addEventListener('input', this.debounce(e => this.ui.lenLabel.textContent = e.target.value, 50));
        this.ui.intensitySlider.addEventListener('input', this.debounce((e) => this.handleIntensityChange(e.target.value), 50));
        this.ui.masterVolumeSlider.addEventListener('input', this.debounce((e) => this.handleMasterVolumeChange(e.target.value), 50));
        this.ui.presetSelector.addEventListener('change', this.debounce(this.handlePresetChange.bind(this), 100));
        
        this.toggleConfigs.forEach(config => {
            this.ui[config.optionId].addEventListener('click', this.debounce(() => {
                this.handleToggle(config.stateKey, this.ui[config.optionId], this.ui[config.chkId], config.nodeKey);
            }, 50));
        });

        // Save Modal Listeners
        this.ui.saveAudioBtn.addEventListener('click', () => this.uiController.showSaveModal(this));
        this.ui.saveModalCloseBtn.addEventListener('click', () => this.uiController.hideSaveModal(this));
        this.ui.cancelModalBtn.addEventListener('click', () => this.uiController.hideSaveModal(this));
        this.ui.saveModalBackdrop.addEventListener('click', () => this.uiController.hideSaveModal(this));
        this.ui.startRenderBtn.addEventListener('click', this.startAudioRender.bind(this));
        this.ui.formatSelector.addEventListener('change', () => this.uiController.updateFormatInfo(this));
        this.ui.cancelRenderBtn.addEventListener('click', () => {
            this.state.renderProcess.cancel = true;
            this.uiController.updateRenderProgress(this, this.ui.renderProgressBar.style.width.replace('%',''), 'Cancellation requested. Finishing render step...', '');
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

    checkSupportedFormats() {
        const selector = this.ui.formatSelector;
        if (!selector || !('MediaRecorder' in window)) return;

        const options = Array.from(selector.options);
        options.forEach(option => {
            const mimeType = option.value;
            // WAV is custom and always supported. Check others.
            if (mimeType !== 'audio/wav') {
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    // This browser does not support this format, so remove it from the list.
                    option.remove();
                }
            }
        });
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
                this.state.isPlaying = false;
                uiController.updatePlayPauseButton(this);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
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
                this.state.isPlaying = true;
                uiController.updatePlayPauseButton(this);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
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
           this.soundEngine.setStage(stageRecipe, this.soundEngine.nodes, 0, this.config.STAGE_CHANGE_RAMP_S);
   
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
           this.soundEngine.setStage(stageRecipe, this.soundEngine.nodes, 0, this.config.STAGE_CHANGE_RAMP_S);
   
           if (this.state.isPlaying && this.soundEngine.ctx.state === 'suspended') {
               await this.soundEngine.resume();
           }
       } finally {
           this.state.isInteracting = false;
       }
    },

    handleMasterVolumeChange(value) {
        this.ui.volLabel.textContent = value;
        if (this.soundEngine.ctx) {
            this.soundEngine.setMasterVolume(parseFloat(value));
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
    
    _concatenateAudioBuffers(buffers) {
        if (!buffers || buffers.length === 0) return null;
        const firstBuffer = buffers[0];
        const { numberOfChannels, sampleRate } = firstBuffer;
        let totalLength = 0;
        for (const buffer of buffers) {
            totalLength += buffer.length;
        }
        const tempCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const finalBuffer = tempCtx.createBuffer(numberOfChannels, totalLength, sampleRate);
        tempCtx.close();
        let offset = 0;
        for (const buffer of buffers) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                finalBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
            }
            offset += buffer.length;
        }
        return finalBuffer;
    },
    
    async startAudioRender() {
        if (this.state.isRendering) return;
        this.state.isRendering = true;
        this.state.renderProcess.cancel = false;
        
        const ui = this.uiController;
        ui.setRenderMode(this, true);
        
        const totalDuration = parseInt(this.ui.lengthSlider.value, 10) * 60;
        const mimeType = this.ui.formatSelector.value;
        const selectedOption = this.ui.formatSelector.options[this.ui.formatSelector.selectedIndex];
        const bitrate = selectedOption.dataset.bitrate ? parseInt(selectedOption.dataset.bitrate, 10) : undefined;
        const extension = mimeType.split('/')[1].split(';')[0];
        const sampleRate = 44100;
    
        // --- Chunked Rendering Setup ---
        const CHUNK_DURATION_S = 15;
        const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_S);
        const renderedChunks = [];
        const activeToggles = this.toggleConfigs.reduce((acc, conf) => {
            acc[conf.nodeKey] = this.state[conf.stateKey];
            return acc;
        }, {});
        const intensity = parseFloat(this.ui.intensitySlider.value);
    
        try {
            // --- 1. Render Audio in Chunks ---
            for (let i = 0; i < numChunks; i++) {
                if (this.state.renderProcess.cancel) throw new Error('Render cancelled by user.');
    
                const chunkStartTime = i * CHUNK_DURATION_S;
                const currentChunkDuration = Math.min(CHUNK_DURATION_S, totalDuration - chunkStartTime);
    
                const progress = (i / numChunks) * 50;
                ui.updateRenderProgress(this, progress, `Rendering chunk ${i + 1} of ${numChunks}...`, `${Math.floor(chunkStartTime)}s / ${totalDuration}s`);
    
                const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sampleRate * currentChunkDuration), sampleRate);
                
                const offlineMasterGain = offlineCtx.createGain();
                offlineMasterGain.connect(offlineCtx.destination);
                
                const nodes = await this.soundEngine._createAudioGraph(offlineCtx, offlineMasterGain, this.state.STAGES[0], activeToggles, intensity, chunkStartTime);
                offlineMasterGain.gain.setValueAtTime(this.config.DEFAULT_MASTER_GAIN, 0);
    
                const stageDur = totalDuration / this.state.STAGES.length;
                this.state.STAGES.forEach((stage, idx) => {
                    const stageStartTime = idx * stageDur;
                    this.soundEngine.setStage(stage, nodes, stageStartTime - chunkStartTime, this.config.STAGE_CHANGE_RAMP_S, chunkStartTime, currentChunkDuration);
                });
    
                if (nodes.bowl && activeToggles.bowl) {
                    for (let t = 0; t < totalDuration; t += 60) {
                        if (t >= chunkStartTime && t < chunkStartTime + currentChunkDuration) {
                            nodes.bowl.trigger(t - chunkStartTime);
                        }
                    }
                }
    
                const renderedChunk = await offlineCtx.startRendering();
                renderedChunks.push(renderedChunk);
            }
            
            // --- 2. Concatenate Chunks ---
            if (this.state.renderProcess.cancel) throw new Error('Render cancelled by user.');
            ui.updateRenderProgress(this, 50, 'Assembling audio file...', `${totalDuration}s / ${totalDuration}s`);
            const finalBuffer = this._concatenateAudioBuffers(renderedChunks);
            if (!finalBuffer) throw new Error('Concatenation failed.');

            // --- 3. Encode Final Buffer ---
            if (this.state.renderProcess.cancel) throw new Error('Render cancelled by user.');
            ui.updateRenderProgress(this, 51, 'Encoding file...', `${totalDuration}s / ${totalDuration}s`);
            
            let blob;
            if (mimeType === 'audio/wav') {
                blob = this._bufferToWav(finalBuffer);
            } else if (MediaRecorder.isTypeSupported(mimeType)) {
                blob = await this._encodeViaMediaRecorder(finalBuffer, mimeType, bitrate);
            } else {
                alert(`Sorry, your browser doesn't support encoding to ${extension.toUpperCase()}. Please choose WAV.`);
                throw new Error(`Unsupported mimeType: ${mimeType}`);
            }
    
            if (this.state.renderProcess.cancel) throw new Error('Render cancelled by user.');
    
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; a.href = url;
            a.download = `binaural-soundscape-${this.ui.presetSelector.value}-${this.ui.lengthSlider.value}min.${extension}`;
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url); a.remove();
            
            ui.updateRenderProgress(this, 100, 'Export complete!', '');
    
        } catch (error) {
            if (error.message.includes('cancelled')) {
                ui.updateRenderProgress(this, 0, 'Export cancelled.', '');
            } else {
                console.error('Failed to save audio:', error);
                ui.updateRenderProgress(this, 0, 'An error occurred.', '');
                alert('An error occurred while saving the audio. Please check the console.');
            }
        } finally {
            this.state.isRendering = false;
            if (this.state.renderProcess.progressInterval) clearInterval(this.state.renderProcess.progressInterval);
            setTimeout(() => ui.setRenderMode(this, false), 2000);
        }
    },

    async _encodeViaMediaRecorder(buffer, mimeType, audioBitsPerSecond) {
        return new Promise((resolve, reject) => {
            if (this.state.renderProcess.cancel) {
                return reject(new Error('Render cancelled before encoding started.'));
            }
            const onlineCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: buffer.sampleRate });
            const source = onlineCtx.createBufferSource();
            source.buffer = buffer;
            
            const dest = onlineCtx.createMediaStreamDestination();
            source.connect(dest);
            
            const recorderOptions = { mimeType };
            if (audioBitsPerSecond) {
                recorderOptions.audioBitsPerSecond = audioBitsPerSecond;
            }
            const recorder = new MediaRecorder(dest.stream, recorderOptions);
            const chunks = [];
            
            const closeContext = () => {
                if (onlineCtx.state !== 'closed') {
                    onlineCtx.close();
                }
            };

            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                closeContext();
                resolve(blob);
            };
            recorder.onerror = err => {
                closeContext();
                reject(err);
            }
    
            this.state.renderProcess = { ...this.state.renderProcess, onlineCtx, source };
            
            source.onended = () => {
                if (recorder.state === "recording") recorder.stop();
                if (this.state.renderProcess.progressInterval) clearInterval(this.state.renderProcess.progressInterval);
            };
    
            recorder.start();
            source.start(0);
    
            const duration = buffer.duration;
            this.state.renderProcess.progressInterval = setInterval(() => {
                if (this.state.renderProcess.cancel) {
                    clearInterval(this.state.renderProcess.progressInterval);
                    if (recorder.state === "recording") recorder.stop();
                    if (source) try { source.stop(); } catch(e){}
                    closeContext();
                    return;
                }
                const progressPercentage = 50 + (onlineCtx.currentTime / duration) * 50;
                const elapsed = Math.floor(onlineCtx.currentTime);
                this.uiController.updateRenderProgress(this, progressPercentage, `Encoding... ${Math.round(progressPercentage)}%`, `${elapsed}s / ${Math.floor(duration)}s`);
            }, 250);
        });
    },
   
    _bufferToWav(buffer) {
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