import { Color, DataTexture, NearestFilter, ShaderMaterial, SRGBColorSpace } from 'three';

export const PALETTE_SIZE = 256; // one colour slot per ID map number (0 = ocean, 1…240 = countries)

// The choropleth palette (lesson 09): a 256 × 1 texture, slot n = the colour of country number n.
// Alpha 255 = has a value, alpha 0 = no data. Recolouring the globe for another metric or year rewrites 1 kB, nothing else.
export function createPaletteTexture() {
  const texture = new DataTexture(new Uint8Array(PALETTE_SIZE * 4), PALETTE_SIZE, 1);
  texture.magFilter = texture.minFilter = NearestFilter; // never blend two countries' colours
  texture.colorSpace = SRGBColorSpace;                   // the bytes are sRGB, like CSS colours; the shader gets linear values
  texture.needsUpdate = true;
  return texture;
}

// The Earth's surface, coloured from the ID map (id-map.ts): 0 = ocean, anything else = land.
// Lesson 06: the hovered and the selected country are marked. Lesson 09: each country coloured by its data (the palette).
//
// Drawn like an architectural plan: white land and sea, the selection hatched in red. The hatching is engraved on the globe:
// each line is where one of a family of parallel planes slices the sphere, so it turns with the globe and spreads apart as you
// zoom in. The line *width* is measured in screen pixels (fwidth), so lines stay crisp at any zoom.
//
// The texture position is computed per pixel from the surface point, with the inverse of lonLatToVector3 (geo.ts):
//   lon = atan(x, z), lat = asin(y)
// instead of from SphereGeometry's built-in UVs, which start at lon -90° and would shift every country a quarter turn.
// Each country's centre (its label point) as a unit vector, slot n = country number n, packed into bytes: (v + 1) / 2 · 255.
// The hatching takes its direction from it (see hatchDirection in the shader). 1 kB, written once per page load.
export function createCentresTexture() {
  const texture = new DataTexture(new Uint8Array(PALETTE_SIZE * 4).fill(128), PALETTE_SIZE, 1);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createEarthMaterial() {
  const empty = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); // all ocean, until the ID map is ready
  empty.needsUpdate = true;

  return new ShaderMaterial({
    uniforms: {
      idMap: { value: empty },
      ocean: { value: new Color('#ffffff') }, // white, like the paper: the coastlines alone draw the land (was #dcdcdc grey)
      land: { value: new Color('#ffffff') },
      ink: { value: new Color('#141414') },
      // Country numbers from the ID map (1…240); 0 = none. Changing one is a uniform update, nothing is rebuilt.
      hovered: { value: 0 },
      selected: { value: 0 },
      palette: { value: createPaletteTexture() },
      centres: { value: createCentresTexture() },
      // Lesson 12: the palette before the last change, and how far the fade from it has gone (1 = fully the new one)
      previousPalette: { value: createPaletteTexture() },
      paletteMix: { value: 1 },
      colored: { value: 0 }, // 0 until a palette is set: plain white land, not "no data" everywhere while the data loads
      pixelRatio: { value: 1 }, // line widths are in CSS pixels, so they look the same on a 2× screen
      hatchScale: { value: 1 }  // the selection hatch's spacing and width: 1 from mid zoom out, finer zoomed in (GlobeScene sets it)
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
      uniform sampler2D palette;
      uniform sampler2D centres;
      uniform sampler2D previousPalette;
      uniform float paletteMix;
      uniform float colored;
      uniform float pixelRatio;
      uniform float hatchScale;
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

      // Hatching that keeps about the same spacing on screen at any zoom: as fine on Luxembourg seen from afar as on Russia
      // seen up close. Still fixed to the globe, so it turns with it.
      //   unitsPerPixel: how far across the planes one screen pixel reaches. The ideal density is 1 / (spacingPx · unitsPerPixel).
      //   Densities are rounded to powers of 2: zooming in, the lines spread apart until there's room for a new one between each
      //   pair, which fades in (fine → 1); at double density the cycle repeats. Every line of the coarser set is also in the finer
      //   one, so nothing slides or jumps. The spacing on screen stays between spacingPx and 2 × spacingPx.
      float zoomHatch(vec3 p, vec3 direction, float spacingPx, float widthPx) {
        float unitsPerPixel = max(fwidth(dot(p, direction)), 1e-7);
        float level = log2(1.0 / (spacingPx * pixelRatio * unitsPerPixel));
        float coarse = floor(level);
        float fine = level - coarse;
        return mix(hatch(p, direction, exp2(coarse), widthPx), hatch(p, direction, exp2(coarse + 1.0), widthPx), fine);
      }

      // The hatching direction for one country: diagonal across the surface at the country's centre.
      // Each hatch family is a set of parallel planes slicing the sphere, and those slices are circles around the planes' normal.
      // One fixed normal for the whole globe put the rings' centre somewhere on land (the US north-east showed a bullseye).
      // A normal lying flat along the surface at the country's own centre puts the rings' centre 90° away, beyond the country:
      // across it the lines run almost straight. turn = +1 or -1 picks one diagonal or the other.
      vec3 hatchDirection(vec3 centre, float turn) {
        vec3 east = cross(vec3(0.0, 1.0, 0.0), centre);
        east = length(east) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(east); // a centre at a pole has no east: pick one
        vec3 north = cross(centre, east);
        return normalize(east * turn + north);
      }

      // A country's fill from its palette slot: the data colour, or "no data" hatching when the slot is empty (alpha 0)
      vec3 dataColor(vec4 slot, float noDataLines) {
        return slot.a > 0.5 ? slot.rgb : mix(land, ink, 0.3 * noDataLines);
      }

      void main() {
        vec3 p = normalize(vPosition);
        float lon = atan(p.x, p.z);              // -π … π, 0 at Greenwich
        float lat = asin(clamp(p.y, -1.0, 1.0)); // -π/2 … π/2
        vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927); // ÷ 2π, ÷ π. Row 0 of the ID map is the north edge

        float id = floor(texture2D(idMap, uv).r * 255.0 + 0.5); // the byte back as a whole number
        vec2 slot = vec2((id + 0.5) / 256.0, 0.5); // the centre of slot "id" in the 256 × 1 textures
        vec3 centre = normalize(texture2D(centres, slot).xyz * 2.0 - 1.0);
        // Computed for every pixel, before the ifs: fwidth() compares neighbouring pixels, and inside an if a neighbour that
        // took the other branch (the selected country vs its neighbour, right at a border) leaves it undefined.
        float selectedLines = zoomHatch(p, hatchDirection(centre, -1.0), 6.0 * hatchScale, 2.0 * hatchScale); // 6–12 px apart, 2 px wide; finer up close
        float noDataLines = hatch(p, hatchDirection(centre, 1.0), 110.0, 0.8);         // the other diagonal, finer, lighter

        vec4 data = texture2D(palette, slot);
        vec4 before = texture2D(previousPalette, slot);
        vec3 color;
        if (id < 0.5) color = ocean;
        else {
          // No data: white with light grey hatching, so it can never be mistaken for "the lowest class"
          color = colored < 0.5 ? land : mix(dataColor(before, noDataLines), dataColor(data, noDataLines), paletteMix);
          if (abs(id - hovered) < 0.5) color = mix(color, ink, 0.18);              // floats: compare with a tolerance, not ==
          if (abs(id - selected) < 0.5) color = mix(color, ink, 0.85 * selectedLines); // ink over the data colour, which stays visible between lines
        }

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
