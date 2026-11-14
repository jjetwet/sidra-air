import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import Feather from "@react-native-vector-icons/feather";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Jet, usd } from "@/src/api";
import { BrandHeader } from "@/src/components/Brand";
import { JET_IMAGES } from "@/src/jets";
import { usesNativeTabs } from "@/src/navigation";
import { useFleet } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const FILTERS = ["All", "Global", "Challenger", "Gulfstream", "Boeing"] as const;

export default function FleetScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [q, setQ] = useState("");
  const { data, isLoading, isError, refetch, isRefetching } = useFleet();

  const jets = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter(
      (j) =>
        (filter === "All" || j.family === filter) &&
        (!s || `${j.maker} ${j.name} ${j.family}`.toLowerCase().includes(s) || (Number(s) > 0 && j.pax >= Number(s))),
    );
  }, [data, filter, q]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]} testID="fleet-screen">
      <BrandHeader title="The Fleet" subtitle="Global · Challenger · Gulfstream · BBJ" />
      <View style={styles.search}>
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          testID="fleet-search-input"
          value={q}
          onChangeText={setQ}
          placeholder="Search aircraft or number of guests"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8} testID="fleet-search-clear">
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chipRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContent}>
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              testID={`fleet-filter-${f.toLowerCase()}`}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter(f);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
          <Text style={styles.muted}>Preparing fleet…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load the fleet.</Text>
          <Pressable onPress={() => refetch()} style={styles.retry} testID="fleet-retry-button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={jets}
          keyExtractor={(j) => j.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<Text style={[styles.muted, { textAlign: "center", marginTop: 48 }]} testID="fleet-empty">No aircraft match your search.</Text>}
          contentContainerStyle={{ paddingBottom: bottomChrome + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.onSurface} />}
          renderItem={({ item, index }) => (
            <JetCard jet={item} index={index} onPress={() => router.push(`/jet/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

function JetCard({ jet, index, onPress }: { jet: Jet; index: number; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(450)}>
      <Pressable
        testID={`jet-card-${jet.id}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      >
        <Image source={JET_IMAGES[jet.id]} style={styles.image} contentFit="contain" transition={250} />
        <View style={styles.cardBody}>
          <Text style={styles.maker}>{jet.maker.toUpperCase()} · {jet.family.toUpperCase()}</Text>
          <Text style={styles.name}>{jet.name}</Text>
          <View style={styles.stats}>
            <Stat label="Range" value={`${jet.range_nm.toLocaleString("en-US")} nm`} />
            <Stat label="Guests" value={`${jet.pax}`} />
            <Stat label="Speed" value={`${jet.speed_kts} kt`} />
            <Stat label="From / hr" value={usd(jet.hourly_usd)} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 24, marginBottom: 4, paddingHorizontal: 12, height: 44, borderRadius: 4, backgroundColor: c.surfaceSecondary },
  searchInput: { flex: 1, height: 44, fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  chipRow: { height: 56, borderBottomWidth: 0.5, borderBottomColor: c.border },
  chipContent: { gap: 8, paddingHorizontal: 24, alignItems: "center", height: 56 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.border, justifyContent: "center", backgroundColor: c.surface },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface, letterSpacing: 0.3 },
  chipTextOn: { color: c.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  retry: { paddingHorizontal: 24, height: 44, justifyContent: "center", backgroundColor: c.brandPrimary, borderRadius: 4 },
  retryText: { fontFamily: fonts.text, color: c.onBrandPrimary, fontSize: 14 },
  card: { paddingTop: 24, paddingBottom: 32, borderBottomWidth: 0.5, borderBottomColor: c.border },
  image: { width: "100%", aspectRatio: 16 / 8, backgroundColor: c.surface },
  cardBody: { paddingHorizontal: 24 },
  maker: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 2, color: c.brandSecondary, marginBottom: 4 },
  name: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, marginBottom: 16 },
  stats: { flexDirection: "row", justifyContent: "space-between" },
  stat: { flexShrink: 1 },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface, fontVariant: ["tabular-nums"], fontWeight: "500" },
}));
