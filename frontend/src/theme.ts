// Design tokens for SIDRA. Light editorial theme from /app/design_guidelines.json,
// accent shifted to silver to match the SIDRA mark.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F7F7F7",
  onSurfaceSecondary: "#333333",
  surfaceTertiary: "#EEEEEE",
  onSurfaceTertiary: "#111111",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  muted: "#888888",

  brand: "#111111",
  onBrand: "#FFFFFF",
  brandPrimary: "#111111",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#9A9DA3", // silver accent
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#F3F4F5",
  onBrandTertiary: "#5E6166",

  success: "#2E4D3A",
  onSuccess: "#FFFFFF",
  warning: "#8A6D3B",
  onWarning: "#FFFFFF",
  error: "#6B2A2A",
  onError: "#FFFFFF",
  info: "#2B4353",
  onInfo: "#FFFFFF",

  border: "#E5E5E5",
  borderStrong: "#111111",
  divider: "#F0F0F0",

  // Flight map
  mapSea: "#FFFFFF",
  mapLand: "#E3E5E8", // pale silver
  mapLandStroke: "#CDD0D4",
  mapGrid: "#F2F3F4",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const fonts = {
  display: "Playfair",
  text: "DMSans",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 0, md: 4, lg: 8, pill: 999 };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
