import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageShell } from "@/components/NavBar";
import {
  Upload,
  Mic,
  Trash2,
  AlertCircle,
  Sparkles,
  Loader2,
  Save,
  ChevronRight,
  Search,
  X,
  Pencil,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE, queryClient, apiRequest } from "@/lib/queryClient";

type Job = {
  id: number;
  company: string;
  title: string;
};

type ReviewSummary = {
  strengths: string[];
  weaknesses: string[];
  lessons: string[];
};

type Report = {
  questions: Array<{
    question: string;
    my_answer: string;
    score: number;
    comment: string;
    improvement?: string;
  }>;
  follow_ups: Array<{
    question: string;
    competency: string;
    note: string;
  }>;
  summary: ReviewSummary;
};

type Review = {
  id: number;
  job_id: number | null;
  company: string;
  title: string;
  audio_filename: string;
  interview_date: number;
  duration_sec: number;
  transcript: string;
  report_json: string;
  user_notes: string;
  status: string;
  error_message?: string;
  created_at: number;
};

const MAX_DURATION_SEC = 45 * 60; // 45 minutes

// Read the duration of an audio file in the browser. Returns -1 if unreadable.
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) ? d : -1);
    };
    audio.onerror = () => {
      cleanup();
      resolve(-1);
    };
  });
}

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

function fmtDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert ms timestamp -> 'YYYY-MM-DD' string for <input type="date">.
function toDateInput(ms: number): string {
  if (!ms || !Number.isFinite(ms)) ms = Date.now();
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert 'YYYY-MM-DD' (treated as local date) -> ms at noon local time.
// Noon avoids any midnight DST edge cases.
function fromDateInput(s: string): number {
  if (!s) return Date.now();
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function ScoreDots({ score }: { score: number }) {
  const s = Math.max(0, Math.min(5, score));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${s}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= s ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
      <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
        {s}/5
      </span>
    </span>
  );
}

export default function Interview() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const { data: reviews = [], isLoading: listLoading } = useQuery<Review[]>({
    queryKey: ["/api/interview-reviews"],
  });

  const { data: detail } = useQuery<Review>({
    queryKey: ["/api/interview-reviews", selectedId],
    enabled: selectedId !== null,
  });

  const deleteReview = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/interview-reviews/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/interview-reviews"] });
      if (selectedId === id) setSelectedId(null);
      setPendingDeleteId(null);
    },
    onError: (e: any) => {
      setError(e?.message || "删除失败，请重试");
      setPendingDeleteId(null);
    },
  });

  return (
    <PageShell>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">面试复盘</h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          上传面试录音，AI 自动转写并生成结构化复盘报告。单段录音请控制在 45 分钟以内。
        </p>
      </header>

      {error ? (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12.5px] text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold mb-1">上传面试录音</h2>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              由于线上演示环境暂不接入转录服务，录音上传暂未开放。完整的 AI 复盘报告效果请查看下方「演示复盘」——含 6 道题点评、追问能力项、优劣势总结。
            </p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground opacity-60 cursor-not-allowed"
            title="演示环境已禁用"
          >
            选择录音文件（已禁用）
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[15px] font-semibold mb-3">复盘记录</h2>
        {listLoading ? (
          <div className="text-[13px] text-muted-foreground">加载中…</div>
        ) : reviews.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-10 text-center text-[13px] text-muted-foreground">
            还没有复盘记录，上传一段面试录音开始吧
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {reviews.map((r) => (
              <li key={r.id} className="group relative">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 pr-20 text-left hover-elevate transition-colors"
                  onClick={() => setSelectedId(r.id)}
                  data-testid={`row-review-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[13.5px] font-medium truncate">
                        {r.company || r.title
                          ? `${r.company || "未填公司"}${r.title ? ` · ${r.title}` : ""}`
                          : r.audio_filename || `复盘 #${r.id}`}
                      </div>
                      {r.audio_filename === "__demo__" ? (
                        <span className="flex-shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                          演示
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {fmtDate(r.interview_date || r.created_at)} · {fmtDuration(r.duration_sec)}
                      {r.audio_filename && r.audio_filename !== "__demo__" ? ` · ${r.audio_filename}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
                <button
                  type="button"
                  className="absolute right-10 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteId(r.id);
                  }}
                  aria-label="删除复盘记录"
                  data-testid={`button-delete-row-${r.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedId !== null && detail ? (
        <ReportPanel
          review={detail}
          onClose={() => setSelectedId(null)}
          onRequestDelete={() => setPendingDeleteId(detail.id)}
        />
      ) : null}

      {pendingDeleteId !== null ? (
        <ConfirmDialog
          message="确定删除这条复盘记录吗？删除后不可恢复。"
          confirmText={deleteReview.isPending ? "删除中…" : "删除"}
          confirmDisabled={deleteReview.isPending}
          onConfirm={() => deleteReview.mutate(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      ) : null}
    </PageShell>
  );
}

function UploadPanel({
  onUploaded,
  onError,
}: {
  onUploaded: (r: Review) => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"audio" | "manual">("audio");
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mic className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[15px] font-semibold">新增复盘</h2>
      </div>

      <div className="mb-5 inline-flex rounded-md border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          className={cn(
            "px-3 py-1.5 text-[12.5px] font-medium rounded transition-colors",
            mode === "audio"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setMode("audio")}
          data-testid="tab-mode-audio"
        >
          <span className="inline-flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            上传录音
          </span>
        </button>
        <button
          type="button"
          className={cn(
            "px-3 py-1.5 text-[12.5px] font-medium rounded transition-colors",
            mode === "manual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setMode("manual")}
          data-testid="tab-mode-manual"
        >
          <span className="inline-flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            手动记录
          </span>
        </button>
      </div>

      {mode === "audio" ? (
        <AudioUploadForm jobs={jobs} onUploaded={onUploaded} onError={onError} />
      ) : (
        <ManualEntryForm jobs={jobs} onCreated={onUploaded} onError={onError} />
      )}
    </section>
  );
}

function AudioUploadForm({
  jobs,
  onUploaded,
  onError,
}: {
  jobs: Job[];
  onUploaded: (r: Review) => void;
  onError: (msg: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [interviewDate, setInterviewDate] = useState<string>(toDateInput(Date.now()));
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<string>("");

  async function handleFile(f: File) {
    onError("");
    // Basic type guard.
    const okExt = /\.(mp3|m4a|wav|aac|ogg|flac|webm)$/i.test(f.name);
    if (!okExt) {
      onError("仅支持 mp3 / m4a / wav / aac / ogg / flac / webm 格式");
      return;
    }
    const d = await readAudioDuration(f);
    if (d > 0 && d > MAX_DURATION_SEC) {
      onError(
        `录音时长 ${fmtDuration(d)}，超过 45 分钟上限，请裁剪后再上传`,
      );
      return;
    }
    setFile(f);
    setDuration(d > 0 ? d : 0);
  }

  async function submit() {
    if (!file) {
      onError("请先选择音频文件");
      return;
    }
    onError("");
    setUploading(true);

    // Chunk size: 5 MB (well under the 10 MB proxy cap, leaves headroom for form overhead).
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    try {
      // Step 1: init.
      setPhase(`准备上传 (0/${totalChunks})…`);
      const initResp = await fetch(`${API_BASE}/api/interview-reviews/upload-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          media_type: file.type || "audio/mpeg",
          total_chunks: totalChunks,
          job_id: selectedJobId ? Number(selectedJobId) : null,
          company: company.trim(),
          title: title.trim(),
          interview_date: fromDateInput(interviewDate),
        }),
      });
      if (!initResp.ok) {
        const eb = await initResp.json().catch(() => ({}));
        throw new Error(eb.message || `上传初始化失败 (${initResp.status})`);
      }
      const { upload_id: uploadId } = await initResp.json();

      // Step 2: chunks.
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const form = new FormData();
        form.append("upload_id", uploadId);
        form.append("chunk_index", String(i));
        form.append("chunk", chunkBlob, `chunk-${i}`);
        setPhase(`上传中 (${i + 1}/${totalChunks})…`);
        const chunkResp = await fetch(`${API_BASE}/api/interview-reviews/upload-chunk`, {
          method: "POST",
          body: form,
        });
        if (!chunkResp.ok) {
          const eb = await chunkResp.json().catch(() => ({}));
          throw new Error(eb.message || `分片 ${i + 1} 上传失败 (${chunkResp.status})`);
        }
      }

      // Step 3: complete — server creates a placeholder row and returns immediately;
      // transcription + analysis runs in the background. We then poll for status.
      setPhase("AI 正在转写并生成复盘报告（约需 1–5 分钟，请保持页面打开）…");
      const compResp = await fetch(`${API_BASE}/api/interview-reviews/upload-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId }),
      });
      if (!compResp.ok) {
        const eb = await compResp.json().catch(() => ({}));
        throw new Error(eb.message || `复盘生成失败 (${compResp.status})`);
      }
      const { id: reviewId } = (await compResp.json()) as { id: number; status: string };

      // Step 4: poll the detail endpoint until status flips to done or failed.
      const POLL_INTERVAL_MS = 3000;
      const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes
      const startedAt = Date.now();
      let review: Review | null = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          throw new Error("AI 处理超时（超过 15 分钟），请稍后在「复盘记录」中查看结果或重试");
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        setPhase(`AI 正在转写并生成复盘报告（已耗时 ${elapsedSec}s，请保持页面打开）…`);
        const statusResp = await fetch(`${API_BASE}/api/interview-reviews/${reviewId}`);
        if (!statusResp.ok) {
          // Transient — keep trying unless 404.
          if (statusResp.status === 404) {
            throw new Error("复盘记录已被删除");
          }
          continue;
        }
        const row = (await statusResp.json()) as Review;
        if (row.status === "done") {
          review = row;
          break;
        }
        if (row.status === "failed") {
          throw new Error(row.error_message || "AI 处理失败，请重试");
        }
        // status === 'processing' — keep polling.
      }

      queryClient.invalidateQueries({ queryKey: ["/api/interview-reviews"] });
      // Reset form.
      setFile(null);
      setDuration(0);
      setSelectedJobId("");
      setCompany("");
      setTitle("");
      setInterviewDate(toDateInput(Date.now()));
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded(review!);
    } catch (e: any) {
      onError(e?.message || "上传失败");
    } finally {
      setUploading(false);
      setPhase("");
    }
  }

  // Auto-fill company/title from selected job.
  useEffect(() => {
    if (!selectedJobId) return;
    const j = jobs.find((x) => String(x.id) === selectedJobId);
    if (j) {
      setCompany(j.company);
      setTitle(j.title);
    }
  }, [selectedJobId, jobs]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: file dropzone */}
        <div>
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            录音文件
          </label>
          <div
            className={cn(
              "rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center cursor-pointer hover-elevate transition-colors",
              file ? "border-foreground/30 bg-muted/50" : "",
            )}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-audio"
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
            {file ? (
              <>
                <div className="mt-2 text-[12.5px] font-medium truncate">
                  {file.name}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtDuration(duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-[12.5px] text-muted-foreground">
                  点击上传 mp3 / m4a / wav / aac / ogg
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  单段不超过 45 分钟
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            data-testid="input-audio-file"
          />
        </div>

        {/* Right: meta */}
        <div className="space-y-3">
          <div>
            <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
              关联岗位（选填）
            </label>
            <SearchableJobSelect
              jobs={jobs}
              value={selectedJobId}
              onChange={setSelectedJobId}
              placeholder="不关联岗位"
              allowClear
              testIdPrefix="audio"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
                公司
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="选填"
                data-testid="input-company"
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
                岗位
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="选填"
                data-testid="input-title"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
              面试时间
            </label>
            <input
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              data-testid="input-interview-date"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground flex-1">
          {uploading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {phase || "处理中…"}
            </span>
          ) : (
            <span>音频不会被保留，仅用于本次转写</span>
          )}
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3.5 py-2 text-[13px] font-medium hover-elevate disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={submit}
          disabled={!file || uploading}
          data-testid="button-submit-review"
        >
          <Sparkles className="h-3.5 w-3.5" />
          生成复盘
        </button>
      </div>
    </>
  );
}

function ManualEntryForm({
  jobs,
  onCreated,
  onError,
}: {
  jobs: Job[];
  onCreated: (r: Review) => void;
  onError: (msg: string) => void;
}) {
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [interviewDate, setInterviewDate] = useState<string>(toDateInput(Date.now()));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill company/title from selected job.
  useEffect(() => {
    if (!selectedJobId) return;
    const j = jobs.find((x) => String(x.id) === selectedJobId);
    if (j) {
      setCompany(j.company);
      setTitle(j.title);
    }
  }, [selectedJobId, jobs]);

  async function submit() {
    onError("");
    const c = company.trim();
    const t = title.trim();
    if (!c || !t) {
      onError("公司和岗位为必填项");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await apiRequest("POST", "/api/interview-reviews", {
        job_id: selectedJobId ? Number(selectedJobId) : null,
        company: c,
        title: t,
        interview_date: fromDateInput(interviewDate),
        user_notes: notes,
      });
      const created = (await resp.json()) as Review;
      queryClient.invalidateQueries({ queryKey: ["/api/interview-reviews"] });
      setSelectedJobId("");
      setCompany("");
      setTitle("");
      setInterviewDate(toDateInput(Date.now()));
      setNotes("");
      onCreated(created);
    } catch (e: any) {
      onError(e?.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            关联岗位（选填）
          </label>
          <SearchableJobSelect
            jobs={jobs}
            value={selectedJobId}
            onChange={setSelectedJobId}
            placeholder="不关联岗位"
            allowClear
            testIdPrefix="manual"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            公司 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="必填"
            data-testid="input-manual-company"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            岗位 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="必填"
            data-testid="input-manual-title"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            面试时间
          </label>
          <input
            type="date"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={interviewDate}
            onChange={(e) => setInterviewDate(e.target.value)}
            data-testid="input-manual-interview-date"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[12.5px] font-medium text-foreground mb-1.5">
            我的备注
          </label>
          <textarea
            className="w-full min-h-[140px] rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder="今天面试的过程 / 面试官问了什么 / 我的所思所想 / 下次要注意的点…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="textarea-manual-notes"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground flex-1">
          {submitting ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              保存中…
            </span>
          ) : (
            <span>手动记录不会调用 AI，保存后仍可随时编辑备注</span>
          )}
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3.5 py-2 text-[13px] font-medium hover-elevate disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={submit}
          disabled={submitting || !company.trim() || !title.trim()}
          data-testid="button-submit-manual"
        >
          <Save className="h-3.5 w-3.5" />
          保存记录
        </button>
      </div>
    </>
  );
}

function SearchableJobSelect({
  jobs,
  value,
  onChange,
  placeholder,
  allowClear,
  testIdPrefix,
}: {
  jobs: Job[];
  value: string; // job id as string, or ""
  onChange: (v: string) => void;
  placeholder: string;
  allowClear?: boolean;
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => jobs.find((j) => String(j.id) === value),
    [jobs, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.company} ${j.title}`.toLowerCase().includes(q),
    );
  }, [jobs, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testIdPrefix || ""}-select-job-trigger`}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? `${selected.company} · ${selected.title}` : placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {allowClear && selected ? (
            <span
              role="button"
              tabIndex={0}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setQuery("");
              }}
              aria-label="清除选择"
              data-testid={`${testIdPrefix || ""}-select-job-clear`}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              className="flex-1 bg-transparent text-[12.5px] focus:outline-none placeholder:text-muted-foreground"
              placeholder="输入关键词搜索公司或岗位…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid={`${testIdPrefix || ""}-select-job-search`}
            />
            {query ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
                aria-label="清除搜索词"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-[12.5px] text-muted-foreground">
                未找到匹配岗位
              </li>
            ) : (
              filtered.map((j) => {
                const isSelected = String(j.id) === value;
                return (
                  <li key={j.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-muted/60 transition-colors",
                        isSelected && "bg-muted/40",
                      )}
                      onClick={() => {
                        onChange(String(j.id));
                        setOpen(false);
                        setQuery("");
                      }}
                      data-testid={`${testIdPrefix || ""}-select-job-option-${j.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {j.company}
                        </div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {j.title}
                        </div>
                      </div>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-foreground flex-shrink-0" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ReportPanel({
  review,
  onClose,
  onRequestDelete,
}: {
  review: Review;
  onClose: () => void;
  onRequestDelete: () => void;
}) {
  const [notes, setNotes] = useState(review.user_notes || "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  // Re-sync when the review changes.
  useEffect(() => {
    setNotes(review.user_notes || "");
    setSavedAt(null);
  }, [review.id, review.user_notes]);

  const report: Report = (() => {
    try {
      return JSON.parse(review.report_json || "{}");
    } catch {
      return { questions: [], follow_ups: [], summary: { strengths: [], weaknesses: [], lessons: [] } };
    }
  })();

  // 手动记录模式：没有录音、没有转写稿 → 隐藏所有 AI 模块，只保留头部 + 我的备注
  const isManual = review.status === "manual" || !review.transcript;

  const saveNotes = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/interview-reviews/${review.id}`, { user_notes: notes });
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      queryClient.invalidateQueries({ queryKey: ["/api/interview-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interview-reviews", review.id] });
    },
  });



  return (
    <div className="mt-10 space-y-6">
      <div className="flex items-center justify-between border-t border-border pt-6">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">
            {review.company || review.title
              ? `${review.company || "未填公司"}${review.title ? ` · ${review.title}` : ""}`
              : `复盘 #${review.id}`}
          </h2>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {fmtDate(review.interview_date || review.created_at)} · {fmtDuration(review.duration_sec)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover-elevate hover:text-destructive"
            onClick={onRequestDelete}
            data-testid="button-delete-review"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
          <button
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover-elevate"
            onClick={onClose}
            data-testid="button-close-report"
          >
            收起
          </button>
        </div>
      </div>

      {/* Questions */}
      {!isManual ? (
      <section>
        <h3 className="text-[13.5px] font-semibold mb-2.5">问题清单 · 我的回答 · 评分</h3>
        {report.questions.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            未识别出明确的问答结构
          </div>
        ) : (
          <ol className="space-y-3">
            {report.questions.map((q, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="text-[13px] font-medium leading-relaxed flex-1">
                    <span className="text-muted-foreground tabular-nums mr-2">
                      Q{i + 1}.
                    </span>
                    {q.question}
                  </div>
                  <ScoreDots score={q.score} />
                </div>
                <div className="text-[12.5px] text-muted-foreground leading-relaxed mb-1.5">
                  <span className="text-foreground/70 mr-1">我的回答：</span>
                  {q.my_answer || "—"}
                </div>
                {q.comment ? (
                  <div className="text-[12.5px] leading-relaxed border-l-2 border-border pl-2.5 text-foreground/80">
                    {q.comment}
                  </div>
                ) : null}
                {q.improvement ? (
                  <div className="mt-2 rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-[11px] font-semibold text-foreground/70 mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      下次可以这样改
                    </div>
                    <div className="text-[12.5px] leading-relaxed text-foreground/85">
                      {q.improvement}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      ) : null}

      {/* Follow-ups */}
      {!isManual ? (
      <section>
        <h3 className="text-[13.5px] font-semibold mb-2.5">高频追问 · 考察能力</h3>
        {report.follow_ups.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            未识别出高频追问
          </div>
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {report.follow_ups.map((f, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                    {f.competency || "能力点"}
                  </span>
                </div>
                <div className="text-[12.5px] font-medium leading-relaxed mb-1">
                  {f.question}
                </div>
                {f.note ? (
                  <div className="text-[12px] text-muted-foreground leading-relaxed">
                    {f.note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {/* Summary */}
      {!isManual ? (
      <section>
        <h3 className="text-[13.5px] font-semibold mb-2.5">评价与经验教训</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryBlock title="亮点" items={report.summary?.strengths || []} />
          <SummaryBlock title="不足" items={report.summary?.weaknesses || []} />
          <SummaryBlock title="下次注意" items={report.summary?.lessons || []} />
        </div>
      </section>
      ) : null}

      {/* User notes */}
      <section>
        <h3 className="text-[13.5px] font-semibold mb-2.5">我的备注</h3>
        <textarea
          className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          placeholder="心情感想 / 对公司的评价 / 对面试流程的感受 / 下次需要注意的地方…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="textarea-user-notes"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11.5px] text-muted-foreground">
            {savedAt ? `已保存 · ${new Date(savedAt).toLocaleTimeString("zh-CN", { hour12: false })}` : "未保存"}
          </span>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-[12.5px] font-medium hover-elevate disabled:opacity-50 transition-colors"
            onClick={() => saveNotes.mutate()}
            disabled={saveNotes.isPending}
            data-testid="button-save-notes"
          >
            <Save className="h-3.5 w-3.5" />
            {saveNotes.isPending ? "保存中…" : "保存备注"}
          </button>
        </div>
      </section>

      {/* Transcript (collapsed by default) */}
      {!isManual ? (
      <section>
        <button
          className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowTranscript((v) => !v)}
          data-testid="button-toggle-transcript"
        >
          {showTranscript ? "收起" : "展开"}录音转写稿
        </button>
        {showTranscript ? (
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2.5 text-[12px] leading-relaxed text-foreground/85 font-sans">
            {review.transcript || "（无转写内容）"}
          </pre>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  message,
  confirmText,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmText: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
      data-testid="dialog-confirm-overlay"
    >
      <div
        className="max-w-sm w-full rounded-lg border border-border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-semibold mb-1.5">请确认</div>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-4">
          {message}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] hover-elevate"
            onClick={onCancel}
            data-testid="button-confirm-cancel"
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-[12.5px] font-medium hover-elevate disabled:opacity-50"
            onClick={onConfirm}
            disabled={confirmDisabled}
            data-testid="button-confirm-ok"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-[12px] font-semibold text-foreground/80 mb-1.5">{title}</div>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s, i) => (
            <li
              key={i}
              className="text-[12.5px] leading-relaxed text-foreground/85 pl-3 relative"
            >
              <span className="absolute left-0 top-2 h-1 w-1 rounded-full bg-foreground/40" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
