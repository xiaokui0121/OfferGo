import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { spawn } from "node:child_process";
import { writeFile, unlink, mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import multer from "multer";
import OpenAI from "openai";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import mammoth from "mammoth";
// pdf-parse v2 exposes a PDFParse class.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
import { storage } from "./storage";
import { seedIfEmpty } from "./seed";
import {
  startLoginSession,
  captureScreenshot,
  checkLoginStatus,
  closeLoginSession,
  hasSavedCookies,
  getActiveSession,
} from "./scraper/xhs-login";
import { startScrapeTask } from "./scraper/xhs-scrape";
import { getDemoBundle } from "./scraper/demo-data";
import { debugDumpSearchPage } from "./scraper/debug-dump";
import { insertApplicationSchema } from "@shared/schema";
import { z } from "zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Audio chunks: deploy proxy caps each request at 10 MB, so each chunk ≤ ~6 MB.
const audioChunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// In-memory registry of pending chunked uploads.
// upload_id -> { tmpPath, mediaType, originalName, totalChunks, receivedChunks, expectedSize, jobId, company, title }
type PendingUpload = {
  tmpPath: string;
  mediaType: string;
  originalName: string;
  totalChunks: number;
  receivedChunks: number;
  jobId: number | null;
  company: string;
  title: string;
  interviewDate: number; // unix ms
  createdAt: number;
};
const pendingUploads = new Map<string, PendingUpload>();

// Garbage-collect stale uploads (older than 30 min) every 5 min.
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of pendingUploads) {
    if (now - p.createdAt > 30 * 60 * 1000) {
      pendingUploads.delete(id);
      unlink(p.tmpPath).catch(() => {});
    }
  }
}, 5 * 60 * 1000).unref?.();

const anthropic = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://offergo.app",
    "X-Title": "OfferGo",
  },
});

const LLM_MODEL = "anthropic/claude-sonnet-4.5";

// 兼容旧 Anthropic 调用形态：把 {system, messages, max_tokens} 映射到 OpenAI chat 接口，
// 返回值仍提供 .content 数组以减少业务侧改动。
async function llmCreate(opts: {
  model?: string;
  max_tokens?: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const resp = await anthropic.chat.completions.create({
    model: opts.model || LLM_MODEL,
    max_tokens: opts.max_tokens,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages,
    ],
  });
  const text = resp.choices?.[0]?.message?.content || "";
  return { content: [{ type: "text", text }] };
}

const SYSTEM_PROMPT = `你是一位资深的招聘顾问和简历优化专家，专精于中国互联网和 AI 行业。

任务：对比用户上传的简历内容和给定的目标岗位 JD，给出针对性优化建议。

输出严格的 JSON 格式（不要任何 markdown 包裹，不要任何解释文字，直接以 { 开头以 } 结尾），字段如下：
{
  "score": 0-100 的整数，表示当前简历对该岗位的匹配度,
  "issues": ["核心问题 1", "核心问题 2", ...] (3-5 条，每条 20 字以内),
  "suggestions": [
    {
      "original": "简历中的原文片段",
      "revised": "建议改成的版本",
      "reason": "为什么这样改（结合 JD 要求）"
    }
  ] (5-10 条具体修改建议),
  "optimized_resume_text": "改写完成的完整简历正文，markdown 格式"
}

【关键 JSON 格式约束 —— 必须严格遵守】
- 字符串值内部禁止出现未转义的 ASCII 双引号 "
- 如果你想强调某个关键词（比如『多视角业务洞察』），必须使用中文引号「」或『』，绝对不能写成 "多视角业务洞察"
- 字符串内不要出现真实换行符，需要换行请使用 \\n
- 如果坚持要在字符串内使用 ASCII 双引号，必须转义为 \\"
- 输出前请自我检查每一个字符串值，确认没有未转义的 "
- 不要在 JSON 外加任何文字、不要 markdown 围栏、直接以 { 开头以 } 结尾

原则：
1. 改写要保持事实真实，不能编造经历
2. 建议要具体、可操作，不要『建议丰富细节』这种空话
3. 重点突出 JD 中要求的关键词和技术栈
4. 量化结果（用数字、百分比、规模描述成就）
5. 使用 STAR 法则改写经历`;

// Result of resume parsing.
//  text: plain text feed for the AI (always populated)
//  html: rich-text HTML (only when source preserves formatting, e.g. .docx)
async function parseResume(
  file: Express.Multer.File,
): Promise<{ text: string }> {
  const name = (file.originalname || "").toLowerCase();
  const mime = file.mimetype || "";
  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    try {
      const out = await parser.getText();
      return { text: out.text || "" };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (name.endsWith(".docx") || mime.includes("officedocument.wordprocessingml")) {
    const rawText = await mammoth.extractRawText({ buffer: file.buffer });
    return { text: rawText.value || "" };
  }
    // Fallback: treat as text (.txt, .md, others).
  return { text: file.buffer.toString("utf-8") };
}

// Detect whether extracted text is largely "garbled" — i.e. dominated by
// Private Use Area, replacement chars, or non-printable symbols. Common when
// a Chinese PDF embeds fonts with custom (non-Unicode) CIDs and pdf-parse
// falls back to surrogate / PUA codepoints.
function assessExtractedText(text: string): {
  ok: boolean;
  reason?: string;
  totalChars: number;
  cjkChars: number;
  asciiChars: number;
  puaChars: number;
  replacementChars: number;
  ratioReadable: number;
} {
  const total = text.length;
  if (total < 30) {
    return {
      ok: false,
      reason: "提取出的文字太短，请改用「粘贴文本」模式",
      totalChars: total,
      cjkChars: 0,
      asciiChars: 0,
      puaChars: 0,
      replacementChars: 0,
      ratioReadable: 0,
    };
  }
  let cjk = 0;
  let ascii = 0;
  let pua = 0;
  let repl = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    if (cp === 0xfffd) repl++;
    else if (cp >= 0xe000 && cp <= 0xf8ff) pua++; // Private Use Area
    else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if (cp >= 0x20 && cp <= 0x7e) ascii++;
  }
  const readable = cjk + ascii;
  const ratioReadable = readable / total;
  // "garbled" if PUA/replacement is significant or readable content is tiny
  if (pua + repl > total * 0.2 || ratioReadable < 0.3) {
    return {
      ok: false,
      reason:
        "PDF 文字提取乱码（多数是不可识别符号）。这里的 PDF 可能使用了字体子集嵌入，请改用「粘贴文本」模式。",
      totalChars: total,
      cjkChars: cjk,
      asciiChars: ascii,
      puaChars: pua,
      replacementChars: repl,
      ratioReadable,
    };
  }
  return {
    ok: true,
    totalChars: total,
    cjkChars: cjk,
    asciiChars: ascii,
    puaChars: pua,
    replacementChars: repl,
    ratioReadable,
  };
}

