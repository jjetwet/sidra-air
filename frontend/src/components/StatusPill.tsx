import { Text, View } from "react-native";

import { fonts, makeStyles } from "@/src/theme";

export function StatusPill({ status }: { status: string }) {
  const styles = useStyles();
  const cancelled = status === "Cancelled";
  return (
    <View style={[styles.pill, cancelled && styles.cancel]} testID="trip-status-pill">
      <Text style={[styles.text, cancelled && styles.cancelText]}>{status}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pill: { height: 26, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.brandTertiary, justifyContent: "center" },
  text: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 0.5, color: c.onBrandTertiary },
  cancel: { backgroundColor: c.surfaceSecondary },
  cancelText: { color: c.muted },
}));
