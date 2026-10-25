# River water and narrower crossings

Rivers use a muted olive sediment color near the banks and a deeper green
channel. Coast water has its own subdued teal palette. Existing depth sampling,
shoreline fading, weather ripples, sunlight and grazing reflections remain in
use. WebGPU and WebGL read the same palette uniforms; changing map or graphics
quality does not restore the old cyan tint. Shore foam is quieter and warmer.

Natural water color varies with sediment and dissolved material. The palette is
an art direction choice informed by [USGS water quality references](https://www.usgs.gov/water-science-school/water-quality),
not a water-quality simulation or a claim that every real river is green.

The existing original Blender bridge is placed at 13.6 units of clear width
(previously 19.2, a 29.2% reduction). Its length and arched height are retained.
The same width controls the model, approach paving, terrain collar, picking,
resource exclusion, land/water boundary and navigation. The Blender source
manifest retains its authored dimensions; the placement scale is explicit in
`src/bridge-layout.js`.

Land routes and crowd-adjusted movement now respect bridge parapets and the
raised approach sides. Ram, cart and catapult clearance grids are reused;
heavy units retain access through both river crossings and the central island.
Foundation escape and construction access cannot clear these barriers. Old
saves with troops on the removed part of the wider deck relocate those troops
onto the remaining road without discarding their orders. Current saves record
the bridge width so bank positions are not repeatedly migrated.

No additional water render pass, scene reflection capture, texture download,
water vertices, bridge triangles or bridge draw batches are introduced. Water
animation remains on the GPU with zero per-frame geometry uploads. Navigation
adds side checks and cached clearance grids; this is not a guarantee of a
particular frame rate on untested hardware.

Validation commands:

```sh
npm test
npm run build
node scripts/river-bridge-visual-qa.mjs
```

The production visual check covers High/Balanced WebGPU and phone-sized Low
WebGL, both bridge maps, and a river detail view. Generated screenshots and
reports stay in `artifacts/river-bridge-after` and are intentionally uncommitted.
Viewport emulation is separate from physical-phone performance testing.
