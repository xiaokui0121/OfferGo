import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Jobs
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(), // 'internet' | 'ai_startup' | 'other'
  subcategory: text("subcategory").notNull().default(""),
  location: text("location").notNull(),
  salary_range: text("salary_range").notNull(),
  description: text("description").notNull(),
  source_url: text("source_url").notNull().default(""),
  source_name: text("source_name").notNull().default("小红书"),
  // 'xhs' ｜ 小红书采集进来的
  // 'manual' ｜ 用户手动录入的
  source: text("source").notNull().default("xhs"),
  // 'new' ｜ 刚采集进来/刚手动创建
  // 'applied' ｜ 已点「标记为已投递」代事件（不会从岗位页消失）
  // 'hidden' ｜ 用户隐藏/不感兴趣，默认不展，采集也不重复入库
  job_status: text("job_status").notNull().default("new"),
  posted_at: integer("posted_at").notNull(), // unix ms
  scraped_at: integer("scraped_at").notNull(),
  tags: text("tags").notNull().default("[]"), // JSON array
  note_author: text("note_author").notNull().default(""), // 小红书笔记作者
  keyword: text("keyword").notNull().default(""), // 采集时使用的关键词
  raw_content: text("raw_content").notNull().default(""), // 原始笔记全文（抽取错了可回查）
  jd_raw: text("jd_raw").notNull().default(""), // 原帖中完整的 JD 原文（职责+要求，未压缩），详情页展示
});

// 采集服务用的登录凭证（小红书 Cookie）
export const scrapeCookies = sqliteTable("scrape_cookies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("xiaohongshu"),
  cookies_json: text("cookies_json").notNull(), // Playwright 可直接 set 的 cookie 数组
  updated_at: integer("updated_at").notNull(),
});
export type ScrapeCookie = typeof scrapeCookies.$inferSelect;

// 采集任务（一个关键词一条记录，供前端轮询进度）
export const scrapeJobs = sqliteTable("scrape_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyword: text("keyword").notNull(),
  target_category: text("target_category").notNull().default(""), // 这批应归到哪个分类
  target_subcategory: text("target_subcategory").notNull().default(""),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  total_seen: integer("total_seen").notNull().default(0), // 一共看了多少条笔记
  total_kept: integer("total_kept").notNull().default(0), // LLM 判定是招聘帖、成功入库的数量
  message: text("message").notNull().default(""), // 运行中的提示 / 错误信息
  started_at: integer("started_at").notNull(),
  finished_at: integer("finished_at").notNull().default(0),
});
export type ScrapeJob = typeof scrapeJobs.$inferSelect;

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Applications
export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  job_id: integer("job_id"),
  company: text("company").notNull(),
  title: text("title").notNull(),
  applied_at: integer("applied_at").notNull(),
  status: text("status").notNull().default("applied"), // applied | interviewing | offer | rejected | withdrawn
  notes: text("notes").notNull().default(""),
  jd_url: text("jd_url").notNull().default(""),
  // events: JSON array of { at: number, kind: 'created'|'status'|'note', from?: string, to?: string, note?: string }
  events: text("events").notNull().default("[]"),
});

export const insertApplicationSchema = createInsertSchema(applications).omit({ id: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

export type ApplicationEvent = {
  at: number;
  kind: "created" | "status" | "note";
  from?: string;
  to?: string;
  note?: string;
};

// Resume optimizations
export const resumeOptimizations = sqliteTable("resume_optimizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  original_filename: text("original_filename").notNull().default(""),
  job_id: integer("job_id"),
  jd_text: text("jd_text").notNull(),
  result_json: text("result_json").notNull(),
  created_at: integer("created_at").notNull(),
});

export const insertResumeOptimizationSchema = createInsertSchema(resumeOptimizations).omit({ id: true });
export type InsertResumeOptimization = z.infer<typeof insertResumeOptimizationSchema>;
export type ResumeOptimization = typeof resumeOptimizations.$inferSelect;

// Interview reviews (复盘)
export const interviewReviews = sqliteTable("interview_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  job_id: integer("job_id"), // nullable, optional link to a job
  company: text("company").notNull().default(""), // snapshot at creation time
  title: text("title").notNull().default(""), // snapshot at creation time
  audio_filename: text("audio_filename").notNull().default(""),
  interview_date: integer("interview_date").notNull().default(0), // unix ms, user-specified date of the interview
  duration_sec: integer("duration_sec").notNull().default(0),
  transcript: text("transcript").notNull().default(""), // plain text transcript
  report_json: text("report_json").notNull().default("{}"), // AI structured report
  user_notes: text("user_notes").notNull().default(""), // user's free-form notes
  status: text("status").notNull().default("done"), // 'transcribing' | 'analyzing' | 'done' | 'failed'
  error_message: text("error_message").notNull().default(""),
  created_at: integer("created_at").notNull(),
});

export const insertInterviewReviewSchema = createInsertSchema(interviewReviews).omit({ id: true });
export type InsertInterviewReview = z.infer<typeof insertInterviewReviewSchema>;
export type InterviewReview = typeof interviewReviews.$inferSelect;

// Shape of report_json field — kept loose so we can iterate without DB changes.
export type InterviewReviewReport = {
  questions: Array<{
    question: string;
    my_answer: string;
    score: number; // 1-5
    comment: string;
    improvement: string; // 「下次可以这样改」的具体建议
  }>;
  follow_ups: Array<{
    question: string;
    competency: string; // e.g. 「结构化思维」「数据敏感度」
    note: string;
  }>;
  summary: {
    strengths: string[];
    weaknesses: string[];
    lessons: string[];
  };
};
