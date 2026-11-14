import { Pressable, ScrollView, Text, View } from "react-native";

import { formatDate } from "@/src/api";
import { fonts, makeStyles } from "@/src/theme";

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const DAYS = Array.from({ length: 60 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i + 1);
  return d;
});

export function DateStrip({ value, onChange, prefix, inset = 24 }: { value: string; onChange: (v: string) => void; prefix: string; inset?: number }) {
  const styles = useStyles();
  return (
    <View>
      <Text style={styles.selected} testID={`${prefix}-date-selected`}>{formatDate(value)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { paddingHorizontal: inset }]} style={{ marginHorizontal: -inset }}>
        {DAYS.map((d) => {
          const v = isoDate(d);
          const on = v === value;
          return (
            <Pressable key={v} testID={`${prefix}-date-${v}`} onPress={() => onChange(v)} style={[styles.cell, on && styles.on]}>
              <Text style={[styles.dow, on && styles.textOn]}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</Text>
              <Text style={[styles.num, on && styles.textOn]}>{d.getDate()}</Text>
              <Text style={[styles.dow, on && styles.textOn]}>{d.toLocaleDateString("en-US", { month: "short" })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  selected: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceSecondary, marginBottom: 8 },
  row: { gap: 8 },
  cell: { flexShrink: 0, width: 56, height: 72, borderRadius: 4, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  on: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dow: { fontFamily: fonts.text, fontSize: 10, color: c.muted, letterSpacing: 1 },
  num: { fontFamily: fonts.text, fontSize: 20, color: c.onSurface, fontVariant: ["tabular-nums"], marginVertical: 2 },
  textOn: { color: c.onBrandPrimary },
}));
