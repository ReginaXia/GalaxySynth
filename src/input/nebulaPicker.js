// src/input/nebulaPicker.js
import * as THREE from "three";

/**
 * Optimized NebulaPicker
 * - Builds a flat list of pickable Mesh/Points (no deep recursive raycast each frame)
 * - Intersects with recursive=false for speed
 * - Resolves key from object.userData.* up the parent chain
 *
 * Expected cluster shapes (best-effort):
 * - cluster.pickMesh / cluster.pickProxy / cluster.coreMesh (if you have)
 * - cluster.group (we'll find first Mesh/Points under it once)
 */
export function createNebulaPicker({ camera, nebulaSystem }) {
  const raycaster = new THREE.Raycaster();
  // If your nebula uses Points, a small threshold helps picking and performance:
  raycaster.params.Points.threshold = 0.02;

  let hoveredNebulaKey = null;
  let activeNebulaKey = null;

  let _pickables = [];
  let _dirty = true;

  function markDirty() { _dirty = true; }

  function resolveKeyFromObject(obj) {
    let p = obj;
    while (p) {
      const ud = p.userData;
      if (ud) {
        if (ud.galaxyId) return ud.galaxyId;
        if (ud.clusterKey) return ud.clusterKey;
        if (ud.nebulaKey) return ud.nebulaKey;
        if (ud.id) return ud.id; // last-resort
      }
      p = p.parent;
    }
    return null;
  }

  function findFirstPickable(root) {
    if (!root) return null;
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      // Prefer Mesh / Points (raycaster-friendly)
      if (n.isMesh || n.isPoints) return n;
      // Traverse children
      const ch = n.children;
      if (ch && ch.length) {
        for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
      }
    }
    return null;
  }

  function rebuildPickables() {
    _pickables = [];
    const clusters = nebulaSystem.getAllClusters?.() || [];
    for (const c of clusters) {
      const pick =
        c?.pickMesh ||
        c?.pickProxy ||
        c?.coreMesh ||
        c?.core ||
        findFirstPickable(c?.group || c?.root || c?.mesh);

      if (pick) _pickables.push(pick);
    }
    _dirty = false;
  }

  function update({ pointerNDC }) {
    if (_dirty) rebuildPickables();

    hoveredNebulaKey = null;

    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(_pickables, false); // <-- important: no recursion

    if (hits && hits.length) {
      hoveredNebulaKey = resolveKeyFromObject(hits[0].object);
    }
    return { hoveredNebulaKey, activeNebulaKey };
  }

  function trySelectHovered({ pointerDown }) {
    if (!pointerDown) return { activeNebulaKey, hoveredNebulaKey };
    if (hoveredNebulaKey) activeNebulaKey = hoveredNebulaKey;
    return { activeNebulaKey, hoveredNebulaKey };
  }

  function setActive(key) { activeNebulaKey = key || null; }
  function getState() { return { hoveredNebulaKey, activeNebulaKey }; }

  return { update, trySelectHovered, setActive, getState, markDirty };
}
