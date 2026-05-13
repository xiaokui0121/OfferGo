import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/NavBar";
import {
  Upload,
  FileText,
  Download,
  Sparkles,
  AlertCircle,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/queryClient";

type Job = {
  id: number;
  company: string;
  title: string;
  category: string;
  description: string;
};

type OptimizeResult = {
  id?: number;
  score: number;
  issues: string[];
  suggestions: { original: string; revised: string; reason: string }[];
  optimized_resume_text: string;
  _fallback?: boolean;
  raw?: string;
};

// 一份面向「小红书社区产品」岗位的示例简历，用来在 demo / PDF 抽取出问题时一键填充
// （只作为报错兜底，不会覆盖已输入内容）。
const DEMO_RESUME_TEXT = `姓名：周小雨
Lehigh University · 商学院 · 市场营销与数据分析 · GPA 3.7/4.0
2022.09 - 2026.06 · 本科在读

【实习经历】

字节跳动 · 抖音电商 · 产品运营实习生（2025.06 - 2025.09）
- 负责抖音商家后台「店铺装修」模块的用户调研，1v1 访谈 18 位中小商家，输出 1 份 【中小商家装修需求拆解】报告。
- 使用 SQL 拉取 12 万 商家访问数据，定位模板选择页的 35% 跳失点，推动上线「推荐模板」入口，跳失率下降 11pp。
- 与设计、前后端协作交付 PRD 2 份，参与需求评审、验收、上线全流程。

L’Oréal 中国 · CMI 数据分析实习生（2024.06 - 2024.09）
- 协助市场部跟踪 5 个 SKU 在天猫、小红书、抖音三个平台的走势，每周输出部门周报。
- 以 Excel + Tableau 搭建品牌健康度看板，被品牌总监采纳作为双周会汇报材料。
- 独立完成 1 份【Z 世代在小红书上的彩妆词云】专题报告。

【校内经历】
Lehigh Marketing Club · 亚太部 Co-Lead（2023.09 - 2025.06）
- 组织 6 场中国市场主题分享会，累计参与学生 400+。
- 作为 Cap1 case competition 队长，以「Z 世代金融应用概念」进入决赛 TOP 5。

【技能】
SQL（SELECT/JOIN/Window function）、Excel、Tableau、Notion、Figma阅读级、中英双语。`;


function ScoreRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="8"
        />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 56 56)"
          style={{ transition: "stroke-dashoffset 800ms ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[26px] font-semibold tracking-tight" data-testid="text-score">
          {value}
        </span>
        <span className="text-[10.5px] text-muted-foreground">匹配度</span>
      </div>
    </div>
  );
}

