import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";

/**
 * Light/dark theming for the dashboard and storefront, ported from CareNest.
 *
 * Everything is driven by the CSS custom properties already declared in
 * index.css — `:root` for light, `.dark` for dark — which Tailwind reads
 * through its `darkMode: ["class"]` config. next-themes only puts the right
 * class on <html> and remembers the choice.
 *
 * The landing page and the sign-in screen are deliberately outside this: both
 * commit to their own dark design and inject their own stylesheet.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
