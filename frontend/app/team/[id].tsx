import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDate, formatDuration, Quote, usd } from "@/src/api";
import { RouteMap } from "@/src/components/RouteMap";
import { StatusPill } from "@/src/components/StatusPill";
import { useAirports } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function TeamQuote() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: airports } = useAirports();
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { data: q, isLoading } = useQuery({ queryKey: ["admin-quote", id], queryFn: () => api<Quote>(`/admin/quotes/${id}`) });

  useEffect(() => {
    if (!q) return;
    setPrice(String(Math.round(q.final_price_usd ?? q.estimated_price_usd)));
    setMessage(q.team_message ?? "");
  }, [q]);

  const update = useMutation({
    mutationFn: (status: "Confirmed" | "Unavailable" | "Requested") =>
      api<Quote>(`/admin/quotes/${id}`, {
        method: "POST",
        body: JSON.stringify({
          status,
          final_price_usd: status === "Confirmed" ? Number(price.replace(/[^0-9.]/g, "")) || null : null,
          team_message: message,
        }),
      }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(["admin-quote", id], data);
      qc.invalidateQueries({ queryKey: ["admin-quotes"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setSaved(
        data.status === "Confirmed"
          ? data.email_status === "Confirmation email sent"
            ? `Confirmed. Branded confirmation emailed to ${data.email}.`
            : "Confirmed in the app, but the email could not be sent. The member still sees it in Trips."
          : `Marked ${data.status}.`,
      );
      setError(null);
    },
    onError: (e: Error) => {
      setError(e.message);
      setSaved(null);
    },
  });

  const from = airports?.find((a) => a.code === q?.from_code);
  const to = airports?.find((a) => a.code === q?.to_code);
  const locked = q?.status === "Cancelled";

  return (
    <View style={styles.root} testID="team-quote-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="team-quote-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>REQUEST</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading || !q ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <View style={styles.topRow}>
              <Text style={styles.route}>{q.from_code} → {q.to_code}</Text>
              <StatusPill status={q.status} />
            </View>
            <Text style={styles.meta}>{from?.city} to {to?.city}</Text>
          </View>
          <RouteMap from={from} to={to} height={170} />

          <View style={styles.grid}>
            <Cell label="Member" value={q.name} />
            <Cell label="Email" value={q.email} />
            <Cell label="Departs" value={`${formatDate(q.depart_date)} · ${q.depart_window}`} />
            <Cell label="Return" value={q.trip_type === "return" && q.return_date ? formatDate(q.return_date) : "One way"} />
            <Cell label="Aircraft" value={q.jet_name} />
            <Cell label="Guests" value={`${q.pax}`} />
            <Cell label="Flight time" value={`${formatDuration(q.flight_minutes)}${q.fuel_stops ? ` · ${q.fuel_stops} stop` : ""}`} />
            <Cell label="Estimate" value={usd(q.estimated_price_usd)} />
            <Cell label="Member email" value={q.email_status ?? "—"} />
          </View>
          {q.notes ? (
            <View style={styles.block}>
              <Text style={styles.label}>Member requests</Text>
              <Text style={styles.body}>{q.notes}</Text>
            </View>
          ) : null}

          {locked ? (
            <View style={styles.block}><Text style={styles.body}>The member cancelled this request.</Text></View>
          ) : (
            <View style={styles.block}>
              <Text style={styles.section}>Respond</Text>
              <Text style={styles.label}>Final price (USD)</Text>
              <TextInput
                testID="team-final-price-input"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                style={styles.input}
                placeholderTextColor={colors.muted}
              />
              <Text style={[styles.label, { marginTop: 16 }]}>Message to member</Text>
              <TextInput
                testID="team-message-input"
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="e.g. Tail A6-SDR confirmed, catering by Nobu, chauffeur at FBO."
                placeholderTextColor={colors.muted}
                style={[styles.input, { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }]}
              />
              {error ? <Text style={styles.error} testID="team-error">{error}</Text> : null}
              {saved ? <Text style={styles.saved} testID="team-saved">{saved}</Text> : null}
              <Pressable style={styles.primary} onPress={() => update.mutate("Confirmed")} disabled={update.isPending} testID="team-confirm-button">
                {update.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                  <>
                    <Feather name="check" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.primaryText}>Confirm & send final price</Text>
                  </>
                )}
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => update.mutate("Unavailable")} disabled={update.isPending} testID="team-unavailable-button">
                <Text style={styles.secondaryText}>Mark unavailable</Text>
              </Pressable>
            </View>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  route: { fontFamily: fonts.text, fontSize: 28, fontWeight: "700", letterSpacing: 1, color: c.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceSecondary, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 24, borderTopWidth: 0.5, borderTopColor: c.border },
  cell: { width: "50%", paddingVertical: 14, paddingRight: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  value: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface, fontVariant: ["tabular-nums"] },
  block: { paddingHorizontal: 24, paddingTop: 24 },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary },
  section: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginBottom: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, marginTop: 12 },
  saved: { fontFamily: fonts.text, fontSize: 13, color: c.success, marginTop: 12 },
  primary: { marginTop: 24, height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
  secondary: { marginTop: 12, height: 52, borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
}));
