# Virtual Office Experiment (CS464)

A browser-based within-subjects study comparing a **2D desktop** with a **VR office** (Meta Quest 2, WebXR + Three.js).
Following `VR_Desktop_Experiment_Design_Document.md`, both conditions run the **same Three.js scene, tasks, timing and logging**. The only thing that differs is the input: a mouse ray on the desktop, and a controller ray in VR.

## Run it

```bash
npm install
npm run dev
```

Vite prints a `Local` URL and a `Network` URL. Both use HTTPS with a self-signed certificate, because WebXR requires HTTPS.

| Page | URL | Purpose |
|---|---|---|
| Launcher | `https://localhost:5173/` | Participant ID, starting condition, questionnaires, export |
| Desktop block | `/desktop.html?pid=P01&set=A&order=1` | Mouse |
| VR block | `/vr.html?pid=P01&set=B&order=2` | Quest 2 controllers |

Opening a block page with no parameters runs participant `P00` (dev/testing) with layout set A.

**Test mode:** tick *Test mode* on the launcher, or add `&test=1` to a block URL, to get a **Skip (test)** button on every trial. It works before or during a trial. Skipped trials are not logged. `P00` always has it. Turn test mode off for real participants: the block page shows `TEST MODE` in its corner label when it's on.

### On the Quest 2
1. Put the laptop and the Quest on the same Wi-Fi network.
2. In the Quest Browser, open the **Network** URL, for example `https://192.168.1.20:5173/`, and accept the certificate warning.
3. Set the participant on the launcher, open the VR link, and press **Enter VR**. The workspace auto-centres in front of you; use **Recenter** on the instruction bar if needed.

If the Quest can't reach the laptop (campus Wi-Fi often blocks this), use the GitHub Pages build below.

### GitHub Pages (HTTPS hosting for the Quest)
Every push to `main` builds the app and publishes it through `.github/workflows/deploy.yml`.
- One-time setup: in the GitHub repo, go to **Settings → Pages → Source: GitHub Actions**.
- The app is then at `https://<user>.github.io/<repo>/`. Open it in the Quest Browser; no certificate warning.
- Data is still saved per device (`localStorage`), so export the CSV from each device as usual.

### Without a headset
`vr.html` works with the mouse outside VR: click and drag items as on the desktop page. **Drag on empty space (or right-drag anywhere) to turn your head.** `desktop.html` keeps a fixed view on purpose, since it represents a monitor. For controller testing, use Meta's **Immersive Web Emulator** extension.

## Scene (metres)
- Seated origin `(0,0,0)`, desk surface at `y = 0.75`.
- Workspace plane 1.3 × 0.8 m, centred at eye level `y = 1.25`, `z = -0.9`. The instruction bar (HUD) runs across its top.
- Desktop view: a fixed camera at eye height, framed so the workspace fills the browser window.
- Ambient light 0.6 + directional light 0.8. The UI uses `MeshBasicMaterial`, with canvas-textured planes for text.

## Controls
| | Desktop | Quest 2 |
|---|---|---|
| Point | Mouse | Controller ray (thin beam + reticle dot) |
| Select / drag | Left button | **Trigger** (either hand) |
| Secondary grab | n/a | **Grip** (same as trigger) |
| Feedback | Highlight, colour flash | Same, plus haptics (pickup, snap, error) |

## Session flow
1. Launcher: enter the participant ID (`P01`–`P06`). The order is counterbalanced automatically: P01 desktop/A→VR/B, P02 VR/A→desktop/B, P03 desktop/B→VR/A, P04 VR/B→desktop/A, and then the cycle repeats. You can override the **starting condition** on the launcher.
2. Pre-study questionnaire (technology/VR familiarity).
3. **Block 1.** Each task gets 1 unscored practice trial followed by 3 scored trials: Selection, Drag & Drop, Arrange & Resize, then Document Reading (16 trials, 12 scored). Each trial shows its instructions first; the timer starts when the participant presses **Start**.
4. Intermission: post-condition questionnaire (SUS + discomfort). Remove the headset and take a break.
5. **Block 2** in the other condition, using the other layout set.
6. When a block finishes, that participant's CSV for the block downloads automatically: right away on desktop, or when VR is exited.

Layout set B is set A mirrored left-to-right, with different file names and folder labels. That keeps movement distances and difficulty equivalent without the two sets being identical.

## Tasks and errors
| Task | Goal | Success | Error (+1) |
|---|---|---|---|
| Selection | Click the named file among 15 icons (15 × 15 cm) | Correct icon selected | Selecting a wrong icon (the trial continues) |
| Drag & Drop | Drag the document into the named folder | Released overlapping the target folder most | Released on a distractor folder or empty space; the document returns to its start position |
| Arrange & Resize | Move the window by its title bar and resize it from **any corner or edge** (the opposite side stays put) to match the ghost outline, then press **Submit** | Centre offset ≤ 3 cm **and** width/height within 5% | Pressing Submit while outside tolerance |
| Document Reading (from the first version) | Read 1–2 documents in the viewer windows, pick the answer in the Answer Panel, then press **Submit** | The submitted answer is correct | Changing an already-selected answer, or Submit with no answer |

A trial that isn't completed within **120 s** is logged with `task_success = false`. Practice trials are never logged.

## Data
Each scored trial is written to `localStorage` as soon as it ends:

```
participant_id,condition,task_type,trial_index,start_time_iso,completion_time_sec,error_count,final_tolerance_offset,task_success,task_set,order_index,final_size_error_pct,selected_choice
```

- `condition`: `desktop` or `vr_quest2`
- `completion_time_sec`: from Start until success or timeout (3 dp)
- `final_tolerance_offset`: centre distance error in metres (Arrange & Resize only)
- `final_size_error_pct`: the larger of the width and height errors, in % (Arrange & Resize only)
- `selected_choice`: the submitted answer id (Document Reading only)

**Data is stored per device.** Export from the PC and from the Quest (launcher → Download results CSV), then combine the files.

## Project layout
```
index.html, desktop.html, vr.html   pages (Vite multi-page build)
src/app.js            main loop shared by both conditions
src/core/config.js    dimensions, tolerances, timeout, colours
src/core/scene.js     renderer, camera, lights, desk, workspace plane
src/core/input.js     InputManager (mouse + WebXR controllers, haptics)
src/core/windows.js   WindowManager (icons, document, folders, resizable window, ghost, HUD)
src/core/tasks.js     TaskManager (trial states, rules, scoring, logging)
src/core/trials.js    layout sets A/B
src/core/reading/     Document Reading content for sets A/B (from the first version)
src/shared/           logger.js (localStorage + CSV), session.js (IDs, counterbalancing)
src/ui/               questionnaires (pre-study, SUS + discomfort)
_old/                 previous document-reading version (not built)
```
