import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatFullDate, maskPassport } from "@/src/api";
import { useTravellers } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Travellers() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useTravellers();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/travellers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travellers"] }),
  });

  return (
    <View style={styles.root} testID="travellers-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="travellers-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>SAVED TRAVELLERS</Text>
        <View style={styles.iconBtn} />
      </View>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(t) => t.id ?? t.passport_number}
          contentContainerStyle={[{ paddingBottom: insets.bottom + 24 }, !data?.length && { flex: 1 }]}
          ListHeaderComponent={
            <Text style={styles.intro}>Passengers are saved automatically when you add them to a charter, so you can add them again in one tap.</Text>
          }
          ListEmptyComponent={
            <View style={styles.center} testID="travellers-empty">
              <Feather name="users" size={24} color={colors.brandSecondary} />
              <Text style={styles.muted}>No saved travellers yet.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.row} testID={`traveller-row-${index}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.meta}>{item.nationality} · Passport {maskPassport(item.passport_number)} · Expires {formatFullDate(item.passport_expiry)}</Text>
              </View>
              <Pressable onPress={() => item.id && remove.mutate(item.id)} style={styles.iconBtn} testID={`traveller-delete-${index}`}>
                <Feather name="trash-2" size={18} color={colors.muted} />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  intro: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary, padding: 24 },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 24, paddingRight: 12, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: c.border },
  name: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: 4 },
}));
