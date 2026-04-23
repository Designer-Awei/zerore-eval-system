import { NextResponse } from "next/server";
import { readWorkbenchBaseline } from "@/workbench/baseline-file-store";

type RouteContext = {
  params: Promise<{ customerId: string; runId: string }>;
};

/**
 * Read one baseline snapshot JSON.
 * @param _request Request.
 * @param context Route params.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { customerId, runId } = await context.params;
    const decodedCustomer = decodeURIComponent(customerId);
    const decodedRun = decodeURIComponent(runId);
    const snapshot = await readWorkbenchBaseline(decodedCustomer, decodedRun);
    if (!snapshot) {
      return NextResponse.json({ error: "未找到基线快照。" }, { status: 404 });
    }
    return NextResponse.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "读取基线失败。", detail: message }, { status: 500 });
  }
}
