import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Same model as anti_drone_sim.py — target trajectory, RF/EO-IR tracks,
// confidence-weighted fusion, PID gimbal, cold-derate plant, health telemetry.
// Ported to run live, tick by tick, instead of as a one-shot batch sim.
// ---------------------------------------------------------------------------

const DT = 0.05;
const BASE_MAX_VEL = 45.0;
const BASE_TAU = 0.12;
const BASE_GAINS = { kp: 1.8, ki: 0.4, kd: 0.12 };
const COLD_GAINS = { kp: 3.2, ki: 0.9, kd: 0.05 };
const HISTORY_LEN = 320;

function gaussian(std) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function targetTrajectory(t) {
  return 30 * Math.sin(0.35 * t) + 8 * Math.sin(1.4 * t + 1.0);
}

function rfTrack(trueAz, t) {
  if (Math.random() < 0.05) return { est: null, conf: 0 };
  const est = trueAz + gaussian(2.5);
  const conf = Math.min(0.8, Math.max(0.3, 0.55 + 0.1 * Math.sin(0.2 * t)));
  return { est, conf };
}

function eoIrTrack(trueAz, t) {
  if (Math.random() < 0.1) return { est: null, conf: 0 };
  const est = trueAz + gaussian(0.8);
  const conf = Math.min(0.95, Math.max(0.4, 0.8 + 0.1 * Math.cos(0.15 * t)));
  return { est, conf };
}

function fuse(rf, eo) {
  if (rf.est === null && eo.est === null) return null;
  if (rf.est === null) return eo.est;
  if (eo.est === null) return rf.est;
  const total = rf.conf + eo.conf;
  return (rf.est * rf.conf + eo.est * eo.conf) / total;
}

function freshState() {
  return {
    t: 0,
    gimbalAz: 0,
    gimbalVel: 0,
    integral: 0,
    prevError: 0,
    battery: 12.6,
    coldHitApplied: false,
  };
}

