import Feather from "@react-native-vector-icons/feather";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Airport } from "@/src/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Props = {
  visible: boolean;
  title: string;
  airports: Airport[];
  exclude?: string;
  onClose: () => void;
  onSelect: (a: Airport) => void;
};

export function AirportPicker({ visible, title, airports, exclude, onClose, onSelect }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return airports.filter(
      (a) =>
        a.code !== exclude &&
        (!s || a.code.toLowerCase().includes(s) || a.city.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.country.toLowerCase().includes(s)),
    );
  }, [q, airports, exclude]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom }]} testID="airport-picker">
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} testID="airport-picker-close">
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            testID="airport-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="City, airport or code"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(a) => a.code}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`airport-option-${item.code}`}
              onPress={() => {
                setQ("");
                onSelect(item);
              }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={styles.code}>{item.code}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.city}>{item.city}</Text>
                <Text style={styles.name}>{item.name} · {item.country}</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  close: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 24, marginBottom: 8, paddingHorizontal: 12, height: 48, backgroundColor: c.surfaceSecondary, borderRadius: 4 },
  input: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: c.onSurface, height: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16 },
  code: { width: 52, fontFamily: fonts.text, fontSize: 18, fontWeight: "700", color: c.onSurface, letterSpacing: 1 },
  city: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  name: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: 2 },
  sep: { height: 1, backgroundColor: c.divider, marginLeft: 92 },
}));
