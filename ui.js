import { state } from './state.js';
import { PRESETS, toggleConfigs, config } from './presets.js';

export const elements = {};
let progressAnimationId = null;

function queryElements() {
    elements.playPauseBtn = document.getElementById('playPauseBtn');
    elements.playIcon = document.getElementById('playIcon');
    elements.playPauseLabel = document.getElementById('playPauseLabel');
    elements.prevStageBtn = document.getElementById('prevStageBtn');
    elements.nextStageBtn = document.getElementById('nextStageBtn');
    elements.saveAudioBtn = document.getElementById('saveAudioBtn');
    elements.lengthSlider = document.getElementById('lengthSlider');
    elements.intensitySlider = document.getElementById('intensity');
    elements.masterVolumeSlider = document.getElementById('masterVolumeSlider');
    elements.volLabel = document.getElementById('volLabel');
    elements.lenLabel = document.getElementById('lenLabel');
    elements.intLabel = document.getElementById('intLabel');
    elements.stageName = document.getElementById('stageName');
    elements.stageSub = document.getElementById('stageSub');
    elements.progressBar = document.getElementById('progressBar');
    elements.openPresetDialogBtn = document.getElementById('openPresetDialogBtn');
    elements.installAppBtn = document.getElementById('installAppBtn');
    elements.installInstructions = document.getElementById('install-instructions');
    
    elements.saveModal = document.getElementById('saveModal');
    elements.saveModalBackdrop = document.getElementById('saveModalBackdrop');
    elements.saveModalCloseBtn = document.getElementById('saveModalCloseBtn');
    elements.saveSettingsView = document.getElementById('saveSettingsView');
    elements.saveProgressView = document.getElementById('saveProgressView');
    elements.formatInfo = document.getElementById('formatInfo');
    elements.startRenderBtn = document.getElementById('startRenderBtn');
    elements.cancelModalBtn = document.getElementById('cancelModalBtn');
    elements.progressStatusText = document.getElementById('progressStatusText');
    elements.renderProgressBar = document.getElementById('renderProgressBar');
    elements.progressTimeText = document.getElementById('progressTimeText');
    elements.cancelRenderBtn = document.getElementById('cancelRenderBtn');

    elements.presetDialog = document.getElementById('presetDialog');
    elements.presetDialogBackdrop = document.getElementById('presetDialogBackdrop');
    elements.presetDialogCloseBtn = document.getElementById('presetDialogCloseBtn');
    elements.presetDialogExitBtn = document.getElementById('presetDialogExitBtn');
    elements.presetCardContainer = document.getElementById('presetCardContainer');

    toggleConfigs.forEach(config => {
        elements[config.optionId] = document.getElementById(config.optionId);
        elements[config.chkId] = document.getElementById(config.chkId);
    });
}

// --- Internal UI Update Functions ---

function updateLengthLabel(value) {
    elements.lenLabel.textContent = value;
}

function updateIntensityLabel(value) {
    elements.intLabel.textContent = value;
}

function updateMasterVolumeLabel(value) {
    elements.volLabel.textContent = value;
}

function toggleCheckmark(button, checkmark, isEnabled) {
    button.setAttribute('aria-checked', isEnabled);
    checkmark.classList.toggle('bg-accent', isEnabled);
    checkmark.classList.toggle('bg-black', !isEnabled);
}

function updateToggle(stateKey) {
    const config = toggleConfigs.find(c => c.stateKey === stateKey);
    if(config) {
        toggleCheckmark(elements[config.optionId], elements[config.chkId], state[stateKey]);
    }
}

function updatePlayPauseButton() {
    if (!state.isPlaying) {
        elements.playIcon.className = 'play-icon';
        elements.playPauseLabel.textContent = 'Play';
    } else {
        elements.playIcon.className = 'pause-icon';
        elements.playPauseLabel.textContent = 'Pause';
    }
}

