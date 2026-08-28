# Anti-Drone System — SIH26050

**Problem Statement:** DRDO — *High Altitude Performance Optimization and Robust Design of Anti-Drone System*
Category: Hardware | Theme: Robotics and Drones | [SIH26050]

A portable, radar-free counter-UAS detection and tracking system, designed to stay
reliable under high-altitude / cold environmental stress, with built-in predictive
health monitoring.

> **Status:** Internal-round submission. Funding/hardware procurement begins only
> after this round, so this repo currently contains a **software-in-the-loop
> simulation** and a **parametric CAD model** — no physical prototype yet.

---

## Architecture

```
Sensing layer            → RF (SDR) + EO/IR (camera) detection, run in parallel
Fusion & decision layer  → weighted-confidence track fusion, classification
Control & stabilization  → PID/Kalman gimbal pointing loop
Actuation & health mon.  → motor control, telemetry logging, GCS link
```

Target hardware signal path (post-funding):

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

Radar-free sensing approach informed by Ribri Technology's dismounted-soldier
passive multi-modal C-UAS monitoring concept.

---

## Repo Contents

| File | Description |
|---|---|
| `anti_drone_sim.py` | Software-in-the-loop simulation: simulated RF + EO/IR tracks, weighted-confidence fusion, PID gimbal control, cold-soak degradation model, health-monitoring log. Run standalone — regenerates all plots/CSVs below. |
| `SIH26050_Internal_Round_Report.md` | Full internal-round writeup: architecture, simulation methodology, results, and an honest account of what's out of scope for this round (and why). |
| `cad_works/` | Parametric CAD source and exports for the pan-tilt gimbal bracket. |
| `plot_tracking_room_temp.png` | Target vs. gimbal azimuth tracking, baseline (room temp) conditions. |
| `plot_before_after_compensation.png` | Pointing error: room-temp baseline vs. cold-soaked (uncompensated) vs. cold-soaked with retuned PID. |
| `plot_health_monitoring.png` | Simulated motor current / temperature / battery voltage over a run. |
| `health_log_room_temp.csv`, `health_log_cold_degraded.csv`, `health_log_cold_compensated.csv` | Raw simulated telemetry per scenario. |
| `gimbal_iso_matplotlib.png` | Quick isometric preview of the gimbal CAD model. |

---

## Running the Simulation

```bash
pip install numpy matplotlib
python3 anti_drone_sim.py
```

Regenerates all three plots and all three health-log CSVs in the working directory,
and prints RMS pointing error for each scenario:

| Scenario | RMS pointing error |
|---|---|
| Room temperature (baseline) | ~4.7° |
| Cold-soaked, uncompensated | ~5.3° |
| Cold-soaked, PID retuned (compensated) | ~3.0° |

---

## CAD

`cad_works/gimbal_cad.py` is a parametric [CadQuery](https://cadquery.readthedocs.io/)
script for the 2-axis pan-tilt gimbal bracket (base plate → rotating turntable →
U-yoke with two NEMA17 mounts → sensor platform for camera/antenna). All key
dimensions (bolt spacing, arm height, bearing bore, etc.) are named parameters at
the top of the file.

```bash
pip install cadquery
python3 cad_works/gimbal_cad.py
```

Outputs `gimbal_assembly.step` (import directly into Onshape or any CAD tool) and
`gimbal_assembly.stl` (for 3D printing / quick viewing).

---

## What's Intentionally Out of Scope for This Round

We'd rather state this upfront than overclaim:

- **Micro-radian pointing accuracy** — aerospace-grade APE/RSS pointing budgets
  require precision encoders and rigid mechanics beyond a first-pass student build.
  We report achieved-vs-target accuracy honestly instead.
- **Real environmental qualification (MIL-STD-810 / JSS 55555)** — no access to a
  thermal-vacuum chamber. Cold behavior is modeled here; a real dry-ice/ice-chest
  cold-soak test with physical pointing-accuracy measurement is planned as the next
  step, with full qualification documented as a future TRL-6+ validation plan.
- **Neutralization subsystem (RF jamming / kinetic)** — kept conceptual/interface-only
  for this competition, for legal and safety reasons.

See `SIH26050_Internal_Round_Report.md` for full detail.

---

## Team

Smart India Hackathon 2026 — internal college round, 31 August 2026.
