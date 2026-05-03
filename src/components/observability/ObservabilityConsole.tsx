/**
 * @fileoverview Live OTel GenAI trace observability console.
 *
 * Polls `/api/traces/ingest` and renders the most recent traces with their spans.
 * Exposes a quick "ingest sample trace" action so users can validate the wiring
 * without an SDK installed.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import styles from "./observabilityConsole.module.css";

type TraceSpan = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: string;
  endTime?: string;
  status?: string;
  attributes?: Record<string, unknown>;
};

type Trace = {
  traceId: string;
  sessionId?: string;
  name?: string;
  spans: TraceSpan[];
  receivedAt?: string;
};

const SPAN_KIND_COLORS: Record<string, string> = {
  agent: "#a855f7",
  chat: "#38bdf8",
  tool: "#fb923c",
  retrieval: "#22c55e",
  embeddings: "#0ea5e9",
  custom: "#94a3b8",
};

/**
 * Render the observability console with live trace polling.
 *
 * @returns The console element.
 */
export function ObservabilityConsole() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<string | null>(null);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/traces/ingest?limit=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "拉取失败");
      setTraces(data.traces || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTraces();
  }, [fetchTraces]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void fetchTraces(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchTraces]);

  const ingestSample = useCallback(async () => {
    setPosting(true);
    setPostMsg(null);
    try {
      const trace = {
        traceId: `demo_${Date.now()}`,
        sessionId: `session_${Math.floor(Math.random() * 999)}`,
        name: "demo agent run",
        spans: [
          {
            spanId: "s1",
            name: "agent root",
            kind: "agent",
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 1000).toISOString(),
            attributes: { system: "zerore-demo" },
          },
          {
            spanId: "s2",
            parentSpanId: "s1",
            name: "chat gpt-4o",
            kind: "chat",
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 800).toISOString(),
            attributes: { model: "gpt-4o" },
            input: { messages: [{ role: "user", content: "退款流程？" }] },
            output: {
              choices: [{ index: 0, message: { role: "assistant", content: "未拆封 7 天内可退" }, finish_reason: "stop" }],
            },
          },
          {
            spanId: "s3",
            parentSpanId: "s1",
            name: "tool create_refund",
            kind: "tool",
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 200).toISOString(),
            attributes: { toolName: "create_refund_ticket" },
            input: { arguments: { orderId: "SF882910" } },
            output: { ticketId: "T-001" },
            status: "ok",
          },
        ],
      };
      const res = await fetch("/api/traces/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ traces: [trace], evaluateInline: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "上报失败");
      setPostMsg(`✅ 已注入 ${data.ingestedCount} 条 trace`);
      void fetchTraces();
    } catch (e) {
      setPostMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPosting(false);
    }
  }, [fetchTraces]);

  const selectedTrace = useMemo(
    () => traces.find((t) => t.traceId === selected) ?? traces[0] ?? null,
    [traces, selected],
  );

  return (
    <AppShell>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>实时 Trace 观测</h1>
            <p className={styles.sub}>
              通过 SDK / LangChain Callback / OpenAI Agents Adapter 上报的 OTel GenAI trace。
              支持 <code>POST /api/traces/ingest</code>。
            </p>
          </div>
          <div className={styles.actions}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              自动刷新（5s）
            </label>
            <button onClick={() => void fetchTraces()} className={styles.btn} disabled={loading}>
              {loading ? "刷新中…" : "立即刷新"}
            </button>
            <button onClick={() => void ingestSample()} className={styles.btnPrimary} disabled={posting}>
              {posting ? "注入中…" : "注入示例 trace"}
            </button>
          </div>
        </header>

        {postMsg ? <div className={styles.toast}>{postMsg}</div> : null}
        {error ? <div className={styles.error}>错误：{error}</div> : null}

        <div className={styles.grid}>
          <aside className={styles.list}>
            <h2 className={styles.listTitle}>最近 trace（{traces.length}）</h2>
            {traces.length === 0 ? (
              <div className={styles.empty}>
                暂无 trace。点击右上角&quot;注入示例 trace&quot;，或参考{" "}
                <a href="/integrations">集成文档</a> 接入生产 agent。
              </div>
            ) : (
              <ul className={styles.listItems}>
                {traces.map((t) => (
                  <li
                    key={t.traceId}
                    className={`${styles.listItem} ${selectedTrace?.traceId === t.traceId ? styles.listItemActive : ""}`}
                    onClick={() => setSelected(t.traceId)}
                  >
                    <div className={styles.listItemTitle}>{t.name || t.traceId}</div>
                    <div className={styles.listItemMeta}>
                      <span>session: {t.sessionId || "—"}</span>
                      <span>{t.spans.length} spans</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className={styles.detail}>
            {selectedTrace ? (
              <>
                <h2 className={styles.detailTitle}>{selectedTrace.name || selectedTrace.traceId}</h2>
                <div className={styles.detailMeta}>
                  <code>traceId: {selectedTrace.traceId}</code>
                  {selectedTrace.sessionId ? <code>sessionId: {selectedTrace.sessionId}</code> : null}
                </div>
                <div className={styles.spanList}>
                  {selectedTrace.spans.map((sp) => {
                    const color = SPAN_KIND_COLORS[sp.kind] || "#94a3b8";
                    const dur =
                      sp.endTime && sp.startTime
                        ? `${(new Date(sp.endTime).getTime() - new Date(sp.startTime).getTime())} ms`
                        : "—";
                    return (
                      <div key={sp.spanId} className={styles.span}>
                        <div className={styles.spanHead}>
                          <span className={styles.kindBadge} style={{ background: color }}>
                            {sp.kind}
                          </span>
                          <strong>{sp.name}</strong>
                          <span className={styles.spanDur}>{dur}</span>
                        </div>
                        {sp.attributes && Object.keys(sp.attributes).length > 0 ? (
                          <pre className={styles.spanAttrs}>
                            {JSON.stringify(sp.attributes, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={styles.empty}>从左侧选择一条 trace 查看详情。</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
