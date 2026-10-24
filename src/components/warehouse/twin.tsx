"use client";

// The warehouse digital twin: every pallet position as an instanced box in its
// rack (blue uprights, orange beams, like real pallet racking), dock doors with
// the trucks that are at them right now, and the AMR fleet driving the aisles.
// "Explode" lifts levels and spreads rows apart so the inner bins can be seen.
// It only draws when something changes (every frame only while robots drive),
// stops while it is scrolled out of view, and redraws shadows only when
// something that casts one has moved.
import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { countAge, SKU } from "@/data/warehouses";
import type { Bin, DockAppt, Warehouse } from "@/data/types";

export type ColorMode = "status" | "abc" | "fill" | "temp" | "expiry" | "count";

export interface TwinProps {
  warehouse: Warehouse;
  bins: Bin[];
  docks: DockAppt[];
  mode: ColorMode;
  explode: number;
  showEmpty: boolean;
  showRobots: boolean;
  dark: boolean;
  selected: string | null;
  onSelect: (loc: string | null) => void;
  onHover: (bin: Bin | null) => void;
  /** Bumped to fly the camera back to the overview. */
  resetKey: number;
  /** A position to centre on (from the inventory list). */
  focusLoc: string | null;
  /** Bumped with every request, so the same position can be centred again. */
  focusKey: number;
  /** Market time, for which doors have a truck at them. */
  now: number;
  /** Shown inside the <canvas> by browsers that can't draw it. */
  fallback?: ReactNode;
}

// Phones and tablets: fewer pixels, no MSAA and a smaller shadow map. The GPU is the
// bottleneck there, not JS. (This module only loads in the browser.)
const PHONE = typeof window !== "undefined" && window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
// The shadow map is drawn again only when a frame sets needsUpdate (racks, bins or trucks moved).
const SHADOWS: Partial<THREE.WebGLShadowMap> = { type: THREE.PCFShadowMap, autoUpdate: false };

// Metres.
const PITCH_X = 1.4;
const LEVEL_H = 1.55;
const DEPTH = 1.15;
const AISLE = 3.2;
const STAGING = 11;
const BOX = { x: 1.12, y: 1.15, z: 1.0 };
const FOCUS_OFFSET = new THREE.Vector3(-9, 9, 11);

const rowZ = (r: number) => AISLE + r * DEPTH + Math.floor(r / 2) * AISLE + DEPTH / 2;

// The explode transform. Everything that stands on a level, a row or an aisle (racks,
// bins, the selection outline, floor zones, robots) goes through these two.
const explodeY = (level: number, e: number) => level * LEVEL_H * (1 + e * 0.9);
const explodeZ = (z: number, e: number, cz: number) => cz + (z - cz) * (1 + e * 0.7);

function layout(w: Warehouse) {
  const width = w.bays * PITCH_X;
  const depth = rowZ(w.rows - 1) + DEPTH / 2 + AISLE;
  const height = w.levels * LEVEL_H + 1.8;
  return { width, depth, height, cz: depth / 2 };
}
type Layout = ReturnType<typeof layout>;

function binPosition(b: Pick<Bin, "row" | "bay" | "level">, ex: number, cz: number, out: THREE.Vector3) {
  return out.set(b.bay * PITCH_X + PITCH_X / 2, 0.16 + explodeY(b.level, ex) + BOX.y / 2, explodeZ(rowZ(b.row), ex, cz));
}

/**
 * The overview camera. A portrait canvas has a narrower horizontal field of view, so the camera
 * stands further back there; never beyond the controls' maxDistance, or it could not get there.
 */
function overview(L: Layout, aspect: number) {
  const size = Math.max(L.width + STAGING, L.depth);
  const target = new THREE.Vector3((L.width - STAGING) / 2 + 2, 2, L.depth / 2);
  const offset = new THREE.Vector3(-STAGING - size * 0.55, size * 0.62, L.depth + size * 0.55).sub(target);
  const k = Math.min(Math.max(1, 1.3 / (aspect || 1)), (size * 3 * 0.95) / offset.length());
  return { target, cam: offset.multiplyScalar(k).add(target) };
}

