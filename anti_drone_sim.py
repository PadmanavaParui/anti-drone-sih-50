"""
Anti-Drone System — Software-in-the-loop Simulation
SIH26050: High Altitude Performance Optimization and Robust Design of Anti-Drone System

Purpose: internal-round demo. Since real SDR/camera/gimbal hardware and a real
thermal-vacuum chamber aren't available before the internal round, this simulates:
  1. RF track      : simulated SDR confidence + noisy angle estimate
  2. EO/IR track    : simulated vision detection + noisy angle estimate
  3. Fusion layer   : weighted-confidence fusion of RF + EO/IR angle estimates
  4. Control loop   : PID-controlled gimbal tracking the fused target angle
  5. Environment    : room-temp baseline vs "cold-soaked" degraded run
                       (derated motor torque + added disturbance), with a
                       compensated cold run showing the controller recovering
  6. Health log     : motor current, temperature, battery voltage, pointing
                       error over time -> CSV (feeds the "predictive
                       performance assessment" ask in the problem statement)

No RF jamming, kinetic neutralization, or real hardware control is modeled —
that subsystem is intentionally out of scope (see report).
"""

import numpy as np
import matplotlib.pyplot as plt
import csv

RNG = np.random.default_rng(42)

# ---------------------------------------------------------------------------
# 1. Target trajectory (stand-in for a drone flight path)
# ---------------------------------------------------------------------------
def target_trajectory(t):
    """Azimuth (deg) as a function of time — a weaving, slightly erratic pass."""
    az = 30 * np.sin(0.35 * t) + 8 * np.sin(1.4 * t + 1.0)
    return az


# ---------------------------------------------------------------------------
# 2. Detection tracks
# ---------------------------------------------------------------------------
def rf_track(true_az, t, noise_std=2.5, dropout_prob=0.05):
    """Simulated RF angle estimate + confidence (coarser but less occluded)."""
    if RNG.random() < dropout_prob:
        return None, 0.0
    est = true_az + RNG.normal(0, noise_std)
    confidence = 0.55 + 0.1 * np.sin(0.2 * t)  # RF confidence: moderate, stable-ish
    return est, np.clip(confidence, 0.3, 0.8)


def eo_ir_track(true_az, t, noise_std=0.8, dropout_prob=0.10):
    """Simulated vision angle estimate + confidence (finer but can lose lock)."""
    if RNG.random() < dropout_prob:
        return None, 0.0
    est = true_az + RNG.normal(0, noise_std)
    confidence = 0.8 + 0.1 * np.cos(0.15 * t)  # EO/IR confidence: higher when locked
    return est, np.clip(confidence, 0.4, 0.95)


def fuse(rf_est, rf_conf, eo_est, eo_conf):
    """Simple weighted-confidence fusion. Falls back gracefully if one track drops."""
    if rf_est is None and eo_est is None:
        return None
    if rf_est is None:
        return eo_est
    if eo_est is None:
        return rf_est
    total = rf_conf + eo_conf
    return (rf_est * rf_conf + eo_est * eo_conf) / total


# ---------------------------------------------------------------------------
# 3. PID-controlled gimbal
# ---------------------------------------------------------------------------
class PID:
    def __init__(self, kp, ki, kd, dt):
        self.kp, self.ki, self.kd, self.dt = kp, ki, kd, dt
        self.integral = 0.0
        self.prev_error = 0.0

    def step(self, error):
        self.integral += error * self.dt
        derivative = (error - self.prev_error) / self.dt
        self.prev_error = error
        return self.kp * error + self.ki * self.integral + self.kd * derivative


def run_gimbal_sim(duration=30, dt=0.05, torque_derate=1.0, extra_disturbance=0.0,
                    kp=1.8, ki=0.4, kd=0.12):
    """
    torque_derate: 1.0 = full torque/response (room temp). <1.0 simulates
                   cold-soaked motor torque derating: lower max slew rate and
                   slower (laggier) response to commanded velocity.
    extra_disturbance: extra wind gust amplitude (deg/s) injected on top of
                        the baseline wind model, perturbing gimbal velocity.

    Model: PID outputs a *commanded angular velocity*, saturated by the
    motor's max slew rate. Actual gimbal velocity chases the command with a
    first-order lag (time constant grows as torque derates), which is a
    reasonable stand-in for reduced motor torque / higher friction in cold.
    """
    steps = int(duration / dt)
    t_arr = np.linspace(0, duration, steps)

    pid = PID(kp, ki, kd, dt)
    gimbal_az = 0.0
    gimbal_vel = 0.0

    base_max_vel = 45.0   # deg/s, full torque
    base_tau = 0.12       # s, full torque response lag
    max_vel = base_max_vel * torque_derate
    tau = base_tau / max(torque_derate, 0.15)

    log_rows = []
    battery_v = 12.6  # 3S LiPo nominal full charge

    for i, t in enumerate(t_arr):
        true_az = target_trajectory(t)

        rf_est, rf_conf = rf_track(true_az, t)
        eo_est, eo_conf = eo_ir_track(true_az, t)
        fused = fuse(rf_est, rf_conf, eo_est, eo_conf)

        if fused is None:
            fused = gimbal_az  # hold last position if both tracks drop out

        error = fused - gimbal_az
        commanded_vel = np.clip(pid.step(error), -max_vel, max_vel)

        # wind disturbance: slow-varying baseline + extra gust term, acting
        # directly as an angular-velocity perturbation the loop must reject
        wind = 1.5 * np.sin(0.5 * t) + extra_disturbance * np.sin(0.9 * t + 0.4)

        gimbal_vel += ((commanded_vel - gimbal_vel) / tau) * dt + wind * dt
        gimbal_az += gimbal_vel * dt

        pointing_error = true_az - gimbal_az

        # --- health monitoring channel (simulated) ---
        motor_current = min(abs(commanded_vel) * 0.035 + 0.15, 3.0)   # amps, clipped
        temperature = 22.0 if torque_derate >= 0.95 else -15.0 + 0.5 * np.sin(0.1 * t)
        battery_v -= 0.00006 * (1 + motor_current)  # slow discharge
        cold_derate_factor = 0.985 if torque_derate < 0.95 else 1.0
        battery_v *= cold_derate_factor if i == 0 else 1.0  # one-time cold capacity hit

        log_rows.append([
            round(t, 2), round(true_az, 3), round(gimbal_az, 3),
            round(pointing_error, 3), round(motor_current, 3),
            round(temperature, 2), round(battery_v, 3)
        ])

    return t_arr, np.array(log_rows)


