import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, model, output, signal, viewChild } from '@angular/core';
import {
  BufferAttribute, BufferGeometry, DataTexture, LineBasicMaterial, LineSegments, MathUtils, Mesh, NearestFilter, PerspectiveCamera,
  Raycaster, RedFormat, Scene, Sphere, SphereGeometry, UnsignedByteType, Vector2, Vector3, WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { CountryFeature } from '../data/boundaries';
import { MotionPreference } from '../shared/motion-preference';
import { AURA_WIDTH, createAuraMaterial } from './aura-material';
import { createEarthMaterial } from './earth-material';
import { graticulePositions, lonLatToVector3, sphereLinePositions, vector3ToLonLat } from './geo';
import { idAt, rasterizeIds } from './id-map';

// Where the camera starts: above the Atlantic off Morocco, so Europe and Africa face you. Distance 2.9 ≈ the globe fills the screen height.
const START = { lon: -8, lat: 32, distance: 2.9 };
const ID_MAP_WIDTH = 4096, ID_MAP_HEIGHT = 2048; // 1 pixel ≈ 10 km at the equator. 4096 is the safe maximum texture size on any WebGL device.
const ID_MAP_TEXEL = (2 * Math.PI) / ID_MAP_WIDTH; // one ID map pixel, as a distance on the unit sphere (≈ 10 km)
const CLICK_TOLERANCE = 5; // px: a press that moves further than this is a drag (rotating the globe), not a click

// Three.js in Angular, the learn-angular lesson 15 recipe, zoneless:
//   viewChild → canvas · afterNextRender → create · render on demand → run · effects → inputs drive the scene · DestroyRef → dispose
// No runOutsideAngular anywhere: without zone.js, Angular never notices animation frames or pointer moves on the canvas.
@Component({
  selector: 'app-globe',
  template: `
    <canvas #canvas class="nsc-globe" [class.is-over-country]="pointerOnCountry()" role="img" [attr.aria-label]="label()"></canvas>
    <!-- Lesson 06: content from the parent, moved with the pointer by writing style.translate directly (no signal per mouse move) -->
    <div #tooltip class="tooltip" [hidden]="!pointerOnCountry()"><ng-content select="[globe-tooltip]" /></div>
  `,
  styles: `
    :host { display: block; position: relative; }
    .nsc-globe { display: block; width: 100%; height: 100%; cursor: grab; }
    .nsc-globe.is-over-country { cursor: pointer; }
    .nsc-globe:active { cursor: grabbing; }
    .tooltip {
      position: absolute; top: 0; left: 0; pointer-events: none; margin: 14px 0 0 14px;
      padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
      font-size: 0.85rem; white-space: nowrap; box-shadow: 0 4px 16px var(--shadow);
    }
  `
})
export class Globe {
  readonly features = input<CountryFeature[]>([]); // lesson 05: drawn through the ID map
  readonly borders = input<number[][][]>([]);       // lesson 05: every border once, as [lon, lat] lines
  readonly hovered = model<string | null>(null);   // lesson 06: two-way, like FlatMap's, so either view can light up a country
  readonly selected = model<string | null>(null);  // lesson 06: set by a click
  readonly autoRotate = input(true);
  readonly label = input('A globe you can rotate by dragging and zoom with the mouse wheel or a pinch. Click a country to select it.');
  readonly unsupported = output(); // no WebGL: the parent shows the flat map instead

  protected readonly pointerOnCountry = signal(false); // only the pointer shows the tooltip, not a hover coming from elsewhere
  // Country id → its number in the ID map (features[0] is 1). computed(): rebuilt only when the features change.
  private readonly numberById = computed(() => new Map(this.features().map((f, i) => [f.id, i + 1])));

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly tooltip = viewChild.required<ElementRef<HTMLElement>>('tooltip');

  constructor() {
    const destroyRef = inject(DestroyRef), injector = inject(Injector), motion = inject(MotionPreference);

    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;

      // --- create ---
      let renderer: WebGLRenderer;
      try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); }
      catch { this.unsupported.emit(); return; } // WebGL disabled, blocklisted GPU, or too many contexts
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // a 3× phone screen would otherwise render 9× the pixels
      // The page shows through (alpha: true): the paper colour behind the globe is the page's, not the scene's

      const scene = new Scene();
      const camera = new PerspectiveCamera(40, 1, 0.1, 100);
      lonLatToVector3(START.lon, START.lat, START.distance, camera.position); // looking at the centre from above that point, north up

      // The Earth. Its shader does its own lighting, from a direction fixed to the camera: whichever side you look at is lit.
      // (Lesson 04 used Three.js lights for that; a real sun would leave half the data in the dark.)
      // 192 × 128 segments: the flat triangles sag at most 0.9 km below the true sphere (96 × 64 sagged 3.5 km, enough to see the fill drift from the borders)
      const earthGeometry = new SphereGeometry(1, 192, 128);
      const earthMaterial = createEarthMaterial();
      earthMaterial.uniforms['pixelRatio'].value = renderer.getPixelRatio();
      let idMap: DataTexture | null = null;
      let ids: Uint8Array | null = null; // the CPU copy of the ID map, for picking
      scene.add(new Mesh(earthGeometry, earthMaterial));

      // Graticule: lines every 15°
      const gridGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(graticulePositions(15), 3));
      const gridMaterial = new LineBasicMaterial({ color: '#141414', transparent: true, opacity: 0.07 });
      scene.add(new LineSegments(gridGeometry, gridMaterial));

      // Borders and coastlines, in ink. Filled in when the data arrives (effect below).
      // "Fat" lines (LineSegments2): WebGL draws ordinary lines 1 px wide whatever you ask for. These are thin quads facing the
      // camera, so their width in pixels can be set, and changed with the zoom (updateLineWidth below).
      const bordersGeometry = new LineSegmentsGeometry();
      const bordersMaterial = new LineMaterial({ color: 0x141414, linewidth: 1, worldUnits: false, transparent: true, opacity: 0.9 });
      scene.add(new LineSegments2(bordersGeometry, bordersMaterial));

      // Aura: a hatched halo and an ink outline around the globe (aura-material.ts), on a sphere just big enough to hold it
      const auraGeometry = new SphereGeometry(1 + AURA_WIDTH + 0.01, 96, 64);
      const auraMaterial = createAuraMaterial();
      auraMaterial.uniforms['pixelRatio'].value = renderer.getPixelRatio();
      scene.add(new Mesh(auraGeometry, auraMaterial));

      // Drag to rotate, wheel/pinch to zoom. Damping = it glides to a stop instead of halting.
      const controls = new OrbitControls(camera, canvas);
      Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 1.35, maxDistance: 6, rotateSpeed: 0.5, zoomSpeed: 0.7, autoRotateSpeed: 0.35 });

      // --- run: render on demand ---
      // A frame is drawn only while something moves: a drag, the damping glide, a zoom, auto-rotation.
      // Then the loop stops, and an idle globe costs nothing (≈ react-three-fiber's frameloop="demand").
      let running = false, visible = true, userTookOver = false;
      // Border width follows the zoom: about 1.2 ID map pixels as they appear on screen, between 1 and 6 px.
      // Zoomed in, the fill's edge shows the ID map's 10 km pixels as small steps; a line that wide covers them.
      const updateLineWidth = () => {
        const toSurface = camera.position.length() - 1;
        const pxPerUnit = canvas.clientHeight / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * toSurface);
        bordersMaterial.linewidth = MathUtils.clamp(ID_MAP_TEXEL * pxPerUnit * 1.2, 1, 6);
      };
      const render = () => { updateLineWidth(); renderer.render(scene, camera); };
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

      // --- picking (lesson 06): pointer → ray → point on the sphere → lon/lat → ID map pixel → country ---
      // The globe is a perfect sphere of radius 1 at the origin, so the ray is tested against that maths sphere,
      // not against the 49 000 triangles of the mesh. Exact, and a few multiplications instead of a mesh raycast.
      const raycaster = new Raycaster(), pointer = new Vector2(), unitSphere = new Sphere(new Vector3(), 1), hit = new Vector3();
      const pick = (e: PointerEvent): string | null => {
        if (!ids) return null;
        const r = canvas.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); // to -1…1, y up
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.ray.intersectSphere(unitSphere, hit)) return null; // the pointer is beside the globe
        const [lon, lat] = vector3ToLonLat(hit);
        const n = idAt(ids, ID_MAP_WIDTH, ID_MAP_HEIGHT, lon, lat);
        return n ? this.features()[n - 1].id : null;
      };

      // --- observers & listeners ---
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = canvas;
        if (!w || !h) return;
        renderer.setSize(w, h, false); // false: CSS decides the canvas size, we only match its pixel buffer
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        bordersMaterial.resolution.set(w, h); // LineMaterial needs the canvas size to turn its width into pixels
        render();
      };
      const tooltip = this.tooltip().nativeElement;
      let down: { x: number; y: number } | null = null;
      // OrbitControls applies movement inside update(), so a sleeping loop has to be woken by the input itself
      const onPointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; wake(); };
      const onPointerMove = (e: PointerEvent) => {
        wake();
        // Hover only for a mouse or pen that isn't dragging. Touch has no hover, and while dragging the globe slides under the pointer.
        if (e.buttons || e.pointerType === 'touch') return;
        const id = pick(e);
        if (id !== this.hovered()) this.hovered.set(id); // a signal write only when the country changes, not on every move
        this.pointerOnCountry.set(!!id);
        const r = canvas.getBoundingClientRect();
        tooltip.style.translate = `${e.clientX - r.left}px ${e.clientY - r.top}px`; // per-move position: straight to the DOM
      };
      const onPointerUp = (e: PointerEvent) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_TOLERANCE) this.selected.set(pick(e)); // the ocean deselects
        down = null;
      };
      const onPointerLeave = () => { this.hovered.set(null); this.pointerOnCountry.set(false); };
      const onStart = () => { userTookOver = true; updateAutoRotate(); }; // the first drag stops the auto-rotation for good
      const resizeObserver = new ResizeObserver(resize);
      const visibility = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) { running = false; renderer.setAnimationLoop(null); } else wake();
      });
      resizeObserver.observe(canvas);
      visibility.observe(canvas);
      resize(); // size the buffer now; the observer's first report can come a frame later (or not at all in a hidden tab)
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', wake, { passive: true });
      controls.addEventListener('start', onStart);

      // --- inputs → scene ---
      effect(() => updateAutoRotate(), { injector }); // reads autoRotate() and motion.reduced(): re-runs when either changes

      // Countries → the ID map texture. Runs when the features arrive (they load after the globe is created).
      effect(() => {
        const features = this.features();
        if (!features.length) return;
        ids = rasterizeIds(features, ID_MAP_WIDTH, ID_MAP_HEIGHT);
        const texture = new DataTexture(ids, ID_MAP_WIDTH, ID_MAP_HEIGHT, RedFormat, UnsignedByteType);
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
        const positions = sphereLinePositions(this.borders());
        if (!positions.length) return;
        // setPositions() also recomputes the bounding sphere. Lesson 05's bug: a sphere cached from the first, empty render made
        // the camera skip the lines as "off-screen" (frustum culling), depending on load order.
        bordersGeometry.setPositions(positions);
        render();
      }, { injector });

      // Hovered / selected → two shader uniforms. Wherever the change came from (this globe, the map, later a list), one frame is drawn.
      effect(() => {
        const numbers = this.numberById();
        earthMaterial.uniforms['hovered'].value = numbers.get(this.hovered() ?? '') ?? 0;
        earthMaterial.uniforms['selected'].value = numbers.get(this.selected() ?? '') ?? 0;
        render();
      }, { injector });

      // --- destroy: everything created above, in reverse ---
      destroyRef.onDestroy(() => {
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        visibility.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', wake);
        controls.removeEventListener('start', onStart);
        controls.dispose();
        for (const disposable of [earthGeometry, earthMaterial, gridGeometry, gridMaterial, bordersGeometry, bordersMaterial, auraGeometry, auraMaterial]) disposable.dispose();
        idMap?.dispose();
        renderer.dispose();
        renderer.forceContextLoss(); // hand the WebGL context back now; browsers allow only ~16 at once
      });
    });
  }
}
