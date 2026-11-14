import Feather from "@react-native-vector-icons/feather";
import { fetch as expoFetch } from "expo/fetch";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API, api, authHeaders, ChatMessage } from "@/src/api";
import { MARK_SILVER } from "@/src/jets";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const SUGGESTIONS = [
  "Arrange ground transport on arrival",
  "Plan catering for a working flight",
  "Which aircraft suits a team of 12 to London?",
  "Reserve hotel rooms for our delegation",
  "Travelling with a pet",
];

export default function ConciergeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    (async () => {
      try {
        setMessages(await api<ChatMessage[]>("/concierge/history"));
      } catch {
        setError("Connection lost.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const scrollEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  const send = async (raw?: string) => {
    const msg = (raw ?? text).trim();
    if (!msg || streaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    setText("");
    const now = new Date().toISOString();
    const aiId = `ai-${now}`;
    setMessages((m) => [...m, { id: `u-${now}`, role: "user", content: msg, created_at: now }, { id: aiId, role: "assistant", content: "", created_at: now }]);
    setStreaming(true);
    scrollEnd();
    try {
      const res = await expoFetch(`${API}/concierge/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.delta) {
            setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, content: x.content + payload.delta } : x)));
            scrollEnd();
          } else if (payload.error) {
            setError(payload.error);
          }
        }
      }
    } catch {
      setError("Connection lost. Please try again.");
    } finally {
      setMessages((m) => m.filter((x) => !(x.id === aiId && !x.content)));
      setStreaming(false);
    }
  };

  const clear = async () => {
    await api("/concierge/history", { method: "DELETE" });
    setMessages([]);
  };

  return (
    <View style={styles.root} testID="concierge-screen">
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <View style={styles.heroRow}>
          <Image source={MARK_SILVER} style={styles.mark} contentFit="contain" testID="concierge-sidra-mark" />
          {messages.length > 0 && (
            <Pressable onPress={clear} hitSlop={8} style={styles.clear} testID="concierge-clear-button">
              <Feather name="rotate-ccw" size={16} color={colors.onSurfaceInverse} />
            </Pressable>
          )}
        </View>
        <Text style={styles.heroTitle}>Concierge</Text>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.heroSub}>Available at any hour</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.onSurface} />
            <Text style={styles.muted}>Connecting to concierge…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.list, !messages.length && { flex: 1 }]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.empty} testID="concierge-empty">
                <Text style={styles.emptyTitle}>How may we assist?</Text>
                <Text style={styles.emptyBody}>Ground transport, catering, accommodation or aircraft selection. Tell us what your trip requires.</Text>
                <ScrollView horizontal={false} contentContainerStyle={styles.sugList}>
                  {SUGGESTIONS.map((s, i) => (
                    <Pressable key={s} onPress={() => send(s)} style={styles.sug} testID={`concierge-suggestion-${i}`}>
                      <Text style={styles.sugText}>{s}</Text>
                      <Feather name="arrow-up-right" size={14} color={colors.muted} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            }
            renderItem={({ item }) => (
              <Animated.View entering={FadeInUp.duration(250)} style={[styles.bubbleWrap, item.role === "user" ? styles.right : styles.left]}>
                <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]} testID={`concierge-message-${item.role}`}>
                  {item.content ? (
                    <Text style={[styles.msg, item.role === "user" && styles.userMsg]}>{item.content}</Text>
                  ) : (
                    <ActivityIndicator size="small" color={colors.muted} testID="concierge-typing" />
                  )}
                </View>
              </Animated.View>
            )}
          />
        )}
        {error ? <Text style={styles.error} testID="concierge-error">{error}</Text> : null}
        <View style={[styles.inputBar, { paddingBottom: bottomChrome + 12 }]}>
          <TextInput
            testID="concierge-input"
            value={text}
            onChangeText={setText}
            placeholder="Message your concierge"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable
            testID="concierge-send-button"
            onPress={() => send()}
            disabled={!text.trim() || streaming}
            style={[styles.send, (!text.trim() || streaming) && { opacity: 0.35 }]}
          >
            {streaming ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Feather name="arrow-up" size={18} color={colors.onBrandPrimary} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { backgroundColor: c.surfaceInverse, paddingHorizontal: 24, paddingBottom: 24 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44 },
  mark: { width: 96, height: 26 },
  clear: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, color: c.onSurfaceInverse, marginTop: 12 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.brandSecondary },
  heroSub: { fontFamily: fonts.text, fontSize: 13, color: c.brandSecondary, letterSpacing: 0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontFamily: fonts.text, color: c.muted },
  list: { paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  empty: { flex: 1, paddingHorizontal: 8, paddingTop: 16 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  emptyBody: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary, marginTop: 8, marginBottom: 24 },
  sugList: { gap: 0 },
  sug: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderBottomWidth: 0.5, borderBottomColor: c.border },
  sugText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  bubbleWrap: { flexDirection: "row" },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  aiBubble: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 0 },
  userBubble: { backgroundColor: c.brandPrimary, borderTopRightRadius: 0 },
  msg: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurface },
  userMsg: { color: c.onBrandPrimary },
  error: { fontFamily: fonts.text, fontSize: 13, color: c.error, paddingHorizontal: 24, paddingBottom: 8 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: c.border, backgroundColor: c.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: c.surfaceSecondary, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
