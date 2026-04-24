import Link from "next/link";
import styles from "./landingPage.module.css";

const NAV_ITEMS = [
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
];

const TRUST_LOGOS = [
  "AI Team · ToB 客服",
  "AI Team · 情绪陪伴",
  "AI Team · 电商客服",
  "AI Team · 内网 IT",
  "AI Team · 教研助手",
];

const CAPABILITIES = [
  {
    eyebrow: "01 / Evidence",
    title: "每一个问题都带证据、原因、置信度",
    description:
      "不止一个分数。每条 bad case 都附带 evidence 片段、触发规则、原因解释和置信度，让产品和工程同屏对齐。",
    bullets: [
      "规则优先 + LLM 兜底的混合判定",
      "goalCompletion、recoveryTrace 贯穿 session",
      "answerOffTopic / empathy / giveup 等信号可追溯",
    ],
  },
  {
    eyebrow: "02 / Agent-ready package",
    title: "Bad case 自动编译为 Agent 可读调优包",
    description:
      "issue-brief.md、remediation-spec.yaml、badcases.jsonl、acceptance-gate.yaml 四件套，直接交给 Claude Code / Codex 执行。",
    bullets: [
      "优先级 P0/P1/P2 自动判级",
      "编辑范围收敛到 prompt / policy / orchestration / code",
      "目标指标与 guard 阈值一起打包",
    ],
  },
  {
    eyebrow: "03 / Replay & sandbox",
    title: "修完是否变好，由回放和沙箱说了算",
    description:
      "baseline replay 按 winRate 判胜负、固定 sample batch 控回归、后续沙箱场景套件补 SLA。任何指标回退都不会通过门禁。",
    bullets: [
      "Replay gate + offline eval 双校验",
      "改动前后的 KPI 均分可对比",
      "guard 触发即 fail，避免“看起来变好了”",
    ],
  },
  {
    eyebrow: "04 / Judge governance",
    title: "Judge 自身也被校准和漂移监测",
    description:
      "gold set + 多标注人一致性（Cohen κ / Spearman）+ 漂移检测脚本，让评估本身可被审计，不是黑盒打分。",
    bullets: [
      "calibration:judge / agreement / drift 三条 CLI",
      "报告留痕到 calibration/reports/",
      "CI 回归门禁（规划中）",
    ],
  },
];

const LOOP_STEPS = [
  { step: "发现问题", description: "定位失败会话、死亡轮次、情绪低谷和高风险信号。" },
  { step: "提取证据", description: "为每个问题输出 evidence、reason、confidence 和触发指标。" },
  { step: "生成调优包", description: "把 bad case、验收门槛和修复目标编译成结构化任务文件。" },
  { step: "交给 agent 执行", description: "让 Claude Code / Codex 基于调优包改 prompt、policy、orchestration 或代码。" },
  { step: "回放 / 沙箱验证", description: "用 replay、固定批次和 sandbox 证明这次修复真的变好。" },
];

const OUTCOMES = [
  {
    title: "给产品经理",
    text: "从“感觉这版好像变好了”切到“哪一轮出了问题、改完是否回升”。",
  },
  {
    title: "给工程师",
    text: "把失败会话直接变成可执行的修复任务和回归门槛，而不是只看一屏图表。",
  },
  {
    title: "给创始人",
    text: "把坏体验沉淀成长期资产，让每次失败都能变成下次发版前的测试。",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "以前我们 release 前只靠研发凭感觉看几条对话；用 ZERORE 之后每次发版都带着一份由调优包证明过的回归报告。",
    author: "产品负责人 · ToB 客服 Agent",
  },
  {
    quote:
      "最关键的不是指标，是它把“哪一轮为什么失败”说清楚了。我们的 agent 迭代第一次有了可执行 checklist。",
    author: "Tech Lead · 情绪陪伴产品",
  },
];

const FAQ_ITEMS = [
  {
    question: "ZERORE 和传统 eval 平台有什么区别？",
    answer:
      "传统 eval 提供的是“给定数据集 + 给定指标” 的打分面板。ZERORE 的出发点是生产 bad case → 证据包 → 调优任务 → 回放验证的闭环，面向的是“下一次发版前把这次问题修掉”。",
  },
  {
    question: "需要接入内部系统吗？",
    answer:
      "不用。最低支持 CSV / JSON / TXT / MD 的对话日志直接上传。在接入 SDK 或 OpenTelemetry GenAI 语义后可以自动采集生产 trace。",
  },
  {
    question: "LLM judge 的稳定性如何保障？",
    answer:
      "我们提供 gold set + 多标注人一致性 + drift 检测三件套。任何 judge 切换都必须先过 κ/Spearman 阈值，报告留痕可审计。",
  },
  {
    question: "调优包如何交给 Agent 执行？",
    answer:
      "每个调优包都是 4 个标准文件（issue-brief.md / remediation-spec.yaml / badcases.jsonl / acceptance-gate.yaml），可以直接粘贴到 Claude Code / Codex 的任务提示里，或通过我们的 agent-run 接口派发。",
  },
  {
    question: "支持私有化部署吗？",
    answer:
      "支持。核心 pipeline 是纯 Node/Next 本地代码，判定/召回层可以对接自建模型；数据留痕都是本地 artifact 文件，后续会接 SQLite + 异步队列。",
  },
];

