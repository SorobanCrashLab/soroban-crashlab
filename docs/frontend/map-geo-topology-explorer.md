# Map and topology explorer

`/analytics/topology` (#2303) shows where failures, latency and queue pressure concentrate, geographically and by service dependency.

## Views

- **Geo map** (`features/geo-topology/map/GeoMapView.tsx`): an offline-safe equirectangular SVG (no tile server). Nodes are grid-clustered by zoom (`lib/topology/clustering.ts`); marker size is the selected data layer and the ring colour is the worst health in the cluster. Nodes with no usable coordinates are listed in the table/topology view instead.
- **Topology** (`topology/TopologyGraphView.tsx`): a deterministic layered graph (`lib/topology/layout.ts`: callers left, dependencies right, ordered by id), so the same data always draws the same picture. Selecting a node highlights downstream failure propagation along edges with a failure rate of 5% or more.
- **Table view** is a keyboard-accessible alternative to both.

## Layers, filters, time

Layers: run volume, crash rate, latency, budget exhaustion, queue depth. Filter by type, health and region. `TimelinePlayback` scrubs or plays through the frames returned by `/api/topology`.

## Share and export

State (layer, view, filters, frame, selected node) is in the URL query. Export **topology JSON** or **GeoJSON** (`[lon, lat]` order) for the filtered frame.

## Privacy

Infrastructure locations are sensitive. `/api/topology` returns **strict** data by default: coordinates rounded to whole degrees and node labels masked. Full detail requires the `x-crashlab-role: maintainer` header and `privacy=standard`. The role header is a stand-in until real authentication is wired up; do not rely on it for production access control.

## Data

`/api/topology` currently generates deterministic sample frames (including an emerging incident). Replace `buildFrames` with the telemetry service; the rest consumes `normalizeFrame` output.

Tests: `npm run test:features` (from `apps/web`). Clustering 12,000 nodes runs well under 500 ms.
