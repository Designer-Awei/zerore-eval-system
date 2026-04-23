import { NextResponse } from "next/server";
import { listWorkbenchBaselines } from "@/workbench/baseline-file-store";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

/**
 * List baseline snapshots for one customer id.
 * @param _request Request.
 * @param context Route params.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { customerId } = await context.params;
    const baselines = await listWorkbenchBaselines(decodeURIComponent(customerId));
    return NextResponse.json({ customerId: decodeURIComponent(customerId), baselines });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "列出基线失败。", detail: message }, { status: 500 });
  }
}
