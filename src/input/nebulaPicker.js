// src/input/nebulaPicker.js
import * as THREE from "three";

/**
 * NebulaPicker
 * 负责：
 * - raycast 找到 hovered cluster
 * - 处理 click 选中 activeNebulaKey
 *
 * 依赖：
 * - camera
 * - nebulaSystem（必须提供 getAllClusters() 与 getCluster(key)）
 *
 * 输出：
 * - hoveredNebulaKey
 * - activeNebulaKey
 */
export function createNebulaPicker({ camera, nebulaSystem }) {
  const raycaster = new THREE.Raycaster();

  let hoveredNebulaKey = null;
  let activeNebulaKey = null;

  // 缓存可被拾取的对象列表（每帧可重建也行，这里做轻缓存）
  let _pickables = [];
  let _pickablesDirty = true;

  function markDirty() {
    _pickablesDirty = true;
  }

  function rebuildPickables() {
    _pickables = [];
    const clusters = nebulaSystem.getAllClusters?.() || [];
    for (const c of clusters) {
      // 你的 cluster 通常是 c.group / c.root / c.mesh 之一
      // 我们优先拿 group，Raycaster 会递归 children
      if (c?.group) _pickables.push(c.group);
      else if (c?.root) _pickables.push(c.root);
      else if (c?.mesh) _pickables.push(c.mesh);
    }
    _pickablesDirty = false;
  }

  // 从 raycast 的 object 反查 cluster key
  function resolveKeyFromObject(obj) {
    // 常见做法：你可能把 key 放在 obj.userData.galaxyId / clusterKey 等
    let p = obj;
    while (p) {
      const ud = p.userData;
      if (ud) {
        if (ud.galaxyId) return ud.galaxyId;
        if (ud.clusterKey) return ud.clusterKey;
        if (ud.nebulaKey) return ud.nebulaKey;
      }
      p = p.parent;
    }
    return null;
  }

  function update({ pointerNDC }) {
    if (_pickablesDirty) rebuildPickables();

    hoveredNebulaKey = null;

    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(_pickables, true);

    if (hits && hits.length > 0) {
      const key = resolveKeyFromObject(hits[0].object);
      hoveredNebulaKey = key;
    }

    return { hoveredNebulaKey, activeNebulaKey };
  }

  function trySelectHovered({ pointerDown }) {
    // 只在按下那一刻调用（你 main.js 里通常会有 “justPressed”）
    if (!pointerDown) return { activeNebulaKey, hoveredNebulaKey };

    if (hoveredNebulaKey) {
      activeNebulaKey = hoveredNebulaKey;
    }
    return { activeNebulaKey, hoveredNebulaKey };
  }

  function setActive(key) {
    activeNebulaKey = key || null;
  }

  function getState() {
    return { hoveredNebulaKey, activeNebulaKey };
  }

  return {
    update,
    trySelectHovered,
    setActive,
    getState,
    markDirty,
  };
}