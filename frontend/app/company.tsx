import Feather from "@react-native-vector-icons/feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Company = {
  company_id: string;
  name: string;
  billing_address: string;
  vat_number: string;
  owner_user_id: string;
  members: { user_id: string; name: string; email: string; company_role: string }[];
  pending_invites: string[];
};

export default function CompanyScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [vat, setVat] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: company, isLoading } = useQuery({ queryKey: ["company"], queryFn: () => api<Company | null>("/company") });
  const isOwner = user?.company_role === "owner";

  useEffect(() => {
    if (company) {
      setName(company.name);
      setAddress(company.billing_address);
      setVat(company.vat_number);
    }
  }, [company]);

  const call = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: object }) =>
      api<Company>(path, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: async (data, v) => {
      setError(null);
      qc.setQueryData(["company"], data);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      if (v.path === "/company" && v.method === "POST") await refreshUser();
      setMsg(v.path === "/company/invite" ? "Invitation saved. Your colleague joins when they sign in or create their account." : "Saved.");
      if (v.path === "/company/invite") setInvite("");
    },
    onError: (e: Error) => {
      setMsg(null);
      setError(e.message);
    },
  });

  const details = { name: name.trim(), billing_address: address.trim(), vat_number: vat.trim() };

  return (
    <View style={styles.root} testID="company-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="company-back-button">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>COMPANY ACCOUNT</Text>
        <View style={styles.iconBtn} />
      </View>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32 }}>
          <Text style={styles.title}>{company ? company.name : "Set up a company account"}</Text>
          <Text style={styles.sub}>
            {company
              ? "Colleagues and assistants on this account can book charters, manage passengers and pay on behalf of the company. Invoices are issued to the company details below."
              : "Book, manage and pay for charters as a company. Invite colleagues and executive assistants, and receive invoices in your company name."}
          </Text>

          <Text style={styles.section}>Billing details</Text>
          <Field label="Company name" value={name} onChangeText={setName} editable={!company || isOwner} testID="company-name-input" />
          <Field label="Billing address" value={address} onChangeText={setAddress} editable={!company || isOwner} multiline testID="company-address-input" />
          <Field label="VAT or tax ID (optional)" value={vat} onChangeText={setVat} editable={!company || isOwner} autoCapitalize="characters" testID="company-vat-input" />
          {(!company || isOwner) && (
            <Pressable
              style={[styles.btn, (!name.trim() || call.isPending) && { opacity: 0.5 }]}
              disabled={!name.trim() || call.isPending}
              onPress={() => call.mutate({ path: "/company", method: company ? "PATCH" : "POST", body: details })}
              testID="company-save-button"
            >
              <Text style={styles.btnText}>{company ? "Save details" : "Create company account"}</Text>
            </Pressable>
          )}

          {company && (
            <>
              <Text style={styles.section}>Team</Text>
              {company.members.map((m) => (
                <View key={m.user_id} style={styles.member} testID={`company-member-${m.email}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name || m.email}</Text>
                    <Text style={styles.memberMeta}>{m.email} · {m.company_role === "owner" ? "Account owner" : "Booker"}</Text>
                  </View>
                  {isOwner && m.company_role !== "owner" && (
                    <Pressable onPress={() => call.mutate({ path: `/company/members/${m.user_id}`, method: "DELETE" })} style={styles.iconBtn} testID={`company-remove-${m.email}`}>
                      <Feather name="user-minus" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              ))}
              {company.pending_invites.map((e) => (
                <View key={e} style={styles.member} testID={`company-invite-${e}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{e}</Text>
                    <Text style={styles.memberMeta}>Invitation pending</Text>
                  </View>
                  {isOwner && (
                    <Pressable onPress={() => call.mutate({ path: `/company/invites/${encodeURIComponent(e)}`, method: "DELETE" })} style={styles.iconBtn} testID={`company-cancel-invite-${e}`}>
                      <Feather name="x" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              ))}
              {isOwner && (
                <>
                  <Field label="Invite a colleague or assistant by email" value={invite} onChangeText={setInvite} keyboardType="email-address" autoCapitalize="none" testID="company-invite-input" />
                  <Text style={styles.hint}>New colleagues also need your SIDRA access code to create their account.</Text>
                  <Pressable
                    style={[styles.btnOutline, !invite.trim() && { opacity: 0.5 }]}
                    disabled={!invite.trim() || call.isPending}
                    onPress={() => call.mutate({ path: "/company/invite", method: "POST", body: { email: invite.trim() } })}
                    testID="company-invite-button"
                  >
                    <Text style={styles.btnOutlineText}>Send invitation</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
          {msg ? <Text style={styles.msg} testID="company-message">{msg}</Text> : null}
          {error ? <Text style={styles.error} testID="company-error">{error}</Text> : null}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { label, multiline, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...rest} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && { minHeight: 80, paddingTop: 12, textAlignVertical: "top" }]} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 3, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary, marginTop: 8 },
  section: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface, marginTop: 32, marginBottom: 12 },
  label: { fontFamily: fonts.text, fontSize: 11, color: c.muted, letterSpacing: 0.5, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  btn: { marginTop: 8, height: 52, borderRadius: 8, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: fonts.display, fontSize: 15, color: c.onBrandPrimary },
  btnOutline: { marginTop: 4, height: 52, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  btnOutlineText: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface },
  member: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: c.border },
  memberName: { fontFamily: fonts.display, fontSize: 15, color: c.onSurface },
  memberMeta: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: 2 },
  hint: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginBottom: 8 },
  msg: { fontFamily: fonts.text, fontSize: 13, color: c.success, marginTop: 16 },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, marginTop: 16 },
}));
