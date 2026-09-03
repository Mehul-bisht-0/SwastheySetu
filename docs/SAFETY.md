# Safety, provenance and limitations

<!-- PLAN: IMPLEMENTATION_PLAN.md §14.4, GUARDRAIL 10 -->
<!-- STATUS: COMPLETE — update when a rule changes. Do not soften §1. -->

## 1. This system is not clinically validated

**No clinician has reviewed the ruleset in `packages/core/src/triage/ruleset.v1.ts`.**

The rules were derived by a student team from widely published IMNCI and WHO danger-sign
material. Derivation from a published source is not validation. Nobody with clinical
responsibility has confirmed that these thresholds are correct, that the set is complete, or that
it is safe to act on.

This statement is not a disclaimer to be moved into a footnote before a demo. It is displayed at
full size on the app's about screen (`apps/mobile/app/about.tsx`), it is in `README.md`, and it is
the honest answer to "how do you know this is safe?" — which is that we do not, and that the
architecture is built so a clinician could check and correct it in an afternoon.

What the design does provide is *auditability*: every result traces to a named rule with a
readable predicate, and changing a rule changes a test.

## 2. What the system claims, and what it does not

| Claims | Does not claim |
|---|---|
| How soon this person should seek care | What is wrong with them |
| Which nearby facility can handle that level of need | That any facility is currently open |
| When somebody last reported on a facility | That the report is still true |
| That the rules are transparent and deterministic | That the rules are correct |

The system never names a disease. `apps/api/test/triage.test.ts` greps API responses for disease
names, and the wording rules in `apps/mobile/src/i18n/strings.ts` cover the screens.

## 3. Red-flag rule provenance

Ruleset `redflags-v1.0.0`. Fourteen rules, all derived from published IMNCI / WHO danger-sign
lists. **Source column records derivation, not endorsement.**

| Rule id | Tier | Trigger | Derived from |
|---|---|---|---|
| `RF_UNCONSCIOUS` | EMERGENCY | Cannot be woken | IMNCI general danger signs |
| `RF_CONVULSION` | EMERGENCY | Fits or convulsions | IMNCI general danger signs |
| `RF_INFANT_FEVER` | EMERGENCY | Fever, age < 2 months | WHO young-infant danger signs |
| `RF_CHILD_NOT_FEEDING` | EMERGENCY | Not feeding, age < 5 years | IMNCI general danger signs |
| `RF_CHILD_FAST_BREATHING` | EMERGENCY | Fast breathing, age < 5 years | IMNCI pneumonia assessment |
| `RF_UNABLE_TO_DRINK` | EMERGENCY | Answer `DRINKING = unable` | IMNCI dehydration assessment |
| `RF_PREG_BLEEDING` | EMERGENCY | Heavy bleeding in pregnancy | WHO obstetric danger signs |
| `RF_PREG_SEVERE_HEADACHE_VISION` | EMERGENCY | Swelling / blurred vision / severe headache in pregnancy | WHO pre-eclampsia danger signs |
| `RF_STROKE_SIGNS` | EMERGENCY | One-sided weakness or sudden speech difficulty | Standard stroke recognition (FAST) |
| `RF_CHEST_PAIN_ADULT` | EMERGENCY | Chest pain, age ≥ 35 years | Standard cardiac triage practice |
| `RF_HEAVY_BLEEDING_ANY` | EMERGENCY | Heavy bleeding that will not stop | General emergency practice |
| `RF_REDUCED_FETAL_MOVEMENT` | GO_NOW | Reduced fetal movement | WHO antenatal danger signs |
| `RF_BLOODY_DIARRHOEA_CHILD` | GO_NOW | Blood in stool, age < 5 years | IMNCI dysentery assessment |
| `RF_PERSISTENT_VOMIT_CHILD` | GO_NOW | Vomits everything, age < 5 years | IMNCI dehydration assessment |

### Known gaps in the ruleset

Recorded here because an incomplete list is only dangerous when it is presented as complete:

- No rules for severe malnutrition, severe anaemia, snakebite, poisoning, burns or trauma
  severity, all of which are relevant in the target setting.
- No neonatal rules beyond fever — no hypothermia, jaundice or cord infection.
- Chest pain uses a single age threshold with no other cardiac risk input.
- Symptom entry is coded and self-reported. There is no measurement of anything: no respiratory
  rate count, no temperature, no blood pressure.

## 4. Changing a rule

Ruleset versions are pinned into every stored `triage_report`, so an old stored result stays
interpretable.

1. **Never edit a released rule in place.** Add a rule, bump `RULESET_VERSION`.
2. Record the change and its source in the table above.
3. A change that alters an existing outcome **must break a fixture in `tests/scenarios/`.**
   That is the point of the fixtures. Update the fixture deliberately, in the same commit, with
   the reason in the message.

## 5. The safety-biased defaults

Where the system is uncertain it takes the more cautious branch, and each of these is a decision
someone can disagree with:

- **Unknown pregnancy is treated as pregnancy** (`mayBePregnant` returns true for `"unknown"`).
  The cost of the careful branch is a conversation; the cost of the other branch is not.
- **An obstetric emergency requires caesarean capability**, which may route a patient past a
  nearer facility. A referral is a second journey the patient may not survive.
- **The classifier never runs after a red flag fires** (guardrail 8). A scoring model must not be
  able to talk the system down from an emergency.
- **Negative facility evidence outweighs older positive evidence** (§6.7). False reassurance is
  the expensive error.
- **Absence of facility evidence scores 0.1, not 0.** An unverified district hospital should
  still beat a verified sub-centre for an emergency.

## 6. Data handling

The phone stores household codes and coded symptoms. It stores **no patient name, phone number or
address**, because a field phone is lost, shared and resold, and this limits what such a device
can ever leak. Auth tokens live in the platform keystore via `expo-secure-store`, not in the
SQLite file that any backup tool will copy off the device.

No LLM credential exists anywhere in `apps/mobile`; `scripts/check-no-secrets.mjs` fails the build
if one appears.
