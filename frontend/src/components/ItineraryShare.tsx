import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Airport, formatDate, formatDuration, Quote, usd } from "@/src/api";
import { RouteMap } from "@/src/components/RouteMap";
import { JET_IMAGES, MARK_SILVER } from "@/src/jets";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Props = { visible: boolean; onClose: () => void; q: Quote; from?: Airport; to?: Airport };

// Branded itinerary card members can send to their guests as an image.
export function ItineraryShare({ visible, onClose, q, from, to }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    setNote(null);
    if (Platform.OS === "web") {
      setNote("Sharing opens on your phone. Use the SIDRA app on iOS or Android.");
      return;
    }
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share itinerary", UTI: "public.png" });
      } else {
        setNote("Sharing isn't available on this device.");
      }
    } catch {
      setNote("Could not create the itinerary image. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const price = q.final_price_usd ?? q.estimated_price_usd;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]} testID="itinerary-share-sheet">
        <View style={styles.head}>
          <Text style={styles.title}>Share itinerary</Text>
          <Pressable onPress={onClose} style={styles.close} testID="itinerary-close-button">
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.cardWrap}>
          <View ref={cardRef} collapsable={false} style={styles.card} testID="itinerary-card">
            <View style={styles.cardTop}>
              <Image source={MARK_SILVER} style={styles.mark} contentFit="contain" />
              <Text style={styles.word}>SIDRA</Text>
            </View>
            <View style={styles.codes}>
              <View>
                <Text style={styles.code}>{q.from_code}</Text>
                <Text style={styles.city}>{from?.city}</Text>
              </View>
              <Feather name="arrow-right" size={20} color={colors.brandSecondary} />
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.code}>{q.to_code}</Text>
                <Text style={styles.city}>{to?.city}</Text>
              </View>
            </View>
            <RouteMap from={from} to={to} height={150} />
            <View style={styles.grid}>
              <Cell label="DEPARTS" value={`${formatDate(q.depart_date)}`} sub={q.depart_window} />
              <Cell label={q.trip_type === "return" ? "RETURNS" : "JOURNEY"} value={q.trip_type === "return" && q.return_date ? formatDate(q.return_date) : "One way"} />
              <Cell label="FLIGHT TIME" value={formatDuration(q.flight_minutes)} sub={q.fuel_stops ? `${q.fuel_stops} fuel stop` : "Nonstop"} />
              <Cell label="GUESTS" value={`${q.pax}`} />
            </View>
            <View style={styles.jetRow}>
              <Image source={JET_IMAGES[q.jet_id]} style={styles.jetImg} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>AIRCRAFT</Text>
                <Text style={styles.jetName}>{q.jet_name}</Text>
              </View>
            </View>
            <Text style={styles.footer}>
              {q.status === "Confirmed" ? "Confirmed" : "Requested"} · Hosted by {q.name}
            </Text>
          </View>
        </View>

        {note ? <Text style={styles.note} testID="itinerary-note">{note}</Text> : null}
        <Text style={styles.hint}>Prices are not shown on the card ({usd(price)} stays private).</Text>
        <Pressable style={styles.btn} onPress={share} disabled={busy} testID="itinerary-share-button">
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
            <>
              <Feather name="share" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.btnText}>Share with guests</Text>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  close: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  cardWrap: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  card: { backgroundColor: c.surface, borderRadius: 8, overflow: "hidden", borderWidth: 0.5, borderColor: c.border },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surfaceInverse, paddingHorizontal: 20, height: 52 },
  mark: { width: 56, height: 15 },
  word: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 6, color: c.brandSecondary },
  codes: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  code: { fontFamily: fonts.text, fontSize: 30, fontWeight: "700", letterSpacing: 1, color: c.onSurface },
  city: { fontFamily: fonts.text, fontSize: 12, color: c.onSurfaceSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, paddingTop: 8 },
  cell: { width: "50%", paddingVertical: 8 },
  label: { fontFamily: fonts.text, fontSize: 9, letterSpacing: 1.5, color: c.muted, marginBottom: 2 },
  value: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface, fontVariant: ["tabular-nums"] },
  sub: { fontFamily: fonts.text, fontSize: 11, color: c.muted },
  jetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: c.border, marginTop: 8 },
  jetImg: { width: 110, height: 44 },
  jetName: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  footer: { fontFamily: fonts.text, fontSize: 11, color: c.muted, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4, letterSpacing: 0.3 },
  note: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary, textAlign: "center", paddingHorizontal: 24, marginTop: 12 },
  hint: { fontFamily: fonts.text, fontSize: 12, color: c.muted, textAlign: "center", marginTop: 12 },
  btn: { marginHorizontal: 24, marginTop: 12, height: 52, borderRadius: 4, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
}));
