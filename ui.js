import { state } from './state.js';
import { PRESETS, toggleConfigs, config } from './presets.js';

export const ui = {};

function queryElements() {
    ui.playPauseBtn = document.getElementById('playPauseBtn');
    ui.playIcon = document.getElementById('playIcon');
    ui.playPauseLabel = document.getElementById('playPauseLabel');
    ui.prevStageBtn = document.getElementById('prevStageBtn');
    ui.nextStageBtn = document.getElementById('nextStageBtn');
    ui.saveAudioBtn = document.getElementById('saveAudioBtn');
    ui.lengthSlider = document.getElementById('lengthSlider');
    ui.intensitySlider = document.getElementById('intensity');
    ui.masterVolumeSlider = document.getElementById('masterVolumeSlider');
    ui.volLabel = document.getElementById('volLabel');
    ui.lenLabel = document.getElementById('lenLabel');
    ui.intLabel = document.getElementById('intLabel');
    ui.stageName = document.getElementById('stageName');
    ui.stageSub = document.getElementById('stageSub');
    ui.progressBar = document.getElementById('progressBar');
    ui.openPresetDialogBtn = document.getElementById('openPresetDialogBtn');
    ui.installAppBtn = document.getElementById('installAppBtn');
    ui.installInstructions = document.getElementById('install-instructions');
    
    ui.saveModal = document.getElementById('saveModal');
    ui.saveModalBackdrop = document.getElementById('saveModalBackdrop');
    ui.saveModalCloseBtn = document.getElementById('saveModalCloseBtn');
    ui.saveSettingsView = document.getElementById('saveSettingsView');
    ui.saveProgressView = document.getElementById('saveProgressView');
    ui.formatSelector = document.getElementById('formatSelector');
    ui.formatInfo = document.getElementById('formatInfo');
    ui.startRenderBtn = document.getElementById('startRenderBtn');
    ui.cancelModalBtn = document.getElementById('cancelModalBtn');
    ui.progressStatusText = document.getElementById('progressStatusText');
    ui.renderProgressBar = document.getElementById('renderProgressBar');
    ui.progressTimeText = document.getElementById('progressTimeText');
    ui.cancelRenderBtn = document.getElementById('cancelRenderBtn');

    ui.presetDialog = document.getElementById('presetDialog');
    ui.presetDialogBackdrop = document.getElementById('presetDialogBackdrop');
    ui.presetDialogCloseBtn = document.getElementById('presetDialogCloseBtn');
    ui.presetDialogExitBtn = document.getElementById('presetDialogExitBtn');
    ui.presetCardContainer = document.getElementById('presetCardContainer');

    toggleConfigs.forEach(config => {
        ui[config.optionId] = document.getElementById(config.optionId);
        ui[config.chkId] = document.getElementById(config.chkId);
    });
}

export function init(controller) {
    queryElements();

    ui.playPauseBtn.addEventListener('click', controller.handlePlayPause.bind(controller));
    ui.prevStageBtn.addEventListener('click', controller.goToPreviousStage.bind(controller));
    ui.nextStageBtn.addEventListener('click', controller.goToNextStage.bind(controller));
    ui.lengthSlider.addEventListener('input', controller.debounce(e => controller.handleLengthChange(e.target.value), 50));
    ui.intensitySlider.addEventListener('input', controller.debounce((e) => controller.handleIntensityChange(e.target.value), 50));
    ui.masterVolumeSlider.addEventListener('input', controller.debounce((e) => controller.handleMasterVolumeChange(e.target.value), 50));
    
    toggleConfigs.forEach(config => {
        ui[config.optionId].addEventListener('click', controller.debounce(() => {
            controller.handleToggle(config.stateKey, config.nodeKey);
        }, 50));
    });

    ui.saveAudioBtn.addEventListener('click', () => showSaveModal());
    ui.saveModalCloseBtn.addEventListener('click', () => hideSaveModal());
    ui.cancelModalBtn.addEventListener('click', () => hideSaveModal());
    ui.saveModalBackdrop.addEventListener('click', () => hideSaveModal());
    ui.startRenderBtn.addEventListener('click', controller.startAudioRender.bind(controller));
    ui.formatSelector.addEventListener('change', () => updateFormatInfo());
    ui.cancelRenderBtn.addEventListener('click', () => {
        state.renderProcess.cancel = true;
        updateRenderProgress(state.renderProcess.progress, 'Cancellation requested. Finishing render step...', '');
    });

    ui.openPresetDialogBtn.addEventListener('click', () => showPresetDialog());
    ui.presetDialogCloseBtn.addEventListener('click', () => hidePresetDialog());
    ui.presetDialogExitBtn.addEventListener('click', () => hidePresetDialog());
    ui.presetDialogBackdrop.addEventListener('click', () => hidePresetDialog());
    
    checkPWA();
    checkSupportedFormats();
    populatePresetDialog(controller.handlePresetCardClick.bind(controller));
    initUIState();
}