const PALETTE = {
  dark: {
    stored: "#9a7b55",
    reserved: "#a78bfa",
    picking: "#ff8a3d",
    blocked: "#f87171",
    quarantine: "#fbbf24",
    empty: "#3a4758",
    upright: "#2f5fb3",
    beam: "#e0702a",
    floor: "#0f151c",
    grid: "#1c2633",
    section: "#2a384a",
    wall: "#5eead4",
    door: "#1c2531",
    doorBusy: "#ff8a3d",
    trailer: "#cfd6df",
    cab: "#2dd4bf",
    robot: "#ff8a3d",
    robotLight: "#a3e635",
    fillLo: "#173b38",
    fillHi: "#5eead4",
    select: "#ffffff",
    zone: { ambient: "#000000", chilled: "#1d4ed8", frozen: "#60a5fa", bonded: "#f59e0b" },
  },
  light: {
    stored: "#c39a68",
    reserved: "#7c4fe0",
    picking: "#e4620c",
    blocked: "#d32f2f",
    quarantine: "#d18a06",
    empty: "#cdc8bd",
    upright: "#2563eb",
    beam: "#ea6a1a",
    floor: "#e7e5df",
    grid: "#d3cfc6",
    section: "#bdb7aa",
    wall: "#0c8f81",
    door: "#cfcac0",
    doorBusy: "#e4620c",
    trailer: "#f4f4f2",
    cab: "#0c8f81",
    robot: "#e4620c",
    robotLight: "#4d8a0b",
    fillLo: "#d8f1ec",
    fillHi: "#0a7a6e",
    select: "#0d1218",
    zone: { ambient: "#000000", chilled: "#3b82f6", frozen: "#93c5fd", bonded: "#f59e0b" },
  },
};

const TEMP_RAMP = ["#3b82f6", "#22d3ee", "#a3e635", "#fb923c", "#ef4444"].map((c) => new THREE.Color(c));

function rampColor(t: number, out: THREE.Color) {
  const x = Math.min(0.999, Math.max(0, t)) * (TEMP_RAMP.length - 1);
  const i = Math.floor(x);
  return out.copy(TEMP_RAMP[i]).lerp(TEMP_RAMP[i + 1], x - i);
}

export function binColor(b: Bin, mode: ColorMode, dark: boolean, out: THREE.Color): THREE.Color {
  const p = dark ? PALETTE.dark : PALETTE.light;
  if (b.status === "empty") return out.set(p.empty);
  switch (mode) {
    case "status":
      return out.set(b.status === "stored" ? p.stored : p[b.status]);
    case "abc":
      return out.set(b.abc === "A" ? (dark ? "#34d399" : "#059669") : b.abc === "B" ? (dark ? "#60a5fa" : "#2563eb") : dark ? "#64748b" : "#94a3b8");
    case "fill": {
      const sku = b.sku ? SKU.get(b.sku) : undefined;
      const t = sku && b.qty ? b.qty / sku.perPallet : 0;
      return out.set(p.fillLo).lerp(new THREE.Color(p.fillHi), Math.min(1, t));
    }
    case "temp":
      return rampColor(((b.tempC ?? 16) + 24) / 46, out);
    case "expiry":
      return out.set(b.expiryDays === undefined ? (dark ? "#475569" : "#b6bfcb") : b.expiryDays <= 30 ? "#ef4444" : b.expiryDays <= 90 ? "#f59e0b" : "#22c55e");
    case "count": {
      // Due, due within the last quarter of its interval, or up to date (muted, so the worklist stands out).
      const age = countAge(b);
      return out.set(age >= 1 ? "#ef4444" : age >= 0.75 ? "#f59e0b" : dark ? "#334155" : "#cbd5e1");
    }
  }
}

