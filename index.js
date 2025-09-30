import { PRESETS, config, toggleConfigs } from './presets.js';
import { state } from './state.js';
import * as soundEngine from './soundEngine.js';
import * as ui from './ui.js';

const controller = {
    init() {
        soundEngine.init({
            onStageChange: this.handleStageChange.bind(this),
            onStop: () => {
                ui.updatePlayPauseButton();
                ui.updateUIStage(-1, state.STAGES, state.activePreset);
                this.updateMediaSessionMetadata(-1);
            },
            startAuto: this.startAuto.bind(this),
            stopAuto: this.stopAuto.bind(this),
        });

        ui.init(this);
        this.setupMediaSessionHandlers();
    },

    debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
     },

    setupMediaSessionHandlers() {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.setActionHandler('play', this.handlePlayPause.bind(this));
        navigator.mediaSession.setActionHandler('pause', this.handlePlayPause.bind(this));
        navigator.mediaSession.setActionHandler('nexttrack', this.goToNextStage.bind(this));
        navigator.mediaSession.setActionHandler('previoustrack', this.goToPreviousStage.bind(this));
    },
   
    updateMediaSessionMetadata(idx) {
       if (!('mediaSession' in navigator)) return;
       if (idx < 0 || state.STAGES.length === 0) {
           navigator.mediaSession.metadata = null;
           return;
       }
       
       const stage = state.STAGES[idx];
       const presetName = state.activePreset !== 'none' ? PRESETS[state.activePreset].description.title : 'Custom Session';
       
       const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 496"><circle cx="252.1" cy="246.6" r="241.2" fill="#a2008a"/><ellipse cx="176.3" cy="177" fill="#ebff3f" rx="70.6" ry="66.9"/><path fill="#ebff3f" d="M302 183h97v37h-97z"/><path fill="#ebff3f" stroke="#ebff3f" stroke-width="25.9" d="M111 308c72 90 167 115 252 69"/></svg>`;
       const iconUrl = `data:image/svg+xml;base64,${btoa(iconSvg)}`;
   
       navigator.mediaSession.metadata = new MediaMetadata({
           title: stage.name,
           artist: config.APP_NAME,
           album: `Preset: ${presetName}`,
           artwork: [ { src: iconUrl, sizes: '496x496', type: 'image/svg+xml' } ]
       });
    },

    // --- Autoplay ---
    startAuto() {
        this.stopAuto();
        state.lastTickTime = performance.now();
        state.autoplayInterval = setInterval(this.tickAutoplay.bind(this), config.AUTOPLAY_TICK_MS);
    },

    stopAuto() {
        clearInterval(state.autoplayInterval);
        state.autoplayInterval = null;
    },

    tickAutoplay() {
        const now = performance.now();
        const delta = (now - state.lastTickTime) / 1000;
        state.lastTickTime = now;
        state.sessionElapsedTime += delta;
        
        const totalDur = state.sessionLengthMinutes * 60;
        if (state.sessionElapsedTime >= totalDur) {
            soundEngine.stop(); return;
        }
        
        const stageDur = totalDur / state.STAGES.length;
        const expectedStage = Math.floor(state.sessionElapsedTime / stageDur);

        if (expectedStage < state.STAGES.length && expectedStage !== state.currentStage) {
            const stageRecipe = state.STAGES[expectedStage];
            soundEngine.setStage(stageRecipe, soundEngine.nodes, 0, config.STAGE_CHANGE_RAMP_S);
        }
    },

    // --- Event Handlers & Actions ---
    async handlePlayPause() {
        if (state.isInteracting) return;
        state.isInteracting = true;
    
        try {
            if (!soundEngine.ctx || soundEngine.ctx.state === 'closed') {
                soundEngine.createContext();
            }
    
            if (soundEngine.ctx.state === 'suspended') {
                await soundEngine.ctx.resume();
            }
    
            if (state.isPlaying) {
                soundEngine.pause();
                state.isPlaying = false;
                ui.updatePlayPauseButton();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            } else {
                if (Object.keys(soundEngine.nodes).length === 0) { 
                    const initialStageRecipe = state.STAGES[0] || PRESETS.none.stages[0];
                    const activeToggles = toggleConfigs.reduce((acc, conf) => {
                        acc[conf.nodeKey] = state[conf.stateKey];
                        return acc;
                    }, {});
                    await soundEngine.init(null, initialStageRecipe, activeToggles, state.effectsIntensity);
                    state.sessionElapsedTime = 0;
                    this.updateMediaSessionMetadata(0);
                }
                soundEngine.resume();
                state.isPlaying = true;
                ui.updatePlayPauseButton();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }
        } finally {
            state.isInteracting = false;
        }
    },

    async handlePresetCardClick(presetName) {
        if (state.isInteracting) return;
        state.isInteracting = true;
        try {
            const preset = PRESETS[presetName];
            if (!preset) return;
    
            state.activePreset = presetName;
            state.STAGES = preset.stages;
            ui.updatePresetUI(preset);
    
            if (state.isPlaying) {
                await soundEngine.transitionToPreset(preset);
            } else {
                if (soundEngine.ctx) {
                    await soundEngine.stop(); 
                }
                await this.handlePlayPause(); 
            }
            
            ui.hidePresetDialog();
        } finally {
            state.isInteracting = false;
        }
    },
   
    async goToNextStage() {
       if (state.isInteracting) return;
       state.isInteracting = true;
       try {
           if (!soundEngine.ctx) {
               await this.handlePlayPause();
               return;
           }
           if (state.currentStage >= state.STAGES.length - 1) {
               await soundEngine.stop();
               return;
           }
           const nextStageIndex = state.currentStage + 1;
           const stageDur = (state.sessionLengthMinutes * 60) / state.STAGES.length;
           state.sessionElapsedTime = nextStageIndex * stageDur;
           if(state.autoplayInterval) state.lastTickTime = performance.now();
           
           const stageRecipe = state.STAGES[nextStageIndex];
           soundEngine.setStage(stageRecipe, soundEngine.nodes, 0, config.STAGE_CHANGE_RAMP_S);
   
           if (state.isPlaying && soundEngine.ctx.state === 'suspended') {
               await soundEngine.resume();
           }
       } finally {
           state.isInteracting = false;
       }
    },
   
    async goToPreviousStage() {
       if (state.isInteracting || !soundEngine.ctx || state.currentStage <= 0) return;
       state.isInteracting = true;
       try {
           const prevStageIndex = state.currentStage - 1;
           const stageDur = (state.sessionLengthMinutes * 60) / state.STAGES.length;
           state.sessionElapsedTime = prevStageIndex * stageDur;
           if(state.autoplayInterval) state.lastTickTime = performance.now();
           
           const stageRecipe = state.STAGES[prevStageIndex];
           soundEngine.setStage(stageRecipe, soundEngine.nodes, 0, config.STAGE_CHANGE_RAMP_S);
   
           if (state.isPlaying && soundEngine.ctx.state === 'suspended') {
               await soundEngine.resume();
           }
       } finally {
           state.isInteracting = false;
       }
    },

    handleMasterVolumeChange(value) {
        state.masterVolume = parseFloat(value);
        ui.updateMasterVolumeLabel(value);
        if (soundEngine.ctx) {
            soundEngine.setMasterVolume(state.masterVolume);
        }
    },
   
    handleIntensityChange(value) {
        state.effectsIntensity = parseFloat(value);
        ui.updateIntensityLabel(value);
        if (soundEngine.ctx) {
            soundEngine.setIntensity(state.effectsIntensity);
        }
        if (state.activePreset !== 'none') {
            state.activePreset = 'none';
            ui.updateUIStage(state.currentStage, state.STAGES, state.activePreset);
        }
    },
   
    handleToggle(stateKey, nodeKey) {
        state[stateKey] = !state[stateKey];
        ui.updateToggle(stateKey);
        soundEngine.toggleEffect(nodeKey, state[stateKey]);
        if (state.activePreset !== 'none') {
            state.activePreset = 'none';
            ui.updateUIStage(state.currentStage, state.STAGES, state.activePreset);
        }
    },
    
    handleStageChange(stageIndex) {
        ui.updateUIStage(stageIndex, state.STAGES, state.activePreset);
        this.updateMediaSessionMetadata(stageIndex);
    },

    handleLengthChange(value) {
        state.sessionLengthMinutes = parseInt(value, 10);
        ui.updateLengthLabel(value);
    },

    async startAudioRender() {
        if (state.isRendering) return;
        state.isRendering = true;
        state.renderProcess.cancel = false;
    
        ui.setRenderMode(true);
    
        const selectedOption = ui.formatSelector.options[ui.formatSelector.selectedIndex];
        const mimeType = selectedOption.value;
        const bitrate = selectedOption.dataset.bitrate ? parseInt(selectedOption.dataset.bitrate, 10) : undefined;
        const totalDuration = state.sessionLengthMinutes * 60;
    
        const updateProgress = (progress, elapsed) => {
            if (state.renderProcess.cancel) return;
            const percent = Math.floor((progress / totalDuration) * 100);
            const status = state.renderProcess.cancel ? 'Cancelling...' : `Rendering... ${percent}%`;
            const time = `${Math.floor(elapsed)}s / ${totalDuration}s`;
            ui.updateRenderProgress(percent, status, time);
        };
    
        try {
            const audioBlob = await soundEngine.renderOffline(updateProgress, mimeType, bitrate);
            if (audioBlob && !state.renderProcess.cancel) {
                ui.updateRenderProgress(100, 'Download starting...', `${totalDuration}s / ${totalDuration}s`);
                const url = URL.createObjectURL(audioBlob);
                const a = document.createElement('a');
                a.href = url;
                const ext = mimeType.split('/')[1].replace('webm', 'webm').replace('ogg', 'ogg');
                a.download = `sound-therapy-session.${ext === 'wav' ? 'wav' : ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setTimeout(() => ui.hideSaveModal(), 2000);
            } else {
                ui.updateRenderProgress(0, 'Render cancelled.', '');
                setTimeout(() => ui.hideSaveModal(), 2000);
            }
        } catch (e) {
            console.error('Audio rendering failed:', e);
            ui.updateRenderProgress(0, `Error: ${e.message}`, '');
            setTimeout(() => ui.hideSaveModal(), 4000);
        } finally {
            state.isRendering = false;
            if(state.renderProcess.progressInterval) clearInterval(state.renderProcess.progressInterval);
        }
    }
};
  
controller.init();