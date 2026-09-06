/**
 * FILE: apps/mobile/src/i18n/strings.ts
 * PLAN: IMPLEMENTATION_PLAN.md §12.4
 * STATUS: COMPLETE — do not modify without reading the WORDING RULES below.
 * PHASE: 7
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE COPY IS PART OF THE SAFETY LAYER, NOT DECORATION.
 *
 *  Most of the ways this project can hurt someone are sentences, not bugs. A
 *  correct tier presented as "You have pneumonia" is a harmful screen produced
 *  by working code. Treat every string here with the care you would give the
 *  ruleset.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WORDING RULES — a new string must satisfy all five.
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
 *   5. HINDI IS NOT A TRANSLATION OF THE ENGLISH — it is the primary text for
 *      most users of this app. Where a literal translation would be stilted,
 *      write the Hindi first and let the English follow it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO USE
 *
 *   import { t, setLocale } from "@/i18n/strings";
 *   <Text>{t("triage.emergency.headline")}</Text>
 *
 *   The locale is a module-level variable, set once from `app/_layout.tsx` at
 *   boot and currently fixed to "en". Reading the device locale and persisting a
 *   user's choice to SQLite (`app_meta`) are not built yet; until they are,
 *   changing the default means editing the two lines noted beside `let locale`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENT (the small part of this file that is not data)
 *
 *   1. let locale: Locale = "en";
 *   2. export function setLocale(l: Locale): void
 *   3. export function getLocale(): Locale
 *   4. export function t(key: StringKey, vars?: Record<string, string | number>): string
 *        Look up STRINGS[key][locale]. Fall back to "en" if a key is missing in
 *        Hindi — a missing string must render the English, never the raw key
 *        and never an empty box.
 *        Substitute {name} style placeholders from `vars`.
 *   5. export function plural(n: number, one: string, many: string): string
 */

export type Locale = "hi" | "en";

