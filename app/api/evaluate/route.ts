import { NextResponse } from "next/server";
import { runEvaluatePipeline } from "@/pipeline/evaluateRun";
import { evaluateRequestSchema } from "@/schemas/api";

/**
 * Execute MVP evaluation chain from raw rows.
 * @param request Next.js request object.
 * @returns Unified evaluate payload with enriched rows, metrics and charts.
 */
export async function POST(request: Request) {
  try {
    const parsedBody = evaluateRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "请求体不合法，请先完成 ingest 并传入 rawRows。" },
        { status: 400 },
      );
    }
    const body = parsedBody.data;
    const rawRows = body.rawRows;
    const runId = body.runId ?? `run_${Date.now()}`;
    const useLlm = Boolean(body.useLlm);

    console.info(`[EVALUATE] runId=${runId} START messages=${rawRows.length} useLlm=${useLlm}`);
    const response = await runEvaluatePipeline(rawRows, {
      useLlm,
      runId,
      persistArtifact: body.persistArtifact ?? Boolean(body.artifactBaseName),
      artifactBaseName: body.artifactBaseName,
    });

    console.info(`[EVALUATE] runId=${runId} DONE warnings=${response.meta.warnings.length}`);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "evaluate 未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
