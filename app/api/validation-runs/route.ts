import { NextResponse } from "next/server";
import { createRemediationPackageStore } from "@/remediation";
import { validationRunCreateBodySchema } from "@/schemas/validation";
import { createValidationRunStore, runOfflineEvalValidation, runReplayValidation } from "@/validation";

/**
 * List saved validation runs with optional package filter.
 *
 * @param request Incoming HTTP request.
 * @returns Validation run index list.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const packageId = url.searchParams.get("packageId")?.trim() || undefined;
    const store = createValidationRunStore();
    const validationRuns = await store.list(packageId);
    return NextResponse.json({ validationRuns, count: validationRuns.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "读取 validation runs 失败。", detail: message }, { status: 500 });
  }
}

/**
 * Create and persist one validation run for a remediation package.
 *
 * @param request Incoming HTTP request.
 * @returns Saved validation run snapshot.
 */
export async function POST(request: Request) {
  try {
    const parsedBody = validationRunCreateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "请求体不合法。", details: parsedBody.error.flatten() }, { status: 400 });
    }

    const remediationStore = createRemediationPackageStore();
    const packageSnapshot = await remediationStore.read(parsedBody.data.packageId);
    if (!packageSnapshot) {
      return NextResponse.json({ error: `未找到 remediation package: ${parsedBody.data.packageId}` }, { status: 404 });
    }

    const validationRun =
      parsedBody.data.mode === "replay"
        ? await runReplayValidation({
            packageSnapshot,
            baselineCustomerId: parsedBody.data.baselineCustomerId,
            replyApiBaseUrl: parsedBody.data.replyApiBaseUrl,
            useLlm: parsedBody.data.useLlm,
            replyTimeoutMs: parsedBody.data.replyTimeoutMs,
          })
        : await runOfflineEvalValidation({
            packageSnapshot,
            sampleBatchId: parsedBody.data.sampleBatchId,
            replyApiBaseUrl: parsedBody.data.replyApiBaseUrl,
            useLlm: parsedBody.data.useLlm,
            replyTimeoutMs: parsedBody.data.replyTimeoutMs,
          });

    const validationStore = createValidationRunStore();
    await validationStore.save(validationRun);
    return NextResponse.json({ validationRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "执行 validation run 失败。", detail: message }, { status: 500 });
  }
}
