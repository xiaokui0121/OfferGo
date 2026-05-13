/**
 * 临时调试：让活跃会话的 page 去搜索页，dump DOM 结构
 * 通过 HTTP 端点触发: POST /api/scrape/debug-dump
 */
import { getActiveSession } from "./xhs-login";
import fs from "fs";

export async function debugDumpSearchPage(keyword: string) {
  const active = getActiveSession();
  if (!active) return { ok: false, error: "no active session" };
  const { page } = active;

  const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(1500);
  }

  // 先拽根部顶部的筛选标签信息
  const tabs = await page.evaluate(() => {
    const out: { text: string; href: string }[] = [];
    // 小红书搜索结果页顺部筛选 tab 一般是 a 或 div，可能装在某个容器里
    document.querySelectorAll('a, [role="tab"], [class*="tab"], [class*="filter"]').forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t && t.length <= 6 && /^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(t)) {
        const href = (el as HTMLAnchorElement).href || "";
        out.push({ text: t, href });
      }
    });
    return out;
  });

  const dump = await page.evaluate(() => {
    // 所有 a 链接，看哪些 href 模式存在
    const allHrefs: Record<string, number> = {};
    document.querySelectorAll("a").forEach((a) => {
      const h = (a as HTMLAnchorElement).href || "";
      const key = h.replace(/\?.*$/, "").replace(/\/[0-9a-f]{20,}/i, "/<ID>");
      allHrefs[key] = (allHrefs[key] || 0) + 1;
    });
    // body 前 500 字
    const bodyText = (document.body?.innerText || "").slice(0, 800);
    // 查找笔记卡片可能的容器 class
    const candidateClasses: string[] = [];
    document.querySelectorAll('[class*="note"], [class*="card"], [class*="feed"]').forEach((el) => {
      const c = (el as HTMLElement).className;
      if (typeof c === "string" && c.length < 200) candidateClasses.push(c);
    });
    return {
      url: location.href,
      title: document.title,
      bodyText,
      hrefSummary: Object.entries(allHrefs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30),
      candidateClasses: Array.from(new Set(candidateClasses)).slice(0, 20),
      anchorCount: document.querySelectorAll("a").length,
    };
  });
  (dump as any).tabs = tabs;

  await page.screenshot({ path: "/tmp/xhs-search-debug.png", fullPage: false });
  fs.writeFileSync("/tmp/xhs-search-debug.json", JSON.stringify(dump, null, 2));
  return { ok: true, dump };
}
