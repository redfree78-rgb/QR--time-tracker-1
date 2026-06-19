import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const { status, signOut } = useAuth();
  const isWeb = Platform.OS === "web";

  if (status === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerStyle: { backgroundColor: colors.sidebar },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
        headerRight: () => (
          <Pressable
            onPress={() => signOut()}
            hitSlop={12}
            style={({ pressed }) => [styles.logout, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="log-out" size={20} color="#FFFFFF" />
          </Pressable>
        ),
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(isWeb ? { height: 64 } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "QR 스캔",
          tabBarIcon: ({ color, size }) => (
            <Feather name="maximize" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "내 기록",
          tabBarIcon: ({ color, size }) => (
            <Feather name="clock" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logout: { paddingHorizontal: 16 },
});
