import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  CheckCircle2,
  RefreshCw,
  LogIn,
  Play,
  AlertCircle,
} from "lucide-react";

type LoginStatusResp = { saved: boolean; updatedAt: number };
type ScreenshotResp = { image: string; status: string; message: string };
type ScrapeJob = {
  id: number;
  keyword: string;
  target_category: string;
  target_subcategory: string;
  status: "queued" | "running" | "done" | "failed";
  total_seen: number;
  total_kept: number;
  message: string;
  started_at: number;
  finished_at: number;
};

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 4 个预设按钮：每个分类挂 2 个真实岗位招聘词，后端会循环搜两个词、合并去重。
// “招聘 / 内推”作为意图词，岗位词贴近招聘方实际发贴时的措辞。
const PRESETS: { label: string; keywords: string[]; category: string; subcategory: string }[] = [
  {
    label: "互联网 产品",
    keywords: ["产品经理招聘", "产品经理内推"],
    category: "internet",
    subcategory: "product",
  },
  {
    label: "互联网 运营",
    keywords: ["运营招聘", "新媒体运营招聘"],
    category: "internet",
    subcategory: "operations",
  },
  {
    label: "互联网 分析",
    keywords: ["数据分析招聘", "商业分析招聘"],
    category: "internet",
    subcategory: "analytics",
  },
  {
    label: "初创 AI 产品",
    keywords: [
      "AI初创产品招聘",
      "AI startup 招聘",
      "大模型初创招聘",
      "AI agent 创业招聘",
    ],
    category: "ai_startup",
    subcategory: "",
  },
];

