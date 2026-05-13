/**
 * 小红书招聘帖采集 —— 单关键词流水线
 *
 * 关键架构决策：
 *   小红书会把扫码后的登录态绑到该浏览器的设备指纹（a1/webId/IP 等），cookie 导到新开的浏览器中就失效。
 *   所以采集脚本必须复用扫码时的同一个 Playwright context，不能重开浏览器。
 *
 * 流程：
 *   1. 通过 getActiveSession() 拿到扫码时保留下来的 page
 *   2. navigate 到搜索结果页，滚动若干屏，提取笔记列表
 *   3. 逐条点开详情，抓正文
 *   4. 喂给 LLM 判断「是否招聘」+ 抽结构化字段
 *   5. 不是招聘 / 已存在 → 跳过；是招聘 → 写入 jobs 表
 */
import OpenAI from "openai";
import { storage } from "../storage";
import { getActiveSession } from "./xhs-login";

// 读取用户的分类配置（跟 routes 里面的 readCategories 一致）
// 抽出来是为了让 LLM 可以跨分类判定。
type CategoryItem = { key: string; label: string };
type CategoriesConfig = {
  main: CategoryItem[];
  sub: Record<string, CategoryItem[]>;
};
const DEFAULT_CATEGORIES: CategoriesConfig = {
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
    ai_startup: [],
    other: [],
  },
};
function readUserCategories(): CategoriesConfig {
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

// 单例：同一时刻只跑一个采集任务
let currentTaskId: number | null = null;

export function getCurrentTaskId() {
  return currentTaskId;
}

type Note = {
  noteId: string;
  title: string;
  author: string;
  url: string;
};

type ExtractedJob = {
  is_recruitment: boolean;
  company?: string;
  title?: string;
  location?: string;
  salary_range?: string;
  description?: string;
  tags?: string[];
  reason_if_skip?: string;
  // 跨分类匹配：LLM 识别出该招聘贴属于哪个用户分类
  matched_category?: string; // main key
  matched_subcategory?: string; // sub key (可能为空)
};

function buildSystemPrompt(cats: CategoriesConfig): string {
  // 拼接分类说明，让 LLM 能判断贴属于哪个用户分类。
  const lines: string[] = [];
  for (const m of cats.main) {
    const subs = (cats.sub?.[m.key] || []).map((s) => `${s.key}=${s.label}`).join(", ");
    lines.push(`- ${m.key}=${m.label}${subs ? `。二级: ${subs}` : "。无二级"}`);
  }
  const categoryDoc = lines.join("\n");

  return `你是招聘信息整理助手，代表「招聘方/HR/团队负责人」的视角，从小红书笔记里筛选出「能让求职者投简历的招聘贴」。

【任务一：是否为招聘帖】is_recruitment=true 的核心判定（宽松，宁可错收不漏掉）：

核心条件（必须）：
A. 发布者在「代表某个公司/团队/产品在招人或内推」。语气包括：「我们招」「we are hiring」「内推」「招人啦」「招聘」「join us」「在招」「找人」「招募」等。
B. **必须能识别出具体的公司/产品/团队名**——必须是一个实体名称，例如「字节跳动」「Moonshot AI」「智谱」「Apexmind」「小红书」「Kimi」这种。
   **以下一律不算**（这些帖大概率是广告/引流）：
   - 泛指：「某公司」「某初创」「某大厂」「互联网公司」「一家 AI 公司」「创业公司」「AI 初创公司」「上海某 AI」「出海大模型团队」
   - 一个字或两个字的模糊称呼：「本团队」「我司」「本公司」
   - 只有行业/场景描述没公司名：「智能智能眼镜项目」「一个社区产品」
   这种情况 is_recruitment=false，reason_if_skip 写「公司名模糊/未明说」。

辅助条件（任一即可，不必全有）：
- 出现具体岗位名（产品经理/运营/算法/设计/HR/实习生等）
- 含投递方式（邮箱/微信号/扫码/私信/小红书私信/V信/wx/内推码）
- 含 JD/职责/要求/薪资/地点/任意一项

明确反例（必跳，is_recruitment=false）：
- 以「我/本人」为主语讲求职经历、面试感受、入职体验、离职心得
- 求职者发的「求内推/有朋友招人吗/求介绍」
- 简历优化/面试辅导/课程/培训/带货/面经总结/项目拆解/纯行业科普
- 通篇只有标题没任何招聘相关内容

判定原则：标题或正文里能明显看出「这家在招人，看了帖能去投简历」就给 true。即便正文加载不全、没邮箱、没详细 JD，只要标题或开头明显是公司在招人（如「我们招人啦 | XX公司」「XX 公司招产品」「XX 实习生招聘」），都给 true。

【任务二：跨分类匹配】
用户在产品中建立了下面几个分类，每个分类可能有二级：
${categoryDoc}

如果是招聘帖，判定该岗位最匹配哪个大类，输出大类的 key。如果该大类下有二级且能匹配上，输出二级 key；匹配不上输出空字符串。例如「AI 初创公司招 AI 产品经理」→ ai_startup，二级空；「字节招增长运营」→ internet / operations。

**重要：matched_category 严禁输出 "other" 或任何泛义类别**。如果该岗位无法明确归入用户配置的具体大类（互联网、初创 AI 产品等），就输出 matched_category="" 让系统自动回退。例如咨询/金融/保安/餐饮等明显不属于用户关注范围的招聘，要么 is_recruitment=false（无关），要么 matched_category=""，绝不要写 other。

【任务三：jd_raw 与 description 分开输出】
- **jd_raw**：从原帖里**逐句保留**「岗位职责」「任职要求」「薪资/地点/汇报/坑位亮点」「投递方式」这几块。保留原始换行、原始序号与项目符号（-/•/、/1./一、等）。最多 1500 字。只过滤「安全验证/请稍后重试/评论/点赞/关注/发布于/小红书/APP/下载/扫码」这些网页噪音与 emoji，其他什么都不要去动。如果原帖只有标题没有职责要求详情，jd_raw 输出空字符串。
- **description**：在 jd_raw 基础上提炼一个紧凑总结，中文句号、顺快 3 句话，不超 300 字，涵盖负责内容 + 核心要求，用于列表预览。
- jd_raw 是原文保留，description 是总结，两者都要输出。
- 如果笔记正文报错或由于加载不完只有标题，依据标题+公司名推理出一句话 description，jd_raw 为空。

【输出格式】严格 JSON：
{
  "is_recruitment": true/false,
  "company": "具体公司/团队名",
  "title": "具体岗位名",
  "location": "杭州/北京/远程等，没写空字符串",
  "salary_range": "25-40k·14薪 这种格式，没写空字符串",
  "description": "不超 300 字的紧凑总结",
  "jd_raw": "原帖里拼接的完整 JD 原文，保留原换行与项目符号，最多 1500 字，没有详情则为空字符串",
  "tags": ["标签"],
  "matched_category": "匹配的大类 key，都匹配不上输出空字符串",
  "matched_subcategory": "匹配的二级 key，没有输出空字符串",
  "reason_if_skip": "若 false，说明哪个条件不满足（1 句）"
}

记住：宁可错杀不可误收。只输出 JSON。`;
}

const anthropic = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://offergo.app",
    "X-Title": "OfferGo",
  },
});

