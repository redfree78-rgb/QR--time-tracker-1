import { useState, useMemo, useEffect } from "react";
import { useListSessions, getListSessionsQueryKey, useGetSessionsSummary, getGetSessionsSummaryQueryKey, useDeleteSession } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarDays, Search, Trash2, BarChart3, FileSpreadsheet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Snap an arbitrary YYYY-MM-DD to the Monday of its week (local time).
function mondayOf(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0 = Sun
  const offset = (dow + 6) % 7;
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function todayLocalStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function Sessions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [filterDate, setFilterDate] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [weekPickerDate, setWeekPickerDate] = useState<string>(() => todayLocalStr());

  const weekStart = useMemo(() => mondayOf(weekPickerDate), [weekPickerDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const [isDownloading, setIsDownloading] = useState(false);
  const handleWeeklyDownload = async () => {
    setIsDownloading(true);
    try {
      const url = `/api/sessions/weekly-export.xlsx?weekStart=${encodeURIComponent(weekStart)}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        let msg = `다운로드 실패 (${res.status})`;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") msg = body.error;
        } catch {
          // non-JSON error body — keep generic message
        }
        toast({ title: "엑셀 다운로드 실패", description: msg, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `weekly-summary-${weekStart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast({ title: "엑셀 다운로드 완료", description: `${weekStart} ~ ${weekEnd}` });
    } catch (err) {
      toast({
        title: "엑셀 다운로드 실패",
        description: err instanceof Error ? err.message : "네트워크 오류",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const shiftWeek = (delta: number) => {
    setWeekPickerDate(addDays(weekStart, delta * 7));
  };
  
  const listParams = {
    date: filterDate || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const { data: sessions, isLoading: isLoadingSessions } = useListSessions(
    listParams,
    { query: { queryKey: getListSessionsQueryKey(listParams) } }
  );

  const totalSessions = sessions?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE));
  const sessionItems = sessions?.items ?? [];

  // If the total shrinks (e.g. after deletions) and the current page no longer
  // exists, fall back to the last available page so the list isn't stuck empty.
  useEffect(() => {
    if (page > 0 && page >= totalPages) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  const handleFilterDateChange = (value: string) => {
    setFilterDate(value);
    setPage(0);
  };
  
  const { data: summary, isLoading: isLoadingSummary } = useGetSessionsSummary({
    query: { queryKey: getGetSessionsSummaryQueryKey() }
  });

  const deleteSession = useDeleteSession();

  const handleDelete = (id: number) => {
    if (!confirm("이 세션 기록을 삭제하시겠습니까?")) return;
    
    deleteSession.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSessionsSummaryQueryKey() });
          toast({ title: "세션 삭제 완료", description: "기록이 삭제되었습니다." });
        },
        onError: () => {
          toast({ title: "오류", description: "세션 삭제에 실패했습니다.", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">세션 기록</h2>
        <p className="text-muted-foreground mt-1">모든 이용 기록과 일별 통계를 확인합니다.</p>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="list">전체 세션 목록</TabsTrigger>
          <TabsTrigger value="summary">일별 요약 통계</TabsTrigger>
          <TabsTrigger value="weekly">주간 엑셀</TabsTrigger>
        </TabsList>
        
        <TabsContent value="list" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>세션 목록</CardTitle>
                  <CardDescription>모든 사용자의 이용 기록입니다.</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="relative w-full md:w-48">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-9"
                      value={filterDate}
                      onChange={(e) => handleFilterDateChange(e.target.value)}
                    />
                  </div>
                  {filterDate && (
                    <Button variant="ghost" onClick={() => handleFilterDateChange("")} className="px-2">
                      초기화
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingSessions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : sessionItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
                  <CalendarDays className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p>조건에 맞는 세션 기록이 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-md border border-border">
                  <div className="grid grid-cols-6 bg-muted/50 p-3 text-sm font-medium text-muted-foreground border-b border-border">
                    <div>날짜</div>
                    <div className="col-span-2">사용자</div>
                    <div>시작 시간</div>
                    <div>상태</div>
                    <div className="text-right">관리</div>
                  </div>
                  <div className="divide-y divide-border">
                    {sessionItems.map((session) => (
                      <div key={session.id} className="grid grid-cols-6 p-3 text-sm items-center hover:bg-muted/30 transition-colors">
                        <div className="font-mono text-muted-foreground">{session.date}</div>
                        <div className="col-span-2 font-medium">{session.userName}</div>
                        <div>{session.startTime}</div>
                        <div>
                          {session.endTime ? (
                            <span className="text-muted-foreground">
                              {session.durationMinutes}분 이용 ({session.endTime} 종료)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                              진행중
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(session.id)}
                            disabled={deleteSession.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isLoadingSessions && totalSessions > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                  <p className="text-sm text-muted-foreground">
                    총 {totalSessions}건 중 {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, totalSessions)}건 표시
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      이전
                    </Button>
                    <span className="text-sm text-muted-foreground px-1">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                      disabled={page + 1 >= totalPages}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>일별 통계</CardTitle>
              <CardDescription>일자별 세션 및 이용 시간 통계입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : summary?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
                  <BarChart3 className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p>통계 데이터가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="grid grid-cols-4 bg-muted/50 p-3 text-sm font-medium text-muted-foreground border-b border-border">
                    <div>날짜</div>
                    <div className="text-right">총 세션</div>
                    <div className="text-right">완료된 세션</div>
                    <div className="text-right">평균 이용 시간</div>
                  </div>
                  <div className="divide-y divide-border">
                    {summary?.map((day) => (
                      <div key={day.date} className="grid grid-cols-4 p-3 text-sm items-center hover:bg-muted/30">
                        <div className="font-mono font-medium">{day.date}</div>
                        <div className="text-right">{day.totalSessions}건</div>
                        <div className="text-right">{day.completedSessions}건</div>
                        <div className="text-right">{day.avgDurationMinutes ? `${day.avgDurationMinutes}분` : '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                주간 이용 현황 엑셀 다운로드
              </CardTitle>
              <CardDescription>
                선택한 주(월요일~일요일)의 이용자별 이용 시간과 방문 횟수를 한 장으로
                정리한 엑셀(.xlsx) 파일을 받습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-1 text-sm">
                <p className="font-medium">
                  선택된 주: <span className="font-mono">{weekStart}</span> ~{" "}
                  <span className="font-mono">{weekEnd}</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  날짜를 아무거나 골라도 그 주의 월요일부터 일요일까지로 자동 정렬됩니다.
                </p>
              </div>

              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-sm font-medium" htmlFor="week-picker">
                    주 선택
                  </label>
                  <Input
                    id="week-picker"
                    type="date"
                    value={weekPickerDate}
                    onChange={(e) => setWeekPickerDate(e.target.value || todayLocalStr())}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => shiftWeek(-1)} type="button">
                    이전 주
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setWeekPickerDate(todayLocalStr())}
                    type="button"
                  >
                    이번 주
                  </Button>
                  <Button variant="outline" onClick={() => shiftWeek(1)} type="button">
                    다음 주
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleWeeklyDownload}
                disabled={isDownloading}
                className="w-full md:w-auto"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {isDownloading ? "다운로드 중..." : "엑셀 다운로드"}
              </Button>

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                <p>• 완료된 세션(체크아웃까지 끝난 기록)만 집계됩니다.</p>
                <p>• 각 요일 셀에는 그 날 이용자가 머문 총 시간(분)이 표시됩니다.</p>
                <p>• 행 끝에 주간 합계(분/시간), 방문 일수, 방문 횟수가 함께 나옵니다.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
