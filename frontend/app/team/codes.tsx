import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, usd } from "@/src/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Code = { code: string; client_name: string; active: boolean; is_default: boolean; members: number; charters: number; confirmed: number; paid_revenue_usd: number };

export default function AccessCodes() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [client, setClient] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin-codes"], queryFn: () => api<Code[]>("/admin/codes") });
  const create = useMutation({
    mutationFn: () => api("/admin/codes", { method: "POST", body: JSON.stringify({ client_name: client.trim(), code: custom.trim() || null }) }),
    onSuccess: () => {
      setClient("");
      setCustom("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-codes"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const toggle = useMutation({
    mutationFn: (code: string) => api(`/admin/codes/${code}/toggle`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-codes"] }),
  });

  return (
    <View style={styles.root} testID="access-codes-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="codes-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>CLIENT ACCESS CODES</Text>
        <View style={styles.iconBtn} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.block}>
          <Text style={styles.title}>Issue a new code</Text>
          <Text style={styles.label}>Client or partner name</Text>
          <TextInput value={client} onChangeText={setClient} style={styles.input} placeholder="e.g. Meridian Capital" placeholderTextColor={colors.muted} testID="code-client-input" />
          <Text style={[styles.label, { marginTop: 12 }]}>Custom code (optional)</Text>
          <TextInput value={custom} onChangeText={setCustom} style={styles.input} autoCapitalize="characters" autoCorrect={false} placeholder="Leave blank to generate" placeholderTextColor={colors.muted} testID="code-custom-input" />
          {error ? <Text style={styles.error} testID="code-error">{error}</Text> : null}
          <Pressable
            style={[styles.btn, (!client.trim() || create.isPending) && { opacity: 0.5 }]}
            disabled={!client.trim() || create.isPending}
            onPress={() => create.mutate()}
            testID="code-create-button"
          >
            {create.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Create access code</Text>}
          </Pressable>
        </View>

        <Text style={[styles.title, { paddingHorizontal: 24, marginTop: 8 }]}>Referral performance</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.onSurface} style={{ marginTop: 24 }} />
        ) : (
          data?.map((c, i) => (
            <View key={c.code} style={styles.row} testID={`code-row-${c.code}`}>
              <View style={styles.rowTop}>
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.client}>{c.client_name}</Text>
                  <Pressable
                    onPress={async () => {
                      await Clipboard.setStringAsync(c.code);
                      setCopied(c.code);
                    }}
                    style={styles.codeBtn}
                    testID={`code-copy-${c.code}`}
                  >
                    <Text style={[styles.code, !c.active && { color: colors.muted, textDecorationLine: "line-through" }]}>{c.code}</Text>
                    <Feather name={copied === c.code ? "check" : "copy"} size={14} color={colors.muted} />
                  </Pressable>
                </View>
                {!c.is_default && (
                  <Pressable onPress={() => toggle.mutate(c.code)} style={styles.toggle} testID={`code-toggle-${c.code}`}>
                    <Text style={styles.toggleText}>{c.active ? "Deactivate" : "Activate"}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.stats}>
                <Stat label="Members" value={`${c.members}`} />
                <Stat label="Charters" value={`${c.charters}`} />
                <Stat label="Confirmed" value={`${c.confirmed}`} />
                <Stat label="Paid" value={usd(c.paid_revenue_usd)} />
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  block: { padding: 24 },
  title: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, marginBottom: 12 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, marginTop: 8 },
  btn: { marginTop: 16, height: 52, borderRadius: 8, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: fonts.display, fontSize: 15, color: c.onBrandPrimary },
  row: { marginHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: c.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  rank: { width: 28, fontFamily: fonts.display, fontSize: 18, color: c.brandSecondary },
  client: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  codeBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  code: { fontFamily: fonts.text, fontSize: 15, letterSpacing: 2, color: c.onSurfaceSecondary },
  toggle: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  toggleText: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface, textDecorationLine: "underline" },
  stats: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingLeft: 40 },
  statLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted },
  statValue: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface, fontVariant: ["tabular-nums"] },
}));
