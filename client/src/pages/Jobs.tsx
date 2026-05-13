import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, API_BASE } from "@/lib/queryClient";
import { PageShell } from "@/components/NavBar";
import {
  Search,
  Settings2,
  Plus,
  Trash2,
  GripVertical,
  FolderInput,
  Pencil,
  QrCode,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import QRCodeLib from "qrcode";

type Job = {
  id: number;
  company: string;
  title: string;
  category: string;
  subcategory: string;
  location: string;
  salary_range: string;
  description: string;
  jd_raw: string;
  source: string;
  source_name: string;
  source_url: string;
  job_status: string;
  posted_at: number;
  tags: string[];
};

type CategoryItem = { key: string; label: string };
type CategoriesConfig = {
  main: CategoryItem[];
  sub: Record<string, CategoryItem[]>;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400 * 1000;
  if (diff < day) return "今天";
  const n = Math.floor(diff / day);
  return `${n} 天前`;
}

function parseSalary(s: string): number {
  const nums = s.match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
}

export default function Jobs() {
  const [loc] = useLocation();
  const queryParams = useMemo(() => {
    return new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);
  const initialCategory = queryParams.get("category") || "internet";
  const initialKeyword = queryParams.get("keyword") || "";

  const [category, setCategory] = useState<string>(initialCategory);
  const [subcat, setSubcat] = useState<string>("all");
  const [keyword, setKeyword] = useState(initialKeyword);
  const [sort, setSort] = useState<"latest" | "salary">("latest");
  const [openJob, setOpenJob] = useState<Job | null>(null);
  const [showManageCats, setShowManageCats] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"unapplied" | "applied" | "hidden">("unapplied");

  // Categories (user-editable taxonomy)
  const { data: cats } = useQuery<CategoriesConfig>({
    queryKey: ["/api/categories"],
  });

  // 当 url 上的 ?keyword 变了同步进来
  useEffect(() => {
    const k = queryParams.get("keyword");
    if (k !== null) setKeyword(k);
    const c = queryParams.get("category");
    if (c) setCategory(c);
  }, [queryParams]);

  // 切大类时,重置二级 tab
  useEffect(() => {
    setSubcat("all");
  }, [category]);

  // If the current category was deleted via the manage dialog, fall back to the first available.
  useEffect(() => {
    if (!cats?.main) return;
    if (!cats.main.find((m) => m.key === category)) {
      setCategory(cats.main[0]?.key || "internet");
    }
  }, [cats, category]);

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs", category, statusFilter],
    queryFn: async () => {
      const includeHidden = statusFilter === "hidden" ? "&include_hidden=1" : "";
      const res = await fetch(`${API_BASE}/api/jobs?category=${category}${includeHidden}`);
      if (!res.ok) throw new Error("加载失败");
      return res.json();
    },
  });

  const markAppliedMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/mark-applied`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
    },
  });

  const hideJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, { job_status: "hidden" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const restoreJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, { job_status: "new" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("DELETE", `/api/jobs/${jobId}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const [editJob, setEditJob] = useState<Job | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 弹窗互斥：同一时间只允许一个弹窗，避免叠加错位
  const openDetail = (j: Job | null) => {
    setShowManualForm(false);
    setShowManageCats(false);
    setEditJob(null);
    setOpenJob(j);
  };
  const openEdit = (j: Job | null) => {
    setShowManualForm(false);
    setShowManageCats(false);
    setOpenJob(null);
    setEditJob(j);
  };
  const openManualForm = (v: boolean) => {
    if (v) {
      setShowManageCats(false);
      setOpenJob(null);
      setEditJob(null);
    }
    setShowManualForm(v);
  };
  const openManageCats = (v: boolean) => {
    if (v) {
      setShowManualForm(false);
      setOpenJob(null);
      setEditJob(null);
    }
    setShowManageCats(v);
  };

  const subTabs = useMemo<CategoryItem[]>(() => {
    return cats?.sub?.[category] || [];
  }, [cats, category]);

  const filtered = useMemo(() => {
    let list = jobs;
    // 状态过滤：unapplied = 仅未投；applied = 仅已投递；hidden = 仅已隐藏
    if (statusFilter === "unapplied") {
      list = list.filter((j) => j.job_status !== "hidden" && j.job_status !== "applied");
    } else if (statusFilter === "applied") {
      list = list.filter((j) => j.job_status === "applied");
    } else if (statusFilter === "hidden") {
      list = list.filter((j) => j.job_status === "hidden");
    }
    if (subTabs.length > 0 && subcat !== "all") {
      list = list.filter((j) => j.subcategory === subcat);
    }
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.company.toLowerCase().includes(k) ||
          j.title.toLowerCase().includes(k) ||
          j.description.toLowerCase().includes(k) ||
          (j.tags || []).some((t) => t.toLowerCase().includes(k)),
      );
    }
    if (sort === "latest") {
      list = [...list].sort((a, b) => b.posted_at - a.posted_at);
    } else {
      list = [...list].sort(
        (a, b) => parseSalary(b.salary_range) - parseSalary(a.salary_range),
      );
    }
    return list;
  }, [jobs, keyword, sort, subcat, subTabs, statusFilter]);

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">岗位</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openManualForm(true)}
            data-testid="button-add-manual-job"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover-elevate hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            手动录入岗位
          </button>
          <button
            onClick={() => openManageCats(true)}
            data-testid="button-manage-categories"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover-elevate hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            分类管理
          </button>
          <div className="text-[12.5px] text-muted-foreground">
            共 <span className="text-foreground font-medium">{filtered.length}</span> 个岗位
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-1">
          {(cats?.main || []).map((t) => (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => setCategory(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium hover-elevate",
                category === t.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="input-search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索公司、岗位、关键词"
              className="w-64 rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </div>
          <select
            data-testid="select-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as "latest" | "salary")}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          >
            <option value="latest">最新发布</option>
            <option value="salary">薪资从高到低</option>
          </select>
        </div>
      </div>

      {/* 二级 tab —— 当该大类配置了二级分类时才显示 */}
      {subTabs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="mr-2 text-[12px] text-muted-foreground">子方向</span>
          <button
            data-testid="subtab-all"
            onClick={() => setSubcat("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] hover-elevate transition-colors",
              subcat === "all"
                ? "border-foreground/40 bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            全部
          </button>
          {subTabs.map((s) => (
            <button
              key={s.key}
              data-testid={`subtab-${s.key}`}
              onClick={() => setSubcat(s.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] hover-elevate transition-colors",
                subcat === s.key
                  ? "border-foreground/40 bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 状态过滤 */}
      <div className="mt-3 flex items-center gap-1">
        <span className="mr-2 text-[12px] text-muted-foreground">状态</span>
        {([
          { key: "unapplied", label: "未投递" },
          { key: "applied", label: "已投递" },
          { key: "hidden", label: "已隐藏" },
        ] as const).map((s) => (
          <button
            key={s.key}
            data-testid={`status-tab-${s.key}`}
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] hover-elevate transition-colors",
              statusFilter === s.key
                ? "border-foreground/40 bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-40 rounded-lg border border-border bg-muted/30 animate-pulse"
              />
            ))
          : filtered.map((j) => (
              <article
                key={j.id}
                data-testid={`card-job-${j.id}`}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] text-muted-foreground">{j.company}</div>
                    <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight">
                      {j.title}
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground whitespace-nowrap">
                      {j.source === "manual" ? "手动录入" : "来自小红书"}
                    </span>
                    {j.job_status === "applied" && (
                      <span className="rounded border border-foreground/30 bg-secondary px-1.5 py-0.5 text-[10.5px] text-foreground whitespace-nowrap">
                        已投递
                      </span>
                    )}
                    {j.job_status === "hidden" && (
                      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground whitespace-nowrap">
                        已隐藏
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                  <span>{j.location}</span>
                  <span className="text-foreground/70">·</span>
                  <span>{j.salary_range}</span>
                  <span className="text-foreground/70">·</span>
                  <span>{timeAgo(j.posted_at)}</span>
                </div>
                <p
                  className="mt-3 text-[13px] leading-relaxed text-muted-foreground"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {stripMarkdownImages(j.description)}
                </p>
                {j.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {j.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    data-testid={`button-detail-${j.id}`}
                    onClick={() => openDetail(j)}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium hover-elevate"
                  >
                    查看详情
                  </button>
                  {j.job_status === "applied" ? (
                    <Link
                      href="/dashboard"
                      data-testid={`button-view-application-${j.id}`}
                      className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover-elevate active-elevate"
                    >
                      查看投递
                    </Link>
                  ) : (
                    <Link
                      href={`/resume?job_id=${j.id}`}
                      data-testid={`button-optimize-${j.id}`}
                      className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover-elevate active-elevate"
                    >
                      优化简历投递
                    </Link>
                  )}
                  {j.job_status !== "applied" && j.job_status !== "hidden" && (
                    <button
                      data-testid={`button-mark-applied-${j.id}`}
                      onClick={() => markAppliedMutation.mutate(j.id)}
                      disabled={markAppliedMutation.isPending}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover-elevate hover:text-foreground"
                    >
                      标记已投递
                    </button>
                  )}
                  {j.job_status !== "hidden" ? (
                    <button
                      data-testid={`button-hide-${j.id}`}
                      onClick={() => hideJobMutation.mutate(j.id)}
                      disabled={hideJobMutation.isPending}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover-elevate hover:text-foreground"
                    >
                      不感兴趣
                    </button>
                  ) : (
                    <button
                      data-testid={`button-restore-${j.id}`}
                      onClick={() => restoreJobMutation.mutate(j.id)}
                      disabled={restoreJobMutation.isPending}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover-elevate hover:text-foreground"
                    >
                      恢复显示
                    </button>
                  )}
                  <button
                    data-testid={`button-edit-${j.id}`}
                    onClick={() => openEdit(j)}
                    title="编辑"
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground hover-elevate hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {confirmDeleteId === j.id ? (
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-2 py-1">
                      <span className="text-[11.5px] text-muted-foreground">确认删除？</span>
                      <button
                        data-testid={`button-delete-confirm-${j.id}`}
                        onClick={() => {
                          deleteJobMutation.mutate(j.id);
                          setConfirmDeleteId(null);
                        }}
                        className="text-[11.5px] font-medium text-destructive hover:underline"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[11.5px] text-muted-foreground hover:underline"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      data-testid={`button-delete-${j.id}`}
                      onClick={() => setConfirmDeleteId(j.id)}
                      title="删除"
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground hover-elevate hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </article>
            ))}
        {!isLoading && filtered.length === 0 && (
          <div className="md:col-span-2 rounded-lg border border-dashed border-border p-12 text-center text-[13px] text-muted-foreground">
            没找到匹配的岗位，试着换个关键词或切换子方向
          </div>
        )}
      </div>

      {openJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 px-4"
          onClick={() => setOpenJob(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            data-testid="dialog-job-detail"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12.5px] text-muted-foreground">{openJob.company}</div>
                <h2 className="mt-1 text-[18px] font-semibold tracking-tight">
                  {openJob.title}
                </h2>
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  {openJob.location} · {openJob.salary_range} · 发布于 {timeAgo(openJob.posted_at)}
                </div>
              </div>
              <button
                onClick={() => setOpenJob(null)}
                className="rounded-md border border-border px-2.5 py-1 text-[12px] hover-elevate"
              >
                关闭
              </button>
            </div>
            {/* 总结：总是展示，作为快读上下文 */}
            <div className="mt-5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
              <JobDescription text={openJob.description} />
            </div>

            {/* JD 原文：如果有原帖完整 JD 就展示，带小标题 */}
            {openJob.jd_raw && openJob.jd_raw.trim() && (
              <div className="mt-6" data-testid="panel-jd-raw">
                <div className="mb-2 text-[12px] font-medium text-muted-foreground">
                  JD 原文
                </div>
                <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-[13px] leading-relaxed text-foreground">
                  <JobDescription text={openJob.jd_raw} />
                </div>
              </div>
            )}

            {openJob.source === "xhs" && openJob.source_url && (
              <OriginalPostQRPanel url={openJob.source_url} />
            )}

            {cats && (
              <MoveJobPanel
                job={openJob}
                cats={cats}
                onMoved={(updated) => setOpenJob(updated)}
              />
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Link
                href={`/resume?job_id=${openJob.id}`}
                data-testid="button-detail-optimize"
                className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover-elevate active-elevate"
              >
                用 AI 优化简历再投
              </Link>
            </div>
          </div>
        </div>
      )}

      {showManageCats && cats && (
        <ManageCategoriesDialog
          initial={cats}
          onClose={() => setShowManageCats(false)}
        />
      )}

      {showManualForm && cats && (
        <ManualJobDialog
          cats={cats}
          defaultCategory={category}
          onClose={() => setShowManualForm(false)}
        />
      )}

      {editJob && cats && (
        <EditJobDialog
          job={editJob}
          cats={cats}
          onClose={() => setEditJob(null)}
        />
      )}
    </PageShell>
  );
}

/* ===================== Job Description (支持嵌入图片 markdown) ===================== */

/**
 * description 里我们会存如 "岗位说明...\n![](/uploads/jd-images/xxx.png)" 这种格式。
 * 这个组件把文本按行处理，遇到 ![](url) 就渲染为图片。
 */
// 在列表卡片里预览 description：把 markdown 图片语法替换为「···」占位，其他字符原样保留
export function stripMarkdownImages(text: string): string {
  if (!text) return "";
  return text.replace(/!\[[^\]]*\]\([^)]+\)/g, "【图】").trim();
}

function JobDescription({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground">暂无详细描述</span>;
  // 拆分出 markdown 图片
  const parts: Array<{ type: "text" | "image"; value: string }> = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "image", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return (
    <>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <img
            key={i}
            src={p.value.startsWith("http") ? p.value : `${API_BASE}${p.value}`}
            alt="JD 图片"
            loading="lazy"
            decoding="async"
            className="my-3 max-w-full rounded-md border border-border bg-muted/30"
            style={{ minHeight: 80 }}
          />
        ),
      )}
    </>
  );
}

/* ===================== 原帖二维码面板 ===================== */

function OriginalPostQRPanel({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    QRCodeLib.toDataURL(url, { margin: 1, width: 220 })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);
  return (
    <div
      className="mt-5 rounded-md border border-border bg-muted/30 p-4"
      data-testid="panel-original-qr"
    >
      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
        扫码看小红书原帖
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground leading-relaxed">
        招聘帖的投递邮箱、微信号、饱表链接等信息通常在原帖正文或评论里。用手机扫下面二维码，会跳转到小红书 App 打开该帖。
      </p>
      <div className="flex items-center gap-4">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="小红书原帖二维码"
            className="h-[180px] w-[180px] rounded-md border border-border bg-white p-1"
            data-testid="img-qr-code"
          />
        ) : (
          <div className="h-[180px] w-[180px] rounded-md border border-dashed border-border bg-background flex items-center justify-center text-[11px] text-muted-foreground">
            生成中…
          </div>
        )}
        <div className="flex-1 text-[11px] text-muted-foreground break-all">
          {url}
        </div>
      </div>
    </div>
  );
}

/* ===================== JD 编辑区（支持拖拽 / 粘贴图片） ===================== */

function JdEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("仅支持图片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("图片不能超过 10MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/uploads/jd-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `上传失败 (${res.status})`);
      }
      const j = await res.json();
      const md = `\n![](${j.url})\n`;
      // 插入到光标位置
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = value.slice(0, start) + md + value.slice(end);
        onChange(next);
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + md.length;
        }, 0);
      } else {
        onChange(value + md);
      }
    } catch (e: any) {
      setErr(e?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === "file" && it.type.startsWith("image/")) {
              const file = it.getAsFile();
              if (file) {
                e.preventDefault();
                uploadFile(file);
                return;
              }
            }
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          if (file) {
            e.preventDefault();
            uploadFile(file);
          }
        }}
        rows={6}
        data-testid="input-jd-description"
        placeholder="粘贴岗位描述、职责、要求…可拖拽或 Ctrl+V 粘贴截图"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
          <ImagePlus className="h-3.5 w-3.5" />
          {uploading ? "上传中…" : "上传图片"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="input-upload-jd-image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {err && <span className="text-[11.5px] text-destructive">{err}</span>}
        {!err && (
          <span className="text-[10.5px] text-muted-foreground/70">
            支持拖拽 / 粘贴截图
          </span>
        )}
      </div>
    </div>
  );
}

/* ===================== Edit Job Dialog ===================== */

function EditJobDialog({
  job,
  cats,
  onClose,
}: {
  job: Job;
  cats: CategoriesConfig;
  onClose: () => void;
}) {
  const [company, setCompany] = useState(job.company);
  const [title, setTitle] = useState(job.title);
  const [mainKey, setMainKey] = useState(job.category);
  const [subKey, setSubKey] = useState(job.subcategory || "");
  const [location, setLocation] = useState(job.location || "");
  const [salary, setSalary] = useState(job.salary_range || "");
  const [description, setDescription] = useState(job.description || "");
  const [tagsRaw, setTagsRaw] = useState((job.tags || []).join(", "));
  const [err, setErr] = useState<string | null>(null);

  const availableSubs = cats.sub?.[mainKey] || [];
  useEffect(() => {
    if (subKey && !availableSubs.find((s) => s.key === subKey)) setSubKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKey]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const tags = tagsRaw
        .split(/[,、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await apiRequest("PATCH", `/api/jobs/${job.id}`, {
        company: company.trim(),
        title: title.trim(),
        category: mainKey,
        subcategory: subKey,
        location: location.trim(),
        salary_range: salary.trim(),
        description,
        tags,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "保存失败"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-edit-job"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">编辑岗位</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              修改完包括在详情页和列表都会同步生效
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] hover-elevate"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">公司</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              data-testid="input-edit-company"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">岗位名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-edit-title"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">大类</span>
            <select
              value={mainKey}
              onChange={(e) => setMainKey(e.target.value)}
              data-testid="select-edit-main"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            >
              {cats.main.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">二级分类</span>
            <select
              value={subKey}
              onChange={(e) => setSubKey(e.target.value)}
              disabled={availableSubs.length === 0}
              data-testid="select-edit-sub"
              className={cn(
                "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30",
                availableSubs.length === 0 && "opacity-60",
              )}
            >
              <option value="">未分类</option>
              {availableSubs.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">地点</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="input-edit-location"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">薪资范围</span>
            <input
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              data-testid="input-edit-salary"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">JD / 描述</span>
          <JdEditor value={description} onChange={setDescription} />
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">标签（逗号或空格分隔）</span>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            data-testid="input-edit-tags"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          />
        </label>

        {err && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {err}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] hover-elevate"
          >
            取消
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-edit-job"
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
          >
            {saveMutation.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Manual Job Dialog ===================== */

function ManualJobDialog({
  cats,
  defaultCategory,
  onClose,
}: {
  cats: CategoriesConfig;
  defaultCategory: string;
  onClose: () => void;
}) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [mainKey, setMainKey] = useState(defaultCategory);
  const [subKey, setSubKey] = useState("");
  const [location, setLocation] = useState("");
  const [salary, setSalary] = useState("");
  const [description, setDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const availableSubs = cats.sub?.[mainKey] || [];

  useEffect(() => {
    if (subKey && !availableSubs.find((s) => s.key === subKey)) {
      setSubKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKey]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const tags = tagsRaw
        .split(/[,、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await apiRequest("POST", "/api/jobs/manual", {
        company: company.trim(),
        title: title.trim(),
        category: mainKey,
        subcategory: subKey,
        location: location.trim(),
        salary_range: salary.trim(),
        description: description.trim(),
        tags,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "保存失败"),
  });

  const onSubmit = () => {
    setErr(null);
    if (!company.trim() || !title.trim()) {
      setErr("公司和岗位名称必填");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-manual-job"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">手动录入岗位</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              适合从官网、职位社群、朋友推荐的岗位·保存后会在列表顶部出现
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] hover-elevate"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">公司 *</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              data-testid="input-manual-company"
              placeholder="例：小红书"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">岗位名称 *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-manual-title"
              placeholder="例：高级产品经理"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">大类</span>
            <select
              value={mainKey}
              onChange={(e) => setMainKey(e.target.value)}
              data-testid="select-manual-main"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            >
              {cats.main.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">二级分类</span>
            <select
              value={subKey}
              onChange={(e) => setSubKey(e.target.value)}
              disabled={availableSubs.length === 0}
              data-testid="select-manual-sub"
              className={cn(
                "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30",
                availableSubs.length === 0 && "opacity-60",
              )}
            >
              <option value="">未分类</option>
              {availableSubs.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">地点</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              data-testid="input-manual-location"
              placeholder="例：上海"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-muted-foreground">薪资范围</span>
            <input
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              data-testid="input-manual-salary"
              placeholder="例：25-40K×15"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">JD / 描述</span>
          <JdEditor value={description} onChange={setDescription} />
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">标签（逗号或空格分隔）</span>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            data-testid="input-manual-tags"
            placeholder="例：社区, 增长, AI"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          />
        </label>

        {err && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {err}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] hover-elevate"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={createMutation.isPending}
            data-testid="button-save-manual-job"
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
          >
            {createMutation.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Manage Categories Dialog ===================== */

function slugify(label: string): string {
  // Generate a slug-safe key from a Chinese / mixed label.
  // Strategy: lowercase ASCII pass-through; everything else replaced with
  // a hash of timestamp + char code. We don't need locale-correct slugs,
  // we just need a stable unique alphanumeric key.
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 16);
  if (base) return base;
  return `c${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1000)}`;
}

function ManageCategoriesDialog({
  initial,
  onClose,
}: {
  initial: CategoriesConfig;
  onClose: () => void;
}) {
  const [main, setMain] = useState<CategoryItem[]>(initial.main.map((m) => ({ ...m })));
  const [sub, setSub] = useState<Record<string, CategoryItem[]>>(
    Object.fromEntries(
      Object.entries(initial.sub || {}).map(([k, v]) => [k, v.map((x) => ({ ...x }))]),
    ),
  );
  const [activeMain, setActiveMain] = useState<string>(initial.main[0]?.key || "");
  const [newMainLabel, setNewMainLabel] = useState("");
  const [newSubLabel, setNewSubLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: CategoriesConfig) => {
      const res = await apiRequest("PUT", "/api/categories", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "保存失败"),
  });

  const addMain = () => {
    const label = newMainLabel.trim();
    if (!label) return;
    let key = slugify(label);
    // ensure unique
    const taken = new Set(main.map((m) => m.key));
    while (taken.has(key)) key = `${key}_${Math.floor(Math.random() * 100)}`;
    setMain([...main, { key, label }]);
    setSub({ ...sub, [key]: [] });
    setActiveMain(key);
    setNewMainLabel("");
  };

  const renameMain = (key: string, label: string) => {
    setMain(main.map((m) => (m.key === key ? { ...m, label } : m)));
  };

  const removeMain = (key: string) => {
    if (!confirm(`删除大类「${main.find((m) => m.key === key)?.label}」？\n该大类下已存在的岗位仍保留在数据库中，只是前端不再展示该 tab。`)) {
      return;
    }
    const nextMain = main.filter((m) => m.key !== key);
    const nextSub = { ...sub };
    delete nextSub[key];
    setMain(nextMain);
    setSub(nextSub);
    if (activeMain === key) setActiveMain(nextMain[0]?.key || "");
  };

  const moveMain = (key: string, dir: -1 | 1) => {
    const idx = main.findIndex((m) => m.key === key);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= main.length) return;
    const next = [...main];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setMain(next);
  };

  const addSub = () => {
    if (!activeMain) return;
    const label = newSubLabel.trim();
    if (!label) return;
    let key = slugify(label);
    const taken = new Set((sub[activeMain] || []).map((s) => s.key));
    while (taken.has(key)) key = `${key}_${Math.floor(Math.random() * 100)}`;
    setSub({
      ...sub,
      [activeMain]: [...(sub[activeMain] || []), { key, label }],
    });
    setNewSubLabel("");
  };

  const renameSub = (subKey: string, label: string) => {
    setSub({
      ...sub,
      [activeMain]: (sub[activeMain] || []).map((s) =>
        s.key === subKey ? { ...s, label } : s,
      ),
    });
  };

  const removeSub = (subKey: string) => {
    setSub({
      ...sub,
      [activeMain]: (sub[activeMain] || []).filter((s) => s.key !== subKey),
    });
  };

  const moveSub = (subKey: string, dir: -1 | 1) => {
    const arr = sub[activeMain] || [];
    const idx = arr.findIndex((s) => s.key === subKey);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    const next = [...arr];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSub({ ...sub, [activeMain]: next });
  };

  const onSave = () => {
    setErr(null);
    if (main.length === 0) {
      setErr("至少保留一个大类");
      return;
    }
    saveMutation.mutate({ main, sub });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-manage-categories"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight">分类管理</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              管理首页和岗位页的大类与二级分类 · 修改后立即生效
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2.5 py-1 text-[12px] hover-elevate"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* ============ Main categories ============ */}
          <section>
            <div className="mb-2 text-[12.5px] font-medium text-foreground">大类</div>
            <ul className="space-y-1.5">
              {main.map((m, i) => (
                <li
                  key={m.key}
                  data-testid={`row-main-${m.key}`}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors",
                    activeMain === m.key
                      ? "border-foreground/30 bg-secondary"
                      : "border-border bg-background",
                  )}
                >
                  <button
                    onClick={() => setActiveMain(m.key)}
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    title="选中以编辑二级分类"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <input
                    value={m.label}
                    onChange={(e) => renameMain(m.key, e.target.value)}
                    onFocus={() => setActiveMain(m.key)}
                    data-testid={`input-main-label-${m.key}`}
                    className="flex-1 bg-transparent text-[13px] outline-none"
                  />
                  <span className="text-[10.5px] text-muted-foreground/60">{m.key}</span>
                  <button
                    onClick={() => moveMain(m.key, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveMain(m.key, 1)}
                    disabled={i === main.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeMain(m.key)}
                    data-testid={`button-remove-main-${m.key}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={newMainLabel}
                onChange={(e) => setNewMainLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMain()}
                placeholder="新大类名称（例如：海外）"
                data-testid="input-new-main"
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
              />
              <button
                onClick={addMain}
                data-testid="button-add-main"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] hover-elevate"
              >
                <Plus className="h-3.5 w-3.5" />
                新增
              </button>
            </div>
          </section>

          {/* ============ Sub categories ============ */}
          <section>
            <div className="mb-2 text-[12.5px] font-medium text-foreground">
              二级分类
              {activeMain && (
                <span className="ml-2 text-[11.5px] text-muted-foreground">
                  · 当前编辑：{main.find((m) => m.key === activeMain)?.label || activeMain}
                </span>
              )}
            </div>
            {activeMain ? (
              <>
                <ul className="space-y-1.5">
                  {(sub[activeMain] || []).map((s, i) => (
                    <li
                      key={s.key}
                      data-testid={`row-sub-${s.key}`}
                      className="group flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={s.label}
                        onChange={(e) => renameSub(s.key, e.target.value)}
                        data-testid={`input-sub-label-${s.key}`}
                        className="flex-1 bg-transparent text-[13px] outline-none"
                      />
                      <span className="text-[10.5px] text-muted-foreground/60">{s.key}</span>
                      <button
                        onClick={() => moveSub(s.key, -1)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSub(s.key, 1)}
                        disabled={i === (sub[activeMain] || []).length - 1}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="下移"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeSub(s.key)}
                        data-testid={`button-remove-sub-${s.key}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                  {(sub[activeMain] || []).length === 0 && (
                    <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-muted-foreground">
                      该大类还没有二级分类
                    </li>
                  )}
                </ul>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newSubLabel}
                    onChange={(e) => setNewSubLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSub()}
                    placeholder="新二级分类名称（例如：增长）"
                    data-testid="input-new-sub"
                    className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
                  />
                  <button
                    onClick={addSub}
                    data-testid="button-add-sub"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] hover-elevate"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                先在左侧选中或新增一个大类
              </div>
            )}
          </section>
        </div>

        {err && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {err}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] hover-elevate"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-categories"
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
          >
            {saveMutation.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Move Job (change category) panel ===================== */

function MoveJobPanel({
  job,
  cats,
  onMoved,
}: {
  job: Job;
  cats: CategoriesConfig;
  onMoved: (updated: Job) => void;
}) {
  const [mainKey, setMainKey] = useState<string>(job.category);
  const [subKey, setSubKey] = useState<string>(job.subcategory || "");
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 当 job 变了（用户在详情里切了另一条）同步进来
  useEffect(() => {
    setMainKey(job.category);
    setSubKey(job.subcategory || "");
    setErr(null);
    setSavedAt(null);
  }, [job.id, job.category, job.subcategory]);

  // 当切大类时，如果原 subKey 在新大类下不存在，重置为未分类
  useEffect(() => {
    const subs = cats.sub?.[mainKey] || [];
    if (subKey && !subs.find((s) => s.key === subKey)) {
      setSubKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKey]);

  const availableSubs = cats.sub?.[mainKey] || [];
  const dirty = mainKey !== job.category || (subKey || "") !== (job.subcategory || "");

  const moveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/jobs/${job.id}`, {
        category: mainKey,
        subcategory: subKey || "",
      });
      return res.json() as Promise<Job>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setErr(null);
      setSavedAt(Date.now());
      onMoved(updated);
    },
    onError: (e: any) => setErr(e?.message || "保存失败"),
  });

  return (
    <div className="mt-5 rounded-md border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
        移动到其他分类
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">大类</span>
          <select
            data-testid="select-move-main"
            value={mainKey}
            onChange={(e) => setMainKey(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          >
            {cats.main.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted-foreground">二级分类</span>
          <select
            data-testid="select-move-sub"
            value={subKey}
            onChange={(e) => setSubKey(e.target.value)}
            disabled={availableSubs.length === 0}
            className={cn(
              "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30",
              availableSubs.length === 0 && "opacity-60",
            )}
          >
            <option value="">未分类</option>
            {availableSubs.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[11.5px] text-muted-foreground">
          {availableSubs.length === 0 && "该大类还没有二级分类。"}
          {err && <span className="text-destructive">{err}</span>}
          {!err && savedAt && !dirty && <span className="text-foreground/70">已保存</span>}
        </div>
        <button
          onClick={() => moveMutation.mutate()}
          disabled={!dirty || moveMutation.isPending}
          data-testid="button-move-job"
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover-elevate active-elevate",
            (!dirty || moveMutation.isPending) && "cursor-not-allowed opacity-50",
          )}
        >
          {moveMutation.isPending ? "保存中…" : "保存移动"}
        </button>
      </div>
    </div>
  );
}

/* ===================== Job-linked Interview Reviews ===================== */

type JobReview = {
  id: number;
  audio_filename: string;
  duration_sec: number;
  created_at: number;
};

function JobInterviewReviewsPanel({ jobId }: { jobId: number }) {
  const { data: reviews = [], isLoading } = useQuery<JobReview[]>({
    queryKey: ["/api/interview-reviews", { job_id: jobId }],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/interview-reviews?job_id=${jobId}`);
      if (!res.ok) throw new Error("加载复盘记录失败");
      return res.json();
    },
  });

  return (
    <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12.5px] font-semibold">面试复盘记录</div>
        <Link
          href="/interview"
          className="text-[11.5px] text-muted-foreground hover:text-foreground"
          data-testid="link-go-interview"
        >
          去复盘 →
        </Link>
      </div>
      {isLoading ? (
        <div className="text-[12px] text-muted-foreground">加载中…</div>
      ) : reviews.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">
          还没有关联复盘记录。可在「面试复盘」中上传录音并选择本岗位关联。
        </div>
      ) : (
        <ul className="space-y-1.5">
          {reviews.map((r) => {
            const d = new Date(r.created_at);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const m = Math.floor(r.duration_sec / 60);
            const s = Math.round(r.duration_sec % 60);
            return (
              <li key={r.id} className="flex items-center justify-between text-[12.5px]">
                <span className="truncate">
                  <span className="text-muted-foreground tabular-nums mr-2">{dateStr}</span>
                  {r.audio_filename || `复盘 #${r.id}`}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {r.duration_sec > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
