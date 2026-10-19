// The 3D table (humble object): draws a PlayerView and turns gestures into intents.
// No rules live here; every change goes through the session → engine.

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { CardRef, ObjectView, PlayerId, PlayerView } from '@gathering-hall/engine'
import { focusStore, menuStore, previewStore, zoneViewerStore } from '../ui/stores'
import { useStore } from '../ui/store'
import { layoutTable, TABLE, type Area, type Piles, type TableLayout } from './layout'
import { backMaterial, faceMaterial } from './textures'

const THICKNESS = 0.02
const LONG_PRESS_MS = 450
const DRAG_PX = 6
const cardGeometry = new THREE.BoxGeometry(TABLE.CW, THICKNESS, TABLE.CH)
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export interface TableIntents {
  tap: (objectId: string, x: number, y: number) => void // x, y: where to open a menu if one is needed
  arrange: (objectId: string, x: number, z: number) => void
}

interface SceneProps {
  view: PlayerView
  viewer: PlayerId
  intents: TableIntents
}

export function TableScene({ view, viewer, intents }: SceneProps) {
  const layout = useMemo(() => layoutTable(view, viewer), [view, viewer])
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 36 }} className="table-canvas"
      onPointerMissed={() => menuStore.set(null)}>
      <color attach="background" args={['#0c110f']} />
      <CameraRig layout={layout} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 14, 8]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-0.0005} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[TABLE.W + 2, TABLE.D + 2]} />
        <meshStandardMaterial color="#16241d" roughness={0.95} />
      </mesh>
      {layout.areas.map((area) => <AreaPlate key={area.seat} area={area} active={view.turn.active === area.seat} />)}
      {[...layout.piles].map(([seat, piles]) => (
        <SeatPiles key={seat} seat={seat} piles={piles} view={view} mine={seat === viewer} />
      ))}
      {[...layout.cards].map(([id, at]) => {
        const obj = view.objects[id]
        if (!obj) return null
        return (
          <CardMesh key={id} obj={obj} x={at.x} z={at.z} scale={at.scale} layer={at.layer}
            floating={!!at.floating} intents={intents} />
        )
      })}
    </Canvas>
  )
}

function CameraRig({ layout }: { layout: TableLayout }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const focus = useStore(focusStore)
  const target = useRef(new THREE.Vector3(0, 0, 0.8))
  const goal = useMemo(() => {
    const area = layout.areas.find((a) => a.seat === focus && !a.local)
    if (area) {
      return { pos: new THREE.Vector3(area.x, 8.6, area.z + 6.4), look: new THREE.Vector3(area.x, 0, area.z - 1.1) }
    }
    // Overview: pull back on narrower screens so all seats stay visible.
    // Leaves room for the HUD strips at the top and bottom of the screen.
    // A canvas measured at 0×0 on mount would give NaN and freeze the camera: assume 16:9 until measured.
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9
    const k = Math.min(3.4, Math.max(1.35, 2.75 / aspect))
    return { pos: new THREE.Vector3(0, 13.5 * k, 10.5 * k), look: new THREE.Vector3(0, 0, 1.2) }
  }, [focus, layout, size])

  useLayoutEffect(() => {
    camera.position.copy(goal.pos)
    target.current.copy(goal.look)
    camera.lookAt(target.current)
    // Only the first frame jumps; later focus changes animate in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 5)
    // Never let a bad frame (NaN) stick: lerping from NaN stays NaN forever.
    if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) camera.position.copy(goal.pos)
    if (!Number.isFinite(target.current.x + target.current.y + target.current.z)) target.current.copy(goal.look)
    camera.position.lerp(goal.pos, k)
    target.current.lerp(goal.look, k)
    camera.lookAt(target.current)
  })
  return null
}

function AreaPlate({ area, active }: { area: Area; active: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[area.x, 0.002, area.z]} receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        menuStore.set(null)
        focusStore.set(area.local ? null : focusStore.get() === area.seat ? null : area.seat)
      }}>
      <planeGeometry args={[area.w - 0.3, area.d]} />
      <meshStandardMaterial color={active ? '#24392d' : area.local ? '#1d3026' : '#1a2b22'} roughness={0.95} />
    </mesh>
  )
}

function SeatPiles({ seat, piles, view, mine }: { seat: PlayerId; piles: Piles; view: PlayerView; mine: boolean }) {
  const player = view.players[seat]
  if (!player) return null
  const topOf = (ids: string[]) => {
    const id = ids[ids.length - 1]
    return id ? (view.objects[id]?.card ?? null) : null
  }
  return (
    <group>
      <Pile at={piles.library} scale={piles.scale} count={player.libraryCount} card={null} faceDown
        onClick={(e) => mine && menuStore.set({ target: { kind: 'library', seat }, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })} />
      <Pile at={piles.graveyard} scale={piles.scale} count={player.graveyard.length} card={topOf(player.graveyard)}
        onClick={() => zoneViewerStore.set({ seat, zone: 'graveyard' })} />
      <Pile at={piles.exile} scale={piles.scale} count={player.exile.length} card={topOf(player.exile)}
        onClick={() => zoneViewerStore.set({ seat, zone: 'exile' })} />
    </group>
  )
}

