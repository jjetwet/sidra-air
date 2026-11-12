import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usd } from "@/src/api";
import { JET_IMAGES } from "@/src/jets";
import { useFleet } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function JetDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useFleet();
  const jet = data?.find((j) => j.id === id);

  return (
    <View style={styles.root} testID="jet-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} testID="jet-detail-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{jet?.name ?? ""}</Text>
        <View style={styles.back} />
      </View>

      {isLoading || !jet ? (
        <View style={styles.center}>
          {isLoading ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.muted}>Aircraft not found.</Text>}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
            <Animated.View entering={FadeIn.duration(500)}>
              <Image source={JET_IMAGES[jet.id]} style={styles.image} contentFit="contain" />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(120).duration(450)} style={styles.body}>
              <Text style={styles.maker}>{jet.maker.toUpperCase()} · {jet.family.toUpperCase()}</Text>
              <Text style={styles.name} testID="jet-detail-name">{jet.name}</Text>
              <Text style={styles.tagline}>{jet.tagline}</Text>

              <View style={styles.grid}>
                <Spec label="Range" value={`${jet.range_nm.toLocaleString("en-US")} nm`} />
                <Spec label="Guests" value={`Up to ${jet.pax}`} />
                <Spec label="Cruise" value={`${jet.speed_kts} kt`} />
                <Spec label="Cabin length" value={`${jet.cabin_ft} ft`} />
                <Spec label="Cabin height" value={`${jet.cabin_height_ft} ft`} />
                <Spec label="Living zones" value={`${jet.living_spaces}`} />
              </View>

              <Text style={styles.section}>Cabin</Text>
              {jet.highlights.map((h) => (
                <View key={h} style={styles.hl}>
                  <View style={styles.dot} />
                  <Text style={styles.hlText}>{h}</Text>
                </View>
              ))}
            </Animated.View>
          </ScrollView>

          <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
            <View>
              <Text style={styles.ctaLabel}>From</Text>
              <Text style={styles.ctaPrice} testID="jet-detail-hourly-rate">{usd(jet.hourly_usd)}<Text style={styles.ctaUnit}> / hr</Text></Text>
            </View>
            <Pressable
              testID="charter-this-jet-button"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.navigate({ pathname: "/charter", params: { jet: jet.id } });
              }}
              style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.ctaBtnText}>Charter this jet</Text>
              <Feather name="arrow-right" size={16} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.spec}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 0.5, borderBottomColor: c.border },
  back: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: fonts.text, fontSize: 14, letterSpacing: 1, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { fontFamily: fonts.text, color: c.muted },
  image: { width: "100%", aspectRatio: 16 / 9, marginTop: 16 },
  body: { paddingHorizontal: 24 },
  maker: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 2, color: c.brandSecondary, marginBottom: 8 },
  name: { fontFamily: fonts.display, fontSize: 34, color: c.onSurface, letterSpacing: -0.5 },
  tagline: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24, color: c.onSurfaceSecondary, marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 32, borderTopWidth: 0.5, borderTopColor: c.border },
  spec: { width: "50%", paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: c.border },
  specLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 4 },
  specValue: { fontFamily: fonts.text, fontSize: 18, color: c.onSurface, fontVariant: ["tabular-nums"] },
  section: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginTop: 48, marginBottom: 16 },
  hl: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.brandSecondary },
  hlText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurfaceSecondary, flex: 1 },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 16, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border },
  ctaLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted },
  ctaPrice: { fontFamily: fonts.text, fontSize: 20, color: c.onSurface, fontVariant: ["tabular-nums"], fontWeight: "600" },
  ctaUnit: { fontSize: 13, color: c.muted, fontWeight: "400" },
  ctaBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 52, paddingHorizontal: 24, backgroundColor: c.brandPrimary, borderRadius: 4 },
  ctaBtnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary, letterSpacing: 0.3 },
}));
