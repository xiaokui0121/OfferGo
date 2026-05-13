import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/jobs", label: "岗位" },
  { href: "/scrape", label: "采集岗位" },
  { href: "/resume", label: "简历优化" },
  { href: "/dashboard", label: "投递看板" },
  { href: "/interview", label: "面试复盘" },
];

export function NavBar() {
  const [location] = useLocation();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground hover-elevate -mx-2 px-2 py-1 rounded-md"
          data-testid="link-home"
        >
          <Logo className="text-foreground" />
          <span>OfferGo</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active =
              location === l.href || (l.href !== "/" && location.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                data-testid={`link-${l.href.replace("/", "")}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13.5px] font-medium hover-elevate",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <div
            aria-label="头像占位"
            className="ml-2 h-7 w-7 rounded-full border border-border bg-muted text-[11px] font-semibold flex items-center justify-center text-muted-foreground"
            data-testid="avatar-placeholder"
          >
            AV
          </div>
        </nav>
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-6xl px-6 py-6 text-[12px] text-muted-foreground flex items-center justify-between">
          <span>OfferGo · 商科招聘助手 Demo</span>
          <span>数据来自小红书博主聚合（演示数据）</span>
        </div>
      </footer>
    </div>
  );
}
