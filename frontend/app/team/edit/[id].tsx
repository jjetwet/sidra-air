import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, asDate, Quote, usd } from "@/src/api";
import { AirportPicker } from "@/src/components/AirportPicker";
import { useAirports, useFleet } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const WINDOWS = ["Morning", "Afternoon", "Evening", "Flexible"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function TeamEditTrip() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: airports = [] } = useAirports();
  const { data: fleet = [] } = useFleet();
  const { data: q, isLoading } = useQuery({ queryKey: ["admin-quote", id], queryFn: () => api<Quote>(`/admin/quotes/${id}`) });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jet, setJet] = useState("");
  const [trip, setTrip] = useState<"one_way" | "return">("one_way");
  const [depart, setDepart] = useState("");
  const [ret, setRet] = useState("");
  const [win, setWin] = useState<(typeof WINDOWS)[number]>("Flexible");
  const [pax, setPax] = useState(1);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q) return;
    setFrom(q.from_code);
    setTo(q.to_code);
    setJet(q.jet_id);
    setTrip(q.trip_type);
    setDepart(q.depart_date);
    setRet(q.return_date ?? "");
    setWin((WINDOWS as readonly string[]).includes(q.depart_window) ? (q.depart_window as (typeof WINDOWS)[number]) : "Flexible");
    setPax(q.pax);
  }, [q]);

  const seats = fleet.find((j) => j.id === jet)?.pax ?? 19;

  const save = useMutation({
    mutationFn: () =>
      api<Quote>(`/admin/quotes/${id}/details`, {
        method: "POST",
        body: JSON.stringify({ from_code: from, to_code: to, jet_id: jet, trip_type: trip, depart_date: depart, return_date: trip === "return" ? ret : null, depart_window: win, pax }),
      }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(["admin-quote", id], data);
      qc.invalidateQueries({ queryKey: ["admin-quotes"] });
      router.back();
    },
    onError: (e: Error) => setError(e.message),
  });

  const onSave = () => {
    setError(null);
    if (!DATE.test(depart) || (trip === "return" && !DATE.test(ret))) return setError("Use YYYY-MM-DD dates.");
    if (pax > seats) return setError(`This aircraft seats up to ${seats}.`);
    save.mutate();
  };

  const city = (c: string) => airports.find((a) => a.code === c)?.city ?? "";

  return (
    <View style={styles.root} testID="team-edit-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="team-edit-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>EDIT TRIP</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading || !q ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={100} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <View style={styles.block}>
              <Text style={styles.section}>Route</Text>
              <View style={styles.routeRow}>
                <Pressable style={styles.airport} onPress={() => setPicker("from")} testID="edit-from-button">
                  <Text style={styles.label}>From</Text>
                  <Text style={styles.code}>{from}</Text>
                  <Text style={styles.city}>{city(from)}</Text>
                </Pressable>
                <Feather name="arrow-right" size={18} color={colors.muted} />
                <Pressable style={styles.airport} onPress={() => setPicker("to")} testID="edit-to-button">
                  <Text style={styles.label}>To</Text>
                  <Text style={styles.code}>{to}</Text>
                  <Text style={styles.city}>{city(to)}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.section}>Aircraft</Text>
              {fleet.map((j) => (
                <Pressable key={j.id} style={[styles.option, jet === j.id && styles.optionOn]} onPress={() => setJet(j.id)} testID={`edit-jet-${j.id}`}>
                  <Text style={styles.optionText}>{j.name}</Text>
                  <Text style={styles.optionMeta}>Up to {j.pax}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.block}>
              <Text style={styles.section}>Dates</Text>
              <View style={styles.chips}>
                {(["one_way", "return"] as const).map((t) => (
                  <Pressable key={t} style={[styles.chip, trip === t && styles.chipOn]} onPress={() => setTrip(t)} testID={`edit-trip-${t}`}>
                    <Text style={[styles.chipText, trip === t && styles.chipTextOn]}>{t === "one_way" ? "One way" : "Return"}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Departure (YYYY-MM-DD)</Text>
              <TextInput value={depart} onChangeText={(v) => setDepart(asDate(v))} keyboardType="number-pad" style={styles.input} testID="edit-depart-input" />
              {trip === "return" && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Return (YYYY-MM-DD)</Text>
                  <TextInput value={ret} onChangeText={(v) => setRet(asDate(v))} keyboardType="number-pad" style={styles.input} testID="edit-return-input" />
                </>
              )}
              <Text style={[styles.label, { marginTop: 16 }]}>Departure time</Text>
              <View style={styles.chips}>
                {WINDOWS.map((w) => (
                  <Pressable key={w} style={[styles.chip, win === w && styles.chipOn]} onPress={() => setWin(w)} testID={`edit-window-${w}`}>
                    <Text style={[styles.chipText, win === w && styles.chipTextOn]}>{w}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.section}>Guests</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => setPax((p) => Math.max(1, p - 1))} testID="edit-pax-minus">
                  <Feather name="minus" size={18} color={colors.onSurface} />
                </Pressable>
                <Text style={styles.paxText} testID="edit-pax-value">{pax}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setPax((p) => Math.min(seats, p + 1))} testID="edit-pax-plus">
                  <Feather name="plus" size={18} color={colors.onSurface} />
                </Pressable>
              </View>
              <Text style={styles.note}>
                Current estimate {usd(q.estimated_price_usd)}. The estimate is recalculated on save. Changing the route, aircraft or trip type on a confirmed, unpaid trip sends it back to Requested so you can confirm a new price.
              </Text>
            </View>
            {error ? <Text style={styles.error} testID="team-edit-error">{error}</Text> : null}
          </KeyboardAwareScrollView>

          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable style={[styles.btn, save.isPending && { opacity: 0.6 }]} onPress={onSave} disabled={save.isPending} testID="team-edit-save-button">
                {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Save changes</Text>}
              </Pressable>
            </View>
          </KeyboardStickyView>

          <AirportPicker
            visible={picker !== null}
            title={picker === "from" ? "Departing from" : "Flying to"}
            airports={airports}
            exclude={picker === "from" ? to : from}
            onClose={() => setPicker(null)}
            onSelect={(a) => {
              if (picker === "from") setFrom(a.code);
              else setTo(a.code);
              setPicker(null);
            }}
          />
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  block: { paddingHorizontal: 24, paddingTop: 24 },
  section: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginBottom: 12 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  airport: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 4, padding: 12, minHeight: 80 },
  code: { fontFamily: fonts.text, fontSize: 24, fontWeight: "700", color: c.onSurface },
  city: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border, borderRadius: 4, marginBottom: 8 },
  optionOn: { borderColor: c.brandPrimary, borderWidth: 2 },
  optionText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  optionMeta: { fontFamily: fonts.text, fontSize: 12, color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  chipTextOn: { color: c.onBrandPrimary },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  stepper: { flexDirection: "row", alignItems: "center", gap: 24 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  paxText: { fontFamily: fonts.text, fontSize: 24, color: c.onSurface, minWidth: 32, textAlign: "center", fontVariant: ["tabular-nums"] },
  note: { fontFamily: fonts.text, fontSize: 13, lineHeight: 19, color: c.onSurfaceSecondary, marginTop: 16 },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, paddingHorizontal: 24, marginTop: 16 },
  cta: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border },
  btn: { height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
}));
