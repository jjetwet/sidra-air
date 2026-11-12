import Feather from "@react-native-vector-icons/feather";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.onSurface}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="airplane" />
          <NativeTabs.Trigger.Label>Fleet</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="charter">
          <NativeTabs.Trigger.Icon sf="map" />
          <NativeTabs.Trigger.Label>Charter</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="trips">
          <NativeTabs.Trigger.Icon sf="suitcase" />
          <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="concierge">
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" />
          <NativeTabs.Trigger.Label>Concierge</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const icon = (name: "navigation-2" | "map" | "briefcase" | "message-circle") =>
    function TabIcon({ color }: { color: string }) {
      return <Feather name={name} size={20} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Fleet", tabBarIcon: icon("navigation-2"), tabBarButtonTestID: "tab-fleet" }} />
      <Tabs.Screen name="charter" options={{ title: "Charter", tabBarIcon: icon("map"), tabBarButtonTestID: "tab-charter" }} />
      <Tabs.Screen name="trips" options={{ title: "Trips", tabBarIcon: icon("briefcase"), tabBarButtonTestID: "tab-trips" }} />
      <Tabs.Screen name="concierge" options={{ title: "Concierge", tabBarIcon: icon("message-circle"), tabBarButtonTestID: "tab-concierge" }} />
    </Tabs>
  );
}