function Racks({ w, ex, dark }: { w: Warehouse; ex: React.RefObject<number>; dark: boolean }) {
  const up = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const L = useMemo(() => layout(w), [w]);
  const nUp = w.rows * (w.bays + 1) * 2;
  const nBeam = w.rows * w.levels * 2;
  const last = useRef(-1);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state) => {
    const e = ex.current ?? 0;
    if (Math.abs(e - last.current) < 1e-4 || !up.current || !beams.current) return;
    last.current = e;
    let i = 0;
    let j = 0;
    const rackH = explodeY(w.levels - 1, e) + LEVEL_H;
    for (let r = 0; r < w.rows; r++) {
      const z0 = binPosition({ row: r, bay: 0, level: 0 }, e, L.cz, pos).z;
      for (let b = 0; b <= w.bays; b++) {
        for (const side of [-1, 1]) {
          pos.set(b * PITCH_X, rackH / 2, z0 + (side * DEPTH) / 2.15);
          scl.set(0.08, rackH, 0.08);
          up.current.setMatrixAt(i++, m.compose(pos, q, scl));
        }
      }
      for (let l = 0; l < w.levels; l++) {
        const y = 0.1 + explodeY(l, e);
        for (const side of [-1, 1]) {
          pos.set((w.bays * PITCH_X) / 2, y, z0 + (side * DEPTH) / 2.15);
          scl.set(w.bays * PITCH_X, 0.12, 0.07);
          beams.current.setMatrixAt(j++, m.compose(pos, q, scl));
        }
      }
    }
    up.current.instanceMatrix.needsUpdate = true;
    beams.current.instanceMatrix.needsUpdate = true;
    up.current.computeBoundingSphere();
    beams.current.computeBoundingSphere();
    state.gl.shadowMap.needsUpdate = true;
  });

  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group>
      <instancedMesh ref={up} args={[undefined, undefined, nUp]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={p.upright} metalness={0.4} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={beams} args={[undefined, undefined, nBeam]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={p.beam} metalness={0.3} roughness={0.55} />
      </instancedMesh>
    </group>
  );
}

function Bins({ w, bins, ex, mode, dark, showEmpty, selected, onSelect, onHover }: { w: Warehouse; bins: Bin[]; ex: React.RefObject<number>; mode: ColorMode; dark: boolean; showEmpty: boolean; selected: string | null; onSelect: (loc: string | null) => void; onHover: (b: Bin | null) => void }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const sel = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const L = useMemo(() => layout(w), [w]);
  const shown = useMemo(() => (showEmpty ? bins : bins.filter((b) => b.status !== "empty")), [bins, showEmpty]);
  const last = useRef(-1);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const ghost = useMemo(() => new THREE.Vector3(0.96, 0.18, 0.96), []);

  // New bins (warehouse change, a pick, a move): matrices and colours again.
  useEffect(() => {
    last.current = -1;
    const im = mesh.current;
    if (!im) return;
    const c = new THREE.Color();
    shown.forEach((b, i) => im.setColorAt(i, binColor(b, mode, dark, c)));
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    invalidate();
  }, [shown, mode, dark, invalidate]);
  // The outline moves to the new selection on the next frame.
  useEffect(() => invalidate(), [selected, invalidate]);

  useFrame((state) => {
    const e = ex.current ?? 0;
    const im = mesh.current;
    if (!im) return;
    if (Math.abs(e - last.current) >= 1e-4) {
      last.current = e;
      shown.forEach((b, i) => {
        binPosition(b, e, L.cz, pos);
        if (b.status === "empty") pos.y -= BOX.y / 2 - 0.12;
        im.setMatrixAt(i, m.compose(pos, q, b.status === "empty" ? ghost : one));
      });
      im.count = shown.length;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      state.gl.shadowMap.needsUpdate = true;
    }
    const s = selected ? bins.find((b) => b.loc === selected) : undefined;
    if (sel.current) {
      sel.current.visible = !!s;
      if (s) binPosition(s, e, L.cz, sel.current.position);
    }
  });

  // Stable handlers: R3F compares them by reference, and a new one asks for a frame on every re-render (each market second).
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // R3F also clicks at the end of a mouse drag that started on a pallet: that was an orbit, not a pick.
      if (e.delta > 4) return;
      onSelect((e.instanceId !== undefined ? shown[e.instanceId] : undefined)?.loc ?? null);
    },
    [shown, onSelect],
  );
  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover((e.instanceId !== undefined ? shown[e.instanceId] : undefined) ?? null);
    },
    [shown, onHover],
  );
  const onPointerOut = useCallback(() => onHover(null), [onHover]);
  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group>
      <instancedMesh
        key={`${w.id}-${shown.length}`}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, shown.length)]}
        castShadow
        receiveShadow
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
      >
        <boxGeometry args={[BOX.x, BOX.y, BOX.z]} />
        <meshStandardMaterial roughness={0.85} metalness={0.02} />
      </instancedMesh>
      <mesh ref={sel} visible={false}>
        <boxGeometry args={[BOX.x + 0.18, BOX.y + 0.18, BOX.z + 0.18]} />
        <meshBasicMaterial color={p.select} wireframe transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** Temperature and customs zones on the floor, under the rows they belong to (they spread with them). */
