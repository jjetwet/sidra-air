import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatDate, Quote, usd } from "@/src/api";
import { BrandHeader } from "@/src/components/Brand";
import { StatusPill } from "@/src/components/StatusPill";
import { usesNativeTabs } from "@/src/navigation";
import { useQuotes } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function TripsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useQuotes();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]} testID="trips-screen">
      <BrandHeader title="Trips" subtitle="Charter requests and confirmed flights" />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
          <Text style={styles.muted}>Loading trips…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load trips.</Text>
          <Pressable onPress={() => refetch()} style={styles.btn} testID="trips-retry-button">
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(q) => q.id}
          contentContainerStyle={[{ paddingBottom: bottomChrome + 24 }, !data?.length && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.onSurface} />}
          ListEmptyComponent={
            <View style={styles.center} testID="trips-empty">
              <Feather name="navigation-2" size={28} color={colors.brandSecondary} />
              <Text style={styles.emptyTitle}>No charters yet</Text>
              <Text style={styles.muted}>Your charter requests and confirmed flights will appear here.</Text>
              <Pressable onPress={() => router.navigate("/charter")} style={styles.btn} testID="trips-start-charter-button">
                <Text style={styles.btnText}>Plan a charter</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => <TripRow q={item} index={index} onPress={() => router.push(`/trip/${item.id}`)} />}
        />
      )}
    </View>
  );
}

function TripRow({ q, index, onPress }: { q: Quote; index: number; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
      <Pressable testID={`trip-row-${q.id}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}>
        <View style={styles.rowTop}>
          <Text style={styles.route}>{q.from_code} <Text style={styles.arrow}>→</Text> {q.to_code}</Text>
          <StatusPill status={q.status} />
        </View>
        <Text style={styles.meta}>
          {formatDate(q.depart_date)}{q.trip_type === "return" && q.return_date ? ` – ${formatDate(q.return_date)}` : ""} · {q.jet_name}
        </Text>
        <Text style={styles.price}>
          {q.final_price_usd ? `${usd(q.final_price_usd)}${q.payment_status === "paid" ? " paid" : ""}` : `${usd(q.estimated_price_usd)} est.`} · {q.pax} guests{q.company_id ? ` · Booked by ${q.name}` : ""}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  muted: { fontFamily: fonts.text, fontSize: 14, color: c.muted, textAlign: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  btn: { marginTop: 8, paddingHorizontal: 24, height: 48, justifyContent: "center", backgroundColor: c.brandPrimary, borderRadius: 4 },
  btnText: { fontFamily: fonts.text, color: c.onBrandPrimary, fontSize: 14 },
  row: { paddingHorizontal: 24, paddingVertical: 24, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  route: { fontFamily: fonts.text, fontSize: 24, fontWeight: "700", letterSpacing: 1, color: c.onSurface },
  arrow: { color: c.brandSecondary, fontWeight: "400" },
  meta: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceSecondary, marginTop: 6 },
  price: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: 4, fontVariant: ["tabular-nums"] },
}));
