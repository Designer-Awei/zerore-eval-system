import { NextResponse } from "next/server";
import { getZeroreRequestContext } from "@/auth/context";
import { enqueueLocalJob } from "@/queue";

/**
 * Create one queued job. This is the first async-job contract; workers can
 * later consume the same queue from a separate process.
 * @param request Incoming request.
 */
export async function POST(request: Request) {
  try {
    const context = getZeroreRequestContext(request);
    const body = (await request.json()) as { type?: string; payload?: unknown };
    if (!body.type?.trim()) {
      return NextResponse.json({ error: "job type 缺失。" }, { status: 400 });
    }
    const job = await enqueueLocalJob({
      workspaceId: context.workspaceId,
      type: body.type,
      payload: body.payload ?? {},
    });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "创建异步任务失败。", detail: message }, { status: 500 });
  }
}
