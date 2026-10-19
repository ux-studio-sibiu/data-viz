import { Color, DataTexture, ShaderMaterial } from 'three';

// The Earth's surface, coloured from the ID map (id-map.ts): 0 = ocean, anything else = land.
// Lesson 06: the hovered and the selected country are marked. Lesson 09 adds a colour per country.
//
// Drawn like an architectural plan: white land, a flat bluish-grey sea, the selection hatched in red. The hatching is engraved on the globe:
// each line is where one of a family of parallel planes slices the sphere, so it turns with the globe and spreads apart as you
// zoom in. The line *width* is measured in screen pixels (fwidth), so lines stay crisp at any zoom.
//
// The texture position is computed per pixel from the surface point, with the inverse of lonLatToVector3 (geo.ts):
//   lon = atan(x, z), lat = asin(y)
// instead of from SphereGeometry's built-in UVs, which start at lon -90° and would shift every country a quarter turn.
export function createEarthMaterial() {
  const empty = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); // all ocean, until the ID map is ready
  empty.needsUpdate = true;

  return new ShaderMaterial({
    uniforms: {
      idMap: { value: empty },
      ocean: { value: new Color('#d9e1e7') }, // flat bluish grey: reads as water without competing with the ink lines
      land: { value: new Color('#ffffff') },
      ink: { value: new Color('#141414') },
      // Country numbers from the ID map (1…240); 0 = none. Changing one is a uniform update, nothing is rebuilt.
      hovered: { value: 0 },
      selected: { value: 0 },
      hoverColor: { value: new Color('#e6e3dc') },
      selectColor: { value: new Color('#d1261b') },
      pixelRatio: { value: 1 } // line widths are in CSS pixels, so they look the same on a 2× screen
    },
    vertexShader: `
      varying vec3 vPosition; // on the unit sphere, in the globe's own coordinates
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D idMap;
      uniform vec3 ocean;
      uniform vec3 land;
      uniform vec3 ink;
      uniform float hovered;
      uniform float selected;
      uniform vec3 hoverColor;
      uniform vec3 selectColor;
      uniform float pixelRatio;
      varying vec3 vPosition;

      // Ink coverage of globe-fixed hatching at point p on the unit sphere: 1 on a line, 0 between lines.
      //   direction: the normal of the slicing planes; linesPerUnit: how many planes per unit of distance; widthPx: line width on screen.
      // t counts planes; fwidth(t) is how many planes one screen pixel spans, which turns "distance to the nearest plane" into pixels.
      // Zoomed far out, lines would be closer than ~3 px and shimmer (moiré): there they fade into their average grey.
      float hatch(vec3 p, vec3 direction, float linesPerUnit, float widthPx) {
        float t = dot(p, direction) * linesPerUnit;
        float perPixel = fwidth(t);
        float distancePx = min(fract(t), 1.0 - fract(t)) / perPixel;
        float width = widthPx * pixelRatio;
        float line = 1.0 - smoothstep(0.5 * width, 0.5 * width + 1.0, distancePx);
        float tooDense = smoothstep(0.2, 0.4, perPixel);
        return mix(line, clamp(width * perPixel, 0.0, 1.0), tooDense);
      }

      void main() {
        vec3 p = normalize(vPosition);
        float lon = atan(p.x, p.z);              // -π … π, 0 at Greenwich
        float lat = asin(clamp(p.y, -1.0, 1.0)); // -π/2 … π/2
        vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927); // ÷ 2π, ÷ π. Row 0 of the ID map is the north edge

        float id = floor(texture2D(idMap, uv).r * 255.0 + 0.5); // the byte back as a whole number
        // Computed for every pixel, before the ifs: fwidth() compares neighbouring pixels, and inside an if a neighbour that
        // took the other branch (the selected country vs its neighbour, right at a border) leaves it undefined.
        float selectedLines = hatch(p, normalize(vec3(-1.0, 1.0, 0.35)), 170.0, 1.2); // ~37 km apart

        vec3 color;
        if (id < 0.5) color = ocean;
        else if (abs(id - selected) < 0.5) color = mix(land, selectColor, 0.9 * selectedLines);
        else if (abs(id - hovered) < 0.5) color = hoverColor;                                          // floats: compare with a tolerance, not ==
        else color = land;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    // Push the surface a hair further from the camera in the depth test, so lines lying exactly on it (borders, grid)
    // always win instead of flickering (z-fighting). Lifting the lines off the surface instead made them drift from the
    // fill when seen at an angle (parallax): Portugal's coastline floated out into the Atlantic.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}
