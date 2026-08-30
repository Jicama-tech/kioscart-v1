import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaGoogle, FaInstagram } from "react-icons/fa";
import { jwtDecode } from "jwt-decode";
import { ArrowLeft, Loader2, ShieldCheck, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/i18n";
import { LanguageToggle } from "@/components/language-toggle";

// The landing page's own stylesheet, not a copy of it — palette, type, .card,
// .btn, .logo, .eyebrow and .lede all come from there, so this screen and the
// homepage cannot drift. auth-extras adds only what a sign-in form needs.
import landingCss from "@/pages/landing/landing.css?raw";
import authExtrasCss from "./auth-extras.css?raw";

// The same two faces the landing page loads — this route is reached straight
// from "Start free", so it should not flash a fallback face first.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

type AccountChoice = {
  accountId: string;
  accountType: "shopkeeper" | "operator";
  shopName: string;
  approved: boolean;
};

type SelectionTokenPayload = {
  typ: "shopkeeper-select";
  email: string;
  name?: string;
  accounts: AccountChoice[];
  exp?: number;
};

export function EShopLogin() {
  const t = useT();
  const { toast } = useToast();
  const navigate = useNavigate();
  const apiURL = __API_URL__;
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState({
    google: false,
    instagram: false,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [searchParams] = useSearchParams();

  // Multi-account selection state (post-Google sign-in path).
  const [selToken, setSelToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountChoice[]>([]);
  const [selectedAccountKey, setSelectedAccountKey] = useState<string>("");
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);

  // The landing sheet paints a full-bleed dark page, so it is injected for
  // this route only and torn down on the way out.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-kc-auth", "");
    style.textContent = landingCss + "\n" + authExtrasCss;
    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href = FONTS_HREF;
    document.head.append(fonts, style);
    return () => {
      style.remove();
      fonts.remove();
    };
  }, []);

  useEffect(() => {
    const token = searchParams.get("token");
    const direct = searchParams.get("direct");
    const errorCode = searchParams.get("error");
    const selTokenParam = searchParams.get("selToken");

    if (errorCode === "auth_failed") {
      toast({
        duration: 6000,
        title: "Sign-in failed",
        description: "Couldn't sign you in with Google. Please try again.",
        variant: "destructive",
      });
      setIsChecking(false);
      return;
    }
    if (errorCode === "pending_approval") {
      toast({
        duration: 8000,
        title: "Approval pending",
        description:
          "Your shop account is awaiting admin approval. You'll be able to sign in once it's approved.",
        variant: "destructive",
      });
      setIsChecking(false);
      return;
    }

    // Backend already minted the shopkeeper JWT — log in directly.
    if (token && direct === "1") {
      sessionStorage.setItem("token", token);
      login(token);
      toast({
        duration: 3000,
        title: "Welcome back!",
        description: "Signed in via Google.",
      });
      navigate("/estore-dashboard", { replace: true });
      return;
    }

    // Multi-account path — backend redirected here with a short-lived
    // selection token. Decode locally to render the dropdown.
    if (selTokenParam) {
      try {
        const decoded = jwtDecode<SelectionTokenPayload>(selTokenParam);
        if (
          decoded?.typ !== "shopkeeper-select" ||
          !Array.isArray(decoded.accounts)
        ) {
          throw new Error("malformed selection token");
        }
        setSelToken(selTokenParam);
        setAccounts(decoded.accounts);
      } catch {
        toast({
          duration: 6000,
          title: "Selection link invalid",
          description: "Please sign in with Google again.",
          variant: "destructive",
        });
      }
      setIsChecking(false);
      return;
    }

    // No token, no error → show the normal login screen.
    setIsChecking(false);
  }, [searchParams, navigate, toast, login]);

  const accountKey = (a: AccountChoice) => `${a.accountType}:${a.accountId}`;

  const handleConfirmSelection = async () => {
    if (!selToken || !selectedAccountKey) return;
    const chosen = accounts.find((a) => accountKey(a) === selectedAccountKey);
    if (!chosen || !chosen.approved) return;

    setIsSubmittingSelection(true);
    try {
      const response = await fetch(
        `${apiURL}/auth/select-shopkeeper-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selToken,
            accountId: chosen.accountId,
            accountType: chosen.accountType,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Could not complete sign-in");
      }
      sessionStorage.setItem("token", result.token);
      login(result.token);
      toast({
        duration: 3000,
        title: "Welcome back!",
        description: `Signed in to ${chosen.shopName}`,
      });
      navigate("/estore-dashboard", { replace: true });
    } catch (err: any) {
      toast({
        duration: 6000,
        title: "Sign-in failed",
        description: err?.message || "Please try signing in again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingSelection(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading({ ...isLoading, google: true });
    try {
      // ✅ USE SHOPKEEPER-SPECIFIC GOOGLE FLOW
      // Pass the current origin so the backend can redirect the token back to
      // THIS domain (e.g. a custom domain like thefoxsg.com) instead of the
      // fixed FRONTEND_URL — otherwise custom-domain logins land token-less.
      const origin = encodeURIComponent(window.location.origin);
      window.location.href = `${apiURL}/auth/google-shopkeeper?origin=${origin}`;
    } catch (error) {
      toast({
        duration: 5000,
        title: "Login Error",
        description: "Failed to connect with Google",
        variant: "destructive",
      });
      setIsLoading({ ...isLoading, google: false });
    }
  };

  const handleInstagramLogin = async () => {
    setIsLoading({ ...isLoading, instagram: true });
    try {
      window.location.href = `${apiURL}/auth/instagram`;
    } catch (error) {
      toast({
        duration: 5000,
        title: "Login Error",
        description: "Failed to connect with Instagram",
        variant: "destructive",
      });
      setIsLoading({ ...isLoading, instagram: false });
    }
  };

  const wordmark = (
    <div className="logo">
      <b>Kios</b>
      <span>Cart</span>
    </div>
  );

  // Reading the redirect back from Google.
  if (isChecking) {
    return (
      <div className="auth-checking">
        <div>
          {wordmark}
          <Loader2 className="auth-spin" style={{ margin: "0 auto 12px" }} />
          <p>{t("auth.verifying")}</p>
        </div>
      </div>
    );
  }

  const choosing = accounts.length > 0;

  return (
    <div className="auth-shell">
      <div className="auth-lang">
        <LanguageToggle />
      </div>

      <Link to="/" className="btn btn-ghost btn-sm auth-back">
        <ArrowLeft aria-hidden="true" /> {t("auth.back")}
      </Link>

      <div className="card auth-card">
        {wordmark}

        <p className="eyebrow">{choosing ? t("auth.eyebrow.almost") : t("auth.eyebrow.free")}</p>
        <h1 className="auth-title">
          {choosing ? t("auth.title.choose") : t("auth.title.open")}
        </h1>
        <p className="lede">
          {choosing ? t("auth.lede.choose") : t("auth.lede.open")}
        </p>

        {choosing ? (
          <div className="auth-stack">
            <div>
              <label className="auth-label" htmlFor="kc-account">
                {t("auth.shopLabel")}
              </label>
              <select
                id="kc-account"
                className="auth-select"
                value={selectedAccountKey}
                onChange={(e) => setSelectedAccountKey(e.target.value)}
              >
                <option value="">{t("auth.shopPlaceholder")}</option>
                {accounts.map((a) => {
                  const key = accountKey(a);
                  return (
                    <option key={key} value={key} disabled={!a.approved}>
                      {a.shopName}
                      {a.approved ? "" : t("auth.pending")}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              onClick={handleConfirmSelection}
              disabled={!selectedAccountKey || isSubmittingSelection}
              className="btn btn-primary"
            >
              {isSubmittingSelection && <Loader2 className="auth-spin" />}
              {t("auth.openDashboard")}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSelToken(null);
                setAccounts([]);
                setSelectedAccountKey("");
              }}
            >
              {t("auth.otherAccount")}
            </button>
          </div>
        ) : (
          <div className="auth-stack">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading.google}
              className="btn btn-primary auth-gbtn"
            >
              {isLoading.google ? (
                <Loader2 className="auth-spin" />
              ) : (
                <FaGoogle aria-hidden="true" />
              )}
              {t("auth.google")}
            </button>

            {/* <button
              onClick={handleInstagramLogin}
              disabled={isLoading.instagram}
              className="btn btn-ghost auth-gbtn"
            >
              {isLoading.instagram ? (
                <Loader2 className="auth-spin" />
              ) : (
                <FaInstagram aria-hidden="true" />
              )}
              Continue with Instagram
            </button> */}
          </div>
        )}

        <div className="auth-trust">
          <span>
            <ShieldCheck aria-hidden="true" /> {t("auth.trust.secure")}
          </span>
          <span>
            <Star aria-hidden="true" /> {t("auth.trust.free")}
          </span>
        </div>

        {/* "Start free" on the landing page lands here, so a merchant without
            a shop yet needs the way on rather than a dead end. */}
        <p className="auth-foot">
          {t("auth.newHere")}{" "}
          <Link to="/register">{t("auth.createShop")}</Link>
        </p>
      </div>
    </div>
  );
}
