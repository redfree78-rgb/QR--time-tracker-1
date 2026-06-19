import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCheckIn,
  useCheckOut,
  useGetTodaySessions,
  getGetTodaySessionsQueryKey,
  type Session,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

const COOLDOWN_SECONDS = 10;

type ScanMode = "camera" | "manual";
type Status = { type: "idle" | "success" | "error"; message: string };

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>("camera");
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [cooldown, setCooldown] = useState(0);
  const [flash, setFlash] = useState(false);

  const cooldownRef = useRef(false);
  const processingRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const { data: todaySessions } = useGetTodaySessions({
    query: { queryKey: getGetTodaySessionsQueryKey() },
  });
  const activeSessions = (todaySessions ?? []).filter((s) => !s.endTime);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  const showStatus = useCallback((s: Status, durationMs = 3500) => {
    setStatus(s);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(
      () => setStatus({ type: "idle", message: "" }),
      durationMs,
    );
  }, []);

  const triggerSuccess = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 600);

    cooldownRef.current = true;
    setCooldown(COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) {
            clearInterval(cooldownTimer.current);
            cooldownTimer.current = null;
          }
          cooldownRef.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetTodaySessionsQueryKey() });
  }, [queryClient]);

  // Mirror the web flow: try check-in first; on any failure fall back to
  // check-out. An in-flight lock prevents the camera's rapid-fire scans from
  // flipping a fresh check-in straight into a check-out.
  const processCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      if (cooldownRef.current || processingRef.current) return;
      processingRef.current = true;

      checkIn.mutate(
        { data: { qrCode: code } },
        {
          onSuccess: (session: Session) => {
            showStatus(
              { type: "success", message: `${session.userName}님 입장 완료` },
              COOLDOWN_SECONDS * 1000,
            );
            triggerSuccess();
            invalidate();
            setManualCode("");
            processingRef.current = false;
          },
          onError: (checkInErr: unknown) => {
            // An expired session surfaces as a 401. The global handler routes
            // the user back to login, so don't fall through to a check-out
            // attempt (it would just 401 again and flash a misleading error).
            if (isUnauthorizedError(checkInErr)) {
              showStatus({
                type: "error",
                message: "세션이 만료되었습니다. 다시 로그인해주세요.",
              });
              setManualCode("");
              processingRef.current = false;
              return;
            }
            checkOut.mutate(
              { data: { qrCode: code } },
              {
                onSuccess: (session: Session) => {
                  showStatus(
                    {
                      type: "success",
                      message: `${session.userName}님 퇴장 완료 (${session.durationMinutes}분 이용)`,
                    },
                    COOLDOWN_SECONDS * 1000,
                  );
                  triggerSuccess();
                  invalidate();
                  setManualCode("");
                  processingRef.current = false;
                },
                onError: (err: unknown) => {
                  if (Platform.OS !== "web") {
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Error,
                    );
                  }
                  showStatus({ type: "error", message: parseScanError(err) });
                  setManualCode("");
                  processingRef.current = false;
                },
              },
            );
          },
        },
      );
    },
    [checkIn, checkOut, showStatus, triggerSuccess, invalidate],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (cooldownRef.current || processingRef.current) return;
      processCode(data);
    },
    [processCode],
  );

  const isPending = checkIn.isPending || checkOut.isPending;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 120 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>QR 스캔</Text>
      <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
        카메라로 QR 코드를 스캔하거나 직접 입력하여 출결을 처리합니다.
      </Text>

      {/* Mode switcher */}
      <View style={[styles.switcher, { backgroundColor: colors.muted }]}>
        <ModeTab
          label="카메라"
          icon="camera"
          active={mode === "camera"}
          colors={colors}
          onPress={() => setMode("camera")}
        />
        <ModeTab
          label="직접입력"
          icon="edit-3"
          active={mode === "manual"}
          colors={colors}
          onPress={() => setMode("manual")}
        />
      </View>

      {/* Scanner / manual area */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {mode === "camera" ? (
          <CameraArea
            permission={permission}
            requestPermission={requestPermission}
            onBarcodeScanned={onBarcodeScanned}
            flash={flash}
            cooldown={cooldown}
            colors={colors}
          />
        ) : (
          <View style={styles.manualArea}>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="QR 코드 데이터..."
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => processCode(manualCode)}
              style={[
                styles.manualInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.input,
                  color: colors.foreground,
                },
              ]}
            />
            <Pressable
              onPress={() => processCode(manualCode)}
              disabled={!manualCode.trim() || isPending || cooldown > 0}
              style={({ pressed }) => [
                styles.manualButton,
                {
                  backgroundColor: colors.primary,
                  opacity:
                    !manualCode.trim() || isPending || cooldown > 0
                      ? 0.5
                      : pressed
                        ? 0.85
                        : 1,
                },
              ]}
            >
              {isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.manualButtonText}>
                  {cooldown > 0 ? `${cooldown}초 후 재스캔 가능` : "확인"}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Status bar */}
        <View style={[styles.statusBar, { borderTopColor: colors.border }]}>
          {status.type === "success" ? (
            <View style={styles.statusRow}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>
                {status.message}
              </Text>
            </View>
          ) : status.type === "error" ? (
            <View style={styles.statusRow}>
              <Feather name="alert-circle" size={18} color={colors.destructive} />
              <Text style={[styles.statusText, { color: colors.destructive }]}>
                {status.message}
              </Text>
            </View>
          ) : isPending ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                처리 중...
              </Text>
            </View>
          ) : (
            <Text style={[styles.statusHint, { color: colors.mutedForeground }]}>
              {mode === "camera"
                ? "QR 코드를 카메라에 비춰주세요"
                : "입력 후 확인 버튼을 눌러주세요"}
            </Text>
          )}
        </View>
      </View>

      {/* Active sessions */}
      <View style={styles.activeHeader}>
        <Text style={[styles.activeTitle, { color: colors.foreground }]}>
          현재 이용중인 사용자
        </Text>
        <View style={[styles.countPill, { backgroundColor: colors.accent }]}>
          <Text style={[styles.countText, { color: colors.primary }]}>
            {activeSessions.length}명
          </Text>
        </View>
      </View>

      {activeSessions.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="users" size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            현재 이용중인 사용자가 없습니다.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {activeSessions.map((session) => (
            <View
              key={session.id}
              style={[
                styles.activeRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.activeLeft}>
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  <Feather name="log-in" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.activeName, { color: colors.foreground }]}>
                    {session.userName}
                  </Text>
                  <Text style={[styles.activeMeta, { color: colors.mutedForeground }]}>
                    입장: {session.startTime}
                  </Text>
                </View>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.successBg }]}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={[styles.badgeText, { color: colors.successText }]}>
                  이용 중
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ModeTab({
  label,
  icon,
  active,
  colors,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeTab,
        active && { backgroundColor: colors.card },
      ]}
    >
      <Feather
        name={icon}
        size={15}
        color={active ? colors.foreground : colors.mutedForeground}
      />
      <Text
        style={[
          styles.modeTabText,
          { color: active ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CameraArea({
  permission,
  requestPermission,
  onBarcodeScanned,
  flash,
  cooldown,
  colors,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  onBarcodeScanned: (result: { data: string }) => void;
  flash: boolean;
  cooldown: number;
  colors: ReturnType<typeof useColors>;
}) {
  if (!permission) {
    return (
      <View style={[styles.cameraBox, styles.cameraCenter]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = permission.status === "denied" && !permission.canAskAgain;
    return (
      <View style={[styles.cameraBox, styles.cameraCenter, { gap: 14, padding: 24 }]}>
        <Feather name="camera-off" size={40} color="rgba(255,255,255,0.5)" />
        <Text style={styles.cameraMsg}>
          QR 코드를 스캔하려면 카메라 접근 권한이 필요합니다.
        </Text>
        <Pressable
          onPress={() => {
            if (blocked && Platform.OS !== "web") {
              Linking.openSettings().catch(() => {});
            } else {
              requestPermission();
            }
          }}
          style={({ pressed }) => [
            styles.permButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.permButtonText}>
            {blocked ? "설정 열기" : "카메라 권한 허용"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraBox}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={cooldown > 0 ? undefined : onBarcodeScanned}
      />
      {/* Viewfinder */}
      <View style={styles.viewfinderWrap} pointerEvents="none">
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      </View>
      {flash ? (
        <View style={[styles.overlay, { backgroundColor: "rgba(34,197,94,0.55)" }]} pointerEvents="none">
          <Feather name="check-circle" size={72} color="#FFFFFF" />
        </View>
      ) : cooldown > 0 ? (
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]} pointerEvents="none">
          <Feather name="check-circle" size={36} color="#4ADE80" />
          <Text style={styles.overlayTitle}>인식 완료</Text>
          <Text style={styles.overlaySub}>{cooldown}초 후 재스캔 가능</Text>
        </View>
      ) : null}
    </View>
  );
}

function isUnauthorizedError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { status?: number }).status === 401
  );
}

function parseScanError(err: unknown): string {
  if (isUnauthorizedError(err)) {
    return "세션이 만료되었습니다. 다시 로그인해주세요.";
  }
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const msg = (data as { error?: unknown }).error;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
  }
  return "유효하지 않은 QR 코드입니다";
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  heading: { fontFamily: "Inter_700Bold", fontSize: 24 },
  subheading: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4, marginBottom: 16 },
  switcher: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  modeTabText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  cameraBox: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#000000",
    position: "relative",
  },
  cameraCenter: { alignItems: "center", justifyContent: "center" },
  cameraMsg: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  permButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  permButtonText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  viewfinderWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  viewfinder: { width: "62%", aspectRatio: 1 },
  corner: { position: "absolute", width: 30, height: 30, borderColor: "rgba(255,255,255,0.85)" },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 6 },
  overlayTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  overlaySub: { color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular", fontSize: 12 },
  manualArea: { padding: 16, gap: 12 },
  manualInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  manualButton: { height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  manualButtonText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  statusBar: {
    minHeight: 52,
    borderTopWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 13, flexShrink: 1 },
  statusHint: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  activeTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 36,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  activeLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  activeName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  activeMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
