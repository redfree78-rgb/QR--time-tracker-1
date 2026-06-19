import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { status } = useAuth();
  const colors = useColors();

  if (status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: colors.sidebar }]}>
        <ActivityIndicator color={colors.sidebarPrimary} size="large" />
      </View>
    );
  }

  if (status === "authenticated") {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
