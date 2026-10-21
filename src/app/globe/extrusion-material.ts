import { Color, DataTexture, DoubleSide, FloatType, NearestFilter, RedFormat, ShaderMaterial, type IUniform } from 'three';
import { PALETTE_SIZE } from './earth-material';

// Lesson 15: the countries' heights as a 256 × 1 texture of floats, slot n = country n, 0…1 of the tallest possible.
export function createHeightTexture() {
  const texture = new DataTexture(new Float32Array(PALETTE_SIZE), PALETTE_SIZE, 1, RedFormat, FloatType);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// The prisms (extrusion.ts): the vertex shader lifts every top vertex by its country's height; the fragment shader colours
// it from the same palette as the globe's surface, and shades it from one light so walls read as walls.
//
// `shared` is the Earth material's uniforms. The palette, its crossfade and the hovered / selected numbers are passed in
// as the SAME uniform objects, so whatever updates the surface updates the prisms in the same frame, with no copying.
export function createExtrusionMaterial(shared: Record<string, IUniform>) {
  return new ShaderMaterial({
    uniforms: {
      heights: { value: createHeightTexture() },
      previousHeights: { value: createHeightTexture() },
      heightMix: { value: 1 },  // crossfade from the previous heights (a new year), like paletteMix
      grow: { value: 0 },       // 0 = flat, 1 = full height: GSAP animates this when extrusion is turned on and off
      maxHeight: { value: 0.5 }, // the tallest country, in globe radii
      // Every country with data stands at least this tall (globe radii), so a 10 Mt emitter is a visible stub rather than
      // nothing. It overstates the very smallest a little: the note by the switch says so.
      minHeight: { value: 0.006 },
      // One colour for every column instead of the map's (0 = use the palette). Set by GlobeScene.
      solid: { value: new Color('#3d3d3d') },
      useSolid: { value: 0 },
      palette: shared['palette'],
      previousPalette: shared['previousPalette'],
      paletteMix: shared['paletteMix'],
      colored: shared['colored'],
      land: shared['land'],
      ink: shared['ink'],
      hovered: shared['hovered'],
      selected: shared['selected'],
      pixelRatio: shared['pixelRatio'] // outline widths are in CSS pixels
    },
    vertexShader: `
      attribute float aTop;
      attribute float aCountry;
      attribute vec2 aEdge;
      uniform sampler2D heights;
      uniform sampler2D previousHeights;
      uniform float heightMix;
      uniform float grow;
      uniform float maxHeight;
      uniform float minHeight;
      varying float vCountry;
      varying float vHeight;
      varying vec3 vNormal;
      varying vec2 vEdge;

      void main() {
        vec2 slot = vec2((aCountry + 0.5) / 256.0, 0.5);
        float value = mix(texture2D(previousHeights, slot).r, texture2D(heights, slot).r, heightMix);
        float h = (value > 0.0 ? max(value * maxHeight, minHeight) : 0.0) * grow; // the floor only for countries with data
        vec3 p = position * (1.0 + aTop * h); // the foot stays on the globe; the top rises along the radius
        vCountry = aCountry;
        vHeight = h;
        vNormal = normalize(normalMatrix * normal); // in view space, where the light is
        vEdge = aEdge;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D palette;
      uniform sampler2D previousPalette;
      uniform float paletteMix;
      uniform float colored;
      uniform vec3 land;
      uniform vec3 ink;
      uniform float hovered;
      uniform float selected;
      uniform float pixelRatio;
      uniform vec3 solid;
      uniform float useSolid;
      varying float vCountry;
      varying float vHeight;
      varying vec3 vNormal;
      varying vec2 vEdge;

      // The outlines: ink where a point is within ~1.4 px of its face's edge (vEdge near 0 or 1, measured in screen pixels
      // with fwidth, as the hatching is). A face whose vEdge is a constant 0.5 (a prism's cap) has fwidth 0 there and gets
      // no line. Worked out before the discard below: fwidth compares neighbouring pixels, which must all still be running.
      float outline() {
        vec2 perPixel = max(fwidth(vEdge), vec2(1e-6));
        vec2 distancePx = min(vEdge, 1.0 - vEdge) / perPixel;
        float halfWidth = 0.7 * pixelRatio; // not "half": a reserved word in GLSL ES
        float edges = 1.0 - smoothstep(halfWidth, halfWidth + 1.0, min(distancePx.x, distancePx.y));
        // The silhouette: a cylinder's side has no edges, but where it turns away from the camera its normal faces sideways
        // (view-space z near 0). Measured in pixels like the edges. Flat faces (squares, prisms) don't change normal across
        // a face, so fwidth is 0 there and this adds nothing.
        float nz = normalize(vNormal).z;
        float silhouettePx = abs(nz) / max(fwidth(nz), 1e-4);
        float silhouette = 1.0 - smoothstep(halfWidth, halfWidth + 1.0, silhouettePx);
        return max(edges, silhouette);
      }

      void main() {
        float line = outline();
        // A country with no height (no data, or turned flat) has no column: its zero-height cap would fight the surface
        if (vHeight < 0.0005) discard;
        vec2 slot = vec2((vCountry + 0.5) / 256.0, 0.5);
        vec4 now = texture2D(palette, slot), before = texture2D(previousPalette, slot);
        vec3 color = colored < 0.5 ? land : mix(before.a > 0.5 ? before.rgb : land, now.a > 0.5 ? now.rgb : land, paletteMix);
        if (useSolid > 0.5) color = solid;

        // One light from above-left of the camera. abs(): the walls' normals aren't oriented in or out (rings run either
        // way), and the material is double-sided, so either face lights the same. Walls face sideways, so they come out darker.
        float light = abs(dot(normalize(vNormal), normalize(vec3(-0.35, 0.55, 0.75))));
        color *= 0.62 + 0.38 * light;

        // Hover and selection: darker on coloured columns; on dark grey ones, lighter, or the change wouldn't show
        vec3 towards = useSolid > 0.5 ? land : ink;
        if (abs(vCountry - hovered) < 0.5) color = mix(color, towards, 0.18);
        if (abs(vCountry - selected) < 0.5) color = mix(color, towards, 0.32);
        color = mix(color, ink, 0.9 * line);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    side: DoubleSide
  });
}
