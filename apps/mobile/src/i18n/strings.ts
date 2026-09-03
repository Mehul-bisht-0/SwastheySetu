/**
 * FILE: apps/mobile/src/i18n/strings.ts
 * PLAN: IMPLEMENTATION_PLAN.md Â§12.4
 * STATUS: COMPLETE â€” do not modify without reading the WORDING RULES below.
 * PHASE: 7
 *
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *  THE COPY IS PART OF THE SAFETY LAYER, NOT DECORATION.
 *
 *  Most of the ways this project can hurt someone are sentences, not bugs. A
 *  correct tier presented as "You have pneumonia" is a harmful screen produced
 *  by working code. Treat every string here with the care you would give the
 *  ruleset.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *
 * WORDING RULES â€” a new string must satisfy all five.
 *
 *   1. NAME NO DISEASE. Not in advice, not in a hint, not in an example. The
 *      app reports urgency and destination. It does not diagnose, and it must
 *      not sound as though it does. `apps/api/test/triage.test.ts` greps the
 *      response body for disease names; the mobile equivalent is your judgment.
 *
 *   2. NEVER CLAIM A FACILITY IS OPEN. Write about the evidence, never about
 *      the building: "Confirmed 2 days ago", not "Open now". The backend knows
 *      when somebody last reported something. It does not know what is true at
 *      this moment and must not imply that it does. (GUARDRAIL 3.)
 *
 *   3. SECOND PERSON, PRESENT TENSE, ONE ACTION PER SENTENCE. "Go to the
 *      hospital now." not "It is recommended that the patient be transported."
 *
 *   4. NO NUMBER A USER CANNOT ACT ON. Never show a triage score, a confidence
 *      percentage, or a model version on screen. They invite false precision
 *      and they are meaningless to the person holding the phone.
 *
 *   5. HINDI IS NOT A TRANSLATION OF THE ENGLISH â€” it is the primary text for
 *      most users of this app. Where a literal translation would be stilted,
 *      write the Hindi first and let the English follow it.
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * HOW TO USE
 *
 *   import { t, setLocale } from "@/i18n/strings";
 *   <Text>{t("triage.emergency.headline")}</Text>
 *
 *   Locale is chosen once at startup from expo-localization and can be changed
 *   from the header on any screen. It is stored in SQLite (`app_meta`), not in
 *   memory, so it survives a cold start on a phone that gets killed constantly.
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * IMPLEMENT (the small part of this file that is not data)
 *
 *   1. let locale: Locale = "hi";
 *   2. export function setLocale(l: Locale): void
 *   3. export function getLocale(): Locale
 *   4. export function t(key: StringKey, vars?: Record<string, string | number>): string
 *        Look up STRINGS[key][locale]. Fall back to "en" if a key is missing in
 *        Hindi â€” a missing string must render the English, never the raw key
 *        and never an empty box.
 *        Substitute {name} style placeholders from `vars`.
 *   5. export function plural(n: number, one: string, many: string): string
 */

export type Locale = "hi" | "en";

