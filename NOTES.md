# Dev Notes: Virtual Office Experiment

Working notes; not part of the app. Interim deadline: **Fri Nov 6, 2026**.

## Status (Nov 3): revamped to match the design doc
**Built**
- [x] Tasks follow `VR_Desktop_Experiment_Design_Document.md`: Selection, Drag & Drop, and Arrange & Resize, each with 1 practice + 3 scored trials per block.
- [x] One shared Three.js scene for both conditions. InputManager (mouse / controller ray + haptics), WindowManager, TaskManager, Logger.
- [x] New CSV schema from the doc (localStorage key `vo_results_v2`). Per-participant CSV auto-downloads at the end of a block.
- [x] Launcher: starting-condition override; conditions are now `desktop` / `vr_quest2`.
- [x] Old document-reading version moved to `_old/` (not built).

**Tested (Nov 3)**
- [x] `npm run build` passes.
- [x] Headless check: layouts stay inside the workspace, sets A/B mirror each other, tolerance math is correct.
- [x] Headless Chrome run of a full desktop block driven by scripted mouse input: 9 rows logged, practice excluded, error counts correct for each task type.
- [ ] Immersive Web Emulator run through `vr.html`
- [ ] Physical Quest 2 test

## Status (Nov 1, old version)
**Built**
- [x] Vite multi-page setup: `index.html` (launcher), `desktop.html` (2D), `vr.html` (VR). HTTPS dev server reachable on the LAN.
- [x] Shared experiment controller: Start → timer → answer → Submit. Scoring, error counting and document-switch counts are identical in both conditions.
- [x] Logger: each task result is saved to localStorage when it's submitted. CSV export for results and questionnaires.
- [x] Counterbalancing: P01 2D/A→VR/B, P02 VR/A→2D/B, P03 2D/B→VR/A, P04 VR/B→2D/A, repeating.
- [x] Task sets A and B: practice task plus retrieval, multi-window and comparison tasks, matched in difficulty.
- [x] 2D condition: draggable Task / Document Viewer ×1–2 / Answer windows.
- [x] VR condition: floating canvas-textured panels in an arc, controller ray hover, trigger select, grip to move windows. Closer / Farther / Recenter buttons, mouse fallback without a headset.
- [x] Launcher: participant ID, pre-study familiarity questionnaire, post-condition SUS + discomfort, export and clear.

**Tested**
- [x] `npm run build` passes.
- [x] Headless test of the controller logic: scoring, error counts, and practice task excluded from the results.
- [x] Basic manual runs on the laptop (Andrew): it looks good.
- [ ] Immersive Web Emulator run through `vr.html`
- [ ] Physical Quest 2 test

## Quest 2 test checklist (Nov 4)
- [ ] The Quest Browser loads the Network URL (`https://<laptop-IP>:5173`) and the certificate can be accepted.
- [ ] **Enter VR** works, and panels appear in front of a seated user (auto-recenter).
- [ ] Both controllers show a ray and a reticle. Hover highlights items, and the trigger selects and drags.
- [ ] Grip also grabs and drags (secondary).
- [ ] Icon labels and HUD text are readable at 0.9 m. If not, adjust font sizes in `src/core/windows.js` or move the workspace (`WORKSPACE.z` in `config.js`).
- [ ] **Is the 3 cm / 5% Arrange tolerance achievable with the ray?** If not, discuss loosening it in `config.js` (`ARRANGE.posTol`, `sizeTol`).
- [ ] The Recenter button puts the workspace straight ahead at eye level.
- [ ] Haptic pulse on button press is noticeable but not annoying.
- [ ] Complete a full set; **Exit VR** → **Download results CSV** works in the Quest Browser.
- [ ] Frame rate is smooth (no stutter on hover redraws).
- [ ] Backup plan if campus Wi-Fi blocks the LAN: `npm run build` and host `dist/` on GitHub Pages or Netlify.

## Open questions / decisions for the group
- Errors now follow the design doc: wrong icon, bad drop, and Submit outside tolerance. Empty-space clicks are no longer counted.
- Arrange success = **centre** offset ≤ 3 cm (not the corner). Confirm with the group.
- Timeout set at 120 s per trial (`task_success=false`). Not in the doc, but it gives `task_success` a meaning. OK?
- Is one practice task per condition enough?
- Is 3 scored tasks per condition enough for analysis, or should we add more per type?
- Should we add correctness feedback after each task? (Currently none, only "Answer recorded".)
- Data is stored per device: export from both the PC and the Quest, then merge. Who does the merging?

## Known limitations / ideas
- The VR bundle is ~590 kB (Three.js). That's fine for now; code-splitting is optional.
- The pre-study questionnaire has no demographics (age, etc.); add them only if the IRB/approved protocol allows.

## Remaining schedule
- **Nov 2–3:** polish from team feedback (Jonny: layout/tasks).
- **Nov 4:** Quest testing on Cheyenne's headset (checklist above).
- **Nov 5:** record the 1–2 minute demo, finish the interim report, collect CITI certificates.
- **Nov 6:** check the ZIP contents, pick one uploader, and do individual evaluations.

## Log
- **Nov 3 (later), from Andrew's feedback:** Arrange & Resize now resizes from any corner or edge. Document Reading tasks are back as Task 4. Lighter first-version look (light desktop, white windows, blue title bars, a "Task Panel", bigger text). Mouse-look is back on `vr.html`. Headless run of the full 16-trial desktop block passed (12 rows).
- **Nov 3:** revamped to the design doc (tasks, scene, input, logger). The old version is in `_old/`.
- **Nov 1:** project scaffolded, all features implemented, basic laptop test passed.
