import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MONO = "ui-monospace, SFMono-Regular, 'IBM Plex Mono', Consolas, monospace";
const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";

const COLOR = {
  bg: '#0a0e0b',
  panel: '#12170f',
  panelAlt: '#161d13',
  border: 'rgba(126,196,151,0.16)',
  borderStrong: 'rgba(126,196,151,0.32)',
  text: '#dcf3e2',
  dim: '#7c9583',
  green: '#5fffb0',
  amber: '#ffb454',
  red: '#ff5c5c',
};

function statusColor(errDeg) {
  if (errDeg < 6) return COLOR.green;
  if (errDeg < 15) return COLOR.amber;
  return COLOR.red;
}

export default function AntiDroneGimbal3D() {
  const mountRef = useRef(null);
  const paramsRef = useRef({ wind: 20, cold: 30, compensate: true, running: true });

  const [wind, setWind] = useState(20);
  const [cold, setCold] = useState(30);
  const [compensate, setCompensate] = useState(true);
  const [running, setRunning] = useState(true);
  const [telemetry, setTelemetry] = useState({ error: 0, rms: 0, lock: 'ACQUIRING' });
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    paramsRef.current = { wind, cold, compensate, running };
  }, [wind, cold, compensate, running]);

  useEffect(() => {
    const mount = mountRef.current;
    let width = mount.clientWidth;
    let height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e0b);
    scene.fog = new THREE.Fog(0x0a0e0b, 9, 26);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const camState = { radius: 11.5, theta: Math.PI / 3.4, phi: Math.PI / 2.9, target: new THREE.Vector3(0, 1.1, 0) };
    function updateCamera() {
      const { radius, theta, phi, target } = camState;
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    }
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0x2c3a2e, 0.7));
    const dirLight = new THREE.DirectionalLight(0xbfffdc, 0.85);
    dirLight.position.set(6, 10, 4);
    scene.add(dirLight);
    const rim = new THREE.PointLight(0x5fffb0, 0.7, 22);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    // ---- ground ----
    const grid = new THREE.GridHelper(26, 26, 0x2a4a34, 0x16211a);
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(13, 48),
      new THREE.MeshStandardMaterial({ color: 0x0c110d, roughness: 0.97, metalness: 0.02 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // ---- materials ----
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1c231d, metalness: 0.55, roughness: 0.42 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x475c4a, metalness: 0.7, roughness: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x5fffb0, emissive: 0x2a7a52, emissiveIntensity: 0.9, metalness: 0.15, roughness: 0.4,
    });

    // ---- gimbal rig: Base -> YawArm -> PitchArm ----
    const baseGroup = new THREE.Group();
    scene.add(baseGroup);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.5, 24), baseMat);
    pedestal.position.y = 0.25;
    baseGroup.add(pedestal);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 24), accentMat);
    foot.position.y = 0.04;
    baseGroup.add(foot);

    const yawGroup = new THREE.Group();
    yawGroup.position.y = 0.5;
    baseGroup.add(yawGroup);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.28, 20), accentMat);
    turret.position.y = 0.14;
    yawGroup.add(turret);

    const yokeGeo = new THREE.BoxGeometry(0.11, 0.66, 0.11);
    const yokeL = new THREE.Mesh(yokeGeo, baseMat);
    yokeL.position.set(-0.3, 0.6, 0);
    yawGroup.add(yokeL);
    const yokeR = yokeL.clone();
    yokeR.position.x = 0.3;
    yawGroup.add(yokeR);

    const pitchGroup = new THREE.Group();
    pitchGroup.position.y = 0.6;
    yawGroup.add(pitchGroup);

    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.82), accentMat);
    pitchGroup.add(pod);

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 16), glowMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, 0.48);
    pitchGroup.add(lens);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), accentMat);
    antenna.position.set(0.2, 0.24, -0.18);
    pitchGroup.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), glowMat);
    antennaTip.position.set(0.2, 0.5, -0.18);
    pitchGroup.add(antennaTip);

    // targeting beam
    const beamMat = new THREE.LineBasicMaterial({ color: 0x5fffb0, transparent: true, opacity: 0.55 });
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), beamMat);
    scene.add(beam);

    // ---- drone target ----
    const droneGroup = new THREE.Group();
    scene.add(droneGroup);
    const droneBody = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x551515, roughness: 0.5 }),
    );
    droneGroup.add(droneBody);
    const armGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.46, 6);
    const propMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(armGeo, propMat);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = ang;
      droneGroup.add(arm);
      const prop = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.011, 6, 12), propMat);
      prop.position.set(Math.cos(ang) * 0.23, 0.025, Math.sin(ang) * 0.23);
      prop.rotation.x = Math.PI / 2;
      droneGroup.add(prop);
    }

    // trail
    const TRAIL_LEN = 50;
    const trailPositions = new Float32Array(TRAIL_LEN * 3);
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.28 }));
    scene.add(trail);
    const trailBuf = [];

    // ---- physics / control state ----
    const phys = {
      t: 0,
      az: 0, azVel: 0,
      el: 0.15, elVel: 0,
      sampleClock: 0,
      errBuf: [],
    };
    const pivot = new THREE.Vector3(0, 1.1, 0);

    function targetPosition(t) {
      const r = 4.4;
      const az = t * 0.42 + Math.sin(t * 0.7) * 0.32;
      const el = 0.55 + Math.sin(t * 0.9) * 0.18 + Math.sin(t * 0.23) * 0.08;
      return new THREE.Vector3(r * Math.sin(az), 0.75 + el * 1.6, r * Math.cos(az));
    }

    let raf;
    const clock = new THREE.Clock();

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const { wind, cold, compensate, running } = paramsRef.current;

      if (running) {
        phys.t += dt;
        const tp = targetPosition(phys.t);
        droneGroup.position.copy(tp);
        droneGroup.rotation.y += dt * 6;

        trailBuf.push(tp.clone());
        if (trailBuf.length > TRAIL_LEN) trailBuf.shift();
        for (let i = 0; i < TRAIL_LEN; i++) {
          const p = trailBuf[i] || tp;
          trailPositions[i * 3] = p.x;
          trailPositions[i * 3 + 1] = p.y;
          trailPositions[i * 3 + 2] = p.z;
        }
        trailGeom.attributes.position.needsUpdate = true;

        const rel = tp.clone().sub(pivot);
        const desiredAz = Math.atan2(rel.x, rel.z);
        const horizDist = Math.sqrt(rel.x * rel.x + rel.z * rel.z);
        const desiredEl = Math.atan2(rel.y, horizDist);

        const coldF = cold / 100;
        const windF = wind / 100;
        const torqueMax = 9 * (1 - coldF * 0.55);
        const kp = compensate ? 7 + coldF * 4 : 5.5;
        const kd = compensate ? 3.2 + coldF * 1.5 : 2.4;
        const coldDamp = compensate ? 1 + coldF * 0.3 : 1 + coldF * 0.95;

        function stepAxis(pos, vel, desired) {
          const err = desired - pos;
          let accel = kp * err - kd * vel;
          accel = Math.max(-torqueMax, Math.min(torqueMax, accel));
          let v = vel + accel * dt;
          v /= Math.pow(coldDamp, dt * 2);
          v += (Math.random() - 0.5) * windF * 3.0 * dt;
          const p = pos + v * dt;
          return [p, v];
        }

        let azErr = desiredAz - phys.az;
        while (azErr > Math.PI) azErr -= Math.PI * 2;
        while (azErr < -Math.PI) azErr += Math.PI * 2;
        const [nAz, nAzVel] = stepAxis(phys.az, phys.azVel, phys.az + azErr);
        phys.az = nAz; phys.azVel = nAzVel;
        const [nEl, nElVel] = stepAxis(phys.el, phys.elVel, desiredEl);
        phys.el = Math.max(-0.3, Math.min(1.3, nEl)); phys.elVel = nElVel;

        yawGroup.rotation.y = phys.az;
        pitchGroup.rotation.x = -phys.el;

        const podWorldPos = new THREE.Vector3();
        lens.getWorldPosition(podWorldPos);
        beam.geometry.setFromPoints([podWorldPos, tp]);

        const errDeg = Math.abs(azErr) * 180 / Math.PI + Math.abs(desiredEl - phys.el) * 180 / Math.PI;
        beam.material.color.setHex(parseInt(statusColor(errDeg).slice(1), 16));

        phys.sampleClock += dt;
        if (phys.sampleClock > 0.22) {
          phys.sampleClock = 0;
          phys.errBuf.push(errDeg);
          if (phys.errBuf.length > 400) phys.errBuf.shift();
          const recent = phys.errBuf.slice(-40);
          const rms = Math.sqrt(recent.reduce((s, v) => s + v * v, 0) / recent.length);
          setTelemetry({
            error: errDeg,
            rms,
            lock: errDeg < 6 ? 'LOCKED' : errDeg < 15 ? 'TRACKING' : 'DRIFT',
          });
          setHistory((h) => [...h, { t: Math.round(phys.t * 10) / 10, error: Math.round(errDeg * 10) / 10 }].slice(-40));
        }
      }

      renderer.render(scene, camera);
    }
    animate();
    setReady(true);

    // ---- manual orbit controls (no OrbitControls in r128 build) ----
    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      camState.theta -= dx * 0.007;
      camState.phi = Math.max(0.35, Math.min(1.45, camState.phi - dy * 0.007));
      updateCamera();
    };
    const onWheel = (e) => {
      e.preventDefault();
      camState.radius = Math.max(5.5, Math.min(20, camState.radius + e.deltaY * 0.01));
      updateCamera();
    };
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      width = mount.clientWidth; height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      background: COLOR.bg, color: COLOR.text, fontFamily: SANS,
      padding: 16, borderRadius: 4, border: `1px solid ${COLOR.border}`,
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 560,
    }}>
      <style>{`
        input[type=range]{ -webkit-appearance:none; width:100%; height:3px; background:${COLOR.border}; border-radius:2px; outline:none; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:13px; height:13px; border-radius:50%; background:${COLOR.green}; cursor:pointer; box-shadow:0 0 6px rgba(95,255,176,0.6); }
        input[type=range]::-moz-range-thumb{ width:13px; height:13px; border-radius:50%; background:${COLOR.green}; border:none; cursor:pointer; }
        .gimbal-grid{ display:grid; grid-template-columns: 1.6fr 1fr; gap:12px; }
        @media (max-width: 760px){ .gimbal-grid{ grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1, color: COLOR.dim, fontFamily: MONO }}>SIH26050 · DRDO C-UAS</div>
          <div style={{ fontSize: 19, fontWeight: 600 }}>Gimbal Tracking — 3D Simulation</div>
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 12, padding: '4px 10px', borderRadius: 3,
          border: `1px solid ${statusColor(telemetry.error)}55`, color: statusColor(telemetry.error),
        }}>
          {telemetry.lock} · {telemetry.error.toFixed(1)}°
        </div>
      </div>

      <div className="gimbal-grid">
        {/* 3D viewport */}
        <div style={{ position: 'relative', borderRadius: 3, overflow: 'hidden', border: `1px solid ${COLOR.border}`, background: '#060907' }}>
          <div ref={mountRef} style={{ width: '100%', height: 420, cursor: 'grab' }} />
          <div style={{
            position: 'absolute', bottom: 8, left: 10, fontFamily: MONO, fontSize: 10.5, color: COLOR.dim,
          }}>
            drag to orbit · scroll to zoom
          </div>
          <div style={{
            position: 'absolute', top: 10, right: 10, fontFamily: MONO, fontSize: 10.5, color: COLOR.dim,
            textAlign: 'right', lineHeight: 1.5,
          }}>
            <div>RMS (40 samples): <span style={{ color: COLOR.text }}>{telemetry.rms.toFixed(2)}°</span></div>
            <div>t = {ready ? 'live' : 'init'}</div>
          </div>
        </div>

        {/* control panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel title="Environment stress">
            <SliderRow label="Wind disturbance" value={wind} onChange={setWind} unit="%" />
            <SliderRow label="Cold-soak severity" value={cold} onChange={setCold} unit="%" hint={cold > 0 ? `≈ ${(20 - cold * 0.4).toFixed(0)}°C` : 'room temp'} />
          </Panel>

          <Panel title="Controller">
            <ToggleRow
              label="Retuned cold-weather PID"
              sub={compensate ? 'active — compensating for torque derate' : 'baseline gains — uncompensated'}
              value={compensate}
              onChange={setCompensate}
            />
            <button
              onClick={() => setRunning((r) => !r)}
              style={{
                marginTop: 6, width: '100%', padding: '8px 10px', borderRadius: 3, cursor: 'pointer',
                background: running ? 'transparent' : COLOR.green, color: running ? COLOR.text : '#04140c',
                border: `1px solid ${running ? COLOR.border : COLOR.green}`, fontFamily: MONO, fontSize: 12,
              }}
            >
              {running ? 'PAUSE SIMULATION' : 'RESUME SIMULATION'}
            </button>
          </Panel>

          <Panel title="Pointing error (last ~9s)">
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke={COLOR.border} strokeDasharray="2 4" />
                  <XAxis dataKey="t" tick={{ fill: COLOR.dim, fontSize: 9, fontFamily: MONO }} axisLine={{ stroke: COLOR.border }} tickLine={false} />
                  <YAxis tick={{ fill: COLOR.dim, fontSize: 9, fontFamily: MONO }} axisLine={{ stroke: COLOR.border }} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ background: COLOR.panelAlt, border: `1px solid ${COLOR.border}`, fontSize: 11, fontFamily: MONO }}
                    labelStyle={{ color: COLOR.dim }}
                    formatter={(v) => [`${v}°`, 'error']}
                    labelFormatter={(v) => `t=${v}s`}
                  />
                  <Line type="monotone" dataKey="error" stroke={COLOR.green} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ border: `1px solid ${COLOR.border}`, borderRadius: 3, padding: 12, background: COLOR.panel }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 0.5, color: COLOR.dim, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function SliderRow({ label, value, onChange, unit, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontFamily: MONO, color: COLOR.dim }}>
          {value}{unit}{hint ? ` · ${hint}` : ''}
        </span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
    >
      <div style={{
        width: 34, height: 18, borderRadius: 10, background: value ? COLOR.green : COLOR.borderStrong,
        position: 'relative', flexShrink: 0, transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%',
          background: value ? '#04140c' : COLOR.dim, transition: 'left 0.15s',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 12.5 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: COLOR.dim, fontFamily: MONO }}>{sub}</div>
      </div>
    </div>
  );
}
