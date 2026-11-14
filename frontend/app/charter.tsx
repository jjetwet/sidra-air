import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Airport, api, asDate, Estimate, formatDuration, Guest, Quote, usd } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AirportPicker } from "@/src/components/AirportPicker";
import { DateStrip, DAYS, isoDate } from "@/src/components/DateStrip";
import { RouteMap } from "@/src/components/RouteMap";
import { TravellerPicker } from "@/src/components/TravellerPicker";
import { JET_IMAGES } from "@/src/jets";
import { useAirports, useFleet } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const WINDOWS = ["Flexible", "Morning", "Afternoon", "Evening"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CharterScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ jet?: string; from?: string; to?: string; pax?: string; trip?: string; depart?: string; ret?: string }>();
  const { user } = useAuth();
  const { data: fleet } = useFleet();
  const { data: airports } = useAirports();

  const [fromCode, setFromCode] = useState("DXB");
  const [toCode, setToCode] = useState("LBG");
  const [jetId, setJetId] = useState("global-7500");
  const [tripType, setTripType] = useState<"one_way" | "return">("one_way");
  const [depart, setDepart] = useState(isoDate(DAYS[6]));
  const [ret, setRet] = useState(isoDate(DAYS[13]));
  const [windowPref, setWindowPref] = useState<(typeof WINDOWS)[number]>("Flexible");
  const [pax, setPax] = useState(4);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<Guest>({ full_name: "", nationality: "", date_of_birth: "", passport_number: "", passport_expiry: "" });
  const setLeadField = (patch: Partial<Guest>) => setLead((l) => ({ ...l, ...patch }));

  useEffect(() => {
    if (params.jet) setJetId(params.jet);
    if (params.from) setFromCode(params.from);
    if (params.to) setToCode(params.to);
    if (params.pax) setPax(Math.max(1, Number(params.pax) || 1));
    if (params.trip === "return" || params.trip === "one_way") setTripType(params.trip);
    if (params.depart) setDepart(params.depart);
    if (params.ret) setRet(params.ret);
  }, [params.jet, params.from, params.to, params.pax, params.trip, params.depart, params.ret]);

  useEffect(() => {
    (async () => {
      setName((await storage.getItem("sidra_name", "")) || user?.name || "");
      setEmail((await storage.getItem("sidra_email", "")) || user?.email || "");
      const saved = await storage.secureGet("sidra_lead", "");
      if (saved) {
        try {
          setLead(JSON.parse(saved));
          return;
        } catch {}
      }
      setLead((l) => ({ ...l, full_name: l.full_name || user?.name || "" }));
    })();
  }, [user]);

  const jet = fleet?.find((j) => j.id === jetId);
  useEffect(() => {
    if (jet && pax > jet.pax) setPax(jet.pax);
  }, [jet, pax]);

  const byCode = useMemo(() => Object.fromEntries((airports ?? []).map((a) => [a.code, a])), [airports]);
  const from: Airport | undefined = byCode[fromCode];
  const to: Airport | undefined = byCode[toCode];

  const est = useQuery({
    queryKey: ["estimate", fromCode, toCode, jetId, tripType],
    queryFn: () =>
      api<Estimate>("/quotes/estimate", {
        method: "POST",
        body: JSON.stringify({ from_code: fromCode, to_code: toCode, jet_id: jetId, trip_type: tripType }),
      }),
    enabled: !!fromCode && !!toCode && fromCode !== toCode,
  });

  const submit = useMutation({
    mutationFn: async () =>
      api<Quote>("/quotes", {
        method: "POST",
        body: JSON.stringify({
          from_code: fromCode,
          to_code: toCode,
          jet_id: jetId,
          trip_type: tripType,
          depart_date: depart,
          return_date: tripType === "return" ? ret : null,
          depart_window: windowPref,
          pax,
          name: name.trim(),
          email: email.trim(),
          notes: notes.trim(),
          lead_passenger: { ...lead, full_name: lead.full_name.trim(), nationality: lead.nationality.trim(), passport_number: lead.passport_number.replace(/\s/g, "") },
        }),
      }),
    onSuccess: async (q) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await storage.setItem("sidra_name", name.trim());
      await storage.setItem("sidra_email", email.trim());
      await storage.secureSet("sidra_lead", JSON.stringify(lead));
      setNotes("");
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setToast(q.status === "Confirmed" ? `Flight confirmed · ${q.from_code} → ${q.to_code}` : `Quote requested · ${q.from_code} → ${q.to_code}`);
      setTimeout(() => {
        setToast(null);
        router.navigate(`/trip/${q.id}`);
      }, 1400);
    },
    onError: (e: Error) => setError(e.message),
  });

  const onRequest = () => {
    setError(null);
    if (!name.trim()) return setError("Please add your name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please add a valid email.");
    if (tripType === "return" && ret <= depart) return setError("Return must be after departure.");
    if (!lead.full_name.trim() || !lead.nationality.trim() || lead.passport_number.trim().length < 4)
      return setError("Please complete the lead passenger's details.");
    if (!DATE_RE.test(lead.date_of_birth) || !DATE_RE.test(lead.passport_expiry))
      return setError("Use YYYY-MM-DD for the lead passenger's dates.");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submit.mutate();
  };

  const swap = () => {
    Haptics.selectionAsync();
    setFromCode(toCode);
    setToCode(fromCode);
  };

  return (
    <View style={styles.root} testID="charter-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.iconBtn} testID="charter-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>CHARTER</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAwareScrollView
        bottomOffset={96}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Route */}
        <View style={styles.routeRow}>
          <Pressable style={styles.endpoint} onPress={() => setPicker("from")} testID="charter-from-button">
            <Text style={styles.endLabel}>FROM</Text>
            <Text style={styles.code} testID="charter-from-code">{fromCode}</Text>
            <Text style={styles.city} numberOfLines={1}>{from?.city ?? "—"}</Text>
          </Pressable>
          <Pressable onPress={swap} style={styles.swap} testID="charter-swap-button" hitSlop={8}>
            <Feather name="repeat" size={16} color={colors.onSurface} />
          </Pressable>
          <Pressable style={[styles.endpoint, { alignItems: "flex-end" }]} onPress={() => setPicker("to")} testID="charter-to-button">
            <Text style={styles.endLabel}>TO</Text>
            <Text style={styles.code} testID="charter-to-code">{toCode}</Text>
            <Text style={styles.city} numberOfLines={1}>{to?.city ?? "—"}</Text>
          </Pressable>
        </View>

        <RouteMap from={from} to={to} height={180} testID="charter-route-map" />

        <View style={styles.estRow} testID="charter-estimate">
          {est.isFetching ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : est.data ? (
            <Animated.View entering={FadeIn} style={styles.estInner}>
              <EstStat label="Distance" value={`${est.data.distance_nm.toLocaleString("en-US")} nm`} />
              <EstStat label="Flight time" value={formatDuration(est.data.flight_minutes)} testID="charter-estimate-time" />
              <EstStat label={est.data.fuel_stops ? `Stops` : "Nonstop"} value={est.data.fuel_stops ? `${est.data.fuel_stops}` : "Yes"} />
            </Animated.View>
          ) : (
            <Text style={styles.mutedText}>{est.error ? (est.error as Error).message : "Select a route"}</Text>
          )}
        </View>

        {/* Trip type */}
        <Section title="Journey">
          <View style={styles.segment}>
            {(["one_way", "return"] as const).map((t) => (
              <Pressable
                key={t}
                testID={`trip-type-${t}`}
                onPress={() => setTripType(t)}
                style={[styles.segBtn, tripType === t && styles.segOn]}
              >
                <Text style={[styles.segText, tripType === t && styles.segTextOn]}>{t === "one_way" ? "One way" : "Return"}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Departure">
          <DateStrip value={depart} onChange={setDepart} prefix="depart" />
          <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContent}>
            {WINDOWS.map((w) => (
              <Pressable key={w} testID={`depart-window-${w.toLowerCase()}`} onPress={() => setWindowPref(w)} style={[styles.chip, windowPref === w && styles.chipOn]}>
                <Text style={[styles.chipText, windowPref === w && styles.chipTextOn]}>{w}</Text>
              </Pressable>
            ))}
          </ScrollView>
          </View>
        </Section>

        {tripType === "return" && (
          <Section title="Return">
            <DateStrip value={ret} onChange={setRet} prefix="return" />
          </Section>
        )}

        <Section title="Guests">
          <View style={styles.paxRow}>
            <Text style={styles.paxValue} testID="charter-pax-value">{pax}</Text>
            <Text style={styles.mutedText}>of {jet?.pax ?? "—"} seats</Text>
            <View style={{ flex: 1 }} />
            <Pressable testID="charter-pax-minus" onPress={() => setPax((p) => Math.max(1, p - 1))} style={styles.step}>
              <Feather name="minus" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="charter-pax-plus" onPress={() => setPax((p) => Math.min(jet?.pax ?? 19, p + 1))} style={styles.step}>
              <Feather name="plus" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
        </Section>

        <Section title="Aircraft" flush>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jetRow}>
            {(fleet ?? []).map((j) => {
              const on = j.id === jetId;
              return (
                <Pressable
                  key={j.id}
                  testID={`charter-jet-option-${j.id}`}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setJetId(j.id);
                  }}
                  style={[styles.jetCard, on && styles.jetCardOn]}
                >
                  <Image source={JET_IMAGES[j.id]} style={styles.jetImg} contentFit="contain" />
                  <Text style={styles.jetName} numberOfLines={1}>{j.name}</Text>
                  <Text style={styles.jetMeta}>{j.pax} guests · {usd(j.hourly_usd)}/hr</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Section>

        <Section title="Lead passenger">
          <Text style={styles.leadHint}>Enter details exactly as shown on the passport. Additional passengers can be added from the trip.</Text>
          <TravellerPicker
            inset={0}
            label="Choose a saved traveller"
            selected={lead.passport_number ? [lead.passport_number] : []}
            onPick={(t) => setLead({ full_name: t.full_name, nationality: t.nationality, date_of_birth: t.date_of_birth, passport_number: t.passport_number, passport_expiry: t.passport_expiry })}
          />
          <Field label="Full name" value={lead.full_name} onChangeText={(v) => setLeadField({ full_name: v })} testID="lead-name-input" autoCapitalize="words" />
          <Field label="Nationality" value={lead.nationality} onChangeText={(v) => setLeadField({ nationality: v })} testID="lead-nationality-input" autoCapitalize="words" />
          <Field label="Date of birth (YYYY-MM-DD)" value={lead.date_of_birth} onChangeText={(v) => setLeadField({ date_of_birth: asDate(v) })} testID="lead-dob-input" keyboardType="number-pad" placeholder="1985-04-12" />
          <Field label="Passport number" value={lead.passport_number} onChangeText={(v) => setLeadField({ passport_number: v.toUpperCase() })} testID="lead-passport-input" autoCapitalize="characters" autoCorrect={false} />
          <Field label="Passport expiry (YYYY-MM-DD)" value={lead.passport_expiry} onChangeText={(v) => setLeadField({ passport_expiry: asDate(v) })} testID="lead-expiry-input" keyboardType="number-pad" placeholder="2031-09-30" />
        </Section>

        <Section title="Booking contact">
          <Field label="Full name" value={name} onChangeText={setName} testID="charter-name-input" autoCapitalize="words" />
          <Field label="Work email" value={email} onChangeText={setEmail} testID="charter-email-input" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Special requirements (catering, ground transport, accessibility)" value={notes} onChangeText={setNotes} testID="charter-notes-input" multiline />
        </Section>
        {error ? <Text style={styles.error} testID="charter-error">{error}</Text> : null}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaLabel}>Estimated{tripType === "return" ? " · return" : ""}</Text>
            <Text style={styles.ctaPrice} testID="charter-estimated-price">
              {est.data ? usd(est.data.estimated_price_usd) : "—"}
            </Text>
          </View>
          <Pressable
            testID="request-quote-button"
            disabled={submit.isPending || !est.data}
            onPress={onRequest}
            style={({ pressed }) => [styles.ctaBtn, (pressed || submit.isPending || !est.data) && { opacity: 0.6 }]}
          >
            {submit.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaBtnText}>Request Quote</Text>}
          </Pressable>
        </View>
      </KeyboardStickyView>

      {toast && (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.toast, { top: insets.top + 12 }]} testID="charter-toast">
          <Feather name="check" size={16} color={colors.onSurfaceInverse} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      <AirportPicker
        visible={picker !== null}
        title={picker === "from" ? "Departing from" : "Flying to"}
        airports={airports ?? []}
        exclude={picker === "from" ? toCode : fromCode}
        onClose={() => setPicker(null)}
        onSelect={(a) => {
          if (picker === "from") setFromCode(a.code);
          else setToCode(a.code);
          setPicker(null);
        }}
      />
    </View>
  );
}

