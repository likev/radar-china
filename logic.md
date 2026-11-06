# Radar Application Core Logic

This document outlines the core meteorological algorithms and visualization logic used in the radar application.

## 1. Radar Reflectivity Difference Map (ΔZ)

To visualize the intensification and decay of storms accurately, the application calculates the pixel-by-pixel difference between two radar frames.

### Why ΔZ instead of ΔdBZ?
Standard radar images are color-coded in `dBZ` (decibels of Z), which is a logarithmic scale. Subtracting logarithmic values distorts the physical reality of raindrop volume changes. A `+10 dBZ` jump from 10 to 20 represents very little water, whereas a `+10 dBZ` jump from 50 to 60 represents explosive, severe hail/raindrop growth.

To fix this, the application mathematically converts the `dBZ` values back into the linear **Reflectivity Factor (Z)**, measured in $mm^6/m^3$, before subtracting them.

### Algorithm
1. **Decode Color to dBZ:** 
   The RGBA value of each pixel is mapped to its `dBZ` value (10 to 75). Because radar images often suffer from JPEG compression artifacts or antialiasing, a pixel's RGB color rarely matches the standard palette exactly. 
   - We use a **Weighted Euclidean Distance** formula prioritizing the green channel (which human eyes are most sensitive to):
     $$ \text{Distance} = 2 \Delta R^2 + 4 \Delta G^2 + 3 \Delta B^2 $$
   - We find the `dBZ` value of the palette color with the minimum distance to the current pixel.
   - **Noise Threshold:** If the closest palette color has a distance $> 3500$, the pixel is rejected as "not a radar echo" (e.g., map boundaries, coastlines, background).
   - This mapping is cached in a Fast Lookup Table (`colorLUT`) for performance.
2. **Convert to Z:** 
   $$ Z = 10^{(dBZ / 10)} $$
3. **Calculate Difference:**
   $$ \Delta Z = Z_{current} - Z_{previous} $$
4. **Color Mapping:** The resulting $\Delta Z$ is mapped to a high-contrast Material Neon palette based on its logarithmic magnitude:
   - **Mild Change ($10^2 \sim 10^3$ Z):** Yellow (+), Cyan (-)
   - **Moderate Change ($10^3 \sim 10^4$ Z):** Orange (+), Blue (-)
   - **Severe Change ($\ge 10^4$ Z):** Magenta (+), Purple (-)
   
   *Note: Changes with $|\Delta Z| < 100$ are completely ignored to filter out low-intensity edge advection noise, keeping the map clean.*

---

## 2. Severe Storm Core Tracking (Bounding Boxes)

To help users instantly spot the most dangerous parts of a storm, the application draws localized, pulsing bounding boxes around extreme weather cores ($\ge 50$ dBZ).

### Algorithm: Localized Greedy Spatial Clustering
A naïve Breadth-First Search (BFS) would group an entire 200km continuous squall line into a single massive, imprecise rectangular box. To track individual storm cells tightly, we use a distance-constrained greedy clustering algorithm:

1. **Thresholding:** We iterate over the radar grid with a stride of 2x2 to save CPU cycles, looking only for pixels where `dBZ >= 50`.
2. **Greedy Expansion:** For each hot pixel $(x, y)$, we check the existing list of bounding boxes.
3. **Distance Check:** We calculate the distance from the pixel to the nearest edge of the box. If it is within `MAX_DIST = 20px`, it is a candidate for that box.
4. **Size Constraint:** Before expanding the box to include the pixel, we check if the new dimensions would exceed `MAX_SIZE = 30px`. 
   - If it fits, the pixel is absorbed, and the box expands.
   - If it exceeds the maximum size, the pixel is rejected by this box, naturally spawning a *new* bounding box adjacent to the old one.
5. **Noise Filtering:** Any resulting bounding box that absorbed fewer than 4 pixels is discarded as random noise.

This algorithm perfectly tessellates massive, elongated squall lines into a neat sequence of individual 30x30 tracking boxes, providing tight, precise tracking of severe cores.

### GPU Optimization & Conditional Pulse Animation
To prevent high GPU usage while maintaining a dynamic visual effect, the pulse animation is carefully optimized:
1. **Throttled Framerate (5 FPS)**: Instead of smooth 60 FPS interpolation, we use the CSS timing function `steps(10)` over a 2-second animation duration:
   ```css
   animation: pulseBox 2s steps(10) infinite;
   ```
   This limits the GPU rendering/compositing calculations of the `drop-shadow` filter to just 5 updates per second, allowing the hardware to enter idle power states between updates.
2. **Conditional Playback Toggle**:
   - **Playback Active (`state.isPlaying = true`)**: The `.pulse-active` class is removed, disabling the pulse animation completely. The fast-switching frames naturally create movement, making the pulse effect redundant and saving substantial GPU processing power.
   - **Playback Paused (`state.isPlaying = false`)**: The `.pulse-active` class is added back, running the throttled pulse animation to focus visual attention on the static severe cores during manual stepping (via `prev`/`next` buttons or timeline selection).

---

## 3. Project Architecture & Build Workflow

The application follows a modular, single-responsibility ES6 architecture compiled and bundled with Vite.

### 📦 Standard Vite Bundling & Build Workflow
- **Standard Vite Entry Point**:
  - `index.html`: Standard Vite source entry point at the project root containing layout, metadata, and `<script type="module" src="/src/js/main.js"></script>`.
