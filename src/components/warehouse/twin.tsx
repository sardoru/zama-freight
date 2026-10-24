"use client";

// The warehouse digital twin: every pallet position as an instanced box in its
// rack (blue uprights, orange beams, like real pallet racking), dock doors with
// the trucks that are at them right now, and the AMR fleet driving the aisles.
// "Explode" lifts levels and spreads rows apart so the inner bins can be seen.
import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SKU } from "@/data/warehouses";
import type { Bin, DockAppt, Warehouse } from "@/data/types";

export type ColorMode = "status" | "abc" | "fill" | "temp" | "expiry";

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
  /** Market time, for which doors have a truck at them. */
  now: number;
}

// Metres.
const PITCH_X = 1.4;
const LEVEL_H = 1.55;
const DEPTH = 1.15;
const AISLE = 3.2;
const STAGING = 11;
const BOX = { x: 1.12, y: 1.15, z: 1.0 };

const rowZ = (r: number) => AISLE + r * DEPTH + Math.floor(r / 2) * AISLE + DEPTH / 2;

function layout(w: Warehouse) {
  const width = w.bays * PITCH_X;
  const depth = rowZ(w.rows - 1) + DEPTH / 2 + AISLE;
  const height = w.levels * LEVEL_H + 1.8;
  return { width, depth, height, cz: depth / 2 };
}

function binPosition(b: Pick<Bin, "row" | "bay" | "level">, ex: number, cz: number, out: THREE.Vector3) {
  const z = rowZ(b.row);
  return out.set(b.bay * PITCH_X + PITCH_X / 2, 0.16 + b.level * LEVEL_H * (1 + ex * 0.9) + BOX.y / 2, cz + (z - cz) * (1 + ex * 0.7));
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

  useFrame(() => {
    const e = ex.current ?? 0;
    if (Math.abs(e - last.current) < 1e-4 || !up.current || !beams.current) return;
    last.current = e;
    let i = 0;
    let j = 0;
    const rackH = (w.levels - 1) * LEVEL_H * (1 + e * 0.9) + LEVEL_H;
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
        const y = 0.1 + l * LEVEL_H * (1 + e * 0.9);
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
  }, [shown, mode, dark]);

  useFrame(() => {
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
    }
    const s = selected ? bins.find((b) => b.loc === selected) : undefined;
    if (sel.current) {
      sel.current.visible = !!s;
      if (s) binPosition(s, e, L.cz, sel.current.position);
    }
  });

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined ? shown[e.instanceId] : undefined);
  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group>
      <instancedMesh
        key={`${w.id}-${shown.length}`}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, shown.length)]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(pick(e)?.loc ?? null);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(pick(e) ?? null);
        }}
        onPointerOut={() => onHover(null)}
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

