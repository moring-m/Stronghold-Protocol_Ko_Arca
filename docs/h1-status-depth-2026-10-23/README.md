# Official status depth check

The screenshot uses the real battle renderer with two overlapping shield enemies and the official `buff_autochess_frozen` prefab on both. Each enemy's body and attached status render together, so the front enemy covers the rear enemy's ice.

Original sorting layer, sorting order and material render queue still order renderers within each pass. Ground-classified renderers stay under units; explicit Overlay queues (4000+) retain the global overlay pass. Unit-attached transparent effects use the owning unit's display container. Unbound world effects continue to use the shared world pass; this change does not claim a full 3D depth buffer for Spine models.

Automated coverage verifies independent unit passes, original intra-effect order, ground/Overlay exceptions and removal of stale unit containers.
