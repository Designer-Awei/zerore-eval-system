/**
 * @fileoverview Zod schemas for online replay evaluation API.
 */

import { z } from "zod";
import { rawChatlogRowSchema } from "@/schemas/api";

/**
 * Request body for replay-and-evaluate.
 */
export const onlineReplayEvaluateBodySchema = z
  .object({
    baselineRef: z
      .object({
        customerId: z.string().min(1).max(64),
        runId: z.string().min(1),
      })
      .optional(),
    rawRows: z.array(rawChatlogRowSchema).optional(),
    /** 为空或未传时使用环境变量 `SILICONFLOW_CUSTOMER_API_URL` 或本机 4200 默认通道。 */
    replyApiBaseUrl: z.string().min(1).max(2000).optional(),
    useLlm: z.boolean().optional().default(true),
    runId: z.string().optional(),
    scenarioId: z.string().min(1).optional(),
    replyTimeoutMs: z.number().int().min(3000).max(120000).optional(),
  })
  .refine((value) => Boolean(value.baselineRef) || (value.rawRows?.length ?? 0) > 0, {
    message: "必须提供 baselineRef 或 rawRows。",
  });