/** 解析 LLM 返回的 JSON（容忍代码块包裹） */
function parseJsonLoose(text: string): ExtractedJob | null {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last < 0) return null;
  try {
    return JSON.parse(s.slice(first, last + 1));
  } catch {
    return null;
  }
}

async function extractJobFromNote(args: {
  title: string;
  content: string;
  systemPrompt: string;
}): Promise<ExtractedJob | null> {
  const userMessage = `【标题】\n${args.title}\n\n【正文】\n${args.content || "（无正文）"}`;
  try {
    const msg = await anthropic.chat.completions.create({
      model: "anthropic/claude-sonnet-4.5",
      max_tokens: 4000,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const text = msg.choices?.[0]?.message?.content || "";
    return parseJsonLoose(text);
  } catch (e: any) {
    console.error("[xhs-scrape] LLM 调用失败:", e?.message);
    return null;
  }
}

/** 主入口：开始一个采集任务（异步执行，立即返回 taskId） */
export async function startScrapeTask(args: {
  keywords: string[];
  targetCategory: string;
  targetSubcategory: string;
  limit?: number;
}): Promise<{ ok: true; taskId: number } | { ok: false; error: string }> {
  if (currentTaskId !== null) {
    const t = storage.getScrapeJob(currentTaskId);
    if (t && t.status === "running") {
      return { ok: false, error: `已有正在运行的采集任务（关键词：${t.keyword}），请等它跑完` };
    }
  }

  const active = getActiveSession();
  if (!active) {
    return {
      ok: false,
      error: "登录会话已关闭。请到「采集岗位」页面扫码登录后立刻开始采集（中途不要点取消）",
    };
  }

  const keywords = args.keywords.filter((k) => k && k.trim().length > 0);
  if (keywords.length === 0) {
    return { ok: false, error: "关键词为空" };
  }

  const displayKeyword = keywords.join(" / ");

  const task = storage.createScrapeJob({
    keyword: displayKeyword,
    target_category: args.targetCategory,
    target_subcategory: args.targetSubcategory,
    status: "queued",
    total_seen: 0,
    total_kept: 0,
    message: "排队中...",
    started_at: Date.now(),
    finished_at: 0,
  });

  currentTaskId = task.id;
  void runScrapeTask(task.id, keywords, args.targetCategory, args.targetSubcategory, args.limit ?? 100);

  return { ok: true, taskId: task.id };
}

async function runScrapeTask(
  taskId: number,
  keywords: string[],
  targetCategory: string,
  targetSubcategory: string,
  limit: number
) {
  let totalSeen = 0;
  let totalKept = 0;

  const setMsg = (m: string) => {
    storage.updateScrapeJob(taskId, { message: m, total_seen: totalSeen, total_kept: totalKept });
  };

  try {
    storage.updateScrapeJob(taskId, { status: "running", message: "复用扫码会话..." });

    const active = getActiveSession();
    if (!active) {
      throw new Error("登录会话已失效，请重新扫码");
    }
    const { page } = active;

    // 多关键词共用同一个 noteMap：按笔记 id 自动去重
    const noteMap = new Map<string, { title: string; author: string; url: string; keyword: string }>();

    const extractVisible = async () => {
      return await page.evaluate(() => {
        const items: { id: string; title: string; author: string; url: string }[] = [];
        document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]').forEach((a) => {
          const href = (a as HTMLAnchorElement).href;
          const m = href.match(/\/(search_result|explore)\/([0-9a-f]+)/i);
          if (!m) return;
          const id = m[2];
          let node: HTMLElement | null = a as HTMLElement;
          let titleText = "";
          let authorText = "";
          for (let depth = 0; depth < 6 && node; depth++) {
            const t = node.querySelector('.title, .note-title, [class*="title"]');
            if (t && !titleText) titleText = (t.textContent || "").trim();
            const au = node.querySelector('.author, .name, [class*="author"]');
            if (au && !authorText) authorText = (au.textContent || "").trim();
            if (titleText) break;
            node = node.parentElement;
          }
          if (!titleText) titleText = (a.textContent || "").trim().slice(0, 80);
          items.push({ id, title: titleText, author: authorText, url: href });
        });
        return items;
      });
    };

    // 依次跑每个关键词
    for (let ki = 0; ki < keywords.length; ki++) {
      const kw = keywords[ki];
      const prefix = `搜索 (${ki + 1}/${keywords.length}) ${kw}`;

      setMsg(`${prefix}：打开搜索页`);
      const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(
        kw
      )}&source=web_explore_feed`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);

      setMsg(`${prefix}：滚动加载...`);

      // 初始提取
      const initial = await extractVisible();
      for (const it of initial) {
        if (!noteMap.has(it.id)) noteMap.set(it.id, { ...it, keyword: kw });
      }

      let stableTimes = 0;
      let lastSize = noteMap.size;
      const MAX_SCROLL = 30; // 每个关键词最多滚 30 屏
      for (let i = 0; i < MAX_SCROLL; i++) {
        await page.evaluate(() => window.scrollBy(0, 1600));
        await page.waitForTimeout(1400);
        const cur = await extractVisible();
        for (const it of cur) {
          if (!noteMap.has(it.id)) noteMap.set(it.id, { ...it, keyword: kw });
        }

        if (noteMap.size === lastSize) {
          stableTimes++;
          if (stableTimes >= 3) {
            console.log(`[xhs-scrape] ${kw} 滚动 ${i + 1} 屏后稳定，累计 ${noteMap.size} 条`);
            break;
          }
        } else {
          stableTimes = 0;
          lastSize = noteMap.size;
        }
        setMsg(`${prefix}：已累计 ${noteMap.size} 条`);

        if (noteMap.size >= limit) break;
      }

      // 已收够就不跑后续关键词了
      if (noteMap.size >= limit) {
        console.log(`[xhs-scrape] 已达上限 ${limit}，停止后续关键词`);
        break;
      }
    }

    const notes: (Note & { keyword: string })[] = Array.from(noteMap.values()).map((v) => ({
      noteId: "",
      title: v.title,
      author: v.author,
      url: v.url,
      keyword: v.keyword,
    }));

    console.log(`[xhs-scrape] 抓到 ${notes.length} 条候选笔记`);
    setMsg(`抓到 ${notes.length} 条候选笔记，开始逐条解析...`);

    const toProcess = notes.slice(0, limit);

    // 预计算分类 prompt（跨分类匹配用）
    const cats = readUserCategories();
    const systemPrompt = buildSystemPrompt(cats);

    // 详情页用新 tab 打开，避免主搜索页被反复跳转打断
    const context = page.context();
    for (let i = 0; i < toProcess.length; i++) {
      const n = toProcess[i];
      totalSeen = i + 1;
      setMsg(`(${i + 1}/${toProcess.length}) 解析：${n.title.slice(0, 30)}`);

      const dup = storage.findDuplicateJob(n.url);
      if (dup) continue;

      let content = "";
      // 详情页抓多一些内容，让 LLM 能抽到完整 JD
      let realAuthor = n.author;
      const detailPage = await context.newPage();
      try {
        const resp = await detailPage.goto(n.url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await detailPage.waitForTimeout(2500);

        // 检测小红书「笔记不可浏览」页
        const finalUrl = detailPage.url();
        if (finalUrl.includes("/404") || finalUrl.includes("error_code=300031")) {
          console.log("[xhs-scrape] 笔记被隐藏:", n.url);
          await detailPage.close();
          continue;
        }

        const detail = await detailPage.evaluate(() => {
          const text = (sel: string) => {
            const el = document.querySelector(sel);
            return (el?.textContent || "").trim();
          };
          // 小红书 PC 版详情页的正文容器
          const desc =
            text("#detail-desc") ||
            text(".note-text") ||
            text(".note-content") ||
            text('[class*="note-detail"] [class*="desc"]') ||
            text('[class*="desc"]') ||
            text('[class*="content"]') ||
            "";
          const author =
            text(".author-wrapper .name") ||
            text(".username") ||
            text('[class*="user"] [class*="name"]') ||
            "";
          // body 可能为 null（页面刚创建未渲染），打个保底
          const bodyText = document.body ? (document.body.innerText || "") : "";
          return { desc, author, fullText: bodyText.slice(0, 8000) };
        });
        content = (detail.desc && detail.desc.length >= 15) ? detail.desc.slice(0, 8000) : detail.fullText;
        if (detail.author) realAuthor = detail.author;
      } catch (e: any) {
        console.log("[xhs-scrape] 详情页加载失败:", n.url, e?.message);
        try { await detailPage.close(); } catch {}
        continue;
      }
      try { await detailPage.close(); } catch {}

      if (!content || content.length < 20) {
        console.log("[xhs-scrape] 正文空，跳过:", n.url);
        continue;
      }

      const extracted = await extractJobFromNote({
        title: n.title,
        content,
        systemPrompt,
      });
      if (!extracted || !extracted.is_recruitment) {
        console.log(
          "[xhs-scrape] 跳过非招聘帖:",
          n.title.slice(0, 40),
          "reason:",
          extracted?.reason_if_skip || "(无返回)",
        );
        continue;
      }
      if (!extracted.company || !extracted.title) {
        console.log(
          "[xhs-scrape] 跳过公司/岗位缺失:",
          n.title.slice(0, 40),
          "company=", extracted.company,
          "title=", extracted.title,
        );
        continue;
      }
      // 入库前一票否决：公司名模糊/泛指的一律丢掉（宁可错杀）
      const companyNorm = extracted.company.trim();
      const isVagueCompany = (() => {
        if (companyNorm.length < 2) return true;
        // 包含「某/未知/不详/不明」「未提及」「未公开」「佚名」
        const patterns = [
          /^某/,                                                  // 某公司/某初创/某大厂
          /^(一家|本|我司|本人|未知|佚名|不详|不明|未提及|未公开|未明说)/, // 一家XX/本团队等
          /^(互联网|创业|AI|出海|初创|大模型|生成式|消费|金融)公司$/i, // 「AI初创公司」「互联网公司」这种
          /^(北京|上海|杭州|深圳|广州|成都|南京|苏州)某/, // 「上海某」这种
          /^N\/?A$/i,
          /^null$/i,
          /^unknown$/i,
        ];
        if (patterns.some((p) => p.test(companyNorm))) return true;
        // 含「某」字且总长度不超过 8 字：「某 AI 初创」「某大模型团队」都是泛指
        if (companyNorm.includes("某") && companyNorm.length <= 10) return true;
        return false;
      })();
      if (isVagueCompany) {
        console.log(
          "[xhs-scrape] 跳过公司名模糊:",
          n.title.slice(0, 40),
          "company=", companyNorm,
        );
        continue;
      }

      // 跨分类匹配：LLM 说贴属于哪个用户分类就入哪个。
      // 只有 LLM 返回的 main key 实际存在于用户配置里才采用；
      // 否则回退到用户主动选中的 targetCategory。
      let finalCategory = targetCategory;
      let finalSubcategory = targetSubcategory;
      const mc = (extracted.matched_category || "").trim().toLowerCase();
      const ms = (extracted.matched_subcategory || "").trim();
      // 严禁落入 other / 泛义类别——只接受用户配置里非 other 的具体大类
      const isOtherKey = mc === "other" || mc === "其他" || mc === "misc";
      if (mc && !isOtherKey && cats.main.some((m) => m.key === mc)) {
        finalCategory = mc;
        // 二级必须在该大类下才算有效
        if (ms && (cats.sub?.[mc] || []).some((s) => s.key === ms)) {
          finalSubcategory = ms;
        } else {
          finalSubcategory = "";
        }
      }

      try {
        storage.createJob({
          company: extracted.company,
          title: extracted.title,
          category: finalCategory,
          subcategory: finalSubcategory,
          location: extracted.location || "",
          salary_range: extracted.salary_range || "",
          description: extracted.description || "",
          jd_raw: extracted.jd_raw || "",
          source_url: n.url,
          source_name: "小红书",
          source: "xhs",
          job_status: "new",
          posted_at: Date.now(),
          scraped_at: Date.now(),
          tags: JSON.stringify(extracted.tags || []),
          note_author: realAuthor || "",
          keyword: n.keyword,
          raw_content: content.slice(0, 4000),
        });
        totalKept++;
      } catch (e: any) {
        console.error("[xhs-scrape] 入库失败:", e?.message);
      }

      await page.waitForTimeout(800);
    }

    storage.updateScrapeJob(taskId, {
      status: "done",
      message: `完成：共解析 ${totalSeen} 条，入库 ${totalKept} 条招聘帖`,
      total_seen: totalSeen,
      total_kept: totalKept,
      finished_at: Date.now(),
    });
  } catch (e: any) {
    console.error("[xhs-scrape] 任务失败:", e);
    storage.updateScrapeJob(taskId, {
      status: "failed",
      message: "采集失败：" + (e?.message || "未知错误"),
      total_seen: totalSeen,
      total_kept: totalKept,
      finished_at: Date.now(),
    });
  } finally {
    // 不关浏览器！会话要保留给下一次采集
    if (currentTaskId === taskId) currentTaskId = null;
  }
}
