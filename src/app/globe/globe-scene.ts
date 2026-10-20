import { gsap } from 'gsap';
import {
  BufferAttribute, BufferGeometry, DataTexture, LineBasicMaterial, LineSegments, MathUtils, Mesh, NearestFilter, PerspectiveCamera, Quaternion,
  Raycaster, RedFormat, Scene, Sphere, SphereGeometry, UnsignedByteType, Vector2, Vector3, WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { CountryFeature } from '../data/boundaries';
import { AURA_WIDTH, createAuraMaterial } from './aura-material';
import { createEarthMaterial } from './earth-material';
import { frameCountry } from './framing';
import { graticulePositions, lonLatToVector3, sphereLinePositions, vector3ToLonLat } from './geo';
import { idAt, rasterizeIds } from './id-map';

// Where the camera starts: above Iraq, with Europe on the left. The auto-spin then turns Europe towards the centre.
// Distance 2.9 ≈ the globe fills the screen height.
const START = { lon: 45, lat: 30, distance: 2.9 };
// Camera distance limits, from the globe's centre (globe radius = 1). One place for both scroll/pinch and the fly-to framing.
//   closest 1.8: Europe fills the screen, about Hungary-sized countries at their most detailed (adjust here)
//   farthest 6: the whole globe small in the middle
const ZOOM = { closest: 1.8, farthest: 6 };
// The selection hatch keeps its full size from this distance out; closer in it gets finer, down to HATCH_FINEST at ZOOM.closest.
// Up close the borders are thick and the country fills the screen, so a full-size hatch reads as heavy stripes.
const HATCH_FULL_FROM = 2.6;
const HATCH_FINEST = 0.55;
// Colour crossfade when the data changes (lesson 12). Shorter than one year of playback (1 / 8 s), so fades never pile up.
const PALETTE_FADE_S = 0.1;
const FRAME_FARTHEST = 4; // the fly-to never backs off further than this, even for Russia
const ID_MAP_WIDTH = 4096, ID_MAP_HEIGHT = 2048; // 1 pixel ≈ 10 km at the equator. 4096 is the safe maximum texture size on any WebGL device.
const ID_MAP_TEXEL = (2 * Math.PI) / ID_MAP_WIDTH; // one ID map pixel, as a distance on the unit sphere (≈ 10 km)
const CLICK_TOLERANCE = 5; // px: a press that moves further than this is a drag (rotating the globe), not a click
// Wheel zoom: each pixel of scroll multiplies the target distance by e^(px · 0.0015): one mouse notch (100 px) ≈ ×1.16.
// Multiplicative, so a notch feels the same close up and far away. The camera eases toward the target with a ~90 ms time
// constant: ~95% of the way in 0.27 s, so a notch becomes a short glide and a trackpad stays continuous.
const ZOOM_PER_PIXEL = 0.0015;
const ZOOM_EASE_MS = 90;
// Drag sensitivity. 1 = "grab and follow": the point you press on stays under the cursor (see updateRotateSpeed).
// Above 1 the globe turns faster than the cursor moves, below 1 slower.
const DRAG_FEEL = 1;

// Built once per page load, not once per globe. The data never changes during a visit, so a Map → Globe switch reuses
// these instead of rasterizing (~90 ms) and densifying the borders again. WeakMap: keyed by the data arrays themselves,
// and forgotten if those are ever replaced.
const idMapCache = new WeakMap<CountryFeature[], Uint8Array>();
const bordersCache = new WeakMap<number[][][], Float32Array>();

export type GlobeSceneCallbacks = {
  // The pointer moved: the country under it (null = sea or space), and where, in px from the canvas's top-left
  hover: (id: string | null, x: number, y: number) => void;
  // A click (not a drag) chose a country, or the sea (null)
  select: (id: string | null) => void;
};

// The globe's Three.js side: renderer, scene, camera, controls, the render loop, picking, flights. No Angular in here.
// The Globe component creates one, feeds it data through the methods below, and disposes it.
// Throws from the constructor when WebGL isn't available.
export class GlobeScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private readonly controls: OrbitControls;

  private readonly earthGeometry = new SphereGeometry(1, 192, 128); // 192 × 128: the flat triangles sag under 1 km below the true sphere
  private readonly earthMaterial = createEarthMaterial();
  private readonly gridGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(graticulePositions(15), 3));
  private readonly gridMaterial = new LineBasicMaterial({ color: '#141414', transparent: true, opacity: 0.07 });
  // "Fat" lines: WebGL draws ordinary lines 1 px wide whatever you ask for. These are thin quads facing the camera,
  // so their width in pixels can be set, and changed with the zoom (updateLineWidth).
  private readonly bordersGeometry = new LineSegmentsGeometry();
  private readonly bordersMaterial = new LineMaterial({ color: 0x141414, linewidth: 1, worldUnits: false, transparent: true, opacity: 0.9 });
  private readonly auraGeometry = new SphereGeometry(1 + AURA_WIDTH + 0.01, 96, 64);
  private readonly auraMaterial = createAuraMaterial();

  private idMap: DataTexture | null = null;
  private ids: Uint8Array | null = null; // the CPU copy of the ID map, for picking
  private features: CountryFeature[] = [];
  private numberById = new Map<string, number>(); // 'FRA' → its number in the ID map (features[0] is 1)
  private highlight = { hovered: null as string | null, selected: null as string | null };
  private fills: ReadonlyMap<string, string> | null = null; // country id → colour (lesson 09)

  private running = false;
  private dirty = false; // something changed that the next frame must show (invalidate)
  private visible = true;
  private userTookOver = false;
  private autoRotateWanted = true;
  private flight: gsap.core.Tween | null = null;
  private paletteFade: gsap.core.Tween | null = null;
  private down: { x: number; y: number } | null = null;
  private dragging = false; // the press has moved past CLICK_TOLERANCE: it's a drag, not a click
  private zoomTarget: number | null = null; // where an eased wheel zoom is heading (distance from the centre); null = not zooming
  private lastTick = 0;

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly unitSphere = new Sphere(new Vector3(), 1);
  private readonly hit = new Vector3();
  private readonly resizeObserver = new ResizeObserver(() => this.resize());
  private readonly visibility = new IntersectionObserver(([entry]) => {
    this.visible = entry.isIntersecting;
    if (this.visible) this.wake();
    else this.sleep();
  });

  constructor(private readonly canvas: HTMLCanvasElement, private readonly on: GlobeSceneCallbacks) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); // throws without WebGL; alpha: the page's paper shows through
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // a 3× phone screen would otherwise render 9× the pixels
    this.earthMaterial.uniforms['pixelRatio'].value = this.renderer.getPixelRatio();
    this.auraMaterial.uniforms['pixelRatio'].value = this.renderer.getPixelRatio();

    lonLatToVector3(START.lon, START.lat, START.distance, this.camera.position); // looking at the centre from above that point, north up
    this.scene.add(
      new Mesh(this.earthGeometry, this.earthMaterial),
      new LineSegments(this.gridGeometry, this.gridMaterial),
      new LineSegments2(this.bordersGeometry, this.bordersMaterial),
      new Mesh(this.auraGeometry, this.auraMaterial)
    );

    // Drag to rotate, pinch to zoom. Damping = it glides to a stop instead of halting.
    // The mouse wheel is handled here instead (onWheel): OrbitControls applies each wheel notch as an instant jump.
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: ZOOM.closest, maxDistance: ZOOM.farthest, zoomSpeed: 0.7, autoRotateSpeed: 0.35 });
    // OrbitControls' constructor runs disconnect() on the way in, which writes style.cursor = 'auto' inline. That beats the
    // stylesheet (grab, pointer over a country, grabbing while dragging), so clear it and let globe.scss decide.
    canvas.style.cursor = '';

    this.updateRotateSpeed();
    this.resizeObserver.observe(canvas);
    this.visibility.observe(canvas);
    this.resize(); // size the buffer now; the observer's first report can come a frame later (or not at all in a hidden tab)
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    // Capture phase: on the canvas itself, capture listeners run before OrbitControls' own wheel listener, so onWheel can stop it.
    // Not passive: preventDefault() keeps ctrl+wheel (a trackpad pinch) from zooming the whole page.
    canvas.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.controls.addEventListener('start', this.onControlsStart);
  }

  // --- data in -----------------------------------------------------------------------------------------------------

  // Countries → the ID map texture (lesson 05). The array is rasterized once per page load (idMapCache); the texture
  // is per globe, because every globe has its own WebGL context.
  setFeatures(features: CountryFeature[]) {
    if (!features.length || features === this.features) return;
    let ids = idMapCache.get(features);
    if (!ids) idMapCache.set(features, (ids = rasterizeIds(features, ID_MAP_WIDTH, ID_MAP_HEIGHT)));
    const texture = new DataTexture(ids, ID_MAP_WIDTH, ID_MAP_HEIGHT, RedFormat, UnsignedByteType);
    // Nearest, never blended: halfway between country 12 and country 40 must not read as country 26
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.idMap?.dispose();
    this.idMap = texture;
    this.ids = ids;
    this.features = features;
    this.numberById = new Map(features.map((f, i) => [f.id, i + 1]));
    // Each country's centre, for its hatching direction (earth-material.ts): slot n = country n, xyz packed into bytes
    const centres = this.earthMaterial.uniforms['centres'].value as DataTexture;
    const bytes = centres.image.data as Uint8Array;
    features.forEach((f, i) => {
      const v = lonLatToVector3(...f.properties.label);
      bytes.set([v.x, v.y, v.z, 1].map(c => Math.round((c + 1) * 127.5)), (i + 1) * 4);
    });
    centres.needsUpdate = true;
    this.earthMaterial.uniforms['idMap'].value = texture;
    this.setHighlight(this.highlight.hovered, this.highlight.selected); // ids → numbers, now that the numbers exist
    this.setFills(this.fills);
  }

  // Borders → fat line segments on the sphere (lesson 05), densified once per page load (bordersCache)
  setBorders(lines: number[][][]) {
    if (!lines.length) return;
    let positions = bordersCache.get(lines);
    if (!positions) bordersCache.set(lines, (positions = sphereLinePositions(lines)));
    // setPositions() also recomputes the bounding sphere. Lesson 05's bug: a sphere cached from the first, empty render made
    // the camera skip the lines as "off-screen" (frustum culling), depending on load order.
    this.bordersGeometry.setPositions(positions);
    this.invalidate();
  }

  // Hovered / selected → two shader uniforms (lesson 06). Changing them redraws one frame, nothing is rebuilt.
  setHighlight(hovered: string | null, selected: string | null) {
    this.highlight = { hovered, selected };
    this.earthMaterial.uniforms['hovered'].value = this.numberById.get(hovered ?? '') ?? 0;
    this.earthMaterial.uniforms['selected'].value = this.numberById.get(selected ?? '') ?? 0;
    this.invalidate();
  }

  // Country colours → the palette texture (lesson 09): slot n gets the colour of country number n, alpha 0 = no data.
  // null = not coloured (plain white land), e.g. while the data loads.
  // Lesson 12: fade = crossfade from the old colours (another year, another metric). The old bytes go to previousPalette and
  // GSAP runs paletteMix from 0 to 1; each step only redraws. A new change mid-fade starts from the old fade's target.
  setFills(fills: ReadonlyMap<string, string> | null, fade = false) {
    const hadFills = !!this.fills;
    this.fills = fills;
    const uniforms = this.earthMaterial.uniforms;
    const palette = uniforms['palette'].value as DataTexture, previous = uniforms['previousPalette'].value as DataTexture;
    const bytes = palette.image.data as Uint8Array;
    this.paletteFade?.kill();
    this.paletteFade = null;
    uniforms['paletteMix'].value = 1;
    if (fade && hadFills && fills) {
      (previous.image.data as Uint8Array).set(bytes);
      previous.needsUpdate = true;
      uniforms['paletteMix'].value = 0;
      this.paletteFade = gsap.to(uniforms['paletteMix'], { value: 1, duration: PALETTE_FADE_S, ease: 'none', onUpdate: () => this.invalidate() });
    }
    bytes.fill(0);
    if (fills) {
      for (const [id, n] of this.numberById) {
        const hex = fills.get(id);
        if (!hex) continue;
        const rgb = parseInt(hex.slice(1), 16);
        bytes.set([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255], n * 4);
      }
    }
    palette.needsUpdate = true; // upload the 1 kB again
    this.earthMaterial.uniforms['colored'].value = fills ? 1 : 0;
    this.invalidate();
  }

  // Auto-rotation as wanted by the component (input + reduced motion); it stays off for good once the user has taken over
  setAutoRotate(wanted: boolean) {
    this.autoRotateWanted = wanted;
    this.controls.autoRotate = wanted && !this.userTookOver;
    this.wake();
  }

  // --- render on demand --------------------------------------------------------------------------------------------
  // A frame is drawn only while something moves (a drag, the damping glide, a zoom, auto-rotation) or after invalidate().
  // Then the loop stops, and an idle globe costs nothing (≈ react-three-fiber's frameloop="demand" + invalidate()).

  // "Something changed, draw it." Several changes in the same frame (a hover and a selection, new data) still make one render:
  // the frame is drawn by the next tick, not here. During a flight GSAP draws every frame anyway, so there's nothing to do.
  invalidate() {
    this.dirty = true;
    this.wake();
  }

  private wake() {
    if (this.running || !this.visible || this.flight) return;
    this.running = true;
    this.renderer.setAnimationLoop(this.tick);
  }

  private sleep() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private readonly tick = (time: number) => {
    // Time since the last frame, for frame-rate-independent easing. After a pause (the loop was asleep) assume one 60 Hz frame.
    const dt = this.lastTick && time - this.lastTick < 100 ? time - this.lastTick : 1000 / 60;
    this.lastTick = time;
    const zooming = this.easeZoom(dt);
    this.updateRotateSpeed(); // the zoom may have changed since the last frame
    const moved = this.controls.update(); // true while the camera is still changing
    // Auto-rotation always renders and keeps the loop alive: with damping it ramps up from almost nothing,
    // so its first frames move less than update()'s threshold and would otherwise be skipped, and the loop stopped.
    if (moved || zooming || this.dirty || this.controls.autoRotate) this.render();
    this.dirty = false;
    if (!moved && !zooming && !this.controls.autoRotate) this.sleep();
  };

  // Drag speed that follows the zoom. OrbitControls turns the globe by 2π · rotateSpeed radians per screen height of drag.
  // One pixel on screen spans 2 · tan(fov/2) · (distance − 1) / height on the surface facing the camera (distance − 1 = how far
  // the camera is from it), and on a unit sphere that length is also the angle. Equal when
  //   rotateSpeed = tan(fov/2) · (distance − 1) / π
  // ≈ 0.22 at the start distance (2.9), 0.09 fully zoomed in, 0.58 zoomed out. A fixed speed (it was 0.5) is too fast up close,
  // where a small drag should move a small part of the world.
  private updateRotateSpeed() {
    const toSurface = this.camera.position.length() - 1;
    this.controls.rotateSpeed = DRAG_FEEL * Math.tan(MathUtils.degToRad(this.camera.fov / 2)) * toSurface / Math.PI;
  }

  // One step of the eased wheel zoom: move the camera a fraction of the remaining way to zoomTarget, along its own direction.
  // 1 − e^(−dt/τ) is that fraction: the same glide at 60 Hz and 144 Hz. Returns whether a zoom is still in progress.
  private easeZoom(dt: number) {
    if (this.zoomTarget === null) return false;
    const distance = this.camera.position.length();
    const next = distance + (this.zoomTarget - distance) * (1 - Math.exp(-dt / ZOOM_EASE_MS));
    const arrived = Math.abs(this.zoomTarget - next) < 1e-4;
    this.camera.position.setLength(arrived ? this.zoomTarget : next);
    if (arrived) this.zoomTarget = null;
    return true;
  }

  private render() {
    this.updateLineWidth();
    this.updateHatchScale();
    this.renderer.render(this.scene, this.camera);
  }

  private updateHatchScale() {
    const t = MathUtils.smoothstep(this.camera.position.length(), ZOOM.closest, HATCH_FULL_FROM);
    this.earthMaterial.uniforms['hatchScale'].value = MathUtils.lerp(HATCH_FINEST, 1, t);
  }

  // Border width follows the zoom: about 1.2 ID map pixels as they appear on screen, between 1 and 6 px.
  // Zoomed in, the fill's edge shows the ID map's 10 km pixels as small steps; a line that wide covers them.
  private updateLineWidth() {
    const toSurface = this.camera.position.length() - 1;
    const pxPerUnit = this.canvas.clientHeight / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)) * toSurface);
    this.bordersMaterial.linewidth = MathUtils.clamp(ID_MAP_TEXEL * pxPerUnit * 1.2, 1, 6);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); // false: CSS decides the canvas size, we only match its pixel buffer
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bordersMaterial.resolution.set(w, h); // LineMaterial needs the canvas size to turn its width into pixels
    this.render(); // right away, not next frame: resizing clears the canvas, and a blank frame would flash
  }

  // --- fly to a country (lesson 10) ----------------------------------------------------------------------------------
  // GSAP tweens one number, t: 0 → 1. Each update turns it into a camera position:
  //   direction: slerp along the great circle from where the camera is to above the country (no cutting through the Earth)
  //   distance:  from the current zoom to the framing distance, lifted a little mid-way on long flights, like a plane climbing
  // GSAP keeps its own clock (it's used elsewhere too), so during a flight it draws the frames, and the render loop is paused:
  // OrbitControls' leftover damping can't pull against the tween.
  flyTo(feature: CountryFeature, instant: boolean) {
    const target = frameCountry(feature, this.camera.fov, this.camera.aspect, 0.3, { min: ZOOM.closest, max: FRAME_FARTHEST });
    this.flight?.kill();
    this.flight = null;
    this.zoomTarget = null; // the flight decides the distance now
    this.userTookOver = true; // a chosen country should stay put, not rotate away
    this.controls.autoRotate = false;
    this.sleep();

    const fromDirection = this.camera.position.clone().normalize(), fromDistance = this.camera.position.length();
    const toDirection = lonLatToVector3(target.lon, target.lat, 1);
    const angle = fromDirection.angleTo(toDirection); // 0 … π radians to travel
    const place = (direction: Vector3, distance: number) => {
      this.camera.position.copy(direction).multiplyScalar(distance);
      this.camera.lookAt(0, 0, 0); // north stays up: camera.up is +Y
      this.render();
    };
    if (instant) { place(toDirection, target.distance); return; } // reduced motion: jump, don't fly

    const turn = new Quaternion().setFromUnitVectors(fromDirection, toDirection), step = new Quaternion(), direction = new Vector3();
    const lift = 0.6 * (angle / Math.PI); // up to +0.6 radii for a flight to the far side
    const progress = { t: 0 };
    this.flight = gsap.to(progress, {
      t: 1,
      duration: 0.7 + 0.5 * angle, // longer trips take longer: 0.7 s next door, ~2.3 s to the antipode
      ease: 'power2.inOut',
      onUpdate: () => {
        step.identity().slerp(turn, progress.t);
        const distance = fromDistance + (target.distance - fromDistance) * progress.t + lift * Math.sin(Math.PI * progress.t);
        place(direction.copy(fromDirection).applyQuaternion(step), distance);
      },
      onComplete: () => { this.flight = null; }
    });
  }

  // --- picking (lesson 06): pointer → ray → point on the sphere → lon/lat → ID map pixel → country ----------------------
  // The globe is a perfect sphere of radius 1 at the origin, so the ray is tested against that maths sphere,
  // not against the 49 000 triangles of the mesh. Exact, and a few multiplications instead of a mesh raycast.
  private pick(e: PointerEvent, rect: DOMRect): string | null {
    if (!this.ids) return null;
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); // to -1…1, y up
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectSphere(this.unitSphere, this.hit)) return null; // the pointer is beside the globe
    const [lon, lat] = vector3ToLonLat(this.hit);
    const n = idAt(this.ids, ID_MAP_WIDTH, ID_MAP_HEIGHT, lon, lat);
    return n ? this.features[n - 1].id : null;
  }

  // --- pointer ---------------------------------------------------------------------------------------------------------
  // OrbitControls applies movement inside update(), so a sleeping loop has to be woken by the input itself.
  // Arrow-function fields: stable references, so removeEventListener in dispose() finds the same functions.
  private readonly onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    this.wake();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    this.wake();
    // Hover only for a mouse or pen that isn't dragging. Touch has no hover, and while dragging the globe slides under the pointer.
    if (e.buttons || e.pointerType === 'touch') {
      // When a press turns into a drag, clear the hover once: the tooltip and the highlight would otherwise hang where they were
      // while the globe turns under them. A plain click keeps them; they come back with the first move after the drag.
      if (this.down && !this.dragging && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= CLICK_TOLERANCE) {
        this.dragging = true;
        this.on.hover(null, 0, 0);
      }
      return;
    }
    const rect = this.canvas.getBoundingClientRect(); // read once, shared by picking and the tooltip position
    this.on.hover(this.pick(e, rect), e.clientX - rect.left, e.clientY - rect.top);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < CLICK_TOLERANCE) {
      this.on.select(this.pick(e, this.canvas.getBoundingClientRect())); // the ocean deselects
    }
    this.down = null;
    this.dragging = false;
  };

  private readonly onPointerLeave = () => this.on.hover(null, 0, 0);
  // The wheel moves a target distance; the render loop eases the camera there (easeZoom). Scrolling again mid-glide
  // continues from the target, not from where the camera happens to be, so fast scrolling adds up instead of stalling.
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation(); // OrbitControls would jump; we ease
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1); // lines / pages → pixels
    this.flight?.kill(); // scrolling takes the camera back from a flight
    this.flight = null;
    const from = this.zoomTarget ?? this.camera.position.length();
    this.zoomTarget = MathUtils.clamp(from * Math.exp(px * ZOOM_PER_PIXEL), ZOOM.closest, ZOOM.farthest);
    this.wake();
  };

  // A drag interrupts a flight, and stops auto-rotation for good
  private readonly onControlsStart = () => {
    this.flight?.kill();
    this.flight = null;
    this.userTookOver = true;
    this.setAutoRotate(this.autoRotateWanted);
  };

  // --- destroy: everything created above, in reverse -------------------------------------------------------------------
  dispose() {
    this.flight?.kill();
    this.sleep();
    this.resizeObserver.disconnect();
    this.visibility.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel, { capture: true }); // same capture flag, or it isn't removed
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.dispose();
    for (const disposable of [this.earthGeometry, this.earthMaterial, this.gridGeometry, this.gridMaterial, this.bordersGeometry, this.bordersMaterial, this.auraGeometry, this.auraMaterial]) disposable.dispose();
    this.idMap?.dispose();
    (this.earthMaterial.uniforms['palette'].value as DataTexture).dispose();
    (this.earthMaterial.uniforms['previousPalette'].value as DataTexture).dispose();
    (this.earthMaterial.uniforms['centres'].value as DataTexture).dispose();
    this.paletteFade?.kill();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // hand the WebGL context back now; browsers allow only ~16 at once
  }
}
