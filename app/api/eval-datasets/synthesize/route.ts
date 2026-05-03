import { NextResponse } from "next/server";
import { getZeroreRequestContext } from "@/auth/context";
import { synthesizeRequestSchema } from "@/schemas/synthesize";
import { synthesizeConversations } from "@/synthesis/synthesizer";

/**
 * Synthesize evaluation conversations on demand (DeepEval Synthesizer 等价物).
 *
 * @param request Incoming HTTP request.
 */
export async function POST(request: Request) {
  try {
    getZeroreRequestContext(request);
    const parsed = synthesizeRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "请求体不合法。", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await synthesizeConversations(parsed.data);
    return NextResponse.json({
      conversations: result.conversations,
      count: result.conversations.length,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "synthesize 失败。", detail: message }, { status: 500 });
  }
}
