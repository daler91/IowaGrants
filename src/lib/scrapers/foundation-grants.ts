import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GenderFocus, GrantType, BusinessStage } from "@prisma/client";
import { BROWSER_HEADERS } from "./config";
import { isExcludedByStateRestriction, detectLocationScope, extractDeadline } from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Curated private foundation grant programs for small businesses
// ---------------------------------------------------------------------------

interface FoundationGrant {
  /** Name of the grant program */
  name: string;
  /** URL to the grant program page */
  url: string;
  /** Source name stored in DB */
  sourceName: string;
  /** Known grant details (static, supplemented by scraping) */
  description: string;
  gender: GenderFocus;
  grantType: GrantType;
  businessStage: BusinessStage;
  amountMin?: number;
  amountMax?: number;
  amount?: string;
}

/**
 * Well-known, recurring small business grant programs from private foundations
 * and organizations. These are verified, legitimate programs.
 */
const FOUNDATION_GRANTS: FoundationGrant[] = [
  {
    name: "Amber Grant for Women",
    url: "https://ambergrantsforwomen.com/get-an-amber-grant/",
    sourceName: "amber-grant",
    description:
      "Monthly $10,000 grant awarded to women-owned businesses. Each month's winner is also eligible for an additional $25,000 year-end grant. Open to all women-owned businesses in the US and Canada.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 25000,
    amount: "$10,000 monthly / $25,000 annual",
  },
  {
    name: "Hello Alice Small Business Grant",
    url: "https://helloalice.com/grants/",
    sourceName: "hello-alice",
    description:
      "Hello Alice partners with major corporations to offer grants ranging from $5,000 to $50,000 for small businesses. Programs rotate throughout the year targeting various demographics including women, minorities, veterans, and general small business owners.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 50000,
    amount: "$5,000 - $50,000",
  },
  {
    name: "FedEx Small Business Grant Contest",
    url: "https://www.fedex.com/en-us/small-business/grant-contest.html",
    sourceName: "fedex-grant",
    description:
      "Annual grant contest awarding up to $50,000 in grand prizes plus FedEx Office print and business services. Open to for-profit small businesses in the US with fewer than 99 employees.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 15000,
    amountMax: 50000,
    amount: "Up to $50,000",
  },
  {
    name: "NASE Growth Grants",
    url: "https://www.nase.org/become-a-member/member-benefits/business-resources/growth-grants",
    sourceName: "nase",
    description:
      "The National Association for the Self-Employed (NASE) awards Growth Grants of up to $4,000 to micro-business owners who are NASE members. Grants can be used for marketing, equipment, hiring, or expansion.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 500,
    amountMax: 4000,
    amount: "Up to $4,000",
  },
  {
    name: "Nav Small Business Grant",
    url: "https://www.nav.com/small-business-grant/",
    sourceName: "nav-grant",
    description:
      "Quarterly $10,000 grant for small business owners. Open to US-based for-profit businesses. No restrictions on how grant funds are used.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "Cartier Women's Initiative",
    url: "https://www.cartierwomensinitiative.com/",
    sourceName: "cartier-women",
    description:
      "International entrepreneurship program for women impact entrepreneurs. Provides grants of up to $100,000 along with mentoring, networking, and media visibility. Open to women-run, for-profit businesses worldwide.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 30000,
    amountMax: 100000,
    amount: "$30,000 - $100,000",
  },
  {
    name: "IFundWomen Universal Grant",
    url: "https://ifundwomen.com/grants",
    sourceName: "ifundwomen",
    description:
      "IFundWomen partners with corporations and foundations to offer grants specifically for women entrepreneurs. Grant amounts and availability vary by program cycle. Focus areas include women-owned, BIPOC, and LGBTQ+ businesses.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 25000,
    amount: "$1,000 - $25,000",
  },
  {
    name: "Visa Everywhere Initiative",
    url: "https://usa.visa.com/run-your-business/visa-everywhere-initiative.html",
    sourceName: "visa-initiative",
    description:
      "Global innovation program inviting startups to solve payment and commerce challenges. Winners receive cash prizes and potential partnership with Visa. Open to early-stage and growth-stage startups.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 25000,
    amountMax: 100000,
    amount: "$25,000 - $100,000",
  },
  {
    name: "Walmart Spark Good Community Grant",
    url: "https://walmart.org/how-we-give/local-community-grants",
    sourceName: "walmart-spark",
    description:
      "Local community grants from Walmart stores ranging from $250 to $5,000. Available to organizations and small businesses that serve the local community. Funded through local Walmart and Sam's Club stores.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 250,
    amountMax: 5000,
    amount: "$250 - $5,000",
  },
  {
    name: "Eileen Fisher Women-Owned Business Grant",
    url: "https://www.eileenfisher.com/grants/",
    sourceName: "eileen-fisher",
    description:
      "Annual grants of up to $100,000 for women-owned businesses focused on environmental and social sustainability. Businesses must be majority women-owned and in operation for at least 3 years.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 10000,
    amountMax: 100000,
    amount: "Up to $100,000",
  },
  {
    name: "StreetShares Foundation Veteran Small Business Award",
    url: "https://streetsharesfoundation.org/",
    sourceName: "streetshares",
    description:
      "Awards for veteran and military spouse entrepreneurs. Provides grants, free business services, and mentoring to veteran-owned small businesses. Monthly and annual award cycles.",
    gender: "VETERAN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 15000,
    amount: "$5,000 - $15,000",
  },
  {
    name: "National Black MBA Association Scale-Up Pitch Challenge",
    url: "https://nbmbaa.org/scale-up-pitch-challenge/",
    sourceName: "nbmbaa-pitch",
    description:
      "Annual pitch competition for Black entrepreneurs providing cash grants and business support. Open to early and growth-stage Black-owned businesses in the US.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 50000,
    amount: "Up to $50,000",
  },
  {
    name: "Girlboss Foundation Grant",
    url: "https://girlboss.com/pages/foundation",
    sourceName: "girlboss",
    description:
      "Biannual grant of $15,000 for women-owned businesses in fashion, beauty, wellness, and design. Supports creative women entrepreneurs building innovative businesses.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 15000,
    amountMax: 15000,
    amount: "$15,000",
  },
  {
    name: "Tory Burch Foundation Fellows Program",
    url: "https://www.toryburchfoundation.org/fellows/",
    sourceName: "tory-burch",
    description:
      "Year-long fellowship for women entrepreneurs providing education, mentoring, networking, and access to capital. Fellows receive business education from top institutions and potential investment opportunities.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
  },
  {
    name: "SoGal Black Founder Startup Grant",
    url: "https://www.sogalventures.com/",
    sourceName: "sogal-ventures",
    description:
      "Grant program providing $10,000 cash grants and mentorship to Black women and non-binary entrepreneurs. Focus on early-stage startups across all industries.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "Comcast RISE",
    url: "https://www.comcastrise.com/",
    sourceName: "comcast-rise",
    description:
      "Comcast RISE (Representation, Investment, Strength, Empowerment) supports small businesses owned by people of color with grants, marketing services, technology upgrades, and media placement worth thousands of dollars.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 5000,
    amountMax: 10000,
    amount: "Up to $10,000 in services",
  },
  {
    name: "Amazon Small Business Grant",
    url: "https://www.aboutamazon.com/impact/empowerment/small-business",
    sourceName: "amazon-grant",
    description:
      "Amazon periodically offers grants and resources for small businesses, including credits for Amazon Web Services, advertising, and direct cash grants through various programs throughout the year.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 25000,
    amount: "Varies by program",
  },
  {
    name: "Google for Startups Black Founders Fund",
    url: "https://startup.google.com/programs/black-founders-fund/",
    sourceName: "google-black-founders",
    description:
      "Google for Startups provides up to $100,000 in non-dilutive funding for Black-led startups in the US, along with Google Cloud credits, ad grants, and hands-on support from Google teams.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 50000,
    amountMax: 100000,
    amount: "Up to $100,000",
  },
  {
    name: "Halstead Grant for Jewelry Businesses",
    url: "https://halsteadbead.com/halstead-grant",
    sourceName: "halstead-grant",
    description:
      "Annual $7,500 grant for emerging jewelry artisans and small jewelry businesses. Includes cash grant plus $1,000 in Halstead jewelry supplies. Open to US-based jewelry entrepreneurs.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 7500,
    amountMax: 7500,
    amount: "$7,500 + $1,000 supplies",
  },
  {
    name: "Patagonia Environmental Grants",
    url: "https://www.patagonia.com/actionworks/grants/",
    sourceName: "patagonia-grants",
    description:
      "Patagonia funds environmental organizations and businesses working on environmental sustainability. Grants support grassroots activism, innovative solutions to environmental problems, and businesses with strong environmental missions.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 20000,
    amount: "Up to $20,000",
  },
  {
    name: "Awesome Foundation Micro-Grant",
    url: "https://www.awesomefoundation.org/",
    sourceName: "awesome-foundation",
    description:
      "Monthly $1,000 micro-grants for awesome ideas and projects. No strings attached — grants are given to projects that bring communities together, advance knowledge, or create positive impact. Open to individuals and small businesses.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 1000,
    amount: "$1,000",
  },
  {
    name: "First Nations Development Institute Grants",
    url: "https://www.firstnations.org/grantmaking/",
    sourceName: "first-nations",
    description:
      "Grants for Native American-owned businesses and organizations focused on economic development, asset building, and financial empowerment in Native communities. Multiple grant programs throughout the year.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 50000,
    amount: "$5,000 - $50,000",
  },
  {
    name: "National Urban League Entrepreneurship Grants",
    url: "https://nul.org/program/entrepreneurship",
    sourceName: "national-urban-league",
    description:
      "The National Urban League supports minority entrepreneurs through grants, mentoring, and business development programs. Focus on empowering African American and underserved business owners with capital access and training.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 50000,
    amount: "Varies by program",
  },
  {
    name: "37 Angels Women Entrepreneur Grant",
    url: "https://www.37angels.com/",
    sourceName: "37-angels",
    description:
      "Investment and grant program focused on women-led startups. 37 Angels invests in early-stage companies founded by women, providing both capital and mentorship from a network of women investors.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
  },
  {
    name: "Thiel Fellowship",
    url: "https://thielfellowship.org/",
    sourceName: "thiel-fellowship",
    description:
      "Prestigious $100,000 grant for young entrepreneurs (under 23) to pursue innovative business ideas instead of or alongside college. Fellows receive mentorship, networking, and a community of peer entrepreneurs.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 100000,
    amountMax: 100000,
    amount: "$100,000",
  },
  {
    name: "National Geographic Society Grants",
    url: "https://www.nationalgeographic.org/funding-opportunities/grants/",
    sourceName: "natgeo-grants",
    description:
      "Grants for research, exploration, conservation, education, and storytelling projects. Supports entrepreneurs and small businesses working in environmental science, wildlife conservation, and sustainable tourism.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 50000,
    amount: "$5,000 - $50,000",
  },
  {
    name: "Verizon Small Business Digital Ready Grant",
    url: "https://www.verizon.com/about/responsibility/digital-inclusion/small-business-training",
    sourceName: "verizon-digital-ready",
    description:
      "Verizon Small Business Digital Ready provides $10,000 grants to eligible small businesses that complete coursework on the platform. Free curriculum, coaching, and networking included. Open to US small businesses with fewer than 10 employees, with a focus on diverse-owned businesses.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "American Express Backing Small Business Grant",
    url: "https://www.mainstreetamerica.org/programs/backing-small-businesses/",
    sourceName: "amex-backing-small",
    description:
      "American Express partners with Main Street America to offer $10,000 grants (plus $40,000 enhancement grants) to small businesses located in historically under-resourced commercial districts in the US. Open to brick-and-mortar small businesses in eligible geographies.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 10000,
    amountMax: 50000,
    amount: "$10,000 - $50,000",
  },
  {
    name: "DoorDash Restaurant Disaster Relief Fund",
    url: "https://merchants.doordash.com/en-us/blog/disaster-relief-fund",
    sourceName: "doordash-disaster-relief",
    description:
      "DoorDash partners with Hello Alice to provide $10,000 grants to independently owned restaurants impacted by natural disasters. Open to independent restaurant owners in the US experiencing physical damage or business interruption from a FEMA-declared disaster.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "PayPal Empowerment Grant",
    url: "https://aeoworks.org/tools/paypal-grant-program/",
    sourceName: "paypal-empowerment",
    description:
      "PayPal partners with the Association for Enterprise Opportunity (AEO) to deliver grants to underserved small business owners. Grants support Black-owned and minority-owned small businesses with capital and technical assistance.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "Block (Square) Unconventional Grants",
    url: "https://squareup.com/us/en/the-bottom-line",
    sourceName: "block-square-unconventional",
    description:
      "Block (parent of Square and Cash App) periodically sponsors grant programs and pitch competitions for small businesses, creators, and entrepreneurs. Programs rotate and often focus on underrepresented founders in food, retail, and services.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 50000,
    amount: "Varies by program",
  },
  {
    name: "Venmo Small Business Grant",
    url: "https://venmo.com/smallbusinessgrant/",
    sourceName: "venmo-small-business-grant",
    description:
      "Venmo's Small Business Grant program awards $10,000 grants to small business owners using Venmo for Business. Recipients also receive business resources and mentorship from industry experts.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 10000,
    amount: "$10,000",
  },
  {
    name: "Black Girl Ventures Pitch Competition",
    url: "https://www.blackgirlventures.org/",
    sourceName: "black-girl-ventures",
    description:
      "Pitch competition and funding program for Black and Brown women-identifying founders. Provides crowdfunded grants, mentorship, and access to a network of investors and partners. Open to early-stage women of color entrepreneurs in the US.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 5000,
    amountMax: 20000,
    amount: "$5,000 - $20,000",
  },
  {
    name: "DigitalUndivided BIG Incubator Grant",
    url: "https://www.digitalundivided.com/",
    sourceName: "digitalundivided",
    description:
      "DigitalUndivided's BIG Incubator supports Black and Latina women founders building scalable startups. Includes grant capital, business coaching, legal resources, and investor connections. Open to early-stage founders with validated products.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 5000,
    amountMax: 20000,
    amount: "$5,000 - $20,000",
  },
  {
    name: "Founders First Small Business Growth Grant",
    url: "https://foundersfirstcdc.org/grants/",
    sourceName: "founders-first",
    description:
      "Founders First CDC provides growth grants to diverse-led, revenue-generating small businesses in the US. Focus on women, people of color, veterans, and businesses located in low/moderate income areas. Grant recipients also access accelerator programs and coaching.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 5000,
    amountMax: 25000,
    amount: "$5,000 - $25,000",
  },
  {
    name: "HerRise MicroGrant",
    url: "https://herrisemicrogrant.org/",
    sourceName: "herrise-microgrant",
    description:
      "Monthly $1,000 microgrants for women of color entrepreneurs. HerRise supports small business owners with working capital for growth, marketing, and operations. Open to majority-owned women of color businesses in the US.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 1000,
    amount: "$1,000 monthly",
  },
  {
    name: "Red Backpack Fund (Sara Blakely Foundation x GlobalGiving)",
    url: "https://www.globalgiving.org/redbackpackfund/",
    sourceName: "red-backpack-fund",
    description:
      "The Sara Blakely Foundation and GlobalGiving provide $5,000 grants to women-owned small businesses in the US. Open to majority women-owned, for-profit businesses with annual revenue under $5 million and fewer than 50 employees.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 5000,
    amount: "$5,000",
  },
  {
    name: "Stacy's Rise Project (Frito-Lay)",
    url: "https://www.stacysriseproject.com/",
    sourceName: "stacys-rise",
    description:
      "Stacy's Pita Chips (owned by Frito-Lay) awards cash grants plus mentorship and marketing support to women-founded food and beverage businesses. Open to early and growth-stage women-owned food and beverage companies in the US.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 10000,
    amountMax: 25000,
    amount: "Up to $25,000",
  },
  {
    name: "Etsy Uplift Fund",
    url: "https://www.etsy.com/impact",
    sourceName: "etsy-uplift",
    description:
      "Etsy's Uplift Fund supports small craft businesses and makers through grants to partner organizations that train and fund underrepresented creative entrepreneurs. Focus on women, BIPOC, and LGBTQ+ makers.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 10000,
    amount: "Varies by program",
  },
  {
    name: "1-800-Flowers Small Business Grant Program",
    url: "https://www.1800flowers.com/",
    sourceName: "1800-flowers",
    description:
      "1-800-Flowers periodically runs grant programs for small florists and gift businesses. Grants provide working capital, marketing support, and technology upgrades for independent small businesses in the floral and gift industry.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 2500,
    amountMax: 10000,
    amount: "Varies by program",
  },
  {
    name: "Grameen America Microloans & Grants",
    url: "https://www.grameenamerica.org/",
    sourceName: "grameen-america",
    description:
      "Grameen America provides microloans and capital to women entrepreneurs living in poverty in the US. Members receive training, peer support, and access to capital starting at $2,000. Focus on women of color and low-income women building businesses.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 2000,
    amountMax: 15000,
    amount: "$2,000 - $15,000",
  },
  {
    name: "MBDA Capital Readiness Program",
    url: "https://www.mbda.gov/CRP",
    sourceName: "mbda-capital-readiness",
    description:
      "The Minority Business Development Agency's Capital Readiness Program provides technical assistance and grant-backed support to minority-owned businesses preparing to access growth capital. Delivered through regional incubator and accelerator partners nationwide.",
    gender: "MINORITY",
    grantType: "FEDERAL",
    businessStage: "EXISTING",
    amountMin: 5000,
    amountMax: 50000,
    amount: "Varies by program",
  },
  {
    name: "LISC Small Business Relief & Recovery Grants",
    url: "https://www.lisc.org/our-initiatives/small-business/",
    sourceName: "lisc-small-business",
    description:
      "Local Initiatives Support Corporation (LISC) partners with corporate sponsors to deliver grants to small businesses in under-resourced communities. Programs support minority, women, and veteran business owners with working capital, equipment, and recovery funding.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 5000,
    amountMax: 25000,
    amount: "$5,000 - $25,000",
  },
  {
    name: "Dream Big Awards (US Chamber of Commerce)",
    url: "https://www.uschamber.com/co/dream-big-awards",
    sourceName: "uschamber-dream-big",
    description:
      "Annual awards recognizing small business achievement. The Dream Big Small Business of the Year award provides a $25,000 cash prize plus national recognition. Open to for-profit US small businesses with fewer than 250 employees and under $20M annual revenue.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "EXISTING",
    amountMin: 10000,
    amountMax: 25000,
    amount: "Up to $25,000",
  },
  {
    name: "New Voices Foundation Grants",
    url: "https://newvoicesfoundation.org/",
    sourceName: "new-voices-foundation",
    description:
      "New Voices Foundation supports women of color entrepreneurs with grants, training, and access to capital. Programs include microgrants, business acceleration, and wealth-building education for Black, Latina, Asian, Indigenous, and multi-racial women founders.",
    gender: "MINORITY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 25000,
    amount: "$1,000 - $25,000",
  },
  {
    name: "Unsung Heroes Small Business Grants",
    url: "https://www.libertybank.com/unsung-heroes/",
    sourceName: "unsung-heroes",
    description:
      "Recognition and grant program for community-serving small businesses. Awards cash grants plus business support to local entrepreneurs making a positive impact in their communities.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 2500,
    amountMax: 10000,
    amount: "$2,500 - $10,000",
  },
  {
    name: "Freed Fellowship Grant",
    url: "https://www.freedfellowship.com/",
    sourceName: "freed-fellowship",
    description:
      "Monthly $500 grants to small business owners, plus an annual $2,500 grand prize. Freed Fellowship also provides mentorship and a founder community. Open to US small business owners with a commitment to growth.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 500,
    amountMax: 2500,
    amount: "$500 monthly / $2,500 annual",
  },
  {
    name: "Backstage Capital Seed Investment",
    url: "https://backstagecapital.com/",
    sourceName: "backstage-capital",
    description:
      "Backstage Capital invests in underrepresented founders including women, people of color, and LGBTQ+ entrepreneurs. Provides seed funding, mentorship, and network access to early-stage startups with diverse founding teams.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "STARTUP",
    amountMin: 25000,
    amountMax: 100000,
    amount: "$25,000 - $100,000",
  },
  {
    name: "Kiva U.S. 0% Interest Microloans",
    url: "https://www.kiva.org/borrow",
    sourceName: "kiva-us",
    description:
      "Kiva U.S. provides 0% interest, zero-fee microloans up to $15,000 to entrepreneurs through crowdfunded lending. Focus on underbanked and underserved small business owners, including women, minorities, veterans, and immigrants. Available to US-based for-profit businesses.",
    gender: "ANY",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 15000,
    amount: "Up to $15,000 (0% interest)",
  },
  {
    name: "NAWBO Women's Business Grants",
    url: "https://www.nawbo.org/",
    sourceName: "nawbo-grants",
    description:
      "The National Association of Women Business Owners (NAWBO) partners with corporate sponsors to offer grants, scholarships, and recognition programs for women entrepreneurs. Includes annual awards and educational grant opportunities for NAWBO members nationwide.",
    gender: "WOMEN",
    grantType: "PRIVATE",
    businessStage: "BOTH",
    amountMin: 1000,
    amountMax: 25000,
    amount: "Varies by program",
  },
];