export default function Scrape() {
  // ===== 登录态 =====
  const [saved, setSaved] = useState<LoginStatusResp | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [screenshot, setScreenshot] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const timerRef = useRef<number | null>(null);

  // ===== 采集任务 =====
  const [keyword, setKeyword] = useState(""); // 输入框的原始文本（可能包含 " + " 分隔）
  // 代表本次采集的多个关键词（预设是 2 个，手动输入是 1 个）
  const [keywordList, setKeywordList] = useState<string[]>([]);
  const [category, setCategory] = useState("internet");
  const [subcategory, setSubcategory] = useState("product");
  const [submitting, setSubmitting] = useState(false);
  const [task, setTask] = useState<ScrapeJob | null>(null);
  const [submitError, setSubmitError] = useState("");
  const taskTimerRef = useRef<number | null>(null);

  async function refreshSavedStatus() {
    try {
      const resp = await apiRequest("GET", "/api/scrape/login/status");
      const data = (await resp.json()) as LoginStatusResp;
      setSaved(data);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refreshSavedStatus();
  }, []);

  // ===== 扫码登录 =====
  async function startLogin() {
    setStarting(true);
    setSuccess(false);
    setScreenshot("");
    setHint("正在启动浏览器...");
    try {
      const r = await apiRequest("POST", "/api/scrape/login/start");
      if (!r.ok) throw new Error("启动失败");
      setLoginOpen(true);
    } catch (e: any) {
      setHint("启动失败：" + (e?.message || "未知错误"));
    } finally {
      setStarting(false);
    }
  }

  async function closeLogin() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      await apiRequest("POST", "/api/scrape/login/close");
    } catch {
      /* ignore */
    }
    setLoginOpen(false);
    setScreenshot("");
    setHint("");
  }

  useEffect(() => {
    if (!loginOpen) return;
    let tick = 0;
    const id = window.setInterval(async () => {
      tick++;
      try {
        const r = await apiRequest("GET", "/api/scrape/login/screenshot");
        if (r.ok) {
          const data = (await r.json()) as ScreenshotResp;
          if (data.image && data.image.length > 1000) {
            setScreenshot(data.image);
          }
          setHint(data.message);
        }
      } catch {
        /* ignore */
      }
      if (tick % 2 === 0) {
        try {
          const r = await apiRequest("POST", "/api/scrape/login/check");
          if (r.ok) {
            const data = (await r.json()) as { loggedIn: boolean; message: string };
            if (data.loggedIn) {
              setSuccess(true);
              setHint(data.message);
              // 重要：不能调 /login/close，会话要保留给采集用
              window.setTimeout(() => {
                if (timerRef.current) {
                  window.clearInterval(timerRef.current);
                  timerRef.current = null;
                }
                setLoginOpen(false);
                refreshSavedStatus();
              }, 2500);
            }
          }
        } catch {
          /* ignore */
        }
      }
    }, 1000);
    timerRef.current = id;
    return () => {
      window.clearInterval(id);
      timerRef.current = null;
    };
  }, [loginOpen]);

  // ===== 采集 =====
  function applyPreset(p: (typeof PRESETS)[number]) {
    setKeyword(p.keywords.join(" + "));
    setKeywordList(p.keywords);
    setCategory(p.category);
    setSubcategory(p.subcategory);
    setSubmitError("");
  }

  async function startScrape(mode: "real" | "demo" = "real") {
    setSubmitError("");
    // 手动输入：用「+」拆成多个 OR 关键词；预设下使用 keywordList
    let finalList: string[];
    if (keywordList.length > 0) {
      finalList = keywordList;
    } else {
      finalList = keyword
        .split("+")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    }
    if (finalList.length === 0) {
      setSubmitError("请输入关键词或点击预设");
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = mode === "demo" ? "/api/scrape/run-demo" : "/api/scrape/run";
      const body: any = {
        keywords: finalList,
        targetCategory: category,
        targetSubcategory: subcategory,
      };
      if (mode === "real") body.limit = 30;
      const r = await apiRequest("POST", endpoint, body);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "提交失败");
      }
      const data = (await r.json()) as { taskId: number };
      // 立刻拉一次任务
      const t = await apiRequest("GET", `/api/scrape/jobs/${data.taskId}`);
      if (t.ok) setTask((await t.json()) as ScrapeJob);
    } catch (e: any) {
      setSubmitError(e?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  // 轮询当前任务进度
  useEffect(() => {
    if (!task) return;
    if (task.status === "done" || task.status === "failed") return;
    const id = window.setInterval(async () => {
      try {
        const r = await apiRequest("GET", `/api/scrape/jobs/${task.id}`);
        if (r.ok) {
          const data = (await r.json()) as ScrapeJob;
          setTask(data);
          if (data.status === "done" || data.status === "failed") {
            window.clearInterval(id);
          }
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    taskTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      taskTimerRef.current = null;
    };
  }, [task?.id, task?.status]);

  const isRunning = task && (task.status === "queued" || task.status === "running");

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">采集岗位</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            从小红书按关键词搜索招聘帖,自动整理成岗位入库
          </p>
        </div>

        {/* ========== 登录状态卡片 ========== */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-[14px] font-semibold mb-1">小红书登录状态</h2>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                由于小红书账号风控限制，线上演示环境暂不支持真实扫码登录，请直接使用下方「演示采集」体验完整流程。
                扫码登录的真机演示视频已上传：
                <a
                  href="https://b23.tv/DIFbtBO"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline underline-offset-2 ml-1"
                >
                  点击查看演示视频
                </a>
                。
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled
              data-testid="button-login-xhs"
              title="线上环境受限，请使用演示模式"
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" />
              扫码登录（已停用）
            </Button>
          </div>
        </section>

        {/* ========== 扫码弹层 ========== */}
        {loginOpen ? (
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-[14px] font-semibold">请用小红书 App 扫码</h2>
                <p className="text-[12.5px] text-muted-foreground mt-1">{hint || "加载中..."}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={closeLogin} data-testid="button-cancel-login">
                取消
              </Button>
            </div>
            <div className="rounded-md border border-border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[400px]">
              {success ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
                  <p className="mt-3 text-[14px] font-semibold">登录成功</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">凭证已保存,正在返回...</p>
                </div>
              ) : screenshot ? (
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="小红书登录页"
                  className="w-full h-auto"
                />
              ) : (
                <div className="py-12 text-center text-[12.5px] text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                  正在加载小红书页面...
                </div>
              )}
            </div>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              提示:小红书 App 右上角「+」→ 扫一扫。登录后请立即采集，浏览器会话一旦关闭就失效。
            </p>
          </section>
        ) : null}

        {/* ========== 采集面板 · 总是显示，未登录仅能用「演示模式」 ========== */}
        {true ? (
          <section className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-[14px] font-semibold mb-1">开始采集</h2>
              <p className="text-[12.5px] text-muted-foreground">
                输入关键词或点击预设,每次大约处理 30 条候选笔记,LLM 自动筛选并入库
              </p>
            </div>

            {/* 预设按钮 */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="outline"
                  onClick={() => applyPreset(p)}
                  disabled={!!isRunning}
                  data-testid={`button-preset-${p.label}`}
                  className="text-[12.5px] h-8"
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* 关键词输入 */}
            <div className="flex gap-2 items-center">
              <Input
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setKeywordList([]); }}
                placeholder="关键词，多个用加号分隔。例：产品经理招聘 + 产品内推"
                disabled={!!isRunning}
                data-testid="input-keyword"
                className="text-[13px]"
              />
              <Button
                onClick={() => startScrape("real")}
                disabled={submitting || !!isRunning || !saved?.saved}
                title={!saved?.saved ? "请先扫码登录小红书" : undefined}
                data-testid="button-start-scrape"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                )}
                开始采集
              </Button>
              <Button
                variant="outline"
                onClick={() => startScrape("demo")}
                disabled={submitting || !!isRunning}
                data-testid="button-start-scrape-demo"
                title="不调用小红书，走 mock 数据完整走一次采集流程。仅供演示。"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                演示模式
              </Button>
            </div>

            {/* 分类标识 */}
            <p className="text-[11.5px] text-muted-foreground">
              将归入分类: <span className="font-medium text-foreground">{category}</span>
              {subcategory ? <> / {subcategory}</> : null}
            </p>

            {submitError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            ) : null}

            {/* 当前任务进度 */}
            {task ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium">
                    采集中「{task.keyword}」
                  </span>
                  <span
                    className={
                      "text-[11.5px] px-2 py-0.5 rounded " +
                      (task.status === "done"
                        ? "bg-green-100 text-green-700"
                        : task.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700")
                    }
                  >
                    {task.status === "queued"
                      ? "排队中"
                      : task.status === "running"
                        ? "运行中"
                        : task.status === "done"
                          ? "已完成"
                          : "失败"}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">{task.message}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  解析 {task.total_seen} 条 · 入库 {task.total_kept} 条
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 待改进备注 */}
        <section className="mt-6 rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <div className="text-[12.5px] font-medium text-foreground mb-2">
            这个功能仍在完善中
          </div>
          <ul className="space-y-1.5 text-[11.5px] text-muted-foreground leading-relaxed">
            <li>· 广告/引流帖辨别还不够准（同一博主话术雷同、公司名模糊的伪招聘帖），需要加「博主拉黑」「话术去重」</li>
            <li>· 小红书搜索策略还可以优化：目前只取默认排序前 30 条，未按「最新发布」或「最多互动」过滤</li>
            <li>· 同一个帖反复采集时还会重复入库，还需要去重逻辑</li>
            <li>· LLM 提取 JD 原文会漏掉表格/图片里的信息（当前只抽纯文本）</li>
            <li>· 多关键词同时跑是串行，30 条 x 4 个词 ≈ 5–7 分钟，后续可以并发</li>
            <li>· 调用 LLM 是单条进入，后续可以改 batch 推理降本</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
