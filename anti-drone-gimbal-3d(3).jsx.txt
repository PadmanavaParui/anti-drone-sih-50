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

    // ---- physical parameters (named, unit-labeled) ----
    // These are representative order-of-magnitude values for a small EO/IR
    // tracking gimbal, NOT measured from real hardware — there is no logged
    // step-response / frequency-response data here to calibrate against, so
    // treat this as a physically-structured demo, not a validated plant model.
    const TARGET_R = 4.4; // m, target orbit radius used only for the visual path
    const PARAMS = {
      // Lumped single-axis inertia per gimbal axis (reflected through the gearbox).
      // This is NOT a full 3x3 inertia tensor — cross-axis Coriolis/centrifugal
      // coupling between yaw and pitch is not modeled. That's a reasonable
      // simplification for a slow-slewing 2-DOF gimbal but would matter for
      // a fast 3-axis (yaw/pitch/roll) platform.
      I_az: 0.9, I_el: 1.05,          // kg*m^2
      cViscBase: 0.55,                 // N*m*s/rad, viscous friction @ room temp
      cCoulombBase: 0.18,              // N*m, Coulomb (stiction-like) friction @ room temp
      tauMaxBase: 9,                   // N*m, continuous torque limit @ room temp
      tauRateMax: 60,                  // N*m/s, actuator slew-rate limit
      airDensity: 1.225,               // kg/m^3 (sea level, 15degC — not temperature-corrected)
      dragCoeff: 1.1,                  // Cd, bluff-body estimate for the sensor pod
      podArea: 0.045,                  // m^2, pod frontal area
      leverArm: 0.42,                  // m, pivot -> pod center-of-pressure distance
      encoderNoiseStd: 0.0006,         // rad (~0.03 deg), encoder quantization+noise floor
      bearingNoiseStd: 0.006,          // rad (~0.35 deg), EO/IR bearing-extraction noise
      filterAlpha: 0.35,               // single-pole low-pass coefficient (0..1)
    };

    // ---- physics / control / estimator state ----
    const phys = {
      t: 0,
      az: 0, azVel: 0,                 // TRUE plant state (ground truth)
      el: 0.15, elVel: 0,
      azInteg: 0, elInteg: 0,          // PID integral accumulators (anti-windup applied)
      tauAzPrev: 0, tauElPrev: 0,      // actuator slew-rate memory
      windSpeed: 0,                    // OU wind SPEED (m/s), converted to drag torque downstream
      targetNoiseAz: 0, targetNoiseEl: 0, // small OU process noise on the target path
      azMeasured: 0, elMeasured: 0,    // noisy encoder readings
      azEst: 0, elEst: 0,              // filtered angle estimate (controller feedback)
      azEstPrev: 0, elEstPrev: 0,
      azVelEst: 0, elVelEst: 0,        // filtered numerical derivative (controller feedback)
      bearingAzEst: 0, bearingElEst: 0.55, // filtered bearing estimate (controller setpoint)
      tp: new THREE.Vector3(0, 0, TARGET_R), // latest TRUE target position, for rendering
      lastErrDeg: 0,
      trailClock: 0,
      sampleClock: 0,
      errBuf: [],
    };
    const pivot = new THREE.Vector3(0, 1.1, 0);

    // Box-Muller transform for Gaussian noise (needed for a proper OU process and
    // for sensor noise; uniform noise gives the wrong statistics for either).
    function gaussianRandom() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function angDiff(target, current) {
      let d = target - current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    }

    function sphericalToUnit(az, el) {
      return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    }

    // PID with conditional-integration anti-windup: only accumulate the integral
    // term while doing so doesn't push torque further past saturation.
    function updateIntegral(current, err, vel, tMax, kp, ki, kd, dt) {
      const proposed = current + err * dt;
      const unclamped = kp * err + ki * proposed - kd * vel;
      const pushingDeeper = Math.abs(unclamped) > tMax && Math.sign(unclamped) === Math.sign(err) && err !== 0;
      return pushingDeeper ? current : proposed;
    }
    function pidTorqueRaw(err, vel, integ, kp, ki, kd) {
      return kp * err + ki * integ - kd * vel;
    }

    // Velocity Verlet (half-step velocity predictor, valid for velocity-dependent
    // forces like viscous damping): conserves energy far better under damping than
    // semi-implicit Euler, and — combined with the fixed-timestep loop below — no
    // longer depends on render frame rate.
    function stepVerlet(pos, vel, dt, accelFn) {
      const a0 = accelFn(pos, vel);
      const velHalf = vel + 0.5 * a0 * dt;
      const posNew = pos + velHalf * dt;
      const a1 = accelFn(posNew, velHalf);
      const velNew = velHalf + 0.5 * a1 * dt;
      return [posNew, velNew];
    }

    // ---- fixed-timestep plant + sensor + estimator + controller step ----
    // Runs at a fixed rate (SIM_DT below), independent of the render's requestAnimationFrame
    // cadence, so simulated dynamics don't change with the browser's frame rate.
    function stepSimulation(dt) {
      phys.t += dt;
      const { wind, cold, compensate } = paramsRef.current;
      const coldF = cold / 100;
      const windF = wind / 100;

      // ---- target path: deterministic base + small OU process noise ----
      // (A real target would be a flight-dynamics model with mass/thrust/drag and
      // its own autopilot; that's out of scope here. This just keeps the path from
      // being perfectly, predictably deterministic.)
      const NOISE_THETA = 1.5, NOISE_SIGMA = 0.05;
      phys.targetNoiseAz += -NOISE_THETA * phys.targetNoiseAz * dt + NOISE_SIGMA * Math.sqrt(dt) * gaussianRandom();
      phys.targetNoiseEl += -NOISE_THETA * phys.targetNoiseEl * dt + NOISE_SIGMA * Math.sqrt(dt) * gaussianRandom();
      const az = phys.t * 0.42 + Math.sin(phys.t * 0.7) * 0.32 + phys.targetNoiseAz;
      const el = Math.max(0.05, Math.min(1.25,
        0.55 + Math.sin(phys.t * 0.9) * 0.18 + Math.sin(phys.t * 0.23) * 0.08 + phys.targetNoiseEl));
      const horiz = TARGET_R * Math.cos(el);
      phys.tp.set(pivot.x + horiz * Math.sin(az), pivot.y + TARGET_R * Math.sin(el), pivot.z + horiz * Math.cos(az));

      const rel = phys.tp.clone().sub(pivot);
      const trueBearingAz = Math.atan2(rel.x, rel.z);
      const horizDist = Math.sqrt(rel.x * rel.x + rel.z * rel.z);
      const trueBearingEl = Math.atan2(rel.y, horizDist);

      // ---- sensors: noisy encoder + noisy bearing measurement ----
      phys.azMeasured = phys.az + PARAMS.encoderNoiseStd * gaussianRandom();
      phys.elMeasured = phys.el + PARAMS.encoderNoiseStd * gaussianRandom();
      const measBearingAz = trueBearingAz + PARAMS.bearingNoiseStd * gaussianRandom();
      const measBearingEl = trueBearingEl + PARAMS.bearingNoiseStd * gaussianRandom();

      // ---- estimator: single-pole low-pass filter ----
      // This is a simplified stand-in for a proper Kalman/EKF (no formal noise
      // covariance model, no latency modeling) — good enough to show that the
      // controller reacts to filtered noisy measurements rather than ground truth,
      // not a validated estimator.
      phys.azEst += PARAMS.filterAlpha * (phys.azMeasured - phys.azEst);
      phys.elEst += PARAMS.filterAlpha * (phys.elMeasured - phys.elEst);
      phys.bearingAzEst += PARAMS.filterAlpha * angDiff(measBearingAz, phys.bearingAzEst);
      phys.bearingElEst += PARAMS.filterAlpha * (measBearingEl - phys.bearingElEst);
      // velocity estimate: numerical derivative of the filtered angle, itself
      // low-pass filtered (derivative filtering keeps sensor noise from being
      // amplified into the D term, per standard PID practice).
      const azVelRaw = (phys.azEst - phys.azEstPrev) / dt;
      const elVelRaw = (phys.elEst - phys.elEstPrev) / dt;
      phys.azVelEst += PARAMS.filterAlpha * (azVelRaw - phys.azVelEst);
      phys.elVelEst += PARAMS.filterAlpha * (elVelRaw - phys.elVelEst);
      phys.azEstPrev = phys.azEst;
      phys.elEstPrev = phys.elEst;

      // ---- environment: wind as velocity -> drag force -> torque ----
      const OU_THETA = 0.8, OU_SIGMA = 3.0 * windF; // m/s gust intensity, scaled by UI slider
      phys.windSpeed += -OU_THETA * phys.windSpeed * dt + OU_SIGMA * Math.sqrt(dt) * gaussianRandom();
      const vWind = new THREE.Vector3(phys.windSpeed, 0, phys.windSpeed * 0.3);
      const speed = vWind.length();
      const dragMag = 0.5 * PARAMS.airDensity * PARAMS.dragCoeff * PARAMS.podArea * speed * speed;
      const dragForce = speed > 1e-6 ? vWind.clone().normalize().multiplyScalar(dragMag) : new THREE.Vector3();
      const leverVec = sphericalToUnit(phys.az, phys.el).multiplyScalar(PARAMS.leverArm);
      const windTorqueVec = new THREE.Vector3().crossVectors(leverVec, dragForce); // tau = r x F
      const pitchAxisWorld = new THREE.Vector3(Math.cos(phys.az), 0, -Math.sin(phys.az)); // local pitch axis in world frame
      const tauWindAz = windTorqueVec.y;
      const tauWindEl = windTorqueVec.dot(pitchAxisWorld);

      // ---- controller gains + actuator/friction limits (cold-dependent) ----
      const torqueMax = PARAMS.tauMaxBase * (1 - coldF * 0.55); // motor torque derates in the cold
      const kp = compensate ? 7 + coldF * 4 : 5.5;
      const ki = compensate ? 1.6 : 0.35; // integral term kills steady-state wind drift
      const kd = compensate ? 3.2 + coldF * 1.5 : 2.4;
      const cVisc = PARAMS.cViscBase * (1 + coldF * 0.9);       // viscous term grows in the cold
      const cCoulomb = PARAMS.cCoulombBase * (1 + coldF * 1.3); // stiction grows faster in the cold

      // ---- controller: runs on ESTIMATED state, not ground truth ----
      const azErr0 = angDiff(phys.bearingAzEst, phys.azEst);
      phys.azInteg = updateIntegral(phys.azInteg, azErr0, phys.azVelEst, torqueMax, kp, ki, kd, dt);
      const elErr0 = phys.bearingElEst - phys.elEst;
      phys.elInteg = updateIntegral(phys.elInteg, elErr0, phys.elVelEst, torqueMax, kp, ki, kd, dt);

      // Spherical cross-axis coupling: near zenith, azimuth rotation barely moves
      // the pointing direction in the inertial frame, so scale its effective
      // torque authority by cos(elevation) to reproduce real high-el slowdown.
      const cosEl = Math.max(Math.cos(phys.elEst), 0.12);

      function actuatorLimit(tauCmd, prevTau) {
        const sat = Math.max(-torqueMax, Math.min(torqueMax, tauCmd));
        const maxStep = PARAMS.tauRateMax * dt;
        return Math.max(prevTau - maxStep, Math.min(prevTau + maxStep, sat));
      }

      const azRawTorque = pidTorqueRaw(azErr0, phys.azVelEst, phys.azInteg, kp, ki, kd) * cosEl;
      const tauAzCmd = actuatorLimit(azRawTorque, phys.tauAzPrev);
      phys.tauAzPrev = tauAzCmd;
      const elRawTorque = pidTorqueRaw(elErr0, phys.elVelEst, phys.elInteg, kp, ki, kd);
      const tauElCmd = actuatorLimit(elRawTorque, phys.tauElPrev);
      phys.tauElPrev = tauElCmd;

      // ---- plant: TRUE rigid-body dynamics ----
      // torque balance: I*alpha = tau_motor + tau_wind + tau_friction
      //   tau_friction = -c_visc*omega - c_coulomb*tanh(omega/eps)  (smoothed Coulomb term
      //   avoids the numerical chatter a hard sign() would cause near zero velocity)
      const [nAz, nAzVel] = stepVerlet(phys.az, phys.azVel, dt, (p, v) => {
        const fric = -cVisc * v - cCoulomb * Math.tanh(v / 0.01);
        return (tauAzCmd + tauWindAz + fric) / PARAMS.I_az;
      });
      phys.az = nAz; phys.azVel = nAzVel;

      const [nEl, nElVel] = stepVerlet(phys.el, phys.elVel, dt, (p, v) => {
        const fric = -cVisc * v - cCoulomb * Math.tanh(v / 0.01);
        return (tauElCmd + tauWindEl + fric) / PARAMS.I_el;
      });
      phys.el = Math.max(-0.3, Math.min(1.3, nEl));
      phys.elVel = nElVel;

      // ---- true angular separation (ground truth, for the HUD) ----
      // theta = arccos(u . v), not a Manhattan sum of per-axis errors (which
      // over/under-states error by up to ~41% off-axis).
      const pointDir = sphericalToUnit(phys.az, phys.el);
      const targetDir = rel.clone().normalize();
      const cosSep = Math.max(-1, Math.min(1, pointDir.dot(targetDir)));
      phys.lastErrDeg = Math.acos(cosSep) * 180 / Math.PI;

      // trail sampled on its own slow clock, independent of the physics rate
      phys.trailClock += dt;
      if (phys.trailClock > 0.12) {
        phys.trailClock = 0;
        trailBuf.push(phys.tp.clone());
        if (trailBuf.length > TRAIL_LEN) trailBuf.shift();
      }

      phys.sampleClock += dt;
      if (phys.sampleClock > 0.22) {
        phys.sampleClock = 0;
        phys.errBuf.push(phys.lastErrDeg);
        if (phys.errBuf.length > 400) phys.errBuf.shift();
        const recent = phys.errBuf.slice(-40);
        const rms = Math.sqrt(recent.reduce((s, v) => s + v * v, 0) / recent.length);
        setTelemetry({
          error: phys.lastErrDeg,
          rms,
          lock: phys.lastErrDeg < 6 ? 'LOCKED' : phys.lastErrDeg < 15 ? 'TRACKING' : 'DRIFT',
        });
        setHistory((h) => [...h, { t: Math.round(phys.t * 10) / 10, error: Math.round(phys.lastErrDeg * 10) / 10 }].slice(-40));
      }
    }

    let raf;
    const clock = new THREE.Clock();
    const SIM_DT = 1 / 240; // fixed physics step (240 Hz), decoupled from render FPS
    const MAX_STEPS_PER_FRAME = 12; // avoid a spiral of death if the tab was backgrounded
    let accumulator = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      const frameDt = Math.min(clock.getDelta(), 0.1);
      const { running } = paramsRef.current;

      if (running) {
        accumulator += frameDt;
        let steps = 0;
        while (accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
          stepSimulation(SIM_DT);
          accumulator -= SIM_DT;
          steps++;
        }
      } else {
        accumulator = 0;
      }

      // ---- visuals: refreshed every render frame from the latest plant state ----
      droneGroup.position.copy(phys.tp);
      droneGroup.rotation.y += frameDt * 6; // cosmetic spin only, not part of the plant
      yawGroup.rotation.y = phys.az;
      pitchGroup.rotation.x = -phys.el;

      const podWorldPos = new THREE.Vector3();
      lens.getWorldPosition(podWorldPos);
      beam.geometry.setFromPoints([podWorldPos, phys.tp]);
      beam.material.color.setHex(parseInt(statusColor(phys.lastErrDeg).slice(1), 16));

      for (let i = 0; i < TRAIL_LEN; i++) {
        const p = trailBuf[i] || phys.tp;
        trailPositions[i * 3] = p.x;
        trailPositions[i * 3 + 1] = p.y;
        trailPositions[i * 3 + 2] = p.z;
      }
      trailGeom.attributes.position.needsUpdate = true;

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
