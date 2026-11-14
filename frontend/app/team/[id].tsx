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

const PAY_METHODS = ["Bank transfer", "Wire transfer", "Cash", "Other"] as const;

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
  const [payMethod, setPayMethod] = useState<(typeof PAY_METHODS)[number]>("Bank transfer");
  const [payRef, setPayRef] = useState("");

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

  const markPaid = useMutation({
    mutationFn: () => api<Quote>(`/admin/quotes/${id}/mark-paid`, { method: "POST", body: JSON.stringify({ method: payMethod, reference: payRef }) }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(["admin-quote", id], data);
      qc.invalidateQueries({ queryKey: ["admin-quotes"] });
      setSaved(data.email_status === "Receipt email sent" ? `Marked paid. Receipt and invoice emailed to ${data.email}.` : "Marked paid. The receipt email could not be sent.");
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
  const paid = q?.payment_status === "paid";

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
            <Cell label="Payment" value={paid ? `Paid · ${q.payment_method ?? "Card"}${q.payment_reference ? ` · ${q.payment_reference}` : ""}` : q.payment_status === "pending" ? "Checkout started" : "Unpaid"} />
          </View>
          {!locked && (
            <View style={styles.editRow}>
              <Pressable style={styles.editBtn} onPress={() => router.push(`/team/edit/${id}`)} testID="team-edit-details-button">
                <Feather name="edit-2" size={14} color={colors.onSurface} />
                <Text style={styles.editText}>Edit trip</Text>
              </Pressable>
              <Pressable style={styles.editBtn} onPress={() => router.push({ pathname: "/trip/guests/[id]", params: { id, team: "1" } })} testID="team-edit-manifest-button">
                <Feather name="users" size={14} color={colors.onSurface} />
                <Text style={styles.editText}>Edit manifest</Text>
              </Pressable>
            </View>
          )}
          {q.notes ? (
            <View style={styles.block}>
              <Text style={styles.label}>Member requests</Text>
              <Text style={styles.body}>{q.notes}</Text>
            </View>
          ) : null}

          <View style={styles.block} testID="team-manifest">
            <Text style={styles.label}>Guest manifest · {q.guests?.length ?? 0} of {q.pax}</Text>
            {q.guests?.length ? (
              q.guests.map((g, i) => (
                <View key={g.id ?? i} style={styles.guest} testID={`team-guest-${i}`}>
                  <Text style={styles.guestName}>{g.full_name}{i === 0 ? "  · Lead passenger" : ""}</Text>
                  <Text style={styles.guestMeta}>
                    {g.nationality} · Born {formatDate(g.date_of_birth)}
                  </Text>
                  <Text style={styles.guestMeta}>
                    Passport {g.passport_number} · Expires {formatDate(g.passport_expiry)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.body}>The member hasn&apos;t added guests yet.</Text>
            )}
          </View>

          {locked ? (
            <View style={styles.block}><Text style={styles.body}>The member cancelled this request.</Text></View>
          ) : paid ? (
            <View style={styles.block} testID="team-paid-block">
              <Text style={styles.section}>Paid in full</Text>
              <Text style={styles.body}>{usd(q.final_price_usd ?? 0)} received{q.invoice_number ? ` · Invoice ${q.invoice_number}` : ""}. Price is locked; trip details and manifest can still be edited.</Text>
              {saved ? <Text style={styles.saved} testID="team-saved">{saved}</Text> : null}
            </View>
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

              {q.status === "Confirmed" && q.final_price_usd ? (
                <View style={styles.offline} testID="team-offline-payment">
                  <Text style={styles.section}>Paid outside the app?</Text>
                  <Text style={styles.body}>Record a bank transfer or other payment of {usd(q.final_price_usd)}. The member gets a receipt and PDF invoice.</Text>
                  <View style={styles.chips}>
                    {PAY_METHODS.map((m) => (
                      <Pressable key={m} style={[styles.chip, payMethod === m && styles.chipOn]} onPress={() => setPayMethod(m)} testID={`team-pay-method-${m}`}>
                        <Text style={[styles.chipText, payMethod === m && styles.chipTextOn]}>{m}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.label}>Reference (optional)</Text>
                  <TextInput value={payRef} onChangeText={setPayRef} style={styles.input} placeholder="e.g. Bank ref 88213" placeholderTextColor={colors.muted} testID="team-pay-ref-input" />
                  <Pressable style={styles.primary} onPress={() => markPaid.mutate()} disabled={markPaid.isPending} testID="team-mark-paid-button">
                    {markPaid.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryText}>Mark as paid</Text>}
                  </Pressable>
                </View>
              ) : null}
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
  guest: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: c.border },
  guestName: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  guestMeta: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary, marginTop: 2, fontVariant: ["tabular-nums"] },
  section: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginBottom: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, marginTop: 12 },
  saved: { fontFamily: fonts.text, fontSize: 13, color: c.success, marginTop: 12 },
  primary: { marginTop: 24, height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
  secondary: { marginTop: 12, height: 52, borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  editRow: { flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingTop: 16 },
  editBtn: { flex: 1, minHeight: 44, borderRadius: 4, borderWidth: 1, borderColor: c.border, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  editText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  offline: { marginTop: 32, paddingTop: 24, borderTopWidth: 0.5, borderTopColor: c.border },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 16 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  chipTextOn: { color: c.onBrandPrimary },
}));
