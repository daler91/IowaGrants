import type { GenderFocus, GrantType, BusinessStage } from "@prisma/client";

// ---------------------------------------------------------------------------
// Article-based grant page configuration
// ---------------------------------------------------------------------------

export interface ArticleGrantPage {
  url: string;
  /** Unique source name stored in DB */
  sourceName: string;
  /** Domain to exclude from external link extraction (e.g., "nerdwallet.com") */
  siteDomain: string;
  gender: GenderFocus;
  grantType: GrantType;
  businessStage: BusinessStage;
}

/**
 * All blog/article pages that list grants in a structured H2/H3 format.
 * Each page is fetched independently and parsed with the same logic.
 */
export const ARTICLE_GRANT_PAGES: ArticleGrantPage[] = [
  // ── NerdWallet ──────────────────────────────────────────────────────────
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/article/small-business/small-business-grants-for-women",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-minorities",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/grants-for-veterans",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "VETERAN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nerdwallet.com/business/loans/learn/startup-business-grants",
    sourceName: "nerdwallet",
    siteDomain: "nerdwallet.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
  },
  // ── Shopify ─────────────────────────────────────────────────────────────
  {
    url: "https://www.shopify.com/blog/small-business-grants",
    sourceName: "shopify",
    siteDomain: "shopify.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.shopify.com/blog/grants-for-black-women",
    sourceName: "shopify",
    siteDomain: "shopify.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── US Chamber of Commerce ──────────────────────────────────────────────
  {
    url: "https://www.uschamber.com/co/run/business-financing/small-business-grants-and-programs",
    sourceName: "uschamber",
    siteDomain: "uschamber.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Fundera ─────────────────────────────────────────────────────────────
  {
    url: "https://fundera.com/blog/small-business-grants",
    sourceName: "fundera",
    siteDomain: "fundera.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Homebase ────────────────────────────────────────────────────────────
  {
    url: "https://www.joinhomebase.com/blog/small-business-grants",
    sourceName: "homebase",
    siteDomain: "joinhomebase.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Hiscox ──────────────────────────────────────────────────────────────
  {
    url: "https://www.hiscox.com/blog/small-business-grants-women-entrepreneurs",
    sourceName: "hiscox",
    siteDomain: "hiscox.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Foundr ──────────────────────────────────────────────────────────────
  {
    url: "https://foundr.com/articles/building-a-business/grants-for-small-businesses",
    sourceName: "foundr",
    siteDomain: "foundr.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── SoFi ────────────────────────────────────────────────────────────────
  {
    url: "https://www.sofi.com/learn/content/small-business-start-up-grants-loans-programs/",
    sourceName: "sofi",
    siteDomain: "sofi.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
  },
  // ── Bankrate ───────────────────────────────────────────────────────────
  {
    url: "https://www.bankrate.com/loans/small-business/where-to-find-grants/",
    sourceName: "bankrate",
    siteDomain: "bankrate.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.bankrate.com/loans/small-business/business-grants-for-women/",
    sourceName: "bankrate",
    siteDomain: "bankrate.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.bankrate.com/loans/small-business/business-grants-for-minorities/",
    sourceName: "bankrate",
    siteDomain: "bankrate.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── SCORE ──────────────────────────────────────────────────────────────
  {
    url: "https://www.score.org/resource/blog-post/how-get-a-small-business-grant",
    sourceName: "score",
    siteDomain: "score.org",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Nav ────────────────────────────────────────────────────────────────
  {
    url: "https://www.nav.com/resource/small-business-grants/",
    sourceName: "nav",
    siteDomain: "nav.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.nav.com/business-financing-options/best-small-business-grants-for-women/",
    sourceName: "nav",
    siteDomain: "nav.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Inc. Magazine ──────────────────────────────────────────────────────
  {
    url: "https://www.inc.com/brian-contreras/12-small-business-grants-to-apply-to-in-2026/91288454",
    sourceName: "inc",
    siteDomain: "inc.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Business News Daily ────────────────────────────────────────────────
  {
    url: "https://www.businessnewsdaily.com/15758-government-grants-for-small-businesses.html",
    sourceName: "businessnewsdaily",
    siteDomain: "businessnewsdaily.com",
    gender: "ANY",
    grantType: "FEDERAL",
    businessStage: "BOTH",
  },
  // ── QuickBooks/Intuit ──────────────────────────────────────────────────
  {
    url: "https://quickbooks.intuit.com/r/funding/small-business-grants/",
    sourceName: "quickbooks",
    siteDomain: "intuit.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── LendingTree ────────────────────────────────────────────────────────
  {
    url: "https://www.lendingtree.com/business/grant/",
    sourceName: "lendingtree",
    siteDomain: "lendingtree.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── FitSmallBusiness ───────────────────────────────────────────────────
  {
    url: "https://fitsmallbusiness.com/best-small-business-grants/",
    sourceName: "fitsmallbusiness",
    siteDomain: "fitsmallbusiness.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://fitsmallbusiness.com/best-women-owned-business-grants/",
    sourceName: "fitsmallbusiness",
    siteDomain: "fitsmallbusiness.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://fitsmallbusiness.com/minority-small-business-grants/",
    sourceName: "fitsmallbusiness",
    siteDomain: "fitsmallbusiness.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Lendio ─────────────────────────────────────────────────────────────
  {
    url: "https://www.lendio.com/blog/where-to-find-small-business-sba-grants/",
    sourceName: "lendio",
    siteDomain: "lendio.com",
    gender: "ANY",
    grantType: "FEDERAL",
    businessStage: "BOTH",
  },
  {
    url: "https://www.lendio.com/blog/grants-minority-small-business-owners",
    sourceName: "lendio",
    siteDomain: "lendio.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Credibly ───────────────────────────────────────────────────────────
  {
    url: "https://www.credibly.com/small-business-grants/",
    sourceName: "credibly",
    siteDomain: "credibly.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Forbes Advisor ─────────────────────────────────────────────────────
  {
    url: "https://www.forbes.com/advisor/business/small-business-grants/",
    sourceName: "forbes-advisor",
    siteDomain: "forbes.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.forbes.com/advisor/business-loans/grants-for-women-owned-businesses/",
    sourceName: "forbes-advisor",
    siteDomain: "forbes.com",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.forbes.com/advisor/business-loans/grants-for-minorities/",
    sourceName: "forbes-advisor",
    siteDomain: "forbes.com",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  {
    url: "https://www.forbes.com/advisor/business-loans/grants-for-veterans/",
    sourceName: "forbes-advisor",
    siteDomain: "forbes.com",
    gender: "VETERAN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Bench Accounting ───────────────────────────────────────────────────
  {
    url: "https://www.bench.co/blog/operations/small-business-grants",
    sourceName: "bench",
    siteDomain: "bench.co",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Rocket Lawyer / Rocket HQ ──────────────────────────────────────────
  {
    url: "https://www.rocketlawyer.com/business-and-contracts/business-operations/funding-financing/legal-guide/small-business-grants",
    sourceName: "rocket-lawyer",
    siteDomain: "rocketlawyer.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Gusto ──────────────────────────────────────────────────────────────
  {
    url: "https://gusto.com/resources/articles/business-finance/small-business-grants",
    sourceName: "gusto",
    siteDomain: "gusto.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── OnDeck ─────────────────────────────────────────────────────────────
  {
    url: "https://www.ondeck.com/resources/small-business-grants",
    sourceName: "ondeck",
    siteDomain: "ondeck.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── SmartAsset ─────────────────────────────────────────────────────────
  {
    url: "https://smartasset.com/financial-advisor/small-business-grants",
    sourceName: "smartasset",
    siteDomain: "smartasset.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── MoneyGeek ──────────────────────────────────────────────────────────
  {
    url: "https://www.moneygeek.com/business/resources/small-business-grants/",
    sourceName: "moneygeek",
    siteDomain: "moneygeek.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Investopedia ───────────────────────────────────────────────────────
  {
    url: "https://www.investopedia.com/best-small-business-grants-5272145",
    sourceName: "investopedia",
    siteDomain: "investopedia.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── USA Today Blueprint ────────────────────────────────────────────────
  {
    url: "https://www.usatoday.com/money/blueprint/business/business-loans/small-business-grants/",
    sourceName: "usatoday-blueprint",
    siteDomain: "usatoday.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── CNBC Select ────────────────────────────────────────────────────────
  {
    url: "https://www.cnbc.com/select/small-business-grants/",
    sourceName: "cnbc-select",
    siteDomain: "cnbc.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Square ─────────────────────────────────────────────────────────────
  {
    url: "https://squareup.com/us/en/the-bottom-line/managing-your-finances/small-business-grants",
    sourceName: "square",
    siteDomain: "squareup.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── ZenBusiness ────────────────────────────────────────────────────────
  {
    url: "https://www.zenbusiness.com/blog/small-business-grants/",
    sourceName: "zenbusiness",
    siteDomain: "zenbusiness.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── LegalZoom ──────────────────────────────────────────────────────────
  {
    url: "https://www.legalzoom.com/articles/small-business-grants-what-they-are-how-to-get-one",
    sourceName: "legalzoom",
    siteDomain: "legalzoom.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── NFIB ───────────────────────────────────────────────────────────────
  {
    url: "https://www.nfib.com/small-business-grants/",
    sourceName: "nfib",
    siteDomain: "nfib.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Chamber of Commerce .org ───────────────────────────────────────────
  {
    url: "https://www.chamberofcommerce.org/small-business-grants",
    sourceName: "chamberofcommerce-org",
    siteDomain: "chamberofcommerce.org",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Kabbage / American Express ─────────────────────────────────────────
  {
    url: "https://www.kabbage.com/resource-center/grow/small-business-grants/",
    sourceName: "kabbage",
    siteDomain: "kabbage.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Entrepreneur.com ───────────────────────────────────────────────────
  {
    url: "https://www.entrepreneur.com/money-finance/small-business-grants-for-women-minorities-and-veterans/450423",
    sourceName: "entrepreneur",
    siteDomain: "entrepreneur.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
  // ── Merchant Maverick ──────────────────────────────────────────────────
  {
    url: "https://www.merchantmaverick.com/small-business-grants/",
    sourceName: "merchantmaverick",
    siteDomain: "merchantmaverick.com",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
  },
];
