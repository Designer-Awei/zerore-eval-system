import { NextResponse } from "next/server";
import { createDatasetStore } from "@/eval-datasets/storage";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

/**
 * Read one dataset case and optional baseline snapshot.
 * @param _request Incoming HTTP request.
 * @param context Dynamic route params.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const store = createDatasetStore();
    const datasetCase = await store.getCaseById(caseId);
    if (!datasetCase) {
      return NextResponse.json({ error: `未找到案例: ${caseId}` }, { status: 404 });
    }
    const baseline = await store.getBaseline(caseId);
    return NextResponse.json({ case: datasetCase, baseline });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "读取评测案例失败。", detail: message }, { status: 500 });
  }
}
