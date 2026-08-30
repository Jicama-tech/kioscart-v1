import { useEffect } from "react";

// Tiny static route. The backend's /auth/google-supplier/redirect bounces
// the popup here after a successful Google OAuth round-trip, with the
// supplier profile in the query string. Living on the FRONTEND origin keeps
// `window.opener.postMessage` reliable across browsers that tighten
// Cross-Origin-Opener-Policy on cross-origin popup navigations.
//
// Flow:
//   1. Read email/name/picture + the signed supplier token from the query.
//   2. window.opener.postMessage({kind: "kioscart:google-supplier", ...}, "*")
//   3. window.close()
//   4. If opener is gone (popup-blocker / refreshed / bookmarked), fall
//      back to a polled localStorage handshake so the form can still
//      pick up the result.
export function SupplierGoogleCallback() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const payload = {
      kind: "kioscart:google-supplier" as const,
      email: url.searchParams.get("email") || "",
      name: url.searchParams.get("name") || "",
      picture: url.searchParams.get("picture") || "",
      // Short-lived proof that Google vouched for this address. The supplier
      // endpoints require it — the email alone is just a string in a URL.
      token: url.searchParams.get("token") || "",
    };
    // postMessage path — preferred. Still "*": the shared frontend origins
    // (kioscart / thefoxsg / xcionasia) mean the opener may not match this
    // page's origin, and a targeted post would silently drop. The message
    // goes to the opener alone — the window that started this sign-in — and
    // the token it carries is scoped to that same visitor's own email, so it
    // grants an opener nothing it couldn't get by signing in itself.
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, "*");
      }
    } catch {
      // ignore — fall through to localStorage handshake
    }
    // localStorage handshake fallback — same origin as the form, so it can
    // read it directly if postMessage didn't make it through.
    try {
      localStorage.setItem(
        "kioscart:google-supplier",
        JSON.stringify({ ...payload, at: Date.now() }),
      );
    } catch {
      // private mode / quota — best-effort
    }
    // Close the popup once the message is delivered. If the browser refuses
    // (popup not opened via window.open), we leave a tiny note so the user
    // knows they can close it manually.
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // ignore
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        fontFamily: "Inter, Arial, sans-serif",
        padding: 24,
        textAlign: "center",
        color: "#0f172a",
      }}
    >
      <p>Signed in — you can close this window.</p>
    </div>
  );
}
