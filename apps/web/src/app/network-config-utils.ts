// Network types
export type NetworkLoadState = "loading" | "error" | "success";

export interface NetworkConfig {
  id: string;
  name: string;
  networkPassphrase: string;
  horizonUrl: string;
  rpcUrl: string;
  friendbotUrl?: string;
  isBuiltIn: boolean;
  addedAt: string;
}

export interface NetworkStore {
  networks: NetworkConfig[];
  activeNetworkId: string;
  lastUpdated: string;
}

export interface NetworkLoadResult {
  status: NetworkLoadState;
  snapshot: NetworkStore | null;
  error: string | null;
}

export const BUILT_IN_NETWORK_IDS = ["mainnet", "testnet", "futurenet"] as const;

const BUILT_IN_NETWORKS: NetworkConfig[] = [
  {
    id: "mainnet",
    name: "Stellar Mainnet",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: "https://mainnet.stellar.validationcloud.io/v1/xycxyc",
    isBuiltIn: true,
    addedAt: "2015-10-13T00:00:00.000Z",
  },
  {
    id: "testnet",
    name: "Stellar Testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    isBuiltIn: true,
    addedAt: "2015-10-13T00:00:00.000Z",
  },
  {
    id: "futurenet",
    name: "Stellar Futurenet",
    networkPassphrase: "Test SDF Future Network ; October 2022",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
    isBuiltIn: true,
    addedAt: "2022-10-01T00:00:00.000Z",
  },
];

export function createDefaultNetworkStore(referenceTime = new Date()): NetworkStore {
  return {
    networks: BUILT_IN_NETWORKS.map((n) => ({ ...n })),
    activeNetworkId: "testnet",
    lastUpdated: referenceTime.toISOString(),
  };
}

export function serializeNetworkStore(store: NetworkStore): string {
  return JSON.stringify(store, null, 2);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isIsoDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

function parseNetworkConfig(raw: unknown): NetworkConfig | null {
  if (!isObject(raw)) return null;

  const { id, name, networkPassphrase, horizonUrl, rpcUrl, friendbotUrl, isBuiltIn, addedAt } = raw;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof networkPassphrase !== "string" ||
    typeof horizonUrl !== "string" ||
    typeof rpcUrl !== "string" ||
    typeof isBuiltIn !== "boolean" ||
    !isIsoDateString(addedAt)
  ) {
    return null;
  }

  if (friendbotUrl !== undefined && typeof friendbotUrl !== "string") {
    return null;
  }

  const config: NetworkConfig = {
    id,
    name,
    networkPassphrase,
    horizonUrl,
    rpcUrl,
    isBuiltIn,
    addedAt,
  };

  if (typeof friendbotUrl === "string") {
    config.friendbotUrl = friendbotUrl;
  }

  return config;
}

export function readNetworkStore(
  serialized: string | null,
  referenceTime = new Date(),
): NetworkLoadResult {
  if (serialized === null) {
    return {
      status: "success",
      snapshot: createDefaultNetworkStore(referenceTime),
      error: null,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      status: "error",
      snapshot: null,
      error: "Stored network configuration is not valid JSON.",
    };
  }

  if (!isObject(parsed)) {
    return {
      status: "error",
      snapshot: null,
      error: "Stored network configuration is missing required data.",
    };
  }

  const { networks, activeNetworkId, lastUpdated } = parsed;

  if (!Array.isArray(networks) || typeof activeNetworkId !== "string" || !isIsoDateString(lastUpdated)) {
    return {
      status: "error",
      snapshot: null,
      error: "Stored network configuration is incomplete or outdated.",
    };
  }

  const parsedNetworks = networks.map(parseNetworkConfig);
  if (parsedNetworks.some((n) => n === null)) {
    return {
      status: "error",
      snapshot: null,
      error: "Stored network configuration is incomplete or outdated.",
    };
  }

  // Re-merge built-ins: replace any built-in in the store with canonical values
  const customNetworks = (parsedNetworks as NetworkConfig[]).filter((n) => !n.isBuiltIn);
  const mergedNetworks: NetworkConfig[] = [
    ...BUILT_IN_NETWORKS.map((n) => ({ ...n })),
    ...customNetworks,
  ];

  return {
    status: "success",
    snapshot: {
      networks: mergedNetworks,
      activeNetworkId,
      lastUpdated,
    },
    error: null,
  };
}

export function validateNetworkUrl(raw: string, fieldName: string): string | null {
  if (!raw.trim()) {
    return `${fieldName} is required.`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${fieldName} is not a valid URL.`;
  }

  if (url.protocol === "https:") {
    return null;
  }

  if (url.protocol === "http:") {
    const hostname = url.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return null;
    }
    return `${fieldName} must use HTTPS (HTTP is only allowed for localhost).`;
  }

  return `${fieldName} must use HTTPS.`;
}

export function validateNetworkConfig(config: NetworkConfig): string | null {
  if (!config.name.trim()) {
    return "Name is required.";
  }

  if (config.name.length > 64) {
    return "Name must be 64 characters or fewer.";
  }

  if (config.name !== config.name.trim()) {
    return "Name must not have leading or trailing whitespace.";
  }

  if (!config.networkPassphrase.trim()) {
    return "Network passphrase is required.";
  }

  const horizonError = validateNetworkUrl(config.horizonUrl, "Horizon URL");
  if (horizonError) return horizonError;

  const rpcError = validateNetworkUrl(config.rpcUrl, "RPC URL");
  if (rpcError) return rpcError;

  if (config.friendbotUrl !== undefined && config.friendbotUrl !== "") {
    const friendbotError = validateNetworkUrl(config.friendbotUrl, "Friendbot URL");
    if (friendbotError) return friendbotError;
  }

  return null;
}

export function validateNetworkStore(store: NetworkStore, incoming: NetworkConfig): string | null {
  const incomingName = incoming.name.trim().toLowerCase();
  const incomingHorizonUrl = incoming.horizonUrl;

  for (const network of store.networks) {
    if (network.id === incoming.id) {
      continue;
    }

    if (network.name.trim().toLowerCase() === incomingName) {
      return `A network named "${network.name}" already exists.`;
    }

    if (network.horizonUrl === incomingHorizonUrl) {
      return `A network with Horizon URL "${network.horizonUrl}" already exists.`;
    }
  }

  return null;
}

export function addNetwork(store: NetworkStore, config: NetworkConfig): NetworkStore {
  return {
    ...store,
    networks: [...store.networks, { ...config }],
    lastUpdated: new Date().toISOString(),
  };
}

export function removeNetwork(store: NetworkStore, id: string): NetworkStore {
  return {
    ...store,
    networks: store.networks.filter((n) => n.id !== id),
    lastUpdated: new Date().toISOString(),
  };
}

export function switchActiveNetwork(store: NetworkStore, id: string): NetworkStore {
  return {
    ...store,
    activeNetworkId: id,
    lastUpdated: new Date().toISOString(),
  };
}

export function findNetworkById(store: NetworkStore, id: string): NetworkConfig | undefined {
  return store.networks.find((n) => n.id === id);
}
