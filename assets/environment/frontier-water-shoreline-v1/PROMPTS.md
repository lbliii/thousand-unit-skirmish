# Water and shoreline texture prompts

All images were generated with the built-in ImageGen tool. No input images were supplied. The PNGs in this folder are the final selected source outputs; the intermediate drafts remain outside the project asset pack.

## `water.png`

Output: `exec-af6d9e64-7821-4b38-bd60-2e8700196d04.png` (edited from `exec-dade5527-f01b-49f9-adf3-8e85f7714c76.png`).

### Initial generation prompt

```text
Use case: stylized-concept
Asset type: seamless game material source for an original medieval frontier RTS water surface
Primary request: Create one edge-to-edge tileable square texture of shallow freshwater, suitable for repeating beneath a fixed-camera oblique strategy-game map.
Scene/backdrop: Full-bleed water material only; no scene or horizon.
Subject: Quiet stream or pond water in muted slate teal and blue-green, with restrained cloudy depth variation and small painterly current streaks.
Style/medium: Hand-painted, grounded frontier game environment texture, matching weathered earth and moss terrain materials; tactile brushwork, controlled detail, not photorealistic.
Composition/framing: Flat top-down orthographic albedo material; even detail across the whole square; seamless on all four edges; no focal center.
Lighting/mood: Even diffuse material color with no directional lighting.
Color palette: Deep slate teal #304F62 with softened open-water blue-green #4D7982; keep saturation and contrast modest so units, shore tints, and map overlays remain readable.
Materials/textures: Fine broken ripples and subtle submerged mineral variation, broad soft tonal drift, no sharp high-frequency noise.
Text (verbatim): none.
Constraints: Edge-to-edge tile seamless in both axes; flat albedo only; no transparency.
Avoid: shoreline, beach, sand, rocks, plants, boats, animals, reflections of sky, bright specular highlights, foam, strong directional wave bands, vignette, border, labels, text, or a camera perspective.
```

### Palette and modulation edit

```text
Edit this square tileable water material into a neutral albedo-detail map that will be multiplied by the game's existing per-vertex water colors.

Change only its palette and contrast: remove the strong blue-green color cast and lift the overall value to a pale neutral cool grey, approximately RGB 225–245, with very subtle tonal variation. Keep the painterly ripple and mineral detail visible but restrained. This map supplies texture only; the renderer vertex colors supply the final slate-teal water palette.

Preserve the full square framing, material-only composition, top-down flat surface, existing broad ripple character, and edge-to-edge seamless-repeat intent. Do not add a shore, foam, rocks, reflections, or any objects. No vignette, border, text, perspective, or lighting direction.
```

### Final value edit

```text
Edit this water detail texture into a very light neutral modulation map for an RTS material that is multiplied by vertex color.

Raise the entire texture close to white: target a neutral light-grey average around RGB 235, with all details subtle and roughly between 220 and 250. Remove any blue or brown color cast. Keep the existing water ripple shapes and broad painterly flow, but make them faint enough that the renderer's slate-teal vertex colors remain the dominant visible color.

Preserve the square edge-to-edge tile composition and all-over texture. Do not add objects or shoreline. No contrasty highlights, deep dark marks, foam, reflection, vignette, border, text, perspective, or directional lighting.
```

## `shallows.png`

Output: `exec-f93e8ca3-6093-4171-ba05-7719142f3b1f.png` (refined from `exec-1655cc43-d474-4bbd-a4a0-e24f3a04b4c7.png`).

### Initial generation prompt

```text
Use case: stylized-concept
Asset type: seamless game material source for shallow water and shoreline bands in an original medieval frontier RTS
Primary request: Create one edge-to-edge tileable square albedo texture for the narrow shallow-water and wet-bank bands along streams and ponds.
Scene/backdrop: Full-bleed surface material only, viewed straight down; no shoreline silhouette or scene composition.
Subject: Fine wet silt, tiny rounded river-worn grains, and sparse softened mineral flecks that can sit beneath shallow water at a game-map scale.
Style/medium: Hand-painted, weathered frontier environment material, matching the project's muted earth and moss textures; subtle brushwork, no photorealistic shine.
Composition/framing: Flat top-down orthographic square material; evenly distributed detail, no center or directional edge; tile seamlessly on all four sides.
Lighting/mood: Flat diffuse material color, no cast shadows or directional light.
Color palette: Low-contrast neutral grey-green wet silt with subdued warm ochre sediment undertones, centered near midtone so renderer vertex colors can tint it cool or sandy.
Materials/textures: Small rounded pebbly grains and soft muddy swirls, lower detail and value contrast than the meadow ground material.
Text (verbatim): none.
Constraints: Seamless repeat in both axes; opaque albedo only; no perspective, no focal point.
Avoid: open water, visible foam, a drawn waterline, large stones, plants, reeds, shells, shore objects, bright glare, high-contrast pebbles, vignette, border, labels, or text.
```

### Detail refinement

```text
Edit the most recently generated square shoreline-shallows texture only. Keep its flat top-down material framing and create a cleaner tile for a narrow shoreline band at ordinary RTS zoom.

Change: remove nearly all distinct rounded stones and visible large pebbles. Replace them with fine river silt, soft mud swirls, and only rare tiny mineral flecks. Make the broad color variation smoother and lower contrast, so the material reads as wet shallows rather than a gravel beach when reduced to a few pixels.

Preserve: square full-bleed texture, muted grey-green and soft ochre undertones, painterly frontier material character, no lighting, no perspective, no horizon, and the seamless-repeat intent on all four edges.

Avoid: distinct pebbles, large stones, visible foam, drawn shoreline or waterline, plants, shells, objects, glare, harsh contrast, vignette, borders, labels, and text.
```

### Palette and modulation edit

```text
Edit this square shallow-silt material into a neutral albedo-detail map that will be multiplied by the game's existing per-vertex shoreline colors.

Change only its palette and contrast: lift the dark warm-brown base to a pale neutral grey-beige, approximately RGB 220–242, with small low-contrast mottling. Remove the brown cast and any remaining rock-like flecks. Keep fine river silt and soft mud patterns; reduce the remaining speckles until no individual stone reads as a distinct object at small size. The vertex colors provide the final cool wet-bank or warm sand tint.

Preserve the full square framing, flat top-down material-only composition, painterly frontier surface character, and seamless-repeat intent on all four edges. No drawn boundary or waterline.

Avoid: dark gravel, distinct pebbles or stones, foam, plants, shells, objects, bright glare, directional lighting, vignette, border, text, or perspective.
```

### Final value edit

```text
Edit this square shallow-silt texture into a very light neutral modulation map that will be multiplied by existing cool or warm shoreline vertex colors.

Raise the surface close to off-white: target a pale warm-neutral average around RGB 235, with subtle detail mostly between 220 and 250. Remove the brown cast and any remaining rock-like flecks. Keep only soft fine-grain river silt, tiny diffuse mineral specks, and broad gentle mud swirls. The renderer's vertex colors must remain the dominant shoreline color.

Preserve the square tile framing, full-bleed flat material, and seamless-repeat intent. No waterline, foam, objects, perspective, directional lighting, vignette, border, labels, or text.
```
