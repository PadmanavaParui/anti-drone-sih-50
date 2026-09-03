# Anti-Drone Detection & Tracking System — SIH26050

**Smart India Hackathon 2026 · Problem Statement 50 · Organization: DRDO**

A portable, radar-free counter-UAS (C-UAS) detection and tracking system built for high-altitude,
cold-stressed border environments — with predictive health monitoring as a first-class
requirement, not an afterthought.

---

## The problem

Small, cheap commercial and hobbyist drones have become a real threat at military
installations, especially at high-altitude/border posts (Siachen/Ladakh-type terrain). They're
used for surveillance, smuggling, and increasingly as low-cost loitering munitions — a drone
costing a few hundred dollars can force a response from million-dollar defense systems.

Existing solutions don't fully cover this case:

- **Radar** is the standard approach, but it broadcasts its own RF signature (bad for a border post
  trying to stay covert), struggles with low, slow, small drones getting lost in ground clutter, and
  is expensive and heavy to deploy at every remote post.
- **Cold and altitude break most systems** that weren't built for it — extreme cold derates motor
  performance, drains batteries faster, and stresses gimbal mechanics. A system that works fine
  at room temperature can fail exactly where it's needed most. Most C-UAS product demos are
  validated at normal temperature, not the cold/altitude stress DRDO cares about here.
- **Predictive health monitoring is usually an afterthought** — most systems report a failure after
  it happens, not a component that's about to fail. At a remote post where sending a technician
  is slow and expensive, catching degradation (motor current/temperature/battery trends) before
  outright failure is operationally valuable.

**What we're solving:** a detection-and-tracking approach that (a) doesn't rely on radar — RF
spectrum sensing + EO/IR cameras fused together instead, (b) is explicitly designed to keep
working when it gets cold and mechanically stressed, and (c) continuously monitors its own
health so degradation is caught before failure.

**The gap, in one line:** low-cost, radar-free, cold-hardened drone detection/tracking with
self-diagnosing health monitoring — each piece is common individually in the C-UAS space, but
not usually all three together, and rarely validated for high-altitude cold conditions specifically.

---

## System architecture

Four layers:

1. **Sensing** — RF detection (SDR-based) and EO/IR (camera-based), running in parallel
2. **Fusion & decision** — confidence-weighted fusion of the two tracks + classification
3. **Control & stabilization** — PID/Kalman gimbal pointing loop
4. **Actuation & health monitoring** — motor control, telemetry logging, ground control station link

**Target hardware (post-funding):** RTL-SDR/HackRF for RF · camera/thermal module into a
Jetson Nano for vision · fused coordinates to an STM32/ESP32 controller driving gimbal motors ·
IMU + encoders closing the loop.

---

## What's built so far (software-in-the-loop simulation)

Real hardware isn't funded/released until after the internal round, so the internal-round
deliverable is a full software simulation, not a hardware demo:

- Simulated RF and EO/IR tracks, each with its own noise/dropout behavior
- Sensor fusion combining both, with graceful fallback if one track drops out
- A PID-controlled gimbal loop tracking the fused target
- A modeled cold-soak scenario (motor torque derated, slower response, added wind
  disturbance) vs. a room-temperature baseline
- A retuned controller for cold conditions, showing the before/after recovery
- Simulated health monitoring (motor current, temperature, battery voltage, pointing error over
  time), logged to CSV — directly answers the PS's "predictive performance assessment"
  requirement

### Results (30s simulation run)

| Scenario                        | RMS pointing error |
|----------------------------------|--------------------|
| Room temperature (baseline)      | ~4.7°              |
| Cold-soaked, uncompensated       | ~5.3°              |
| Cold-soaked, PID retuned         | ~3.0°              |

### Interactive 3D demo

A live, browser-based 3D visualization of the gimbal rig (`anti-drone-gimbal-3d.jsx`) — same
Base → YawArm → PitchArm chain, same control math, rendered in real time instead of as static
plots. Wind and cold sliders and a compensation toggle let you reproduce the before/after
recovery result interactively: crank cold up with compensation off and watch the targeting beam
drift and go red; flip compensation on and watch it re-lock.

---

## Users & significance

Targets border/high-altitude military outposts (DRDO use case) that need drone detection
without relying on radar — which is expensive, power-hungry, and has its own detection
signature. The cold-weather robustness angle matters specifically for high-altitude deployment
(Siachen-type conditions), where standard systems degrade.

