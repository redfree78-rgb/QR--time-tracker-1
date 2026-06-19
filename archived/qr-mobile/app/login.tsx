import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, sessionExpired, clearSessionExpired } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(username.trim(), password);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace("/(tabs)");
    } catch (err: unknown) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.sidebar }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View
          style={[
            styles.container,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: colors.sidebarPrimary }]}>
              <Feather name="grid" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>QR 출입 관리</Text>
            <Text style={[styles.brandSubtitle, { color: colors.sidebarForeground }]}>
              서비스 이용 현황 시스템
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>로그인</Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              아이디와 비밀번호를 입력해주세요
            </Text>

            {sessionExpired && !error ? (
              <View
                style={[styles.noticeBox, { backgroundColor: colors.primary + "14" }]}
              >
                <Feather name="info" size={16} color={colors.primary} />
                <Text style={[styles.noticeText, { color: colors.primary }]}>
                  세션이 만료되었습니다. 다시 로그인해주세요.
                </Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>아이디</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="아이디 입력"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.input,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>비밀번호</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="비밀번호 입력"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.input,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Pressable
                  hitSlop={10}
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeButton}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View
                style={[styles.errorBox, { backgroundColor: colors.destructive + "1A" }]}
              >
                <Text style={[styles.errorText, { color: colors.destructive }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: colors.primary,
                  opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>로그인</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function parseError(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const msg = (data as { error?: unknown }).error;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    const status = (err as { status?: number }).status;
    if (status === 401) return "아이디 또는 비밀번호가 올바르지 않습니다";
    if (status === 429) return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요";
  }
  return "로그인에 실패했습니다. 네트워크 연결을 확인해주세요";
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  brand: { alignItems: "center", marginBottom: 32 },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  brandTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
  },
  brandSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  passwordRow: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: "absolute", right: 12 },
  errorBox: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  noticeText: { fontFamily: "Inter_500Medium", fontSize: 13, flexShrink: 1 },
  submit: {
    height: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#FFFFFF" },
});
