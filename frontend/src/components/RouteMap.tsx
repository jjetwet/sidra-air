import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import LAND from "@/src/land.json";
import { useTheme } from "@/src/theme";

type Pt = { lat: number; lon: number };
type Props = { from?: Pt | null; to?: Pt | null; height?: number; testID?: string };

const RAD = Math.PI / 180;
// Natural Earth land, simplified: each ring is [lon*10, lat*10, ...]
const RINGS = (LAND as number[][]).map((r) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    const x = r[i] / 10, y = r[i + 1] / 10;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { r, minX, maxX, minY, maxY };
});

// Great-circle path (true shortest route), longitudes unwrapped so it never jumps across the map.
function greatCircle(a: Pt, b: Pt, n = 64): { lon: number; lat: number }[] {
  const toV = (p: Pt) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
  const va = toV(a), vb = toV(b);
  const d = Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
  const out: { lon: number; lat: number }[] = [];
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = Math.sin(d) || 1;
    const k1 = d ? Math.sin((1 - t) * d) / s : 1 - t;
    const k2 = d ? Math.sin(t * d) / s : t;
    const x = k1 * va[0] + k2 * vb[0], y = k1 * va[1] + k2 * vb[1], z = k1 * va[2] + k2 * vb[2];
    let lon = Math.atan2(y, x) / RAD;
    const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    prev = lon;
    out.push({ lon, lat });
  }
  return out;
}

export function RouteMap({ from, to, height = 200, testID }: Props) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const geo = useMemo(() => {
    if (!w) return null;
    const route = from && to ? greatCircle(from, to) : null;
    let minLon = -15, maxLon = 70, minLat = 10, maxLat = 60;
    if (route) {
      minLon = Math.min(...route.map((p) => p.lon));
      maxLon = Math.max(...route.map((p) => p.lon));
      minLat = Math.min(...route.map((p) => p.lat));
      maxLat = Math.max(...route.map((p) => p.lat));
    }
    const midLat = (minLat + maxLat) / 2;
    const kx = Math.max(Math.cos(midLat * RAD), 0.35); // equirectangular, true scale at mid-latitude
    let spanX = (maxLon - minLon) * kx;
    let spanY = maxLat - minLat;
    const minSpan = 6;
    if (spanX < minSpan) {
      const g = (minSpan - spanX) / 2 / kx;
      minLon -= g;
      maxLon += g;
      spanX = minSpan;
    }
    if (spanY < minSpan) {
      const g = (minSpan - spanY) / 2;
      minLat -= g;
      maxLat += g;
      spanY = minSpan;
    }
    const pad = 0.18;
    const scale = Math.min((w * (1 - pad * 2)) / spanX, (height * (1 - pad * 2)) / spanY);
    const cLon = (minLon + maxLon) / 2, cLat = (minLat + maxLat) / 2;
    const px = (lon: number) => w / 2 + (lon - cLon) * kx * scale;
    const py = (lat: number) => height / 2 - (lat - cLat) * scale;

    const vLonMin = cLon - w / 2 / (kx * scale), vLonMax = cLon + w / 2 / (kx * scale);
    const vLatMin = cLat - height / 2 / scale, vLatMax = cLat + height / 2 / scale;

    let land = "";
    for (const off of [-360, 0, 360]) {
      for (const ring of RINGS) {
        if (ring.maxX + off < vLonMin || ring.minX + off > vLonMax || ring.maxY < vLatMin || ring.minY > vLatMax) continue;
        const r = ring.r;
        land += `M${px(r[0] / 10 + off).toFixed(1)} ${py(r[1] / 10).toFixed(1)}`;
        for (let i = 2; i < r.length; i += 2) land += `L${px(r[i] / 10 + off).toFixed(1)} ${py(r[i + 1] / 10).toFixed(1)}`;
        land += "Z";
      }
    }

    let grid = "";
    for (let lon = Math.ceil(vLonMin / 10) * 10; lon <= vLonMax; lon += 10) grid += `M${px(lon).toFixed(1)} 0L${px(lon).toFixed(1)} ${height}`;
    for (let lat = Math.ceil(vLatMin / 10) * 10; lat <= vLatMax; lat += 10) grid += `M0 ${py(lat).toFixed(1)}L${w} ${py(lat).toFixed(1)}`;

    let path = "";
    let a: { x: number; y: number } | null = null;
    let b: { x: number; y: number } | null = null;
    let mid: { x: number; y: number } | null = null;
    if (route) {
      path = route.map((p, i) => `${i ? "L" : "M"}${px(p.lon).toFixed(1)} ${py(p.lat).toFixed(1)}`).join("");
      a = { x: px(route[0].lon), y: py(route[0].lat) };
      b = { x: px(route[route.length - 1].lon), y: py(route[route.length - 1].lat) };
      const m = route[Math.floor(route.length / 2)];
      mid = { x: px(m.lon), y: py(m.lat) };
    }
    return { land, grid, path, a, b, mid };
  }, [w, height, from, to]);

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.wrap, { height, backgroundColor: colors.mapSea }]}>
      {geo && (
        <Svg width={w} height={height}>
          {geo.grid ? <Path d={geo.grid} stroke={colors.mapGrid} strokeWidth={0.6} fill="none" /> : null}
          {geo.land ? <Path d={geo.land} fill={colors.mapLand} stroke={colors.mapLandStroke} strokeWidth={0.6} /> : null}
          {geo.path ? <Path d={geo.path} stroke={colors.onSurface} strokeWidth={1.6} strokeDasharray="5 5" fill="none" /> : null}
          {geo.a && geo.b && (
            <>
              <Circle cx={geo.a.x} cy={geo.a.y} r={8} fill={colors.surface} stroke={colors.onSurface} strokeWidth={1} />
              <Circle cx={geo.a.x} cy={geo.a.y} r={3.2} fill={colors.onSurface} />
              <Circle cx={geo.b.x} cy={geo.b.y} r={8} fill={colors.surface} stroke={colors.onSurface} strokeWidth={1} />
              <Circle cx={geo.b.x} cy={geo.b.y} r={3.2} fill={colors.onSurface} />
            </>
          )}
          {geo.mid && <Circle cx={geo.mid.x} cy={geo.mid.y} r={4.5} fill={colors.brandSecondary} stroke={colors.surface} strokeWidth={1.5} />}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});
