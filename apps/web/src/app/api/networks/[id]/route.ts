import { NextRequest, NextResponse } from "next/server";
import { findNetworkById, removeNetwork, switchActiveNetwork } from "@/app/network-config-utils";
import { getStore, setStore } from "../_store";

/**
 * DELETE /api/networks/[id]
 * Removes a custom network by ID.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const store = getStore();
  const network = findNetworkById(store, id);

  if (!network) {
    return NextResponse.json({ error: "Network not found." }, { status: 404 });
  }

  if (network.isBuiltIn) {
    return NextResponse.json(
      { error: "Built-in networks cannot be deleted." },
      { status: 403 },
    );
  }

  let next = removeNetwork(store, id);

  if (store.activeNetworkId === id) {
    next = switchActiveNetwork(next, "testnet");
  }

  setStore(next);

  return NextResponse.json({ success: true, deletedId: id });
}
