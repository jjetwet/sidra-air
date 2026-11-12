import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useTheme } from "@/src/theme";

type Pt = { lat: number; lon: number };

type Props = { from?: Pt | null; to?: Pt | null; height?: number; testID?: string };

// Minimal editorial route: dot grid canvas with a sweeping dashed arc between two airports.
export function RouteMap({ from, to, height = 200, testID }: Props) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const pad = 36;
  let a = { x: pad, y: height * 0.7 };
  let b = { x: w - pad, y: height * 0.4 };

  if (from && to && w > 0) {
    const ax = from.lon, ay = -from.lat, bx = to.lon, by = -to.lat;
    const dx = Math.max(Math.abs(bx - ax), 1);
    const dy = Math.max(Math.abs(by - ay), 1);
    const scale = Math.min((w - pad * 2) / dx, (height - pad * 2) / dy);
    const cx = (ax + bx) / 2, cy = (ay + by) / 2;
    a = { x: w / 2 + (ax - cx) * scale, y: height / 2 + (ay - cy) * scale + 12 };
    b = { x: w / 2 + (bx - cx) * scale, y: height / 2 + (by - cy) * scale + 12 };
  }

  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const lift = Math.min(len * 0.32, height * 0.38);
  // perpendicular, always bowing upward
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const c = { x: mx + nx * lift, y: my + ny * lift };
  const path = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  // midpoint on the curve
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };

  const dots: { x: number; y: number }[] = [];
  if (w > 0) {
    for (let y = 14; y < height; y += 18) for (let x = 14; x < w; x += 18) dots.push({ x, y });
  }
  const active = !!(from && to);

  return (
    <View testID={testID} onLayout={onLayout} style={[styles.wrap, { height, backgroundColor: colors.surface }]}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {dots.map((d, i) => (
            <Circle key={i} cx={d.x} cy={d.y} r={0.9} fill={colors.border} />
          ))}
          <Line x1={0} y1={height / 2} x2={w} y2={height / 2} stroke={colors.divider} strokeWidth={1} />
          <Path
            d={path}
            stroke={active ? colors.onSurface : colors.border}
            strokeWidth={1.4}
            strokeDasharray="4 6"
            fill="none"
          />
          <Circle cx={a.x} cy={a.y} r={9} fill={colors.surface} stroke={colors.onSurface} strokeWidth={1} />
          <Circle cx={a.x} cy={a.y} r={3.5} fill={colors.onSurface} />
          <Circle cx={b.x} cy={b.y} r={9} fill={colors.surface} stroke={colors.onSurface} strokeWidth={1} />
          <Circle cx={b.x} cy={b.y} r={3.5} fill={colors.onSurface} />
          {active && <Circle cx={mid.x} cy={mid.y} r={5} fill={colors.brandSecondary} />}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden" },
});