function Zones({ w, ex, dark }: { w: Warehouse; ex: React.RefObject<number>; dark: boolean }) {
  const group = useRef<THREE.Group>(null);
  const L = useMemo(() => layout(w), [w]);
  const zones = useMemo(() => w.rowZones.map((z, r) => ({ z, r })).filter((x) => x.z !== "ambient"), [w]);
  const last = useRef(-1);
  useFrame(() => {
    const e = ex.current ?? 0;
    const g = group.current;
    if (!g || Math.abs(e - last.current) < 1e-4) return;
    last.current = e;
    g.children.forEach((child, i) => {
      const zone = zones[i];
      if (zone) child.position.z = explodeZ(rowZ(zone.r), e, L.cz);
    });
  });
  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group ref={group}>
      {zones.map(({ z, r }) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position={[(w.bays * PITCH_X) / 2, 0.012, rowZ(r)]}>
          <planeGeometry args={[w.bays * PITCH_X + 0.8, DEPTH + 0.5]} />
          <meshBasicMaterial color={p.zone[z]} transparent opacity={dark ? 0.28 : 0.22} />
        </mesh>
      ))}
    </group>
  );
}

function Shell({ w, dark, docks, now }: { w: Warehouse; dark: boolean; docks: DockAppt[]; now: number }) {
  const L = useMemo(() => layout(w), [w]);
  const p = dark ? PALETTE.dark : PALETTE.light;
  const edges = useMemo(() => {
    const g = new THREE.BoxGeometry(L.width + STAGING + 2, L.height + 1.5, L.depth);
    return new THREE.EdgesGeometry(g);
  }, [L]);
  // Doors, trailers and wheels fit the door pitch, so neighbours never overlap on a short wall (Pasaia: 8 doors on 19.7 m).
  const pitch = L.depth / w.doors;
  const slab = Math.min(3, pitch - 0.3);
  const truckW = Math.min(2.5, pitch - 0.15);
  const doorZ = (i: number) => (i + 0.5) * pitch;
  const busy = new Map<number, DockAppt>();
  for (const a of docks) if (a.warehouseId === w.id && now >= a.start - 10 * 60_000 && now < a.end) busy.set(a.door, a);
  // Trucks cast shadows: draw the shadow map again when one arrives or leaves.
  const busyKey = [...busy.keys()].sort((a, b) => a - b).join(",");
  const shadowKey = useRef<string | null>(null);
  useFrame((state) => {
    if (shadowKey.current === busyKey) return;
    shadowKey.current = busyKey;
    state.gl.shadowMap.needsUpdate = true;
  });
  return (
    <group>
      <lineSegments geometry={edges} position={[(L.width - STAGING) / 2, (L.height + 1.5) / 2, L.depth / 2]}>
        <lineBasicMaterial color={p.wall} transparent opacity={0.35} />
      </lineSegments>
      {/* back wall, for a sense of the building */}
      <mesh position={[(L.width - STAGING) / 2, (L.height + 1.5) / 2, -0.02]} receiveShadow>
        <planeGeometry args={[L.width + STAGING + 2, L.height + 1.5]} />
        <meshStandardMaterial color={p.wall} transparent opacity={dark ? 0.05 : 0.07} side={THREE.DoubleSide} />
      </mesh>
      {/* dock doors and the trucks at them */}
      {Array.from({ length: w.doors }, (_, i) => {
        const a = busy.get(i);
        const z = doorZ(i);
        return (
          <group key={i} position={[-STAGING, 0, z]}>
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[0.25, 3.6, slab]} />
              <meshStandardMaterial color={a ? p.doorBusy : p.door} emissive={a ? p.doorBusy : "#000000"} emissiveIntensity={a ? 0.35 : 0} />
            </mesh>
            {a ? (
              <group position={[-7.6, 0, 0]}>
                <mesh position={[0, 2.3, 0]} castShadow>
                  <boxGeometry args={[13.6, 3.2, truckW]} />
                  <meshStandardMaterial color={p.trailer} roughness={0.6} />
                </mesh>
                <mesh position={[-8.2, 1.8, 0]} castShadow>
                  <boxGeometry args={[2.4, 2.9, truckW]} />
                  <meshStandardMaterial color={a.direction === "in" ? p.cab : p.doorBusy} roughness={0.4} metalness={0.2} />
                </mesh>
                {[-5.5, -4.2, 4.6, 5.9, -8.4].map((x) => (
                  <mesh key={x} position={[x, 0.5, 0]} rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, truckW + 0.1, 14]} />
                    <meshStandardMaterial color="#1f2328" roughness={0.9} />
                  </mesh>
                ))}
              </group>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

function Robots({ w, dark, ex }: { w: Warehouse; dark: boolean; ex: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  // Own clock: R3F restarts its clock whenever the frame loop changes (scrolling the twin away and back).
  const t = useRef(0);
  const L = useMemo(() => layout(w), [w]);
  const pairs = Math.ceil(w.rows / 2);
  const bots = useMemo(
    () =>
      Array.from({ length: w.amr }, (_, i) => ({
        aisle: i % (pairs + 1),
        speed: 0.9 + ((i * 37) % 10) / 12,
        phase: (i * 1.7) % 6,
      })),
    [w.amr, pairs],
  );
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    t.current += Math.min(delta, 0.1);
    const e = ex.current ?? 0;
    g.children.forEach((child, i) => {
      const b = bots[i];
      if (!b) return;
      const span = L.width + STAGING - 3;
      const a = t.current * b.speed * 0.25 + b.phase;
      const x = -STAGING + 1.5 + ((Math.sin(a) + 1) / 2) * span;
      // Aisle 0 runs along the back wall; aisle k between row pairs, so it stays midway when they spread.
      const z = Math.min(L.depth - 0.8, b.aisle === 0 ? AISLE / 2 : rowZ(b.aisle * 2 - 1) + DEPTH / 2 + AISLE / 2);
      child.position.set(x, 0.2, explodeZ(z, e, L.cz));
      child.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
    });
  });
  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group ref={group}>
      {bots.map((_, i) => (
        // No shadows: a 30 cm robot casts none you'd see from up here, and it would redraw the shadow map every frame.
        <group key={i}>
          <mesh>
            <boxGeometry args={[0.95, 0.32, 0.65]} />
            <meshStandardMaterial color={p.robot} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0.3, 0.2, 0]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color={p.robotLight} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Explode({ target, valueRef }: { target: number; valueRef: React.RefObject<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [target, invalidate]);
  useFrame((state, delta) => {
    const v = valueRef.current ?? 0;
    if (v === target) return;
    // On demand, delta is the time since the last frame drawn, which can be minutes: clamp it, or the first step jumps.
    valueRef.current = Math.abs(v - target) < 1e-3 ? target : THREE.MathUtils.damp(v, target, 7, Math.min(delta, 0.1));
    if (valueRef.current !== target) state.invalidate();
  });
  return null;
}

function CameraRig({
  w,
  bins,
  explode,
  resetKey,
  focusLoc,
  focusKey,
  controls,
}: {
  w: Warehouse;
  bins: Bin[];
  explode: number;
  resetKey: number;
  focusLoc: string | null;
  focusKey: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const L = useMemo(() => layout(w), [w]);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  // Where the camera is flying to, and for how many more seconds it tries.
  const goal = useRef<{ target: THREE.Vector3; cam: THREE.Vector3; left: number } | null>(null);
  const first = useRef(true);

  // The overview, on mount, on a warehouse change and on "Reset view". The canvas size is read
  // only then, so a phone's URL bar showing or hiding doesn't fly the camera back.
  useEffect(() => {
    const { size, camera } = get();
    const o = overview(L, size.width / size.height);
    const c = controls.current;
    if (first.current && c) {
      // The first view starts there instead of flying in from the default camera.
      first.current = false;
      camera.position.copy(o.cam);
      c.target.copy(o.target);
      c.update();
    } else goal.current = { ...o, left: 3 };
    invalidate();
  }, [L, resetKey, get, invalidate, controls]);

  // Centre on a position, again each time one is asked for (focusKey), even the same one.
  const flyTo = useEffectEvent((loc: string) => {
    const b = bins.find((x) => x.loc === loc);
    if (!b) return;
    const target = binPosition(b, explode, L.cz, new THREE.Vector3());
    goal.current = { target, cam: target.clone().add(FOCUS_OFFSET), left: 3 };
    invalidate();
  });
  useEffect(() => {
    if (focusLoc) flyTo(focusLoc);
  }, [focusLoc, focusKey]);

  // The user grabs the camera (drag, wheel, pinch): stop flying instead of fighting them.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      goal.current = null;
    };
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, [controls]);

  useFrame(({ camera }, delta) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    // Clamped like Explode's: the first frame after a pause would otherwise land in one jump.
    const dt = Math.min(delta, 0.1);
    const k = 1 - Math.exp(-dt * 4);
    c.target.lerp(g.target, k);
    camera.position.lerp(g.cam, k);
    c.update();
    g.left -= dt;
    if (g.left <= 0 || (c.target.distanceTo(g.target) < 0.02 && camera.position.distanceTo(g.cam) < 0.05)) goal.current = null;
    else invalidate();
  });
  return null;
}

/**
 * three r186 keeps one DFG lookup texture for every renderer and never disposes
 * it, while each renderer that uploads it adds a "dispose" listener closing over
 * its GL state: every twin left its renderer and canvas reachable (~0.35 MB a
 * visit). Disposing that texture when the twin goes away releases them; the next
 * renderer uploads it again.
 */
function ReleaseSharedTextures() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const shared = useRef<THREE.Texture | null>(null);
  useFrame(() => {
    if (shared.current) return;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        const lut = (gl.properties.get(mat) as { uniforms?: { dfgLUT?: { value: unknown } } }).uniforms?.dfgLUT?.value;
        if (lut instanceof THREE.Texture) shared.current = lut;
      }
    });
  });
  useEffect(() => () => shared.current?.dispose(), []);
  return null;
}

export default function Twin(props: TwinProps) {
  const { warehouse: w, dark, onSelect } = props;
  // Stable for the same reason as the pallet handlers: a new Canvas callback is a store update, and that draws a frame.
  const onMissed = useCallback(() => onSelect(null), [onSelect]);
  const p = dark ? PALETTE.dark : PALETTE.light;
  const L = useMemo(() => layout(w), [w]);
  const ex = useRef(props.explode);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const size = Math.max(L.width + STAGING, L.depth);

  // Nothing to draw while the twin is scrolled out of view (phones: the tabs below it).
  const box = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Entries come in order: the last one is where the twin is now.
    const io = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="size-full">
      <Canvas
        fallback={props.fallback}
        shadows={SHADOWS}
        dpr={PHONE ? [1, 1.5] : [1, 2]}
        // Robots move every frame; without them a frame is drawn only when something invalidates it.
        frameloop={!onScreen ? "never" : props.showRobots ? "always" : "demand"}
        camera={{ position: [-STAGING - size * 0.55, size * 0.62, L.depth + size * 0.55], fov: 42, near: 0.5, far: 600 }}
        gl={{ antialias: !PHONE, preserveDrawingBuffer: false }}
        // A restored context comes back blank: nothing else would ask for a frame or for the shadows again.
        onCreated={({ gl, invalidate }) =>
          gl.domElement.addEventListener("webglcontextrestored", () => {
            gl.shadowMap.needsUpdate = true;
            invalidate();
          })
        }
        onPointerMissed={onMissed}
      >
        <color attach="background" args={[dark ? "#0b1118" : "#f1f0eb"]} />
        <fog attach="fog" args={[dark ? "#0b1118" : "#f1f0eb", size * 1.6, size * 4]} />
        <hemisphereLight args={[dark ? "#a9c4ff" : "#ffffff", dark ? "#151b22" : "#d9d4c8", dark ? 0.55 : 0.9]} />
        <ambientLight intensity={dark ? 0.25 : 0.35} />
        <directionalLight
          position={[-L.width * 0.4, L.height * 4, L.depth * 1.3]}
          intensity={dark ? 1.25 : 1.6}
          castShadow
          shadow-mapSize={PHONE ? [1024, 1024] : [2048, 2048]}
          shadow-camera-left={-size}
          shadow-camera-right={size}
          shadow-camera-top={size}
          shadow-camera-bottom={-size}
          shadow-camera-near={1}
          shadow-camera-far={size * 6}
          shadow-bias={-0.0004}
        />
        <mesh rotation-x={-Math.PI / 2} position={[(L.width - STAGING) / 2, 0, L.depth / 2]} receiveShadow>
          <planeGeometry args={[L.width + STAGING + 60, L.depth + 60]} />
          <meshStandardMaterial color={p.floor} roughness={0.95} />
        </mesh>
        <Grid
          position={[(L.width - STAGING) / 2, 0.01, L.depth / 2]}
          args={[L.width + STAGING + 40, L.depth + 40]}
          cellSize={1}
          cellThickness={0.6}
          cellColor={p.grid}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={p.section}
          fadeDistance={size * 3}
          fadeStrength={1.2}
        />
        <Explode target={props.explode} valueRef={ex} />
        <Shell w={w} dark={dark} docks={props.docks} now={props.now} />
        <Zones key={`zones-${w.id}`} w={w} ex={ex} dark={dark} />
        <Racks key={`racks-${w.id}`} w={w} ex={ex} dark={dark} />
        <Bins w={w} bins={props.bins} ex={ex} mode={props.mode} dark={dark} showEmpty={props.showEmpty} selected={props.selected} onSelect={props.onSelect} onHover={props.onHover} />
        {props.showRobots ? <Robots w={w} dark={dark} ex={ex} /> : null}
        <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.08} minDistance={6} maxDistance={size * 3} target={[(L.width - STAGING) / 2 + 2, 2, L.depth / 2]} />
        <CameraRig w={w} bins={props.bins} explode={props.explode} resetKey={props.resetKey} focusLoc={props.focusLoc} focusKey={props.focusKey} controls={controls} />
        <ReleaseSharedTextures />
      </Canvas>
    </div>
  );
}
