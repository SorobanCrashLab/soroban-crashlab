import { NextRequest } from "next/server";
import { findNetworkById, removeNetwork, switchActiveNetwork } from "@/app/network-config-utils";
import { getStore, setStore } from "../_store";
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, withRouteErrorHandling } from "@/lib/route-handler";

export const DELETE = withRouteErrorHandling(
  "DELETE /api/networks/[id]",
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const store = getStore();
    const network = findNetworkById(store, id);

    if (!network) {
      return jsonError("Network not found.", 404);
    }

    if (network.isBuiltIn) {
      return jsonError("Built-in networks cannot be deleted.", 403);
    }

    let next = removeNetwork(store, id);

    if (store.activeNetworkId === id) {
      next = switchActiveNetwork(next, "testnet");
    }

    setStore(next);

    return successResponse({ success: true, deletedId: id });
  },
);