/** Every user-visible string in the app. Add here, never inline in a screen. */
export const STRINGS = {
  // ───────────────────────────────────────────────────────── shell
  "app.name": { hi: "स्वास्थ्यसेतु", en: "SwasthyaSetu" },
  "app.tagline": {
    hi: "बिना इंटरनेट के भी काम करता है",
    en: "Works without internet",
  },

  "role.title": { hi: "आप कौन हैं?", en: "Who is using this phone?" },
  "role.citizen": { hi: "मैं मरीज़ या परिजन हूँ", en: "I am a patient or family member" },
  "role.asha": { hi: "मैं आशा कार्यकर्ता हूँ", en: "I am an ASHA worker" },

  "net.offline": { hi: "ऑफ़लाइन", en: "Offline" },
  "net.offlineDetail": {
    hi: "इंटरनेट नहीं है। सलाह फिर भी मिलेगी।",
    en: "No internet. Advice still works.",
  },
  "net.online": { hi: "ऑनलाइन", en: "Online" },

  "action.back": { hi: "पीछे", en: "Back" },
  "action.next": { hi: "आगे", en: "Next" },
  "action.retry": { hi: "फिर कोशिश करें", en: "Try again" },
  "action.startOver": { hi: "नए सिरे से शुरू करें", en: "Start over" },

  // ─────────────────────────────────────────────── in-app voice guide / IVR
  "ivr.entry": { hi: "आवाज़ सुनकर जाँचें", en: "Use the voice guide" },
  "ivr.title": { hi: "आवाज़ से लक्षण जाँचें", en: "Voice-guided symptom check" },
  "ivr.language.title": { hi: "आवाज़ की भाषा चुनें", en: "Choose the voice language" },
  "ivr.language.help": {
    hi: "हिंदी के लिए 1 दबाएँ। अंग्रेज़ी के लिए 2 दबाएँ।",
    en: "Press 1 for Hindi. Press 2 for English.",
  },
  "ivr.language.spoken": {
    hi: "Choose a voice language. Press 1 for Hindi. Press 2 for English. आवाज़ की भाषा चुनें। हिंदी के लिए एक दबाएँ। अंग्रेज़ी के लिए दो दबाएँ।",
    en: "Choose a voice language. Press 1 for Hindi. Press 2 for English. आवाज़ की भाषा चुनें। हिंदी के लिए एक दबाएँ। अंग्रेज़ी के लिए दो दबाएँ।",
  },
  "ivr.language.hindi": { hi: "हिंदी", en: "हिंदी" },
  "ivr.language.english": { hi: "English", en: "English" },
  "ivr.intro.title": { hi: "शुरू करने से पहले", en: "Before you start" },
  "ivr.intro.body": {
    hi: "यह गाइड सवाल बोलकर सुनाएगी। जवाब देने के लिए स्क्रीन पर नंबर दबाएँ।",
    en: "This guide reads each question aloud. Tap a number on the screen to answer.",
  },
  "ivr.intro.safety": {
    hi: "अगर मरीज़ जाग नहीं रहा, शरीर में झटके आ रहे हैं, साँस लेने में बहुत कठिनाई है या बहुत खून बह रहा है, तो यह जाँच पूरी होने का इंतज़ार न करें। अभी अस्पताल जाएँ।",
    en: "Do not wait for this check if the person is not waking up, having body jerks, struggling to breathe, or bleeding heavily. Go to a hospital now.",
  },
  "ivr.start": { hi: "जाँच शुरू करें", en: "Start the check" },
  "ivr.startHint": { hi: "शुरू करने के लिए 1 दबाएँ।", en: "Press 1 to start." },
  "ivr.exit": { hi: "बाहर जाएँ", en: "Exit voice guide" },
  "ivr.voice.off": { hi: "आवाज़ बंद करें", en: "Turn voice off" },
  "ivr.voice.on": { hi: "आवाज़ चालू करें", en: "Turn voice on" },
  "ivr.voice.failed": {
    hi: "आवाज़ नहीं चली। सवाल पढ़ें और एक नंबर दबाएँ।",
    en: "The voice could not play. Read the question and tap a number.",
  },
  "ivr.age.title": { hi: "मरीज़ की उम्र लिखें", en: "Enter the person's age" },
  "ivr.age.help": {
    hi: "उम्र लिखें और साल या महीने चुनें।",
    en: "Enter the age and choose years or months.",
  },
  "ivr.age.years": { hi: "साल", en: "Years" },
  "ivr.age.months": { hi: "महीने", en: "Months" },
  "ivr.age.yearsSelected": { hi: "उम्र साल में चुनी गई है।", en: "Age is set to years." },
  "ivr.age.monthsSelected": { hi: "उम्र महीनों में चुनी गई है।", en: "Age is set to months." },
  "ivr.age.invalid": {
    hi: "0 से 120 साल तक की उम्र लिखें या उतने ही महीने लिखें।",
    en: "Enter an age from 0 to 120 years, or the same age in months.",
  },
  "ivr.sex.title": { hi: "मरीज़ का लिंग क्या है?", en: "What is the person's sex?" },
  "ivr.sex.hint": {
    hi: "महिला के लिए 1 दबाएँ। पुरुष के लिए 2 दबाएँ। पता न हो तो 3 दबाएँ।",
    en: "Press 1 for female. Press 2 for male. Press 3 if you are not sure.",
  },
  "ivr.sex.unknown": { hi: "पता नहीं", en: "Not sure" },
  "ivr.pregnancy.title": { hi: "क्या मरीज़ गर्भवती हैं?", en: "Is the person pregnant?" },
  "ivr.threeChoiceHint": {
    hi: "हाँ के लिए 1 दबाएँ। नहीं के लिए 2 दबाएँ। पता न हो तो 3 दबाएँ।",
    en: "Press 1 for yes. Press 2 for no. Press 3 if you are not sure.",
  },
  "ivr.answerHint": {
    hi: "हाँ के लिए 1 दबाएँ। नहीं के लिए 2 दबाएँ। सवाल फिर सुनने के लिए 3 दबाएँ।",
    en: "Press 1 for yes. Press 2 for no. Press 3 to hear the question again.",
  },
  "ivr.progress": { hi: "सवाल {current}, कुल {total}", en: "Question {current} of {total}" },
  "ivr.yes": { hi: "हाँ", en: "Yes" },
  "ivr.no": { hi: "नहीं", en: "No" },
  "ivr.repeat": { hi: "सवाल फिर सुनें", en: "Hear the question again" },
  "ivr.result.repeat": { hi: "सलाह फिर सुनें", en: "Hear the advice again" },
  "ivr.saving": { hi: "आपका जवाब फ़ोन में सहेजा जा रहा है।", en: "Your answer is being saved on this phone." },
  "ivr.noSymptoms.title": { hi: "कोई लक्षण नहीं चुना गया", en: "No listed symptom was selected" },
  "ivr.noSymptoms.body": {
    hi: "यह गाइड जल्दी दिखाने की सलाह नहीं दे सकती। चिंता हो तो स्वास्थ्य कार्यकर्ता से बात करें।",
    en: "This guide cannot give an urgency result. Speak to a health worker if you are worried.",
  },

  "ivr.symptom.UNCONSCIOUS": { hi: "क्या मरीज़ जाग नहीं रहा है?", en: "Is the person not waking up?" },
  "ivr.symptom.CONVULSION": { hi: "क्या मरीज़ के शरीर में झटके आ रहे हैं?", en: "Is the person's body jerking in a fit?" },
  "ivr.symptom.FAST_BREATHING": { hi: "क्या साँस तेज़ चल रही है या लेने में कठिनाई है?", en: "Is the person breathing fast or struggling to breathe?" },
  "ivr.symptom.BLEEDING_HEAVY": { hi: "क्या बहुत खून बह रहा है?", en: "Is the person bleeding heavily?" },
  "ivr.symptom.NOT_FEEDING": { hi: "क्या मरीज़ खा या पी नहीं पा रहा है?", en: "Is the person unable to eat or drink?" },
  "ivr.symptom.CHEST_PAIN": { hi: "क्या सीने में दर्द है?", en: "Does the person have chest pain?" },
  "ivr.symptom.WEAKNESS_ONE_SIDE": { hi: "क्या शरीर के एक तरफ़ अचानक कमज़ोरी आई है?", en: "Did weakness start suddenly on one side of the body?" },
  "ivr.symptom.DIFFICULTY_SPEAKING": { hi: "क्या बोलने में अचानक कठिनाई हुई है?", en: "Did difficulty speaking start suddenly?" },
  "ivr.symptom.SWELLING_FACE_HANDS": { hi: "क्या चेहरे या हाथों में सूजन है?", en: "Is there swelling of the face or hands?" },
  "ivr.symptom.BLURRED_VISION": { hi: "क्या धुँधला दिखाई दे रहा है?", en: "Is the person's vision blurred?" },
  "ivr.symptom.REDUCED_FETAL_MOVEMENT": { hi: "क्या गर्भ में बच्चा पहले से कम हिल रहा है?", en: "Is the baby in the womb moving less than before?" },
  "ivr.symptom.SEVERE_ABDOMINAL_PAIN": { hi: "क्या पेट में बहुत तेज़ दर्द है?", en: "Does the person have severe stomach pain?" },
  "ivr.symptom.FEVER": { hi: "क्या बुखार है?", en: "Does the person have a fever?" },
  "ivr.symptom.COUGH": { hi: "क्या खाँसी है?", en: "Does the person have a cough?" },
  "ivr.symptom.DIARRHOEA": { hi: "क्या पतले दस्त हो रहे हैं?", en: "Is the person passing loose stools?" },
  "ivr.symptom.VOMITING": { hi: "क्या उल्टी हो रही है?", en: "Is the person vomiting?" },
  "ivr.symptom.RASH": { hi: "क्या त्वचा पर दाने या चकत्ते हैं?", en: "Does the person have a rash or spots?" },
  "ivr.symptom.INJURY": { hi: "क्या कोई चोट लगी है?", en: "Does the person have an injury?" },
  "ivr.symptom.BURNING_URINATION": { hi: "क्या पेशाब करते समय जलन है?", en: "Does it burn when the person urinates?" },

  // ───────────────────────────────────────────────────── symptom entry
  "symptoms.title": { hi: "क्या तकलीफ़ है?", en: "What is wrong?" },
  "symptoms.help": {
    hi: "जो भी लागू हो, सब चुनें।",
    en: "Choose everything that applies.",
  },
  "symptoms.none": { hi: "कुछ नहीं चुना गया", en: "Nothing chosen yet" },
  "symptoms.continue": { hi: "आगे बढ़ें", en: "Continue" },

  "patient.title": { hi: "मरीज़ के बारे में", en: "About the patient" },
  "patient.age": { hi: "उम्र", en: "Age" },
  "patient.ageYears": { hi: "साल", en: "years" },
  "patient.ageMonths": { hi: "महीने", en: "months" },
  "patient.sex": { hi: "लिंग", en: "Sex" },
  "patient.female": { hi: "महिला", en: "Female" },
  "patient.male": { hi: "पुरुष", en: "Male" },
  "patient.pregnancy": { hi: "क्या गर्भवती हैं?", en: "Pregnant?" },
  "patient.pregnancyYes": { hi: "हाँ", en: "Yes" },
  "patient.pregnancyNo": { hi: "नहीं", en: "No" },
  "patient.pregnancyUnknown": { hi: "पता नहीं", en: "Not sure" },
  /** RULE 3 in action: "Not sure" is a safe answer, so say so. */
  "patient.pregnancyUnknownHelp": {
    hi: "पता न होना ठीक है। हम सावधानी बरतेंगे।",
    en: "Not knowing is fine. We will take the careful option.",
  },

  // ────────────────────────────────────────────────────────── result
  // One headline/support pair per `UrgencyTier` in packages/core. The four read
  // as a ladder of *when*, never of *what*: now, today, this week, at home.
  // Nothing in this block names a body part or a disease (RULE 1).
  "triage.EMERGENCY.headline": { hi: "अभी अस्पताल जाइए", en: "Go to hospital now" },
  "triage.EMERGENCY.support": {
    hi: "देर न करें। रास्ते में किसी को साथ रखें।",
    en: "Do not wait. Take someone with you.",
  },
  "triage.GO_NOW.headline": { hi: "आज ही दिखाइए, देर न करें", en: "Get seen today, without waiting" },
  "triage.GO_NOW.support": {
    hi: "आज ही स्वास्थ्य केंद्र पहुँचें। कल तक इंतज़ार न करें।",
    en: "Reach a health centre today. Do not wait until tomorrow.",
  },
  "triage.PHC_SOON.headline": { hi: "एक-दो दिन में दिखाइए", en: "See a health worker in a day or two" },
  "triage.PHC_SOON.support": {
    hi: "एक-दो दिन में स्वास्थ्य केंद्र जाएँ। हालत बिगड़े तो तुरंत जाएँ।",
    en: "Go to the health centre within a day or two. Go sooner if it gets worse.",
  },
  "triage.SELF_CARE.headline": { hi: "घर पर देखभाल करें", en: "Care for this at home" },
  "triage.SELF_CARE.support": {
    hi: "घर पर ध्यान रखें और नीचे लिखे लक्षणों पर नज़र रखें।",
    en: "Look after this at home and watch for the signs below.",
  },

  "triage.whyThis": { hi: "ऐसा क्यों बताया गया", en: "Why this advice" },
  "triage.watchFor": { hi: "इन बातों पर नज़र रखें", en: "Watch for these" },
  "triage.watchForHelp": {
    hi: "इनमें से कुछ भी दिखे तो तुरंत अस्पताल जाएँ।",
    en: "If any of these appear, go to a hospital straight away.",
  },
  "triage.findCare": { hi: "पास का केंद्र देखें", en: "Find care nearby" },

  /** RULE 1. This string appears on every result screen without exception.
   *  It is short on purpose — a paragraph of legal text gets scrolled past. */
  "triage.disclaimer": {
    hi: "यह जाँच या इलाज नहीं है। यह सिर्फ़ बताता है कि कितनी जल्दी दिखाना है।",
    en: "This is not a diagnosis. It only tells you how soon to get help.",
  },

  "triage.offlineNote": {
    hi: "यह सलाह इसी फ़ोन पर तय हुई। इंटरनेट की ज़रूरत नहीं थी।",
    en: "This advice was worked out on your phone. No internet was needed.",
  },

  // ─────────────────────────────────────────────────────── facilities
  "facilities.title": { hi: "पास के स्वास्थ्य केंद्र", en: "Health facilities nearby" },
  "facilities.empty": {
    hi: "इस दायरे में कोई केंद्र दर्ज नहीं है।",
    en: "No facility is recorded in this area.",
  },
  "facilities.emptyAction": {
    hi: "दायरा बढ़ाकर देखें।",
    en: "Try a wider search.",
  },
  "facilities.distance": { hi: "{km} किमी दूर", en: "{km} km away" },
  "facilities.call": { hi: "फ़ोन करें", en: "Call" },
  "facilities.directions": { hi: "रास्ता देखें", en: "Directions" },

  /** RULE 2 — the most carefully worded strings in the application.
   *  Every one is about the report, never about the building.
   *  The five keys are exactly `FreshnessBand` from packages/core, so a chip can
   *  be rendered as t(`freshness.${band}`) with no mapping table in between. */
  "freshness.FRESH": { hi: "{ago} पहले पुष्टि हुई", en: "Confirmed {ago} ago" },
  "freshness.AGING": { hi: "पिछली पुष्टि {ago} पहले", en: "Last confirmed {ago} ago" },
  "freshness.STALE": {
    hi: "{ago} से कोई ख़बर नहीं",
    en: "No report for {ago}",
  },
  "freshness.UNKNOWN": {
    hi: "अभी तक किसी ने पुष्टि नहीं की",
    en: "Nobody has confirmed this yet",
  },
  /** Negative evidence, and the only freshness string in the past tense about a
   *  person rather than about our records. Somebody went and found it shut; say
   *  so plainly, and do not soften it into "may be unavailable". */
  "freshness.REPORTED_CLOSED": {
    hi: "{ago} पहले किसी ने बताया कि यहाँ सेवा नहीं मिली",
    en: "Someone reported {ago} ago that this was not working",
  },
  "freshness.explain": {
    hi: "यह बताता है कि आख़िरी ख़बर कब आई थी — यह नहीं कि अभी खुला है।",
    en: "This says when we last heard, not whether it is open right now.",
  },
  "freshness.callFirst": {
    hi: "जाने से पहले फ़ोन कर लें।",
    en: "Call before you set out.",
  },

  "facilities.fallbackApplied": {
    hi: "पूरी सुविधा वाला कोई केंद्र पास में नहीं मिला। नज़दीकी विकल्प दिखा रहे हैं।",
    en: "No nearby facility has everything needed. Showing the closest options.",
  },
  "facilities.missing": { hi: "यहाँ नहीं है: {tags}", en: "Not available here: {tags}" },

  "signal.title": { hi: "यहाँ की जानकारी दें", en: "Report what you found" },
  "signal.confirmed": { hi: "सेवा मिली", en: "The service was available" },
  "signal.unavailable": { hi: "सेवा नहीं मिली", en: "The service was not available" },
  "signal.thanks": {
    hi: "धन्यवाद। यह जानकारी बाकी लोगों को दिखेगी।",
    en: "Thank you. Others will see this.",
  },

  // ──────────────────────────────────────────────────────────── ASHA
  "asha.login.title": { hi: "आशा कार्यकर्ता लॉगिन", en: "ASHA worker sign in" },
  "asha.login.phone": { hi: "मोबाइल नंबर", en: "Mobile number" },
  "asha.login.password": { hi: "पासवर्ड", en: "Password" },
  "asha.login.submit": { hi: "लॉगिन करें", en: "Sign in" },
  /** One message for every failure mode — see apps/api/src/modules/auth. */
  "asha.login.failed": {
    hi: "नंबर या पासवर्ड ग़लत है।",
    en: "That number and password do not match.",
  },
  "asha.login.offline": {
    hi: "पहली बार लॉगिन के लिए इंटरनेट चाहिए। उसके बाद ज़रूरत नहीं।",
    en: "The first sign in needs internet. After that it does not.",
  },

  "asha.home.title": { hi: "आज का काम", en: "Today" },
  "asha.home.newVisit": { hi: "नया घर दर्ज करें", en: "Record a visit" },
  "asha.home.newTriage": { hi: "लक्षण जाँचें", en: "Check symptoms" },
  "asha.home.queue": { hi: "भेजना बाकी", en: "Waiting to send" },
  "asha.home.recentVisits": { hi: "हाल के दौरे", en: "Recent visits" },
  "asha.home.noVisits": { hi: "अभी कोई दौरा दर्ज नहीं है।", en: "No visits recorded yet." },
  "asha.home.pending": { hi: "फ़ोन में सुरक्षित — भेजना बाकी", en: "Safe on phone — waiting to send" },
  "asha.home.sent": { hi: "भेज दिया गया", en: "Sent" },
  "asha.home.conflict": { hi: "जाँच की ज़रूरत है", en: "Needs review" },

  "asha.visit.title": { hi: "घर का दौरा", en: "Household visit" },
  "asha.visit.village": { hi: "गाँव चुनें", en: "Choose village" },
  "asha.visit.villageSearch": { hi: "गाँव खोजें", en: "Search villages" },
  "asha.visit.noVillages": {
    hi: "इस फ़ोन में गाँवों की सूची नहीं है। इंटरनेट चालू करके फिर कोशिश करें।",
    en: "No village list is stored on this phone. Connect to the internet and try again.",
  },
  "asha.visit.household": { hi: "घर संख्या", en: "Household number" },
  /** Registers hold household codes, never names. Say why, once, here. */
  "asha.visit.householdHelp": {
    hi: "रजिस्टर वाला नंबर लिखें, नाम नहीं।",
    en: "Use the register number, not a name.",
  },
  "asha.visit.membersSeen": { hi: "कितने सदस्यों को देखा?", en: "How many members did you see?" },
  "asha.visit.membersError": { hi: "0 से 50 तक संख्या लिखें।", en: "Enter a number from 0 to 50." },
  "asha.visit.referral": { hi: "क्या रेफ़रल दिया?", en: "Did you make a referral?" },
  "asha.visit.referralYes": { hi: "हाँ", en: "Yes" },
  "asha.visit.referralNo": { hi: "नहीं", en: "No" },
  "asha.visit.notes": { hi: "टिप्पणी", en: "Notes" },
  "asha.visit.save": { hi: "सहेजें", en: "Save" },
  "asha.visit.saved": {
    hi: "फ़ोन में सहेज लिया। इंटरनेट आते ही अपने आप भेज देंगे।",
    en: "Saved on this phone. It will send itself when you have internet.",
  },

  // ──────────────────────────────────────────────────────────── sync
  "sync.queued": { hi: "{n} भेजना बाकी", en: "{n} waiting to send" },
  "sync.empty": { hi: "सब कुछ भेजा जा चुका है", en: "Everything has been sent" },
  "sync.sending": { hi: "भेजा जा रहा है…", en: "Sending…" },
  "sync.sentAt": { hi: "आख़िरी बार भेजा: {when}", en: "Last sent {when}" },
  "sync.failed": {
    hi: "{n} नहीं भेजे जा सके। फ़ोन में सुरक्षित हैं।",
    en: "{n} could not be sent. They are safe on this phone.",
  },
  "sync.failedHelp": {
    hi: "आपका दर्ज किया कुछ भी नहीं मिटा है।",
    en: "Nothing you recorded has been lost.",
  },
  "sync.sendNow": { hi: "अभी भेजें", en: "Send now" },

  // ──────────────────────────────────────────────────── time phrases
  "time.justNow": { hi: "अभी", en: "just now" },
  "time.minutes": { hi: "{n} मिनट", en: "{n} minutes" },
  "time.hours": { hi: "{n} घंटे", en: "{n} hours" },
  "time.days": { hi: "{n} दिन", en: "{n} days" },
  "time.weeks": { hi: "{n} हफ़्ते", en: "{n} weeks" },

  // ────────────────────────────────────────────── errors and emptiness
  /** Errors say what happened and what to do. They do not apologise. */
  "error.saveFailed": {
    hi: "यह सहेजा नहीं जा सका। फिर से कोशिश करें।",
    en: "That did not save. Try again."
  },
  "error.serverUnreachable": {
    hi: "सर्वर से बात नहीं हो पाई। आपका काम फ़ोन में सुरक्षित है।",
    en: "Could not reach the server. Your work is safe on this phone.",
  },
  "error.sessionExpired": {
    hi: "फिर से लॉगिन करना होगा।",
    en: "Sign in again to continue.",
  },
} as const;

export type StringKey = keyof typeof STRINGS;
// The app-wide default. `app/_layout.tsx` sets this again at boot; change both,
// or neither, so a screen rendered before boot finishes matches the rest.
let locale: Locale = "en";

export function setLocale(l: Locale): void { locale = l; }
export function getLocale(): Locale { return locale; }

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  // TierBanner and FreshnessChip build keys by concatenation and cast to
  // StringKey, so an unexpected tier or band reaches here as a missing key.
  // Indexing it unguarded threw and took the whole screen down; the contract at
  // the top of this file is that a missing string degrades, never crashes.
  const entry = STRINGS[key] as Record<string, string> | undefined;
  if (!entry) return key as string;
  const str0: string = entry[locale] ?? entry["en"] ?? (key as string);
  if (!vars) return str0;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp("{" + k + "}", "g"), String(v)), str0);
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
