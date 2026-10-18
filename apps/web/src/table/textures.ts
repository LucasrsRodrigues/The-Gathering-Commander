// Texture and material cache for card faces. Card backs are our own design (no Wizards trade dress).

import * as THREE from 'three'
import type { CardRef } from '@gathering-hall/engine'
import { imagesFor } from '../catalog/catalog'

const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')
const faces = new Map<string, THREE.MeshStandardMaterial>()
let back: THREE.MeshStandardMaterial | null = null

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = 244
  canvas.height = 340
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function backMaterial(): THREE.MeshStandardMaterial {
  if (!back) {
    const map = canvasTexture((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#2a1d14')
      g.addColorStop(1, '#120c08')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#c9a24a'
      ctx.lineWidth = 6
      ctx.strokeRect(14, 14, w - 28, h - 28)
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 54, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#c9a24a'
      ctx.font = 'bold 44px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('GH', w / 2, h / 2 + 2)
    })
    back = new THREE.MeshStandardMaterial({ map, roughness: 0.6 })
  }
  return back
}

function placeholder(name: string) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#1b1b1b'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#3a3a3a'
    ctx.fillRect(10, 10, w - 20, h - 20)
    ctx.fillStyle = '#f1ead8'
    ctx.font = 'bold 20px system-ui, sans-serif'
    const words = name.split(' ')
    let line = ''
    let y = 44
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > w - 40 && line) {
        ctx.fillText(line, 20, y)
        line = word
        y += 26
      } else line = line ? `${line} ${word}` : word
    }
    ctx.fillText(line, 20, y)
  })
}

export function faceMaterial(card: CardRef | null, anisotropy: number): THREE.MeshStandardMaterial {
  if (!card) return backMaterial()
  const images = imagesFor(card)
  const key = images?.small ?? `placeholder:${card.name}`
  let mat = faces.get(key)
  if (mat) return mat
  if (!images) {
    mat = new THREE.MeshStandardMaterial({ map: placeholder(card.name), roughness: 0.55 })
  } else {
    const created = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.55 })
    loader.load(images.small, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = anisotropy
      created.map = tex
      created.color.set('#ffffff')
      created.needsUpdate = true
    })
    mat = created
  }
  faces.set(key, mat)
  return mat
}
