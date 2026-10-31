import * as THREE from 'three'
import { riffle } from '@lucasmarkes/hairline'

// ---------- hairline 主题色 ----------
const PAL = {
  bg: 0x101014,     // --hairline-plate
  plate: 0x17171b,  // 实体填充（与底同色系，只留描边）
  hi: 0xfafafa,     // 亮 / 高亮
  edge: 0xa1a1aa,   // 剪影描边
  mid: 0x52525b,    // 次级描边
  lo: 0x27272a,     // 后退 / 网格
}

// ---------- 渲染器 ----------
const host = document.getElementById('room')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(PAL.bg, 1)
host.appendChild(renderer.domElement)

const scene = new THREE.Scene()

// ---------- 等距舞台（2:1）----------
const stage = new THREE.Group()
stage.rotation.order = 'YXZ'
stage.rotation.y = Math.PI / 4
stage.rotation.x = -Math.PI / 6
scene.add(stage)

// ---------- 正交相机 ----------
const VIEW = 9.5
const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, -100, 100)
camera.position.set(0, 0, 40)
camera.lookAt(0, 0, 0)
camera.up.set(0, 1, 0)

// ---------- 材质 ----------
const plateMat = new THREE.MeshBasicMaterial({ color: PAL.plate })
const edgeMat = new THREE.LineBasicMaterial({ color: PAL.edge })
const hiMat = new THREE.LineBasicMaterial({ color: PAL.hi })
const midMat = new THREE.LineBasicMaterial({ color: PAL.mid })
const loMat = new THREE.LineBasicMaterial({ color: PAL.lo })

// ---------- 工具：实体（板 + 全边线）----------
function solid(parent, w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, plateMat)
  mesh.position.set(x, y, z)
  parent.add(mesh)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)
  edges.position.copy(mesh.position)
  parent.add(edges)
  return edges
}

// 工具：把 2D 点集写入某条线（x,y 世界坐标 + 固定 z）
function setLoop(line, pts, z) {
  const n = pts.length
  const pos = line.geometry.attributes.position
  for (let i = 0; i < n; i++) {
    pos.setXYZ(i, pts[i][0], pts[i][1], z)
  }
  pos.needsUpdate = true
}

// ---------- 地板（板 + 网格）----------
{
  const geo = new THREE.PlaneGeometry(12, 12)
  const mesh = new THREE.Mesh(geo, plateMat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.z = 0
  stage.add(mesh)

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-6, -6, 0), new THREE.Vector3(6, -6, 0),
      new THREE.Vector3(6, 6, 0), new THREE.Vector3(-6, 6, 0),
    ]),
    edgeMat,
  )
  stage.add(border)

  // 淡网格
  const gridPts = []
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue
    gridPts.push(new THREE.Vector3(i, -6, 0.01), new THREE.Vector3(i, 6, 0.01))
    gridPts.push(new THREE.Vector3(-6, i, 0.01), new THREE.Vector3(6, i, 0.01))
  }
  stage.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPts), loMat))
}

// ---------- 床 ----------
solid(stage, 6.4, 0.9, 2.4, 0, -3.8, 0.45)            // 床架
solid(stage, 6.0, 0.25, 2.0, 0, -3.8, 1.1)            // 床垫
solid(stage, 1.4, 0.2, 0.8, -2.2, -3.7, 1.35)         // 枕头

// ---------- 床头柜 + 台灯 ----------
solid(stage, 1.0, 0.6, 1.0, 4.7, -4.9, 0.3)           // 柜
solid(stage, 0.12, 1.4, 0.12, 4.7, -4.9, 1.6)         // 灯杆
solid(stage, 0.6, 0.35, 0.6, 4.7, -4.9, 2.4)          // 灯罩

// ---------- 主 morph 卡（方 → 圆，悬浮）----------
const CARD_HW = 1.35
const CARD_Z = 1.6
const cardPts = []
for (let i = 0; i < 4 * 7; i++) cardPts.push([0, 0])
const cardLine = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(cardPts.map((p) => new THREE.Vector3(p[0], p[1], CARD_Z))),
  hiMat,
)
stage.add(cardLine)

function roundedRect(hw, r) {
  r = Math.max(0.001, Math.min(r, hw))
  const out = []
  const cs = [[hw - r, hw - r], [-hw + r, hw - r], [-hw + r, -hw + r], [hw - r, -hw + r]]
  const a0 = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  for (let c = 0; c < 4; c++) {
    for (let k = 0; k <= 6; k++) {
      const a = a0[c] + (Math.PI / 2) * (k / 6)
      out.push([cs[c][0] + r * Math.cos(a), cs[c][1] + r * Math.sin(a)])
    }
  }
  return out
}

// ---------- 时间轴（前端）----------
const TL_Y = 4.4
const TL_Z = 0.06
const tlLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5, TL_Y, TL_Z), new THREE.Vector3(5, TL_Y, TL_Z)]),
  midMat,
)
stage.add(tlLine)

