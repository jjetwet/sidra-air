import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { useQuotes } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: quotes } = useQuotes();
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const initials = (user.name || user.email).split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <View style={styles.root} testID="profile-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="profile-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>MEMBER</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.body}>
        {user.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initials}>{initials}</Text></View>
        )}
        <Text style={styles.name} testID="profile-name">{user.name || "Member"}</Text>
        <Text style={styles.email} testID="profile-email">{user.email}</Text>
        {user.is_admin && <Text style={styles.badge} testID="profile-team-badge">SIDRA TEAM</Text>}

        <View style={styles.statRow}>
          <View>
            <Text style={styles.statValue}>{quotes?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Requests</Text>
          </View>
          <View>
            <Text style={styles.statValue}>{quotes?.filter((q) => q.status === "Confirmed").length ?? 0}</Text>
            <Text style={styles.statLabel}>Confirmed</Text>
          </View>
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/travellers")} testID="open-travellers-button">
          <Feather name="users" size={18} color={colors.onSurface} />
          <Text style={styles.rowText}>Saved travellers</Text>
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
        {user.is_admin && (
          <Pressable style={styles.row} onPress={() => router.push("/team")} testID="open-team-dashboard-button">
            <Feather name="layout" size={18} color={colors.onSurface} />
            <Text style={styles.rowText}>Team dashboard</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        )}
        <Pressable
          style={styles.row}
          testID="sign-out-button"
          onPress={async () => {
            setBusy(true);
            await signOut();
          }}
        >
          <Feather name="log-out" size={18} color={colors.onSurface} />
          <Text style={styles.rowText}>Sign out</Text>
          {busy ? <ActivityIndicator color={colors.muted} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  body: { padding: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.text, fontSize: 22, color: c.onSurfaceInverse },
  name: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, marginTop: 16 },
  email: { fontFamily: fonts.text, fontSize: 14, color: c.muted, marginTop: 4 },
  badge: { alignSelf: "flex-start", marginTop: 12, fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, color: c.onBrandTertiary, backgroundColor: c.brandTertiary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: "hidden" },
  statRow: { flexDirection: "row", gap: 48, marginTop: 32, marginBottom: 24 },
  statValue: { fontFamily: fonts.display, fontSize: 32, color: c.onSurface, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 56, borderTopWidth: 0.5, borderTopColor: c.border },
  rowText: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
}));
