import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { MARK_ON_LIGHT } from "@/src/jets";
import { fonts, makeStyles } from "@/src/theme";

export function BrandHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const styles = useStyles();
  const router = useRouter();
  const { user } = useAuth();
  const initials = user ? (user.name || user.email).split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "";
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.brandRow}>
          <Image source={MARK_ON_LIGHT} style={styles.mark} contentFit="contain" />
          <Text style={styles.word} testID="brand-wordmark">SIDRA</Text>
          <View style={{ flex: 1 }} />
          {user && (
            <Pressable onPress={() => router.push("/profile")} testID="open-profile-button" hitSlop={8} style={styles.avatarBtn}>
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initials}>{initials}</Text></View>
              )}
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 24, paddingBottom: 12 },
  left: { flex: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16, minHeight: 36 },
  avatarBtn: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.text, fontSize: 12, color: c.onSurfaceInverse },
  mark: { width: 38, height: 10 },
  word: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 5, color: c.onSurface, fontWeight: "600" },
  title: { fontFamily: fonts.display, fontSize: 32, color: c.onSurface, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.text, fontSize: 14, color: c.muted, marginTop: 4 },
}));

export const hairline = StyleSheet.hairlineWidth;