function updateUIStage() {
    elements.stageName.classList.remove('error-state');

    if (state.audioEngineStatus === 'interrupted') {
        elements.stageName.textContent = 'Audio Interrupted';
        elements.stageName.classList.add('error-state');
        elements.stageSub.textContent = 'Press Play to resume';
        return; // Early exit for this specific state
    }

    const { currentStage, STAGES, activePreset } = state;

    if (currentStage < 0 || !STAGES || STAGES.length === 0) {
        elements.stageName.textContent = 'Idle • Ready';
        elements.stageSub.textContent = 'Select a therapy to begin';
    } else {
        const presetName = (activePreset !== 'none' && PRESETS[activePreset])
            ? PRESETS[activePreset].description.title
            : 'Custom';
        
        const stage = STAGES[currentStage];

        if (!stage) {
            elements.stageName.textContent = 'Session Complete';
            elements.stageSub.textContent = 'Press play to start a new session';
        } else {
            elements.stageName.textContent = `${presetName} • ${stage.name}`;
            elements.stageSub.textContent = `Stage ${currentStage + 1} of ${STAGES.length}`;
        }
    }

    if (state.isPlaying) {
        // The rAF loop is responsible for the progress bar.
        // It will be updated on the next animation frame.
    } else {
        // We are paused, stopped, or idle. Set a static progress value.
        const totalDuration = state.sessionLengthMinutes * 60;

        if (currentStage < 0 || totalDuration <= 0) {
            // Session is idle or has been explicitly stopped and reset.
            elements.progressBar.style.width = '0%';
        } else {
            // Session is paused or has just ended.
            const progress = (state.sessionElapsedTime / totalDuration) * 100;
            elements.progressBar.style.width = `${Math.min(100, progress)}%`;
        }
    }
}

// --- Primary Exported Functions ---

export function init(controller) {
    queryElements();

    elements.playPauseBtn.addEventListener('click', controller.handlePlayPause.bind(controller));
    elements.prevStageBtn.addEventListener('click', controller.goToPreviousStage.bind(controller));
    elements.nextStageBtn.addEventListener('click', controller.goToNextStage.bind(controller));
    elements.lengthSlider.addEventListener('input', controller.debounce(e => controller.handleLengthChange(e.target.value), 50));
    elements.intensitySlider.addEventListener('input', controller.debounce((e) => controller.handleIntensityChange(e.target.value), 50));
    elements.masterVolumeSlider.addEventListener('input', controller.debounce((e) => controller.handleMasterVolumeChange(e.target.value), 50));
    
    toggleConfigs.forEach(config => {
        elements[config.optionId].addEventListener('click', controller.debounce(() => {
            controller.handleToggle(config.stateKey, config.nodeKey);
        }, 50));
    });

    elements.saveAudioBtn.addEventListener('click', () => showSaveModal());
    elements.saveModalCloseBtn.addEventListener('click', () => hideSaveModal());
    elements.cancelModalBtn.addEventListener('click', () => hideSaveModal());
    elements.saveModalBackdrop.addEventListener('click', () => hideSaveModal());
    elements.startRenderBtn.addEventListener('click', controller.startAudioRender.bind(controller));
    elements.cancelRenderBtn.addEventListener('click', () => {
        state.renderProcess.cancel = true;
        updateRenderProgress(state.renderProcess.progress, 'Cancellation requested. Finishing render step...', '');
    });

    elements.openPresetDialogBtn.addEventListener('click', () => showPresetDialog());
    elements.presetDialogCloseBtn.addEventListener('click', () => hidePresetDialog());
    elements.presetDialogExitBtn.addEventListener('click', () => hidePresetDialog());
    elements.presetDialogBackdrop.addEventListener('click', () => hidePresetDialog());
    
    // Pre-warm AudioContext on first interaction for reduced latency.
    // This listener is added to all interactive elements and will only run once.
    const interactiveElements = [
        elements.playPauseBtn, elements.prevStageBtn, elements.nextStageBtn,
        elements.lengthSlider, elements.intensitySlider, elements.masterVolumeSlider,
        elements.saveAudioBtn, elements.openPresetDialogBtn, elements.installAppBtn,
        elements.saveModalCloseBtn, elements.cancelModalBtn, elements.startRenderBtn, elements.cancelRenderBtn,
        elements.presetDialogCloseBtn, elements.presetDialogExitBtn,
        ...toggleConfigs.map(c => elements[c.optionId])
    ].filter(Boolean); // Filter out any undefined elements that might not have been found

    interactiveElements.forEach(el => {
        el.addEventListener('pointerdown', controller.handleFirstInteraction.bind(controller), { once: true });
    });

    checkPWA();
    populatePresetDialog(
        controller.handlePresetCardClick.bind(controller),
        controller.handleFirstInteraction.bind(controller)
    );
    syncUIWithState(); // Single call to initialize the UI from state.
}


export function syncUIWithState() {
    // Sliders and labels
    updateLengthLabel(state.sessionLengthMinutes);
    updateIntensityLabel(state.effectsIntensity);
    updateMasterVolumeLabel(state.masterVolume);
    elements.lengthSlider.value = state.sessionLengthMinutes;
    elements.intensitySlider.value = state.effectsIntensity;
    elements.masterVolumeSlider.value = state.masterVolume;
    
    // Toggles
    toggleConfigs.forEach(config => {
        updateToggle(config.stateKey);
    });

    // Play/Pause button
    updatePlayPauseButton();

    // Stage info panel
    updateUIStage();
}

