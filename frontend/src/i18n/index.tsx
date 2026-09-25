import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en";
import { hi } from "./hi";
import { gu } from "./gu";
import { setCurrentLang } from "./t";

/**
 * English/Hindi/Gujarati for the React side of the app — the login screen and
 * the shopkeeper dashboard.
 *
 * The landing page has its own DOM-based switcher (data-i18n attributes, see
 * pages/landing/landing.script.ts) because it is mounted as raw markup and
 * cannot use hooks. The two share one localStorage key, so a visitor who picks
 * हिन्दी on the homepage stays in Hindi through sign-in and into the dashboard.
 *
 * Adding a string: add it to en.ts, then to hi.ts and gu.ts. A key with no
 * translated value falls back to the English one rather than rendering the raw
 * key, so a partially translated screen degrades to English instead of to
 * gibberish.
 */

export type Lang = "en" | "hi" | "gu";

export const LANG_KEY = "kioscart:lang";

export const LANG_LABELS: Record<Lang, { name: string; short: string }> = {
  en: { name: "English", short: "EN" },
  hi: { name: "हिन्दी", short: "HI" },
  gu: { name: "ગુજરાતી", short: "GU" },
};

// Neither Devanagari nor Gujarati is in the Latin stacks the dashboard loads,
// so pull a face only when someone actually switches to that script — English
// users never pay for either.
const SCRIPT_FONTS: Partial<Record<Lang, string>> = {
  hi: "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap",
  gu: "https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;500;600;700&display=swap",
};

const DICTS: Record<Lang, Record<string, string>> = { en, hi, gu };

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "hi" || v === "gu";
}

function readStored(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (isLang(v)) return v;
  } catch {
    // private mode / storage disabled — fall through to English
  }
  return "en";
}

function ensureScriptFont(l: Lang) {
  const href = SCRIPT_FONTS[l];
  if (!href) return;
  const id = `kc-${l}-font`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key. Unknown keys fall back to English, then to the key. */
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);

  // Keep the hook-free translator in step. Set during render, not in an
  // effect, so the very first paint already uses the right dictionary.
  setCurrentLang(lang);

  useEffect(() => {
    ensureScriptFont(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    ensureScriptFont(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // non-fatal: the choice just won't survive a reload
    }
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[lang] || en;
      let out = dict[key] ?? en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return out;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  // `key` remounts the subtree on a language change, which is what makes the
  // hook-free `t()` in i18n/t.ts re-read the dictionary everywhere at once.
  return (
    <I18nContext.Provider value={value}>
      <div key={lang} className="contents">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Rendered outside the provider (a stray preview, a test) — English only,
    // rather than crashing the tree.
    return { lang: "en", setLang: () => {}, t: (k) => en[k] ?? k };
  }
  return ctx;
}

/** Shorthand for the common case. */
export function useT() {
  return useI18n().t;
}
