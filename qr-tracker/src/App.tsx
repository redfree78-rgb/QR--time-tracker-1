import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Users from "@/pages/users";
import Sessions from "@/pages/sessions";
import MySessions from "@/pages/my-sessions";
import Scan from "@/pages/scan";
import Accounts from "@/pages/accounts";
import Login from "@/pages/login";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Users as UsersIcon, CalendarClock, QrCode, Menu, LogOut, ShieldCheck, UserCircle, Settings, ClipboardList } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000 },
  },
});

const allNavItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard, roles: ["admin", "staff"] },
  { path: "/users", label: "이용자 관리", icon: UsersIcon, roles: ["admin"] },
  { path: "/sessions", label: "이용 내역", icon: CalendarClock, roles: ["admin"] },
  { path: "/my-sessions", label: "내 출입 기록", icon: ClipboardList, roles: ["staff"] },
  { path: "/accounts", label: "계정 관리", icon: Settings, roles: ["admin"] },
  { path: "/scan", label: "QR 스캔", icon: QrCode, roles: ["admin", "staff"] },
] as const;

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = allNavItems.filter((item) =>
    user ? (item.roles as readonly string[]).includes(user.role) : false
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-30 flex flex-col transition-transform duration-300",
          "bg-sidebar text-sidebar-foreground",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto"
        )}
      >
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-white">QR 출입 관리</div>
              <div className="text-xs text-sidebar-foreground/50">서비스 이용 현황</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              href={path}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location === path
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 pb-4 space-y-2 border-t border-sidebar-border pt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/20">
            <div className="w-7 h-7 rounded-full bg-sidebar-primary/60 flex items-center justify-center flex-shrink-0">
              {user?.role === "admin"
                ? <ShieldCheck className="w-3.5 h-3.5 text-white" />
                : <UserCircle className="w-3.5 h-3.5 text-white" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{user?.displayName}</div>
              <div className="text-[10px] text-sidebar-foreground/40">
                {user?.role === "admin" ? "관리자" : "직원"}
              </div>
            </div>
          </div>
          <button
            onClick={() => { logout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  const navItems = allNavItems.filter((item) =>
    user ? (item.roles as readonly string[]).includes(user.role) : false
  );
  const currentNav = navItems.find((n) => n.path === location);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-4 px-4 lg:px-6 h-14 border-b bg-card shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-md hover:bg-muted"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-sm text-foreground">
            {currentNav?.label ?? "QR 출입 관리"}
          </h1>
          <div className="ml-auto text-xs text-muted-foreground">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function StaffRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/my-sessions" component={MySessions} />
        <Route path="/scan" component={Scan} />
        <Route component={() => <NotFound />} />
      </Switch>
    </Layout>
  );
}

function AdminRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/users" component={Users} />
        <Route path="/sessions" component={Sessions} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/scan" component={Scan} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-sidebar flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          <p className="text-white/60 text-sm">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return user.role === "admin" ? <AdminRouter /> : <StaffRouter />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
