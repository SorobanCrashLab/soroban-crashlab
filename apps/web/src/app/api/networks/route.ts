import { NextRequest, NextResponse } from "next/server";
import {
  validateNetworkConfig,
  validateNetworkStore,
  addNetwork,
  type NetworkConfig,
} from "@/app/network-config-utils";
import { getStore, setStore } from "./_store";

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
export async function GET() {
  const store = getStore();
  return NextResponse.json({
    networks: store.networks,
    activeNetworkId: store.activeNetworkId,
    total: store.networks.length,
  });
}

/**
 * POST /api/networks
 * Adds a new custom network. Body: { name, networkPassphrase, horizonUrl, rpcUrl, friendbotUrl? }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    typeof (body as Record<string, unknown>).networkPassphrase !== "string" ||
    typeof (body as Record<string, unknown>).horizonUrl !== "string" ||
    typeof (body as Record<string, unknown>).rpcUrl !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing required fields: name, networkPassphrase, horizonUrl, rpcUrl." },
      { status: 400 },
    );
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
    return NextResponse.json({ error: configError }, { status: 422 });
  }

  const storeError = validateNetworkStore(store, candidate);
  if (storeError) {
    return NextResponse.json({ error: storeError }, { status: 409 });
  }

  setStore(addNetwork(store, candidate));

  return NextResponse.json({ network: candidate }, { status: 201 });
}
