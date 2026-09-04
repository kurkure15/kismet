@AGENTS.md

# kismet

A fortune cookie web toy. The page shows one realistic 3D fortune cookie.
Later phases add crack-on-drag with physics shards, a fortune paper slip, and
tap-to-eat crumbling with sound.

## Stack

- **next** — App Router, TypeScript, `src/` directory
- **three** — WebGL renderer
- **@react-three/fiber** — React renderer for three
- **@react-three/drei** — helpers (`useGLTF`, `Environment`, `ContactShadows`, `OrbitControls`)
- **@react-three/rapier** — physics *(installed, unused until a later phase)*
- **motion** — animation *(installed, unused until a later phase)*
- **@use-gesture/react** — pointer gestures *(installed, unused until a later phase)*
- **howler** + **@types/howler** — audio *(installed, unused until a later phase)*

`@types/three` is also present: `three@0.185` ships no type definitions of its
own, so it is required for the build rather than an extra dependency.

## Asset

`public/models/cookie-fractured.glb` — Y-up, textures embedded. 15 named nodes:

- `Cookie_Intact` — the whole cookie (single primitive, material `Scene_-_Root`)
- `Cookie_Shard_01` … `Cookie_Shard_14` — pre-fractured pieces, positioned so
  they reassemble into the intact cookie. Each shard has two primitives: the
  outer surface (`Scene_-_Root`) and a fracture face (`Cookie_Interior`), so
  three.js loads each shard as a `Group` of two meshes.

### Material notes (verified against the render in phase 1.4)

The cookie renders correctly — warm golden, base colour and normal map both
applied. It is **not** gray or broken, so the GLB needs no repair.

Its material `Scene_-_Root` carries four textures, and one of them is junk.
Measured directly from the embedded PNGs:

| glTF slot | Image | Verdict |
| --- | --- | --- |
| baseColor | `Image_0` | Good — golden wafer, mean `[235,169,104]` |
| normal | `Image_2` | Good — proper tangent-space map |
| occlusion **and** metallicRoughness | `Image_3-Image_1` | **Not an ORM map.** Looks like a curvature bake |
| specularColour | `Image_1` | Harmless, factor is 0.029 |

In that third texture the green (roughness) channel is effectively constant at
0.51–0.55, so it carries no detail, and the red (occlusion) channel averages
0.29 with large black regions, which crushes ambient light where it applies.
`Scene.tsx` therefore clones the loaded material, drops the roughness map,
drives roughness directly, and keeps the false occlusion at low intensity.

Two more things worth knowing:

- `KHR_materials_ior` is exported as `ior: 1000`, which looks absurd but is
  actually correct in combination with the 0.029 specular colour — together
  they land on a normal dielectric F0 of about 0.029. **Do not "fix" the ior**
  on its own; it would darken the specular to near nothing.
- `material.envMapIntensity` does **not** scale light coming from
  `scene.environment` in three r185. Scale the environment on the
  `<Environment environmentIntensity>` prop instead.

## Known warnings

Console noise that is expected and not worth chasing. Append to this list, do
not rewrite it.

- `THREE.Clock: This module has been deprecated. Please use THREE.Timer
  instead.` — emitted by `@react-three/fiber`'s own dist (`new THREE.Clock()`),
  not by our code. Goes away when R3F migrates or `three` is pinned below r185.
- `using deprecated parameters for the initialization function; pass a single
  object instead` — from `@react-three/rapier` calling Rapier's `init()`. Fires
  once, when physics is warmed up on first pointer-down.
- Four `404` entries for `/sounds/crack-0*.mp3`, plus one `kismet: no crack
  sounds found` warning, on the first interaction. Expected until the audio
  files are added; the crack is designed to proceed silently without them.

## Commit format

`phase/step: description` — one commit per step, e.g.
`phase1/1.3: studio environment plus warm directional key light`.

## DO NOT TOUCH

- **Do not modify, re-export, or post-process the GLB.** Material tuning happens
  at runtime on the loaded three.js material, never on the file.
- No UI component libraries. No dependencies beyond the stack list above.
- Physics, gestures, and audio stay unwired until their phase.
- No animation beyond the canvas fade-in.
