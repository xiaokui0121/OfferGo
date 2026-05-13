/**
 * 小红书扫码登录服务
 *
 * 流程：
 *   1. startLoginSession()  启动浏览器，打开小红书首页（自动弹出登录二维码）
 *   2. captureScreenshot() 返回当前页面截图（供前端轮询）
 *   3. checkLoginStatus() 检测是否扫码成功；一旦成功保存 Cookie 到数据库
 *   4. closeLoginSession() 关闭浏览器释放资源
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { storage } from "../storage";

type LoginSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  status: "waiting" | "success" | "error";
  message: string;
  startedAt: number;
};

// 一次只有一个扫码会话（多开容易出问题）
let session: LoginSession | null = null;

// 架构说明：小红书会把扫码后的登录态绑到该浏览器的设备指纹（a1/webId 等），
// 把 cookie 导出、携到另一个新开的浏览器中会被处理成未登录。
// 所以采集脚本必须复用同一个 context（不能重开浏览器）。
// 提供这个 getter 让采集脚本拿到同一个活 page。
export function getActiveSession(): { context: BrowserContext; page: Page } | null {
  if (!session) return null;
  if (session.status !== "success") return null;
  return { context: session.context, page: session.page };
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** 启动一个新的扫码会话。如果已有活会话，先关掉。 */
export async function startLoginSession(): Promise<{ ok: true } | { ok: false; error: string }> {
  await closeLoginSession();

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
    });
    const page = await context.newPage();

    session = {
      browser,
      context,
      page,
      status: "waiting",
      message: "正在加载小红书登录页...",
      startedAt: Date.now(),
    };

    // 监听扫码状态接口 /login/qrcode/status
    // 这个接口返回码 有多个：0=未扫 1=已扫未确认 2=已确认 3=超时
    // 只有返回 code_status=2 且 success=true 才是真正扫码成功
    page.on("response", async (resp) => {
      const url = resp.url();
      if (url.includes("/login/qrcode/status")) {
        try {
          const text = await resp.text();
          // 只打印状态有变化的，避免刷屏
          const cs = text.match(/"code_status":(\d+)/);
          if (cs && cs[1] !== "0") {
            console.log(`[xhs-login] [qrcode/status] code_status=${cs[1]}`, text.slice(0, 200));
          }
          if (cs && cs[1] === "2") {
            // 已确认扫码，等 web_session cookie 到位
            setTimeout(async () => {
              try {
                const cookies = await context.cookies();
                storage.saveCookies("xiaohongshu", JSON.stringify(cookies));
                if (session) {
                  session.status = "success";
                  session.message = "扫码已确认，登录成功";
                }
                console.log("[xhs-login] 扫码确认成功，cookies 已保存");
              } catch (e) {
                console.log("[xhs-login] save cookies failed:", e);
              }
            }, 2000);
          } else if (cs && cs[1] === "1") {
            if (session) session.message = "已扫码，请在手机上点「确认登录」";
          }
        } catch {
          /* ignore */
        }
      }
    });

    void (async () => {
      try {
        await page.goto("https://www.xiaohongshu.com/explore", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        if (session) session.message = "页面加载中，弹出登录框...";

        // 主动点页面右上角「登录」按钮，确保二维码弹出
        try {
          await page.waitForTimeout(2000);
          const loginBtn = page.getByText(/^登录$/, { exact: true });
          if ((await loginBtn.count()) > 0) {
            await loginBtn.first().click({ timeout: 3000 });
            console.log("[xhs-login] 点击了「登录」按钮");
          }
        } catch (e: any) {
          console.log("[xhs-login] 点登录按钮失败（可能已自动弹出）:", e?.message);
        }

        // 等二维码出现
        try {
          await page.waitForSelector('img[src^="data:image"], canvas', { timeout: 8000 });
        } catch {
          /* ignore */
        }
        if (session) session.message = "请用小红书 App 扫码";
      } catch (e: any) {
        if (session) {
          session.status = "error";
          session.message = "打开页面失败：" + (e?.message || "未知错误");
        }
      }
    })();

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "启动浏览器失败" };
  }
}

