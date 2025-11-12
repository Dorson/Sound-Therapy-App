import { PRESETS, config, toggleConfigs } from './presets.js';
import { state } from './state.js';
import * as soundEngine from './soundEngine.js';
import * as ui from './ui.js';
import { on, emit } from './eventBus.js';


const controller = {
    init() {
        soundEngine.init();
        ui.init(this);

        on('engine:stageChanged', this.handleStageChange.bind(this));
        on('engine:stopped', () => {
            ui.syncUIWithState();
            this.updateMediaSessionMetadata(-1);
        });
        on('engine:worklet-error', () => {
            console.warn("AudioWorklet failed to load. Some effects will be disabled.");
            ui.disableWorkletFeatures();
        });
        on('engine:node-creation-failed', this.handleNodeCreationFailure.bind(this));
        on('engine:contextStateChanged', this.handleContextStateChange.bind(this));


        this.setupMediaSessionHandlers();
        
        // Listen for the app:ready event to handle URL parameters.
        // This ensures all initial setup is complete before acting on them.
        on('app:ready', this.handleUrlParameters.bind(this));

        // After all initialization logic in this function is complete,
        // we emit the 'app:ready' event.
        emit('app:ready');
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

    async _handleCriticalError(error) {
        console.error("A critical error occurred:", error);
        
        ui.showErrorState("An unexpected error occurred. Please refresh.");

        if (state.audioEngineStatus !== 'closed') {
            await soundEngine.stop();
        }
        
        this.stopAuto();
        state.isPlaying = false;
        state.isInteracting = false; 

        ui.syncUIWithState();
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
        ui.startProgressAnimationLoop();
    },

    stopAuto() {
        clearInterval(state.autoplayInterval);
        state.autoplayInterval = null;
        ui.stopProgressAnimationLoop();
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
    handleUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const presetName = params.get('preset');

        if (presetName && PRESETS[presetName]) {
            // Clean the URL for a better user experience
            const url = new URL(window.location);
            url.searchParams.delete('preset');
            window.history.replaceState({}, document.title, url);
            
            // The 'app:ready' event has fired, so we can now safely
            // trigger the preset click. This is important for PWAs
            // which might auto-play a preset passed via a shortcut.
            this.handlePresetCardClick(presetName);
        }
    },

    async handleFirstInteraction() {
        await soundEngine.prewarmContext();
    },

    async handlePlayPause() {
        if (state.isInteracting) return;
        state.isInteracting = true;
    
        try {
            if (state.audioEngineStatus === 'closed') {
                await soundEngine.createContext();
            }
    
            if (state.audioEngineStatus === 'suspended') {
                await soundEngine.resumeSuspendedContext();
            }
    
            if (state.isPlaying) {
                soundEngine.pause();
                this.stopAuto();
                state.isPlaying = false;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            } else {
                if (Object.keys(soundEngine.nodes).length === 0) { 
                    const initialStageRecipe = state.STAGES[0] || PRESETS.none.stages[0];
                    const activeToggles = toggleConfigs.reduce((acc, conf) => {
                        acc[conf.stateKey] = state[conf.stateKey];
                        return acc;
                    }, {});
                    state.sessionElapsedTime = 0;
                    await soundEngine.initAudio(initialStageRecipe, activeToggles, state.effectsIntensity);
                    this.updateMediaSessionMetadata(0);
                }
                soundEngine.resume();
                this.startAuto();
                state.isPlaying = true;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            }
        } catch(e) {
            await this._handleCriticalError(e);
        }
        finally {
            ui.syncUIWithState();
            state.isInteracting = false;
        }
    },

    async handlePresetCardClick(presetName) {
        if (state.isInteracting) return;
        state.isInteracting = true;
    
        const preset = PRESETS[presetName];
        if (!preset) {
            state.isInteracting = false;
            return;
        }
    
        // Store old state for potential rollback in case of an error
        const oldTogglesState = toggleConfigs.reduce((acc, conf) => {
            acc[conf.stateKey] = state[conf.stateKey];
            return acc;
        }, {});
        const oldState = {
            activePreset: state.activePreset,
            STAGES: state.STAGES,
            effectsIntensity: state.effectsIntensity,
            ...oldTogglesState
        };
    
        try {
            // 1. Optimistically update state and then sync the UI
            state.activePreset = presetName;
            state.STAGES = preset.stages;
            
            // This logic was previously in ui.updatePresetUI
            const { toggles, intensity } = preset;
            toggleConfigs.forEach(config => {
               state[config.stateKey] = !!toggles[config.nodeKey];
            });
            state.effectsIntensity = intensity;

            // Override preset toggles for any effects that failed to load
            for (const disabledNodeKey of state.disabledEffects) {
                const cfg = toggleConfigs.find(c => c.nodeKey === disabledNodeKey);
                if (cfg) {
                    state[cfg.stateKey] = false;
                }
            }

            ui.syncUIWithState();
    
            // 2. Perform the critical async audio operation
            if (state.isPlaying) {
                await soundEngine.transitionToPreset(preset);
            } else {
                if (state.audioEngineStatus !== 'closed') {
                    await soundEngine.stop();
                }
                // handlePlayPause will now use the new state to initialize the audio graph.
                await this.handlePlayPause();
            }
    
            // 3. On success, finalize the action by hiding the dialog
            ui.hidePresetDialog();
    
        } catch (e) {
            console.error(`Failed to switch to preset "${presetName}". Rolling back state.`, e);
    
            // --- Rollback State & Sync UI ---
            Object.assign(state, oldState);
            ui.syncUIWithState();
    
            // --- Handle the error globally (stops audio, shows error message) ---
            await this._handleCriticalError(e);
    
        } finally {
            state.isInteracting = false;
        }
    },
   
    async goToNextStage() {
       if (state.isInteracting) return;
       state.isInteracting = true;
       try {
           if (state.audioEngineStatus === 'closed') {
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
   
       } catch (e) {
            await this._handleCriticalError(e);
       } finally {
           state.isInteracting = false;
       }
    },
   
    async goToPreviousStage() {
       if (state.isInteracting || state.audioEngineStatus === 'closed' || state.currentStage <= 0) return;
       state.isInteracting = true;
       try {
           const prevStageIndex = state.currentStage - 1;
           const stageDur = (state.sessionLengthMinutes * 60) / state.STAGES.length;
           state.sessionElapsedTime = prevStageIndex * stageDur;
           if(state.autoplayInterval) state.lastTickTime = performance.now();
           
           const stageRecipe = state.STAGES[prevStageIndex];
           soundEngine.setStage(stageRecipe, soundEngine.nodes, 0, config.STAGE_CHANGE_RAMP_S);
   
       } catch (e) {
            await this._handleCriticalError(e);
       } finally {
           state.isInteracting = false;
       }
    },

    handleMasterVolumeChange(value) {
        if (state.isInteracting) return;
        state.masterVolume = parseFloat(value);
        ui.syncUIWithState();
        if (state.audioEngineStatus !== 'closed') {
            soundEngine.setMasterVolume(state.masterVolume);
        }
    },
   
    handleIntensityChange(value) {
        if (state.isInteracting) return;
        state.effectsIntensity = parseFloat(value);
        if (state.activePreset !== 'none') {
            state.activePreset = 'none';
        }
        ui.syncUIWithState();
        if (state.audioEngineStatus !== 'closed') {
            soundEngine.setIntensity(state.effectsIntensity);
        }
    },
   
    handleToggle(stateKey, nodeKey) {
        if (state.isInteracting || state.disabledEffects.has(nodeKey)) return;
        state[stateKey] = !state[stateKey];
        if (state.activePreset !== 'none') {
            state.activePreset = 'none';
        }
        ui.syncUIWithState();
        soundEngine.toggleEffect(nodeKey, state[stateKey]);
    },
    
    handleStageChange({ stageIndex }) {
        // The soundEngine already updated state.currentStage
        ui.syncUIWithState();
        this.updateMediaSessionMetadata(stageIndex);
    },

    handleContextStateChange({ state: engineState }) {
        switch (engineState) {
            case 'interrupted':
                if (state.isPlaying) {
                    state.wasPlayingBeforeInterruption = true;
                }
                this.stopAuto();
                state.isPlaying = false;
                ui.syncUIWithState();
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
                break;
    
            case 'running':
                // The interruption message (if any) will be cleared by the sync.
                ui.syncUIWithState();
                
                // If we were playing before, automatically resume.
                if (state.wasPlayingBeforeInterruption) {
                    state.wasPlayingBeforeInterruption = false;
                    // handlePlayPause will toggle to 'playing'
                    this.handlePlayPause(); 
                }
                break;
    
            case 'closed':
                state.wasPlayingBeforeInterruption = false;
                // 'engine:stopped' will also fire, but syncing here ensures UI is clean.
                state.currentStage = -1;
                ui.syncUIWithState();
                break;
        }
    },

    handleNodeCreationFailure({ nodeKey }) {
        console.warn(`Effect '${nodeKey}' failed to initialize and has been disabled.`);
        state.disabledEffects.add(nodeKey);
        
        const cfg = toggleConfigs.find(c => c.nodeKey === nodeKey);
        if (cfg) {
            state[cfg.stateKey] = false;
            ui.disableToggle(cfg.optionId);
            ui.syncUIWithState(); // Ensure checkmark is updated correctly
        }
    },

    handleLengthChange(value) {
        state.sessionLengthMinutes = parseInt(value, 10);
        ui.syncUIWithState();
    },

    async startAudioRender() {
        try {
            if (state.isRendering) return;
            state.isRendering = true;
            state.renderProcess.cancel = false;
        
            ui.setRenderMode(true);
        
            const mimeType = 'audio/wav';
            const bitrate = undefined; // Not applicable for WAV
            const totalDuration = state.sessionLengthMinutes * 60;
        
            const updateProgress = (progress, elapsed) => {
                if (state.renderProcess.cancel) return;
                const percent = Math.floor((progress / totalDuration) * 100);
                const status = state.renderProcess.cancel ? 'Cancelling...' : `Rendering... ${percent}%`;
                const time = `${Math.floor(elapsed)}s / ${totalDuration}s`;
                ui.updateRenderProgress(percent, status, time);
            };
        
            const audioBlob = await soundEngine.renderOffline(updateProgress, mimeType, bitrate);
            
            if (audioBlob && !state.renderProcess.cancel) {
                ui.updateRenderProgress(100, 'Download starting...', `${totalDuration}s / ${totalDuration}s`);
                const url = URL.createObjectURL(audioBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sound-therapy-session.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setTimeout(() => ui.hideSaveModal(), 2000);
            } else if (state.renderProcess.cancel) {
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