/** Every user-visible string in the app. Add here, never inline in a screen. */
export const STRINGS = {
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ shell
  "app.name": { hi: "à¤¸à¥à¤µà¤¾à¤¸à¥à¤¥à¥à¤¯à¤¸à¥‡à¤¤à¥", en: "SwasthyaSetu" },
  "app.tagline": {
    hi: "à¤¬à¤¿à¤¨à¤¾ à¤‡à¤‚à¤Ÿà¤°à¤¨à¥‡à¤Ÿ à¤•à¥‡ à¤­à¥€ à¤•à¤¾à¤® à¤•à¤°à¤¤à¤¾ à¤¹à¥ˆ",
    en: "Works without internet",
  },

  "role.title": { hi: "à¤†à¤ª à¤•à¥Œà¤¨ à¤¹à¥ˆà¤‚?", en: "Who is using this phone?" },
  "role.citizen": { hi: "à¤®à¥ˆà¤‚ à¤®à¤°à¥€à¤œà¤¼ à¤¯à¤¾ à¤ªà¤°à¤¿à¤œà¤¨ à¤¹à¥‚à¤", en: "I am a patient or family member" },
  "role.asha": { hi: "à¤®à¥ˆà¤‚ à¤†à¤¶à¤¾ à¤•à¤¾à¤°à¥à¤¯à¤•à¤°à¥à¤¤à¤¾ à¤¹à¥‚à¤", en: "I am an ASHA worker" },

  "net.offline": { hi: "à¤‘à¤«à¤¼à¤²à¤¾à¤‡à¤¨", en: "Offline" },
  "net.offlineDetail": {
    hi: "à¤‡à¤‚à¤Ÿà¤°à¤¨à¥‡à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤¸à¤²à¤¾à¤¹ à¤«à¤¿à¤° à¤­à¥€ à¤®à¤¿à¤²à¥‡à¤—à¥€à¥¤",
    en: "No internet. Advice still works.",
  },
  "net.online": { hi: "à¤‘à¤¨à¤²à¤¾à¤‡à¤¨", en: "Online" },

  "action.back": { hi: "à¤ªà¥€à¤›à¥‡", en: "Back" },
  "action.next": { hi: "à¤†à¤—à¥‡", en: "Next" },
  "action.retry": { hi: "à¤«à¤¿à¤° à¤•à¥‹à¤¶à¤¿à¤¶ à¤•à¤°à¥‡à¤‚", en: "Try again" },
  "action.startOver": { hi: "à¤¨à¤ à¤¸à¤¿à¤°à¥‡ à¤¸à¥‡ à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚", en: "Start over" },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ symptom entry
  "symptoms.title": { hi: "à¤•à¥à¤¯à¤¾ à¤¤à¤•à¤²à¥€à¤«à¤¼ à¤¹à¥ˆ?", en: "What is wrong?" },
  "symptoms.help": {
    hi: "à¤œà¥‹ à¤­à¥€ à¤²à¤¾à¤—à¥‚ à¤¹à¥‹, à¤¸à¤¬ à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    en: "Choose everything that applies.",
  },
  "symptoms.none": { hi: "à¤•à¥à¤› à¤¨à¤¹à¥€à¤‚ à¤šà¥à¤¨à¤¾ à¤—à¤¯à¤¾", en: "Nothing chosen yet" },
  "symptoms.continue": { hi: "à¤†à¤—à¥‡ à¤¬à¤¢à¤¼à¥‡à¤‚", en: "Continue" },

  "patient.title": { hi: "à¤®à¤°à¥€à¤œà¤¼ à¤•à¥‡ à¤¬à¤¾à¤°à¥‡ à¤®à¥‡à¤‚", en: "About the patient" },
  "patient.age": { hi: "à¤‰à¤®à¥à¤°", en: "Age" },
  "patient.ageYears": { hi: "à¤¸à¤¾à¤²", en: "years" },
  "patient.ageMonths": { hi: "à¤®à¤¹à¥€à¤¨à¥‡", en: "months" },
  "patient.sex": { hi: "à¤²à¤¿à¤‚à¤—", en: "Sex" },
  "patient.female": { hi: "à¤®à¤¹à¤¿à¤²à¤¾", en: "Female" },
  "patient.male": { hi: "à¤ªà¥à¤°à¥à¤·", en: "Male" },
  "patient.pregnancy": { hi: "à¤•à¥à¤¯à¤¾ à¤—à¤°à¥à¤­à¤µà¤¤à¥€ à¤¹à¥ˆà¤‚?", en: "Pregnant?" },
  "patient.pregnancyYes": { hi: "à¤¹à¤¾à¤", en: "Yes" },
  "patient.pregnancyNo": { hi: "à¤¨à¤¹à¥€à¤‚", en: "No" },
  "patient.pregnancyUnknown": { hi: "à¤ªà¤¤à¤¾ à¤¨à¤¹à¥€à¤‚", en: "Not sure" },
  /** RULE 3 in action: "Not sure" is a safe answer, so say so. */
  "patient.pregnancyUnknownHelp": {
    hi: "à¤ªà¤¤à¤¾ à¤¨ à¤¹à¥‹à¤¨à¤¾ à¤ à¥€à¤• à¤¹à¥ˆà¥¤ à¤¹à¤® à¤¸à¤¾à¤µà¤§à¤¾à¤¨à¥€ à¤¬à¤°à¤¤à¥‡à¤‚à¤—à¥‡à¥¤",
    en: "Not knowing is fine. We will take the careful option.",
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ result
  // One headline/support pair per `UrgencyTier` in packages/core. The four read
  // as a ladder of *when*, never of *what*: now, today, this week, at home.
  // Nothing in this block names a body part or a disease (RULE 1).
  "triage.EMERGENCY.headline": { hi: "à¤…à¤­à¥€ à¤…à¤¸à¥à¤ªà¤¤à¤¾à¤² à¤œà¤¾à¤‡à¤", en: "Go to hospital now" },
  "triage.EMERGENCY.support": {
    hi: "à¤¦à¥‡à¤° à¤¨ à¤•à¤°à¥‡à¤‚à¥¤ à¤°à¤¾à¤¸à¥à¤¤à¥‡ à¤®à¥‡à¤‚ à¤•à¤¿à¤¸à¥€ à¤•à¥‹ à¤¸à¤¾à¤¥ à¤°à¤–à¥‡à¤‚à¥¤",
    en: "Do not wait. Take someone with you.",
  },
  "triage.GO_NOW.headline": { hi: "à¤†à¤œ à¤¹à¥€ à¤¦à¤¿à¤–à¤¾à¤‡à¤, à¤¦à¥‡à¤° à¤¨ à¤•à¤°à¥‡à¤‚", en: "Get seen today, without waiting" },
  "triage.GO_NOW.support": {
    hi: "à¤†à¤œ à¤¹à¥€ à¤¸à¥à¤µà¤¾à¤¸à¥à¤¥à¥à¤¯ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤ªà¤¹à¥à¤à¤šà¥‡à¤‚à¥¤ à¤•à¤² à¤¤à¤• à¤‡à¤‚à¤¤à¤œà¤¼à¤¾à¤° à¤¨ à¤•à¤°à¥‡à¤‚à¥¤",
    en: "Reach a health centre today. Do not wait until tomorrow.",
  },
  "triage.PHC_SOON.headline": { hi: "à¤à¤•-à¤¦à¥‹ à¤¦à¤¿à¤¨ à¤®à¥‡à¤‚ à¤¦à¤¿à¤–à¤¾à¤‡à¤", en: "See a health worker in a day or two" },
  "triage.PHC_SOON.support": {
    hi: "à¤à¤•-à¤¦à¥‹ à¤¦à¤¿à¤¨ à¤®à¥‡à¤‚ à¤¸à¥à¤µà¤¾à¤¸à¥à¤¥à¥à¤¯ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤œà¤¾à¤à¤à¥¤ à¤¹à¤¾à¤²à¤¤ à¤¬à¤¿à¤—à¤¡à¤¼à¥‡ à¤¤à¥‹ à¤¤à¥à¤°à¤‚à¤¤ à¤œà¤¾à¤à¤à¥¤",
    en: "Go to the health centre within a day or two. Go sooner if it gets worse.",
  },
  "triage.SELF_CARE.headline": { hi: "à¤˜à¤° à¤ªà¤° à¤¦à¥‡à¤–à¤­à¤¾à¤² à¤•à¤°à¥‡à¤‚", en: "Care for this at home" },
  "triage.SELF_CARE.support": {
    hi: "à¤˜à¤° à¤ªà¤° à¤§à¥à¤¯à¤¾à¤¨ à¤°à¤–à¥‡à¤‚ à¤”à¤° à¤¨à¥€à¤šà¥‡ à¤²à¤¿à¤–à¥‡ à¤²à¤•à¥à¤·à¤£à¥‹à¤‚ à¤ªà¤° à¤¨à¤œà¤¼à¤° à¤°à¤–à¥‡à¤‚à¥¤",
    en: "Look after this at home and watch for the signs below.",
  },

  "triage.whyThis": { hi: "à¤à¤¸à¤¾ à¤•à¥à¤¯à¥‹à¤‚ à¤¬à¤¤à¤¾à¤¯à¤¾ à¤—à¤¯à¤¾", en: "Why this advice" },
  "triage.watchFor": { hi: "à¤‡à¤¨ à¤¬à¤¾à¤¤à¥‹à¤‚ à¤ªà¤° à¤¨à¤œà¤¼à¤° à¤°à¤–à¥‡à¤‚", en: "Watch for these" },
  "triage.watchForHelp": {
    hi: "à¤‡à¤¨à¤®à¥‡à¤‚ à¤¸à¥‡ à¤•à¥à¤› à¤­à¥€ à¤¦à¤¿à¤–à¥‡ à¤¤à¥‹ à¤¤à¥à¤°à¤‚à¤¤ à¤…à¤¸à¥à¤ªà¤¤à¤¾à¤² à¤œà¤¾à¤à¤à¥¤",
    en: "If any of these appear, go to a hospital straight away.",
  },
  "triage.findCare": { hi: "à¤ªà¤¾à¤¸ à¤•à¤¾ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤¦à¥‡à¤–à¥‡à¤‚", en: "Find care nearby" },

  /** RULE 1. This string appears on every result screen without exception.
   *  It is short on purpose â€” a paragraph of legal text gets scrolled past. */
  "triage.disclaimer": {
    hi: "à¤¯à¤¹ à¤œà¤¾à¤à¤š à¤¯à¤¾ à¤‡à¤²à¤¾à¤œ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤¯à¤¹ à¤¸à¤¿à¤°à¥à¤«à¤¼ à¤¬à¤¤à¤¾à¤¤à¤¾ à¤¹à¥ˆ à¤•à¤¿ à¤•à¤¿à¤¤à¤¨à¥€ à¤œà¤²à¥à¤¦à¥€ à¤¦à¤¿à¤–à¤¾à¤¨à¤¾ à¤¹à¥ˆà¥¤",
    en: "This is not a diagnosis. It only tells you how soon to get help.",
  },

  "triage.offlineNote": {
    hi: "à¤¯à¤¹ à¤¸à¤²à¤¾à¤¹ à¤‡à¤¸à¥€ à¤«à¤¼à¥‹à¤¨ à¤ªà¤° à¤¤à¤¯ à¤¹à¥à¤ˆà¥¤ à¤‡à¤‚à¤Ÿà¤°à¤¨à¥‡à¤Ÿ à¤•à¥€ à¤œà¤¼à¤°à¥‚à¤°à¤¤ à¤¨à¤¹à¥€à¤‚ à¤¥à¥€à¥¤",
    en: "This advice was worked out on your phone. No internet was needed.",
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ facilities
  "facilities.title": { hi: "à¤ªà¤¾à¤¸ à¤•à¥‡ à¤¸à¥à¤µà¤¾à¤¸à¥à¤¥à¥à¤¯ à¤•à¥‡à¤‚à¤¦à¥à¤°", en: "Health facilities nearby" },
  "facilities.empty": {
    hi: "à¤‡à¤¸ à¤¦à¤¾à¤¯à¤°à¥‡ à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤¦à¤°à¥à¤œ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤",
    en: "No facility is recorded in this area.",
  },
  "facilities.emptyAction": {
    hi: "à¤¦à¤¾à¤¯à¤°à¤¾ à¤¬à¤¢à¤¼à¤¾à¤•à¤° à¤¦à¥‡à¤–à¥‡à¤‚à¥¤",
    en: "Try a wider search.",
  },
  "facilities.distance": { hi: "{km} à¤•à¤¿à¤®à¥€ à¤¦à¥‚à¤°", en: "{km} km away" },
  "facilities.call": { hi: "à¤«à¤¼à¥‹à¤¨ à¤•à¤°à¥‡à¤‚", en: "Call" },
  "facilities.directions": { hi: "à¤°à¤¾à¤¸à¥à¤¤à¤¾ à¤¦à¥‡à¤–à¥‡à¤‚", en: "Directions" },

  /** RULE 2 â€” the most carefully worded strings in the application.
   *  Every one is about the report, never about the building.
   *  The five keys are exactly `FreshnessBand` from packages/core, so a chip can
   *  be rendered as t(`freshness.${band}`) with no mapping table in between. */
  "freshness.FRESH": { hi: "{ago} à¤ªà¤¹à¤²à¥‡ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ", en: "Confirmed {ago} ago" },
  "freshness.AGING": { hi: "à¤ªà¤¿à¤›à¤²à¥€ à¤ªà¥à¤·à¥à¤Ÿà¤¿ {ago} à¤ªà¤¹à¤²à¥‡", en: "Last confirmed {ago} ago" },
  "freshness.STALE": {
    hi: "{ago} à¤¸à¥‡ à¤•à¥‹à¤ˆ à¤–à¤¼à¤¬à¤° à¤¨à¤¹à¥€à¤‚",
    en: "No report for {ago}",
  },
  "freshness.UNKNOWN": {
    hi: "à¤…à¤­à¥€ à¤¤à¤• à¤•à¤¿à¤¸à¥€ à¤¨à¥‡ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤¨à¤¹à¥€à¤‚ à¤•à¥€",
    en: "Nobody has confirmed this yet",
  },
  /** Negative evidence, and the only freshness string in the past tense about a
   *  person rather than about our records. Somebody went and found it shut; say
   *  so plainly, and do not soften it into "may be unavailable". */
  "freshness.REPORTED_CLOSED": {
    hi: "{ago} à¤ªà¤¹à¤²à¥‡ à¤•à¤¿à¤¸à¥€ à¤¨à¥‡ à¤¬à¤¤à¤¾à¤¯à¤¾ à¤•à¤¿ à¤¯à¤¹à¤¾à¤ à¤¸à¥‡à¤µà¤¾ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€",
    en: "Someone reported {ago} ago that this was not working",
  },
  "freshness.explain": {
    hi: "à¤¯à¤¹ à¤¬à¤¤à¤¾à¤¤à¤¾ à¤¹à¥ˆ à¤•à¤¿ à¤†à¤–à¤¼à¤¿à¤°à¥€ à¤–à¤¼à¤¬à¤° à¤•à¤¬ à¤†à¤ˆ à¤¥à¥€ â€” à¤¯à¤¹ à¤¨à¤¹à¥€à¤‚ à¤•à¤¿ à¤…à¤­à¥€ à¤–à¥à¤²à¤¾ à¤¹à¥ˆà¥¤",
    en: "This says when we last heard, not whether it is open right now.",
  },
  "freshness.callFirst": {
    hi: "à¤œà¤¾à¤¨à¥‡ à¤¸à¥‡ à¤ªà¤¹à¤²à¥‡ à¤«à¤¼à¥‹à¤¨ à¤•à¤° à¤²à¥‡à¤‚à¥¤",
    en: "Call before you set out.",
  },

  "facilities.fallbackApplied": {
    hi: "à¤ªà¥‚à¤°à¥€ à¤¸à¥à¤µà¤¿à¤§à¤¾ à¤µà¤¾à¤²à¤¾ à¤•à¥‹à¤ˆ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤ªà¤¾à¤¸ à¤®à¥‡à¤‚ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤ à¤¨à¤œà¤¼à¤¦à¥€à¤•à¥€ à¤µà¤¿à¤•à¤²à¥à¤ª à¤¦à¤¿à¤–à¤¾ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚à¥¤",
    en: "No nearby facility has everything needed. Showing the closest options.",
  },
  "facilities.missing": { hi: "à¤¯à¤¹à¤¾à¤ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆ: {tags}", en: "Not available here: {tags}" },

  "signal.title": { hi: "à¤¯à¤¹à¤¾à¤ à¤•à¥€ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€ à¤¦à¥‡à¤‚", en: "Report what you found" },
  "signal.confirmed": { hi: "à¤¸à¥‡à¤µà¤¾ à¤®à¤¿à¤²à¥€", en: "The service was available" },
  "signal.unavailable": { hi: "à¤¸à¥‡à¤µà¤¾ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€", en: "The service was not available" },
  "signal.thanks": {
    hi: "à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦à¥¤ à¤¯à¤¹ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€ à¤¬à¤¾à¤•à¥€ à¤²à¥‹à¤—à¥‹à¤‚ à¤•à¥‹ à¤¦à¤¿à¤–à¥‡à¤—à¥€à¥¤",
    en: "Thank you. Others will see this.",
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ASHA
  "asha.login.title": { hi: "à¤†à¤¶à¤¾ à¤•à¤¾à¤°à¥à¤¯à¤•à¤°à¥à¤¤à¤¾ à¤²à¥‰à¤—à¤¿à¤¨", en: "ASHA worker sign in" },
  "asha.login.phone": { hi: "à¤®à¥‹à¤¬à¤¾à¤‡à¤² à¤¨à¤‚à¤¬à¤°", en: "Mobile number" },
  "asha.login.password": { hi: "à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡", en: "Password" },
  "asha.login.submit": { hi: "à¤²à¥‰à¤—à¤¿à¤¨ à¤•à¤°à¥‡à¤‚", en: "Sign in" },
  /** One message for every failure mode â€” see apps/api/src/modules/auth. */
  "asha.login.failed": {
    hi: "à¤¨à¤‚à¤¬à¤° à¤¯à¤¾ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤—à¤¼à¤²à¤¤ à¤¹à¥ˆà¥¤",
    en: "That number and password do not match.",
  },
  "asha.login.offline": {
    hi: "à¤ªà¤¹à¤²à¥€ à¤¬à¤¾à¤° à¤²à¥‰à¤—à¤¿à¤¨ à¤•à¥‡ à¤²à¤¿à¤ à¤‡à¤‚à¤Ÿà¤°à¤¨à¥‡à¤Ÿ à¤šà¤¾à¤¹à¤¿à¤à¥¤ à¤‰à¤¸à¤•à¥‡ à¤¬à¤¾à¤¦ à¤œà¤¼à¤°à¥‚à¤°à¤¤ à¤¨à¤¹à¥€à¤‚à¥¤",
    en: "The first sign in needs internet. After that it does not.",
  },

  "asha.home.title": { hi: "à¤†à¤œ à¤•à¤¾ à¤•à¤¾à¤®", en: "Today" },
  "asha.home.newVisit": { hi: "à¤¨à¤¯à¤¾ à¤˜à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚", en: "Record a visit" },
  "asha.home.newTriage": { hi: "à¤²à¤•à¥à¤·à¤£ à¤œà¤¾à¤à¤šà¥‡à¤‚", en: "Check symptoms" },
  "asha.home.queue": { hi: "à¤­à¥‡à¤œà¤¨à¤¾ à¤¬à¤¾à¤•à¥€", en: "Waiting to send" },

  "asha.visit.title": { hi: "à¤˜à¤° à¤•à¤¾ à¤¦à¥Œà¤°à¤¾", en: "Household visit" },
  "asha.visit.household": { hi: "à¤˜à¤° à¤¸à¤‚à¤–à¥à¤¯à¤¾", en: "Household number" },
  /** Registers hold household codes, never names. Say why, once, here. */
  "asha.visit.householdHelp": {
    hi: "à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¤° à¤µà¤¾à¤²à¤¾ à¤¨à¤‚à¤¬à¤° à¤²à¤¿à¤–à¥‡à¤‚, à¤¨à¤¾à¤® à¤¨à¤¹à¥€à¤‚à¥¤",
    en: "Use the register number, not a name.",
  },
  "asha.visit.notes": { hi: "à¤Ÿà¤¿à¤ªà¥à¤ªà¤£à¥€", en: "Notes" },
  "asha.visit.save": { hi: "à¤¸à¤¹à¥‡à¤œà¥‡à¤‚", en: "Save" },
  "asha.visit.saved": {
    hi: "à¤«à¤¼à¥‹à¤¨ à¤®à¥‡à¤‚ à¤¸à¤¹à¥‡à¤œ à¤²à¤¿à¤¯à¤¾à¥¤ à¤‡à¤‚à¤Ÿà¤°à¤¨à¥‡à¤Ÿ à¤†à¤¤à¥‡ à¤¹à¥€ à¤…à¤ªà¤¨à¥‡ à¤†à¤ª à¤­à¥‡à¤œ à¤¦à¥‡à¤‚à¤—à¥‡à¥¤",
    en: "Saved on this phone. It will send itself when you have internet.",
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ sync
  "sync.queued": { hi: "{n} à¤­à¥‡à¤œà¤¨à¤¾ à¤¬à¤¾à¤•à¥€", en: "{n} waiting to send" },
  "sync.empty": { hi: "à¤¸à¤¬ à¤•à¥à¤› à¤­à¥‡à¤œà¤¾ à¤œà¤¾ à¤šà¥à¤•à¤¾ à¤¹à¥ˆ", en: "Everything has been sent" },
  "sync.sending": { hi: "à¤­à¥‡à¤œà¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆâ€¦", en: "Sendingâ€¦" },
  "sync.sentAt": { hi: "à¤†à¤–à¤¼à¤¿à¤°à¥€ à¤¬à¤¾à¤° à¤­à¥‡à¤œà¤¾: {when}", en: "Last sent {when}" },
  "sync.failed": {
    hi: "{n} à¤¨à¤¹à¥€à¤‚ à¤­à¥‡à¤œà¥‡ à¤œà¤¾ à¤¸à¤•à¥‡à¥¤ à¤«à¤¼à¥‹à¤¨ à¤®à¥‡à¤‚ à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤¹à¥ˆà¤‚à¥¤",
    en: "{n} could not be sent. They are safe on this phone.",
  },
  "sync.failedHelp": {
    hi: "à¤†à¤ªà¤•à¤¾ à¤¦à¤°à¥à¤œ à¤•à¤¿à¤¯à¤¾ à¤•à¥à¤› à¤­à¥€ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤Ÿà¤¾ à¤¹à¥ˆà¥¤",
    en: "Nothing you recorded has been lost.",
  },
  "sync.sendNow": { hi: "à¤…à¤­à¥€ à¤­à¥‡à¤œà¥‡à¤‚", en: "Send now" },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ time phrases
  "time.justNow": { hi: "à¤…à¤­à¥€", en: "just now" },
  "time.minutes": { hi: "{n} à¤®à¤¿à¤¨à¤Ÿ", en: "{n} minutes" },
  "time.hours": { hi: "{n} à¤˜à¤‚à¤Ÿà¥‡", en: "{n} hours" },
  "time.days": { hi: "{n} à¤¦à¤¿à¤¨", en: "{n} days" },
  "time.weeks": { hi: "{n} à¤¹à¤«à¤¼à¥à¤¤à¥‡", en: "{n} weeks" },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ errors and emptiness
  /** Errors say what happened and what to do. They do not apologise. */
  "error.saveFailed": {
    hi: "à¤¯à¤¹ à¤¸à¤¹à¥‡à¤œà¤¾ à¤¨à¤¹à¥€à¤‚ à¤œà¤¾ à¤¸à¤•à¤¾à¥¤ à¤«à¤¿à¤° à¤¸à¥‡ à¤•à¥‹à¤¶à¤¿à¤¶ à¤•à¤°à¥‡à¤‚à¥¤",
    en: "That did not save. Try again."
  },
  "error.serverUnreachable": {
    hi: "à¤¸à¤°à¥à¤µà¤° à¤¸à¥‡ à¤¬à¤¾à¤¤ à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤ªà¤¾à¤ˆà¥¤ à¤†à¤ªà¤•à¤¾ à¤•à¤¾à¤® à¤«à¤¼à¥‹à¤¨ à¤®à¥‡à¤‚ à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤¹à¥ˆà¥¤",
    en: "Could not reach the server. Your work is safe on this phone.",
  },
  "error.sessionExpired": {
    hi: "à¤«à¤¿à¤° à¤¸à¥‡ à¤²à¥‰à¤—à¤¿à¤¨ à¤•à¤°à¤¨à¤¾ à¤¹à¥‹à¤—à¤¾à¥¤",
    en: "Sign in again to continue.",
  },
} as const;

export type StringKey = keyof typeof STRINGS;
let locale: Locale = "hi";

export function setLocale(l: Locale): void { locale = l; }
export function getLocale(): Locale { return locale; }

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  const str0: string = (entry as Record<string, string>)[locale] ?? (entry as Record<string, string>)["en"] ?? (key as string);
  if (!vars) return str0;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp("{" + k + "}", "g"), String(v)), str0);
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}