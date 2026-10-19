import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, Injector, input, output, viewChild } from '@angular/core';
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DataTexture, LineBasicMaterial, LineSegments, Mesh, NearestFilter, PerspectiveCamera,
  RedFormat, Scene, ShaderMaterial, SphereGeometry, UnsignedByteType, WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CountryFeature } from '../data/boundaries';
import { MotionPreference } from '../shared/motion-preference';
import { createEarthMaterial } from './earth-material';
import { graticulePositions, lonLatToVector3, sphereLinePositions } from './geo';
import { rasterizeIds } from './id-map';

// Where the camera starts: above the Atlantic off Morocco, so Europe and Africa face you. Distance 2.9 ≈ the globe fills the screen height.
const START = { lon: -8, lat: 32, distance: 2.9 };
const ID_MAP_WIDTH = 4096, ID_MAP_HEIGHT = 2048; // 1 pixel ≈ 10 km at the equator. 4096 is the safe maximum texture size on any WebGL device.

// Three.js in Angular, the learn-angular lesson 15 recipe, zoneless:
//   viewChild → canvas · afterNextRender → create · render on demand → run · effects → inputs drive the scene · DestroyRef → dispose
// No runOutsideAngular anywhere: without zone.js, Angular never notices animation frames or pointer moves on the canvas.
@Component({
  selector: 'app-globe',
  template: `<canvas #canvas class="nsc-globe" role="img" [attr.aria-label]="label()"></canvas>`,
  styles: `
    :host { display: block; }
    .nsc-globe { display: block; width: 100%; height: 100%; cursor: grab; }
    .nsc-globe:active { cursor: grabbing; }
  `
})
export class Globe {
  readonly features = input<CountryFeature[]>([]); // lesson 05: drawn through the ID map
  readonly borders = input<number[][][]>([]);       // lesson 05: every border once, as [lon, lat] lines
  readonly autoRotate = input(true);
  readonly label = input('A globe you can rotate by dragging and zoom with the mouse wheel or a pinch');
  readonly unsupported = output(); // no WebGL: the parent shows the flat map instead

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    const destroyRef = inject(DestroyRef), injector = inject(Injector), motion = inject(MotionPreference);

    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;

