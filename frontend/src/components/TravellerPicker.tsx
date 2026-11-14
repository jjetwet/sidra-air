import Feather from "@react-native-vector-icons/feather";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Guest } from "@/src/api";
import { useTravellers } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

// One tap row of the member's saved travellers. Hidden when none are saved.
export function TravellerPicker({ onPick, selected = [], inset = 24, label = "Saved travellers" }: {
  onPick: (t: Guest) => void;
  selected?: string[];
  inset?: number;
  label?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data } = useTravellers();
  if (!data?.length) return null;
  return (
    <View style={styles.wrap} testID="traveller-picker">
      <Text style={[styles.label, { paddingHorizontal: inset }]}>{label}</Text>
      <View style={styles.row}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: inset }]}>
          {data.map((t, i) => {
            const on = selected.includes(t.passport_number);
            return (
              <Pressable key={t.id ?? t.passport_number} onPress={() => onPick(t)} style={[styles.chip, on && styles.chipOn]} testID={`saved-traveller-${i}`}>
                <Feather name={on ? "check" : "plus"} size={14} color={on ? colors.onBrandPrimary : colors.onSurface} />
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{t.full_name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 8 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5 },
  row: { height: 56 },
  content: { gap: 8, alignItems: "center", height: 56 },
  chip: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface, maxWidth: 160 },
  chipTextOn: { color: c.onBrandPrimary },
}));
