import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { refreshAshaVillages } from "../../src/api/asha.ts";
import { listVillages, type VillageRow } from "../../src/db/dao/villages.ts";
import { upsertVisit } from "../../src/db/dao/visits.ts";
import { t } from "../../src/i18n/strings.ts";
import { getSession } from "../../src/state/session.ts";
import { runSync } from "../../src/sync/runner.ts";
import { ink, paper, radius, space, system, touch, type } from "../../src/theme/tokens.ts";
import { Button } from "../../src/ui/Button.tsx";
import { Choice, Field } from "../../src/ui/Field.tsx";
import { Screen } from "../../src/ui/Screen.tsx";

function memberCount(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 50 ? number : null;
}

export default function VisitScreen(): React.ReactNode {
  const router = useRouter();
  const session = getSession();
  const [villages, setVillages] = useState<VillageRow[]>(() =>
    listVillages(session?.districtCode),
  );
  const [villageSearch, setVillageSearch] = useState("");
  const [villageId, setVillageId] = useState<string | null>(null);
  const [household, setHousehold] = useState("");
  const [membersSeen, setMembersSeen] = useState("");
  const [referral, setReferral] = useState<"yes" | "no" | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void refreshAshaVillages().then((refreshed) => {
      if (active && refreshed) setVillages(listVillages(session?.districtCode));
    });
    return () => { active = false; };
  }, [session?.districtCode]);

  const filteredVillages = useMemo(() => {
    const query = villageSearch.trim().toLocaleLowerCase();
    return query === ""
      ? villages
      : villages.filter((village) => village.name.toLocaleLowerCase().includes(query));
  }, [villageSearch, villages]);

  const members = memberCount(membersSeen);
  const canSave = Boolean(villageId && household.trim() && members !== null && referral);

  function onSave(): void {
    if (!session) {
      setError(t("error.sessionExpired"));
      return;
    }
    if (!villageId || !household.trim() || members === null || referral === null) return;
    setError("");
    try {
      upsertVisit({
        householdCode: household.trim(),
        villageId,
        visitedAt: new Date().toISOString(),
        membersSeen: members,
        dangerSigns: [],
        referralMade: referral === "yes",
        findings: {},
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      void runSync("manual");
      Alert.alert("", t("asha.visit.saved"));
      router.back();
    } catch {
      setError(t("error.saveFailed"));
    }
  }

  return (
    <Screen
      title={t("asha.visit.title")}
      footer={<Button label={t("asha.visit.save")} onPress={onSave} disabled={!canSave} />}
    >
      <Text style={styles.section}>{t("asha.visit.village")}</Text>
      {villages.length === 0 ? (
        <Text style={styles.empty}>{t("asha.visit.noVillages")}</Text>
      ) : (
        <>
          <Field
            label={t("asha.visit.villageSearch")}
            value={villageSearch}
            onChange={setVillageSearch}
          />
          <View style={styles.villages} accessibilityRole="radiogroup">
            {filteredVillages.map((village) => {
              const selected = village.villageId === villageId;
              return (
                <Pressable
                  key={village.villageId}
                  onPress={() => setVillageId(village.villageId)}
                  style={[styles.village, selected && styles.villageSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[styles.villageName, selected && styles.villageNameSelected]}>
                    {village.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Field
        label={t("asha.visit.household")}
        value={household}
        onChange={setHousehold}
        help={t("asha.visit.householdHelp")}
      />
      <Field
        label={t("asha.visit.membersSeen")}
        value={membersSeen}
        onChange={setMembersSeen}
        keyboardType="number-pad"
        error={membersSeen !== "" && members === null ? t("asha.visit.membersError") : undefined}
      />
      <Choice
        label={t("asha.visit.referral")}
        value={referral}
        onChange={setReferral}
        options={[
          { value: "yes", label: t("asha.visit.referralYes") },
          { value: "no", label: t("asha.visit.referralNo") },
        ]}
      />
      <Field label={t("asha.visit.notes")} value={notes} onChange={setNotes} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...(type.section as object), color: ink.strong, marginBottom: space.sm },
  empty: { ...(type.body as object), color: ink.body, marginBottom: space.md },
  villages: { gap: space.xs, marginBottom: space.lg },
  village: {
    minHeight: touch.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: paper.rule,
    borderRadius: radius.chip,
    backgroundColor: paper.raised,
  },
  villageSelected: { borderWidth: 2, borderColor: ink.strong, backgroundColor: paper.sunken },
  villageName: { ...(type.body as object), color: ink.body },
  villageNameSelected: { color: ink.strong, fontWeight: "600" },
  error: { ...(type.body as object), color: system.failed, marginTop: space.sm },
});
