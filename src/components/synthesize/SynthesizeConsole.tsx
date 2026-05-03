/**
 * @fileoverview LLM-driven synthesis console (DeepEval Synthesizer 对齐).
 *
 * Lets users describe a scenario + failure modes and have the backend LLM
 * generate evaluation conversations. Results are shown inline and can be
 * persisted as cases.
 */

"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell";
import styles from "./synthesizeConsole.module.css";

type SynthConversation = {
  caseId: string;
  scenarioTag?: string;
  failureMode?: string;
  expectedBehavior?: string;
  difficultyHint?: string;
  rawRows: Array<{ role: string; content: string; timestamp?: string; sessionId?: string }>;
};

const PRESETS = [
  {
    label: "ToB 客服 · 升级风险",
    scenarioDescription: "ToB 售后客服 Agent，处理订单退款、升级触发、目标未达成场景",
    targetFailureModes: ["升级触发", "目标未达成", "工具调用错参"],
  },
  {
    label: "RAG 知识库",
    scenarioDescription: "企业知识库 RAG Agent，回答政策类问题",
    targetFailureModes: ["幻觉", "context 不忠实", "答非所问"],
  },
  {
    label: "Agent 工具调用",
    scenarioDescription: "Function-calling Agent，需要正确选择并参数化工具",
    targetFailureModes: ["调错工具", "参数缺失", "无限循环"],
  },
];

/**
 * Render the synthesize console.
 *
 * @returns The console element.
 */
export function SynthesizeConsole() {
  const [scenarioDescription, setScenarioDescription] = useState(PRESETS[0].scenarioDescription);
  const [failureModesText, setFailureModesText] = useState(PRESETS[0].targetFailureModes.join("、"));
  const [count, setCount] = useState(5);
  const [styleHint, setStyleHint] = useState("");
  const [persistAsCases, setPersistAsCases] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [results, setResults] = useState<SynthConversation[]>([]);

  const applyPreset = (i: number) => {
    setScenarioDescription(PRESETS[i].scenarioDescription);
    setFailureModesText(PRESETS[i].targetFailureModes.join("、"));
  };

  const submit = async () => {
    setRunning(true);
    setError(null);
    setWarnings([]);
    try {
      const targetFailureModes = failureModesText
        .split(/[、,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/eval-datasets/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioDescription,
          targetFailureModes,
          count,
          styleHint: styleHint || undefined,
          persistAsCases,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "合成失败");
      setResults(data.conversations || []);
      setWarnings(data.warnings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell>
      <div className={styles.layout}>
        <header className={styles.header}>
          <h1 className={styles.title}>LLM 评测样本合成</h1>
          <p className={styles.sub}>
            描述场景 + 失败模式，让 LLM 生成评测会话样本。等价于 DeepEval 的 <code>Synthesizer</code>。
          </p>
        </header>

        <div className={styles.grid}>
          <section className={styles.form}>
            <h2 className={styles.formTitle}>1. 选择预设</h2>
            <div className={styles.presets}>
              {PRESETS.map((p, i) => (
                <button key={i} className={styles.preset} onClick={() => applyPreset(i)}>
                  {p.label}
                </button>
              ))}
            </div>

            <h2 className={styles.formTitle}>2. 场景描述</h2>
            <textarea
              className={styles.textarea}
              rows={3}
              value={scenarioDescription}
              onChange={(e) => setScenarioDescription(e.target.value)}
              placeholder="例如：ToB 客服 Agent，处理升级风险..."
            />

            <h2 className={styles.formTitle}>3. 目标失败模式（用 、 / 逗号 / 换行 分隔）</h2>
            <textarea
              className={styles.textarea}
              rows={2}
              value={failureModesText}
              onChange={(e) => setFailureModesText(e.target.value)}
              placeholder="升级触发、目标未达成"
            />

            <div className={styles.row}>
              <label className={styles.field}>
                <span>样本数量（1-50）</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                />
              </label>
              <label className={styles.field}>
                <span>风格提示（可选）</span>
                <input
                  type="text"
                  value={styleHint}
                  onChange={(e) => setStyleHint(e.target.value)}
                  placeholder="如：客户语气强硬、夹杂俚语"
                />
              </label>
            </div>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={persistAsCases}
                onChange={(e) => setPersistAsCases(e.target.checked)}
              />
              同时落库到 eval-datasets/cases
            </label>

            <button onClick={submit} disabled={running} className={styles.submit}>
              {running ? "合成中…（约 10-30s）" : "🚀 生成样本"}
            </button>

            {error ? <div className={styles.error}>错误：{error}</div> : null}
            {warnings.length > 0 ? (
              <div className={styles.warn}>
                <strong>提示：</strong>
                <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            ) : null}
          </section>

          <section className={styles.results}>
            <h2 className={styles.formTitle}>结果（{results.length}）</h2>
            {results.length === 0 ? (
              <div className={styles.empty}>
                提交左侧表单生成样本。需要 SiliconFlow API Key 配置在服务端
                <code>SILICONFLOW_API_KEY</code>。
              </div>
            ) : (
              <div className={styles.cases}>
                {results.map((c) => (
                  <article key={c.caseId} className={styles.case}>
                    <div className={styles.caseHead}>
                      <code>{c.caseId}</code>
                      {c.failureMode ? <span className={styles.tag}>{c.failureMode}</span> : null}
                      {c.difficultyHint ? <span className={styles.diff}>{c.difficultyHint}</span> : null}
                    </div>
                    {c.expectedBehavior ? (
                      <div className={styles.expected}>
                        <strong>期望行为：</strong> {c.expectedBehavior}
                      </div>
                    ) : null}
                    <ol className={styles.turns}>
                      {c.rawRows.map((r, i) => (
                        <li key={i} className={styles[`role_${r.role}`] || styles.role_user}>
                          <span className={styles.roleLabel}>{r.role}</span>
                          <span>{r.content}</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