// 关键帧菱形
const keys = [-3.5, -1.75, 0, 1.75, 3.5]
const keyLines = []
for (const kx of keys) {
  const pts = [
    new THREE.Vector3(kx, TL_Y - 0.18, TL_Z), new THREE.Vector3(kx + 0.16, TL_Y, TL_Z),
    new THREE.Vector3(kx, TL_Y + 0.18, TL_Z), new THREE.Vector3(kx - 0.16, TL_Y, TL_Z),
  ]
  const k = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), edgeMat)
  stage.add(k)
  keyLines.push(k)
}

// 播放头（亮色小旗）
const playhead = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, TL_Y, TL_Z), new THREE.Vector3(0, TL_Y, 0.62),
  ]),
  hiMat,
)
stage.add(playhead)
const playheadTop = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.16, TL_Y, 0.62), new THREE.Vector3(0, TL_Y, 0.78),
    new THREE.Vector3(0.16, TL_Y, 0.62), new THREE.Vector3(0, TL_Y, 0.46),
  ]),
  hiMat,
)
stage.add(playheadTop)

// ---------- 缓动曲线（前端左）----------
function bezier(t, p) {
  const mt = 1 - t
  return [
    mt * mt * mt * p[0][0] + 3 * mt * mt * t * p[1][0] + 3 * mt * t * t * p[2][0] + t * t * t * p[3][0],
    mt * mt * mt * p[0][1] + 3 * mt * mt * t * p[1][1] + 3 * mt * t * t * p[2][1] + t * t * t * p[3][1],
  ]
}
{
  const E = [[-5.5, 0.5], [-4.2, 0.6], [-3.3, 3.0], [-2.6, 3.2]]
  const curvePts = []
  for (let i = 0; i <= 40; i++) {
    const [bx, by] = bezier(i / 40, E)
    curvePts.push(new THREE.Vector3(bx, by, TL_Z))
  }
  stage.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePts), edgeMat))
  // 控制柄（虚线感：细线）
  stage.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(E[0][0], E[0][1], TL_Z), new THREE.Vector3(E[1][0], E[1][1], TL_Z),
  ]), loMat))
  stage.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(E[3][0], E[3][1], TL_Z), new THREE.Vector3(E[2][0], E[2][1], TL_Z),
  ]), loMat))
  for (const [cx, cy] of [E[1], E[2]]) {
    stage.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx - 0.1, cy - 0.1, TL_Z), new THREE.Vector3(cx + 0.1, cy - 0.1, TL_Z),
      new THREE.Vector3(cx + 0.1, cy + 0.1, TL_Z), new THREE.Vector3(cx - 0.1, cy + 0.1, TL_Z),
    ]), midMat))
  }
}

// ---------- 指针 → 时间轴拖杆 ----------
let progress = 0.34        // 静止时非零构图（rule 05）
let target = progress
const readB = document.querySelector('#readout b')

function onMove(e) {
  const rect = renderer.domElement.getBoundingClientRect()
  const px = (e.clientX - rect.left) / rect.width
  target = Math.max(0, Math.min(1, px))
}

host.addEventListener('pointermove', onMove)
host.addEventListener('pointerleave', () => { target = 0.34 })

// ---------- 循环 ----------
let lastT = performance.now()
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  // 连续输入用弹簧（rule 08）
  progress += (target - progress) * Math.min(1, dt * 14)

  const r = progress * CARD_HW
  setLoop(cardLine, roundedRect(CARD_HW, r), CARD_Z)

  const playX = -5 + progress * 10
  const pp = playhead.geometry.attributes.position
  pp.setXYZ(0, playX, TL_Y, TL_Z)
  pp.setXYZ(1, playX, TL_Y, 0.62)
  pp.needsUpdate = true
  const pt = playheadTop.geometry.attributes.position
  pt.setXYZ(0, playX - 0.16, TL_Y, 0.62)
  pt.setXYZ(1, playX, TL_Y, 0.78)
  pt.setXYZ(2, playX + 0.16, TL_Y, 0.62)
  pt.setXYZ(3, playX, TL_Y, 0.46)
  pt.needsUpdate = true

  readB.textContent = String(Math.round(progress * 24)).padStart(2, '0')

  renderer.render(scene, camera)
})

// ---------- 自适应 ----------
function resize() {
  const w = host.clientWidth
  const h = host.clientHeight
  renderer.setSize(w, h, false)
  const aspect = w / h
  const v = VIEW
  camera.left = -v * Math.max(1, aspect)
  camera.right = v * Math.max(1, aspect)
  camera.top = v
  camera.bottom = -v
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

// ---------- hairline 卡片托盘（右下角）----------
riffle(document.getElementById('deck'), {
  theme: 'dark',
  label: '一托盘的八张卡片：指针经过的卡片会立起来',
})
