# v0.2.5 native map hybrid preview

The renderer keeps the fork's existing materials, lightmaps, lights, boss surroundings, preview floor and 37-column cooperative geometry. It does not enable upstream's simplified scene shader or replace the custom layout with the upstream 21-column scene.

Native map extraction now writes a gzip binary companion containing JSON metadata and typed geometry arrays. Float64 coordinates retain the exact values used by CPU clipping and copied-border selection; GPU attributes remain Float32. The loader prefers a manifest's `binaryPath`, with the existing gzip JSON as fallback. The generator can also convert already extracted maps:

```sh
python tools/local-extract/pack_native_maps.py <local-assets.json>
```

Field clipping keeps the existing rules. Compact vertex/index buffers avoid boxed temporary vertex lists. Static native geometry with identical materials, transforms and shadow state is batched after custom field/border modifications. Water, transparent overlays and runtime devices remain independent. Lightmap materials are reused per material/page. Layout caching and disposal still use the existing lifecycle.

100 targeted map, scene, layout and binary regression tests pass. Binary round trips were compared against every installed native scene and retain the complete original metadata and all geometry values. Screenshot checks cover city and sand normal, cooperative and boss views, plus the 8-player cooperative layout; fixed render time and camera are used. City screenshots are identical, sand differences exceed 8/255 in at most 0.012% of pixels. See `pixel-comparison.json` and the screenshots. These are map-only visual checks, not an end-to-end multiplayer test or FPS benchmark.

Normal/cooperative/boss draw calls changed from 14/37/29 to 12/13/12 for city and 23/68/52 to 18/20/17 for sand. Merged bounding volumes can submit more offscreen triangles; fewer draw calls alone do not prove higher FPS. Binary loading reduces numeric JSON parsing and boxed-array allocation; download size is not guaranteed to decrease.

Changes apply to the isolated local v0.2.5 preview only. No operating-server deployment or commit/push was performed.
