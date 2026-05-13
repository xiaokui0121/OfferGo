import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/NavBar";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Stats = {
  totalJobs: number;
  byCategory: Record<string, number>;
  totalApplications: number;
  applicationsByStatus: Record<string, number>;
};

type CategoryItem = { key: string; label: string };
type CategoriesConfig = {
  main: CategoryItem[];
  sub: Record<string, CategoryItem[]>;
};

// Static taglines / badges for the built-in categories. New custom categories
// added by the user just fall back to a generic description.
const CATEGORY_META: Record<string, { description: string; badge?: string }> = {
  internet: {
    description: "字节、美团、小红书、B站 等内容/电商/本地生活公司",
    badge: "热门",
  },
  ai_startup: {
    description: "Moonshot、智谱、MiniMax、阶跃星辰 等大模型公司",
  },
  other: {
    description: "宝洁、麦肯锡、SHEIN、喜茶 等消费 / 咨询 / 跨境 / 新茶饮",
  },
};

function greetingText() {
  const now = new Date();
  const h = now.getHours();
  let salutation = "晚上好";
  if (h < 5) salutation = "夜深了";
  else if (h < 12) salutation = "早上好";
  else if (h < 18) salutation = "下午好";

  // 用「YYYY 年 M 月 D 日 · 周X」格式（适配上海时区,浏览器本地时间已是 CST）
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dateLabel = `${y} 年 ${m} 月 ${d} 日 · ${weekdayCN[now.getDay()]}`;
  return { salutation, dateLabel };
}

export default function Home() {
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: cats } = useQuery<CategoriesConfig>({ queryKey: ["/api/categories"] });
  const { salutation, dateLabel } = useMemo(greetingText, []);
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const categories = useMemo(
    () =>
      (cats?.main || []).map((m) => ({
        key: m.key,
        title: m.label,
        description: CATEGORY_META[m.key]?.description || "自定义大类",
        badge: CATEGORY_META[m.key]?.badge,
      })),
    [cats],
  );

  function submitKeyword(e?: React.FormEvent) {
    e?.preventDefault();
    const k = keyword.trim();
    if (!k) return;
    navigate(`/jobs?keyword=${encodeURIComponent(k)}`);
  }

  return (
    <PageShell>
      <section className="pt-2 pb-10">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
          {salutation}，<span data-testid="text-username">Avery</span>
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground" data-testid="text-date">
          今天是 <span className="text-foreground/80 font-medium">{dateLabel}</span>
        </p>
        <p className="mt-1 text-[14px] text-muted-foreground" data-testid="text-stats-summary">
          本周共聚合{" "}
          <span className="font-medium text-foreground" data-testid="text-total-jobs">
            {stats?.totalJobs ?? "—"}
          </span>{" "}
          个商科可投岗位 · 你已投递{" "}
          <span className="font-medium text-foreground" data-testid="text-total-apps">
            {stats?.totalApplications ?? "—"}
          </span>{" "}
          个
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => {
          const count = stats?.byCategory?.[c.key] ?? 0;
          return (
            <Link
              key={c.key}
              href={`/jobs?category=${c.key}`}
              data-testid={`card-category-${c.key}`}
              className={cn(
                "group relative rounded-lg border border-border bg-card p-5 transition-colors",
                "hover:border-foreground/30 hover-elevate",
              )}
            >
              {c.badge && (
                <span className="absolute right-4 top-4 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground">
                  {c.badge}
                </span>
              )}
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-semibold tracking-tight text-foreground">
                  {c.title}
                </span>
                <span
                  className="text-[12px] text-muted-foreground"
                  data-testid={`count-${c.key}`}
                >
                  {count} 个岗位
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {c.description}
              </p>
              <div className="mt-6 flex items-center gap-1 text-[12.5px] font-medium text-foreground">
                查看岗位
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}

        {/* 自定义关键词卡 */}
        <form
          onSubmit={submitKeyword}
          data-testid="card-category-custom"
          className="group relative rounded-lg border border-dashed border-border bg-card p-5 hover:border-foreground/40 transition-colors"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-tight text-foreground">
              自定义
            </span>
            <span className="text-[12px] text-muted-foreground">关键词搜索</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            没看到合适的方向？输入关键词跳到岗位列表
          </p>
          <div className="mt-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="input-custom-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="例如：品牌、私域、SaaS…"
                className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-[12.5px] outline-none focus:border-foreground/30"
              />
            </label>
          </div>
          <button
            type="submit"
            data-testid="button-custom-search"
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground hover:underline"
          >
            去搜索
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>
      </section>

      <section className="mt-14">
        <div className="rounded-lg border border-border bg-card p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">
              上传你的简历，让 AI 帮你定制每一份投递
            </h2>
            <p className="mt-2 text-[13.5px] text-muted-foreground max-w-xl">
              针对商科同学的常见简历模板，给出匹配度评分、逐条改写建议，并可下载
              Word 文件，让每一次投递都更接近 Offer。
            </p>
          </div>
          <Link
            href="/resume"
            data-testid="button-cta-resume"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground hover-elevate active-elevate"
          >
            前往简历优化
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
