/**
 * English source strings. This is the reference dictionary: every key must
 * exist here, and hi.ts mirrors it. A key missing from hi.ts renders the
 * English value, so translating is safe to do incrementally.
 *
 * Keys are grouped by surface: `nav.*` dashboard sidebar, `hdr.*` dashboard
 * header, `auth.*` sign-in, `common.*` shared verbs and labels.
 */
export const en: Record<string, string> = {
  // ---- dashboard navigation ----
  "nav.chat": "Chat",
  "nav.dashboard": "Analytics",
  "nav.kiosk": "Kiosk Mode",
  "nav.orders": "Orders & Payments",
  "nav.crm": "CRM",
  "nav.products": "Products",
  "nav.expenses": "Expenses",
  "nav.suppliers": "Suppliers",
  "nav.storefront": "Storefront",
  "nav.settings": "Settings",
  "nav.support": "Support",

  // ---- dashboard header ----
  "hdr.help": "Need Help?",
  "hdr.logout": "Logout",
  "hdr.theme.toLight": "Switch to light theme",
  "hdr.theme.toDark": "Switch to dark theme",
  "hdr.lang": "Language",

  // ---- sign-in ----
  "auth.back": "Back to site",
  "auth.eyebrow.free": "Free to start",
  "auth.eyebrow.almost": "Almost there",
  "auth.title.open": "Open your shop",
  "auth.title.choose": "Choose your shop",
  "auth.lede.open":
    "One login for your counter, your online store and your books. Sign in with Google to continue.",
  "auth.lede.choose":
    "This Google account manages more than one shop. Pick the one you want to open.",
  "auth.google": "Continue with Google",
  "auth.shopLabel": "Shop to manage",
  "auth.shopPlaceholder": "Choose a shop…",
  "auth.pending": " — pending approval",
  "auth.openDashboard": "Open dashboard",
  "auth.otherAccount": "Use a different Google account",
  "auth.trust.secure": "Secure sign-in",
  "auth.trust.free": "Free to start",
  "auth.newHere": "New to KiosCart?",
  "auth.createShop": "Create your shop",
  "auth.verifying": "Verifying your shopkeeper profile…",

  // ---- shared ----
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.add": "Add",
  "common.close": "Close",
  "common.back": "Back",
  "common.next": "Next",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.saving": "Saving…",
  "common.yes": "Yes",
  "common.no": "No",
  "common.confirm": "Confirm",
  "common.status": "Status",
  "common.actions": "Actions",
  "common.total": "Total",
  "common.name": "Name",
  "common.email": "Email",
  "common.phone": "Phone",
  "common.date": "Date",
  "common.price": "Price",
  "common.quantity": "Quantity",
};
