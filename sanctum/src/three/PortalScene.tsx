import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { markGLLost } from '../components/gl'

const KYBER = '#67e8f9'
const smooth = (x: number) => x * x * (3 - 2 * x)
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
/* sub-progresses of the whole journey, derived from master scroll p */
const assembleOf = (p: number) => ease(clamp01((p - 0.53) / 0.17)) // 0.53–0.70 portal forms
const flightOf = (p: number) => clamp01((p - 0.66) / 0.28) // 0.66–0.94 camera dive

type Prog = { p: number }

const discVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const discFrag = /* glsl */ `
  uniform float uT; uniform float uP; uniform float uA; varying vec2 vUv;
  void main(){
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x);
    float sw  = sin(a * 6.0 + r * 14.0 - uT * 2.4);
    float sw2 = sin(a * 3.0 - r * 22.0 + uT * 1.7);
    vec3 col = mix(vec3(0.02, 0.07, 0.11), vec3(0.40, 0.91, 0.98), 0.5 + 0.5 * sw);
    col += vec3(0.16, 0.85, 1.0) * 0.35 * (0.5 + 0.5 * sw2);
    float core = smoothstep(0.34, 0.0, r) * (0.4 + uP * 0.6);
    col += vec3(0.75, 0.98, 1.0) * core;
    float alpha = smoothstep(1.0, 0.22, r);
    float fade = 1.0 - smoothstep(0.94, 1.0, uP);
    // flight carves the throat open — flying INTO the vortex, not into milk
    float throat = smoothstep(0.62, 0.0, r) * uP;
    alpha *= 1.0 - throat * 0.92;
    col *= (1.0 - throat * 0.6);
    // the rim stays ablaze while the core opens
    float rim = pow(smoothstep(0.55, 0.98, r) * smoothstep(1.08, 0.92, r), 2.0);
    col += vec3(0.45, 0.95, 1.0) * rim * (0.35 + uP * 1.9);
    col *= (0.5 + uP * uP * 0.85) * fade * uA;
    alpha *= fade * uA;
    gl_FragColor = vec4(col, alpha);
  }
`
const ringVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vPos;
  void main(){
    vN = normalize(normalMatrix * normal);
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const ringFrag = /* glsl */ `
  uniform float uT; uniform float uP;
  varying vec3 vN; varying vec3 vV; varying vec3 vPos;
  void main(){
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    float band = 0.5 + 0.5 * sin(atan(vPos.y, vPos.x) * 28.0 + uT * 1.6);
    vec3 col = mix(vec3(0.08, 0.30, 0.40), vec3(0.40, 0.91, 0.98), f);
    col += vec3(0.12, 0.55, 0.65) * band * 0.55;
    col *= 0.9 + uP * 1.6;
    gl_FragColor = vec4(col, 1.0);
  }
`

function StarsCloud({ count, radius, color, size }: { count: number; radius: [number, number]; color: string; size: number }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = radius[0] + Math.random() * (radius[1] - radius[0])
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th)
      pos[i * 3 + 2] = r * Math.cos(ph) - 24
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [count, radius])
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} color={color} transparent opacity={0.9} sizeAttenuation depthWrite={false} />
    </points>
  )
}

