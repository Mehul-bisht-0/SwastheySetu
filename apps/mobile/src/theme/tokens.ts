/**
 * FILE: apps/mobile/src/theme/tokens.ts
 * PLAN: IMPLEMENTATION_PLAN.md §12.3
 * STATUS: COMPLETE — do not modify. Every screen reads from here.
 * PHASE: 7
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ONE DESIGN RULE: COLOUR MEANS URGENCY. NOTHING ELSE GETS A HUE.
 *
 *  Cards, headers, lists, buttons, ASHA tools — all ink on paper, no colour.
 *  Hue is spent entirely on the three triage tiers, so a red block on screen
 *  can only ever mean "go now" and can never be mistaken for branding.
 *
 *  The corollary is the important one: FRESHNESS HAS NO COLOUR. A facility
 *  confirmed an hour ago and one confirmed nine days ago differ in ink density
 *  and in words, never in green-versus-grey. If freshness were green, users
 *  would read green as "open", which is precisely the claim the backend cannot
 *  make (GUARDRAIL 3). Removing the hue removes the temptation.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DESIGNED FOR THE ACTUAL DEVICE AND THE ACTUAL PLACE
 *   · A ₹7,000 Android phone with a dim LCD, held in direct sun.
 *   · Possibly a cracked screen. Possibly a hairline crack across the middle.
 *   · One hand, because the other is holding a child or a register.
 *   · A user who may read slowly, or not at all, in either script.
 *
 * WHAT THAT FORCES
 *   · Body text no smaller than 17pt, and never a weight below 400.
 *   · Text contrast at or above 7:1 (WCAG AAA) — 4.5:1 is a laboratory number
 *     and it disappears outdoors.
 *   · Touch targets 56dp minimum, 64dp for anything on an emergency path.
 *   · Never colour alone: every tier also carries a word, a shape and a
 *     position. Roughly one Indian man in twelve has red–green colour vision
 *     deficiency, and this app has exactly one red thing that matters.
 */

// ─────────────────────────────────────────────────────────────── palette

/**
 * Ink and paper. The paper is a warm off-white rather than #FFF because a pure
 * white panel at full brightness in sunlight is genuinely painful to look at,
 * and the warmth reads as the register paper this app replaces.
 */
export const paper = {
  /** App background. */
  base: "#FBFAF7",
  /** Cards and raised surfaces — lifted by being lighter than the base. */
  raised: "#FFFFFF",
  /** Pressed state, and the fill of a section that is only context. */
  sunken: "#F1EFEA",
  /** Hairlines. The only divider colour; do not introduce a second. */
  rule: "#DCD8D0",
} as const;

export const ink = {
  /** Headlines and anything a user must read. 15.8:1 on paper.base. */
  strong: "#171512",
  /** Body text. 9.9:1. */
  body: "#3A3630",
  /** Secondary text — timestamps, distances, helper lines. 5.4:1. Never used
   *  for anything a user must act on. */
  muted: "#6B655C",
  /** On a filled tier block. */
  inverse: "#FFFFFF",
} as const;

/**
 * TIER COLOURS — the only hues in the application.
 *
 * The four keys are exactly `UrgencyTier` from `packages/core/src/triage/types.ts`.
 * That union is the single source of truth for the whole system: migration
 * `007_triage.sql` constrains a column to it and `packages/contracts` validates
 * against it. If you add a tier here and not there, the phone will render a
 * verdict the server will refuse to store.
 *
 * `fill` is for a solid block with `onFill` text; `tint` is a background behind
 * `accent` text. Both directions are AAA. Each tier also has a `mark`, a shape
 * shown alongside the colour so the tier survives greyscale and colour vision
 * deficiency.
 *
 * A NOTE ON THE TWO REDS. Every fill here has to sit at or below 0.10 relative
 * luminance to keep white text at 7:1, which squeezes all four into a narrow
 * band of greyscale — EMERGENCY and GO_NOW are nearly identical with the colour
 * taken out. That is why `mark` is not decoration and is never optional: the
 * shape, not the hue, is what separates the top two tiers for a user with
 * red–green colour vision deficiency or a washed-out screen in sunlight.
 */
export const tier = {
  EMERGENCY: {
    fill: "#8F1D14",
    onFill: "#FFFFFF",
    tint: "#F7DCD9",
    accent: "#7A1810",
    /** Filled octagon — the stop-sign silhouette, legible at a glance. The only
     *  octagon in the app, and reached only through a red-flag rule. */
    mark: "octagon",
  },
  GO_NOW: {
    fill: "#8E3607",
    onFill: "#FFFFFF",
    tint: "#F8E2D2",
    accent: "#7B2F06",
    /** Upward triangle — the warning silhouette. Same urgency family as the
     *  octagon, unmistakably not the same shape. */
    mark: "triangle",
  },
  PHC_SOON: {
    fill: "#7A4A00",
    onFill: "#FFFFFF",
    tint: "#FAEBC8",
    accent: "#6B4100",
    /** Half-filled circle — "partly urgent", and clearly not the octagon. */
    mark: "half",
  },
  SELF_CARE: {
    fill: "#13563A",
    onFill: "#FFFFFF",
    tint: "#D9EDE2",
    accent: "#0F4830",
    /** Hollow circle — the lightest mark for the lightest tier. */
    mark: "ring",
  },
} as const;

export type TierKey = keyof typeof tier;

