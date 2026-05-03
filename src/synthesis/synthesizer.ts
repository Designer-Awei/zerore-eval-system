/**
 * @fileoverview Synthetic dataset generator (DeepEval `Synthesizer` 等价物).
 *
 * 给定一个场景 + 失败模式描述 + 数量，让 LLM 合成 N 条对话样本。
 * 适用场景：
 *   - 还没有真实生产数据，但需要先建一个回归集
 *   - 想要专门覆盖某个失败模式的样本不够
 *   - 给 calibration gold-set 起草 candidate 内容
 */

import { parseJsonObjectFromLlmOutput, requestSiliconFlowChatCompletion } from "@/lib/siliconflow";

/**
 * 一次合成请求的输入。
 */
export type SynthesizeRequest = {
  /** 场景描述（中文），例如 "ToB 客服 Agent，处理订单退款" */
  scenarioDescription: string;
  /** 期望覆盖的失败模式（可多个），例如 ["升级触发", "目标未达成"] */
  targetFailureModes?: string[];
  /** 期望生成的对话条数 */
  count: number;
  /** 每条对话的轮次范围 */
  turnRange?: { min: number; max: number };
  /** 风格补充说明 */
  styleHint?: string;
  runId?: string;
};

/**
 * 一条合成对话样本。
 */
export type SyntheticConversation = {
  caseId: string;
  scenarioTag: string;
  failureMode: string | null;
  rawRows: Array<{
    sessionId: string;
    timestamp: string;
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  expectedBehavior: string;
  difficultyHint: "easy" | "medium" | "hard";
};

/**
 * 一次合成请求的产出。
 */
export type SynthesizeResult = {
  conversations: SyntheticConversation[];
  warnings: string[];
};

const SYSTEM_PROMPT = `你是一个高质量评测样本生成器，目标是为 ZERORE 评估系统合成中文对话样本，让评估指标能跑出可解释的结果。

约束：
1. 每条对话以 sessionId 唯一标识
2. 时间戳从 2026-04-18T10:00:00+08:00 开始递增（每条消息间隔 30~120 秒）
3. role 限定为 user/assistant
4. 必须明确指定 failureMode（可为 null 表示正面样本）
5. expectedBehavior 用一句话描述"在这种场景下 assistant 应该怎么做"
6. 输出必须是合法 JSON 数组

输出格式：
{
  "conversations": [
    {
      "caseId": "synth_<short_uuid>",
      "scenarioTag": "<场景 tag>",
      "failureMode": "<失败模式或 null>",
      "rawRows": [{"sessionId":"...","timestamp":"...","role":"user|assistant","content":"..."}],
      "expectedBehavior": "<一句话>",
      "difficultyHint": "easy|medium|hard"
    }
  ]
}
不要返回 markdown，只返回 JSON。`;

/**
 * Generate synthetic conversations for evaluation.
 *
 * @param request Synthesis request.
 * @returns Synthesis result with conversations + warnings.
 */
export async function synthesizeConversations(request: SynthesizeRequest): Promise<SynthesizeResult> {
  const turnMin = request.turnRange?.min ?? 4;
  const turnMax = request.turnRange?.max ?? 10;
  const failureModesText = request.targetFailureModes?.length
    ? `失败模式覆盖：${request.targetFailureModes.join("、")}（请均匀分布）`
    : "失败模式：自由选择，但必须包含至少 30% 的负面样本";

  const userPrompt = `请为以下场景合成 ${request.count} 条对话样本：

场景描述：${request.scenarioDescription}
${failureModesText}
每条对话轮次：${turnMin}~${turnMax} 轮
${request.styleHint ? `风格提示：${request.styleHint}` : ""}

记得每条对话的 sessionId 必须唯一，timestamp 必须递增，role 仅使用 user 和 assistant。`;

  const warnings: string[] = [];
  let raw: string;
  try {
    raw = await requestSiliconFlowChatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { stage: "synthesize", runId: request.runId },
    );
  } catch (error) {
    throw new Error(`synthesizer LLM 调用失败：${(error as Error).message}`);
  }

  const parsed = parseJsonObjectFromLlmOutput(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`synthesizer 返回非 JSON: ${raw.slice(0, 240)}`);
  }

  const conversations = (parsed as { conversations?: unknown }).conversations;
  if (!Array.isArray(conversations)) {
    throw new Error("synthesizer 返回缺少 conversations 数组");
  }

  const result: SyntheticConversation[] = [];
  for (const item of conversations) {
    const validated = validateAndNormalize(item, warnings);
    if (validated) result.push(validated);
  }

  if (result.length === 0) {
    warnings.push("synthesizer 返回结果不可用，结果为空");
  } else if (result.length < request.count) {
    warnings.push(`期望 ${request.count} 条，实际生成 ${result.length} 条`);
  }

  return { conversations: result, warnings };
}

/**
 * Validate one synthesized conversation and normalize fields.
 *
 * @param item Raw item from LLM output.
 * @param warnings Warning collector.
 * @returns Normalized conversation or null.
 */
function validateAndNormalize(item: unknown, warnings: string[]): SyntheticConversation | null {
  if (typeof item !== "object" || item === null) {
    warnings.push("跳过非对象项");
    return null;
  }
  const record = item as Record<string, unknown>;

  const caseId = String(record.caseId ?? "").trim() || `synth_${Math.random().toString(36).slice(2, 10)}`;
  const scenarioTag = String(record.scenarioTag ?? "").trim() || "general";
  const failureMode =
    record.failureMode === null
      ? null
      : record.failureMode != null
        ? String(record.failureMode)
        : null;
  const expectedBehavior = String(record.expectedBehavior ?? "").trim() || "未提供期望行为";
  const difficultyHint = (["easy", "medium", "hard"] as const).includes(
    record.difficultyHint as "easy" | "medium" | "hard",
  )
    ? (record.difficultyHint as "easy" | "medium" | "hard")
    : "medium";

  const rawRows = Array.isArray(record.rawRows) ? record.rawRows : [];
  if (rawRows.length === 0) {
    warnings.push(`跳过空对话 ${caseId}`);
    return null;
  }

  const normalized: SyntheticConversation["rawRows"] = [];
  for (const row of rawRows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const role = r.role;
    const content = String(r.content ?? "").trim();
    if ((role !== "user" && role !== "assistant" && role !== "system") || !content) continue;
    normalized.push({
      sessionId: String(r.sessionId ?? caseId),
      timestamp: String(r.timestamp ?? new Date().toISOString()),
      role,
      content,
    });
  }

  if (normalized.length < 2) {
    warnings.push(`${caseId} 有效消息数不足 2，跳过`);
    return null;
  }

  return { caseId, scenarioTag, failureMode, rawRows: normalized, expectedBehavior, difficultyHint };
}