function Shell({ w, dark, docks, now }: { w: Warehouse; dark: boolean; docks: DockAppt[]; now: number }) {
  const L = useMemo(() => layout(w), [w]);
  const p = dark ? PALETTE.dark : PALETTE.light;
  const edges = useMemo(() => {
    const g = new THREE.BoxGeometry(L.width + STAGING + 2, L.height + 1.5, L.depth);
    return new THREE.EdgesGeometry(g);
  }, [L]);
  const doorZ = (i: number) => ((i + 0.5) * L.depth) / w.doors;
  const busy = new Map<number, DockAppt>();
  for (const a of docks) if (a.warehouseId === w.id && now >= a.start - 10 * 60_000 && now < a.end) busy.set(a.door, a);
  const zones = w.rowZones.map((z, r) => ({ z, r })).filter((x) => x.z !== "ambient");
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
      {/* temperature / customs zones on the floor */}
      {zones.map(({ z, r }) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position={[(w.bays * PITCH_X) / 2, 0.012, rowZ(r)]}>
          <planeGeometry args={[w.bays * PITCH_X + 0.8, DEPTH + 0.5]} />
          <meshBasicMaterial color={p.zone[z]} transparent opacity={dark ? 0.28 : 0.22} />
        </mesh>
      ))}
      {/* dock doors and the trucks at them */}
      {Array.from({ length: w.doors }, (_, i) => {
        const a = busy.get(i);
        const z = doorZ(i);
        return (
          <group key={i} position={[-STAGING, 0, z]}>
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[0.25, 3.6, 3.0]} />
              <meshStandardMaterial color={a ? p.doorBusy : p.door} emissive={a ? p.doorBusy : "#000000"} emissiveIntensity={a ? 0.35 : 0} />
            </mesh>
            {a ? (
              <group position={[-7.6, 0, 0]}>
                <mesh position={[0, 2.3, 0]} castShadow>
                  <boxGeometry args={[13.6, 3.2, 2.5]} />
                  <meshStandardMaterial color={p.trailer} roughness={0.6} />
                </mesh>
                <mesh position={[-8.2, 1.8, 0]} castShadow>
                  <boxGeometry args={[2.4, 2.9, 2.5]} />
                  <meshStandardMaterial color={a.direction === "in" ? p.cab : p.doorBusy} roughness={0.4} metalness={0.2} />
                </mesh>
                {[-5.5, -4.2, 4.6, 5.9, -8.4].map((x) => (
                  <mesh key={x} position={[x, 0.5, 0]} rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 2.6, 14]} />
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

function Robots({ w, dark }: { w: Warehouse; dark: boolean }) {
  const group = useRef<THREE.Group>(null);
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
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.children.forEach((child, i) => {
      const b = bots[i];
      if (!b) return;
      const span = L.width + STAGING - 3;
      const u = (Math.sin(t * b.speed * 0.25 + b.phase) + 1) / 2;
      const x = -STAGING + 1.5 + u * span;
      const z = b.aisle === 0 ? AISLE / 2 : rowZ(b.aisle * 2 - 1) + DEPTH / 2 + AISLE / 2;
      child.position.set(x, 0.2, Math.min(L.depth - 0.8, z));
      child.rotation.y = Math.cos(t * b.speed * 0.25 + b.phase) > 0 ? 0 : Math.PI;
    });
  });
  const p = dark ? PALETTE.dark : PALETTE.light;
  return (
    <group ref={group}>
      {bots.map((_, i) => (
        <group key={i}>
          <mesh castShadow>
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
  useFrame((_, delta) => {
    valueRef.current = THREE.MathUtils.damp(valueRef.current ?? 0, target, 7, delta);
    if (Math.abs(valueRef.current - target) < 1e-3) valueRef.current = target;
  });
  return null;
}

function CameraRig({ w, resetKey, focus, controls }: { w: Warehouse; resetKey: number; focus: THREE.Vector3 | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const L = useMemo(() => layout(w), [w]);
  const goal = useRef<{ target: THREE.Vector3; cam: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const size = Math.max(L.width + STAGING, L.depth);
    goal.current = {
      target: new THREE.Vector3((L.width - STAGING) / 2 + 2, 2, L.depth / 2),
      cam: new THREE.Vector3(-STAGING - size * 0.55, size * 0.62, L.depth + size * 0.55),
    };
  }, [L, resetKey]);
  useEffect(() => {
    if (!focus) return;
    goal.current = { target: focus.clone(), cam: focus.clone().add(new THREE.Vector3(-9, 9, 11)) };
  }, [focus]);
  useFrame(({ camera }, delta) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    c.target.lerp(g.target, 1 - Math.exp(-delta * 4));
    camera.position.lerp(g.cam, 1 - Math.exp(-delta * 4));
    c.update();
    if (c.target.distanceTo(g.target) < 0.02 && camera.position.distanceTo(g.cam) < 0.05) goal.current = null;
  });
  return null;
}

export default function Twin(props: TwinProps) {
  const { warehouse: w, dark } = props;
  const p = dark ? PALETTE.dark : PALETTE.light;
  const L = useMemo(() => layout(w), [w]);
  const ex = useRef(props.explode);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const focus = useMemo(() => {
    const b = props.focusLoc ? props.bins.find((x) => x.loc === props.focusLoc) : undefined;
    return b ? binPosition(b, props.explode, L.cz, new THREE.Vector3()) : null;
    // Re-centre only when a new position is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusLoc]);
  const size = Math.max(L.width + STAGING, L.depth);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [-STAGING - size * 0.55, size * 0.62, L.depth + size * 0.55], fov: 42, near: 0.5, far: 600 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <color attach="background" args={[dark ? "#0b1118" : "#f1f0eb"]} />
      <fog attach="fog" args={[dark ? "#0b1118" : "#f1f0eb", size * 1.6, size * 4]} />
      <hemisphereLight args={[dark ? "#a9c4ff" : "#ffffff", dark ? "#151b22" : "#d9d4c8", dark ? 0.55 : 0.9]} />
      <ambientLight intensity={dark ? 0.25 : 0.35} />
      <directionalLight
        position={[-L.width * 0.4, L.height * 4, L.depth * 1.3]}
        intensity={dark ? 1.25 : 1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
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
      <Racks key={`racks-${w.id}`} w={w} ex={ex} dark={dark} />
      <Bins w={w} bins={props.bins} ex={ex} mode={props.mode} dark={dark} showEmpty={props.showEmpty} selected={props.selected} onSelect={props.onSelect} onHover={props.onHover} />
      {props.showRobots ? <Robots w={w} dark={dark} /> : null}
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.08} minDistance={6} maxDistance={size * 3} target={[(L.width - STAGING) / 2 + 2, 2, L.depth / 2]} />
      <CameraRig w={w} resetKey={props.resetKey} focus={focus} controls={controls} />
    </Canvas>
  );
}