// Browser-like headers imported from ./config

// ---------------------------------------------------------------------------
// Enrichment: try to scrape current deadline and updated description
// ---------------------------------------------------------------------------

async function enrichFromPage(
  grant: FoundationGrant,
): Promise<{ deadline?: Date; liveDescription?: string }> {
  try {
    const response = await axios.get(grant.url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    if (response.status !== 200 || typeof response.data !== "string") {
      return {};
    }

    const html = response.data as string;
    const deadline = extractDeadline(html);

    // Try to extract a better description from the live page
    const $ = cheerio.load(html);
    $("nav, footer, script, style, header, aside").remove();

    const bodyText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 1200);

    return {
      deadline,
      liveDescription: bodyText.length > 100 ? bodyText : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchFoundationGrants(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const foundation of FOUNDATION_GRANTS) {
    try {
      const fullText = `${foundation.name} ${foundation.description}`;

      // Skip if restricted to a non-Iowa state
      if (isExcludedByStateRestriction(fullText)) {
        log("foundation-grants", "Skipping state-restricted", { name: foundation.name });
        continue;
      }

      // Enrich with live page data (deadline, updated description)
      const enriched = await enrichFromPage(foundation);

      const description =
        enriched.liveDescription && enriched.liveDescription.length > foundation.description.length
          ? `${foundation.description}\n\n${enriched.liveDescription.slice(0, 800)}`
          : foundation.description;

      const grant: GrantData = {
        title: foundation.name,
        description,
        sourceUrl: foundation.url,
        sourceName: foundation.sourceName,
        amount: foundation.amount,
        amountMin: foundation.amountMin,
        amountMax: foundation.amountMax,
        deadline: enriched.deadline,
        grantType: foundation.grantType,
        status: "OPEN",
        businessStage: foundation.businessStage,
        gender: foundation.gender,
        locations: detectLocationScope(fullText),
        industries: [],
        categories: ["Private Foundation"],
        eligibleExpenses: [],
      };

      if (!seenUrls.has(grant.sourceUrl)) {
        seenUrls.add(grant.sourceUrl);
        allGrants.push(grant);
      }

      // Polite delay between requests
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      logError("foundation-grants", `Error processing ${foundation.name}`, error);
    }
  }

  log("foundation-grants", "Total grants", {
    count: allGrants.length,
    sources: FOUNDATION_GRANTS.length,
  });
  return allGrants;
}
