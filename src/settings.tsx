import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { storeRead, storeWrite } from "./api";

export type Theme =
  | "system"
  | "light"
  | "dark"
  | "sky-blue"
  | "peach-pink"
  | "deep-charcoal"
  | "blueberry";

export type FontFamily = "system" | "inter" | "atkinson" | "quattro";
export type FontSize = "small" | "medium" | "large" | "xl";

export const FREE_THEMES: Theme[] = ["system", "light", "dark"];
export const PREMIUM_THEMES: Theme[] = [
  "sky-blue",
  "peach-pink",
  "deep-charcoal",
  "blueberry",
];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  "sky-blue": "Sky Blue",
  "peach-pink": "Peach Pink",
  "deep-charcoal": "Deep Charcoal",
  blueberry: "Blueberry",
};

export const FONT_FAMILIES: FontFamily[] = [
  "system",
  "inter",
  "atkinson",
  "quattro",
];
export const FONT_LABELS: Record<FontFamily, string> = {
  system: "System",
  inter: "Inter",
  atkinson: "Atkinson Hyperlegible",
  quattro: "iA Writer Quattro",
};
const FONT_STACKS: Record<FontFamily, string> = {
  system: '-apple-system, "Segoe UI", Roboto, sans-serif',
  inter: '"Inter Variable", "Inter", sans-serif',
  atkinson: '"Atkinson Hyperlegible", sans-serif',
  quattro: '"iA Writer Quattro", sans-serif',
};

export const FONT_SIZES: FontSize[] = ["small", "medium", "large", "xl"];
export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "XL",
};
const ZOOM_FACTORS: Record<FontSize, number> = {
  small: 0.9,
  medium: 1.0,
  large: 1.15,
  xl: 1.32,
};

interface StoredSettings {
  theme?: Theme;
  fontFamily?: FontFamily;
  fontSize?: FontSize;
}

interface LicenseState {
  unlocked: boolean;
  key: string | null;
  instanceId: string | null;
}

interface SettingsCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  fontFamily: FontFamily;
  setFontFamily: (f: FontFamily) => void;
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  unlocked: boolean;
  licenseKey: string | null;
  activateLicense: (key: string) => Promise<void>;
  deactivateLicense: () => Promise<void>;
  /** Hidden demo/testing toggle (version-tap rhythm + dev button). */
  togglePremiumOverride: () => Promise<void>;
}

const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [fontFamily, setFontFamilyState] = useState<FontFamily>("system");
  const [fontSize, setFontSizeState] = useState<FontSize>("medium");
  const [license, setLicense] = useState<LicenseState>({
    unlocked: false,
    key: null,
    instanceId: null,
  });
  const loaded = useRef(false);

  // Load saved settings once.
  useEffect(() => {
    storeRead<StoredSettings>("settings")
      .then((data) => {
        if (data?.theme) setThemeState(data.theme);
        if (data?.fontFamily) setFontFamilyState(data.fontFamily);
        if (data?.fontSize) setFontSizeState(data.fontSize);
      })
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  // Load license instantly, then re-validate online in the background.
  useEffect(() => {
    invoke<LicenseState>("license_status")
      .then(setLicense)
      .catch((e) => console.error("license_status failed:", e));
    invoke<LicenseState>("license_validate")
      .then(setLicense)
      .catch((e) => console.error("license_validate failed:", e));
  }, []);

  // Persist whenever any setting changes (after the initial load).
  useEffect(() => {
    if (!loaded.current) return;
    storeWrite("settings", { theme, fontFamily, fontSize }).catch((e) =>
      console.error("failed to persist settings:", e),
    );
  }, [theme, fontFamily, fontSize]);

  // Apply theme. A premium theme only takes effect while premium is unlocked.
  useEffect(() => {
    const isPremium = PREMIUM_THEMES.includes(theme);
    const effective = isPremium && !license.unlocked ? "system" : theme;
    document.documentElement.setAttribute("data-theme", effective);
  }, [theme, license.unlocked]);

  // Apply UI font.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-font",
      FONT_STACKS[fontFamily],
    );
  }, [fontFamily]);

  // Apply text size via the webview zoom.
  useEffect(() => {
    getCurrentWebview()
      .setZoom(ZOOM_FACTORS[fontSize])
      .catch((e) => console.error("setZoom failed:", e));
  }, [fontSize]);

  const activateLicense = useCallback(async (key: string) => {
    setLicense(await invoke<LicenseState>("license_activate", { key }));
  }, []);

  const deactivateLicense = useCallback(async () => {
    setLicense(await invoke<LicenseState>("license_deactivate"));
  }, []);

  const togglePremiumOverride = useCallback(async () => {
    setLicense(await invoke<LicenseState>("license_toggle_override"));
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        fontFamily,
        setFontFamily: setFontFamilyState,
        fontSize,
        setFontSize: setFontSizeState,
        unlocked: license.unlocked,
        licenseKey: license.key,
        activateLicense,
        deactivateLicense,
        togglePremiumOverride,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
