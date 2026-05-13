import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageShell } from "@/components/NavBar";
import { Plus, X, Pencil, Trash2, LayoutGrid, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Search, List, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

type ApplicationEvent = {
  at: number;
  kind: "created" | "status" | "note";
  from?: string;
  to?: string;
  note?: string;
};

type Application = {
  id: number;
  job_id: number | null;
  company: string;
  title: string;
  applied_at: number;
  status: string;
  notes: string;
  jd_url: string;
  events?: string;
};

function parseEvents(raw: string | undefined): ApplicationEvent[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function fmtDateTime(ts: number) {
  // 时间线只精到天，不带时分（用户反馈可读性更好）
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const columns: { key: string; label: string }[] = [
  { key: "applied", label: "已投递" },
  { key: "interviewing", label: "笔试 / 面试中" },
  { key: "offer", label: "已 Offer" },
  { key: "rejected", label: "已拒" },
  { key: "withdrawn", label: "已放弃" },
];

function fmt(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Card({
  app,
  onClick,
  onQuickDelete,
  dragging = false,
}: {
  app: Application;
  onClick?: () => void;
  onQuickDelete?: (id: number) => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `app-${app.id}`,
    data: { app },
  });
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      data-testid={`card-app-${app.id}`}
      className={cn(
        "group relative cursor-grab rounded-md border border-border bg-card p-3 text-left shadow-sm transition-opacity hover:border-foreground/30",
        isDragging && !dragging && "opacity-30",
      )}
    >
      {onQuickDelete && !dragging && (
        <div
          className="absolute right-1.5 top-1.5 z-10"
          // 阻断拖拽传感器；让删除按钮独立
          onPointerDownCapture={(e) => e.stopPropagation()}
          onMouseDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {confirmDel ? (
            <div className="flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-1.5 py-0.5 shadow-sm">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickDelete(app.id);
                }}
                data-testid={`button-quick-delete-confirm-${app.id}`}
                className="text-[10.5px] font-medium text-destructive hover:underline"
              >
                确认删除
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(false);
                }}
                className="text-[10.5px] text-muted-foreground hover:underline"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDel(true);
              }}
              data-testid={`button-quick-delete-${app.id}`}
              aria-label="删除"
              className="hidden h-5 w-5 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:border-destructive/40 hover:text-destructive group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <div className="text-[12px] text-muted-foreground pr-6">{app.company}</div>
      <div className="mt-0.5 text-[13.5px] font-medium leading-snug">{app.title}</div>
      <div className="mt-2 text-[11.5px] text-muted-foreground">
        投递于 {fmt(app.applied_at)}
      </div>
      {app.notes && (
        <div
          className="mt-1.5 text-[11.5px] text-muted-foreground"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {app.notes}
        </div>
      )}
    </div>
  );
}

