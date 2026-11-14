import Feather from "@react-native-vector-icons/feather";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatFullDate } from "@/src/api";
import { NATIONALITIES } from "@/src/countries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

type Base = { label: string; value: string; onChange: (v: string) => void; testID: string };

function Trigger({ label, text, placeholder, icon, onPress, testID }: { label: string; text: string; placeholder: string; icon: "calendar" | "chevron-down"; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={onPress} testID={testID}>
        <Text style={[styles.triggerText, !text && { color: colors.muted }]}>{text || placeholder}</Text>
        <Feather name={icon} size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function Sheet({ visible, title, onClose, children, testID }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID={testID}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} style={styles.iconBtn} testID={`${testID}-close`}>
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** Calendar picker. `minYear`/`maxYear` bound the year list (e.g. birth dates in the past, expiry dates in the future). */
export function DateField({ label, value, onChange, testID, minYear, maxYear, defaultYear }: Base & { minYear: number; maxYear: number; defaultYear?: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [yearMode, setYearMode] = useState(false);
  const init = () => {
    const [y, m] = value.split("-").map(Number);
    return y && m ? { y, m: m - 1 } : { y: defaultYear ?? maxYear, m: 0 };
  };
  const [view, setView] = useState(init);

  const show = () => {
    setView(init());
    setYearMode(!value);
    setOpen(true);
  };
  const step = (d: number) =>
    setView(({ y, m }) => {
      const n = m + d;
      const ny = y + Math.floor(n / 12);
      return ny < minYear || ny > maxYear ? { y, m } : { y: ny, m: ((n % 12) + 12) % 12 };
    });

  const days = new Date(view.y, view.m + 1, 0).getDate();
  const lead = new Date(view.y, view.m, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);

  return (
    <>
      <Trigger label={label} text={value ? formatFullDate(value) : ""} placeholder="Select date" icon="calendar" onPress={show} testID={testID} />
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} testID={`${testID}-picker`}>
        <View style={styles.calHead}>
          <Pressable onPress={() => step(-1)} style={styles.iconBtn} testID={`${testID}-prev`}>
            <Feather name="chevron-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={() => setYearMode((v) => !v)} style={styles.monthBtn} testID={`${testID}-year-toggle`}>
            <Text style={styles.monthText}>{MONTHS[view.m]} {view.y}</Text>
            <Feather name={yearMode ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => step(1)} style={styles.iconBtn} testID={`${testID}-next`}>
            <Feather name="chevron-right" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        {yearMode ? (
          <ScrollView style={styles.yearList} contentContainerStyle={styles.yearGrid}>
            {years.map((y) => (
              <Pressable key={y} style={[styles.yearCell, y === view.y && styles.on]} onPress={() => { setView((v) => ({ ...v, y })); setYearMode(false); }} testID={`${testID}-year-${y}`}>
                <Text style={[styles.cellText, y === view.y && styles.onText]}>{y}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <>
            <View style={styles.monthRow}>
              {MONTHS.map((m, i) => (
                <Pressable key={m} style={[styles.monthChip, i === view.m && styles.on]} onPress={() => setView((v) => ({ ...v, m: i }))} testID={`${testID}-month-${i + 1}`}>
                  <Text style={[styles.monthChipText, i === view.m && styles.onText]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.grid}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <View key={`h${i}`} style={styles.dayCell}><Text style={styles.dow}>{d}</Text></View>
              ))}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.dayCell} />;
                const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
                const on = iso === value;
                return (
                  <Pressable key={iso} style={styles.dayCell} onPress={() => { onChange(iso); setOpen(false); }} testID={`${testID}-day-${d}`}>
                    <View style={[styles.dayInner, on && styles.on]}>
                      <Text style={[styles.cellText, on && styles.onText]}>{d}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

export function NationalityField({ label, value, onChange, testID }: Base) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NATIONALITIES.filter((n) => n.toLowerCase().includes(s)) : NATIONALITIES;
  }, [q]);

  return (
    <>
      <Trigger label={label} text={value} placeholder="Select nationality" icon="chevron-down" onPress={() => { setQ(""); setOpen(true); }} testID={testID} />
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} testID={`${testID}-picker`}>
        <View style={styles.search}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.muted} style={styles.searchInput} autoCorrect={false} testID={`${testID}-search`} />
        </View>
        <FlatList
          data={list}
          keyExtractor={(n) => n}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => { onChange(item); setOpen(false); }} testID={`${testID}-option-${item}`}>
              <Text style={styles.rowText}>{item}</Text>
              {item === value ? <Feather name="check" size={18} color={colors.onSurface} /> : null}
            </Pressable>
          )}
        />
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  field: { marginBottom: 12 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  triggerText: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, maxHeight: "80%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingLeft: 8 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  monthBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 },
  monthText: { fontFamily: fonts.text, fontSize: 17, fontWeight: "600", color: c.onSurface },
  monthRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 8 },
  monthChip: { width: "15%", flexGrow: 1, minHeight: 36, borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  monthChipText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" },
  dayInner: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dow: { fontFamily: fonts.text, fontSize: 11, color: c.muted },
  cellText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface, fontVariant: ["tabular-nums"] },
  on: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  onText: { color: c.onBrandPrimary },
  yearList: { maxHeight: 340 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  yearCell: { width: "22%", flexGrow: 1, height: 44, borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 4, paddingHorizontal: 12, minHeight: 44, marginVertical: 8 },
  searchInput: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: c.onSurface, minHeight: 44 },
  list: { maxHeight: 420 },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rowText: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
}));
