import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { MARK_SILVER } from "@/src/jets";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signingIn, error } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} testID="login-screen">
      <Animated.View entering={FadeIn.duration(900)} style={styles.brand}>
        <Image source={MARK_SILVER} style={styles.mark} contentFit="contain" />
        <Text style={styles.word}>SIDRA</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.copy}>
        <Text style={styles.title}>Private aviation,{"\n"}on your terms.</Text>
        <Text style={styles.sub}>Bombardier Global, Challenger and Gulfstream — chartered on demand, with a concierge at every step.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(500).duration(600)}>
        <Pressable
          testID="google-sign-in-button"
          disabled={signingIn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            signIn();
          }}
          style={({ pressed }) => [styles.btn, (pressed || signingIn) && { opacity: 0.8 }]}
        >
          {signingIn ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <>
              <Feather name="log-in" size={18} color={colors.onSurface} />
              <Text style={styles.btnText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
        <Text style={styles.fine}>Members only. Your trips and concierge chats follow you on every device.</Text>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse, paddingHorizontal: 24, justifyContent: "space-between" },
  brand: { alignItems: "flex-start", gap: 16 },
  mark: { width: 150, height: 40 },
  word: { fontFamily: fonts.text, fontSize: 13, letterSpacing: 8, color: c.brandSecondary },
  copy: { gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: c.onSurfaceInverse, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.text, fontSize: 15, lineHeight: 23, color: c.brandSecondary },
  btn: { height: 56, borderRadius: 4, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  btnText: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceInverse, marginTop: 12, textAlign: "center" },
  fine: { fontFamily: fonts.text, fontSize: 12, color: c.muted, textAlign: "center", marginTop: 16, lineHeight: 18 },
}));
