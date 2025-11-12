let singingBowlWavetable = null;

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
