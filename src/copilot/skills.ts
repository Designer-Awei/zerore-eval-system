/**
 * @fileoverview Eval Copilot Skill Registry.
 *
 * 把 ZERORE 现有的内部 API 包装成 Copilot 可调度的 skill。每个 skill 有：
 *   - name / description / paramsSchema：给 LLM 看的契约
 *   - execute()：实际调度内部模块（直接调 pipeline，不走 HTTP，省一次序列化）
 *
 * MVP 阶段先实现 3 个最有价值的 skill：
 *   1. run_evaluate    —— 把日志/对话转成评估结果
 *   2. summarize_findings —— 从评估结果里提炼 top 风险（仅本地聚合，无 LLM）
 *   3. build_remediation —— 基于 bad case 生成 4 文件调优包
 */

import { z } from "zod";
import { runEvaluatePipeline } from "@/pipeline/evaluateRun";
import { buildRemediationPackage } from "@/remediation";
import type { EvaluateResponse, RawChatlogRow } from "@/types/pipeline";

/**
 * Skill 执行上下文（由 orchestrator 注入）。
 */
export type SkillContext = {
  /** 一次会话内共享的 KV 状态（前一个 skill 的输出可被后一个引用） */
  scratch: Record<string, unknown>;
  /** 触发上下文（用于落库、追踪） */
  workspaceId?: string;
};

/**
 * Skill 执行结果（结构化，便于 LLM 继续推理 + 前端渲染）。
 */
export type SkillResult = {
  ok: boolean;
  /** 给 LLM 看的简明文本（比 raw 数据小得多） */
  summary: string;
  /** 完整结果（前端可渲染卡片，LLM 不需要全部看到） */
  data?: unknown;
  /** 失败时的错误 */
  error?: string;
};

/**
 * 单个 skill 的形态。
 */
export type Skill = {
  name: string;
  /** 给 LLM 的英文/中文描述（用于规划） */
  description: string;
  /** Zod 参数 schema，用于校验 LLM 输出 */
  paramsSchema: z.ZodTypeAny;
  /** 实际执行 */
  execute: (params: unknown, ctx: SkillContext) => Promise<SkillResult>;
};

// -------- Skill 1: run_evaluate ------------------------------------------------

const runEvaluateParams = z.object({
  /** 用户给的对话日志（标准 raw rows 格式） */
  rawRows: z
    .array(
      z.object({
        sessionId: z.string(),
        timestamp: z.string(),
        role: z.string(),
        content: z.string(),
      }),
    )
    .min(1),
  /** 业务场景（可选） */
  scenarioId: z.string().optional(),
  /** 是否使用 LLM judge（成本较高，默认 false） */
  useLlm: z.boolean().optional().default(false),
});

const runEvaluateSkill: Skill = {
  name: "run_evaluate",
  description: "对一批对话日志运行 ZERORE 评估管线，返回核心指标 + bad case + 扩展指标。",
  paramsSchema: runEvaluateParams,
  async execute(params, ctx) {
    const args = runEvaluateParams.parse(params);
    const result = await runEvaluatePipeline(args.rawRows as RawChatlogRow[], {
      runId: `copilot_${Date.now()}`,
      scenarioId: args.scenarioId,
      useLlm: args.useLlm ?? false,
    });
    ctx.scratch.lastEvaluate = result;

    const cards = result.summaryCards ?? [];
    const top = cards.slice(0, 4).map((c) => `${c.label}: ${c.value}`).join("；");
    const badCount = result.badCaseAssets?.length ?? 0;

    return {
      ok: true,
      summary: `已评估 ${args.rawRows.length} 条消息。${top}。bad case ${badCount} 条。`,
      data: {
        runId: result.runId,
        summaryCards: cards,
        badCaseCount: badCount,
        extendedMetrics: result.extendedMetrics ?? null,
      },
    };
  },
};

// -------- Skill 2: summarize_findings -----------------------------------------

const summarizeParams = z.object({
  /** 默认从 scratch.lastEvaluate 取，无需参数 */
  topN: z.number().int().min(1).max(10).optional().default(3),
});

/**
 * 从 evaluate 结果里聚类 top 失败模式。本地规则聚合（按 tag），无 LLM 调用。
 */
