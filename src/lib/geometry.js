/**
 * Shared road-path geometry helpers
 * =================================
 *
 * Pure geometry utilities consumed by:
 *   - src/detection/lib/detection-sim.js   (drone movement, accident location)
 *   - src/partitioning/lib/risk-scoring.js (per-section curvature scoring)
 *   - src/detection/components/LiveMap.jsx (rendering paths)
 *
 * Extracted to its own module so the partitioning layer can compute path
 * geometry without importing from the detection layer (which would create
 * a circular dep once detection-sim imports the section-time-slot accident
 * generator).
 *
 * All distances are local meters using an equirectangular projection
 * anchored at each road's first polyline vertex. For corridor lengths up
 * to a few tens of km and latitudes around 33°N, the east-west distortion
 * is well below 1 % — far below the sub-200 m accuracy needed by the
 * detection model.
 */

/** Convert lat/lon to local meters (x, y) relative to a reference point. */
export function projectToMeters(lat, lon, refLat, refLon) {
  const cosRef = Math.cos((refLat * Math.PI) / 180)
  const dx = (lon - refLon) * 111000 * cosRef
  const dy = (lat - refLat) * 111000
  return [dx, dy]
}

/** Convert local meters back to lat/lon. */
export function unprojectMeters(x, y, refLat, refLon) {
  const cosRef = Math.cos((refLat * Math.PI) / 180)
  const lat = refLat + y / 111000
  const lon = refLon + x / (111000 * cosRef)
  return [lat, lon]
}

/**
 * Build a parametric path over a road polyline.
 *
 * CHAINAGE vs POLYLINE. These are two different lengths and the difference
 * is not rounding error:
 *
 *   - `road.lengthKm` is the corridor's MEASURED centreline length, the same
 *     chainage the crash panel, region boundaries and risk table are built on.
 *     For the M51 that is 28.6002 km.
 *   - The display polyline is a 13-vertex simplification. Its arc length is
 *     27.87 km, because straight chords cut the corners the real road follows.
 *
 * Everything upstream — sections, patrol segments, accident positions, drone
 * positions — speaks chainage. So `totalLength` reports the CHAINAGE length
 * and `positionAt()` maps chainage onto the polyline by fraction. Callers pass
 * corridor metres throughout and never have to know the drawing is shorter.
 *
 * Returns:
 *   - segments:        per-segment metadata (arc lengths in POLYLINE meters)
 *   - totalLength:     corridor length in meters (chainage) — what callers use
 *   - polylineLength:  arc length of the drawn polyline, in meters
 *   - scale:           polylineLength / totalLength
 *   - refLat / refLon: projection anchor (first polyline vertex)
 */
export function buildRoadPath(road) {
  const refLat = road.polyline[0][0]
  const refLon = road.polyline[0][1]
  const projected = road.polyline.map(([la, lo]) =>
    projectToMeters(la, lo, refLat, refLon)
  )

  const segments = []
  let acc = 0
  for (let i = 1; i < projected.length; i++) {
    const [x1, y1] = projected[i - 1]
    const [x2, y2] = projected[i]
    const len = Math.hypot(x2 - x1, y2 - y1)
    segments.push({
      start: acc,
      end: acc + len,
      length: len,
      p1: projected[i - 1],
      p2: projected[i],
    })
    acc += len
  }

  // Fall back to the polyline's own length for roads that declare no measured
  // length; scale is then 1 and this behaves exactly as it did before.
  const totalLength = road.lengthKm > 0 ? road.lengthKm * 1000 : acc

  return {
    segments,
    totalLength,
    polylineLength: acc,
    scale: acc / totalLength,
    refLat,
    refLon,
  }
}

/**
 * Position (in local meters) at chainage `s` — metres along the corridor,
 * measured on `road.lengthKm`, not on the drawn polyline.
 *
 * Without the scale step, chainage past the polyline's shorter arc length
 * would clamp to the final vertex: on the M51 every accident in the last
 * 734 m would be drawn stacked on the Awali bridge.
 */
export function positionAt(path, s) {
  if (s <= 0) return path.segments[0].p1
  if (s >= path.totalLength) return path.segments[path.segments.length - 1].p2
  const sPoly = s * path.scale
  for (const seg of path.segments) {
    if (sPoly <= seg.end) {
      const t = (sPoly - seg.start) / seg.length
      return [
        seg.p1[0] + t * (seg.p2[0] - seg.p1[0]),
        seg.p1[1] + t * (seg.p2[1] - seg.p1[1]),
      ]
    }
  }
  return path.segments[path.segments.length - 1].p2
}