function Streaks({ prog }: { prog: Prog }) {
  const mat = useRef<THREE.LineBasicMaterial>(null)
  const geo = useMemo(() => {
    const N = 220
    const pos = new Float32Array(N * 6)
    for (let i = 0; i < N; i++) {
      const r = 2.5 + Math.random() * 15
      const th = Math.random() * Math.PI * 2
      const x = r * Math.cos(th), y = r * Math.sin(th)
      const z = 4 - Math.random() * 64
      const len = 1.5 + Math.random() * 4
      pos.set([x, y, z, x, y, z - len], i * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useFrame(() => {
    const f = smooth(flightOf(prog.p))
    if (mat.current) mat.current.opacity = 0.03 + f * 0.85
  })
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial ref={mat} color={KYBER} transparent opacity={0.03} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  )
}

function Portal({ prog }: { prog: Prog }) {
  const discMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: discVert,
        fragmentShader: discFrag,
        uniforms: { uT: { value: 0 }, uP: { value: 0 }, uA: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const ringMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        uniforms: { uT: { value: 0 }, uP: { value: 0 } },
      }),
    [],
  )
  const crystals = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        a: (i / 10) * Math.PI * 2,
        s: 0.7 + Math.random() * 0.7,
        ph: Math.random() * Math.PI * 2,
      })),
    [],
  )
  const group = useMemo(() => new THREE.Group(), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const a = assembleOf(prog.p)
    const f = smooth(flightOf(prog.p))
    discMat.uniforms.uT.value = t
    discMat.uniforms.uP.value = f
    discMat.uniforms.uA.value = a
    ringMat.uniforms.uT.value = t
    ringMat.uniforms.uP.value = f
    group.rotation.z = t * 0.12
    group.children.forEach((child) => {
      if (child.userData.crystal) {
        const k = child.userData
        // crystals sweep in from deep space as the gate assembles
        const r = 18 - 15.35 * a
        child.position.x = Math.cos(k.a + t * 0.24 * k.s) * r
        child.position.y = Math.sin(k.a + t * 0.24 * k.s) * r
        child.position.z = Math.sin(t * 0.8 + k.ph) * 0.25
        child.rotation.x = t * k.s
        child.rotation.y = t * k.s * 0.7
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
        mat.opacity = a * 0.95
      }
      if (child.userData.ring2) child.rotation.z = -t * 0.2
    })
    group.scale.setScalar(0.08 + a * 0.92 + f * 0.25)
  })

  return (
    <primitive object={group}>
      <mesh material={ringMat}>
        <torusGeometry args={[1.92, 0.075, 32, 128]} />
      </mesh>
      <mesh userData={{ ring2: true }}>
        <torusGeometry args={[2.18, 0.016, 16, 128]} />
        <meshBasicMaterial color={KYBER} transparent opacity={0.5} />
      </mesh>
      <mesh material={discMat}>
        <circleGeometry args={[1.84, 64]} />
      </mesh>
      {crystals.map((c, i) => (
        <mesh key={i} userData={{ crystal: true, ...c }}>
          <octahedronGeometry args={[0.085, 0]} />
          <meshBasicMaterial color={KYBER} transparent opacity={0} />
        </mesh>
      ))}
    </primitive>
  )
}

const pointer = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1
  }, { passive: true })
}

function Rig({ prog }: { prog: Prog }) {
  const { camera } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const par = { x: 0, y: 0 }
  useFrame((state) => {
    const f = smooth(flightOf(prog.p))
    const t = state.clock.elapsedTime
    // pointer parallax — portal subtly follows the hand; dies into the dive
    par.x += (pointer.x - par.x) * 0.045
    par.y += (pointer.y - par.y) * 0.045
    cam.position.z = 14 - ease(f) * 15.2
    cam.position.y = 0.6 + Math.sin(f * Math.PI) * 0.35 - par.y * 0.38 * (1 - f)
    cam.position.x = Math.sin(t * 0.3) * 0.05 * (1 - f) + par.x * 0.55 * (1 - f)
    cam.fov = 60 + f * f * 26
    cam.updateProjectionMatrix()
    cam.lookAt(0, 0, 0)
  })
  return null
}

export default function PortalScene({ prog }: { prog: Prog }) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ fov: 60, position: [0, 0.6, 14], near: 0.1, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, zIndex: 1, background: '#04060c' }}
      onCreated={({ gl: renderer }) => {
        const el = renderer.domElement
        el.style.transition = 'opacity .45s ease'
        el.addEventListener('webglcontextlost', (e) => {
          e.preventDefault() // allow restore attempts
          markGLLost()
          el.style.opacity = '0' // reveal the CSS portal beneath — never black
        })
        el.addEventListener('webglcontextrestored', () => {
          el.style.opacity = '1'
        })
      }}
    >
      <StarsCloud count={2400} radius={[16, 52]} color="#cfd8e3" size={0.055} />
      <StarsCloud count={420} radius={[10, 40]} color={KYBER} size={0.085} />
      <Streaks prog={prog} />
      <Portal prog={prog} />
      <Rig prog={prog} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.3} luminanceSmoothing={0.3} />
      </EffectComposer>
    </Canvas>
  )
}