## Cost

- **Optimized BOM** (laptop-offloaded compute, no thermal camera): **≈ ₹18,300 – ₹26,300**
- **Full BOM** (Jetson + thermal imaging): **≈ ₹40,000 – ₹90,000**

## What we deliberately did *not* attempt (and why)

- No μrad-level "aerospace-grade" pointing accuracy claims — out of reach on a first-pass
  student budget; we report honest single-digit-degree numbers instead
- No real MIL-STD-810 environmental qualification (no thermal-vacuum/altitude chamber access)
  — planned as a cheap dry-ice/ice-chest cold test for later rounds instead
- No real RF jamming or kinetic neutralization — kept as a conceptual/interface stub only, both
  for legal reasons and because uncontrolled jamming risks disrupting other nearby RF devices

---

## Testing plan

**Phase 1 — Validating the simulation itself (no hardware needed)**

- Sanity-check the fusion logic on edge cases: a track drops out entirely, both tracks disagree
  wildly, noise spikes — confirm graceful fallback instead of garbage estimates
- Sweep the PID gains and re-run the cold-soak scenario at multiple derating levels, not just one
  cold profile, to show the retuned controller isn't overfit to a single case
- Re-run with multiple seeds/noise realizations and report a range, not a single 30s run

**Phase 2 — Physical testing once hardware is funded**

1. **Cold-soak test** — dry-ice/ice-chest rig, ~−10°C to −20°C; same pointing-accuracy test at
   room temp vs. cold, same PID gains, then retuned gains — real data replacing the modeled numbers
2. **RF sensing test** — SDR against a known signal source at varying distance/angle; check
   detection range and angle-estimation accuracy against ground truth
3. **EO/IR sensing test** — camera/thermal detection against a real or mock drone target at
   different distances, lighting, backgrounds; measure detection accuracy and false-positive rate
4. **Fusion test (real sensors)** — RF + EO/IR simultaneously, deliberately occlude one sensor
   mid-track, confirm smooth handoff
5. **Closed-loop tracking test** — full pipeline against a real target, measure actual RMS
   pointing error vs. the simulated 4.7° baseline
6. **Health monitoring validation** — real current/temperature/battery telemetry through the same
   logging pipeline as `anti_drone_sim.py`
7. **Endurance/stress test** — extended cold-temperature runtime to check the predictive
   performance-assessment angle over time, not just a single-point comparison

---

## Prototype roadmap

Build the smallest physical thing that proves the concept, then layer complexity — each round
gets a working demo, even if incomplete.

| Stage | Focus | Demo |
|---|---|---|
| 1 | Pan-tilt gimbal + single sensing mode (EO/IR first — cheaper/easier than SDR) | Camera detects a moving target, gimbal tracks it live |
| 2 | Add RF sensing + real fusion | Occlude the camera, gimbal keeps tracking off RF alone, then both |
| 3 | Cold-soak physical test (dry-ice/ice-chest rig) | Same tracking test room-temp vs. cold, retuned controller recovering — the standout evidence |
| 4 | Health monitoring on real telemetry (current/temp/voltage sensors → same CSV pipeline) | Real-data version of the health-monitoring plots |

Neutralization (jamming/kinetic) and real MIL-STD-810 qualification stay out of scope for this
build — documented as future work rather than attempted with student-budget hardware.

---

## Repo contents

- `SIH26050_Internal_Round_Report.md` — full internal-round writeup
- `anti_drone_sim.py` — simulation: fusion, PID gimbal control, cold-soak modeling, health logging
- `gimbal_cad.py` / `cad_works/` / `gimbal_iso_matplotlib.png` — gimbal mechanical design
- `health_log_room_temp.csv`, `health_log_cold_degraded.csv`, `health_log_cold_compensated.csv`
  — logged telemetry from the three simulated scenarios
- `plot_tracking_room_temp.png`, `plot_before_after_compensation.png`, `plot_health_monitoring.png`
  — result plots
- `anti-drone-gimbal-3d.jsx` — interactive 3D gimbal tracking demo (React + Three.js)

---

## Status

Internal-round deliverable: simulation-validated approach and control strategy. Two items remain
open on the project — to be scoped with the mentor before the next round. Physical prototyping
(Stage 1 of the roadmap above) is the next milestone once hardware spend is approved.
