import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDate, formatDuration, PopularRoute, usd } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AirportPicker } from "@/src/components/AirportPicker";
import { DateStrip, DAYS, isoDate } from "@/src/components/DateStrip";
import { RouteMap } from "@/src/components/RouteMap";
import { JET_IMAGES, MARK_ON_LIGHT, MARK_SILVER } from "@/src/jets";
import { usesNativeTabs } from "@/src/navigation";
import { useAirports } from "@/src/queries";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const BENEFITS = [
  "A curated fleet of Bombardier, Gulfstream and Boeing aircraft",
  "Transparent pricing across 145 business aviation airports",
  "Dedicated concierge for ground transport, catering and accommodation",
  "Secure card and Apple Pay settlement once your charter is confirmed",
];

export default function BookScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuth();
  const { data: airports } = useAirports();
  const routes = useQuery({ queryKey: ["popular-routes"], queryFn: () => api<PopularRoute[]>("/routes/popular"), staleTime: Infinity });

  const [trip, setTrip] = useState<"one_way" | "return">("one_way");
  const [pax, setPax] = useState(2);
  const [fromCode, setFromCode] = useState<string | null>(null);
  const [toCode, setToCode] = useState<string | null>(null);
  const [depart, setDepart] = useState<string | null>(null);
  const [ret, setRet] = useState(isoDate(DAYS[7]));
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const byCode = useMemo(() => Object.fromEntries((airports ?? []).map((a) => [a.code, a])), [airports]);
  const from = fromCode ? byCode[fromCode] : undefined;
  const to = toCode ? byCode[toCode] : undefined;
  const cardW = width - 48;
  const initials = user ? (user.name || user.email).split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "";

  const search = () => {
    if (!fromCode || !toCode) return setHint("Choose where you're flying from and to.");
    setHint(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/charter",
      params: { from: fromCode, to: toCode, pax: String(pax), trip, depart: depart ?? isoDate(DAYS[6]), ...(trip === "return" ? { ret } : {}) },
    });
  };

  const onSlide = (e: NativeSyntheticEvent<NativeScrollEvent>) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (cardW + 12)));

  const slides = [
    { key: "fleet", dark: false, title: "ANY JET FOR\nANY JOURNEY", body: "From the Challenger 3500 to the Boeing Business Jet, every aircraft is available on demand with clear, upfront pricing.", cta: "Explore", img: JET_IMAGES["global-7500"], go: () => router.navigate("/fleet") },
    { key: "concierge", dark: true, title: "YOUR CONCIERGE,\nAT ANY HOUR", body: "Ground transport, catering, accommodation and travel logistics, handled for you and your delegation.", cta: "Chat now", img: null, go: () => router.navigate("/concierge") },
    { key: "bbj", dark: false, title: "NOW AVAILABLE:\nTHE BBJ", body: "A private boardroom in the sky, with a conference suite, private stateroom and seating for 19.", cta: "View aircraft", img: JET_IMAGES.bbj, go: () => router.push("/jet/bbj") },
  ];

  return (
    <View style={styles.root} testID="book-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brand}>
          <Image source={MARK_ON_LIGHT} style={styles.mark} contentFit="contain" />
          <Text style={styles.word}>SIDRA</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.round} onPress={() => router.navigate("/concierge")} testID="book-concierge-button">
            <Feather name="message-circle" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable style={styles.round} onPress={() => router.push("/profile")} testID="open-profile-button">
            {user?.picture ? <Image source={{ uri: user.picture }} style={styles.avatar} /> : <Text style={styles.initials}>{initials}</Text>}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + 32 }} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.searchBlock}>
          <View style={styles.pills}>
            <Pressable style={styles.pill} onPress={() => setTrip((t) => (t === "one_way" ? "return" : "one_way"))} testID="book-trip-type-toggle">
              <Feather name={trip === "one_way" ? "arrow-right" : "repeat"} size={18} color={colors.onSurface} />
              <Text style={styles.pillText}>{trip === "one_way" ? "One-way" : "Return"}</Text>
            </Pressable>
            <View style={[styles.pill, styles.paxPill]}>
              <Pressable onPress={() => setPax((p) => Math.max(1, p - 1))} hitSlop={10} testID="book-pax-minus" style={styles.paxBtn}>
                <Feather name="minus" size={18} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.pillText} numberOfLines={1} testID="book-pax-value">{pax} {pax === 1 ? "Passenger" : "Passengers"}</Text>
              <Pressable onPress={() => setPax((p) => Math.min(19, p + 1))} hitSlop={10} testID="book-pax-plus" style={styles.paxBtn}>
                <Feather name="plus" size={18} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>

          <View style={styles.routeCard}>
            <Pressable style={styles.routeRow} onPress={() => setPicker("from")} testID="book-from-button">
              <Text style={styles.routeLabel}>From</Text>
              <Text style={[styles.routeValue, !from && styles.placeholder]} numberOfLines={1} testID="book-from-value">
                {from ? from.city : "Select departure"}
                {from ? <Text style={styles.routeCode}>  ({from.code})</Text> : null}
              </Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.routeRow} onPress={() => setPicker("to")} testID="book-to-button">
              <Text style={styles.routeLabel}>To</Text>
              <Text style={[styles.routeValue, !to && styles.placeholder]} numberOfLines={1} testID="book-to-value">
                {to ? to.city : "Select destination"}
                {to ? <Text style={styles.routeCode}>  ({to.code})</Text> : null}
              </Text>
            </Pressable>
            <Pressable
              style={styles.swap}
              testID="book-swap-button"
              hitSlop={6}
              onPress={() => {
                Haptics.selectionAsync();
                setFromCode(toCode);
                setToCode(fromCode);
              }}
            >
              <Feather name="repeat" size={16} color={colors.onSurface} style={{ transform: [{ rotate: "90deg" }] }} />
            </Pressable>
          </View>

          <Pressable style={styles.dateBtn} onPress={() => setDateOpen(true)} testID="book-date-button">
            <Feather name="calendar" size={16} color={depart ? colors.onSurface : colors.muted} />
            <Text style={[styles.dateText, !depart && styles.placeholder]} testID="book-date-value">
              {depart ? `${formatDate(depart)}${trip === "return" ? ` – ${formatDate(ret)}` : ""}` : "Date"}
            </Text>
          </Pressable>

          {hint ? <Text style={styles.hint} testID="book-hint">{hint}</Text> : null}
          <Pressable style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.85 }]} onPress={search} testID="book-search-button">
            <Text style={styles.searchText}>Search</Text>
          </Pressable>
        </Animated.View>

        {/* Hero carousel */}
        <ScrollView
          horizontal
          pagingEnabled={false}
          snapToInterval={cardW + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          onMomentumScrollEnd={onSlide}
          onScrollEndDrag={onSlide}
        >
          {slides.map((s) => (
            <View key={s.key} style={[styles.hero, { width: cardW }, s.dark && styles.heroDark]} testID={`book-hero-${s.key}`}>
              {s.dark ? <Image source={MARK_SILVER} style={styles.heroMark} contentFit="contain" /> : null}
              <Text style={[styles.heroTitle, s.dark && styles.onDark]}>{s.title}</Text>
              <Text style={[styles.heroBody, s.dark && styles.onDarkMuted]}>{s.body}</Text>
              {s.img ? <Image source={s.img} style={styles.heroImg} contentFit="contain" /> : <View style={{ flex: 1 }} />}
              <Pressable style={[styles.heroBtn, s.dark && styles.heroBtnDark]} onPress={s.go} testID={`book-hero-${s.key}-button`}>
                <Text style={[styles.heroBtnText, s.dark && { color: colors.onSurface }]}>{s.cta}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === slide && styles.dotOn]} />
          ))}
        </View>

        {/* Why SIDRA */}
        <View style={styles.member} testID="book-why-sidra">
          <View style={styles.badge}><Text style={styles.badgeText}>BY REFERRAL ONLY</Text></View>
          <Text style={styles.memberTitle}>Discreet. Reliable. Efficient.</Text>
          <Text style={styles.memberBody}>On demand charter for executives and their teams, with no membership fees or minimum commitment.</Text>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.benefitDot} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
          <View style={styles.memberActions}>
            <Pressable style={styles.outlineBtn} onPress={() => router.navigate("/fleet")} testID="book-explore-fleet-button">
              <Text style={styles.outlineText}>Explore fleet</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => router.navigate("/concierge")} testID="book-ask-concierge-link">
              <Text style={styles.linkText}>Ask concierge</Text>
              <Feather name="arrow-right" size={16} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>

        {/* Popular routes */}
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routesRow}>
          {(routes.data ?? []).map((r) => (
            <Pressable
              key={`${r.from_code}-${r.to_code}`}
              style={styles.routeTile}
              testID={`popular-route-${r.from_code}-${r.to_code}`}
              onPress={() =>
                router.push({ pathname: "/charter", params: { from: r.from_code, to: r.to_code, jet: r.jet_id, pax: String(pax), trip: "one_way", depart: depart ?? isoDate(DAYS[6]) } })
              }
            >
              <RouteMap from={byCode[r.from_code]} to={byCode[r.to_code]} height={130} />
              <View style={styles.tileBody}>
                <Text style={styles.tileRoute} numberOfLines={1}>{r.from_city} → {r.to_city}</Text>
                <View style={styles.tileRow}>
                  <Text style={styles.tileMeta}>{formatDuration(r.flight_minutes)} · {r.jet_name}</Text>
                </View>
                <Text style={styles.tilePrice}>from {usd(r.estimated_price_usd)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>

      <AirportPicker
        visible={picker !== null}
        title={picker === "from" ? "Departing from" : "Flying to"}
        airports={airports ?? []}
        exclude={(picker === "from" ? toCode : fromCode) ?? undefined}
        onClose={() => setPicker(null)}
        onSelect={(a) => {
          if (picker === "from") setFromCode(a.code);
          else setToCode(a.code);
          setPicker(null);
          setHint(null);
        }}
      />

      <Modal visible={dateOpen} transparent animationType="fade" onRequestClose={() => setDateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDateOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]} testID="book-date-sheet">
            <Text style={styles.sheetTitle}>Departure</Text>
            <DateStrip value={depart ?? isoDate(DAYS[6])} onChange={setDepart} prefix="book-depart" />
            {trip === "return" && (
              <>
                <Text style={[styles.sheetTitle, { marginTop: 24 }]}>Return</Text>
                <DateStrip value={ret} onChange={setRet} prefix="book-return" />
              </>
            )}
            <Pressable
              style={[styles.searchBtn, { marginTop: 24 }]}
              testID="book-date-done-button"
              onPress={() => {
                if (!depart) setDepart(isoDate(DAYS[6]));
                setDateOpen(false);
              }}
            >
              <Text style={styles.searchText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingBottom: 12, backgroundColor: c.surfaceSecondary },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 64, height: 17 },
  word: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 6, color: c.onSurface },
  headerRight: { flexDirection: "row", gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatar: { width: 44, height: 44 },
  initials: { fontFamily: fonts.text, fontSize: 13, color: c.onSurface },
  searchBlock: { paddingHorizontal: 24, paddingTop: 16 },
  pills: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, height: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: c.surface },
  paxPill: { flex: 1, justifyContent: "space-between", paddingHorizontal: 4, gap: 2 },
  paxBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  pillText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  routeCard: { marginTop: 12, borderRadius: 16, backgroundColor: c.surface },
  routeRow: { paddingLeft: 18, paddingRight: 72, paddingVertical: 14, minHeight: 72, justifyContent: "center" },
  routeLabel: { fontFamily: fonts.text, fontSize: 13, color: c.onSurfaceSecondary },
  routeValue: { fontFamily: fonts.text, fontSize: 18, color: c.onSurface, marginTop: 4 },
  routeCode: { color: c.muted, fontSize: 15 },
  placeholder: { color: c.muted },
  divider: { height: 1, backgroundColor: c.border, marginRight: 72 },
  swap: { position: "absolute", right: 16, top: 52, width: 44, height: 44, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  dateBtn: { marginTop: 12, height: 56, borderRadius: 16, backgroundColor: c.surface, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  dateText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  hint: { fontFamily: fonts.text, fontSize: 13, color: c.error, marginTop: 12, textAlign: "center" },
  searchBtn: { marginTop: 12, height: 56, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  searchText: { fontFamily: fonts.text, fontSize: 17, color: c.onBrandPrimary, letterSpacing: 0.5, fontWeight: "600" },
  carousel: { paddingHorizontal: 24, gap: 12, paddingTop: 32 },
  hero: { height: 400, borderRadius: 24, backgroundColor: c.surface, padding: 24, alignItems: "center", overflow: "hidden" },
  heroDark: { backgroundColor: c.surfaceInverse },
  heroMark: { width: 120, height: 32, marginBottom: 16, marginTop: 8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: c.onSurface, textAlign: "center", marginTop: 8 },
  heroBody: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary, textAlign: "center", marginTop: 12 },
  onDark: { color: c.onSurfaceInverse },
  onDarkMuted: { color: c.brandSecondary },
  heroImg: { flex: 1, width: "112%" },
  heroBtn: { height: 48, paddingHorizontal: 32, borderRadius: 24, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  heroBtnDark: { backgroundColor: c.surface },
  heroBtnText: { fontFamily: fonts.text, fontSize: 15, color: c.onBrandPrimary },
  dots: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
  dotOn: { backgroundColor: c.onSurface, width: 20 },
  member: { marginHorizontal: 24, marginTop: 32, borderRadius: 24, backgroundColor: c.surface, padding: 24 },
  badge: { alignSelf: "flex-start", backgroundColor: c.brandTertiary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 2, color: c.onBrandTertiary },
  memberTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: c.onSurface, marginTop: 16 },
  memberBody: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary, marginTop: 8, marginBottom: 12 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  benefitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.brandSecondary },
  benefitText: { flex: 1, fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  memberActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 },
  outlineBtn: { height: 48, paddingHorizontal: 24, borderRadius: 24, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  outlineText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  linkText: { fontFamily: fonts.text, fontSize: 15, color: c.onSurface },
  sectionTitle: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface, paddingHorizontal: 24, marginTop: 32, marginBottom: 12 },
  routesRow: { paddingHorizontal: 24, gap: 12 },
  routeTile: { flexShrink: 0, width: 260, borderRadius: 20, backgroundColor: c.surface, overflow: "hidden" },
  tileBody: { padding: 16 },
  tileRoute: { fontFamily: fonts.text, fontSize: 17, color: c.onSurface, fontWeight: "600" },
  tileRow: { flexDirection: "row", marginTop: 4 },
  tileMeta: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  tilePrice: { fontFamily: fonts.text, fontSize: 16, color: c.onSurface, marginTop: 8, fontVariant: ["tabular-nums"] },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, marginBottom: 8 },
}));