// Aggressively repair common LLM JSON output mistakes:
// - markdown ```json fences
// - trailing commas before } or ]
// - raw newlines / tabs inside string values
// - unescaped ASCII double quotes inside string values
//   (Claude often does this when emphasizing keywords inside Chinese text)
function repairJson(input: string): string {
  let s = input.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // strip trailing commas (e.g. {"a":1,} or [1,2,])
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // Single-pass scanner that:
  // (1) escapes raw newlines/tabs inside string values
  // (2) detects whether each `"` is a true string boundary or a stray
  //     unescaped quote inside a value, and escapes the latter as \"
  //
  // Heuristic for "is this `"` a string boundary?":
  //   - opening boundary: previous non-whitespace char is one of  : , [ { or start-of-input
  //   - closing boundary: next non-whitespace char is one of      : , ] } or end-of-input
  // Anything else while we're inside a string is treated as a literal quote
  // that should have been escaped.
  const isOpenContext = (prevNonWs: string | null): boolean => {
    return prevNonWs === null || ":,[{".includes(prevNonWs);
  };
  const isCloseContext = (nextNonWs: string | null): boolean => {
    return nextNonWs === null || ":,]}".includes(nextNonWs);
  };
  const peekNextNonWs = (str: string, from: number): string | null => {
    for (let k = from; k < str.length; k++) {
      const ch = str[k];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;
      return ch;
    }
    return null;
  };
  const peekPrevNonWs = (built: string): string | null => {
    for (let k = built.length - 1; k >= 0; k--) {
      const ch = built[k];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;
      return ch;
    }
    return null;
  };

  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === "\\") {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      if (!inString) {
        // We're outside any string. This `"` should be an opening boundary;
        // accept it.
        inString = true;
        out += c;
      } else {
        // We're inside a string. Decide: is this a real closing boundary,
        // or is it a stray unescaped quote that should be escaped?
        const next = peekNextNonWs(s, i + 1);
        if (isCloseContext(next)) {
          // Real closing quote.
          inString = false;
          out += c;
        } else {
          // Stray quote — escape it and stay inside the string.
          out += '\\"';
        }
      }
      continue;
    }
    if (inString) {
      if (c === "\n") {
        out += "\\n";
      } else if (c === "\r") {
        out += "\\r";
      } else if (c === "\t") {
        out += "\\t";
      } else {
        out += c;
      }
    } else {
      out += c;
    }
  }
  return out;
}

function tryParseJson(raw: string): any | null {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // 1) direct parse
  try {
    return JSON.parse(s);
  } catch {}
  // 2) parse a brace-delimited block as-is
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  const slice = first >= 0 && last > first ? s.slice(first, last + 1) : s;
  try {
    return JSON.parse(slice);
  } catch {}
  // 3) repair common mistakes and re-attempt
  try {
    return JSON.parse(repairJson(slice));
  } catch {}
  try {
    return JSON.parse(repairJson(s));
  } catch {
    return null;
  }
}

