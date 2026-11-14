import { QueryClientProvider } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { MARK_SILVER } from "@/src/jets";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function Gate() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.surfaceInverse }]} testID="auth-loading">
        <Image source={MARK_SILVER} style={styles.mark} contentFit="contain" />
        <ActivityIndicator color={colors.brandSecondary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={user ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="charter" />
          <Stack.Screen name="jet/[id]" />
          <Stack.Screen name="trip/[id]" />
          <Stack.Screen name="trip/guests/[id]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="travellers" />
          <Stack.Screen name="company" />
          <Stack.Protected guard={!!user?.is_admin}>
            <Stack.Screen name="team/index" />
            <Stack.Screen name="team/[id]" />
            <Stack.Screen name="team/codes" />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { colors } = useTheme();
  const [loaded, error] = useFonts({
    Manrope: require("../assets/fonts/Manrope-400.ttf"),
    ManropeSemiBold: require("../assets/fonts/Manrope-600.ttf"),
    ManropeBold: require("../assets/fonts/Manrope-700.ttf"),
  });

  if (!loaded && !error) return <View style={[styles.root, { backgroundColor: colors.surfaceInverse }]} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 32 },
  mark: { width: 160, height: 42 },
});