def write_health_log(rows, path):
    header = ["time_s", "true_azimuth_deg", "gimbal_azimuth_deg",
              "pointing_error_deg", "motor_current_A", "temperature_C", "battery_V"]
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# 4. Run scenarios: room temp / cold degraded / cold + compensated (retuned PID)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    t_room, log_room = run_gimbal_sim(torque_derate=1.0, extra_disturbance=0.0)
    t_cold, log_cold = run_gimbal_sim(torque_derate=0.55, extra_disturbance=1.5)
    t_comp, log_comp = run_gimbal_sim(torque_derate=0.55, extra_disturbance=1.5,
                                       kp=3.2, ki=0.9, kd=0.05)  # retuned for cold

    write_health_log(log_room, "health_log_room_temp.csv")
    write_health_log(log_cold, "health_log_cold_degraded.csv")
    write_health_log(log_comp, "health_log_cold_compensated.csv")

    def rms_error(log):
        return np.sqrt(np.mean(log[:, 3].astype(float) ** 2))

    print(f"RMS pointing error — room temp        : {rms_error(log_room):.3f} deg")
    print(f"RMS pointing error — cold, degraded    : {rms_error(log_cold):.3f} deg")
    print(f"RMS pointing error — cold, compensated : {rms_error(log_comp):.3f} deg")

    # --- Plot 1: target tracking (room temp) ---
    fig1, ax1 = plt.subplots(figsize=(9, 4.5))
    ax1.plot(t_room, log_room[:, 1], label="True target azimuth", lw=1.8)
    ax1.plot(t_room, log_room[:, 2], label="Gimbal azimuth (tracked)", lw=1.4, ls="--")
    ax1.set_xlabel("Time (s)"); ax1.set_ylabel("Azimuth (deg)")
    ax1.set_title("Target Tracking — Room Temperature")
    ax1.legend(); ax1.grid(alpha=0.3)
    fig1.tight_layout(); fig1.savefig("plot_tracking_room_temp.png", dpi=150)

    # --- Plot 2: before/after cold compensation ---
    fig2, ax2 = plt.subplots(figsize=(9, 4.5))
    ax2.plot(t_room, log_room[:, 3], label="Room temp (baseline)", lw=1.4, alpha=0.8)
    ax2.plot(t_cold, log_cold[:, 3], label="Cold-soaked, uncompensated", lw=1.4, alpha=0.8)
    ax2.plot(t_comp, log_comp[:, 3], label="Cold-soaked, PID retuned (compensated)", lw=1.6)
    ax2.set_xlabel("Time (s)"); ax2.set_ylabel("Pointing error (deg)")
    ax2.set_title("Pointing Error: Before vs After Cold Compensation")
    ax2.legend(); ax2.grid(alpha=0.3)
    fig2.tight_layout(); fig2.savefig("plot_before_after_compensation.png", dpi=150)

    # --- Plot 3: health monitoring dashboard ---
    fig3, axes = plt.subplots(3, 1, figsize=(9, 8), sharex=True)
    axes[0].plot(t_cold, log_cold[:, 4].astype(float), color="tab:red")
    axes[0].set_ylabel("Motor current (A)")
    axes[0].set_title("Health Monitoring — Cold-Soaked Run")
    axes[1].plot(t_cold, log_cold[:, 5].astype(float), color="tab:blue")
    axes[1].set_ylabel("Temperature (°C)")
    axes[2].plot(t_cold, log_cold[:, 6].astype(float), color="tab:green")
    axes[2].set_ylabel("Battery (V)"); axes[2].set_xlabel("Time (s)")
    for ax in axes:
        ax.grid(alpha=0.3)
    fig3.tight_layout(); fig3.savefig("plot_health_monitoring.png", dpi=150)

    print("\nSaved: plot_tracking_room_temp.png, plot_before_after_compensation.png, "
          "plot_health_monitoring.png")
    print("Saved: health_log_room_temp.csv, health_log_cold_degraded.csv, "
          "health_log_cold_compensated.csv")
