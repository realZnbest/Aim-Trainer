/**
 * Center-screen raycast helper.
 *
 * Production path uses three.js Raycaster against instanced target meshes.
 * When target count > 50 the scene enables `three-mesh-bvh` acceleration
 * (see ui/GameCanvas — `acceleratedRaycast`). The analytic angular test in
 * `simulation.fire()` is the AUTHORITATIVE hit test (deterministic, independent
 * of render state); this module mirrors it for mesh picking / hover feedback.
 *
 * @module engine/raycast
 */
import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0);

/** Raycast from screen center against the given objects. Returns intersections. */
export function raycastCenter(
  camera: THREE.Camera,
  objects: THREE.Object3D[],
  recursive = true,
): THREE.Intersection[] {
  _raycaster.setFromCamera(_center, camera);
  return _raycaster.intersectObjects(objects, recursive);
}

/** Angular error (deg) between camera forward and a world point. */
export function angularErrorDeg(camera: THREE.Camera, worldPoint: THREE.Vector3): number {
  const dir = worldPoint.clone().sub(camera.position).normalize();
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  return (Math.acos(THREE.MathUtils.clamp(fwd.dot(dir), -1, 1)) * 180) / Math.PI;
}
