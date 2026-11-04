# Design Document

## Goals

The primary system goals are:

1. Provide equivalent interaction tasks across both environments (selection, drag-and-drop, and window arrange/resize).
2. Automatically record metrics (task completion times, error counts, tolerance deviations) and export them directly to CSV to review and analyze.

## System Architecture

Five modular components:

```text
Main Loop / Scene
├── InputManager (Mouse and WebXR Controller Rays)
├── WindowManager (Interactive 3D Planes and Handles)
└── TaskManager (Trials, States, Counterbalance)
    └── Logger (Timers, Errors, CSV Exporter)
```

### Scene Setup & World Coordinate Space

- **Units:** Standard Three.js metric units (1 unit = 1 meter).
- **Desk & Seated Anchor:**
  - Center origin `(0, 0, 0)` represents the seated user's physical base position.
  - Virtual desk surface located at `y = 0.75 m`.
  - Target workspace window plane placed at eye level `y = 1.25 m`, at a distance of `z = -0.85 m` to `-0.95 m`. This distance is intended to support text legibility on Quest 2 (based on preliminary reading; to be validated during testing).
- **Lighting & Materials:**
  - One ambient light (intensity = `0.6`) and one directional light (intensity = `0.8`).
  - Low-draw-call materials (`MeshBasicMaterial`) to ensure stable frame times on Quest 2.

## Core Modules & Specifications

### InputManager

The input manager unifies 2D mouse raycasting and 6-DOF WebXR controller pointers into a single interaction contract (`onPointerDown`, `onPointerMove`, `onPointerUp`).

- **Desktop Mode:**
  - Standard normalized device coordinates from mouse events.
  - `THREE.Raycaster` projects rays from the standard perspective camera into the 3D scene.
- **Quest 2 WebXR Mode:**
  - Driven by `renderer.xr.getController(0)`.
  - **Controller ray visual:** A thin line cylinder extending along the `-z` axis with a reticle dot at the intersection point.
  - **Button mappings:**
    - **Index Trigger (`selectstart` / `selectend`):** Select and drag.
    - **Squeeze/Grip:** Secondary grab or resize anchor.
  - **Haptics:** Short vibration burst on item pickup, target snap, or error.

### WindowManager

All workspace items exist as 3D planes within the Three.js scene graph.

1. **Item Icons (Selection Task):**
   - 15 cm × 15 cm square planes with canvas-generated high-contrast labels and icons.
2. **Draggable Documents & Folders (Drag-and-Drop Task):**
   - Document plane with a designated drag collision box.
   - Target and distractor folder targets featuring distinct color coding and text labels.
3. **Resizable Windows (Arrange & Resize Task):**
   - Header title bar acts as the drag handle for translation along the `xy` plane.
   - Bottom-right corner handle scales width and height dynamically while maintaining a minimum size constraint.
   - **Ghost target box:** A transparent wireframe outline indicating the required target position and dimensions.

### TaskManager

The experiment runs a strict counterbalanced within-subjects design across three tasks:

| Task Type | Objective | Success Criterion | Error Trigger |
| --- | --- | --- | --- |
| **Task 1: Selection** | Click the specific named file among distractors. | Correct item selected. | Selecting any incorrect distractor file. |
| **Task 2: Drag & Drop** | Drag a document into the designated target folder. | Releasing document while intersecting target folder bounds. | Dropping outside folder or onto distractor folder. |
| **Task 3: Arrange & Resize** | Move and resize window to align with target ghost box. | Final position error ≤ 3 cm and dimension error ≤ 5%. | Clicking **Submit** while outside the allowed tolerance bounds. |

#### Experiment Flow

1. **Participant Initialization:** Input Participant ID (`P01`–`P06`) and starting condition (Desktop or VR).
2. **Practice Trial:** 1 unrecorded trial per task to acclimate the participant to the input modality.
3. **Block 1 (Condition 1):**
   - 3 trials Selection + 3 trials Drag & Drop + 3 trials Arrange & Resize (9 trials total).
4. **Intermission & Survey:** Participant removes headset (if applicable) / pauses for subjective fatigue and discomfort ratings.
5. **Block 2 (Condition 2):**
   - Alternate condition runs the same 9 trials with equivalent layouts.
6. **Data Finalization:** Auto-compilation of metrics and CSV download.

### Logger

The logger records interactions on a per-trial basis with millisecond accuracy.

#### Recorded Schema

| Field | Type | Description |
| --- | --- | --- |
| `participant_id` | String | E.g., `P02` |
| `condition` | String | `desktop` or `vr_quest2` |
| `task_type` | String | `selection`, `drag_drop`, or `arrange_resize` |
| `trial_index` | Integer | 1 to 3 |
| `start_time_iso` | Timestamp | ISO timestamp |
| `completion_time_sec` | Float | Precision: 3 decimal places |
| `error_count` | Integer | Misclicks, missed drops, failed tolerance submissions |
| `final_tolerance_offset` | Float | Euclidean distance error in meters; applicable to Task 3 |
| `task_success` | Boolean | `true` or `false` |