function Section({ title, children, flush }: { title: string; children: React.ReactNode; flush?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={flush ? undefined : styles.sectionBody}>{children}</View>
    </View>
  );
}

function EstStat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View>
      <Text style={styles.estLabel}>{label}</Text>
      <Text style={styles.estValue} testID={testID}>{value}</Text>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { label, multiline, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { minHeight: 72, textAlignVertical: "top", paddingTop: 12 }]}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border, backgroundColor: c.surface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  routeRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingTop: 16 },
  endpoint: { flex: 1, minHeight: 44 },
  endLabel: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, color: c.muted },
  code: { fontFamily: fonts.text, fontSize: 34, fontWeight: "700", color: c.onSurface, letterSpacing: 1 },
  city: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary },
  swap: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  estRow: { minHeight: 64, justifyContent: "center", paddingHorizontal: 24, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: c.border },
  estInner: { flexDirection: "row", justifyContent: "space-between" },
  estLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted, marginBottom: 2 },
  estValue: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface, fontVariant: ["tabular-nums"], fontWeight: "500" },
  mutedText: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  section: { paddingTop: 32 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, paddingHorizontal: 24, marginBottom: 12 },
  sectionBody: { paddingHorizontal: 24 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.borderStrong, borderRadius: 4, overflow: "hidden" },
  segBtn: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: c.brandPrimary },
  segText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface },
  segTextOn: { color: c.onBrandPrimary },
  chipRow: { height: 56, marginHorizontal: -24 },
  chipContent: { gap: 8, paddingHorizontal: 24, alignItems: "center", height: 56 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface },
  chipTextOn: { color: c.onBrandPrimary },
  paxRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  paxValue: { fontFamily: fonts.display, fontSize: 36, color: c.onSurface, fontVariant: ["tabular-nums"] },
  step: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  jetRow: { gap: 12, paddingHorizontal: 24 },
  jetCard: { flexShrink: 0, width: 176, padding: 12, borderRadius: 4, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  jetCardOn: { borderColor: c.borderStrong },
  jetImg: { width: "100%", height: 72 },
  jetName: { fontFamily: fonts.text, fontSize: 14, color: c.onSurface, marginTop: 8, fontWeight: "500" },
  jetMeta: { fontFamily: fonts.text, fontSize: 11, color: c.muted, marginTop: 2, fontVariant: ["tabular-nums"] },
  field: { marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface, backgroundColor: c.surface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, paddingHorizontal: 24 },
  leadHint: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: -4, marginBottom: 12 },
  cta: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border },
  ctaLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted },
  ctaPrice: { fontFamily: fonts.text, fontSize: 22, fontWeight: "600", color: c.onSurface, fontVariant: ["tabular-nums"] },
  ctaBtn: { height: 52, paddingHorizontal: 28, borderRadius: 4, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", minWidth: 156 },
  ctaBtnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary, letterSpacing: 0.3 },
  toast: { position: "absolute", left: 24, right: 24, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 48, borderRadius: 4, backgroundColor: c.surfaceInverse },
  toastText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceInverse },
}));
