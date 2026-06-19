import { useGetTodaySessions, getGetTodaySessionsQueryKey, useGetMySessions, getGetMySessionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Users, Activity, CheckCircle2, LogIn } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function MyTodayStatus() {
  const today = todayStr();
  const params = { date: today };
  const { data, isLoading, error } = useGetMySessions(params, {
    query: { queryKey: getGetMySessionsQueryKey(params) },
  });

  const active = useMemo(() => data?.find((s) => !s.endTime), [data]);
  const completedCount = useMemo(() => data?.filter((s) => s.endTime).length ?? 0, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">오늘 내 출입 상태</CardTitle>
          <CardDescription className="text-xs mt-0.5">본인의 오늘 체크인/체크아웃 현황입니다.</CardDescription>
        </div>
        <Link href="/my-sessions">
          <Button variant="ghost" size="sm">자세히 보기</Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : error ? (
          <div className="text-sm text-destructive">데이터를 불러오지 못했습니다.</div>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            오늘 출입 기록이 없습니다.
          </div>
        ) : active ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
              <LogIn className="h-3 w-3" /> 이용중
            </span>
            <span className="text-muted-foreground">{active.startTime} 체크인</span>
            {completedCount > 0 && (
              <span className="text-muted-foreground">· 오늘 완료 {completedCount}건</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
              <CheckCircle2 className="h-3 w-3" /> 체크아웃 완료
            </span>
            <span className="text-muted-foreground">오늘 {completedCount}건 완료</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StaffDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">오늘의 현황</h2>
        <p className="text-muted-foreground mt-1">본인의 오늘 출입 상태입니다.</p>
      </div>
      <MyTodayStatus />
    </div>
  );
}

function AdminDashboard() {
  const { data: sessions, isLoading, error } = useGetTodaySessions({
    query: { queryKey: getGetTodaySessionsQueryKey() },
  });

  const stats = useMemo(() => {
    if (!sessions) return { active: 0, completed: 0, avgDuration: 0, total: 0 };

    const active = sessions.filter(s => !s.endTime).length;
    const completed = sessions.filter(s => s.endTime);
    const totalDuration = completed.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
    const avgDuration = completed.length > 0 ? Math.round(totalDuration / completed.length) : 0;

    return {
      active,
      completed: completed.length,
      total: sessions.length,
      avgDuration
    };
  }, [sessions]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive space-y-4">
        <Activity className="h-12 w-12" />
        <p>데이터를 불러오는데 실패했습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">오늘의 현황</h2>
        <p className="text-muted-foreground mt-1">실시간 세션 및 출결 상태 모니터링</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">활성 세션</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{stats.active}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">현재 체크인 상태인 사용자</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 총 체크인</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{stats.total}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">총 생성된 세션 수</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 이용 시간</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{stats.avgDuration} <span className="text-sm font-normal text-muted-foreground">분</span></div>
            )}
            <p className="text-xs text-muted-foreground mt-1">종료된 세션 기준</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>실시간 세션 목록</CardTitle>
          <CardDescription>오늘 생성된 모든 세션의 현재 상태입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : sessions?.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-4 opacity-50" />
              <p>오늘 기록된 세션이 없습니다.</p>
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <div className="grid grid-cols-4 bg-muted/50 p-3 text-sm font-medium text-muted-foreground border-b border-border">
                <div>이름</div>
                <div>체크인 시간</div>
                <div>체크아웃 시간</div>
                <div>상태</div>
              </div>
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                {sessions?.map((session) => (
                  <div key={session.id} className="grid grid-cols-4 p-3 text-sm items-center hover:bg-muted/30 transition-colors">
                    <div className="font-medium">{session.userName}</div>
                    <div>{session.startTime}</div>
                    <div className="text-muted-foreground">{session.endTime || "-"}</div>
                    <div>
                      {session.endTime ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          완료 ({session.durationMinutes}분)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          이용중
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "staff") return <StaffDashboard />;
  return <AdminDashboard />;
}