function Column({
  col,
  items,
  onCardClick,
  onQuickDelete,
}: {
  col: { key: string; label: string };
  items: Application[];
  onCardClick: (a: Application) => void;
  onQuickDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${col.key}`}
      className={cn(
        "flex flex-col rounded-lg border bg-muted/20 p-3 transition-colors",
        isOver ? "border-foreground/40 bg-secondary" : "border-border",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[12.5px] font-medium tracking-tight">{col.label}</span>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[60px]">
        {items.map((a) => (
          <Card
            key={a.id}
            app={a}
            onClick={() => onCardClick(a)}
            onQuickDelete={onQuickDelete}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-[11.5px] text-muted-foreground">
            把卡片拖到这里
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tracking-tight">{value}</div>
    </div>
  );
}

type ViewMode = "board" | "list" | "calendar";

export default function Dashboard() {
  const { data: apps = [] } = useQuery<Application[]>({ queryKey: ["/api/applications"] });
  const [active, setActive] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [view, setView] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.company.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        (a.notes || "").toLowerCase().includes(q)
      );
    });
  }, [apps, search, statusFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, Application[]> = {};
    for (const c of columns) map[c.key] = [];
    for (const a of filteredApps) {
      if (!map[a.status]) map[a.status] = [];
      map[a.status].push(a);
    }
    return map;
  }, [filteredApps]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const updateStatus = useMutation({
    mutationFn: async (vars: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/applications/${vars.id}`, { status: vars.status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/applications"] }),
  });

  const updateApp = useMutation({
    mutationFn: async (vars: { id: number; data: Partial<Application> }) => {
      await apiRequest("PATCH", `/api/applications/${vars.id}`, vars.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const createApp = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/applications`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowForm(false);
    },
  });

  const deleteApp = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/applications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setEditing(null);
    },
  });

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { app: Application } | undefined;
    if (data?.app) setActive(data.app);
  }
  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    if (!e.over) return;
    const colKey = String(e.over.id);
    const data = e.active.data.current as { app: Application } | undefined;
    if (!data?.app) return;
    if (data.app.status === colKey) return;
    updateStatus.mutate({ id: data.app.id, status: colKey });
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">投递看板</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            拖动卡片可以更新状态，点击卡片可以编辑备注
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          data-testid="button-add"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
        >
          <Plus className="h-3.5 w-3.5" />
          添加投递记录
        </button>
      </div>

      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="总投递" value={apps.length} />
        <StatCard
          label="面试中"
          value={apps.filter((a) => a.status === "interviewing").length}
        />
        <StatCard label="Offer" value={apps.filter((a) => a.status === "offer").length} />
        <StatCard
          label="被拒"
          value={apps.filter((a) => a.status === "rejected").length}
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5" data-testid="view-switcher">
          <button
            onClick={() => setView("board")}
            data-testid="tab-board"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-[12.5px] font-medium hover-elevate",
              view === "board" ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            看板
          </button>
          <button
            onClick={() => setView("list")}
            data-testid="tab-list"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-[12.5px] font-medium hover-elevate",
              view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" />
            列表
          </button>
          <button
            onClick={() => setView("calendar")}
            data-testid="tab-calendar"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-[12.5px] font-medium hover-elevate",
              view === "calendar" ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            日历
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
            placeholder="搜公司 / 岗位 / 备注…"
            className="w-full rounded-md border border-border bg-card pl-7 pr-7 py-1.5 text-[12.5px] outline-none focus:border-foreground/30"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              data-testid="button-clear-search"
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1" data-testid="status-filter">
          <button
            onClick={() => setStatusFilter(null)}
            data-testid="chip-status-all"
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11.5px] hover-elevate",
              statusFilter === null
                ? "border-foreground/30 bg-secondary text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            全部
          </button>
          {columns.map((c) => (
            <button
              key={c.key}
              onClick={() => setStatusFilter(statusFilter === c.key ? null : c.key)}
              data-testid={`chip-status-${c.key}`}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11.5px] hover-elevate",
                statusFilter === c.key
                  ? "border-foreground/30 bg-secondary text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {(search || statusFilter) && (
          <div className="text-[11.5px] text-muted-foreground" data-testid="text-filter-summary">
            筛选出 {filteredApps.length} / {apps.length} 条
          </div>
        )}
      </div>

      {view === "board" && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <section className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {columns.map((c) => (
              <Column
                key={c.key}
                col={c}
                items={grouped[c.key] || []}
                onCardClick={setEditing}
                onQuickDelete={(id) => deleteApp.mutate(id)}
              />
            ))}
          </section>
          <DragOverlay>
            {active ? (
              <div className="w-64">
                <Card app={active} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      {view === "list" && (
        <ListView
          apps={filteredApps}
          onCardClick={setEditing}
          onQuickDelete={(id) => deleteApp.mutate(id)}
        />
      )}
      {view === "calendar" && (
        <CalendarView apps={filteredApps} onCardClick={setEditing} />
      )}

      {showForm && (
        <NewApplicationDialog
          onClose={() => setShowForm(false)}
          onSubmit={(d) => createApp.mutate(d)}
          submitting={createApp.isPending}
        />
      )}
      {editing && (
        <EditApplicationDialog
          app={editing}
          onClose={() => setEditing(null)}
          onSave={(d) => updateApp.mutate({ id: editing.id, data: d })}
          onDelete={() => deleteApp.mutate(editing.id)}
        />
      )}
    </PageShell>
  );
}

function NewApplicationDialog({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (d: any) => void;
  submitting: boolean;
}) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [appliedDate, setAppliedDate] = useState(todayStr);
  const [jdUrl, setJdUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("applied");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!company.trim() || !title.trim()) {
      setErr("请填写公司和岗位");
      return;
    }
    onSubmit({
      company: company.trim(),
      title: title.trim(),
      applied_at: new Date(appliedDate).getTime(),
      status,
      notes,
      jd_url: jdUrl,
      job_id: null,
    });
  };

  return (
    <Dialog onClose={onClose} title="添加投递记录">
      <Field label="公司">
        <Input
          value={company}
          onChange={(v) => setCompany(v)}
          placeholder="例如：字节跳动"
          testId="input-new-company"
        />
      </Field>
      <Field label="岗位">
        <Input
          value={title}
          onChange={setTitle}
          placeholder="例如：产品经理（AI 方向）"
          testId="input-new-title"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="投递日期">
          <Input type="date" value={appliedDate} onChange={setAppliedDate} testId="input-new-date" />
        </Field>
        <Field label="状态">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            data-testid="select-new-status"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="JD 链接">
        <Input
          value={jdUrl}
          onChange={setJdUrl}
          placeholder="https://..."
          testId="input-new-url"
        />
      </Field>
      <Field label="备注">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="textarea-new-notes"
          rows={3}
          className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-[13px] outline-none focus:border-foreground/30"
        />
      </Field>
      {err && <div className="text-[12px] text-destructive">{err}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-[13px] hover-elevate"
        >
          取消
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          data-testid="button-new-save"
          className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
        >
          {submitting ? "保存中…" : "保存"}
        </button>
      </div>
    </Dialog>
  );
}

function EditApplicationDialog({
  app,
  onClose,
  onSave,
  onDelete,
}: {
  app: Application;
  onClose: () => void;
  onSave: (d: Partial<Application> & { event_at?: number }) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(app.notes);
  const [status, setStatus] = useState(app.status);
  const [confirmDel, setConfirmDel] = useState(false);
  // Default the event date to today (Asia/Shanghai local).
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [eventDate, setEventDate] = useState(todayStr);
  const statusChanged = status !== app.status;
  return (
    <Dialog
      onClose={onClose}
      title={
        <div>
          <div className="text-[12px] text-muted-foreground">{app.company}</div>
          <div className="text-[16px] font-semibold leading-tight">{app.title}</div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="状态">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            data-testid="select-edit-status"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            statusChanged
              ? "状态变更日期"
              : "状态变更日期（仅在状态变动时生效）"
          }
        >
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            disabled={!statusChanged}
            data-testid="input-edit-event-date"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </Field>
      </div>
      {statusChanged && (
        <div className="-mt-1 text-[11.5px] text-muted-foreground">
          会在时间线上记为该日期发生的状态变更 · 适用于补记几天前的面试/结果
        </div>
      )}
      <Field label="备注">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          data-testid="textarea-edit-notes"
          className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-[13px] outline-none focus:border-foreground/30"
        />
      </Field>
      <Timeline events={parseEvents(app.events)} appliedAt={app.applied_at} />
      <div className="text-[11.5px] text-muted-foreground">
        投递日期：{fmt(app.applied_at)}
      </div>
      <div className="flex items-center justify-between pt-1">
        {confirmDel ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5">
            <span className="text-[11.5px] text-destructive">确认删除？</span>
            <button
              onClick={onDelete}
              data-testid="button-delete-confirm"
              className="inline-flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-[11.5px] font-medium text-destructive-foreground hover:opacity-90"
            >
              <Trash2 className="h-3 w-3" />
              删除
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="text-[11.5px] text-muted-foreground hover:underline"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            data-testid="button-delete"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-destructive hover-elevate"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] hover-elevate"
          >
            取消
          </button>
          <button
            onClick={() => {
              const payload: Partial<Application> & { event_at?: number } = {
                notes,
                status,
              };
              // Only include event_at if the status actually changed.
              if (status !== app.status && eventDate) {
                // Parse YYYY-MM-DD as local time (Asia/Shanghai). Anchor at
                // 12:00 noon so the date stays the same across all timezones.
                const [y, m, d] = eventDate.split("-").map(Number);
                if (y && m && d) {
                  payload.event_at = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
                }
              }
              onSave(payload);
              onClose();
            }}
            data-testid="button-edit-save"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover-elevate active-elevate"
          >
            <Pencil className="h-3.5 w-3.5" />
            保存修改
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Timeline({ events, appliedAt }: { events: ApplicationEvent[]; appliedAt: number }) {
  // Sort ascending by time. If empty, synthesize a single created event at appliedAt.
  const list = events.length
    ? [...events].sort((a, b) => a.at - b.at)
    : [{ at: appliedAt, kind: "created" as const, to: "applied" }];
  const label = (k: string) => columns.find((c) => c.key === k)?.label || k;
  return (
    <div className="space-y-1.5" data-testid="timeline">
      <div className="text-[12px] font-medium text-muted-foreground">状态变更时间线</div>
      <ol className="relative border-l border-border pl-3.5 space-y-2">
        {list.map((e, i) => (
          <li key={i} className="relative" data-testid={`timeline-event-${i}`}>
            <span className="absolute -left-[18px] top-1.5 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
            <div className="text-[11.5px] text-muted-foreground">{fmtDateTime(e.at)}</div>
            <div className="text-[12.5px] text-foreground leading-tight">
              {e.kind === "created" && <>建立投递记录 · <span className="font-medium">{label(e.to || "applied")}</span></>}
              {e.kind === "status" && (
                <>
                  <span className="text-muted-foreground line-through">{label(e.from || "")}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium">{label(e.to || "")}</span>
                </>
              )}
              {e.kind === "note" && <>备注更新：{e.note}</>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-[15px] font-semibold tracking-tight">{title}</div>
          <button
            onClick={onClose}
            className="rounded-md border border-border p-1 hover-elevate"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground/30"
    />
  );
}

// ───────────────────────────────── List View ─────────────────────────────────

function ListView({
  apps,
  onCardClick,
  onQuickDelete,
}: {
  apps: Application[];
  onCardClick: (a: Application) => void;
  onQuickDelete: (id: number) => void;
}) {
  type SortKey = "applied_at" | "company" | "status" | "updated_at";
  const [sortBy, setSortBy] = useState<SortKey>("applied_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  // 从 events 里取最后一个事件的时间作为「最新状态时间」，没事件则用 applied_at
  const lastUpdatedAt = (a: Application): number => {
    const evts = parseEvents(a.events);
    if (evts.length === 0) return a.applied_at;
    return Math.max(...evts.map((e) => e.at), a.applied_at);
  };

  const sorted = useMemo(() => {
    const list = [...apps];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "applied_at") cmp = a.applied_at - b.applied_at;
      else if (sortBy === "updated_at") cmp = lastUpdatedAt(a) - lastUpdatedAt(b);
      else if (sortBy === "company") cmp = a.company.localeCompare(b.company, "zh-CN");
      else if (sortBy === "status") {
        const order = ["applied", "interviewing", "offer", "rejected", "withdrawn"];
        cmp = order.indexOf(a.status) - order.indexOf(b.status);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [apps, sortBy, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDir(key === "company" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => {
    if (!active) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return <span className="ml-1 text-foreground">{dir === "asc" ? "↑" : "↓"}</span>;
  };

  if (apps.length === 0) {
    return (
      <section className="mt-4 rounded-lg border border-dashed border-border bg-card py-16 text-center" data-testid="list-empty">
        <div className="text-[13px] text-muted-foreground">还没有投递记录</div>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-border bg-card overflow-hidden" data-testid="list-view">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11.5px] font-medium text-muted-foreground">
              <th className="px-3 py-2">
                <button
                  onClick={() => toggleSort("company")}
                  data-testid="sort-company"
                  className="inline-flex items-center hover:text-foreground"
                >
                  公司<SortIcon active={sortBy === "company"} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2">岗位</th>
              <th className="px-3 py-2 w-[130px]">
                <button
                  onClick={() => toggleSort("applied_at")}
                  data-testid="sort-applied-at"
                  className="inline-flex items-center hover:text-foreground"
                >
                  投递日期<SortIcon active={sortBy === "applied_at"} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 w-[120px]">
                <button
                  onClick={() => toggleSort("status")}
                  data-testid="sort-status"
                  className="inline-flex items-center hover:text-foreground"
                >
                  状态<SortIcon active={sortBy === "status"} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 w-[130px]">
                <button
                  onClick={() => toggleSort("updated_at")}
                  data-testid="sort-updated-at"
                  className="inline-flex items-center hover:text-foreground"
                >
                  最新状态时间<SortIcon active={sortBy === "updated_at"} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 w-[80px]">JD</th>
              <th className="px-3 py-2 w-[120px] text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr
                key={a.id}
                data-testid={`row-app-${a.id}`}
                className="border-b border-border last:border-b-0 hover:bg-muted/20"
              >
                <td className="px-3 py-2.5 align-top">
                  <button
                    onClick={() => onCardClick(a)}
                    data-testid={`row-company-${a.id}`}
                    className="text-left text-foreground hover:underline"
                  >
                    {a.company}
                  </button>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className="font-medium">{a.title}</span>
                </td>
                <td className="px-3 py-2.5 align-top text-muted-foreground">{fmt(a.applied_at)}</td>
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                      STATUS_COLOR[a.status] || "bg-muted text-muted-foreground",
                    )}
                  >
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top text-muted-foreground">
                  {fmt(lastUpdatedAt(a))}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {a.jd_url ? (
                    <a
                      href={a.jd_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`row-jd-${a.id}`}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      打开
                    </a>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => onCardClick(a)}
                      data-testid={`row-edit-${a.id}`}
                      aria-label="编辑"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {confirmDel === a.id ? (
                      <div className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-1.5 py-0.5">
                        <button
                          onClick={() => {
                            onQuickDelete(a.id);
                            setConfirmDel(null);
                          }}
                          data-testid={`row-delete-confirm-${a.id}`}
                          className="text-[10.5px] font-medium text-destructive hover:underline"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmDel(null)}
                          className="text-[10.5px] text-muted-foreground hover:underline"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDel(a.id)}
                        data-testid={`row-delete-${a.id}`}
                        aria-label="删除"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        共 {sorted.length} 条记录
      </div>
    </section>
  );
}

// ───────────────────────────────── Calendar View ─────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  applied: "bg-foreground/70 text-background",
  interviewing: "bg-primary text-primary-foreground",
  offer: "bg-emerald-600 text-white",
  rejected: "bg-muted text-muted-foreground line-through",
  withdrawn: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  applied: "已投递",
  interviewing: "笔试/面试中",
  offer: "已 Offer",
  rejected: "已拒",
  withdrawn: "已放弃",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function CalendarView({
  apps,
  onCardClick,
}: {
  apps: Application[];
  onCardClick: (a: Application) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  // group applications by yyyy-mm-dd of applied_at
  const byDay = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const a of apps) {
      const d = new Date(a.applied_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [apps]);

  // Build month grid (always 6 rows × 7 cols = 42 cells)
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay(); // 0 = Sunday
    const gridStart = new Date(year, month, 1 - startWeekday);
    const list: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      list.push(d);
    }
    return list;
  }, [cursor]);

  const monthLabel = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
  const selectedKey = `${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}`;
  const selectedApps = byDay.get(selectedKey) || [];

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelected(t);
  };

  return (
    <section className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4" data-testid="calendar-view">
      {/* Month grid */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              data-testid="button-prev-month"
              className="rounded-md border border-border p-1 hover-elevate"
              aria-label="上一月"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={nextMonth}
              data-testid="button-next-month"
              className="rounded-md border border-border p-1 hover-elevate"
              aria-label="下一月"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <span className="ml-1 text-[14px] font-semibold tracking-tight" data-testid="text-month">
              {monthLabel}
            </span>
          </div>
          <button
            onClick={goToday}
            data-testid="button-today"
            className="rounded-md border border-border px-2.5 py-1 text-[12px] hover-elevate"
          >
            回到今天
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dayApps = byDay.get(key) || [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selected);
            const isLastRow = i >= 35;
            const isLastCol = i % 7 === 6;
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                data-testid={`day-${key}`}
                className={cn(
                  "flex min-h-[88px] flex-col items-start gap-1 p-1.5 text-left transition-colors",
                  !isLastCol && "border-r border-border",
                  !isLastRow && "border-b border-border",
                  inMonth ? "bg-background" : "bg-muted/20",
                  isSelected && "bg-secondary",
                  !isSelected && "hover:bg-muted/40",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px]",
                      inMonth ? "text-foreground" : "text-muted-foreground/60",
                      isToday && "bg-primary text-primary-foreground font-semibold",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {dayApps.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {dayApps.length} 投
                    </span>
                  )}
                </div>
                <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                  {dayApps.slice(0, 2).map((a) => (
                    <span
                      key={a.id}
                      className={cn(
                        "block w-full truncate rounded px-1 py-0.5 text-[10.5px] leading-tight",
                        STATUS_COLOR[a.status] || "bg-muted text-muted-foreground",
                      )}
                      title={`${a.company} · ${a.title}`}
                    >
                      {a.company}
                    </span>
                  ))}
                  {dayApps.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayApps.length - 2} 更多
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel: selected day's applications */}
      <aside className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3">
          <div className="text-[11.5px] text-muted-foreground">
            {isSameDay(selected, today) ? "今天" : "选中日期"}
          </div>
          <div className="text-[15px] font-semibold tracking-tight" data-testid="text-selected-date">
            {selected.getFullYear()} 年 {selected.getMonth() + 1} 月 {selected.getDate()} 日
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            共 {selectedApps.length} 条投递记录
          </div>
        </div>

        {selectedApps.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-[12px] text-muted-foreground">
            这一天没有投递记录
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedApps.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onCardClick(a)}
                  data-testid={`day-app-${a.id}`}
                  className="w-full rounded-md border border-border bg-background p-2.5 text-left hover-elevate"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-muted-foreground truncate">{a.company}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        STATUS_COLOR[a.status] || "bg-muted text-muted-foreground",
                      )}
                    >
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium leading-snug">{a.title}</div>
                  {a.notes && (
                    <div
                      className="mt-1 text-[11.5px] text-muted-foreground"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {a.notes}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Legend */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[10.5px] text-muted-foreground mb-1.5">状态图例</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                  STATUS_COLOR[k] || "bg-muted text-muted-foreground",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}
