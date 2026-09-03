/**
 * FILE: tests/scenarios.test.ts
 * PLAN: IMPLEMENTATION_PLAN.md §6.3, §14.2
 * STATUS: COMPLETE — do not modify. This runs the fixtures; it is not itself a fixture.
 * PHASE: 1
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE REGRESSION NET FOR THE CLINICAL RULES.
 *
 *  Every JSON file in tests/scenarios/ is one encounter and the answer the
 *  system is expected to give. Change a rule and one of these breaks — that is
 *  the entire point of them. Update a fixture deliberately, in the same commit
 *  as the rule change, with the reason in the message and the source recorded
 *  in docs/SAFETY.md.
 *
 *  A fixture that is edited to make a test pass has been deleted, whatever the
 *  diff says.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run with `npm run test:scenarios`, or as part of `npm run verify`.
 *
 * FIXTURE FORMAT
 *
 *   {
 *     "id":       kebab-case, matches the filename
 *     "title":    one line, human
 *     "comment":  WHY this case exists — what breaks if it is removed
 *     "encounter": { patient, symptoms, answers }   // exactly core's Encounter
 *     "expect": {
 *       "tier":          the UrgencyTier
 *       "ruleIds":       red-flag rule ids that must ALL appear; [] means none fired
 *       "requiredTags":  optional — capability tags requiredCapability must derive
 *       "minLevel":      optional — the facility level floor it must derive
 *     }
 *   }
 *
 * Adding a scenario is cheap and is the right response to any bug found in the
 * rules. Write the fixture first, watch it fail, then fix the rule.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateTriage,
  requiredCapability,
  fixedClock,
  RULESET_VERSION,
} from "../packages/core/src/index.ts";
import type { Encounter, UrgencyTier } from "../packages/core/src/index.ts";

interface Scenario {
  id: string;
  title: string;
  comment: string;
  encounter: Encounter;
  expect: {
    tier: UrgencyTier;
    ruleIds: string[];
    requiredTags?: string[];
    minLevel?: number;
  };
}

const dir = join(fileURLToPath(new URL(".", import.meta.url)), "scenarios");

/** Fixed so `evaluatedAt` is reproducible. Nothing in the ruleset reads the clock. */
const deps = { clock: fixedClock("2026-01-01T00:00:00.000Z") };

const scenarios: Scenario[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Scenario);

/** A fixture directory that has quietly emptied would make every test below pass. */
test("the fixture set is not empty", () => {
  assert.ok(scenarios.length >= 10, `expected at least 10 scenarios, found ${scenarios.length}`);
});

test("every fixture has a comment explaining why it exists", () => {
  for (const s of scenarios) {
    assert.ok(s.comment && s.comment.length > 40, `${s.id}: comment is missing or too thin`);
  }
});

for (const s of scenarios) {
  test(`${s.id} — ${s.title}`, () => {
    const result = evaluateTriage(s.encounter, deps);

    assert.equal(result.tier, s.expect.tier, s.comment);
    assert.equal(result.rulesetVersion, RULESET_VERSION);

    const fired = result.redFlagHits.map((h) => h.ruleId);
    for (const id of s.expect.ruleIds) {
      assert.ok(fired.includes(id), `${s.id}: expected rule ${id} to fire, got [${fired.join(", ")}]`);
    }

    if (s.expect.ruleIds.length === 0) {
      assert.equal(fired.length, 0, `${s.id}: no red flag should have fired`);
      assert.equal(result.decisionSource, "CLASSIFIER");
    } else {
      assert.equal(result.decisionSource, "RED_FLAG");
      // GUARDRAIL 8: the classifier must not have run at all.
      assert.equal(
        result.classifier,
        undefined,
        `${s.id}: the classifier ran after a red flag fired`,
      );
    }

    // Every result carries readable advice and the disclaimer. A tier with no
    // explanation is an unexplainable clinical instruction.
    assert.ok(result.advice.length > 0, `${s.id}: a result must always say what to do`);
    assert.ok(result.disclaimer.length > 0, `${s.id}: the disclaimer is never optional`);

    if (s.expect.requiredTags || s.expect.minLevel !== undefined) {
      const req = requiredCapability(s.encounter, result);
      for (const tag of s.expect.requiredTags ?? []) {
        assert.ok(req.requiredTags.includes(tag), `${s.id}: expected capability tag ${tag}`);
      }
      if (s.expect.minLevel !== undefined) {
        assert.ok(
          req.minLevel >= s.expect.minLevel,
          `${s.id}: expected minLevel >= ${s.expect.minLevel}, got ${req.minLevel}`,
        );
      }
    }
  });
}

/**
 * GUARDRAIL 4. The output of this system is an instruction about timing, never a
 * statement about what is wrong. A disease name reaching an advice or label
 * string means somebody wrote advice copy as a diagnosis.
 *
 * Only USER-FACING text is checked. Rule ids are internal identifiers and are
 * allowed to be clinical — `RF_STROKE_SIGNS` is a fine name for a rule and would
 * be an unacceptable thing to put on a screen.
 */
test("no fixture result names a disease in anything a user reads", () => {
  const banned =
    /pneumonia|malaria|dengue|tuberculosis|\btb\b|sepsis|meningitis|eclampsia|stroke|infarction|diabet|cholera|typhoid|asthma/i;
  for (const s of scenarios) {
    const result = evaluateTriage(s.encounter, deps);
    const userFacing = [
      ...result.advice,
      result.disclaimer,
      ...result.redFlagHits.flatMap((h) => [h.label, ...h.advice]),
    ].join(" \n ");
    assert.doesNotMatch(userFacing, banned, `${s.id}: a disease name reached the triage output`);
  }
});