- **Standard Production Build (`dist/`)**:
  - `npm run build` compiles code and assets into the standard `dist/` directory.
  - Automated asset hashing (`assets/index-[hash].js`, `assets/index-[hash].css`) provides built-in browser cache-busting on updates.
  - Static assets in `public/` are served at root in dev mode and automatically copied to `dist/` upon build.

---

### 📄 Root Configuration & Templates
- **`index.html`**: Root HTML source containing application layout, sidebar controls, overlay player modal, and development ES6 entry point.
- **`vite.config.js`**: Standard Vite configuration with relative base path (`./`).
- **`package.json`**: Project manifest containing build scripts (`npm run dev`, `npm run build`, `npm run preview`) and devDependencies.
- **`logic.md`**: Technical documentation detailing physical equations, spatial clustering, Vite bundling, and file structure.
- **`package.json`**: Project manifest containing build scripts (`npm run dev`, `npm run build`, `npm run preview`) and devDependencies.
- **`logic.md`**: Technical documentation detailing physical equations, spatial clustering, Vite bundling, and file structure.

---

### 📁 Static Assets (`public/`)
- **`public/gif.js` / `public/gif.worker.js`**: Third-party worker library used for client-side multi-frame GIF animation rendering and export.
- **`public/jquery.tools.overlay.min.js`**: Static third-party overlay helper script.

---

### 🎨 CSS Modules (`src/css/`)
- **`src/css/base.css`**: Defines global HSL CSS variables, dark-mode design system resets, main grid layout (`.app-main`), header status bar, and responsive map scaling for `#country`.
- **`src/css/map.css`**: Absolute positioning, clipping rectangles, hover glow effects, and labels for all 7 national radar region tiles.
- **`src/css/controls_form.css`**: Styles for the footer control dashboard, datetime text pickers, navigation buttons, and custom iOS-style toggle switches.
- **`src/css/overlay.css`**: Full-screen modal overlay container, media viewport bounds, floating zoom action buttons, and loading spinner animation.
- **`src/css/split.css`**: Layout styles for Split-Screen mode, Diff-Only mode, mode selection toolbar, and mobile portrait vertical layout adjustments.
- **`src/css/timeline.css`**: Timeline progress bar, tick marks, frame playback buttons, and difference legend overlays.

---

### ⚡ JavaScript ES6 Modules (`src/js/`)
- **`src/js/main.js`**: Entry point. Imports all modular CSS stylesheets and boots up `init()` on `DOMContentLoaded`.
- **`src/js/state.js`**: Centralized application state (`radarTime`, `autoUpdate`, `isManualTime`, `scale`, `imageIndex`, etc.), shared memory caches (`dbzGridCache`, `colorLUT`), and `initElements()` DOM dictionary.
- **`src/js/config.js`**: Meteorological lookup tables (`DBZ_PALETTE`, `DIFF_COLORS`, `partsMap`) and cache management utilities (`enforceCacheLimit`).
- **`src/js/utils.js`**: Date parsing/formatting (`parse_datetime`, `format_datetime2`), NMC/Tianqitu time-aware map loader (`updateOverviewMap`), and time sync helper (`updateTime`).
- **`src/js/diff.js`**: Converts `dBZ` to linear Reflectivity Factor `Z`, performs pixel-by-pixel frame subtraction, and renders the high-contrast difference canvas (`renderDiffCanvas`).
- **`src/js/tracking.js`**: Implements the localized greedy spatial clustering algorithm (`updateBoxCanvas`) to draw 30x30 pulsing severe storm bounding boxes over $\ge 50$ dBZ cores.
- **`src/js/preload.js`**: Handles background multi-frame image preloading (`preloadAllFrames`), missing 404 frame interpolation (`interpolateMissingFrame`), and client-side GIF export (`exportLoopToGif`).
- **`src/js/player.js`**: Manages animation frame playback (`play`, `pause`, `advanceFrame`), layout sync math (`syncTransformForLayoutChange`), zoom matrix calculations, and timeline tick updates.
- **`src/js/gestures.js`**: Implements interactive viewport panning, cursor-centered mouse wheel zoom, dual-finger pinch-to-zoom, and synchronized dual-cursor crosshairs.
- **`src/js/ui.js`**: Handles all DOM event listeners, region selector clicks, mode toggles, manual time navigation buttons (View, Back, Forward), keyboard shortcuts (Space, Left/Right Arrows), and auto-update interval scheduling.

---

## 4. Keyboard Shortcuts

The application provides intuitive keyboard shortcuts when viewing radar loops in the modal window (`#large-overlay`):

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **`Space`** | Loop Window Active | Toggle Play / Pause (`play()` / `pause()`) |
| **`←` (Left Arrow)** | Loop Window Active | Pause playback and step 1 frame **backward** |
| **`→` (Right Arrow)** | Loop Window Active | Pause playback and step 1 frame **forward** |
| **`1` ~ `5`** | Loop Window Active (Picker Closed) | Select **1 ~ 5 Hour** loop period duration |
| **`/`** (Slash) | Loop Window Active | Open / Close Quick **Region Selector Modal** |
| **`1` ~ `7`** | Region Picker Modal Open | Instantly switch to Region 1~7 (西北, 华北, 东北, 西南, 华中, 华东, 华南) |

*Note: Keyboard shortcuts automatically suppress default page scrolling and are disabled while focused inside text input elements (`<input>`, `<textarea>`).*