function fallbackResult(message: string) {
  return {
    score: 0,
    issues: [message],
    suggestions: [],
    optimized_resume_text: "",
    _fallback: true,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Seed once at startup.
  seedIfEmpty();

  // ===== JD 图片上传（手动录入岗位时贴图）=====
  // 持久化到 data/jd-images，重启 / 重新部署不会丢图
  // 生产环境可通过 DATA_DIR 覆盖（指向 Railway 持久磁盘）
  const dataRoot = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
  const jdImageDir = path.join(dataRoot, "jd-images");
  try {
    await mkdir(jdImageDir, { recursive: true });
  } catch {}
  // 静态挂载，粘贴/拖拽后可访问 /uploads/jd-images/xxx.png
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express") as typeof import("express");
  app.use("/uploads/jd-images", express.static(jdImageDir));

  app.post(
    "/api/uploads/jd-image",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const f = (req as Request & { file?: Express.Multer.File }).file;
      if (!f) return res.status(400).json({ message: "未接收到文件" });
      const ok = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        f.mimetype,
      );
      if (!ok) return res.status(400).json({ message: "仅支持 png/jpeg/webp/gif" });
      const ext = (f.mimetype.split("/")[1] || "png").replace("jpeg", "jpg");
      const id = crypto.randomUUID();
      const name = `${id}.${ext}`;
      const full = path.join(jdImageDir, name);
      try {
        await writeFile(full, f.buffer);
      } catch (e) {
        return res.status(500).json({ message: "写入失败" });
      }
      res.json({ url: `/uploads/jd-images/${name}` });
    },
  );

  // ===== Stats =====
  app.get("/api/stats", (_req: Request, res: Response) => {
    const totalJobs = storage.countJobs();
    const byCategory = storage.countJobsByCategory();
    const apps = storage.listApplications();
    res.json({
      totalJobs,
      byCategory,
      totalApplications: apps.length,
      applicationsByStatus: apps.reduce<Record<string, number>>((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      }, {}),
    });
  });

  // ===== Categories (user-editable taxonomy) =====
  // Stored as a single JSON blob under app_settings.key = 'categories'.
  // Shape: { main: [{key, label}], sub: { [mainKey]: [{key, label}] } }
  const DEFAULT_CATEGORIES = {
    main: [
      { key: "internet", label: "互联网" },
      { key: "ai_startup", label: "AI 初创" },
      { key: "other", label: "其他" },
    ],
    sub: {
      internet: [
        { key: "product", label: "产品" },
        { key: "operations", label: "运营" },
        { key: "analytics", label: "分析" },
      ],
      ai_startup: [] as Array<{ key: string; label: string }>,
      other: [] as Array<{ key: string; label: string }>,
    } as Record<string, Array<{ key: string; label: string }>>,
  };

  function readCategories() {
    const raw = storage.getSetting("categories");
    if (!raw) return DEFAULT_CATEGORIES;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.main) && parsed.sub && typeof parsed.sub === "object") {
        return parsed;
      }
    } catch {}
    return DEFAULT_CATEGORIES;
  }

  app.get("/api/categories", (_req: Request, res: Response) => {
    res.json(readCategories());
  });

  app.put("/api/categories", (req: Request, res: Response) => {
    const body = req.body;
    // Lightweight validation: required shape + slug-safe keys.
    const validKey = (k: any) => typeof k === "string" && /^[a-z0-9_]{1,32}$/i.test(k);
    const validLabel = (l: any) => typeof l === "string" && l.trim().length > 0 && l.length <= 32;
    if (!body || !Array.isArray(body.main) || !body.sub || typeof body.sub !== "object") {
      return res.status(400).json({ message: "格式错误" });
    }
    const main: Array<{ key: string; label: string }> = [];
    const seenMain = new Set<string>();
    for (const item of body.main) {
      if (!item || !validKey(item.key) || !validLabel(item.label)) {
        return res.status(400).json({ message: `大类数据不合法: ${JSON.stringify(item)}` });
      }
      if (seenMain.has(item.key)) {
        return res.status(400).json({ message: `大类 key 重复: ${item.key}` });
      }
      seenMain.add(item.key);
      main.push({ key: item.key, label: item.label.trim() });
    }
    const sub: Record<string, Array<{ key: string; label: string }>> = {};
    for (const mk of Object.keys(body.sub)) {
      if (!seenMain.has(mk)) continue; // ignore orphan sub entries
      const arr = body.sub[mk];
      if (!Array.isArray(arr)) continue;
      const list: Array<{ key: string; label: string }> = [];
      const seenSub = new Set<string>();
      for (const item of arr) {
        if (!item || !validKey(item.key) || !validLabel(item.label)) {
          return res.status(400).json({ message: `二级分类数据不合法: ${JSON.stringify(item)}` });
        }
        if (seenSub.has(item.key)) {
          return res.status(400).json({ message: `二级 key 在 ${mk} 下重复: ${item.key}` });
        }
        seenSub.add(item.key);
        list.push({ key: item.key, label: item.label.trim() });
      }
      sub[mk] = list;
    }
    // Ensure every main category has at least an empty sub list.
    for (const m of main) if (!sub[m.key]) sub[m.key] = [];
    storage.setSetting("categories", JSON.stringify({ main, sub }));
    res.json({ main, sub });
  });

  // ===== 小红书采集 · 扫码登录 =====
  app.get("/api/scrape/login/status", (_req: Request, res: Response) => {
    // 只看内存里是否还有活的浏览器会话。
    // 重启服务后浏览器进程就没了，哪怕数据库里 cookie 在也不能用来采集。
    const active = getActiveSession();
    if (active) {
      const saved = hasSavedCookies();
      res.json({ saved: true, updatedAt: saved.updatedAt || Date.now() });
    } else {
      res.json({ saved: false, updatedAt: 0 });
    }
  });
  app.post("/api/scrape/login/start", async (_req: Request, res: Response) => {
    const r = await startLoginSession();
    if (!r.ok) return res.status(500).json({ message: r.error });
    res.json({ ok: true });
  });
  app.get("/api/scrape/login/screenshot", async (_req: Request, res: Response) => {
    const r = await captureScreenshot();
    if (!r.ok) return res.status(400).json({ message: r.error });
    res.json({ image: r.image, status: r.status, message: r.message });
  });
  app.post("/api/scrape/login/check", async (_req: Request, res: Response) => {
    const r = await checkLoginStatus();
    res.json(r);
  });
  app.post("/api/scrape/login/close", async (_req: Request, res: Response) => {
    await closeLoginSession();
    res.json({ ok: true });
  });

  // ===== 采集任务 =====
  app.post("/api/scrape/run", async (req: Request, res: Response) => {
    const schema = z.object({
      keywords: z.array(z.string().min(1).max(50)).min(1).max(5),
      targetCategory: z.string().min(1),
      targetSubcategory: z.string().default(""),
      limit: z.number().int().min(1).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "参数不合法" });
    }
    const r = await startScrapeTask(parsed.data);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ taskId: r.taskId });
  });

  app.get("/api/scrape/jobs/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const task = storage.getScrapeJob(id);
    if (!task) return res.status(404).json({ error: "任务不存在" });
    res.json(task);
  });

  // ===== 演示采集：不调小红书，直接走 mock 数据走成一次「完整流程」 =====
  app.post("/api/scrape/run-demo", async (req: Request, res: Response) => {
    const schema = z.object({
      keywords: z.array(z.string().min(1).max(50)).min(1).max(5),
      targetCategory: z.string().min(1),
      targetSubcategory: z.string().default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "参数不合法" });
    }
    const { keywords, targetCategory, targetSubcategory } = parsed.data;
    const bundle = getDemoBundle(targetCategory, targetSubcategory);

    const task = storage.createScrapeJob({
      keyword: keywords.join(" + "),
      target_category: targetCategory,
      target_subcategory: targetSubcategory,
      status: "running",
      total_seen: 0,
      total_kept: 0,
      message: "已开始采集·演示模式",
      started_at: Date.now(),
      finished_at: 0,
    });

    // 后台异步跱​「采集」进度：总时长约 8 秒，一边涨 total_seen，一边逐条插入岗位。
    (async () => {
      const totalParsed = bundle.totalParsed;
      const jobs = bundle.jobs;
      const insertPoints = jobs.map((_, i) =>
        Math.floor(((i + 1) / jobs.length) * totalParsed),
      );
      let nextInsertIdx = 0;
      let kept = 0;
      for (let i = 1; i <= totalParsed; i++) {
        await new Promise((r) => setTimeout(r, 250));
        // 到该插的点就插一条真岗位
        while (
          nextInsertIdx < jobs.length &&
          insertPoints[nextInsertIdx] === i
        ) {
          const j = jobs[nextInsertIdx];
          storage.createJob({
            company: j.company,
            title: j.title,
            location: j.location,
            salary_range: j.salary_range,
            description: j.description,
            jd_raw: j.jd_raw,
            tags: JSON.stringify(j.tags),
            source_name: j.source_name,
            source_url: j.source_url,
            note_author: j.note_author,
            category: j.category,
            subcategory: j.subcategory,
            raw_content: "",
            posted_at: Date.now(),
            scraped_at: Date.now(),
          } as any);
          kept += 1;
          nextInsertIdx += 1;
        }
        storage.updateScrapeJob(task.id, {
          total_seen: i,
          total_kept: kept,
          message: `(${i}/${totalParsed}) 解析中·演示模式`,
        });
      }
      storage.updateScrapeJob(task.id, {
        status: "done",
        message: `完成：共解析 ${totalParsed} 条，入库 ${kept} 条招聘帖`,
        finished_at: Date.now(),
      });
    })().catch((err) => {
      console.error("[demo-scrape] failed:", err);
      storage.updateScrapeJob(task.id, {
        status: "failed",
        message: "演示采集出错",
        finished_at: Date.now(),
      });
    });

    res.json({ taskId: task.id });
  });

  app.get("/api/scrape/jobs", (_req: Request, res: Response) => {
    res.json(storage.listScrapeJobs(20));
  });

  // 临时调试：dump 搜索页 DOM
  app.post("/api/scrape/debug-dump", async (req: Request, res: Response) => {
    const kw = (req.body?.keyword || "互联网产品").toString();
    try {
      const r = await debugDumpSearchPage(kw);
      res.json(r);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "dump failed" });
    }
  });

  // ===== Jobs =====
  app.get("/api/jobs", (req: Request, res: Response) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const includeHidden = req.query.include_hidden === "1" || req.query.include_hidden === "true";
    const rows = storage.listJobs(category, includeHidden);
    res.json(rows.map((r) => ({ ...r, tags: safeJson(r.tags, []) })));
  });

  app.get("/api/jobs/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const job = storage.getJob(id);
    if (!job) return res.status(404).json({ message: "not found" });
    res.json({ ...job, tags: safeJson(job.tags, []) });
  });

  // Update a job's category / subcategory / job_status. Used by the
  // 「移动到其他分类」 UI 和岗位卡上的「隐藏」「标记为已投递」按钮。
  app.patch("/api/jobs/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const patch: {
      category?: string;
      subcategory?: string;
      job_status?: string;
      company?: string;
      title?: string;
      location?: string;
      salary_range?: string;
      description?: string;
      tags?: string;
    } = {};
    if (typeof body.category === "string" && body.category.trim()) {
      patch.category = body.category.trim();
    }
    if (typeof body.subcategory === "string") {
      patch.subcategory = body.subcategory.trim();
    }
    if (typeof body.job_status === "string") {
      const s = body.job_status.trim();
      if (!["new", "applied", "hidden"].includes(s)) {
        return res.status(400).json({ message: `未知状态: ${s}` });
      }
      patch.job_status = s;
    }
    if (typeof body.company === "string" && body.company.trim()) {
      patch.company = body.company.trim();
    }
    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (typeof body.location === "string") {
      patch.location = body.location.trim();
    }
    if (typeof body.salary_range === "string") {
      patch.salary_range = body.salary_range.trim();
    }
    if (typeof body.description === "string") {
      patch.description = body.description; // 保留原样换行
    }
    if (Array.isArray(body.tags)) {
      patch.tags = JSON.stringify(body.tags.map(String).filter(Boolean).slice(0, 10));
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "什么都没改" });
    }
    const cats = readCategories();
    if (patch.category !== undefined) {
      const ok = cats.main.some((m: any) => m.key === patch.category);
      if (!ok) return res.status(400).json({ message: `未知大类: ${patch.category}` });
    }
    const effectiveCategory = patch.category ?? storage.getJob(id)?.category;
    if (patch.subcategory && patch.subcategory.length > 0 && effectiveCategory) {
      const subs = cats.sub?.[effectiveCategory] || [];
      const ok = subs.some((s: any) => s.key === patch.subcategory);
      if (!ok) {
        return res.status(400).json({
          message: `二级分类 ${patch.subcategory} 不在 ${effectiveCategory} 下`,
        });
      }
    }
    const updated = storage.updateJob(id, patch);
    if (!updated) return res.status(404).json({ message: "not found" });
    res.json({ ...updated, tags: safeJson(updated.tags, []) });
  });

  // 删除岗位（主要给手动录入的岗位用）
  app.delete("/api/jobs/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const job = storage.getJob(id);
    if (!job) return res.status(404).json({ message: "not found" });
    storage.deleteJob(id);
    res.json({ ok: true });
  });

  // 一键「标记为已投递」：
  //   · 创建一条 application 记录
  //   · 将该岗位的 job_status 设为 'applied'
  app.post("/api/jobs/:id/mark-applied", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const job = storage.getJob(id);
    if (!job) return res.status(404).json({ message: "岗位不存在" });
    const now = Date.now();
    const initEvent = { at: now, kind: "created" as const, to: "applied" };
    const app_ = storage.createApplication({
      job_id: id,
      company: job.company,
      title: job.title,
      applied_at: now,
      status: "applied",
      notes: "",
      jd_url: job.source_url || "",
      events: JSON.stringify([initEvent]),
    });
    storage.updateJob(id, { job_status: "applied" });
    res.json({ ok: true, application_id: app_.id });
  });

  // 手动录入一个岗位。与采集入口隔离，该路由只接受用户填写的字段。
  app.post("/api/jobs/manual", (req: Request, res: Response) => {
    const body = req.body || {};
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!company || !title) {
      return res.status(400).json({ message: "公司和岗位为必填" });
    }
    const cats = readCategories();
    const category =
      typeof body.category === "string" && cats.main.some((m: any) => m.key === body.category)
        ? body.category
        : cats.main[0]?.key || "internet";
    const subcategory =
      typeof body.subcategory === "string" &&
      (cats.sub?.[category] || []).some((s: any) => s.key === body.subcategory)
        ? body.subcategory
        : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const salary_range = typeof body.salary_range === "string" ? body.salary_range.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const source_url = typeof body.source_url === "string" ? body.source_url.trim() : "";
    const tagsRaw = body.tags;
    let tagsStr = "[]";
    if (Array.isArray(tagsRaw)) {
      tagsStr = JSON.stringify(tagsRaw.map(String).filter(Boolean).slice(0, 10));
    } else if (typeof tagsRaw === "string" && tagsRaw.trim()) {
      tagsStr = JSON.stringify(
        tagsRaw
          .split(/[,\u3001\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10),
      );
    }
    const now = Date.now();
    const created = storage.createJob({
      company,
      title,
      category,
      subcategory,
      location,
      salary_range,
      description,
      source_url,
      source_name: "手动录入",
      source: "manual",
      job_status: "new",
      posted_at: now,
      scraped_at: now,
      tags: tagsStr,
      note_author: "",
      keyword: "",
      raw_content: "",
    });
    res.json({ ...created, tags: safeJson(created.tags, []) });
  });

  // ===== Applications =====
  app.get("/api/applications", (_req: Request, res: Response) => {
    res.json(storage.listApplications());
  });

  app.post("/api/applications", (req: Request, res: Response) => {
    const parsed = insertApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid body", errors: parsed.error.errors });
    }
    const created = storage.createApplication(parsed.data);
    res.json(created);
  });

  app.patch("/api/applications/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    // event_at is an optional UI-only hint (ms timestamp) used when the user
    // backdates a status change. It is not a column on the applications table,
    // so we extract it before zod validation and forward it to storage.
    const { event_at, ...rest } = (req.body || {}) as Record<string, unknown>;
    const schema = insertApplicationSchema.partial();
    const parsed = schema.safeParse(rest);
    if (!parsed.success) {
      return res.status(400).json({ message: "invalid body", errors: parsed.error.errors });
    }
    const eventAtNum =
      typeof event_at === "number"
        ? event_at
        : typeof event_at === "string"
          ? Number(event_at)
          : undefined;
    const updated = storage.updateApplication(id, {
      ...parsed.data,
      ...(Number.isFinite(eventAtNum as number) ? { event_at: eventAtNum as number } : {}),
    });
    if (!updated) return res.status(404).json({ message: "not found" });
    res.json(updated);
  });

  app.delete("/api/applications/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    storage.deleteApplication(id);
    res.json({ ok: true });
  });

  // ===== Resume optimization =====
  app.post(
    "/api/optimize-resume",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        let resumeText = "";
        const file = (req as any).file as Express.Multer.File | undefined;
        if (file) {
          const parsed = await parseResume(file);
          resumeText = parsed.text;
        } else if (typeof req.body.resume_text === "string") {
          resumeText = req.body.resume_text;
        }
        const jdText = typeof req.body.jd_text === "string" ? req.body.jd_text : "";
        const jobIdRaw = req.body.job_id;
        const jobId = jobIdRaw ? Number(jobIdRaw) : null;
        const filename = file?.originalname || "";

        if (!resumeText.trim()) {
          return res.status(400).json({ message: "请上传简历或粘贴简历文本" });
        }
        if (!jdText.trim()) {
          return res.status(400).json({ message: "请提供目标岗位 JD" });
        }

        // Diagnostic logging + early garbled-PDF detection
        if (file) {
          const diag = assessExtractedText(resumeText);
          console.log(
            `[optimize-resume] file=${filename} size=${file.size} chars=${diag.totalChars} cjk=${diag.cjkChars} ascii=${diag.asciiChars} pua=${diag.puaChars} repl=${diag.replacementChars} readable=${diag.ratioReadable.toFixed(2)} ok=${diag.ok}`,
          );
          if (!diag.ok) {
            return res.status(400).json({
              message: diag.reason || "PDF 解析失败，请改用粘贴文本模式",
              diagnostics: diag,
            });
          }
        }

        const userMessage =
          `【目标岗位 JD】\n${jdText}\n\n【用户当前简历】\n${resumeText}\n\n请按系统指令输出严格的 JSON。`;

        // First attempt. Use larger max_tokens because a full optimized
        // Chinese resume + 10 suggestions can easily exceed 4096 tokens and
        // get truncated mid-string, which causes JSON parse failures.
        const msg = await llmCreate({
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        const rawText = msg.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");

        let parsed = tryParseJson(rawText);
        let rawForLog = rawText;

        // Retry once with explicit feedback if the first response was not parseable JSON.
        if (!parsed) {
          console.warn(
            `[optimize-resume] json parse failed on first attempt. raw head=${rawText.slice(0, 300)}`,
          );
          try {
            const retry = await llmCreate({
              max_tokens: 8000,
              system: SYSTEM_PROMPT,
              messages: [
                { role: "user", content: userMessage },
                { role: "assistant", content: rawText },
                {
                  role: "user",
                  content:
                    "你上一次返回的内容不是合法的 JSON（疑似有字符串内未转义的双引号、未转义换行符、或多余文字）。请重新输出一份严格合法的 JSON：\n- 直接以 { 开头，以 } 结尾\n- 任何字符串内要强调关键词一律用中文引号「」，不要用 ASCII 双引号\n- 字符串内换行用 \\n\n- 不要任何解释文字、不要 markdown 围栏",
                },
              ],
            });
            const retryText = retry.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("\n");
            parsed = tryParseJson(retryText);
            rawForLog = retryText;
            if (parsed) {
              console.log("[optimize-resume] retry succeeded");
            } else {
              console.warn(
                `[optimize-resume] retry also failed. retry head=${retryText.slice(0, 300)}`,
              );
            }
          } catch (retryErr: any) {
            console.warn("[optimize-resume] retry threw", retryErr?.message);
          }
        }

        if (!parsed) {
          return res.json({
            ...fallbackResult(
              "AI 返回结果解析失败（已重试一次）。建议改用「粘贴文本」模式，或在下方按照建议逐段修改",
            ),
            raw: rawForLog.slice(0, 2000),
          });
        }

        // Validate shape, fill defaults.
        const result = {
          score: clampScore(parsed.score),
          issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 8) : [],
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions
                .filter((s: any) => s && typeof s === "object")
                .map((s: any) => ({
                  original: String(s.original ?? ""),
                  revised: String(s.revised ?? ""),
                  reason: String(s.reason ?? ""),
                }))
                .slice(0, 12)
            : [],
          optimized_resume_text:
            typeof parsed.optimized_resume_text === "string"
              ? parsed.optimized_resume_text
              : "",
        };

        const saved = storage.createOptimization({
          original_filename: filename,
          job_id: jobId,
          jd_text: jdText,
          result_json: JSON.stringify(result),
          created_at: Date.now(),
        });

        res.json({
          id: saved.id,
          ...result,
        });
      } catch (err: any) {
        console.error("optimize-resume error", err);
        res.status(500).json({
          message: err?.message || "AI 服务暂时不可用，请稍后再试",
        });
      }
    },
  );

  // Download optimized resume as docx.
  app.get("/api/optimizations/:id/download", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const opt = storage.getOptimization(id);
    if (!opt) return res.status(404).json({ message: "not found" });
    let parsed: any = {};
    try {
      parsed = JSON.parse(opt.result_json);
    } catch {
      return res.status(500).json({ message: "data corrupted" });
    }
    const text: string = parsed.optimized_resume_text || "";
    const buf = await buildDocx(text);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="optimized_resume_${id}.docx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.send(buf);
  });

  // ===== Interview reviews =====
  app.get("/api/interview-reviews", (req: Request, res: Response) => {
    const jobIdRaw = req.query.job_id;
    const jobId =
      typeof jobIdRaw === "string" && jobIdRaw.length > 0 ? Number(jobIdRaw) : undefined;
    const rows = storage.listInterviewReviews(
      jobId !== undefined && Number.isFinite(jobId) ? (jobId as number) : undefined,
    );
    // Avoid sending the full transcript in list view—keep payload small.
    res.json(
      rows.map((r) => ({
        ...r,
        transcript: r.transcript ? r.transcript.slice(0, 200) : "",
        report_json: "", // hide details in list
      })),
    );
  });

  app.get("/api/interview-reviews/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const row = storage.getInterviewReview(id);
    if (!row) return res.status(404).json({ message: "not found" });
    res.json(row);
  });

  // Manual creation — no audio, user just wants to log a session.
  // Company and title are required.
  app.post("/api/interview-reviews", (req: Request, res: Response) => {
    const body = req.body || {};
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!company || !title) {
      return res.status(400).json({ message: "公司和岗位为必填项" });
    }
    const userNotes = typeof body.user_notes === "string" ? body.user_notes : "";
    const interviewDate =
      body.interview_date != null && Number.isFinite(Number(body.interview_date))
        ? Number(body.interview_date)
        : Date.now();
    let jobId: number | null = null;
    if (
      body.job_id != null &&
      Number.isFinite(Number(body.job_id)) &&
      Number(body.job_id) > 0
    ) {
      jobId = Number(body.job_id);
    }
    const created = storage.createInterviewReview({
      job_id: jobId,
      company,
      title,
      audio_filename: "",
      interview_date: interviewDate,
      duration_sec: 0,
      transcript: "",
      report_json: "{}",
      user_notes: userNotes,
      status: "manual",
      error_message: "",
      created_at: Date.now(),
    });
    res.json(created);
  });

  app.delete("/api/interview-reviews/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    storage.deleteInterviewReview(id);
    res.json({ ok: true });
  });

  app.patch("/api/interview-reviews/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const patch: Partial<{ user_notes: string; company: string; title: string; job_id: number | null }> = {};
    if (typeof body.user_notes === "string") patch.user_notes = body.user_notes;
    if (typeof body.company === "string") patch.company = body.company;
    if (typeof body.title === "string") patch.title = body.title;
    if (body.job_id === null) patch.job_id = null;
    else if (typeof body.job_id === "number" && Number.isFinite(body.job_id)) {
      patch.job_id = body.job_id;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "什么都没改" });
    }
    const updated = storage.updateInterviewReview(id, patch as any);
    if (!updated) return res.status(404).json({ message: "not found" });
    res.json(updated);
  });

  // ===== Chunked audio upload =====
  // Step 1: client posts metadata, gets back upload_id.
  app.post("/api/interview-reviews/upload-init", async (req: Request, res: Response) => {
    const { filename, media_type, total_chunks, job_id, company, title, interview_date } = req.body || {};
    const totalChunks = Number(total_chunks);
    if (!Number.isFinite(totalChunks) || totalChunks < 1 || totalChunks > 200) {
      return res.status(400).json({ message: "无效的分片数" });
    }
    const safeName = String(filename || "audio").replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_");
    const uploadId = crypto.randomUUID();
    const tmpDir = path.join(os.tmpdir(), "offergo_audio");
    try {
      await mkdir(tmpDir, { recursive: true });
    } catch {}
    const tmpPath = path.join(tmpDir, `${uploadId}_${safeName}`);
    // Create empty file.
    await writeFile(tmpPath, Buffer.alloc(0));
    pendingUploads.set(uploadId, {
      tmpPath,
      mediaType: String(media_type || "audio/mpeg"),
      originalName: String(filename || "audio"),
      totalChunks,
      receivedChunks: 0,
      jobId: job_id != null && Number.isFinite(Number(job_id)) ? Number(job_id) : null,
      company: typeof company === "string" ? company : "",
      title: typeof title === "string" ? title : "",
      interviewDate:
        interview_date != null && Number.isFinite(Number(interview_date))
          ? Number(interview_date)
          : Date.now(),
      createdAt: Date.now(),
    });
    res.json({ upload_id: uploadId });
  });

  // Step 2: client appends each chunk in order.
  app.post(
    "/api/interview-reviews/upload-chunk",
    audioChunkUpload.single("chunk"),
    async (req: Request, res: Response) => {
      const uploadId = String(req.body.upload_id || "");
      const chunkIndex = Number(req.body.chunk_index);
      const file = (req as any).file as Express.Multer.File | undefined;
      const pending = pendingUploads.get(uploadId);
      if (!pending) {
        return res.status(404).json({ message: "上传会话不存在或已过期" });
      }
      if (!file) {
        return res.status(400).json({ message: "未接收到分片" });
      }
      if (!Number.isFinite(chunkIndex) || chunkIndex !== pending.receivedChunks) {
        return res.status(400).json({
          message: `分片序号不匹配: 期望 ${pending.receivedChunks}，实际 ${chunkIndex}`,
        });
      }
      try {
        await appendFile(pending.tmpPath, file.buffer);
        pending.receivedChunks += 1;
        res.json({
          received: pending.receivedChunks,
          total: pending.totalChunks,
        });
      } catch (err: any) {
        res.status(500).json({ message: err?.message || "写入分片失败" });
      }
    },
  );

  // Step 3: client signals all chunks uploaded; server creates a 'processing' row,
  // returns immediately, and runs transcription + analysis in the background.
  app.post("/api/interview-reviews/upload-complete", async (req: Request, res: Response) => {
    const uploadId = String(req.body.upload_id || "");
    const pending = pendingUploads.get(uploadId);
    if (!pending) {
      return res.status(404).json({ message: "上传会话不存在或已过期" });
    }
    if (pending.receivedChunks !== pending.totalChunks) {
      return res.status(400).json({
        message: `分片未完成: ${pending.receivedChunks}/${pending.totalChunks}`,
      });
    }

    // Snapshot company/title from job if linked.
    let snapCompany = pending.company;
    let snapTitle = pending.title;
    if (pending.jobId && Number.isFinite(pending.jobId)) {
      const job = storage.getJob(pending.jobId);
      if (job) {
        snapCompany = job.company;
        snapTitle = job.title;
      }
    }

    // Create a placeholder row so the client can poll.
    const placeholder = storage.createInterviewReview({
      job_id: pending.jobId,
      company: snapCompany,
      title: snapTitle,
      audio_filename: pending.originalName,
      interview_date: pending.interviewDate || Date.now(),
      duration_sec: 0,
      transcript: "",
      report_json: "{}",
      user_notes: "",
      status: "processing",
      error_message: "",
      created_at: Date.now(),
    });

    // Free the upload session map entry; we keep the file path locally to clean up later.
    const tmpPath = pending.tmpPath;
    const mediaType = pending.mediaType;
    pendingUploads.delete(uploadId);

    // Respond immediately. The proxy 5-min timeout is no longer a concern.
    res.json({ id: placeholder.id, status: "processing" });

    // Kick off background processing. Don't await.
    void processReviewAsync(placeholder.id, tmpPath, mediaType, snapCompany, snapTitle);
  });

  // POST variant: accept text directly (used when frontend has it in memory).
  app.post("/api/download-resume", async (req: Request, res: Response) => {
    const text = String((req.body && req.body.text) || "");
    const buf = await buildDocx(text);
    res.setHeader("Content-Disposition", `attachment; filename="optimized_resume.docx"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.send(buf);
  });

  return httpServer;
}

// Run a Python helper script and parse its JSON stdout.
async function runPython(scriptPath: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => {
      stdout += d.toString("utf-8");
    });
    py.stderr.on("data", (d) => {
      stderr += d.toString("utf-8");
    });
    py.on("error", (e) => reject(e));
    py.on("close", (code) => {
      if (stderr) console.warn(`[python ${path.basename(scriptPath)} stderr] ${stderr.slice(0, 500)}`);
      try {
        // Use only the last JSON-looking line of stdout.
        const trimmed = stdout.trim();
        const lastBrace = trimmed.lastIndexOf("{");
        const slice = lastBrace >= 0 ? trimmed.slice(lastBrace) : trimmed;
        const parsed = JSON.parse(slice);
        if (code !== 0 && !parsed.error) {
          parsed.error = `python exited with code ${code}`;
        }
        resolve(parsed);
      } catch (e: any) {
        reject(new Error(`python output not JSON (code=${code}): ${stdout.slice(0, 200)} | stderr=${stderr.slice(0, 200)}`));
      }
    });
  });
}

const INTERVIEW_SYSTEM_PROMPT = `你是一位资深面试辅导顾问，专精中国互联网和 AI 行业的商科岗位（产品 / 运营 / 分析）面试复盘。

任务：基于面试录音转写稿（含「面试官」和「我」两个角色），输出一份结构化复盘报告。

输出严格的 JSON 格式（不要任何 markdown 包裹，不要任何解释文字，直接以 { 开头以 } 结尾），字段如下：
{
  "questions": [
    {
      "question": "面试官问的问题原文或准确概括",
      "my_answer": "我的回答概括（20-60 字）",
      "score": 1-5 的整数打分,
      "comment": "这个回答的亮点与不足（30-60 字）",
      "improvement": "「下次可以这样回答」的具体重写示范 / 提升动作（30-80 字，要可操作，能点出具体结构、数据点或关键表达）"
    }
  ],
  "follow_ups": [
    {
      "question": "被反复追问的问题或面试官重点关注的点",
      "competency": "这个问题考查的能力，如「结构化思维」「数据敏感度」「用户同理心」「商业判断力」等",
      "note": "针对这项能力的提升建议（30-60 字）"
    }
  ],
  "summary": {
    "strengths": ["表现的 2-4 个亮点"],
    "weaknesses": ["需要改进的 2-4 个点"],
    "lessons": ["下次面试需要注意的 2-4 条经验教训"]
  }
}

【关键 JSON 格式约束】
- 字符串值内部禁止出现未转义的 ASCII 双引号 "，需要强调关键词请一律用中文引号「」
- 字符串内不要出现真实换行符，需要换行请使用 \\n
- 直接以 { 开头，以 } 结尾，不要 markdown 围栏

原则：
1. 打分要负责任、不要水：5=出色 / 4=良好 / 3=及格 / 2=偏弱 / 1=明显不足
2. 评语要具体，能说出哪里好 / 哪里不够，不要「回答不错」这种空话
3. improvement 必须可操作：不是「要更有逻辑」这种空话，而是「可以用 STAR 结构重讲：先说背景为 XX，然后…」这种能直接拿去用的提示，可以举例、提供句式、点名要补充的数据或背景
4. follow_ups 重点抽取面试官「被反复问」「追问、请举例」的题，反映薄弱能力点
5. summary 三段互不重复：strengths 说亮点，weaknesses 说问题，lessons 说可操作的下次改进动作
6. 如果转写稿信息太少或模糊，仍须输出合法 JSON，字段允许为空数组但不能为缺失`;

async function analyzeInterview(
  transcript: string,
  company: string,
  title: string,
): Promise<any> {
  const ctx = company || title ? `【面试背景】\n公司: ${company || "未填"}\n岗位: ${title || "未填"}\n\n` : "";
  const userMessage = `${ctx}【面试录音转写稿】\n${transcript}\n\n请按系统指令输出严格的 JSON 复盘报告。`;
  const msg = await llmCreate({
    max_tokens: 6000,
    system: INTERVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const rawText = msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  let parsed = tryParseJson(rawText);
  if (!parsed) {
    // One retry with explicit correction.
    try {
      const retry = await llmCreate({
        max_tokens: 6000,
        system: INTERVIEW_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: rawText },
          {
            role: "user",
            content:
              "你上一次返回的内容不是合法 JSON，请重新输出一份严格合法的 JSON：直接以 { 开头以 } 结尾，字符串内不要出现未转义的 ASCII 双引号。",
          },
        ],
      });
      const retryText = retry.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");
      parsed = tryParseJson(retryText);
    } catch {}
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      questions: [],
      follow_ups: [],
      summary: {
        strengths: [],
        weaknesses: ["AI 返回结果解析失败"],
        lessons: ["请重新上传或汇报问题给开发者"],
      },
    };
  }
  // Normalize shape.
  return {
    questions: Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((q: any) => q && typeof q === "object")
          .map((q: any) => ({
            question: String(q.question ?? ""),
            my_answer: String(q.my_answer ?? ""),
            score: Math.max(1, Math.min(5, Math.round(Number(q.score) || 0))),
            comment: String(q.comment ?? ""),
            improvement: String(q.improvement ?? ""),
          }))
          .slice(0, 20)
      : [],
    follow_ups: Array.isArray(parsed.follow_ups)
      ? parsed.follow_ups
          .filter((f: any) => f && typeof f === "object")
          .map((f: any) => ({
            question: String(f.question ?? ""),
            competency: String(f.competency ?? ""),
            note: String(f.note ?? ""),
          }))
          .slice(0, 10)
      : [],
    summary: {
      strengths: Array.isArray(parsed.summary?.strengths)
        ? parsed.summary.strengths.map(String).slice(0, 6)
        : [],
      weaknesses: Array.isArray(parsed.summary?.weaknesses)
        ? parsed.summary.weaknesses.map(String).slice(0, 6)
        : [],
      lessons: Array.isArray(parsed.summary?.lessons)
        ? parsed.summary.lessons.map(String).slice(0, 6)
        : [],
    },
  };
}

// Background pipeline: transcribe via Python helper, analyze via Anthropic,
// then update the placeholder row. Errors are captured into the row so the
// frontend can show a useful message via polling.
async function processReviewAsync(
  reviewId: number,
  tmpPath: string,
  mediaType: string,
  company: string,
  title: string,
): Promise<void> {
  const scriptPath = path.resolve(process.cwd(), "server", "transcribe.py");
  try {
    // 1) Transcribe.
    const t0 = Date.now();
    const tr = await runPython(scriptPath, [tmpPath, mediaType || "audio/mpeg"]);
    if (tr?.error) {
      throw new Error(`转写失败: ${String(tr.error).slice(0, 200)}`);
    }
    const transcript = String(tr?.text || "").trim();
    const durationSec = Math.max(0, Math.round(Number(tr?.duration_sec) || 0));
    if (!transcript) {
      throw new Error("转写结果为空，请检查录音是否有效或确认有清晰人声");
    }
    console.log(
      `[interview-review ${reviewId}] transcribed ${transcript.length} chars in ${Math.round((Date.now() - t0) / 1000)}s`,
    );

    // 2) Analyze.
    const t1 = Date.now();
    const report = await analyzeInterview(transcript, company, title);
    console.log(
      `[interview-review ${reviewId}] analyzed in ${Math.round((Date.now() - t1) / 1000)}s`,
    );

    // 3) Persist results.
    storage.updateInterviewReview(reviewId, {
      transcript,
      report_json: JSON.stringify(report),
      duration_sec: durationSec,
      status: "done",
      error_message: "",
    });
  } catch (err: any) {
    const message = err?.message || String(err) || "未知错误";
    console.warn(`[interview-review ${reviewId}] failed: ${message}`);
    try {
      storage.updateInterviewReview(reviewId, {
        status: "failed",
        error_message: message.slice(0, 500),
      });
    } catch (e) {
      console.warn(`[interview-review ${reviewId}] also failed to record error:`, e);
    }
  } finally {
    // Always clean up the temp upload.
    try {
      await unlink(tmpPath);
    } catch {}
  }
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function clampScore(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function buildDocx(text: string): Promise<Buffer> {
  // Very lightweight markdown-ish parser: split lines, render headings vs body.
  const lines = (text || "").split(/\r?\n/);
  const paragraphs: Paragraph[] = [];
  for (const lineRaw of lines) {
    const line = lineRaw.replace(/\s+$/g, "");
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun("")] }));
      continue;
    }
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const li = line.match(/^[-*]\s+(.*)/);
    if (h1) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: h1[1], bold: true })],
        }),
      );
    } else if (h2) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: h2[1], bold: true })],
        }),
      );
    } else if (h3) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: h3[1], bold: true })],
        }),
      );
    } else if (li) {
      paragraphs.push(
        new Paragraph({ bullet: { level: 0 }, children: [new TextRun(li[1])] }),
      );
    } else {
      // Render inline bold from **bold**.
      const segments: TextRun[] = [];
      const re = /\*\*([^*]+)\*\*/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        if (m.index > last) segments.push(new TextRun(line.slice(last, m.index)));
        segments.push(new TextRun({ text: m[1], bold: true }));
        last = m.index + m[0].length;
      }
      if (last < line.length) segments.push(new TextRun(line.slice(last)));
      if (segments.length === 0) segments.push(new TextRun(line));
      paragraphs.push(new Paragraph({ children: segments }));
    }
  }
  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}