/**
 * FRESHNESS — deliberately hueless. See the banner at the top of this file.
 *
 * The five keys are exactly `FreshnessBand` from
 * `packages/core/src/facilities/types.ts`. The engine produces them; this file
 * only decides how they look. Do not invent a friendlier set of names here —
 * a second vocabulary is how the phone starts describing a facility differently
 * from the server that ranked it.
 *
 * The bands differ by ink density, mark and border treatment, which maps
 * naturally onto "how much evidence do we have": solid, then lighter, then
 * hollow, then dashed-and-empty. `border` is a react-native borderStyle value.
 * `mark` is the glyph drawn before the text — never a tick, never a cross,
 * never a traffic light (see FreshnessChip.tsx).
 *
 * REPORTED_CLOSED is the one band that is *negative* evidence rather than old
 * evidence, so it is drawn at full ink strength with a bar: it is a thing
 * somebody actually observed, and it is the band a user most needs to notice.
 * It still gets no hue. Painting it red would put it in the same visual
 * language as a clinical emergency, and "the pharmacy was shut on Tuesday" is
 * not that.
 */
export const freshness = {
  FRESH: { ink: ink.strong, dot: ink.strong, mark: "dot", border: "solid", fill: paper.sunken },
  AGING: { ink: ink.body, dot: ink.body, mark: "dot", border: "solid", fill: paper.raised },
  STALE: { ink: ink.muted, dot: ink.muted, mark: "hollow", border: "solid", fill: paper.raised },
  UNKNOWN: { ink: ink.muted, dot: "transparent", mark: "none", border: "dashed", fill: paper.raised },
  REPORTED_CLOSED: { ink: ink.strong, dot: ink.strong, mark: "bar", border: "solid", fill: paper.sunken },
} as const;

/** Focus ring and the one non-tier accent, used only for the active step in a
 *  question flow. Deep indigo: distinct from all three tiers in greyscale too. */
export const accent = "#1F3A6E";

/** Status colours that are not clinical: sync and connectivity. Greyscale on
 *  purpose — being offline is the normal state here, not an error, and must
 *  never be painted the same red as a medical emergency. */
export const system = {
  offline: ink.muted,
  syncing: ink.body,
  synced: ink.body,
  /** The single non-clinical error colour, for "we could not save that". */
  failed: "#8F1D14",
} as const;

// ─────────────────────────────────────────────────────────── typography

/**
 * ONE FAMILY, BOTH SCRIPTS.
 *
 * Noto Sans and Noto Sans Devanagari are metric companions and both ship with
 * Android, so Hindi and English lines have matching colour and weight and the
 * bundle carries no font files. On iOS the system font substitutes cleanly.
 * Do not add a display face: a second family costs bundle size on a device that
 * has none to spare, and the hierarchy below is doing that job already.
 *
 * The scale is deliberately sparse — a very large step from `tierHeadline` down
 * to `body`, with almost nothing in between. Sparse scales read as decisive;
 * a nine-step ramp reads as indecision and is unreadable at arm's length.
 */
export const font = {
  family: "Noto Sans",
  familyDevanagari: "Noto Sans Devanagari",
} as const;

export const type = {
  /** The tier verdict. The largest thing on any screen, by a long way. */
  tierHeadline: { fontSize: 34, lineHeight: 40, fontWeight: "700" },
  /** Screen titles and facility names. */
  title: { fontSize: 24, lineHeight: 31, fontWeight: "600" },
  /** Section heads inside a card. */
  section: { fontSize: 19, lineHeight: 26, fontWeight: "600" },
  /** Default. Never go below this for content a user must read. */
  body: { fontSize: 17, lineHeight: 26, fontWeight: "400" },
  /** Button text — same size as body, heavier, because it is an action. */
  action: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  /** Distances, timestamps, counts. The floor. Nothing is smaller than this. */
  meta: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
} as const;

/** Devanagari sits taller than Latin in the same point size. Multiply the
 *  lineHeight by this when the string is Hindi, or descenders collide. */
export const DEVANAGARI_LINE_HEIGHT_FACTOR = 1.12;

/** Cap body copy at roughly this many characters per line. Hindi runs shorter
 *  than English at the same measure, hence the low number. */
export const MAX_LINE_CHARS = 40;

// ────────────────────────────────────────────────────── space and shape

/** 4pt base grid. Layout uses the 8s; only optical nudges use `xs`. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Radius encodes hierarchy rather than decorating: flat for full-bleed, small
 *  for chips, larger for cards. Nothing is a pill — pills read as a consumer
 *  app, and this is a public health tool people are asked to trust. */
export const radius = { none: 0, chip: 4, card: 12 } as const;

export const touch = {
  /** Absolute floor for anything tappable. Above the 48dp Material minimum
   *  because these screens get used with wet or work-hardened fingers. */
  min: 56,
  /** Emergency actions: call, navigate, "go now". */
  emergency: 64,
  /** Symptom tiles in the citizen picker — two per row on a 360dp screen. */
  tile: 96,
} as const;

/**
 * ELEVATION — one shadow, used once per screen at most.
 *
 * A shadow under every card is the SaaS-template tell, and on a cheap GPU each
 * one costs a frame. Cards separate with a hairline (`paper.rule`); the shadow
 * is reserved for something genuinely floating above the content, like the
 * fixed action bar at the bottom of the triage result.
 */
export const elevation = {
  none: {},
  lifted: {
    shadowColor: "#171512",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
} as const;

/** Motion answers an action; it never announces a screen. Entrance animations
 *  on every card are the generated-UI tell and they cost frames on a low-end
 *  device. Anything longer than this reads as lag on a slow phone. */
export const motion = { fast: 120, base: 180 } as const;

// ───────────────────────────────────────────────────────────── helpers

export function tierStyle(t: TierKey) {
  return tier[t];
}

/** Guarantees a hit area without forcing the visual box to grow. Use on any
 *  control whose drawn size is under `touch.min`. */
export function hitSlop(drawnSize: number) {
  const pad = Math.max(0, (touch.min - drawnSize) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}
