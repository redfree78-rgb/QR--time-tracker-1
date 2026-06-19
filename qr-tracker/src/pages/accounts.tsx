import { useMemo, useState } from "react";
import {
  useListAccounts,
  getListAccountsQueryKey,
  useCreateAccount,
  useDeleteAccount,
  useChangePassword,
  useUpdateAccount,
  useListPositions,
  getListPositionsQueryKey,
  useCreatePosition,
  useListAuditLogs,
  getListAuditLogsQueryKey,
  type ListAuditLogsParams,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { validatePasswordClient, PASSWORD_RULE_TEXT } from "@/lib/password";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  ShieldCheck,
  UserCircle,
  Users,
  History,
  UserPlus,
  UserMinus,
  LogIn,
  ShieldAlert,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const AUDIT_PAGE_SIZE = 50;
const NONE_POSITION = "__none__";

const AUDIT_ACTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "account.create", label: "계정 생성" },
  { value: "account.update", label: "계정 수정" },
  { value: "account.delete", label: "계정 삭제" },
  { value: "account.password_change", label: "비밀번호 변경" },
  { value: "auth.login_success", label: "로그인 성공" },
  { value: "auth.login_failure", label: "로그인 실패" },
];

export default function Accounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, refreshMe } = useAuth();
  const { data: accounts, isLoading } = useListAccounts({
    query: { queryKey: getListAccountsQueryKey() },
  });

  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const changePassword = useChangePassword();
  const updateAccount = useUpdateAccount();
  const { data: positions } = useListPositions({
    query: { queryKey: getListPositionsQueryKey() },
  });
  const createPosition = useCreatePosition();

  // Audit log filter & pagination state
  const [filterActor, setFilterActor] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [auditPage, setAuditPage] = useState(0);

  const resetPage = () => setAuditPage(0);
  const hasAnyFilter =
    filterActor !== "all" || filterAction !== "all" || !!filterFrom || !!filterTo;

  const auditParams = useMemo<ListAuditLogsParams>(() => {
    const p: ListAuditLogsParams = {
      limit: AUDIT_PAGE_SIZE,
      offset: auditPage * AUDIT_PAGE_SIZE,
    };
    if (filterActor !== "all") p.actorId = Number(filterActor);
    if (filterAction !== "all") p.action = filterAction;
    if (filterFrom) p.from = new Date(`${filterFrom}T00:00:00`).toISOString();
    if (filterTo) p.to = new Date(`${filterTo}T23:59:59.999`).toISOString();
    return p;
  }, [filterActor, filterAction, filterFrom, filterTo, auditPage]);

  const auditQueryKey = getListAuditLogsQueryKey(auditParams);
  const { data: auditPageData, isLoading: isAuditLoading } = useListAuditLogs(
    auditParams,
    { query: { queryKey: auditQueryKey } },
  );
  const auditItems = auditPageData?.items ?? [];
  const auditTotal = auditPageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));

  const csvHref = useMemo(() => {
    const sp = new URLSearchParams();
    if (filterActor !== "all") sp.set("actorId", filterActor);
    if (filterAction !== "all") sp.set("action", filterAction);
    if (filterFrom) sp.set("from", new Date(`${filterFrom}T00:00:00`).toISOString());
    if (filterTo) sp.set("to", new Date(`${filterTo}T23:59:59.999`).toISOString());
    const qs = sp.toString();
    return `/api/audit-logs/export.csv${qs ? `?${qs}` : ""}`;
  }, [filterActor, filterAction, filterFrom, filterTo]);

  const clearFilters = () => {
    setFilterActor("all");
    setFilterAction("all");
    setFilterFrom("");
    setFilterTo("");
    setAuditPage(0);
  };

  const invalidateAfterMutation = () => {
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
  };

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "staff">("staff");
  const [newPosition, setNewPosition] = useState<string>("");
  const [addPositionName, setAddPositionName] = useState("");

  // Password change modal state
  const [isPwOpen, setIsPwOpen] = useState(false);
  const [pwTargetId, setPwTargetId] = useState<number | null>(null);
  const [pwTargetName, setPwTargetName] = useState("");
  const [newPw, setNewPw] = useState("");

  // Edit display name modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editOriginalName, setEditOriginalName] = useState("");
  const [editPosition, setEditPosition] = useState<string>("");
  const [editOriginalPosition, setEditOriginalPosition] = useState<string>("");

  const handleAddPosition = () => {
    const name = addPositionName.trim();
    if (!name) return;
    createPosition.mutate(
      { data: { name } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey() });
          setAddPositionName("");
          setNewPosition(created.name);
          toast({ title: "직위 추가 완료", description: `“${created.name}” 직위가 추가되었습니다.` });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "직위 추가에 실패했습니다";
          toast({ title: "오류", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const handleCreate = () => {
    if (!newUsername.trim() || !newPassword || !newDisplayName.trim()) return;

    const pwErr = validatePasswordClient(newPassword);
    if (pwErr) {
      toast({ title: "비밀번호 규칙 오류", description: pwErr, variant: "destructive" });
      return;
    }

    createAccount.mutate(
      {
        data: {
          username: newUsername.trim(),
          password: newPassword,
          displayName: newDisplayName.trim(),
          role: newRole,
          position: newPosition || null,
        },
      },
      {
        onSuccess: () => {
          invalidateAfterMutation();
          setIsCreateOpen(false);
          setNewUsername("");
          setNewPassword("");
          setNewDisplayName("");
          setNewRole("staff");
          setNewPosition("");
          toast({ title: "계정 생성 완료", description: "새 계정이 등록되었습니다." });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "계정 생성에 실패했습니다";
          toast({ title: "오류", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number, username: string) => {
    if (user?.id === id) {
      toast({
        title: "삭제 불가",
        description: "본인 계정은 삭제할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`\u201c${username}\u201d 계정을 정말 삭제하시겠습니까?`)) return;

    deleteAccount.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateAfterMutation();
          toast({ title: "계정 삭제 완료", description: "계정이 삭제되었습니다." });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "계정 삭제에 실패했습니다";
          toast({ title: "오류", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const openEditDialog = (
    id: number,
    username: string,
    currentName: string,
    currentPosition: string | null | undefined,
  ) => {
    setEditTargetId(id);
    setEditUsername(username);
    setEditDisplayName(currentName);
    setEditOriginalName(currentName);
    setEditPosition(currentPosition ?? "");
    setEditOriginalPosition(currentPosition ?? "");
    setIsEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editTargetId) return;
    const trimmed = editDisplayName.trim();
    if (!trimmed) {
      toast({ title: "입력 오류", description: "표시 이름을 입력해주세요.", variant: "destructive" });
      return;
    }
    const positionChanged = (editPosition || "") !== (editOriginalPosition || "");
    if (trimmed === editOriginalName && !positionChanged) {
      setIsEditOpen(false);
      return;
    }

    updateAccount.mutate(
      { id: editTargetId, data: { displayName: trimmed, position: editPosition || null } },
      {
        onSuccess: async () => {
          invalidateAfterMutation();
          // If admin renamed themselves, refresh auth identity so the
          // sidebar/header reflects the new name immediately.
          if (user?.id === editTargetId) {
            await refreshMe();
          }
          setIsEditOpen(false);
          setEditTargetId(null);
          toast({ title: "변경 완료", description: "계정 정보가 변경되었습니다." });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "이름 변경에 실패했습니다";
          toast({ title: "오류", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const openPwDialog = (id: number, name: string) => {
    setPwTargetId(id);
    setPwTargetName(name);
    setNewPw("");
    setIsPwOpen(true);
  };

  const handlePwChange = () => {
    if (!pwTargetId || !newPw) return;

    const pwErr = validatePasswordClient(newPw);
    if (pwErr) {
      toast({ title: "비밀번호 규칙 오류", description: pwErr, variant: "destructive" });
      return;
    }

    changePassword.mutate(
      { id: pwTargetId, data: { password: newPw } },
      {
        onSuccess: () => {
          invalidateAfterMutation();
          setIsPwOpen(false);
          setPwTargetId(null);
          setNewPw("");
          toast({ title: "비밀번호 변경 완료", description: "비밀번호가 변경되었습니다." });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "비밀번호 변경에 실패했습니다";
          toast({ title: "오류", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const roleLabel = (role: string) =>
    role === "admin" ? (
      <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium">
        <ShieldCheck className="w-3 h-3" />
        관리자
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs font-medium">
        <UserCircle className="w-3 h-3" />
        직원
      </span>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">계정 관리</h2>
          <p className="text-muted-foreground mt-1">관리자와 직원 계정을 추가, 삭제, 비밀번호 변경합니다.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              직원 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>새 계정 등록</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-username">아이디</Label>
                <Input
                  id="new-username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="아이디 입력"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">비밀번호</Label>
                <Input
                  id="new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-display">표시 이름</Label>
                <Input
                  id="new-display"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="홍길동"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>역할</Label>
                <Select value={newRole} onValueChange={(v: "admin" | "staff") => setNewRole(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="역할 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">직원</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  역할은 권한을 결정합니다. 관리자만 계정·기록을 관리할 수 있습니다.
                </p>
              </div>
              <div className="space-y-2">
                <Label>직위</Label>
                <Select
                  value={newPosition || NONE_POSITION}
                  onValueChange={(v) => setNewPosition(v === NONE_POSITION ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="직위 선택 (선택 사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_POSITION}>직위 없음</SelectItem>
                    {positions?.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 pt-1">
                  <Input
                    value={addPositionName}
                    onChange={(e) => setAddPositionName(e.target.value)}
                    placeholder="새 직위 입력 (예: 팀장)"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPosition();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddPosition}
                    disabled={createPosition.isPending || !addPositionName.trim()}
                    className="gap-1 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4" />
                    직위 추가
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                취소
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  createAccount.isPending ||
                  !newUsername.trim() ||
                  !newPassword ||
                  !newDisplayName.trim()
                }
              >
                등록
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>등록된 계정</CardTitle>
          <CardDescription>총 {accounts?.length || 0}개의 계정이 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : accounts?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>등록된 계정이 없습니다.</p>
              <p className="text-sm mt-1">새 계정을 등록하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>아이디</TableHead>
                  <TableHead>표시 이름</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>직위</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.username}</TableCell>
                    <TableCell>{acc.displayName}</TableCell>
                    <TableCell>{roleLabel(acc.role)}</TableCell>
                    <TableCell>
                      {acc.position ? (
                        acc.position
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            openEditDialog(acc.id, acc.username, acc.displayName, acc.position)
                          }
                          disabled={updateAccount.isPending}
                          title="이름 변경"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openPwDialog(acc.id, acc.displayName)}
                          disabled={changePassword.isPending}
                          title="비밀번호 변경"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(acc.id, acc.username)}
                          disabled={deleteAccount.isPending}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                감사 로그
              </CardTitle>
              <CardDescription>
                계정 변경, 비밀번호 변경, 로그인 성공/실패 기록을 검색하고 내보냅니다.
              </CardDescription>
            </div>
            <a href={csvHref} download>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                CSV 내보내기
              </Button>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">작업자</Label>
              <Select
                value={filterActor}
                onValueChange={(v) => {
                  setFilterActor(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {accounts?.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.displayName} ({acc.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">작업 종류</Label>
              <Select
                value={filterAction}
                onValueChange={(v) => {
                  setFilterAction(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {AUDIT_ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => {
                  setFilterFrom(e.target.value);
                  resetPage();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => {
                  setFilterTo(e.target.value);
                  resetPage();
                }}
              />
            </div>
          </div>
          {hasAnyFilter && (
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                필터 초기화
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isAuditLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : auditItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>{hasAnyFilter ? "조건에 맞는 기록이 없습니다." : "기록된 변경 내역이 없습니다."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>작업자</TableHead>
                  <TableHead>작업</TableHead>
                  <TableHead>대상</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditItems.map((log) => {
                  const actionMeta = (() => {
                    switch (log.action) {
                      case "account.create":
                        return {
                          label: "계정 생성",
                          icon: <UserPlus className="h-3 w-3" />,
                          className: "text-emerald-600 bg-emerald-50",
                        };
                      case "account.update":
                        return {
                          label: "계정 수정",
                          icon: <Pencil className="h-3 w-3" />,
                          className: "text-indigo-600 bg-indigo-50",
                        };
                      case "account.delete":
                        return {
                          label: "계정 삭제",
                          icon: <UserMinus className="h-3 w-3" />,
                          className: "text-red-600 bg-red-50",
                        };
                      case "account.password_change":
                        return {
                          label: "비밀번호 변경",
                          icon: <KeyRound className="h-3 w-3" />,
                          className: "text-amber-600 bg-amber-50",
                        };
                      case "auth.login_success":
                        return {
                          label: "로그인 성공",
                          icon: <LogIn className="h-3 w-3" />,
                          className: "text-sky-600 bg-sky-50",
                        };
                      case "auth.login_failure":
                        return {
                          label: "로그인 실패",
                          icon: <ShieldAlert className="h-3 w-3" />,
                          className: "text-rose-600 bg-rose-50",
                        };
                      default:
                        return {
                          label: log.action,
                          icon: null,
                          className: "text-muted-foreground bg-muted",
                        };
                    }
                  })();
                  const details = (log.details ?? {}) as {
                    username?: string;
                    displayName?: string;
                    role?: string;
                    ip?: string;
                    reason?: string;
                  };
                  const isLogin =
                    log.action === "auth.login_success" || log.action === "auth.login_failure";
                  const targetMain =
                    details.displayName || details.username
                      ? `${details.displayName ?? ""}${
                          details.username ? ` (${details.username})` : ""
                        }`.trim()
                      : log.targetId != null
                        ? `#${log.targetId}`
                        : "-";
                  const targetLabel = isLogin
                    ? `${targetMain}${details.ip ? ` · ${details.ip}` : ""}`
                    : targetMain;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.actorUsername ?? (log.actorId != null ? `#${log.actorId}` : "시스템")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${actionMeta.className}`}
                        >
                          {actionMeta.icon}
                          {actionMeta.label}
                        </span>
                      </TableCell>
                      <TableCell>{targetLabel}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {auditTotal > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-xs text-muted-foreground">
                총 {auditTotal.toLocaleString()}건 · {auditPage + 1} / {totalPages} 페이지
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                  disabled={auditPage === 0 || isAuditLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setAuditPage((p) => p + 1)}
                  disabled={auditPage + 1 >= totalPages || isAuditLoading}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit display name dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>표시 이름 변경</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              아이디 <strong>{editUsername}</strong> 계정의 표시 이름을 변경합니다.
            </p>
            <div className="space-y-2">
              <Label htmlFor="edit-display">표시 이름</Label>
              <Input
                id="edit-display"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="홍길동"
                autoComplete="off"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSave();
                }}
              />
              <p className="text-xs text-muted-foreground">
                기존: {editOriginalName}
              </p>
            </div>
            <div className="space-y-2">
              <Label>직위</Label>
              <Select
                value={editPosition || NONE_POSITION}
                onValueChange={(v) => setEditPosition(v === NONE_POSITION ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="직위 선택 (선택 사항)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_POSITION}>직위 없음</SelectItem>
                  {positions?.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={updateAccount.isPending || !editDisplayName.trim()}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password change dialog */}
      <Dialog open={isPwOpen} onOpenChange={setIsPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>비밀번호 변경</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{pwTargetName}</strong> 계정의 새 비밀번호를 입력하세요.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-pw">새 비밀번호</Label>
              <Input
                id="new-pw"
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="새 비밀번호 입력"
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {PASSWORD_RULE_TEXT}. 최근 3개 비밀번호는 재사용할 수 없습니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPwOpen(false)}>
              취소
            </Button>
            <Button onClick={handlePwChange} disabled={changePassword.isPending || !newPw.trim()}>
              변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
