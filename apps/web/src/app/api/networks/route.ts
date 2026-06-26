import { NextRequest, NextResponse } from "next/server";
import {
  validateNetworkConfig,
  validateNetworkStore,
  addNetwork,
  type NetworkConfig,
} from "@/app/network-config-utils";
import { getStore, setStore } from "./_store";
import { jsonError, readJsonBody, withRouteErrorHandling } from "@/lib/route-handler";

// Private slugify helper - server always generates id from name
function slugify(name: string, existingNetworks: NetworkConfig[]): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const builtInIds = ["mainnet", "testnet", "futurenet"];
  const existingIds = new Set(existingNetworks.map((n) => n.id));

  let candidate = builtInIds.includes(base) ? `custom-${base}` : base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

/**
 * GET /api/networks
 * Returns the list of all configured networks.
 */
export const GET = withRouteErrorHandling("GET /api/networks", async () => {
  const store = getStore();
  return NextResponse.json({
    networks: store.networks,
    activeNetworkId: store.activeNetworkId,
    total: store.networks.length,
  });
});

/**
 * POST /api/networks
 * Adds a new custom network. Body: { name, networkPassphrase, horizonUrl, rpcUrl, friendbotUrl? }
 */
export const POST = withRouteErrorHandling("POST /api/networks", async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.body;

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    typeof (body as Record<string, unknown>).networkPassphrase !== "string" ||
    typeof (body as Record<string, unknown>).horizonUrl !== "string" ||
    typeof (body as Record<string, unknown>).rpcUrl !== "string"
  ) {
    return jsonError("Missing required fields: name, networkPassphrase, horizonUrl, rpcUrl.", 400);
  }

  const raw = body as Record<string, unknown>;
  const store = getStore();

  const id = slugify(raw.name as string, store.networks);

  const candidate: NetworkConfig = {
    id,
    name: raw.name as string,
    networkPassphrase: raw.networkPassphrase as string,
    horizonUrl: raw.horizonUrl as string,
    rpcUrl: raw.rpcUrl as string,
    isBuiltIn: false,
    addedAt: new Date().toISOString(),
  };

  if (typeof raw.friendbotUrl === "string" && raw.friendbotUrl !== "") {
    candidate.friendbotUrl = raw.friendbotUrl;
  }

  const configError = validateNetworkConfig(candidate);
  if (configError) {
    return jsonError(configError, 422);
  }

  const storeError = validateNetworkStore(store, candidate);
  if (storeError) {
    return jsonError(storeError, 409);
  }

  setStore(addNetwork(store, candidate));

  return NextResponse.json({ network: candidate }, { status: 201 });
});
