# Camera-based scene residency

The developed AI-defense replay contains 2,329 simulation entities. The previous renderer eagerly created nearly 600 living building, unit and resource nodes across its revealed map during scene attachment. High-quality production-browser checks timed out during attachment or the first painted frame on the development machine. Those observations identify an expensive workload; they do not establish every device's performance.

Scene attachment now prepares the camera at the player's capital or starting location before creating nearby models. A generous viewport margin includes building silhouettes and nearby shadow casters. The ordinary render loop creates the same authored models as the camera approaches another area. Trees retain their existing instanced forest system.

Distant unselected model nodes are released after eight render-clock seconds once they are outside a wider retention margin. Unit allocation slots return to their existing batch allocator; building-instance geometry is released through the established disposal path. Shared model catalogues and selected-entity state remain available. A later visit recreates the full model at the current graphics preset.

This changes visual residency only. Distant armies, workers, economy, projectiles, AI decisions, exploration and multiplayer state continue in the simulation. Offscreen interpolated positions are cleared so subsequent snapshots, touch picking and effects use current coordinates rather than an old visual position.

`tests/scene-nodes.test.js` covers a fully revealed large entity set, camera jumps, retained High detail, delayed release, allocation reuse, fog/transport visibility, selected units and stale-position cleanup. Render-batch, motion, lifecycle and quality tests cover the interacting systems. Actual browser checks use the complete saved battlefield and the production renderer.

The complete replay rendered in Chrome native WebGPU at High (1366 by 768) and Performance (568 by 320, emulated touch). Scene attachment created 445 nodes and took approximately 2.46 seconds at High and 0.75 seconds at Performance in that run. Both views produced painted battlefield captures, finite connected-wall instances and a successful allied gate crossing, with no reported graphics errors. High's screenshot phase took about 27.8 seconds including queue waits, resizing and capture; this is not a sustained FPS measurement or proof that startup is sufficiently fast on all devices. The browser evidence remains a development-machine observation.

All 512 local regression tests and the final production build pass. The final bundle's emulated 568-by-320 WebGL compatibility check also painted the complete scene and passed the gate traversal, instance bounds and layout checks; its scene attachment took approximately 0.55 seconds in that observation.

This work reduces unnecessary scene construction and retained instance geometry. Sustained frame rates, physical-phone thermals, full population limits and the broader game-quality requirements still require the evidence described in [QUALITY_TARGETS.md](QUALITY_TARGETS.md).
