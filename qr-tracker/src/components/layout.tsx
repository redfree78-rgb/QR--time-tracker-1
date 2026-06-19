import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Users, LayoutDashboard, CalendarDays, ScanLine, Wifi, WifiOff, KeyRound } from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { daysSince, PASSWORD_MAX_AGE_DAYS } from "@/lib/password";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: health, isError } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const { user } = useAuth();
  const pwAgeDays = daysSince(user?.passwordUpdatedAt);
  const showPwReminder = pwAgeDays != null && pwAgeDays >= PASSWORD_MAX_AGE_DAYS;

  const navItems = [
    { href: "/", label: "대시보드", icon: LayoutDashboard },
    { href: "/scan", label: "QR 스캔", icon: ScanLine },
    { href: "/users", label: "사용자 관리", icon: Users },
    { href: "/sessions", label: "세션 기록", icon: CalendarDays },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <ScanLine className="h-6 w-6" />
            ATTEND
          </h1>
          <p className="text-xs text-muted-foreground mt-1">전문가용 근태 관리 시스템</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  data-testid={`nav-item-${item.href.replace("/", "") || "home"}`}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border flex items-center gap-2 text-xs">
          {isError || health?.status !== "ok" ? (
            <><WifiOff className="h-4 w-4 text-destructive" /> <span className="text-destructive">서버 연결 끊김</span></>
          ) : (
            <><Wifi className="h-4 w-4 text-green-500" /> <span className="text-green-500">서버 연결 정상</span></>
          )}
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card flex justify-around p-2 z-50">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div className="flex flex-col items-center p-2 cursor-pointer">
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] mt-1 ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {showPwReminder && (
            <div
              className="mb-4 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="banner-password-expiring"
            >
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">비밀번호 변경이 필요합니다</p>
                <p className="text-xs mt-0.5 text-amber-800">
                  마지막 변경 후 {pwAgeDays}일이 지났습니다. 보안을 위해 90일마다
                  비밀번호를 변경해주세요. {user?.role === "admin"
                    ? "계정 관리 페이지에서 변경할 수 있습니다."
                    : "관리자에게 문의해주세요."}
                </p>
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
