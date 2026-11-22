import {
  createDefaultNetworkStore,
  type NetworkStore,
} from "@/app/network-config-utils";

let _store: NetworkStore | null = null;

export function getStore(): NetworkStore {
  if (!_store) _store = createDefaultNetworkStore();
  return _store;
}

export function setStore(next: NetworkStore): NetworkStore {
  _store = next;
  return _store;
}
