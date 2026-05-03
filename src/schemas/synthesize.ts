/**
 * @fileoverview Zod schema for /api/eval-datasets/synthesize.
 */

import { z } from "zod";

export const synthesizeRequestSchema = z.object({
  scenarioDescription: z.string().min(8),
  targetFailureModes: z.array(z.string()).optional(),
  count: z.number().int().min(1).max(50).default(5),
  turnRange: z
    .object({
      min: z.number().int().min(2).max(50),
      max: z.number().int().min(2).max(60),
    })
    .optional(),
  styleHint: z.string().optional(),
  runId: z.string().optional(),
  /** 是否同时把生成结果落到 eval-datasets/cases */
  persistAsCases: z.boolean().optional().default(false),
});
