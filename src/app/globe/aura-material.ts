import { BackSide, Color, ShaderMaterial } from 'three';

export const AURA_WIDTH = 0.14; // how far the hatched halo reaches beyond the globe, in globe radii

// The aura: a hatched halo around the globe, fading outward, plus a fine ink outline at the globe's edge.
// (On white paper the globe's silhouette would disappear without the outline.)
//
// Drawn on a slightly bigger sphere, seen from inside (BackSide). For each pixel the shader measures how close the
// camera ray passes to the globe's centre, in globe radii: 1.0 = grazing the globe's edge, 1.14 = the halo's outer edge.
// That distance alone decides the outline and the fade, the same at every zoom level.
export function createAuraMaterial() {
  return new ShaderMaterial({
    uniforms: {
      ink: { value: new Color('#141414') },
      width: { value: AURA_WIDTH },
      pixelRatio: { value: 1 }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 ink;
      uniform float width;
      uniform float pixelRatio;
      varying vec3 vWorld;

      void main() {
        vec3 ray = normalize(vWorld - cameraPosition);
        float r = length(cross(cameraPosition, ray)); // closest distance from the globe's centre to the ray (cameraPosition is built in)
        float px = fwidth(r);                        // how much r changes across one pixel: lets us draw a line in pixels, not units

        float outline = 1.0 - smoothstep(px * 1.0, px * 2.0, r - 1.0); // ~1.5 px ink line just outside the edge
        vec2 p = gl_FragCoord.xy / pixelRatio;
        float lines = 1.0 - smoothstep(0.6, 1.6, mod(p.x + p.y, 6.0));  // "/" hatching, every 6 px, like the sea
        float fade = pow(clamp(1.0 - (r - 1.0) / width, 0.0, 1.0), 1.6); // dense at the globe, gone at the halo's edge

        float alpha = max(outline * 0.9, lines * fade * 0.7);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(ink, alpha);
        #include <colorspace_fragment>
      }`,
    side: BackSide, transparent: true, depthWrite: false
  });
}
