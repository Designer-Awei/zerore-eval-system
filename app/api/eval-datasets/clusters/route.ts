import { NextResponse } from "next/server";
import { buildBadCaseClusters } from "@/badcase/cluster";
import { createDatasetStore } from "@/eval-datasets/storage";

/**
 * Read lightweight bad case clusters from the current dataset store.
 */
export async function GET() {
  try {
    const store = createDatasetStore();
    const cases = await store.listCases("badcase");
    const clusters = buildBadCaseClusters(cases);

    return NextResponse.json({
      clusters,
      totalCases: cases.length,
      totalClusters: clusters.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "读取 bad case cluster 失败。", detail: message }, { status: 500 });
  }
}
