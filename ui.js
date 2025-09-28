// This module contains UI elements and functions to update the UI.
export const ui = {};

export function updateUIStage(app) {
    const idx = app.state.currentStage;
    if (idx < 0) {
        app.ui.stageName.textContent = 'Idle • Ready';
        app.ui.stageSub.textContent = 'Manual step or Auto-play available';
        app.ui.progressBar.style.width = '0%';
    } else {
        app.ui.stageName.textContent = app.state.STAGES[idx].name;
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