export function updateUIStage(idx, stages, activePreset) {
    if (idx < 0) {
        ui.stageName.textContent = 'Idle • Ready';
        ui.stageSub.textContent = 'Select a therapy to begin';
        ui.progressBar.style.width = '0%';
    } else {
        const presetName = (activePreset !== 'none' && PRESETS[activePreset])
            ? PRESETS[activePreset].description.title 
            : 'Custom';

        ui.stageName.textContent = `${presetName} • ${stages[idx].name}`;
        ui.stageSub.textContent = `Stage ${idx + 1} of ${stages.length}`;
        const progress = ((idx + 1) / stages.length) * 100;
        ui.progressBar.style.width = `${progress}%`;
    }
}

export function updatePlayPauseButton() {
    if (!state.isPlaying) {
        ui.playIcon.className = 'play-icon';
        ui.playPauseLabel.textContent = 'Play';
    } else {
        ui.playIcon.className = 'pause-icon';
        ui.playPauseLabel.textContent = 'Pause';
    }
}

export function toggleCheckmark(button, checkmark, isEnabled) {
    button.setAttribute('aria-checked', isEnabled);
    checkmark.classList.toggle('bg-accent', isEnabled);
    checkmark.classList.toggle('bg-black', !isEnabled);
}

export function updateToggle(stateKey) {
    const config = toggleConfigs.find(c => c.stateKey === stateKey);
    if(config) {
        toggleCheckmark(ui[config.optionId], ui[config.chkId], state[stateKey]);
    }
}

export function initUIState() {
    updateLengthLabel(state.sessionLengthMinutes);
    updateIntensityLabel(state.effectsIntensity);
    updateMasterVolumeLabel(state.masterVolume);
    ui.lengthSlider.value = state.sessionLengthMinutes;
    ui.intensitySlider.value = state.effectsIntensity;
    ui.masterVolumeSlider.value = state.masterVolume;
    toggleConfigs.forEach(config => {
        updateToggle(config.stateKey);
    });
}

export function updateLengthLabel(value) {
    ui.lenLabel.textContent = value;
}

export function updateIntensityLabel(value) {
    ui.intLabel.textContent = value;
}

export function updateMasterVolumeLabel(value) {
    ui.volLabel.textContent = value;
}

export function updatePresetUI(preset) {
    const toggles = preset.toggles;
    toggleConfigs.forEach(config => {
       state[config.stateKey] = !!toggles[config.nodeKey];
       updateToggle(config.stateKey);
    });
   
    state.effectsIntensity = preset.intensity;
    ui.intensitySlider.value = preset.intensity;
    updateIntensityLabel(preset.intensity);
}

export function checkPWA() {
    if (window.location.protocol === 'file:') {
        ui.installAppBtn.style.display = 'none';
        const p = document.createElement('p');
        p.innerHTML = '<strong>Note:</strong> App installation is not available when running from a local file. Please use a web server (http or https).';
        p.style.color = 'var(--accent)';
        ui.installInstructions.prepend(p);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
         ui.installAppBtn.style.display = 'none';
         ui.installInstructions.style.display = 'none';
    }
}

export function checkSupportedFormats() {
    const selector = ui.formatSelector;
    if (!selector || !('MediaRecorder' in window)) return;

    const options = Array.from(selector.options);
    options.forEach(option => {
        const mimeType = option.value;
        if (mimeType !== 'audio/wav' && !MediaRecorder.isTypeSupported(mimeType)) {
            option.remove();
        }
    });
}

export function populatePresetDialog(cardClickHandler) {
    const container = ui.presetCardContainer;
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
        container.appendChild(card);
    }
}

// --- Modal Functions ---

export function updateFormatInfo() {
    const selectedOption = ui.formatSelector.options[ui.formatSelector.selectedIndex];
    const bitrate = selectedOption.dataset.bitrate;

    if (bitrate) {
        const kbps = parseInt(bitrate, 10) / 1000;
        ui.formatInfo.textContent = `${kbps} kbps bitrate. High-quality compressed format for smaller files.`;
    } else {
        ui.formatInfo.textContent = 'Uncompressed, lossless format. Largest file size.';
    }
}

export function showSaveModal() {
    ui.saveModal.classList.remove('hidden');
    ui.saveModalBackdrop.classList.remove('hidden');
    updateFormatInfo();
    setRenderMode(false); // Reset to settings view
    updateRenderProgress(0, 'Ready to export.', '');
}

export function hideSaveModal() {
    if (state.isRendering) return; // Prevent closing while rendering
    ui.saveModal.classList.add('hidden');
    ui.saveModalBackdrop.classList.add('hidden');
}

export function showPresetDialog() {
    ui.presetDialog.classList.remove('hidden');
    ui.presetDialogBackdrop.classList.remove('hidden');
}

export function hidePresetDialog() {
    ui.presetDialog.classList.add('hidden');
    ui.presetDialogBackdrop.classList.add('hidden');
}

export function setRenderMode(isRendering) {
    ui.saveSettingsView.classList.toggle('hidden', isRendering);
    ui.saveProgressView.classList.toggle('hidden', !isRendering);
}

export function updateRenderProgress(progress, status, timeText = '') {
    ui.renderProgressBar.style.width = `${Math.min(100, progress)}%`;
    ui.progressStatusText.textContent = status;
    ui.progressTimeText.textContent = timeText;
}