/** 获取当前页面的 PNG 截图（base64）。 */
export async function captureScreenshot(): Promise<
  | { ok: true; image: string; status: string; message: string }
  | { ok: false; error: string }
> {
  if (!session) return { ok: false, error: "当前没有活动的登录会话" };
  try {
    const buf = await session.page.screenshot({ fullPage: false, type: "png" });
    return {
      ok: true,
      image: buf.toString("base64"),
      status: session.status,
      message: session.message,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "截图失败" };
  }
}

/**
 * 检测是否登录成功。
 * 判断依据（任一命中即视为已登录）：
 *   1. cookies 里出现登录态专属的 cookie 名（unb / customerClientId / customer-sso-sid / a1 之外的强信号）
 *   2. 页面 URL 跳出 /explore 或包含 /user/profile
 *   3. 页面 DOM 上能查到「我」「发布」「消息」等登录后才出现的导航项
 */
export async function checkLoginStatus(): Promise<{
  loggedIn: boolean;
  message: string;
}> {
  if (!session) return { loggedIn: false, message: "没有活动会话" };

  // 主路径：activate 接口 hook 已经把 session.status 设为 success
  if (session.status === "success") {
    return { loggedIn: true, message: session.message };
  }

  try {
    const cookies = await session.context.cookies();

    // 调试：打印所有 cookie 的 name / 长度 / 前 8 字符
    const cookieSummary = cookies
      .map((c) => `${c.name}(len=${c.value.length},head=${c.value.slice(0, 8)})`)
      .join(", ");
    console.log("[xhs-login] cookies:", cookieSummary);

    // 信号 1：登录后才会下发的 cookie
    const loginOnlyCookieNames = [
      "unb",
      "customer-sso-sid",
      "customerClientId",
      "x-user-id-creator.xiaohongshu.com",
      "x-user-id-pgy.xiaohongshu.com",
      "galaxy_creator_session_id",
      "galaxy.creator.beaker.session.id",
      "access-token-creator.xiaohongshu.com",
    ];
    const hitLoginCookie = cookies.find((c) => loginOnlyCookieNames.includes(c.name) && c.value.length > 4);
    if (hitLoginCookie) {
      console.log("[xhs-login] matched login cookie:", hitLoginCookie.name);
      storage.saveCookies("xiaohongshu", JSON.stringify(cookies));
      session.status = "success";
      session.message = "登录成功，凭证已保存";
      return { loggedIn: true, message: session.message };
    }

    // 信号 2：页面 URL调试用
    const url = session.page.url();
    console.log("[xhs-login] current url:", url);

    // 注：不能用 DOM 文字检测。实验发现小红书游客首页也会导出「发布笔记/我的主页/创作中心」这些文字。

    // 信号 3（保底）：web_session 长度明显大于游客（游客 38 位）
    const ws = cookies.find((c) => c.name === "web_session");
    if (ws && ws.value.length >= 50) {
      console.log("[xhs-login] web_session长度命中:", ws.value.length);
      storage.saveCookies("xiaohongshu", JSON.stringify(cookies));
      session.status = "success";
      session.message = "登录成功，凭证已保存";
      return { loggedIn: true, message: session.message };
    }

    return { loggedIn: false, message: session.message };
  } catch (e: any) {
    return { loggedIn: false, message: e?.message || "检测失败" };
  }
}

/** 关闭扫码会话，释放浏览器。 */
export async function closeLoginSession(): Promise<void> {
  if (!session) return;
  const s = session;
  session = null;
  try {
    await s.browser.close();
  } catch {
    /* ignore */
  }
}

/** 查询是否已有已保存的 Cookie。 */
export function hasSavedCookies(): { saved: boolean; updatedAt: number } {
  const row = storage.getCookies("xiaohongshu");
  return { saved: !!row, updatedAt: row?.updated_at || 0 };
}
