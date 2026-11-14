import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, asDate, Guest, maskPassport, Quote } from "@/src/api";
import { TravellerPicker } from "@/src/components/TravellerPicker";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const EMPTY: Guest = { full_name: "", nationality: "", date_of_birth: "", passport_number: "", passport_expiry: "" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function GuestManifest() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [open, setOpen] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: q, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api<Quote>(`/quotes/${id}`) });

  useEffect(() => {
    if (!q) return;
    setGuests(q.guests?.length ? q.guests : [{ ...EMPTY, full_name: q.name }]);
    setOpen(q.guests?.length ? null : 0);
  }, [q]);

  const save = useMutation({
    mutationFn: () =>
      api<Quote>(`/quotes/${id}/guests`, {
        method: "PUT",
        body: JSON.stringify({ guests: guests.map((g) => ({ ...g, full_name: g.full_name.trim(), nationality: g.nationality.trim(), passport_number: g.passport_number.replace(/\s/g, "") })) }),
      }),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(["quote", id], data);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["travellers"] });
      setSaved(true);
      setTimeout(() => router.back(), 900);
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = (i: number, patch: Partial<Guest>) => {
    setSaved(false);
    setGuests((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  };

  const onSave = () => {
    setError(null);
    for (const [i, g] of guests.entries()) {
      const who = g.full_name.trim() || `Guest ${i + 1}`;
      if (!g.full_name.trim() || !g.nationality.trim() || !g.passport_number.trim()) {
        setOpen(i);
        return setError(`Complete all details for ${who}.`);
      }
      if (!DATE.test(g.date_of_birth) || !DATE.test(g.passport_expiry)) {
        setOpen(i);
        return setError(`Use YYYY-MM-DD dates for ${who}.`);
      }
    }
    save.mutate();
  };

  return (
    <View style={styles.root} testID="guest-manifest-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="manifest-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>GUEST MANIFEST</Text>
        <View style={styles.iconBtn} />
      </View>

      {isLoading || !q ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={100} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <View style={styles.intro}>
              <Text style={styles.title}>{q.from_code} → {q.to_code}</Text>
              <Text style={styles.sub}>
                Add each traveller exactly as shown on their passport. Shared only with the SIDRA flight team for border and handling requirements.
              </Text>
              <Text style={styles.count} testID="manifest-count">{guests.length} of {q.pax} guests</Text>
            </View>

            <TravellerPicker
              label="Add a saved traveller in one tap"
              selected={guests.map((g) => g.passport_number).filter(Boolean)}
              onPick={(t) => {
                setSaved(false);
                setError(null);
                if (guests.some((g) => g.passport_number === t.passport_number)) return;
                const blank = guests.findIndex((g) => !g.passport_number);
                const entry = { full_name: t.full_name, nationality: t.nationality, date_of_birth: t.date_of_birth, passport_number: t.passport_number, passport_expiry: t.passport_expiry };
                if (blank >= 0) setGuests((gs) => gs.map((g, j) => (j === blank ? entry : g)));
                else if (guests.length < q.pax) setGuests((gs) => [...gs, entry]);
                else setError(`This charter is for ${q.pax} passengers.`);
              }}
            />

            {guests.map((g, i) => {
              const expanded = open === i;
              return (
                <View key={g.id ?? `new-${i}`} style={styles.card} testID={`manifest-guest-${i}`}>
                  <Pressable style={styles.cardHead} onPress={() => setOpen(expanded ? null : i)} testID={`manifest-guest-toggle-${i}`}>
                    <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{g.full_name || `Guest ${i + 1}`}{i === 0 ? <Text style={styles.meta}>  · Lead passenger</Text> : null}</Text>
                      {!expanded && g.passport_number ? (
                        <Text style={styles.meta}>{g.nationality} · {maskPassport(g.passport_number)}</Text>
                      ) : null}
                    </View>
                    <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                  </Pressable>
                  {expanded && (
                    <View style={styles.form}>
                      <Field label="Full name (as on passport)" value={g.full_name} onChangeText={(v) => update(i, { full_name: v })} testID={`guest-name-input-${i}`} autoCapitalize="words" />
                      <Field label="Nationality" value={g.nationality} onChangeText={(v) => update(i, { nationality: v })} testID={`guest-nationality-input-${i}`} autoCapitalize="words" />
                      <Field label="Date of birth (YYYY-MM-DD)" value={g.date_of_birth} onChangeText={(v) => update(i, { date_of_birth: asDate(v) })} testID={`guest-dob-input-${i}`} keyboardType="number-pad" placeholder="1985-04-12" />
                      <Field label="Passport number" value={g.passport_number} onChangeText={(v) => update(i, { passport_number: v.toUpperCase() })} testID={`guest-passport-input-${i}`} autoCapitalize="characters" autoCorrect={false} />
                      <Field label="Passport expiry (YYYY-MM-DD)" value={g.passport_expiry} onChangeText={(v) => update(i, { passport_expiry: asDate(v) })} testID={`guest-expiry-input-${i}`} keyboardType="number-pad" placeholder="2031-09-30" />
                      <Pressable
                        style={styles.remove}
                        testID={`guest-remove-button-${i}`}
                        onPress={() => {
                          setGuests((gs) => gs.filter((_, j) => j !== i));
                          setOpen(null);
                        }}
                      >
                        <Feather name="trash-2" size={14} color={colors.muted} />
                        <Text style={styles.removeText}>Remove guest</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {guests.length < q.pax && (
              <Pressable
                style={styles.add}
                testID="manifest-add-guest-button"
                onPress={() => {
                  setGuests((gs) => [...gs, { ...EMPTY }]);
                  setOpen(guests.length);
                }}
              >
                <Feather name="plus" size={16} color={colors.onSurface} />
                <Text style={styles.addText}>Add guest</Text>
              </Pressable>
            )}
            {error ? <Text style={styles.error} testID="manifest-error">{error}</Text> : null}
          </KeyboardAwareScrollView>

          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable style={[styles.btn, save.isPending && { opacity: 0.6 }]} onPress={onSave} disabled={save.isPending} testID="manifest-save-button">
                {save.isPending ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    {saved && <Feather name="check" size={16} color={colors.onBrandPrimary} />}
                    <Text style={styles.btnText}>{saved ? "Manifest saved" : "Save manifest"}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>
        </>
      )}
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { label, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={colors.muted} style={styles.input} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary, marginTop: 8 },
  count: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 1, color: c.brandSecondary, marginTop: 16 },
  card: { marginHorizontal: 24, marginBottom: 12, borderWidth: 1, borderColor: c.border, borderRadius: 4 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 60 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  numText: { fontFamily: fonts.text, fontSize: 12, color: c.onSurfaceInverse },
  name: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: 2 },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 16 },
  field: { marginBottom: 12 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  remove: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44 },
  removeText: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  add: { marginHorizontal: 24, height: 52, borderRadius: 4, borderWidth: 1, borderStyle: "dashed", borderColor: c.borderStrong, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  addText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, paddingHorizontal: 24, marginTop: 16 },
  cta: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border },
  btn: { height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
}));
