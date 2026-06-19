import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useListUsers, getListUsersQueryKey, useCreateUser, useDeleteUser, useUpdateUser, useListAccounts, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QRCodeSVG } from "qrcode.react";
import { Plus, Trash2, Users as UsersIcon, Link2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Users() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });

  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newAccountId, setNewAccountId] = useState<string>("");
  const [linkingUserId, setLinkingUserId] = useState<number | null>(null);
  const [linkAccountId, setLinkAccountId] = useState<string>("");
  const [printUsers, setPrintUsers] = useState<NonNullable<typeof users> | null>(null);

  useEffect(() => {
    if (!printUsers || printUsers.length === 0) return;
    // Wait a tick so the print area is rendered before opening the dialog.
    // window.print() blocks until the dialog is dismissed, after which we reset
    // the state (does not rely on the sometimes-unreliable `afterprint` event).
    const t = setTimeout(() => {
      window.print();
      setPrintUsers(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printUsers]);

  const linkedAccountIds = new Set(
    (users ?? []).map((u) => u.accountId).filter((id): id is number => id != null)
  );
  const availableAccountsFor = (currentUserId: number | null) => {
    const currentLinked = users?.find((u) => u.id === currentUserId)?.accountId ?? null;
    return (accounts ?? []).filter(
      (a) => !linkedAccountIds.has(a.id) || a.id === currentLinked
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    
    const accountIdNum = newAccountId ? Number(newAccountId) : null;
    createUser.mutate(
      { data: { name: newName, note: newNote || undefined, accountId: accountIdNum } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setIsCreateOpen(false);
          setNewName("");
          setNewNote("");
          setNewAccountId("");
          toast({ title: "사용자 생성 완료", description: "새로운 사용자가 등록되었습니다." });
        },
        onError: () => {
          toast({ title: "오류", description: "사용자 생성에 실패했습니다.", variant: "destructive" });
        }
      }
    );
  };

  const handleLink = () => {
    if (linkingUserId == null) return;
    const accountIdNum = linkAccountId ? Number(linkAccountId) : null;
    updateUser.mutate(
      { id: linkingUserId, data: { accountId: accountIdNum } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setLinkingUserId(null);
          setLinkAccountId("");
          toast({ title: "계정 연결 변경 완료", description: "사용자와 계정의 연결이 업데이트되었습니다." });
        },
        onError: () => {
          toast({ title: "오류", description: "계정 연결에 실패했습니다.", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("정말 이 사용자를 삭제하시겠습니까?")) return;
    
    deleteUser.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "사용자 삭제 완료", description: "사용자가 삭제되었습니다." });
        },
        onError: () => {
          toast({ title: "오류", description: "사용자 삭제에 실패했습니다.", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">사용자 관리</h2>
          <p className="text-muted-foreground mt-1">사용자를 등록하고 QR 코드를 발급합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setPrintUsers([...(users ?? [])])}
            disabled={!users || users.length === 0}
          >
            <Printer className="h-4 w-4" />
            전체 QR 인쇄
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              새 사용자 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 사용자 등록</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">이름</label>
                <Input 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">메모 (선택)</label>
                <Input 
                  value={newNote} 
                  onChange={(e) => setNewNote(e.target.value)} 
                  placeholder="특이사항..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">연결할 직원 계정 (선택)</label>
                <select
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— 연결 안 함 —</option>
                  {availableAccountsFor(null).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName} ({a.username})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">연결하면 해당 계정으로 로그인했을 때 본인의 출입 기록만 볼 수 있습니다.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={createUser.isPending || !newName.trim()}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog
        open={linkingUserId != null}
        onOpenChange={(open) => {
          if (!open) {
            setLinkingUserId(null);
            setLinkAccountId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계정 연결</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">연결할 직원 계정</label>
              <select
                value={linkAccountId}
                onChange={(e) => setLinkAccountId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— 연결 해제 —</option>
                {availableAccountsFor(linkingUserId).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} ({a.username})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkingUserId(null)}>취소</Button>
            <Button onClick={handleLink} disabled={updateUser.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>등록된 사용자</CardTitle>
          <CardDescription>총 {users?.length || 0}명의 사용자가 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : users?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <UsersIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>등록된 사용자가 없습니다.</p>
              <p className="text-sm mt-1">새 사용자를 등록하여 QR 코드를 발급하세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users?.map((user) => (
                <Card key={user.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-muted/30 border-b border-border flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg truncate">{user.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {user.note || "메모 없음"}
                      </p>
                      <p className="text-[11px] mt-1">
                        {user.accountId ? (
                          <span className="text-primary">
                            계정 연결됨: {accounts?.find((a) => a.id === user.accountId)?.displayName ?? `#${user.accountId}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">계정 미연결</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="QR 인쇄"
                        onClick={() => setPrintUsers([user])}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="계정 연결"
                        onClick={() => {
                          setLinkingUserId(user.id);
                          setLinkAccountId(user.accountId ? String(user.accountId) : "");
                        }}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                        onClick={() => handleDelete(user.id)}
                        disabled={deleteUser.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-6 flex flex-col items-center justify-center bg-white dark:bg-zinc-950">
                    <div className="p-2 bg-white rounded-lg border border-border/50">
                      <QRCodeSVG 
                        value={user.qrCode} 
                        size={120}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-4 select-all">
                      {user.qrCode}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {printUsers && printUsers.length > 0
        ? createPortal(
            <div id="qr-print-area">
              <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", margin: "0 0 16px" }}>
                이용자 QR 코드
              </h1>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                }}
              >
                {printUsers.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      breakInside: "avoid",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{user.name}</div>
                    {user.note ? (
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>{user.note}</div>
                    ) : null}
                    <QRCodeSVG value={user.qrCode} size={140} level="M" />
                    <div style={{ fontSize: 10, fontFamily: "monospace", marginTop: 8, wordBreak: "break-all" }}>
                      {user.qrCode}
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
