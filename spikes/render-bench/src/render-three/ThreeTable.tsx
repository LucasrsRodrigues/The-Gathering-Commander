// Variant B: real 3D table (react-three-fiber), Arena-style perspective, lighting and shadows.
// Cards are thin boxes sharing one geometry; materials are cached per image URL.

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PLATES, TABLE } from '../bench/board'
import { previewStore, renderStatsStore } from '../bench/stores'
import { DRAG_THRESHOLD_PX, LONG_PRESS_MS, type TableProps } from '../bench/types'

const CARD_THICKNESS = 0.02
const cardGeometry = new THREE.BoxGeometry(TABLE.CW, CARD_THICKNESS, TABLE.CH)
const glowGeometry = new THREE.PlaneGeometry(TABLE.CW * 1.24, TABLE.CH * 1.18).rotateX(-Math.PI / 2)
const glowMaterial = new THREE.MeshBasicMaterial({
  color: '#ffc94a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
})
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')
const frontMaterials = new Map<string, THREE.MeshStandardMaterial>()

function frontMaterial(url: string, anisotropy: number) {
  let mat = frontMaterials.get(url)
  if (!mat) {
    const created = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.55 })
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = anisotropy
      created.map = tex
      created.color.set('#ffffff')
      created.needsUpdate = true
    })
    frontMaterials.set(url, created)
    mat = created
  }
  return mat
}

export function ThreeTable(props: TableProps) {
  const { effects } = props.opts
  return (
    // Remount when effects change: toggling shadow maps at runtime needs every material recompiled.
    <Canvas key={effects ? 'fx' : 'plain'} shadows={effects} dpr={[1, 2]} camera={{ fov: 36 }} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
      <color attach="background" args={['#0b0f0d']} />
      <CameraRig />
      <ambientLight intensity={effects ? 0.55 : 1.1} />
      {effects && (
        <directionalLight
          position={[6, 14, 8]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0005}
        />
      )}
      <Table />
      <GlowPulse />
      <StatsReporter />
      <Cards {...props} />
    </Canvas>
  )
}

function CameraRig() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    // Pull back on narrower screens (tablet landscape/portrait) so all four seats stay visible.
    const aspect = size.width / size.height
    const k = Math.min(3.2, Math.max(1.1, 2.3 / aspect))
    camera.position.set(0, 13.5 * k, 10.5 * k)
    camera.lookAt(0, 0, 0.8)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Table() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[TABLE.W + 1, TABLE.D + 1]} />
        <meshStandardMaterial color="#17261f" roughness={0.95} />
      </mesh>
      {PLATES.map((p) => (
        <mesh key={p.owner} rotation-x={-Math.PI / 2} position={[p.x, 0.002, p.z]} receiveShadow>
          <planeGeometry args={[p.w, p.d]} />
          <meshStandardMaterial color={p.owner === 0 ? '#20342a' : '#1b2c24'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

function GlowPulse() {
  useFrame(({ clock }) => {
    glowMaterial.opacity = 0.35 + 0.3 * Math.sin(clock.elapsedTime * 4)
  })
  return null
}

function StatsReporter() {
  const gl = useThree((s) => s.gl)
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 1) return
    acc.current = 0
    renderStatsStore.set({ calls: gl.info.render.calls, triangles: gl.info.render.triangles })
  })
  return null
}

function Cards({ pool, board, layout, glowIds, opts, onTap, onMove }: TableProps) {
  return (
    <>
      {board.perms.map((p) => {
        const at = layout.get(p.id)
        if (!at) return null
        const card = pool[p.poolIdx]
        return (
          <Card3D
            key={p.id}
            id={p.id}
            url={opts.hd ? card.img.normal : card.img.small}
            preview={card.img.large}
            x={at.x}
            z={at.z}
            scale={at.scale}
            layer={at.layer}
            tapped={p.tapped}
            glow={opts.effects && glowIds.has(p.id)}
            shadows={opts.effects}
            entering={!!p.enteredAt}
            onTap={onTap}
            onMove={onMove}
          />
        )
      })}
    </>
  )
}

interface Card3DProps {
  id: string
  url: string
  preview: string
  x: number
  z: number
  scale: number
  layer: number
  tapped: boolean
  glow: boolean
  shadows: boolean
  entering: boolean
  onTap: (id: string) => void
  onMove: (id: string, x: number, z: number) => void
}

const Card3D = memo(function Card3D(props: Card3DProps) {
  const { id, url, preview, x, z, scale, layer, tapped, glow, shadows, entering, onTap, onMove } = props
  const group = useRef<THREE.Group>(null)
  const hovered = useRef(false)
  const gesture = useRef({ active: false, moved: false, longPressed: false, sx: 0, sy: 0, timer: 0 })
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  // One material for the whole box: per-face materials cost 6 draw calls per card.
  // The edges are 0.02 thick, so the stretched texture on them is invisible.
  const material = useMemo(() => frontMaterial(url, anisotropy), [url, anisotropy])
  const baseY = CARD_THICKNESS / 2 + 0.004 + layer * 0.004

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    if (entering) g.position.set(0, 3, 9)
    else g.position.set(x, baseY, z)
    g.rotation.y = tapped ? -Math.PI / 2 : 0
    g.scale.setScalar(scale)
    // Initial placement only; afterwards useFrame eases toward the props.
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
    const targetY = dragging ? 0.7 : hovered.current ? 0.25 : baseY
    g.position.y += (targetY - g.position.y) * k
    g.rotation.y += ((tapped ? -Math.PI / 2 : 0) - g.rotation.y) * k
    const targetScale = scale * (hovered.current || dragging ? 1.08 : 1)
    g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * k)
  })

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const g = gesture.current
    Object.assign(g, { active: true, moved: false, longPressed: false, sx: e.clientX, sy: e.clientY })
    if (e.pointerType !== 'mouse') {
      g.timer = window.setTimeout(() => {
        g.longPressed = true
        previewStore.set(preview)
      }, LONG_PRESS_MS)
    }
  }

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    const g = gesture.current
    if (!g.active) return
    e.stopPropagation()
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > DRAG_THRESHOLD_PX) {
      g.moved = true
      clearTimeout(g.timer)
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
    if (g.longPressed) previewStore.set(null)
    if (g.moved && group.current) {
      onMove(id, group.current.position.x, group.current.position.z)
      g.moved = false
    } else if (!g.longPressed) {
      onTap(id)
    }
  }

  return (
    <group
      ref={group}
      onPointerOver={(e) => {
        e.stopPropagation()
        hovered.current = true
        if (e.pointerType === 'mouse') previewStore.set(preview)
      }}
      onPointerOut={(e) => {
        hovered.current = false
        if (e.pointerType === 'mouse') previewStore.set(null)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <mesh geometry={cardGeometry} material={material} castShadow={shadows} />
      {glow && <mesh geometry={glowGeometry} material={glowMaterial} position-y={-CARD_THICKNESS / 2 - 0.001} />}
    </group>
  )
})
