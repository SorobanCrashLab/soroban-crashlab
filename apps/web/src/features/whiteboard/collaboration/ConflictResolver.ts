import { WhiteboardNode } from '../canvas/CanvasEngine';

/**
 * Last-writer-wins deterministic conflict resolver based on updatedAt timestamp and node ID.
 */
export function resolveNodeConflict(local: WhiteboardNode, remote: WhiteboardNode): WhiteboardNode {
  if (remote.updatedAt > local.updatedAt) return remote;
  if (local.updatedAt > remote.updatedAt) return local;
  return local.id.localeCompare(remote.id) >= 0 ? local : remote;
}
