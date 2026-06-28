import { NextRequest } from "next/server";
import {
  validateNetworkConfig,
  validateNetworkStore,
  addNetwork,
  type NetworkConfig,
} from "@/app/network-config-utils";
import { getStore, setStore } from "./_store";
import { createdResponse, successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from "@/lib/route-handler";

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

export const GET = withRouteErrorHandling("GET /api/networks", async () => {
  const store = getStore();
  return successResponse({
    networks: store.networks,
    activeNetworkId: store.activeNetworkId,
  }, { total: store.networks.length });
});

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

  return createdResponse({ network: candidate });
});