export function checkPWA() {
    if (window.location.protocol === 'file:') {
        elements.installAppBtn.style.display = 'none';
        const p = document.createElement('p');
        p.innerHTML = '<strong>Note:</strong> App installation is not available when running from a local file. Please use a web server (http or https).';
        p.style.color = 'var(--accent)';
        elements.installInstructions.prepend(p);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
         elements.installAppBtn.style.display = 'none';
         elements.installInstructions.style.display = 'none';
    }
}

export function populatePresetDialog(cardClickHandler, firstInteractionHandler) {
    const container = elements.presetCardContainer;
    container.innerHTML = '';
    for (const [key, preset] of Object.entries(PRESETS)) {
        if (key === 'none') continue;

        const card = document.createElement('div');
        card.className = 'preset-card';
        card.dataset.presetName = key;

        const desc = preset.description;
        card.innerHTML = `
            <h3>${desc.title}</h3>
            <p class="details">
                ${desc.shortDesc}<br><br>
                <strong>Effect:</strong> ${desc.effect}<br>
                <strong>Use Cases:</strong> ${desc.useCases}<br>
                <strong>Frequency:</strong> ${desc.freqRange}
            </p>
        `;

        card.addEventListener('click', () => cardClickHandler(key));
        if (firstInteractionHandler) {
            card.addEventListener('pointerdown', firstInteractionHandler, { once: true });
        }
        container.appendChild(card);
    }
}

// --- Modal Functions ---

export function showSaveModal() {
    elements.saveModal.classList.remove('hidden');
    elements.saveModalBackdrop.classList.remove('hidden');
    setRenderMode(false); // Reset to settings view
    updateRenderProgress(0, 'Ready to export.', '');
}

export function hideSaveModal() {
    if (state.isRendering) return; // Prevent closing while rendering
    elements.saveModal.classList.add('hidden');
    elements.saveModalBackdrop.classList.add('hidden');
}

export function showPresetDialog() {
    elements.presetDialog.classList.remove('hidden');
    elements.presetDialogBackdrop.classList.remove('hidden');
}

export function hidePresetDialog() {
    elements.presetDialog.classList.add('hidden');
    elements.presetDialogBackdrop.classList.add('hidden');
}

export function setRenderMode(isRendering) {
    elements.saveSettingsView.classList.toggle('hidden', isRendering);
    elements.saveProgressView.classList.toggle('hidden', !isRendering);
}

export function updateRenderProgress(progress, status, timeText = '') {
    elements.renderProgressBar.style.width = `${Math.min(100, progress)}%`;
    elements.progressStatusText.textContent = status;
    elements.progressTimeText.textContent = timeText;
}

export function showErrorState(message) {
    elements.stageName.textContent = 'Error';
    elements.stageName.classList.add('error-state');
    elements.stageSub.textContent = message;
    elements.progressBar.style.width = '0%';
}

export function disableToggle(optionId) {
    const button = elements[optionId];
    if (button) {
        button.disabled = true;
        button.classList.add('toggle-button-disabled');
        button.title = 'This sound effect failed to load and has been disabled for this session.';
    }
}

// This function is still needed for a specific error case, so it remains exported.
export function disableWorkletFeatures() {
    // This function can be implemented to disable UI elements that depend on the worklet.
    // For example:
    // const isoOption = document.getElementById('isoOption');
    // if (isoOption) {
    //     isoOption.disabled = true;
    //     isoOption.style.opacity = '0.5';
    //     isoOption.title = 'This feature is unavailable because the AudioWorklet could not be loaded.';
    // }
}

export function startProgressAnimationLoop() {
    if (progressAnimationId) return;

    const loop = () => {
        if (!state.isPlaying) {
            progressAnimationId = null;
            return;
        }

        const totalDuration = state.sessionLengthMinutes * 60;
        const progress = totalDuration > 0 ? (state.sessionElapsedTime / totalDuration) * 100 : 0;
        
        if (elements.progressBar) {
            elements.progressBar.style.width = `${Math.min(100, progress)}%`;
        }

        progressAnimationId = requestAnimationFrame(loop);
    };
    progressAnimationId = requestAnimationFrame(loop);
}

export function stopProgressAnimationLoop() {
    if (progressAnimationId) {
        cancelAnimationFrame(progressAnimationId);
    }
    progressAnimationId = null;
}