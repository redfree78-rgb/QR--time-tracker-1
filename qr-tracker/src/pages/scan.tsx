import { useState, useRef, useEffect, useCallback } from "react";
import { useCheckIn, useCheckOut, useGetTodaySessions, getGetTodaySessionsQueryKey, getListSessionsQueryKey, getGetSessionsSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, LogIn, LogOut, CheckCircle2, AlertCircle, Camera, CameraOff, Keyboard } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";

type ScanMode = "camera" | "manual";
type StatusType = { type: "idle" | "success" | "error"; message: string };

const SCANNER_DIV_ID = "qr-scanner-div";
const COOLDOWN_SECONDS = 10;

// Short success beep using the Web Audio API. Avoids shipping an audio asset.
function playSuccessBeep() {
  try {
    type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // ignore — audio is best-effort
  }
}

export default function Scan() {
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState("");
  const [status, setStatus] = useState<StatusType>({ type: "idle", message: "" });
  const [mode, setMode] = useState<ScanMode>("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [successFlash, setSuccessFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Shared cooldown flag for both camera and manual modes so a successful
  // scan blocks further scans for the full cooldown period.
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // In-flight lock: set BEFORE firing the check-in mutation, cleared once the
  // request fully settles. Prevents the camera's 10fps decode callback (and
  // manual Enter spam) from firing duplicate requests while the first one is
  // still pending — without this, an error fallback can flip a fresh
  // check-in straight into a check-out.
  const processingRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use ref for processQrCode to avoid stale closures in camera callback
  const processQrCodeRef = useRef<(code: string) => void>(() => {});

  const { data: todaySessions } = useGetTodaySessions({ query: { queryKey: getGetTodaySessionsQueryKey() } });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetTodaySessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSessionsSummaryQueryKey() });
  }, [queryClient]);

  const showStatus = useCallback((s: StatusType, duration = 3500) => {
    setStatus(s);
    setTimeout(() => setStatus({ type: "idle", message: "" }), duration);
  }, []);

  // Trigger a success effect: visual flash, beep, and a COOLDOWN_SECONDS
  // countdown that blocks further scans (camera + manual) until it expires.
  const triggerSuccessCooldown = useCallback(() => {
    playSuccessBeep();
    setSuccessFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setSuccessFlash(false);
      flashTimerRef.current = null;
    }, 600);

    cooldownRef.current = true;
    setCooldownRemaining(COOLDOWN_SECONDS);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          cooldownRef.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Clean up timers when the component unmounts.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const processQrCode = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    // Hard guard: refuse any scan attempt while the cooldown is active or
    // a previous request is still in flight. The in-flight guard is critical:
    // without it, the camera (fps=10) or rapid Enter presses can fire
    // overlapping requests, and the check-in→check-out fallback then flips
    // a fresh check-in straight into a check-out.
    if (cooldownRef.current || processingRef.current) return;
    processingRef.current = true;

    checkIn.mutate(
      { data: { qrCode: trimmed } },
      {
        onSuccess: (session) => {
          showStatus({ type: "success", message: `${session.userName}님 입장 완료` }, COOLDOWN_SECONDS * 1000);
          triggerSuccessCooldown();
          invalidateAll();
          setQrCode("");
          processingRef.current = false;
        },
        onError: () => {
          checkOut.mutate(
            { data: { qrCode: trimmed } },
            {
              onSuccess: (session) => {
                showStatus({ type: "success", message: `${session.userName}님 퇴장 완료 (${session.durationMinutes}분 이용)` }, COOLDOWN_SECONDS * 1000);
                triggerSuccessCooldown();
                invalidateAll();
                setQrCode("");
                processingRef.current = false;
              },
              onError: () => {
                showStatus({ type: "error", message: "유효하지 않은 QR 코드입니다" });
                setQrCode("");
                processingRef.current = false;
              },
            }
          );
        },
      }
    );
  }, [checkIn, checkOut, showStatus, invalidateAll, triggerSuccessCooldown]);

  // Keep ref in sync so camera callback always uses latest version
  useEffect(() => {
    processQrCodeRef.current = processQrCode;
  }, [processQrCode]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraLoading(true);

    // Check if camera API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("이 환경에서는 카메라를 사용할 수 없습니다. HTTPS 연결 또는 스마트폰 브라우저에서 접속해 주세요.");
      setCameraLoading(false);
      return;
    }

    try {
      // Ensure any previous scanner is cleaned up first
      await stopCamera();

      const scanner = new Html5Qrcode(SCANNER_DIV_ID);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => {
          // Cooldown + in-flight locks are owned by processQrCode so both the
          // camera and manual flows share them. Re-check here to avoid even
          // queuing a no-op call from the 10fps decode loop.
          if (cooldownRef.current || processingRef.current) return;
          processQrCodeRef.current(decodedText);
        },
        () => {} // ignore per-frame errors
      );
      setCameraActive(true);
      setCameraLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("denied")) {
        setCameraError("카메라 접근 권한이 거부되었습니다. 브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러 카메라를 허용해 주세요.");
      } else if (msg.includes("NotFound") || msg.includes("Requested device not found")) {
        setCameraError("카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해 주세요.");
      } else if (msg.includes("iframe") || msg.includes("insecure")) {
        setCameraError("보안 정책으로 인해 이 환경에서는 카메라를 사용할 수 없습니다. 배포된 앱 URL로 직접 접속해 주세요.");
      } else {
        setCameraError(`카메라를 시작할 수 없습니다. 직접 입력 모드를 사용해 주세요. (${msg})`);
      }
      setCameraLoading(false);
    }
  }, [stopCamera]);

  // Start/stop camera based on mode
  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    } else {
      void stopCamera();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    return () => {
      void stopCamera();
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus for manual mode
  useEffect(() => {
    if (mode !== "manual") return;
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== "INPUT") {
        inputRef.current?.focus();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [mode]);

  const activeSessions = todaySessions?.filter((s) => !s.endTime) ?? [];
  const isPending = checkIn.isPending || checkOut.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">QR 스캔</h2>
        <p className="text-muted-foreground mt-1">카메라로 QR 코드를 스캔하거나 직접 입력하여 출결을 처리합니다.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Scanner card */}
        <Card className="border-primary/20 shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="h-5 w-5 text-primary" />
                QR 스캔
              </CardTitle>
              {/* Mode switcher */}
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setMode("camera")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    mode === "camera"
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  카메라
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    mode === "manual"
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  직접입력
                </button>
              </div>
            </div>
            <CardDescription className="mt-1">
              {mode === "camera"
                ? "스마트폰 카메라로 QR 코드를 비추면 자동 처리됩니다"
                : "QR 코드 값을 직접 입력하거나 바코드 스캐너를 연결하세요"}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {/* Camera mode — scanner div must always be in DOM */}
            <div style={{ display: mode === "camera" ? "block" : "none" }}>
              {/* Loading state */}
              {cameraLoading && !cameraActive && (
                <div className="flex flex-col items-center justify-center h-64 gap-4 bg-black">
                  <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <p className="text-sm text-white/70">카메라 시작 중...</p>
                </div>
              )}

              {/* Error state */}
              {cameraError && (
                <div className="flex flex-col items-center justify-center min-h-48 gap-4 p-6 bg-muted/10">
                  <CameraOff className="h-12 w-12 text-muted-foreground/40" />
                  <p className="text-sm text-center text-muted-foreground leading-relaxed">{cameraError}</p>
                  <Button variant="outline" size="sm" onClick={startCamera}>
                    다시 시도
                  </Button>
                </div>
              )}

              {/* Scanner div — always present so html5-qrcode can find it */}
              <div className="relative bg-black">
                <div id={SCANNER_DIV_ID} className="w-full" />
                {/* Viewfinder overlay */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-56 h-56 relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/80 rounded-tl-md" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/80 rounded-tr-md" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/80 rounded-bl-md" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/80 rounded-br-md" />
                    </div>
                  </div>
                )}
                {/* Success flash overlay — brief green pulse confirming scan */}
                {successFlash && cameraActive && (
                  <div className="absolute inset-0 pointer-events-none bg-green-500/60 flex items-center justify-center animate-in fade-in zoom-in">
                    <CheckCircle2 className="h-24 w-24 text-white drop-shadow-lg" />
                  </div>
                )}
                {/* Cooldown countdown overlay — keeps camera paused for COOLDOWN_SECONDS */}
                {cooldownRemaining > 0 && !successFlash && cameraActive && (
                  <div className="absolute inset-0 pointer-events-none bg-black/55 flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="h-10 w-10 text-green-400" />
                    <p className="text-white text-sm">인식 완료</p>
                    <p className="text-white/80 text-xs">{cooldownRemaining}초 후 재스캔 가능</p>
                  </div>
                )}
              </div>
            </div>

            {/* Manual mode */}
            {mode === "manual" && (
              <div className="p-6 space-y-4">
                <Input
                  ref={inputRef}
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && processQrCode(qrCode)}
                  placeholder="QR 코드 데이터..."
                  className="h-14 text-lg text-center tracking-widest font-mono"
                  autoComplete="off"
                />
                <Button
                  onClick={() => processQrCode(qrCode)}
                  className="w-full h-12 text-base"
                  disabled={!qrCode.trim() || isPending || cooldownRemaining > 0}
                >
                  {isPending
                    ? "처리 중..."
                    : cooldownRemaining > 0
                      ? `${cooldownRemaining}초 후 재스캔 가능`
                      : "확인"}
                </Button>
              </div>
            )}
          </CardContent>

          {/* Status bar */}
          <div className="border-t min-h-[52px] flex items-center justify-center px-4 py-3">
            {status.type === "success" && (
              <div className="flex items-center gap-2 text-green-600 font-medium animate-in fade-in zoom-in">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{status.message}</span>
              </div>
            )}
            {status.type === "error" && (
              <div className="flex items-center gap-2 text-destructive font-medium animate-in fade-in zoom-in">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{status.message}</span>
              </div>
            )}
            {status.type === "idle" && isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-sm">처리 중...</span>
              </div>
            )}
            {status.type === "idle" && !isPending && (
              <p className="text-xs text-muted-foreground text-center">
                {mode === "camera" && cameraActive && "QR 코드를 카메라에 비춰주세요"}
                {mode === "camera" && !cameraActive && !cameraError && !cameraLoading && ""}
                {mode === "manual" && "Enter 또는 버튼으로 처리"}
              </p>
            )}
          </div>

          {mode === "manual" && (
            <CardFooter className="bg-muted/20 text-xs text-muted-foreground justify-center py-2 border-t">
              * 3초마다 입력창으로 포커스가 이동합니다 (바코드 스캐너 연동용)
            </CardFooter>
          )}
        </Card>

        {/* Active sessions card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>현재 이용중인 사용자</span>
              <span className="bg-primary/10 text-primary text-sm px-2 py-1 rounded-full font-medium">
                {activeSessions.length}명
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md">
                <LogOut className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>현재 이용중인 사용자가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                {activeSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <LogIn className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{session.userName}</p>
                        <p className="text-xs text-muted-foreground">입장: {session.startTime}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      이용 중
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