function Pile(props: {
  at: { x: number; z: number }; scale: number; count: number; card: CardRef | null; faceDown?: boolean
  onClick: (e: ThreeEvent<MouseEvent>) => void
}) {
  const { at, scale, count, card, faceDown, onClick } = props
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const height = Math.max(0.01, Math.min(0.5, count * 0.004))
  const material = faceDown || !card ? backMaterial() : faceMaterial(card, anisotropy)
  return (
    <group position={[at.x, 0, at.z]} scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      onPointerOver={(e) => { e.stopPropagation(); if (card && !faceDown) previewStore.set(card) }}
      onPointerOut={() => previewStore.set(null)}>
      {count > 0 ? (
        <mesh position-y={height / 2} castShadow material={material}>
          <boxGeometry args={[TABLE.CW, height, TABLE.CH]} />
        </mesh>
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
          <planeGeometry args={[TABLE.CW, TABLE.CH]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.06} />
        </mesh>
      )}
    </group>
  )
}

interface CardMeshProps {
  obj: ObjectView
  x: number
  z: number
  scale: number
  layer: number
  floating: boolean
  intents: TableIntents
}

const CardMesh = memo(function CardMesh({ obj, x, z, scale, layer, floating, intents }: CardMeshProps) {
  const group = useRef<THREE.Group>(null)
  const hovered = useRef(false)
  const gesture = useRef({ active: false, moved: false, long: false, sx: 0, sy: 0, timer: 0 })
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const material = useMemo(() => faceMaterial(obj.faceDown ? null : obj.card, anisotropy), [obj.card, obj.faceDown, anisotropy])
  const baseY = floating ? 0.9 + layer * 0.06 : THICKNESS / 2 + 0.004 + layer * 0.004
  const onBattlefield = obj.zone === 'battlefield'

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    // New objects slide in from the near edge; existing ones ease from where they were.
    g.position.set(x, baseY + 1.5, z + 3)
    g.rotation.y = obj.tapped ? -Math.PI / 2 : 0
    g.scale.setScalar(scale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const k = 1 - Math.exp(-dt * 12)
    const dragging = gesture.current.moved
    if (!dragging) {
      g.position.x += (x - g.position.x) * k
      g.position.z += (z - g.position.z) * k
    }
    const ty = dragging ? 0.7 : hovered.current ? baseY + 0.25 : baseY
    g.position.y += (ty - g.position.y) * k
    g.rotation.y += ((obj.tapped ? -Math.PI / 2 : 0) - g.rotation.y) * k
    const ts = scale * (hovered.current || dragging ? 1.08 : 1)
    g.scale.setScalar(g.scale.x + (ts - g.scale.x) * k)
  })

  const openMenu = (clientX: number, clientY: number) =>
    menuStore.set({ target: { kind: 'object', objectId: obj.id }, x: clientX, y: clientY })

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const g = gesture.current
    Object.assign(g, { active: true, moved: false, long: false, sx: e.clientX, sy: e.clientY })
    if (e.pointerType !== 'mouse') {
      g.timer = window.setTimeout(() => {
        g.long = true
        previewStore.set(obj.card)
        openMenu(g.sx, g.sy)
      }, LONG_PRESS_MS)
    }
  }

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    const g = gesture.current
    if (!g.active) return
    e.stopPropagation()
    if (!g.moved && onBattlefield && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > DRAG_PX) {
      g.moved = true
      clearTimeout(g.timer)
      menuStore.set(null)
    }
    if (g.moved && group.current) {
      const hit = new THREE.Vector3()
      if (e.ray.intersectPlane(tablePlane, hit)) group.current.position.set(hit.x, group.current.position.y, hit.z)
    }
  }

  function onPointerUp(e: ThreeEvent<PointerEvent>) {
    const g = gesture.current
    if (!g.active) return
    e.stopPropagation()
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    g.active = false
    clearTimeout(g.timer)
    if (g.moved && group.current) {
      intents.arrange(obj.id, group.current.position.x, group.current.position.z)
      g.moved = false
    } else if (!g.long) {
      if (onBattlefield) intents.tap(obj.id, e.clientX, e.clientY)
      else openMenu(e.clientX, e.clientY)
    }
  }

  return (
    <group ref={group}
      onPointerOver={(e) => { e.stopPropagation(); hovered.current = true; if (e.pointerType === 'mouse' && obj.card) previewStore.set(obj.card) }}
      onPointerOut={(e) => { hovered.current = false; if (e.pointerType === 'mouse') previewStore.set(null) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); openMenu(e.nativeEvent.clientX, e.nativeEvent.clientY) }}>
      <mesh geometry={cardGeometry} material={material} castShadow />
      {obj.isCommander && !floating && (
        <mesh rotation-x={-Math.PI / 2} position-y={-THICKNESS / 2 - 0.001}>
          <planeGeometry args={[TABLE.CW * 1.12, TABLE.CH * 1.08]} />
          <meshBasicMaterial color="#d9b25a" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
})
