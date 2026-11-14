import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDate, formatDuration, maskPassport, Quote, usd } from "@/src/api";
import { ItineraryShare } from "@/src/components/ItineraryShare";
import { RouteMap } from "@/src/components/RouteMap";
import { StatusPill } from "@/src/components/StatusPill";
import { JET_IMAGES } from "@/src/jets";
import { useAirports } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function TripDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: airports } = useAirports();
  const [confirm, setConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { data: q, isLoading, isError } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => api<Quote>(`/quotes/${id}`),
  });

  const cancel = useMutation({
    mutationFn: () => api<Quote>(`/quotes/${id}/cancel`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["quote", id], data);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setConfirm(false);
    },
  });

  const from = airports?.find((a) => a.code === q?.from_code);
  const to = airports?.find((a) => a.code === q?.to_code);

  return (
    <View style={styles.root} testID="trip-detail-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/trips"))} style={styles.iconBtn} testID="trip-detail-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>TRIP</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : isError || !q ? (
        <View style={styles.center}><Text style={styles.muted}>Trip not found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <View style={styles.top}>
            <StatusPill status={q.status} />
            <View style={styles.codes}>
              <View>
                <Text style={styles.code} testID="trip-detail-from">{q.from_code}</Text>
                <Text style={styles.city}>{from?.city}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.code} testID="trip-detail-to">{q.to_code}</Text>
                <Text style={styles.city}>{to?.city}</Text>
              </View>
            </View>
          </View>
          <RouteMap from={from} to={to} height={200} testID="trip-route-map" />

          <View style={styles.grid}>
            <Cell label="Departure" value={`${formatDate(q.depart_date)} · ${q.depart_window}`} />
            <Cell label="Return" value={q.trip_type === "return" && q.return_date ? formatDate(q.return_date) : "One way"} />
            <Cell label="Distance" value={`${q.distance_nm.toLocaleString("en-US")} nm`} />
            <Cell label="Flight time" value={`${formatDuration(q.flight_minutes)}${q.fuel_stops ? ` · ${q.fuel_stops} stop` : ""}`} />
            <Cell label="Guests" value={`${q.pax}`} />
            {q.final_price_usd ? (
              <Cell label="Final price" value={usd(q.final_price_usd)} testID="trip-detail-final-price" />
            ) : (
              <Cell label="Estimate" value={usd(q.estimated_price_usd)} testID="trip-detail-price" />
            )}
          </View>

          {q.team_message ? (
            <View style={styles.teamNote} testID="trip-detail-team-message">
              <Text style={styles.label}>From the SIDRA team</Text>
              <Text style={styles.body}>{q.team_message}</Text>
            </View>
          ) : null}

          {q.guests?.[0] ? (
            <View style={styles.leadCard} testID="trip-detail-lead-passenger">
              <Text style={styles.label}>Lead passenger</Text>
              <Text style={styles.leadName} testID="trip-detail-lead-name">{q.guests[0].full_name}</Text>
              <Text style={styles.body}>
                {q.guests[0].nationality} · Born {formatDate(q.guests[0].date_of_birth)}
              </Text>
              <Text style={styles.body}>
                Passport {maskPassport(q.guests[0].passport_number)} · Expires {formatDate(q.guests[0].passport_expiry)}
              </Text>
            </View>
          ) : null}

          <View style={styles.jet}>
            <Image source={JET_IMAGES[q.jet_id]} style={styles.jetImg} contentFit="contain" />
            <Text style={styles.jetName}>{q.jet_name}</Text>
          </View>

          <Pressable
            testID="trip-manifest-button"
            disabled={q.status === "Cancelled"}
            onPress={() => router.push(`/trip/guests/${q.id}`)}
            style={({ pressed }) => [styles.manifest, pressed && { backgroundColor: colors.surfaceSecondary }]}
          >
            <Feather name="users" size={18} color={colors.onSurface} />
            <View style={{ flex: 1 }}>
              <Text style={styles.manifestTitle}>Guest manifest</Text>
              <Text style={styles.manifestSub} testID="trip-manifest-count">
                {(q.guests?.length ?? 0)} of {q.pax} guests added{(q.guests?.length ?? 0) < q.pax && q.status !== "Cancelled" ? " · required before departure" : ""}
              </Text>
            </View>
            {q.status !== "Cancelled" && <Feather name="chevron-right" size={18} color={colors.muted} />}
          </Pressable>

          {q.notes ? (
            <View style={styles.block}>
              <Text style={styles.label}>Requests</Text>
              <Text style={styles.body}>{q.notes}</Text>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.body}>
              {q.status === "Cancelled"
                ? "This request has been cancelled."
                : q.status === "Confirmed"
                  ? `Your flight is confirmed. Details have been sent to ${q.email}.`
                  : q.status === "Unavailable"
                    ? "This aircraft isn't available for these dates. Ask the concierge for alternatives."
                    : `Our flight team will confirm availability and send your final quote to ${q.email}.`}
            </Text>
          </View>

          <View style={styles.actions}>
            {q.status !== "Cancelled" && (
              <Pressable style={styles.primary} onPress={() => setSharing(true)} testID="trip-share-itinerary-button">
                <Feather name="share" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.primaryText}>Share itinerary</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondary} onPress={() => router.navigate("/concierge")} testID="trip-ask-concierge-button">
              <Feather name="message-circle" size={16} color={colors.onSurface} />
              <Text style={styles.secondaryText}>Ask the concierge</Text>
            </Pressable>
            {q.status !== "Cancelled" && (
              <Pressable style={styles.secondary} onPress={() => setConfirm(true)} testID="trip-cancel-button">
                <Text style={styles.secondaryText}>Cancel request</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}

      {q && <ItineraryShare visible={sharing} onClose={() => setSharing(false)} q={q} from={from} to={to} />}

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]} testID="cancel-confirm-sheet">
            <Text style={styles.sheetTitle}>Cancel this request?</Text>
            <Text style={styles.body}>Your quote request will be withdrawn. You can always request a new one.</Text>
            <Pressable style={[styles.primary, { marginTop: 24 }]} onPress={() => cancel.mutate()} testID="cancel-confirm-button">
              {cancel.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryText}>Yes, cancel</Text>}
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setConfirm(false)} testID="cancel-dismiss-button">
              <Text style={styles.secondaryText}>Keep request</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Cell({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} testID={testID}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border, backgroundColor: c.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { fontFamily: fonts.text, color: c.muted },
  top: { paddingHorizontal: 24, paddingTop: 24, alignItems: "flex-start" },
  codes: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: 16 },
  code: { fontFamily: fonts.text, fontSize: 40, fontWeight: "700", letterSpacing: 1, color: c.onSurface },
  city: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 24, borderTopWidth: 0.5, borderTopColor: c.border },
  cell: { width: "50%", paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: c.border, paddingRight: 8 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 4 },
  value: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface, fontVariant: ["tabular-nums"] },
  jet: { paddingHorizontal: 24, paddingTop: 32, alignItems: "center" },
  jetImg: { width: "100%", aspectRatio: 16 / 7 },
  jetName: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginTop: 8 },
  block: { paddingHorizontal: 24, paddingTop: 24 },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary },
  actions: { paddingHorizontal: 24, paddingTop: 32, gap: 12 },
  primary: { height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
  secondary: { height: 52, borderRadius: 4, borderWidth: 1, borderColor: c.border, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 },
  manifest: { flexDirection: "row", alignItems: "center", gap: 16, marginHorizontal: 24, marginTop: 24, paddingHorizontal: 16, minHeight: 64, borderWidth: 1, borderColor: c.border, borderRadius: 4 },
  manifestTitle: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  manifestSub: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: 2 },
  leadCard: { marginHorizontal: 24, marginTop: 24, padding: 16, borderWidth: 1, borderColor: c.border, borderRadius: 4, gap: 2 },
  leadName: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, marginBottom: 4 },
  teamNote: { marginHorizontal: 24, marginTop: 24, padding: 16, backgroundColor: c.brandTertiary, borderRadius: 4 },
  secondaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, padding: 24, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface, marginBottom: 8 },
}));
