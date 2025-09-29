// This module contains UI elements and functions to update the UI.
export const ui = {};

export function updateUIStage(app) {
    const idx = app.state.currentStage;
    if (idx < 0) {
        app.ui.stageName.textContent = 'Idle • Ready';
        app.ui.stageSub.textContent = 'Select a therapy to begin';
        app.ui.progressBar.style.width = '0%';
    } else {
        const presetKey = app.state.activePreset;
        const presetName = (presetKey !== 'none' && app.PRESETS[presetKey])
            ? app.PRESETS[presetKey].description.title 
            : 'Custom';

        app.ui.stageName.textContent = `${presetName} • ${app.state.STAGES[idx].name}`;
        app.ui.stageSub.textContent = `Stage ${idx + 1} of ${app.state.STAGES.length}`;
        const progress = ((idx + 1) / app.state.STAGES.length) * 100;
        app.ui.progressBar.style.width = `${progress}%`;
    }
}

export function updatePlayPauseButton(app) {
    const isPlaying = app.state.isPlaying;
    if (!isPlaying) {
        app.ui.playIcon.className = 'play-icon';
        app.ui.playPauseLabel.textContent = 'Play';
    } else {
        app.ui.playIcon.className = 'pause-icon';
        app.ui.playPauseLabel.textContent = 'Pause';
    }
}

export function toggleCheckmark(button, checkmark, isEnabled) {
    button.setAttribute('aria-checked', isEnabled);
    checkmark.classList.toggle('bg-accent', isEnabled);
    checkmark.classList.toggle('bg-black', !isEnabled);
}

export function initUIState(app) {
    app.toggleConfigs.forEach(config => {
        toggleCheckmark(app.ui[config.optionId], app.ui[config.chkId], app.state[config.stateKey]);
    });
}

export function updatePresetUI(app, preset) {
    app.state.activePreset = Object.keys(app.PRESETS).find(key => app.PRESETS[key] === preset);
    const toggles = preset.toggles;
    app.toggleConfigs.forEach(config => {
       app.state[config.stateKey] = !!toggles[config.nodeKey];
    });
   
    initUIState(app);
    app.ui.intensitySlider.value = preset.intensity;
    app.ui.intLabel.textContent = preset.intensity;
}

export function checkPWA(app) {
    if (window.location.protocol === 'file:') {
        app.ui.installAppBtn.style.display = 'none';
        const p = document.createElement('p');
        p.innerHTML = '<strong>Note:</strong> App installation is not available when running from a local file. Please use a web server (http or https).';
        p.style.color = 'var(--accent)';
        app.ui.installInstructions.prepend(p);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
         app.ui.installAppBtn.style.display = 'none';
         app.ui.installInstructions.style.display = 'none';
    }
}

// --- Modal Functions ---

export function updateFormatInfo(app) {
    const selector = app.ui.formatSelector;
    const infoEl = app.ui.formatInfo;
    const selectedOption = selector.options[selector.selectedIndex];
    const bitrate = selectedOption.dataset.bitrate;

    if (bitrate) {
        const kbps = parseInt(bitrate, 10) / 1000;
        infoEl.textContent = `${kbps} kbps bitrate. High-quality compressed format for smaller files.`;
    } else {
        infoEl.textContent = 'Uncompressed, lossless format. Largest file size.';
    }
}

export function showSaveModal(app) {
    app.ui.saveModal.classList.remove('hidden');
    app.ui.saveModalBackdrop.classList.remove('hidden');
    updateFormatInfo(app);
    setRenderMode(app, false); // Reset to settings view
    updateRenderProgress(app, 0, 'Ready to export.', '');
}

export function hideSaveModal(app) {
    if (app.state.isRendering) return; // Prevent closing while rendering
    app.ui.saveModal.classList.add('hidden');
    app.ui.saveModalBackdrop.classList.add('hidden');
}

export function showPresetDialog(app) {
    app.ui.presetDialog.classList.remove('hidden');
    app.ui.presetDialogBackdrop.classList.remove('hidden');
}

export function hidePresetDialog(app) {
    app.ui.presetDialog.classList.add('hidden');
    app.ui.presetDialogBackdrop.classList.add('hidden');
}

export function setRenderMode(app, isRendering) {
    app.ui.saveSettingsView.classList.toggle('hidden', isRendering);
    app.ui.saveProgressView.classList.toggle('hidden', !isRendering);
}

export function updateRenderProgress(app, progress, status, timeText = '') {
    app.ui.renderProgressBar.style.width = `${Math.min(100, progress)}%`;
    app.ui.progressStatusText.textContent = status;
    app.ui.progressTimeText.textContent = timeText;
}