import { useMemo, useState } from "react";
import {
  useGetMySessions,
  getGetMySessionsQueryKey,
  type GetMySessionsParams,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, Activity, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function currentMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

// Build last 12 month options (YYYY-MM), newest first.
function recentMonthOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월` });
  }
  return out;
}

type Mode = "month" | "range";

type SessionRow = {
  id: number;
  date: string;
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number | null;
};

export default function MySessions() {
  const [tab, setTab] = useState<"today" | "history">("today");
  const [mode, setMode] = useState<Mode>("month");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr());
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const today = todayStr();
  const monthOptions = useMemo(() => recentMonthOptions(), []);

  // Today
  const todayParams: GetMySessionsParams = { date: today };
  const { data: todaySessions, isLoading: loadingToday } = useGetMySessions(
    todayParams,
    { query: { queryKey: getGetMySessionsQueryKey(todayParams) } },
  );

  // History (month or range)
  const historyParams = useMemo<GetMySessionsParams>(() => {
    if (mode === "month") return { month: selectedMonth };
    const p: GetMySessionsParams = {};
    if (fromDate) p.from = fromDate;
    if (toDate) p.to = toDate;
    return p;
  }, [mode, selectedMonth, fromDate, toDate]);

  const rangeReady = mode === "month" ? !!selectedMonth : !!(fromDate || toDate);

  const { data: historySessions, isLoading: loadingHistory } = useGetMySessions(
    historyParams,
    {
      query: {
        queryKey: getGetMySessionsQueryKey(historyParams),
        enabled: tab === "history" && rangeReady,
      },
    },
  );

  const stats = useMemo(() => {
    const list = historySessions ?? [];
    const completed = list.filter((s) => s.endTime);
    const totalMinutes = completed.reduce((a, c) => a + (c.durationMinutes ?? 0), 0);
    return { total: list.length, completed: completed.length, totalMinutes };
  }, [historySessions]);

  const csvHref = useMemo(() => {
    const sp = new URLSearchParams();
    if (mode === "month") {
      sp.set("month", selectedMonth);
    } else {
      if (fromDate) sp.set("from", fromDate);
      if (toDate) sp.set("to", toDate);
    }
    const qs = sp.toString();
    return `/api/sessions/mine/export.csv${qs ? `?${qs}` : ""}`;
  }, [mode, selectedMonth, fromDate, toDate]);

  const historyTitle = useMemo(() => {
    if (mode === "month") {
      const m = monthOptions.find((o) => o.value === selectedMonth);
      return m?.label ?? selectedMonth;
    }
    if (fromDate && toDate) return `${fromDate} ~ ${toDate}`;
    if (fromDate) return `${fromDate} 이후`;
    if (toDate) return `${toDate} 이전`;
    return "기간을 선택하세요";
  }, [mode, selectedMonth, fromDate, toDate, monthOptions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">내 출입 기록</h2>
        <p className="text-muted-foreground mt-1">
          오늘 또는 원하는 기간의 본인 출입 내역을 확인하세요.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "today" | "history")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="today">오늘</TabsTrigger>
          <TabsTrigger value="history">지난 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>오늘 ({today})</CardTitle>
              <CardDescription>오늘 본인의 출입 내역입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingToday ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !todaySessions || todaySessions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
                  <CalendarDays className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p>오늘 출입 기록이 없습니다.</p>
                </div>
              ) : (
                <SessionList sessions={todaySessions} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>기간 선택</CardTitle>
              <CardDescription>월 단위 또는 직접 기간을 지정해 조회할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">조회 방식</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">월 선택</SelectItem>
                      <SelectItem value="range">기간 선택</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mode === "month" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">월</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">시작일</Label>
                      <Input
                        type="date"
                        value={fromDate}
                        max={toDate || undefined}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">종료일</Label>
                      <Input
                        type="date"
                        value={toDate}
                        min={fromDate || undefined}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="출입 횟수"
              value={`${stats.total}회`}
              icon={Activity}
              loading={loadingHistory}
            />
            <StatCard
              label="완료된 세션"
              value={`${stats.completed}회`}
              icon={CalendarDays}
              loading={loadingHistory}
            />
            <StatCard
              label="총 이용 시간"
              value={`${Math.floor(stats.totalMinutes / 60)}시간 ${stats.totalMinutes % 60}분`}
              icon={Clock}
              loading={loadingHistory}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{historyTitle}</CardTitle>
                  <CardDescription>선택한 기간의 본인 출입 내역입니다.</CardDescription>
                </div>
                <a
                  href={csvHref}
                  download
                  aria-disabled={!rangeReady || !historySessions || historySessions.length === 0}
                  className={
                    !rangeReady || !historySessions || historySessions.length === 0
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                >
                  <Button variant="outline" className="gap-2" size="sm">
                    <Download className="h-4 w-4" />
                    CSV 내보내기
                  </Button>
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {!rangeReady ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
                  <CalendarDays className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p>조회할 기간을 먼저 선택해주세요.</p>
                </div>
              ) : loadingHistory ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !historySessions || historySessions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
                  <CalendarDays className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p>해당 기간의 출입 기록이 없습니다.</p>
                </div>
              ) : (
                <SessionList sessions={historySessions} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionList({ sessions }: { sessions: SessionRow[] }) {
  return (
    <div className="rounded-md border border-border">
      <div className="grid grid-cols-4 bg-muted/50 p-3 text-sm font-medium text-muted-foreground border-b border-border">
        <div>날짜</div>
        <div>체크인</div>
        <div>체크아웃</div>
        <div>상태</div>
      </div>
      <div className="divide-y divide-border">
        {sessions.map((s) => (
          <div key={s.id} className="grid grid-cols-4 p-3 text-sm items-center hover:bg-muted/30">
            <div className="font-mono text-muted-foreground">{s.date}</div>
            <div>{s.startTime}</div>
            <div className="text-muted-foreground">{s.endTime ?? "-"}</div>
            <div>
              {s.endTime ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                  완료 ({s.durationMinutes}분)
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                  이용중
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}
