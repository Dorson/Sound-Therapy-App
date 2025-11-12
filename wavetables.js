let singingBowlWavetable = null;
let dmtCarrierWavetable = null;

async function createSingingBowlWavetable() {
    // Use a short duration and high sample rate for a high-quality wavetable
    const sampleRate = 44100;
    const duration = 4096 / sampleRate; // Length for a standard wavetable size
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, duration * sampleRate, sampleRate);
    
    const partials = [{ f: 1, g: 1.0 }, { f: 2.005, g: 0.7 }, { f: 3.42, g: 0.55 }, { f: 4.0, g: 0.25 }, { f: 5.71, g: 0.35 }];
    const fundamental = 90;

    // We don't need LFOs for a static wavetable, just the core timbre.
    // The LFOs for vibrato would create a non-loopable waveform if rendered short.
    // The character comes from the sum of harmonics.
    for (const p of partials) {
        const osc = offlineCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = fundamental * p.f;
        const partialGain = offlineCtx.createGain();
        partialGain.gain.value = p.g;
        osc.connect(partialGain).connect(offlineCtx.destination);
        osc.start(0);
    }

    return await offlineCtx.startRendering();
}

/**
 * Creates a normalized wavetable from a sine wave with added harmonics.
 * This is a shared utility function.
 * @param {number} size The size of the wavetable array.
 * @param {Array<Object>} harmonics An array of harmonic objects {amp, freq}.
 * @returns {AudioBuffer} The rendered AudioBuffer containing the wavetable.
 */
async function createWavetableFromHarmonics(size, harmonics) {
    const sampleRate = 44100;
    const duration = size / sampleRate;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, duration * sampleRate, sampleRate);
    const fundamental = 1; // We render at 1Hz and let the oscillator transpose it.

    // Normalize amplitudes to prevent clipping during rendering
    const totalAmp = harmonics.reduce((sum, h) => sum + h.amp, 0);
    const scalingFactor = totalAmp > 1.0 ? 1.0 / totalAmp : 1.0;

    for (const h of harmonics) {
        const osc = offlineCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = fundamental * h.freq;
        const partialGain = offlineCtx.createGain();
        partialGain.gain.value = h.amp * scalingFactor;
        osc.connect(partialGain).connect(offlineCtx.destination);
        osc.start(0);
    }
    
    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
}


export async function getSingingBowlWavetable() {
    if (!singingBowlWavetable) {
        try {
            singingBowlWavetable = await createSingingBowlWavetable();
        } catch (e) {
            console.error("Failed to create singing bowl wavetable", e);
            return null;
        }
    }
    return singingBowlWavetable;
}


export async function getDmtCarrierWavetable() {
    if (!dmtCarrierWavetable) {
        try {
            // Design a wavetable with a complex, "buzzing" or "vibrational" quality
            // by using a fundamental, a slightly sharp fifth, and a subharmonic.
            const harmonics = [
                { amp: 1.0, freq: 1.0 },      // Fundamental
                { amp: 0.5, freq: 1.505 },    // Slightly sharp fifth for tension
                { amp: 0.2, freq: 0.498 },    // Subharmonic for depth
                { amp: 0.1, freq: 3.01 }      // High, slightly detuned harmonic
            ];
            const renderedBuffer = await createWavetableFromHarmonics(4096, harmonics);
            dmtCarrierWavetable = renderedBuffer.getChannelData(0); // Store just the Float32Array
        } catch (e) {
            console.error("Failed to create DMT carrier wavetable", e);
            return null;
        }
    }
    return dmtCarrierWavetable;
}