const summarizeSkill: Skill = {
  name: "summarize_findings",
  description: "把上一次 run_evaluate 的 bad case 按 tag 聚类，输出 top N 风险模式。",
  paramsSchema: summarizeParams,
  async execute(params, ctx) {
    const args = summarizeParams.parse(params);
    const last = ctx.scratch.lastEvaluate as EvaluateResponse | undefined;
    if (!last) {
      return {
        ok: false,
        summary: "没有可总结的评估结果，请先调用 run_evaluate。",
        error: "MISSING_EVALUATE_RESULT",
      };
    }
    const counter = new Map<string, { count: number; samples: string[] }>();
    for (const bc of last.badCaseAssets ?? []) {
      const tags = (bc.tags && bc.tags.length > 0 ? bc.tags : ["未分类"]) as string[];
      for (const tag of tags) {
        const slot = counter.get(tag) ?? { count: 0, samples: [] };
        slot.count += 1;
        if (slot.samples.length < 2 && bc.sessionId) slot.samples.push(bc.sessionId);
        counter.set(tag, slot);
      }
    }
    const ranked = [...counter.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, args.topN)
      .map(([tag, v]) => ({ tag, count: v.count, sampleSessionIds: v.samples }));

    if (ranked.length === 0) {
      return { ok: true, summary: "本批未发现明显失败模式。", data: { topRisks: [] } };
    }
    const text = ranked.map((r, i) => `${i + 1}. ${r.tag}（${r.count} 例）`).join("；");
    return {
      ok: true,
      summary: `Top ${ranked.length} 风险：${text}`,
      data: { topRisks: ranked },
    };
  },
};

// -------- Skill 3: build_remediation ------------------------------------------

const buildRemediationParams = z.object({
  baselineVersion: z.string().optional(),
  /** 可选业务场景，用于调优包文案 */
  scenarioId: z.string().optional(),
});

const buildRemediationSkill: Skill = {
  name: "build_remediation",
  description:
    "基于上一次 run_evaluate 的 bad case 生成 4 文件调优包（issue-brief / spec / cases / gate）。",
  paramsSchema: buildRemediationParams,
  async execute(params, ctx) {
    const args = buildRemediationParams.parse(params);
    const last = ctx.scratch.lastEvaluate as EvaluateResponse | undefined;
    if (!last) {
      return {
        ok: false,
        summary: "没有可用的评估结果，请先 run_evaluate。",
        error: "MISSING_EVALUATE_RESULT",
      };
    }
    if (!last.badCaseAssets?.length) {
      return {
        ok: true,
        summary: "无 bad case，跳过调优包生成。",
        data: { skipped: true },
      };
    }

    const built = buildRemediationPackage({
      evaluate: last,
      baselineCustomerId: args.baselineVersion,
    });
    if (built.skipped || !built.package) {
      return {
        ok: true,
        summary: built.message ?? "无可生成内容，已跳过。",
        data: { skipped: true },
      };
    }
    ctx.scratch.lastRemediation = built.package;
    return {
      ok: true,
      summary: `已生成调优包 ${built.package.packageId}（${built.package.files.length} 个文件，标题：${built.package.title}）。`,
      data: built.package,
    };
  },
};

// -------- Registry -------------------------------------------------------------

export const SKILL_REGISTRY: Record<string, Skill> = {
  [runEvaluateSkill.name]: runEvaluateSkill,
  [summarizeSkill.name]: summarizeSkill,
  [buildRemediationSkill.name]: buildRemediationSkill,
};

/**
 * Render a system-prompt-friendly description of all skills (for the LLM planner).
 *
 * @returns A markdown-flavored text block describing every skill and its params.
 */
export function renderSkillManifest(): string {
  return Object.values(SKILL_REGISTRY)
    .map((skill) => {
      // Lightweight schema serialization — avoid pulling zod-to-json-schema dep.
      const shape = describeZodSchema(skill.paramsSchema);
      return `- **${skill.name}**: ${skill.description}\n  参数: ${shape}`;
    })
    .join("\n");
}

/**
 * Describe a Zod schema as a flat one-liner (best-effort, MVP-only).
 *
 * @param schema A Zod schema.
 * @returns Human-readable shape string.
 */
function describeZodSchema(schema: z.ZodTypeAny): string {
  // MVP: zod 4 internals vary across builds, so we inspect runtime def cautiously.
  const def = (schema as unknown as { _def?: { typeName?: string }; def?: { type?: string } });
  const tn = def._def?.typeName || def.def?.type;
  if (tn === "ZodObject" || tn === "object") {
    const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape ?? {};
    const entries = Object.entries(shape);
    return `{ ${entries
      .map(([k, v]) => {
        const opt =
          (v as unknown as { isOptional?: () => boolean }).isOptional?.() ?? false;
        return `${k}${opt ? "?" : ""}: ${zodTypeName(v)}`;
      })
      .join(", ")} }`;
  }
  return zodTypeName(schema);
}

/**
 * Best-effort Zod type name resolver (zod 4 friendly).
 *
 * @param schema A Zod schema.
 * @returns Type name.
 */
function zodTypeName(schema: z.ZodTypeAny): string {
  const def = (schema as unknown as { _def?: { typeName?: string }; def?: { type?: string } });
  const tn = def._def?.typeName || def.def?.type;
  switch (tn) {
    case "ZodString":
    case "string":
      return "string";
    case "ZodNumber":
    case "number":
      return "number";
    case "ZodBoolean":
    case "boolean":
      return "boolean";
    case "ZodArray":
    case "array":
      return "array";
    case "ZodObject":
    case "object":
      return "object";
    default:
      return "any";
  }
}