      // --- create ---
      let renderer: WebGLRenderer;
      try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); }
      catch { this.unsupported.emit(); return; } // WebGL disabled, blocklisted GPU, or too many contexts
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // a 3× phone screen would otherwise render 9× the pixels

      const scene = new Scene();
      const camera = new PerspectiveCamera(40, 1, 0.1, 100);
      lonLatToVector3(START.lon, START.lat, START.distance, camera.position); // looking at the centre from above that point, north up

      // The Earth. Its shader does its own lighting, from a direction fixed to the camera: whichever side you look at is lit.
      // (Lesson 04 used Three.js lights for that; a real sun would leave half the data in the dark.)
      // 192 × 128 segments: the flat triangles sag at most 0.9 km below the true sphere (96 × 64 sagged 3.5 km, enough to see the fill drift from the borders)
      const earthGeometry = new SphereGeometry(1, 192, 128);
      const earthMaterial = createEarthMaterial();
      let idMap: DataTexture | null = null;
      scene.add(new Mesh(earthGeometry, earthMaterial));

      // Graticule: lines every 15°
      const gridGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(graticulePositions(15), 3));
      const gridMaterial = new LineBasicMaterial({ color: '#8fa6d6', transparent: true, opacity: 0.06 });
      scene.add(new LineSegments(gridGeometry, gridMaterial));

      // Borders and coastlines. Filled in when the data arrives (effect below).
      const bordersGeometry = new BufferGeometry();
      const bordersMaterial = new LineBasicMaterial({ color: '#8fa6d6', transparent: true, opacity: 0.35 });
      scene.add(new LineSegments(bordersGeometry, bordersMaterial));

      // Atmosphere: a bigger sphere seen from inside (BackSide), brightest at the rim, added on top of what's behind it
      const atmosphereGeometry = new SphereGeometry(1.14, 64, 48);
      const atmosphereMaterial = new ShaderMaterial({
        uniforms: { glow: { value: new Color('#4f7cff') } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 glow;
          varying vec3 vNormal;
          void main() {
            float rim = pow(max(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
            gl_FragColor = vec4(glow, 1.0) * rim;
          }`,
        side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false
      });
      scene.add(new Mesh(atmosphereGeometry, atmosphereMaterial));

      // Drag to rotate, wheel/pinch to zoom. Damping = it glides to a stop instead of halting.
      const controls = new OrbitControls(camera, canvas);
      Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 1.35, maxDistance: 6, rotateSpeed: 0.5, zoomSpeed: 0.7, autoRotateSpeed: 0.35 });

      // --- run: render on demand ---
      // A frame is drawn only while something moves: a drag, the damping glide, a zoom, auto-rotation.
      // Then the loop stops, and an idle globe costs nothing (≈ react-three-fiber's frameloop="demand").
      let running = false, visible = true, userTookOver = false;
      const render = () => renderer.render(scene, camera);
      const tick = () => {
        const moved = controls.update(); // true while the camera is still changing
        render();
        // Auto-rotation keeps the loop alive explicitly: with damping it ramps up from almost nothing,
        // so its first frames move less than update()'s threshold and would stop the loop right away.
        if (!moved && !controls.autoRotate) { running = false; renderer.setAnimationLoop(null); }
      };
      const wake = () => {
        if (running || !visible) return;
        running = true;
        renderer.setAnimationLoop(tick);
      };
      const updateAutoRotate = () => {
        controls.autoRotate = this.autoRotate() && !motion.reduced() && !userTookOver;
        wake();
      };

      // --- observers & listeners ---
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = canvas;
        if (!w || !h) return;
        renderer.setSize(w, h, false); // false: CSS decides the canvas size, we only match its pixel buffer
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };
      // OrbitControls applies movement inside update(), so a sleeping loop has to be woken by the input itself
      const onInput = () => wake();
      const onStart = () => { userTookOver = true; updateAutoRotate(); }; // the first drag stops the auto-rotation for good
      const resizeObserver = new ResizeObserver(resize);
      const visibility = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) { running = false; renderer.setAnimationLoop(null); } else wake();
      });
      resizeObserver.observe(canvas);
      visibility.observe(canvas);
      resize(); // size the buffer now; the observer's first report can come a frame later (or not at all in a hidden tab)
      canvas.addEventListener('pointerdown', onInput);
      canvas.addEventListener('pointermove', onInput);
      canvas.addEventListener('wheel', onInput, { passive: true });
      controls.addEventListener('start', onStart);

      // --- inputs → scene ---
      effect(() => updateAutoRotate(), { injector }); // reads autoRotate() and motion.reduced(): re-runs when either changes

      // Countries → the ID map texture. Runs when the features arrive (they load after the globe is created).
      effect(() => {
        const features = this.features();
        if (!features.length) return;
        const texture = new DataTexture(rasterizeIds(features, ID_MAP_WIDTH, ID_MAP_HEIGHT), ID_MAP_WIDTH, ID_MAP_HEIGHT, RedFormat, UnsignedByteType);
        // Nearest, never blended: halfway between country 12 and country 40 must not read as country 26
        texture.magFilter = texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        idMap?.dispose();
        idMap = texture;
        earthMaterial.uniforms['idMap'].value = texture;
        render();
      }, { injector });

      // Borders → line segments on the sphere
      effect(() => {
        bordersGeometry.setAttribute('position', new BufferAttribute(sphereLinePositions(this.borders()), 3));
        // Three.js caches the bounding sphere from the first render, when the lines were still empty. Without this,
        // the stale sphere makes the camera skip the lines as "off-screen" (frustum culling), depending on load order.
        bordersGeometry.computeBoundingSphere();
        render();
      }, { injector });

      // --- destroy: everything created above, in reverse ---
      destroyRef.onDestroy(() => {
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        visibility.disconnect();
        canvas.removeEventListener('pointerdown', onInput);
        canvas.removeEventListener('pointermove', onInput);
        canvas.removeEventListener('wheel', onInput);
        controls.removeEventListener('start', onStart);
        controls.dispose();
        for (const disposable of [earthGeometry, earthMaterial, gridGeometry, gridMaterial, bordersGeometry, bordersMaterial, atmosphereGeometry, atmosphereMaterial]) disposable.dispose();
        idMap?.dispose();
        renderer.dispose();
        renderer.forceContextLoss(); // hand the WebGL context back now; browsers allow only ~16 at once
      });
    });
  }
}
