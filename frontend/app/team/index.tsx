import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDate, Quote, usd } from "@/src/api";
import { StatusPill } from "@/src/components/StatusPill";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const FILTERS = ["Requested", "Confirmed", "Unavailable", "Cancelled", "All"] as const;

export default function TeamDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Requested");

  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Record<string, number>>("/admin/stats") });
  const list = useQuery({
    queryKey: ["admin-quotes", filter],
    queryFn: () => api<Quote[]>(`/admin/quotes${filter === "All" ? "" : `?status=${filter}`}`),
  });

  const refresh = () => {
    stats.refetch();
    list.refetch();
  };

  return (
    <View style={styles.root} testID="team-dashboard-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="team-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurfaceInverse} />
        </Pressable>
        <Text style={styles.headerTitle}>SIDRA TEAM</Text>
        <Pressable onPress={() => router.push("/team/codes")} style={styles.iconBtn} testID="open-access-codes-button">
          <Feather name="key" size={20} color={colors.onSurfaceInverse} />
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Text style={styles.title}>Quote requests</Text>
        <View style={styles.statRow}>
          {(["Requested", "Confirmed", "Unavailable"] as const).map((s) => (
            <View key={s}>
              <Text style={styles.statValue} testID={`team-stat-${s.toLowerCase()}`}>{stats.data?.[s] ?? "–"}</Text>
              <Text style={styles.statLabel}>{s === "Requested" ? "Awaiting reply" : s}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContent}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]} testID={`team-filter-${f.toLowerCase()}`}>
              <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {list.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : list.isError ? (
        <View style={styles.center}><Text style={styles.muted}>{(list.error as Error).message}</Text></View>
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(q) => q.id}
          contentContainerStyle={[{ paddingBottom: insets.bottom + 24 }, !list.data?.length && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={refresh} tintColor={colors.onSurface} />}
          ListEmptyComponent={
            <View style={styles.center} testID="team-empty">
              <Feather name="check-circle" size={24} color={colors.brandSecondary} />
              <Text style={styles.muted}>Nothing here right now.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`team-quote-row-${item.id}`}
              onPress={() => router.push(`/team/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <View style={styles.rowTop}>
                <Text style={styles.route}>{item.from_code} → {item.to_code}</Text>
                <StatusPill status={item.status} />
              </View>
              <Text style={styles.meta}>{item.name} · {item.pax} guests · {item.jet_name}</Text>
              {item.guests?.[0] ? <Text style={styles.sub}>Lead: {item.guests[0].full_name} · {item.guests[0].nationality}</Text> : null}
              <Text style={styles.sub}>
                {formatDate(item.depart_date)} · {item.final_price_usd ? `Final ${usd(item.final_price_usd)}` : `Est. ${usd(item.estimated_price_usd)}`}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surfaceInverse },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.brandSecondary },
  hero: { backgroundColor: c.surfaceInverse, paddingHorizontal: 24, paddingBottom: 24 },
  title: { fontFamily: fonts.display, fontSize: 30, color: c.onSurfaceInverse },
  statRow: { flexDirection: "row", gap: 32, marginTop: 16 },
  statValue: { fontFamily: fonts.display, fontSize: 28, color: c.onSurfaceInverse, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: c.brandSecondary },
  chipRow: { height: 56, borderBottomWidth: 0.5, borderBottomColor: c.border },
  chipContent: { gap: 8, paddingHorizontal: 24, alignItems: "center", height: 56 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface },
  chipTextOn: { color: c.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  row: { paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  route: { fontFamily: fonts.text, fontSize: 20, fontWeight: "700", letterSpacing: 1, color: c.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceSecondary, marginTop: 6 },
  sub: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: 2, fontVariant: ["tabular-nums"] },
}));