export default function AntiDroneLiveDemo() {
  const [coldLevel, setColdLevel] = useState(0);
  const [windLevel, setWindLevel] = useState(0);
  const [autoCompensate, setAutoCompensate] = useState(true);
  const [running, setRunning] = useState(true);
  const [history, setHistory] = useState([]);
  const [live, setLive] = useState(null);

  const simRef = useRef(freshState());
  const coldRef = useRef(coldLevel);
  const windRef = useRef(windLevel);
  const compRef = useRef(autoCompensate);

  useEffect(() => { coldRef.current = coldLevel; }, [coldLevel]);
  useEffect(() => { windRef.current = windLevel; }, [windLevel]);
  useEffect(() => { compRef.current = autoCompensate; }, [autoCompensate]);

  const reset = useCallback(() => {
    simRef.current = freshState();
    setHistory([]);
    setLive(null);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = simRef.current;
      const cold = coldRef.current;
      const wind = windRef.current;
      const comp = compRef.current;

      const torqueDerate = 1 - cold * 0.45; // 1.0 room temp -> 0.55 full cold
      const isCold = torqueDerate < 0.95;
      const gains = comp && isCold ? COLD_GAINS : BASE_GAINS;

      const t = s.t;
      const trueAz = targetTrajectory(t);
      const rf = rfTrack(trueAz, t);
      const eo = eoIrTrack(trueAz, t);
      let fused = fuse(rf, eo);
      if (fused === null) fused = s.gimbalAz;

      const error = fused - s.gimbalAz;
      s.integral += error * DT;
      const derivative = (error - s.prevError) / DT;
      s.prevError = error;
      const rawCmd = gains.kp * error + gains.ki * s.integral + gains.kd * derivative;

      const maxVel = BASE_MAX_VEL * torqueDerate;
      const tau = BASE_TAU / Math.max(torqueDerate, 0.15);
      const commandedVel = Math.max(-maxVel, Math.min(maxVel, rawCmd));

      const windForce = 1.5 * Math.sin(0.5 * t) + windLevel * Math.sin(0.9 * t + 0.4);
      s.gimbalVel += ((commandedVel - s.gimbalVel) / tau) * DT + windForce * DT;
      s.gimbalAz += s.gimbalVel * DT;

      const pointingError = trueAz - s.gimbalAz;
      const motorCurrent = Math.min(Math.abs(commandedVel) * 0.035 + 0.15, 3.0);
      const temperature = torqueDerate >= 0.95 ? 22.0 : -15.0 + 0.5 * Math.sin(0.1 * t);
      s.battery -= 0.00006 * (1 + motorCurrent);
      if (isCold && !s.coldHitApplied) {
        s.battery *= 0.985;
        s.coldHitApplied = true;
      }
      if (!isCold) s.coldHitApplied = false;

      s.t += DT;

      const point = {
        t: Number(t.toFixed(2)),
        trueAz: Number(trueAz.toFixed(2)),
        gimbalAz: Number(s.gimbalAz.toFixed(2)),
        error: Number(pointingError.toFixed(2)),
        current: Number(motorCurrent.toFixed(2)),
        temp: Number(temperature.toFixed(1)),
        battery: Number(s.battery.toFixed(3)),
      };

      setLive(point);
      setHistory((h) => {
        const next = h.length >= HISTORY_LEN ? h.slice(1) : h;
        return [...next, point];
      });
    }, 50);
    return () => clearInterval(id);
  }, [running]);

  const isCold = 1 - coldLevel * 0.45 < 0.95;
  const status = !isCold
    ? { label: "NOMINAL — ROOM TEMP", color: "#4ADE80" }
    : autoCompensate
    ? { label: "COLD-DERATED — GAINS AUTO-ADAPTED", color: "#F5A623" }
    : { label: "COLD-DERATED — UNCOMPENSATED", color: "#FF5C5C" };

  const rms =
    history.length > 5
      ? Math.sqrt(
          history.slice(-100).reduce((a, p) => a + p.error * p.error, 0) /
            Math.min(100, history.length)
        )
      : 0;

  const activeGains = autoCompensate && isCold ? COLD_GAINS : BASE_GAINS;

  return (
    <div
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        background: "#0A0E0C",
        color: "#DCE8E1",
        minHeight: "100%",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "1px solid #1F2C26",
          paddingBottom: 14,
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.5, color: "#5E7268" }}>
            SIH26050 · anti-drone-sih-50
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#EAF3EE" }}>
            Gimbal Control Loop — Live Simulation
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            border: `1px solid ${status.color}55`,
            borderRadius: 4,
            background: `${status.color}14`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: status.color,
              boxShadow: `0 0 8px ${status.color}`,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: status.color, letterSpacing: 0.5 }}>
            {status.label}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Left: controls */}
        <div style={{ flex: "1 1 260px", minWidth: 260 }}>
          <Panel title="Disturbance Controls">
            <SliderRow
              label="Cold soak"
              value={coldLevel}
              min={0}
              max={1}
              step={0.01}
              onChange={setColdLevel}
              display={`${Math.round(coldLevel * 100)}%`}
              accent="#F5A623"
            />
            <SliderRow
              label="Wind gust"
              value={windLevel}
              min={0}
              max={3}
              step={0.05}
              onChange={setWindLevel}
              display={windLevel.toFixed(1)}
              accent="#5EA8FF"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid #1F2C26",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#DCE8E1" }}>Auto-compensation</div>
                <div style={{ fontSize: 11, color: "#5E7268" }}>
                  Gain-schedules PID on live temperature
                </div>
              </div>
              <Toggle checked={autoCompensate} onChange={setAutoCompensate} />
            </div>
          </Panel>

          <Panel title="Active gains" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
              <GainStat label="Kp" value={activeGains.kp} />
              <GainStat label="Ki" value={activeGains.ki} />
              <GainStat label="Kd" value={activeGains.kd} />
            </div>
            <div style={{ fontSize: 11, color: "#5E7268", marginTop: 8 }}>
              {autoCompensate && isCold
                ? "Cold-tuned set — switched automatically"
                : "Room-temperature set"}
            </div>
          </Panel>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setRunning((r) => !r)} style={btnStyle()}>
              {running ? "Pause" : "Resume"}
            </button>
            <button onClick={reset} style={btnStyle()}>
              Reset
            </button>
          </div>
        </div>

        {/* Right: charts + telemetry */}
        <div style={{ flex: "2 1 480px", minWidth: 300 }}>
          <Panel title="Azimuth tracking">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={history} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#182119" strokeDasharray="3 3" />
                <XAxis dataKey="t" stroke="#5E7268" tick={{ fontSize: 10 }} />
                <YAxis stroke="#5E7268" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#8FA398" }} />
                <Line type="monotone" dataKey="trueAz" stroke="#5EA8FF" dot={false} strokeWidth={1.6} isAnimationActive={false} name="Target" />
                <Line type="monotone" dataKey="gimbalAz" stroke="#4ADE80" dot={false} strokeWidth={1.6} isAnimationActive={false} name="Gimbal" />
              </LineChart>
            </ResponsiveContainer>
            <Legend items={[{ c: "#5EA8FF", l: "True target azimuth" }, { c: "#4ADE80", l: "Gimbal azimuth" }]} />
          </Panel>

          <Panel title="Pointing error" style={{ marginTop: 14 }}>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={history} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#182119" strokeDasharray="3 3" />
                <XAxis dataKey="t" stroke="#5E7268" tick={{ fontSize: 10 }} />
                <YAxis stroke="#5E7268" tick={{ fontSize: 10 }} domain={[-15, 15]} />
                <ReferenceLine y={0} stroke="#2A3A31" />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#8FA398" }} />
                <Line type="monotone" dataKey="error" stroke="#F5A623" dot={false} strokeWidth={1.6} isAnimationActive={false} name="Error" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <Stat label="RMS error" value={`${rms.toFixed(2)}°`} accent={rms > 6 ? "#FF5C5C" : rms > 4 ? "#F5A623" : "#4ADE80"} />
            <Stat label="Motor current" value={`${live ? live.current.toFixed(2) : "0.00"} A`} />
            <Stat label="Temperature" value={`${live ? live.temp.toFixed(1) : "22.0"} °C`} />
            <Stat label="Battery" value={`${live ? live.battery.toFixed(2) : "12.60"} V`} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#465A50", marginTop: 18, borderTop: "1px solid #1F2C26", paddingTop: 10 }}>
        Same plant, PID, and fusion model as anti_drone_sim.py — running live instead of as a batch plot. No physical hardware modeled.
      </div>
    </div>
  );
}