/**
 * Render the public-facing landing page.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ZERORE home">
          <span className={styles.brandMark}>ZE</span>
          <span className={styles.brandWord}>ZERORE</span>
        </Link>
        <nav className={styles.nav} aria-label="primary">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/contact" className={styles.primaryPill}>
            Talk to an expert
          </Link>
          <Link href="/workbench" className={styles.loginPill}>
            <span>Login</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 3h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>AI Quality Loop · For Agent Products</p>
          <h1 className={styles.heroHeadline}>
            每一次失败对话，<br />
            都是下一次发版前的<span className={styles.heroAccent}>测试</span>。
          </h1>
          <p className={styles.heroLead}>
            ZERORE 不是再做一个 eval dashboard。它把真实 bad case 自动编译为
            <strong> 证据、调优包和回归验证</strong>，让 AI 产品的每次失败都进入下一次发版前的质量闭环。
          </p>
          <div className={styles.heroActions}>
            <Link href="/contact" className={styles.primaryPill}>
              Talk to an expert
            </Link>
            <Link href="/workbench" className={styles.secondaryPill}>
              Login to explore
            </Link>
          </div>
          <dl className={styles.heroStats}>
            <div>
              <dt>核心闭环</dt>
              <dd>发现 → 证据 → 调优包 → 回放</dd>
            </div>
            <div>
              <dt>当前接入</dt>
              <dd>CSV · JSON · TXT · MD</dd>
            </div>
            <div>
              <dt>判定策略</dt>
              <dd>规则优先 · LLM 兜底</dd>
            </div>
            <div>
              <dt>治理层</dt>
              <dd>κ 一致性 · drift 检测</dd>
            </div>
          </dl>
        </section>

        <section className={styles.trustStrip} aria-label="服务对象">
          <p>正在服务的 Agent 产品类型</p>
          <ul>
            {TRUST_LOGOS.map((logo) => (
              <li key={logo}>{logo}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section} id="capabilities">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowMuted}>Capabilities</p>
            <h2>从真实对话问题，到可执行的修复任务。</h2>
            <p className={styles.sectionLead}>
              ZERORE 把每一次失败会话变成一个带证据的修复任务，直接对接 Claude Code / Codex 的 agent 执行能力。
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            {CAPABILITIES.map((item) => (
              <article className={styles.capabilityCard} key={item.title}>
                <span className={styles.capabilityEyebrow}>{item.eyebrow}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <ul>
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.loopSection} id="loop">
          <div className={styles.sectionIntroInverse}>
            <p className={styles.eyebrowLight}>The Loop</p>
            <h2>每个失败，都应该进入下一次发版前的验证链路。</h2>
          </div>
          <div className={styles.loopGrid}>
            {LOOP_STEPS.map((item, index) => (
              <article className={styles.loopCard} key={item.step}>
                <span>Step {index + 1}</span>
                <strong>{item.step}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="outcomes">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowMuted}>Outcomes</p>
            <h2>交付的不是报告本身，而是下一步动作。</h2>
          </div>
          <div className={styles.outcomeGrid}>
            {OUTCOMES.map((item) => (
              <article className={styles.outcomeCard} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.testimonialSection} id="testimonials">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowMuted}>Testimonials</p>
            <h2>已经把质量闭环跑通的团队怎么说。</h2>
          </div>
          <div className={styles.testimonialGrid}>
            {TESTIMONIALS.map((item) => (
              <figure className={styles.testimonialCard} key={item.author}>
                <blockquote>“{item.quote}”</blockquote>
                <figcaption>— {item.author}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={styles.faqSection} id="faq">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowMuted}>FAQ</p>
            <h2>常见问题</h2>
          </div>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div>
            <p className={styles.eyebrowMuted}>Less dashboards. More fixes.</p>
            <h2>不要再靠感觉发版。</h2>
            <p className={styles.sectionLead}>
              把一批真实对话带进来，让 ZERORE 自动告诉你哪一轮出了问题、怎么修、改完是否真的变好。
            </p>
          </div>
          <div className={styles.ctaActions}>
            <Link href="/contact" className={styles.primaryPill}>
              Talk to an expert
            </Link>
            <Link href="/workbench" className={styles.secondaryPill}>
              开始诊断
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.brandMark}>ZE</span>
            <div>
              <strong>ZERORE</strong>
              <p>AI Quality Loop For Agent Products</p>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h4>Product</h4>
              <Link href="/workbench">工作台</Link>
              <Link href="/remediation-packages">调优包</Link>
              <Link href="/datasets">案例池</Link>
              <Link href="/online-eval">在线评测</Link>
            </div>
            <div>
              <h4>Resources</h4>
              <Link href="/docs">Docs</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/pricing">Pricing</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link href="/about">About</Link>
              <Link href="/contact">Talk to an expert</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} ZERORE · All rights reserved.</span>
          <span>Built for teams that ship agent products.</span>
        </div>
      </footer>
    </div>
  );
}
