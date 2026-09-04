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

## Commit format

`phase/step: description` — one commit per step, e.g.
`phase1/1.3: studio environment plus warm directional key light`.

## DO NOT TOUCH

- **Do not modify, re-export, or post-process the GLB.** Material tuning happens
  at runtime on the loaded three.js material, never on the file.
- No UI component libraries. No dependencies beyond the stack list above.
- Physics, gestures, and audio stay unwired until their phase.
- No animation beyond the canvas fade-in.