function Panel({ title, children, style }) {
  return (
    <div
      style={{
        background: "#101613",
        border: "1px solid #1F2C26",
        borderRadius: 4,
        padding: 16,
        ...style,
      }}
    >
      <div style={{ fontSize: 12, color: "#8FA398", marginBottom: 12, letterSpacing: 0.4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, display, accent }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: "#DCE8E1" }}>{label}</span>
        <span style={{ color: accent }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: accent }}
      />
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? "#4ADE8055" : "#2A342F",
        border: `1px solid ${checked ? "#4ADE80" : "#3A463F"}`,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: checked ? "#4ADE80" : "#6B7A72",
          position: "absolute",
          top: 2,
          left: checked ? 20 : 3,
          transition: "left 0.15s",
        }}
      />
    </div>
  );
}

function GainStat({ label, value }) {
  return (
    <div>
      <div style={{ color: "#5E7268", fontSize: 11 }}>{label}</div>
      <div style={{ color: "#EAF3EE", fontSize: 15 }}>{value.toFixed(2)}</div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: "#101613", border: "1px solid #1F2C26", borderRadius: 4, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: "#5E7268", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, color: accent || "#EAF3EE" }}>{value}</div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8FA398" }}>
          <span style={{ width: 8, height: 8, background: it.c, display: "inline-block", borderRadius: 2 }} />
          {it.l}
        </div>
      ))}
    </div>
  );
}

function btnStyle() {
  return {
    flex: 1,
    background: "#151D18",
    border: "1px solid #2A3A31",
    color: "#DCE8E1",
    borderRadius: 4,
    padding: "8px 0",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const tooltipStyle = {
  background: "#101613",
  border: "1px solid #2A3A31",
  fontSize: 11,
};