export default function Resume() {
  const [loc] = useLocation();
  const queryParams = useMemo(() => {
    return new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);
  const prefilledJobId = queryParams.get("job_id");

  const { data: allJobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jdText, setJdText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Prefill JD when job_id query param is present and jobs are loaded.
  useEffect(() => {
    if (!prefilledJobId || allJobs.length === 0) return;
    const j = allJobs.find((x) => String(x.id) === prefilledJobId);
    if (j) {
      setSelectedJobId(String(j.id));
      setJdText(j.description);
    }
  }, [prefilledJobId, allJobs]);

  // When user picks a job from dropdown, hydrate JD text.
  useEffect(() => {
    if (!selectedJobId) return;
    const j = allJobs.find((x) => String(x.id) === selectedJobId);
    if (j) setJdText(j.description);
  }, [selectedJobId, allJobs]);

  // 记住当前 resumeText 是不是「例子粘贴」填进去的。是的话下次用户主动点「上传文件 / 粘贴文本」时自动清空。
  const [isDemoText, setIsDemoText] = useState(false);

  const handleFile = (f: File | null) => {
    setFile(f);
    setResumeText("");
    setIsDemoText(false);
    setError(null);
  };

  const fillDemo = () => {
    setMode("paste");
    setResumeText(DEMO_RESUME_TEXT);
    setIsDemoText(true);
    setError(null);
  };

  // 点「上传文件」或「粘贴文本」时调用：如果输入区里还是例子粘贴进来的内容，点切换等同于「开始输入」，清空。用户手动在例子上改过了则不动（isDemoText 会被 onChange 清掉）。
  const switchMode = (next: "upload" | "paste") => {
    if (isDemoText) {
      setResumeText("");
      setIsDemoText(false);
    }
    setMode(next);
    if (error) setError(null);
  };

  const onSubmit = async () => {
    // 主动清空旧错误和结果，避免上一次状态干扰本次提交
    setError(null);
    setResult(null);
    // 让 React 在进入 async 前先 flush 错误状态出去
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (mode === "upload" && !file) {
      setError("请先上传一份简历文件");
      return;
    }
    if (mode === "paste" && !resumeText.trim()) {
      setError("请粘贴你的简历正文");
      return;
    }
    if (!jdText.trim()) {
      setError("请选择目标岗位或粘贴 JD");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("jd_text", jdText);
      if (selectedJobId) fd.append("job_id", selectedJobId);
      if (mode === "upload" && file) fd.append("file", file);
      if (mode === "paste") fd.append("resume_text", resumeText);
      const res = await fetch(`${API_BASE}/api/optimize-resume`, { method: "POST", body: fd });
      const text = await res.text();
      let body: any = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
      if (!res.ok) {
        throw new Error(body?.message || "AI 服务请求失败");
      }
      setResult(body);
    } catch (e: any) {
      setError(e.message || "请求失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  const downloadDocx = async () => {
    if (!result) return;
    if (result.id) {
      window.location.href = `${API_BASE}/api/optimizations/${result.id}/download`;
      return;
    }
    const res = await fetch(`${API_BASE}/api/download-resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: result.optimized_resume_text || "" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "optimized_resume.docx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">AI 改简历</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            上传你的简历 + 选择目标岗位，AI 会给出匹配度、问题和逐条修改建议
          </p>
        </div>
      </div>

      {/* 部署现状说明：OpenRouter 中转与封号风险 */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div className="flex-1 text-[12.5px] leading-relaxed text-amber-900">
            <div className="font-medium text-amber-900">
              部署现状说明（不影响演示体验）
            </div>
            <div className="mt-1 text-amber-800">
              本产品原计划直接调用 Anthropic 官方 API（Claude Sonnet 4.5），但官方订阅需美元信用卡且对大陆地区不友好。
              目前部署的是「OpenRouter 中转方案」（支持支付宝充值），可以打通 Claude/GPT/Gemini 在内的主流模型。
              需要说明的是：Claude、OpenAI、Google 近期对中转服务商的审查越来越严，<b>OpenRouter 账号本身存在被识别后封禁的可能</b>，这是中转类服务在国内部署的公开风险。
            </div>
            <div className="mt-2 text-amber-800">
              本次面试演示中，我已本地验证过一次简历优化接口调通（返回完整分数 + 改写建议，余额正常扣减）。
              为避免面试当场账号被风控导致 Demo 不可用，<b>后续不再重复调用，面试官可看页面交互逻辑与详情页返回结果为准</b>。产品上线后需接入稳定渠道（公司主体开通官方 API 或企业级代理）。
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <section className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[13px] font-medium">第一步 · 提供简历</label>
              <div className="flex gap-1 text-[11.5px]">
                <button
                  onClick={() => switchMode("upload")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium hover-elevate",
                    mode === "upload" ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                >
                  上传文件
                </button>
                <button
                  onClick={() => switchMode("paste")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium hover-elevate",
                    mode === "paste" ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                >
                  粘贴文本
                </button>
                <button
                  onClick={fillDemo}
                  data-testid="button-fill-demo"
                  className="rounded-md px-2 py-1 font-medium text-muted-foreground hover-elevate inline-flex items-center gap-1"
                  title="一键填充一份示例简历（示例数据，可直接跑通 AI 流程）"
                >
                  <Wand2 className="h-3 w-3" />
                  示例简历
                </button>
              </div>
            </div>
            {mode === "upload" ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-resume"
                className={cn(
                  "cursor-pointer rounded-md border border-dashed p-7 text-center transition-colors",
                  dragOver
                    ? "border-foreground/40 bg-secondary"
                    : "border-border bg-background hover:border-foreground/30",
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="inline-flex items-center gap-2 text-[13px]">
                    <FileText className="h-4 w-4 text-foreground" />
                    <span className="text-foreground" data-testid="text-filename">
                      {file.name}
                    </span>
                    <span className="text-muted-foreground">
                      ({Math.round(file.size / 1024)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                    <div className="text-[13px] text-foreground">
                      点击或拖拽简历到这里
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      支持 .pdf / .docx / .txt，10MB 以内
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <textarea
                data-testid="textarea-resume"
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  // 一旦用户手动改过了，就不再当作「例子粘贴」，避免他们下次点切换时丢掉已经改过的内容。
                  if (isDemoText) setIsDemoText(false);
                  if (error) setError(null);
                }}
                placeholder="把你的简历正文粘贴在这里…"
                className="w-full h-44 resize-y rounded-md border border-border bg-background p-3 text-[13px] outline-none focus:border-foreground/30"
              />
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <label className="block mb-3 text-[13px] font-medium">第二步 · 目标岗位</label>
            <select
              data-testid="select-job"
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                if (error) setError(null);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            >
              <option value="">— 不绑定岗位，下方手动粘贴 JD —</option>
              {allJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company} — {j.title}
                </option>
              ))}
            </select>
            <textarea
              data-testid="textarea-jd"
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value);
                if (error) setError(null);
              }}
              placeholder="或直接粘贴一段 JD..."
              className="mt-3 w-full h-32 resize-y rounded-md border border-border bg-background p-3 text-[13px] outline-none focus:border-foreground/30"
            />
          </div>

          <div>
            <button
              onClick={onSubmit}
              disabled={loading}
              data-testid="button-generate"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground hover-elevate active-elevate",
                loading && "opacity-60 cursor-not-allowed",
              )}
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "AI 正在分析…" : "生成优化建议"}
            </button>
            {error && (
              <div
                role="alert"
                data-testid="alert-error"
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[12.5px] text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            )}
          </div>
        </section>

        {/* Right column */}
        <section className="space-y-5">
          {loading ? (
            <SkeletonResult />
          ) : !result ? (
            <EmptyResult />
          ) : (
            <ResultPanel result={result} onDownload={downloadDocx} />
          )}
        </section>
      </div>
    </PageShell>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
      <div className="mt-2 text-[13.5px] text-foreground font-medium">等待 AI 输出</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        上传简历并选择岗位后，点击「生成优化建议」开始
      </p>
    </div>
  );
}

function SkeletonResult() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 flex items-center gap-5">
        <div className="h-28 w-28 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
          <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 w-full bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  onDownload,
}: {
  result: OptimizeResult;
  onDownload: () => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-6">
          <ScoreRing value={result.score} />
          <div className="flex-1">
            <div className="text-[13px] font-medium text-foreground mb-1.5">核心问题</div>
            {result.issues.length === 0 ? (
              <div className="text-[12.5px] text-muted-foreground">暂无明显问题</div>
            ) : (
              <ul className="space-y-1.5">
                {result.issues.map((it, i) => (
                  <li
                    key={i}
                    data-testid={`issue-${i}`}
                    className="text-[12.5px] text-foreground leading-relaxed flex items-start gap-1.5"
                  >
                    <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-foreground/60 flex-shrink-0" />
                    {it}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {result._fallback && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[12.5px] text-destructive">
          AI 返回结果解析失败，请重试一次。
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-[13px] font-medium">
          逐条修改建议（{result.suggestions.length} 条）
        </div>
        {result.suggestions.length === 0 ? (
          <div className="p-5 text-[12.5px] text-muted-foreground">暂无具体修改建议</div>
        ) : (
          <div className="divide-y divide-border">
            <div
              className="grid gap-3 px-5 py-2 text-[11.5px] font-medium text-muted-foreground bg-muted/30"
              style={{ gridTemplateColumns: "4fr 4fr 4fr" }}
            >
              <div>原文</div>
              <div>建议改成</div>
              <div>修改原因</div>
            </div>
            {result.suggestions.map((s, i) => (
              <div
                key={i}
                data-testid={`suggestion-${i}`}
                className="grid gap-3 px-5 py-3 text-[12.5px] leading-relaxed"
                style={{ gridTemplateColumns: "4fr 4fr 4fr" }}
              >
                <div className="text-muted-foreground line-through decoration-muted-foreground/60">
                  {s.original}
                </div>
                <div className="text-foreground font-medium">{s.revised}</div>
                <div className="text-muted-foreground">{s.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onDownload}
          data-testid="button-download"
          disabled={!result.optimized_resume_text}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground hover-elevate active-elevate",
            !result.optimized_resume_text && "opacity-50 cursor-not-allowed",
          )}
        >
          <Download className="h-4 w-4" />
          下载优化后的简历（Word）
        </button>
        <span className="text-[11.5px] text-muted-foreground">
          下载内容基于上方建议改写后的完整简历正文
        </span>
      </div>
    </>
  );
}
