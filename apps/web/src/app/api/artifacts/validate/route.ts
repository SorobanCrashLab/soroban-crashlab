import { withSizeLimitAndLogging } from '@/lib/route-handler';
import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response-utils";
import { validateCaseBundle } from "./case-bundle-validation";

/**
 * POST /api/artifacts/validate
 *
 * Accepts a JSON body containing a CaseBundle and returns a detailed validation report.
 *
 * Request body: { "bundle": <CaseBundle> }
 * Response: 200 OK with ValidationResult JSON
 *           400 Bad Request if body is not valid JSON or missing bundle field
 *           413 Payload Too Large if body exceeds 1 MiB
 */
async function postHandler(request: NextRequest): Promise<NextResponse> {
  // Size guard: reject bodies > 1 MiB to prevent memory exhaustion
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > 1024 * 1024) {
      return successResponse(
        {
          valid: false,
          errors: ["Request body exceeds 1 MiB limit."],
          warnings: [],
        },
        { status: 413 }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return successResponse(
      {
        valid: false,
        errors: ["Invalid JSON in request body."],
        warnings: [],
      },
      { status: 400 }
    );
  }

  // Expect { bundle: <CaseBundle> }
  if (!body || typeof body !== "object" || !("bundle" in body)) {
    return successResponse(
      {
        valid: false,
        errors: ['Missing "bundle" field in request body.'],
        warnings: [],
      },
      { status: 400 }
    );
  }

  const bundle = (body as Record<string, unknown>).bundle;
  const result = validateCaseBundle(bundle);

  const status = result.valid ? 200 : 422;
  return successResponse(result, { status });
}
export const POST = withSizeLimitAndLogging('POST /api/artifacts/validate', postHandler);
