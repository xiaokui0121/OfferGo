import {
  jobs,
  applications,
  resumeOptimizations,
  interviewReviews,
  scrapeCookies,
  scrapeJobs,
} from "@shared/schema";
import type {
  Job,
  InsertJob,
  Application,
  InsertApplication,
  ResumeOptimization,
  InsertResumeOptimization,
  InterviewReview,
  InsertInterviewReview,
  ScrapeCookie,
  ScrapeJob,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

// 数据库文件位置：
//   - 本地开发：默认项目根 ./data.db
//   - 生产部署（Railway）：通过 DB_PATH 指向持久磁盘挂载点，例如 /app/data/data.db
const dbPath = process.env.DB_PATH || "data.db";
const dbDir = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Create tables if they don't exist (simple migration).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    salary_range TEXT NOT NULL,
    description TEXT NOT NULL,
    source_url TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL DEFAULT '小红书',
    posted_at INTEGER NOT NULL,
    scraped_at INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    subcategory TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'applied',
    notes TEXT NOT NULL DEFAULT '',
    jd_url TEXT NOT NULL DEFAULT '',
    events TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS resume_optimizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_filename TEXT NOT NULL DEFAULT '',
    job_id INTEGER,
    jd_text TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scrape_cookies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'xiaohongshu',
    cookies_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scrape_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    target_category TEXT NOT NULL DEFAULT '',
    target_subcategory TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    total_seen INTEGER NOT NULL DEFAULT 0,
    total_kept INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS interview_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    company TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    audio_filename TEXT NOT NULL DEFAULT '',
    interview_date INTEGER NOT NULL DEFAULT 0,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    transcript TEXT NOT NULL DEFAULT '',
    report_json TEXT NOT NULL DEFAULT '{}',
    user_notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'done',
    error_message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
`);

// Idempotent ALTER for existing DBs that predate `subcategory`.
try {
  sqlite.prepare("ALTER TABLE jobs ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''").run();
} catch {
  /* column already exists */
}
try {
  sqlite
    .prepare("ALTER TABLE applications ADD COLUMN events TEXT NOT NULL DEFAULT '[]'")
    .run();
} catch {
  /* column already exists */
}
try {
  sqlite
    .prepare("ALTER TABLE interview_reviews ADD COLUMN interview_date INTEGER NOT NULL DEFAULT 0")
    .run();
} catch {
  /* column already exists */
}
for (const col of [
  "note_author TEXT NOT NULL DEFAULT ''",
  "keyword TEXT NOT NULL DEFAULT ''",
  "raw_content TEXT NOT NULL DEFAULT ''",
  "source TEXT NOT NULL DEFAULT 'xhs'",
  "job_status TEXT NOT NULL DEFAULT 'new'",
  "jd_raw TEXT NOT NULL DEFAULT ''",
]) {
  try {
    sqlite.prepare(`ALTER TABLE jobs ADD COLUMN ${col}`).run();
  } catch {
    /* column already exists */
  }
}
// 老数据修正：以前录入的岗位 source_name 可能是「小红书」但 source 未赋值
sqlite.prepare("UPDATE jobs SET source = 'xhs' WHERE source IS NULL OR source = ''").run();
sqlite.prepare("UPDATE jobs SET job_status = 'new' WHERE job_status IS NULL OR job_status = ''").run();

export const db = drizzle(sqlite);

export const storage = {
  // Jobs
  // 默认不返 hidden 的；需要看 hidden 的带 includeHidden=true
  listJobs(category?: string, includeHidden = false): Job[] {
    if (category) {
      const rows = db
        .select()
        .from(jobs)
        .where(eq(jobs.category, category))
        .orderBy(desc(jobs.posted_at))
        .all();
      return includeHidden ? rows : rows.filter((r) => r.job_status !== "hidden");
    }
    const rows = db.select().from(jobs).orderBy(desc(jobs.posted_at)).all();
    return includeHidden ? rows : rows.filter((r) => r.job_status !== "hidden");
  },
  getJob(id: number): Job | undefined {
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  },
  updateJob(
    id: number,
    data: Partial<
      Pick<
        Job,
        | "category"
        | "subcategory"
        | "job_status"
        | "company"
        | "title"
        | "location"
        | "salary_range"
        | "description"
        | "jd_raw"
        | "tags"
      >
    >,
  ): Job | undefined {
    const existing = db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!existing) return undefined;
    db.update(jobs).set(data).where(eq(jobs.id, id)).run();
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  },
  countJobs(): number {
    const result = sqlite
      .prepare("SELECT COUNT(*) as c FROM jobs WHERE job_status != 'hidden'")
      .get() as { c: number };
    return result.c;
  },
  countJobsByCategory(): Record<string, number> {
    const rows = sqlite
      .prepare(
        "SELECT category, COUNT(*) as c FROM jobs WHERE job_status != 'hidden' GROUP BY category",
      )
      .all() as Array<{ category: string; c: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.category] = r.c;
    return out;
  },
  // Applications
  listApplications(): Application[] {
    return db.select().from(applications).orderBy(desc(applications.applied_at)).all();
  },
  getApplication(id: number): Application | undefined {
    return db.select().from(applications).where(eq(applications.id, id)).get();
  },
  createApplication(data: InsertApplication): Application {
    // Initial 'created' event using applied_at as the timestamp.
    const initEvent = {
      at: data.applied_at,
      kind: "created" as const,
      to: data.status || "applied",
    };
    const payload = {
      ...data,
      events: data.events && data.events !== "[]" ? data.events : JSON.stringify([initEvent]),
    };
    return db.insert(applications).values(payload).returning().get();
  },
  updateApplication(
    id: number,
    data: Partial<InsertApplication> & { event_at?: number },
  ): Application | undefined {
    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .get();
    if (!existing) return undefined;

    // Pull off the synthetic event_at flag before persisting.
    const { event_at, ...rest } = data as any;
    let merged: Partial<InsertApplication> = { ...rest };

    // If status is changing, append a 'status' event to the event log.
    // Use user-supplied event_at if provided (and reasonable), else now.
    if (typeof rest.status === "string" && rest.status !== existing.status) {
      let log: any[] = [];
      try {
        log = JSON.parse(existing.events || "[]");
        if (!Array.isArray(log)) log = [];
      } catch {
        log = [];
      }
      let at = Date.now();
      if (
        typeof event_at === "number" &&
        Number.isFinite(event_at) &&
        event_at > 0 &&
        event_at <= Date.now() + 86400 * 1000 // allow up to +1 day for tz drift
      ) {
        at = event_at;
      }
      log.push({
        at,
        kind: "status",
        from: existing.status,
        to: rest.status,
      });
      // Keep log chronologically sorted so backdated events show in order.
      log.sort((a: any, b: any) => (a.at || 0) - (b.at || 0));
      merged.events = JSON.stringify(log);
    }

    db.update(applications).set(merged).where(eq(applications.id, id)).run();
    return db.select().from(applications).where(eq(applications.id, id)).get();
  },
  deleteApplication(id: number): void {
    db.delete(applications).where(eq(applications.id, id)).run();
  },
  // Resume optimizations
  createOptimization(data: InsertResumeOptimization): ResumeOptimization {
    return db.insert(resumeOptimizations).values(data).returning().get();
  },
  getOptimization(id: number): ResumeOptimization | undefined {
    return db.select().from(resumeOptimizations).where(eq(resumeOptimizations.id, id)).get();
  },
  // Interview reviews
  listInterviewReviews(jobId?: number): InterviewReview[] {
    if (typeof jobId === "number" && Number.isFinite(jobId)) {
      return db
        .select()
        .from(interviewReviews)
        .where(eq(interviewReviews.job_id, jobId))
        .orderBy(desc(interviewReviews.created_at))
        .all();
    }
    return db.select().from(interviewReviews).orderBy(desc(interviewReviews.created_at)).all();
  },
  getInterviewReview(id: number): InterviewReview | undefined {
    return db.select().from(interviewReviews).where(eq(interviewReviews.id, id)).get();
  },
  createInterviewReview(data: InsertInterviewReview): InterviewReview {
    return db.insert(interviewReviews).values(data).returning().get();
  },
  updateInterviewReview(
    id: number,
    data: Partial<InsertInterviewReview>,
  ): InterviewReview | undefined {
    const existing = db
      .select()
      .from(interviewReviews)
      .where(eq(interviewReviews.id, id))
      .get();
    if (!existing) return undefined;
    db.update(interviewReviews).set(data).where(eq(interviewReviews.id, id)).run();
    return db.select().from(interviewReviews).where(eq(interviewReviews.id, id)).get();
  },
  deleteInterviewReview(id: number): void {
    db.delete(interviewReviews).where(eq(interviewReviews.id, id)).run();
  },
  // Generic key/value settings (used for categories config)
  getSetting(key: string): string | undefined {
    const row = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  },
  setSetting(key: string, value: string): void {
    sqlite
      .prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  },

  // Jobs【采集/手动创建用】
  createJob(data: InsertJob): Job {
    return db.insert(jobs).values(data).returning().get();
  },
  deleteJob(id: number): void {
    db.delete(jobs).where(eq(jobs.id, id)).run();
  },
  // 采集去重：不管是「新」还是「已隐藏」「已投递」都不重复入库
  findDuplicateJob(sourceUrl: string): Job | undefined {
    if (!sourceUrl) return undefined;
    return db.select().from(jobs).where(eq(jobs.source_url, sourceUrl)).get();
  },

  // 采集 Cookie
  getCookies(source: string = "xiaohongshu"): ScrapeCookie | undefined {
    return db
      .select()
      .from(scrapeCookies)
      .where(eq(scrapeCookies.source, source))
      .orderBy(desc(scrapeCookies.updated_at))
      .get();
  },
  saveCookies(source: string, cookiesJson: string): void {
    const existing = db
      .select()
      .from(scrapeCookies)
      .where(eq(scrapeCookies.source, source))
      .get();
    const now = Date.now();
    if (existing) {
      db.update(scrapeCookies)
        .set({ cookies_json: cookiesJson, updated_at: now })
        .where(eq(scrapeCookies.id, existing.id))
        .run();
    } else {
      db.insert(scrapeCookies)
        .values({ source, cookies_json: cookiesJson, updated_at: now })
        .run();
    }
  },

  // 采集任务
  createScrapeJob(data: Omit<ScrapeJob, "id">): ScrapeJob {
    return db.insert(scrapeJobs).values(data).returning().get();
  },
  getScrapeJob(id: number): ScrapeJob | undefined {
    return db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).get();
  },
  updateScrapeJob(id: number, data: Partial<ScrapeJob>): ScrapeJob | undefined {
    db.update(scrapeJobs).set(data).where(eq(scrapeJobs.id, id)).run();
    return db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).get();
  },
  listScrapeJobs(limit: number = 20): ScrapeJob[] {
    return db
      .select()
      .from(scrapeJobs)
      .orderBy(desc(scrapeJobs.started_at))
      .limit(limit)
      .all();
  },
};
