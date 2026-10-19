import { Color, DataTexture, ShaderMaterial, Vector3 } from 'three';

// The Earth's surface, coloured from the ID map (id-map.ts): 0 = ocean, anything else = land.
// Lesson 06: the hovered and the selected country are lit up. Lesson 09 adds a colour per country.
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
      ocean: { value: new Color('#0f1520') },
      land: { value: new Color('#263044') },
      // Country numbers from the ID map (1…240); 0 = none. Changing one is a uniform update, nothing is rebuilt.
      hovered: { value: 0 },
      selected: { value: 0 },
      hoverColor: { value: new Color('#3a4868') },
      selectColor: { value: new Color('#ff7a45') },
      // In view space, so the light comes from the same place on screen however the globe turns (upper left, in front)
      lightDirection: { value: new Vector3(-2, 2, 3).normalize() }
    },
    vertexShader: `
      varying vec3 vPosition; // on the unit sphere, in the globe's own coordinates
      varying vec3 vNormal;   // in view space, for lighting
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D idMap;
      uniform vec3 ocean;
      uniform vec3 land;
      uniform float hovered;
      uniform float selected;
      uniform vec3 hoverColor;
      uniform vec3 selectColor;
      uniform vec3 lightDirection;
      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        vec3 p = normalize(vPosition);
        float lon = atan(p.x, p.z);              // -π … π, 0 at Greenwich
        float lat = asin(clamp(p.y, -1.0, 1.0)); // -π/2 … π/2
        vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927); // ÷ 2π, ÷ π. Row 0 of the ID map is the north edge

        float id = floor(texture2D(idMap, uv).r * 255.0 + 0.5); // the byte back as a whole number
        vec3 base = id > 0.5 ? land : ocean;
        if (id > 0.5 && abs(id - hovered) < 0.5) base = hoverColor;   // floats: compare with a tolerance, not ==
        if (id > 0.5 && abs(id - selected) < 0.5) base = selectColor;

        float light = 0.6 + 0.4 * max(dot(normalize(vNormal), lightDirection), 0.0);
        gl_FragColor = vec4(base * light, 1.0);
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
