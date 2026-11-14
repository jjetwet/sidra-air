import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { MARK_SILVER } from "@/src/jets";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Step = "code" | "create" | "signin";

export default function Access() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { verifyCode, register, signIn } = useAuth();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const submit = () => {
    if (step === "code") {
      if (!code.trim()) return setError("Please enter your access code.");
      return run(async () => {
        await verifyCode(code.trim());
        setStep("create");
      });
    }
    if (step === "create") {
      if (!name.trim()) return setError("Please enter your full name.");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please enter a valid email address.");
      if (password.length < 8) return setError("Your password needs at least 8 characters.");
      return run(() => register({ invite_code: code.trim(), name: name.trim(), email: email.trim(), password }));
    }
    if (!email.trim() || !password) return setError("Please enter your email and password.");
    return run(() => signIn(email.trim(), password));
  };

  const copy = {
    code: { title: "Private aviation,\nby invitation.", sub: "SIDRA is available to referred clients only. Enter the access code provided by your SIDRA representative.", cta: "Continue" },
    create: { title: "Create your\naccount.", sub: "Your access code has been accepted. Set up your account to manage charters, guests and payments.", cta: "Create account" },
    signin: { title: "Welcome\nback.", sub: "Sign in to your SIDRA account.", cta: "Sign in" },
  }[step];

  return (
    <View style={styles.root} testID="login-screen">
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
      >
        <Animated.View entering={FadeIn.duration(900)} style={styles.brand}>
          <Image source={MARK_SILVER} style={styles.mark} contentFit="contain" />
          <Text style={styles.word}>SIDRA</Text>
        </Animated.View>

        <Animated.View key={step} entering={FadeInDown.duration(500)} style={styles.copy}>
          <Text style={styles.title} testID="access-title">{copy.title}</Text>
          <Text style={styles.sub}>{copy.sub}</Text>
        </Animated.View>

        <View style={styles.form}>
          {step === "code" && (
            <Field label="Access code" value={code} onChangeText={setCode} testID="access-code-input" keyboardType="number-pad" autoFocus onSubmitEditing={submit} />
          )}
          {step === "create" && (
            <Field label="Full name" value={name} onChangeText={setName} testID="register-name-input" autoCapitalize="words" />
          )}
          {step !== "code" && (
            <>
              <Field label="Work email" value={email} onChangeText={setEmail} testID="auth-email-input" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <Field label="Password" value={password} onChangeText={setPassword} testID="auth-password-input" secureTextEntry onSubmitEditing={submit} />
            </>
          )}
          {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
          <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.btn, (pressed || busy) && { opacity: 0.85 }]} testID="access-submit-button">
            {busy ? <ActivityIndicator color={colors.onSurface} /> : (
              <>
                <Text style={styles.btnText}>{copy.cta}</Text>
                <Feather name="arrow-right" size={18} color={colors.onSurface} />
              </>
            )}
          </Pressable>
          {step === "signin" ? (
            <Pressable onPress={() => go("code")} style={styles.link} testID="go-access-code-link">
              <Text style={styles.linkText}>New to SIDRA? Enter an access code</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => go("signin")} style={styles.link} testID="go-sign-in-link">
              <Text style={styles.linkText}>Already a member? Sign in</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>
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
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "space-between", gap: 32 },
  brand: { alignItems: "flex-start", gap: 16 },
  mark: { width: 150, height: 40 },
  word: { fontFamily: fonts.text, fontSize: 13, letterSpacing: 8, color: c.brandSecondary },
  copy: { gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 38, lineHeight: 46, color: c.onSurfaceInverse, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.text, fontSize: 15, lineHeight: 23, color: c.brandSecondary },
  form: { gap: 4 },
  field: { marginBottom: 12 },
  label: { fontFamily: fonts.text, fontSize: 12, color: c.brandSecondary, letterSpacing: 0.5, marginBottom: 6 },
  input: { height: 52, borderRadius: 8, borderWidth: 1, borderColor: c.onSurfaceSecondary, paddingHorizontal: 16, fontFamily: fonts.text, fontSize: 16, color: c.onSurfaceInverse },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceInverse, marginBottom: 8 },
  btn: { marginTop: 8, height: 56, borderRadius: 8, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  btnText: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
  linkText: { fontFamily: fonts.text, fontSize: 14, color: c.brandSecondary },
}));
