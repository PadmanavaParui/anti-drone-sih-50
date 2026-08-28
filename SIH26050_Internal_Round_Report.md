# SIH26050 — High Altitude Performance Optimization and Robust Design of Anti-Drone System
### Internal Round Report — Team [Name]

---

## 1. Problem Statement

DRDO PS SIH26050 asks for a portable, radar-free anti-drone detection and tracking
system that remains reliable under high-altitude / cold environmental stress, with
predictive performance assessment (health monitoring) as an explicit requirement.

## 2. System Architecture

The system is organized into four layers (see attached architecture diagram):

1. **Sensing layer** — RF (SDR-based) and EO/IR (camera-based) detection, run in parallel
2. **Fusion & decision layer** — weighted-confidence track fusion and classification
3. **Control & stabilization layer** — PID/Kalman-based gimbal pointing loop
4. **Actuation & health monitoring layer** — motor control, telemetry logging, GCS link

Signal path (target hardware, post-funding):

```
RTL-SDR/HackRF → USB → Raspberry Pi/laptop (RF processing)
Camera/thermal module → USB/CSI → Jetson Nano (vision processing)
Fused target coordinates → serial/UART or Wi-Fi → embedded controller (STM32/ESP32)
Embedded controller → PWM/step signals → motor drivers → gimbal motors
IMU + encoders → I2C/SPI → embedded controller (closed-loop pan-tilt control)
Battery → BMS/regulator → regulated rails for Pi, Jetson, MCU, motors
Heater strip → thermostat/relay, powered independently off battery
All compute nodes → central GCS software (laptop) for monitoring/logging
```

Reference: passive multi-modal C-UAS monitoring concepts (Ribri Technology,
dismounted-soldier drone detection system) informed the radar-free sensing approach.

## 3. What This Internal Round Demonstrates

Since project funding is not released until after the internal round, no physical
hardware has been procured. This round is a **software-in-the-loop simulation**
covering the parts of the pipeline that don't require hardware to validate:

- Simulated RF track: confidence-weighted angle estimate with dropout modeling
- Simulated EO/IR track: finer-grained angle estimate with its own noise/dropout profile
- Weighted-confidence sensor fusion combining both tracks, with graceful fallback
  when either track drops out
- PID-controlled gimbal pointing loop tracking the fused target estimate
- A modeled cold-soak scenario (derated motor torque + slower response + added wind
  disturbance) compared against a room-temperature baseline
- A retuned controller for the cold scenario, showing the control loop recovering
  performance — the "before/after compensation" evidence
- A simulated health-monitoring channel (motor current, temperature, battery voltage,
  pointing error vs. time), logged to CSV — this directly targets the PS's
  "predictive performance assessment" requirement

Simulation results (30 s run):

| Scenario | RMS pointing error |
|---|---|
| Room temperature (baseline) | ~4.7° |
| Cold-soaked, uncompensated | ~5.3° |
| Cold-soaked, PID retuned (compensated) | ~3.0° |

## 4. Scope We Are Deliberately Not Attempting — and Why

We would rather be upfront about this than overclaim and get cross-questioned on it.

**a. "True micro-radian pointing accuracy" claims.**
Achieving μrad-level pointing (the standard aerospace APE/RSS error-budget metric,
per JPL's pointing-error methodology) requires precision encoders, rigid mechanics,
and careful calibration that is out of reach for a first-pass student build on this
budget and timeline. We report achieved-vs-target accuracy honestly (currently
single-digit degrees, simulated) rather than quoting aerospace-grade numbers we
haven't earned.

**b. Real environmental qualification (MIL-STD-810 / JSS 55555).**
We do not have access to a real thermal-vacuum or altitude chamber. What we can do
cheaply and for real: a dry-ice/ice-chest cold-soak test (achievable to roughly
−10 to −20 °C) with actual before/after pointing-accuracy measurements — this is
planned as the strongest physical evidence for later rounds. Full MIL-STD
qualification is documented as a future validation plan (see §5), citing the
relevant method numbers, rather than claimed as complete.

**c. Neutralization subsystem (RF jamming / kinetic).**
This is the legally and practically hardest part of a real C-UAS system. We are
keeping it conceptual/simulated only for this competition. We will not attempt real
RF jamming or kinetic neutralization hardware — both because of the legal exposure
and because uncontrolled RF jamming risks disrupting other RF devices in the area.
This subsystem appears in our architecture as an interface stub only.

## 5. Future Validation Plan (post-funding / later rounds)

- Procure SDR (RTL-SDR/HackRF), camera + optional thermal module, Jetson-class
  compute, gimbal kit, ESP32/STM32 controller (see cost breakdown, §6)
- Replace simulated RF/EO-IR tracks with real GNU Radio spectrum sensing and
  YOLOv8n-based detection
- Physical cold-soak test (ice-chest/dry-ice) with real pointing-accuracy logging
- Document a TRL-6+ qualification plan referencing MIL-STD-810 Method 500
  (low pressure) and Method 502 (cold), and JSS 55555, without claiming those
  tests have been performed until they have

## 6. Cost Summary

Optimized BOM (laptop-offloaded compute, no thermal camera): **₹18,300 – ₹26,300**
Full BOM with Jetson + thermal imaging: **₹40,000 – ₹90,000**

See attached cost breakdown for full itemization and optimization rationale.

## 7. Files Accompanying This Report

- `anti_drone_sim.py` — the simulation source (RF/EO-IR tracks, fusion, PID gimbal
  control, cold-soak modeling, health logging)
- `plot_tracking_room_temp.png` — target vs. gimbal tracking, baseline conditions
- `plot_before_after_compensation.png` — pointing error, baseline vs. cold vs.
  cold-compensated
- `plot_health_monitoring.png` — simulated motor current / temperature / battery log
- `health_log_*.csv` — raw simulated telemetry for each scenario
