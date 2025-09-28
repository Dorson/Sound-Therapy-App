# Binaural Beats & Sound Therapy Soundscape Generator

![Binaural Beats & Sound Therapy App Screenshot](icon-pwa-screenshot-1024.jpeg)

**A powerful, offline-first web application for creating immersive soundscapes with binaural beats and ambient sounds. Designed for relaxation, focus, meditation, and sleep enhancement.**

---

## ✨ Features

- **🎧 Immersive Sound Engine:** Utilizes the Web Audio API to generate all sounds procedurally in real-time. No audio files are used.
- ** presets:** Jump right in with curated sessions for Focus, Meditation, Relaxation, Deep Sleep, and more.
- **🎛️ Full Customization:** Adjust session length, effects intensity, and toggle individual soundscape layers to create your perfect ambiance.
- **🔊 Soundscape Layers:** Combine up to 7 distinct audio layers:
  - Isochronic Gating
  - Pink Noise
  - 3D Wind Effect
  - 6 BPM Shamanic Drum
  - Distant Singing Bowl
  - Glymphatic Pulse
  - Falling Brain Pulse
- **⚙️ PWA Ready:** Install the app on your desktop or mobile device for a native-like experience and offline access.
- **💾 Save Your Session:** Export your custom soundscape as a high-quality `.wav` file to listen anywhere.
- **▶️ Media Controls:** Integrates with the Media Session API for lock screen and notification controls.
- **🚀 Zero Dependencies:** Built with pure, modern Vanilla JavaScript, HTML, and CSS. No frameworks, no build steps, no nonsense.

---

## 🚀 How to Use

Headphones are highly recommended for the best experience, especially for the binaural beat effects. Start with a low volume.

1.  **Select a Preset:** Choose a pre-configured session from the dropdown menu that matches your goal (e.g., "Focus", "Deep Sleep").
2.  **Customize (Optional):**
    *   Use the **Session Length** slider to set the duration.
    *   Adjust the **Effects Intensity** slider to control the volume of the ambient layers.
    -   Toggle the **SoundScape Layer Effects** on or off to fine-tune your sound.
3.  **Play:** Press the "Play" button to begin your session.
4.  **Navigate Stages:**
    *   Let the session progress automatically based on the length you set.
    *   Click "Next Stage" to advance manually.

---

## 📦 Installation (Progressive Web App)

Install this application on your device for quick, offline access from your home screen or desktop.

-   **Desktop (Chrome, Edge):** Look for an install icon in the address bar or find the "Install..." option in the browser's main menu (usually under "Save and Share").
-   **iPhone / iPad (Safari):** Tap the "Share" icon, scroll down, and select "Add to Home Screen".
-   **Android (Chrome):** Tap the three-dot menu icon and select "Install app" or "Add to Home screen".

---

## 🧠 Sound Therapy Explained

This app uses a technique called **brainwave entrainment**. By playing two slightly different frequencies in each ear, the brain perceives a third "beat" at the frequency difference between the two. This is the **binaural beat**. Different beat frequencies are associated with different mental states:

-   **Delta (0.5-4 Hz):** Deep, dreamless sleep, restorative processes.
-   **Theta (4-8 Hz):** Deep meditation, REM sleep, creativity.
-   **Alpha (8-12 Hz):** Relaxed awareness, mindfulness, light meditation.
-   **Beta (12-30 Hz):** Active thinking, focus, concentration.
-   **Gamma (30-100 Hz):** High-level cognitive processing, peak awareness.

Each **SoundScape Layer Effect** is designed to complement this process, masking external noise and adding texture to guide your mind. You can read detailed explanations for each effect within the app itself.

---

## 🛠️ Technical Overview

This project is a showcase of modern, framework-free web development.

-   **Architecture:** The codebase is split into a modular architecture using ES6 Modules (`index.js`, `soundEngine.js`, `ui.js`, `presets.js`) to maintain a clean separation of concerns.
-   **Core Technology:** 100% Vanilla JavaScript (ES6+), HTML5, and CSS3.
-   **Audio Generation:** All sound is generated in real-time using the **Web Audio API**. This includes oscillators, gain nodes, filters, stereo panners, and a convolver for reverb. Complex looping sounds like the Shamanic Drum are pre-rendered into an `AudioBuffer` for performance.
-   **Offline First:** Designed to run directly from the file system without needing a web server. All logic is client-side.
-   **AI-Free:** The app relies on carefully curated presets based on established principles of sound therapy, with no generative AI integration.

### How to Run Locally

Since this is a dependency-free project, you can run it without any build steps:

1.  Clone or download the repository.
2.  Open the `index.html` file directly in your web browser.

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.