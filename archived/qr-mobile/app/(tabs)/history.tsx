import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetMySessions,
  getGetMySessionsQueryKey,
  type GetMySessionsParams,
  type Session,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

type Tab = "today" | "history";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function recentMonths(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
    });
  }
  return out;
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("today");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const today = todayStr();
  const months = useMemo(() => recentMonths(), []);

  const todayParams: GetMySessionsParams = { date: today };
  const { data: todaySessions, isLoading: loadingToday } = useGetMySessions(
    todayParams,
    { query: { queryKey: getGetMySessionsQueryKey(todayParams) } },
  );

  const historyParams: GetMySessionsParams = { month: selectedMonth };
  const { data: historySessions, isLoading: loadingHistory } = useGetMySessions(
    historyParams,
    {
      query: {
        queryKey: getGetMySessionsQueryKey(historyParams),
        enabled: tab === "history",
      },
    },
  );

  const stats = useMemo(() => {
    const list = historySessions ?? [];
    const completed = list.filter((s) => s.endTime);
    const totalMinutes = completed.reduce(
      (a, c) => a + (c.durationMinutes ?? 0),
      0,
    );
    return { total: list.length, completed: completed.length, totalMinutes };
  }, [historySessions]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 120 },
      ]}
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>내 출입 기록</Text>
      <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
        오늘 또는 지난 기간의 본인 출입 내역을 확인하세요.
      </Text>

      <View style={[styles.switcher, { backgroundColor: colors.muted }]}>
        <SegTab label="오늘" active={tab === "today"} colors={colors} onPress={() => setTab("today")} />
        <SegTab
          label="지난 기록"
          active={tab === "history"}
          colors={colors}
          onPress={() => setTab("history")}
        />
      </View>

      {tab === "today" ? (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            오늘 ({today})
          </Text>
          {loadingToday ? (
            <Loader colors={colors} />
          ) : (
            <SessionList sessions={todaySessions ?? []} emptyText="오늘 출입 기록이 없습니다." colors={colors} />
          )}
        </View>
      ) : (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthRow}
          >
            {months.map((m) => {
              const active = m.value === selectedMonth;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setSelectedMonth(m.value)}
                  style={[
                    styles.monthChip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      { color: active ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.statsRow}>
            <StatCard label="출입 횟수" value={`${stats.total}회`} icon="activity" colors={colors} loading={loadingHistory} />
            <StatCard label="완료" value={`${stats.completed}회`} icon="check-square" colors={colors} loading={loadingHistory} />
          </View>
          <View style={[styles.statCardWide, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statHeader}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>총 이용 시간</Text>
              <Feather name="clock" size={16} color={colors.primary} />
            </View>
            {loadingHistory ? (
              <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 6 }} />
            ) : (
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {Math.floor(stats.totalMinutes / 60)}시간 {stats.totalMinutes % 60}분
              </Text>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>
            {months.find((m) => m.value === selectedMonth)?.label ?? selectedMonth}
          </Text>
          {loadingHistory ? (
            <Loader colors={colors} />
          ) : (
            <SessionList
              sessions={historySessions ?? []}
              emptyText="해당 기간의 출입 기록이 없습니다."
              colors={colors}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function SegTab({
  label,
  active,
  colors,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segTab, active && { backgroundColor: colors.card }]}>
      <Text
        style={[
          styles.segTabText,
          { color: active ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({
  label,
  value,
  icon,
  colors,
  loading,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  colors: ReturnType<typeof useColors>;
  loading?: boolean;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.statHeader}>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 6 }} />
      ) : (
        <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      )}
    </View>
  );
}

function SessionList({
  sessions,
  emptyText,
  colors,
}: {
  sessions: Session[];
  emptyText: string;
  colors: ReturnType<typeof useColors>;
}) {
  if (sessions.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Feather name="calendar" size={28} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {sessions.map((s) => (
        <View
          key={s.id}
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.rowLeft}>
            <Text style={[styles.rowDate, { color: colors.foreground }]}>{s.date}</Text>
            <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>
              {s.startTime} {s.endTime ? `– ${s.endTime}` : ""}
            </Text>
          </View>
          {s.endTime ? (
            <View style={[styles.statusBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.statusBadgeText, { color: colors.secondaryForeground }]}>
                완료 ({s.durationMinutes}분)
              </Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.statusBadgeText, { color: colors.primary }]}>이용중</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Loader({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ paddingVertical: 36, alignItems: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  heading: { fontFamily: "Inter_700Bold", fontSize: 24 },
  subheading: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4, marginBottom: 16 },
  switcher: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 16 },
  segTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 9 },
  segTabText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 12 },
  monthRow: { gap: 8, paddingBottom: 16 },
  monthChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  monthChipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14 },
  statCardWide: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4 },
  statHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 6 },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowLeft: { gap: 3 },
  rowDate: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  rowTime: { fontFamily: "Inter_400Regular", fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
