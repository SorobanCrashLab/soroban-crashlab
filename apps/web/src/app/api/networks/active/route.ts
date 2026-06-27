import { NextRequest } from "next/server";
import { findNetworkById, switchActiveNetwork } from "@/app/network-config-utils";
import { getStore, setStore } from "../_store";
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, readJsonBody, withRouteErrorHandling } from "@/lib/route-handler";

export const GET = withRouteErrorHandling("GET /api/networks/active", async () => {
  const store = getStore();
  const network = findNetworkById(store, store.activeNetworkId);

  return successResponse({ network, activeNetworkId: store.activeNetworkId });
});

export const PUT = withRouteErrorHandling("PUT /api/networks/active", async (request: NextRequest) => {
  const parsedBody = await readJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.body;

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).id !== "string"
  ) {
    return jsonError("Missing required field: id.", 400);
  }

  const { id } = body as { id: string };
  const store = getStore();
  const network = findNetworkById(store, id);

  if (!network) {
    return jsonError("Network not found.", 404);
  }

  const next = switchActiveNetwork(store, id);
  setStore(next);

  return successResponse({ activeNetworkId: next.activeNetworkId, network });
});
