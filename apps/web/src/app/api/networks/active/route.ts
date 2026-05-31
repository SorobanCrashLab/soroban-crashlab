import { NextRequest, NextResponse } from "next/server";
import { findNetworkById, switchActiveNetwork } from "@/app/network-config-utils";
import { getStore, setStore } from "../_store";

/**
 * GET /api/networks/active
 * Returns the currently active network configuration.
 */
export async function GET() {
  const store = getStore();
  const network = findNetworkById(store, store.activeNetworkId);

  return NextResponse.json({ network, activeNetworkId: store.activeNetworkId });
}

/**
 * PUT /api/networks/active
 * Switches the active network. Body: { id: string }
 */
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).id !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing required field: id." },
      { status: 400 },
    );
  }

  const { id } = body as { id: string };
  const store = getStore();
  const network = findNetworkById(store, id);

  if (!network) {
    return NextResponse.json({ error: "Network not found." }, { status: 404 });
  }

  const next = switchActiveNetwork(store, id);
  setStore(next);

  return NextResponse.json({ activeNetworkId: next.activeNetworkId, network });
}
