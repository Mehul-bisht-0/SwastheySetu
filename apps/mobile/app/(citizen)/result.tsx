import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { TierBanner } from "../../src/ui/TierBanner.tsx";
import { getReport } from "../../src/db/dao/reports.ts";
import { RULES } from "@swasthyasetu/core";
import { t } from "../../src/i18n/strings.ts";
import { ink, type, space, system } from "../../src/theme/tokens.ts";
import type { TierKey } from "../../src/theme/tokens.ts";
import type { ReportRow } from "../../src/db/dao/reports.ts";

export default function ResultScreen(): React.ReactNode {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [report, setReport] = useState<ReportRow | null>(null);

  useEffect(() => {
    if (reportId) setReport(getReport(reportId));
  }, [reportId]);

  if (!report) return <Screen><Text style={{ color: ink.muted, textAlign: "center" }}>Loading...</Text></Screen>;

  const { tier, result } = report;
  const tierKey = tier as TierKey;
  const showFacilities = tierKey !== "SELF_CARE";

  // SELF_CARE danger-sign list: all red-flag labels except those that fired
  const dangerSigns: string[] = tierKey === "SELF_CARE"
    ? RULES.filter((r) => r.tier === "EMERGENCY" || r.tier === "GO_NOW").map((r) => r.label)
    : [];

  return (
    <ScrollView>
      <TierBanner tier={tierKey} />
      <View style={styles.body}>
        {result.redFlagHits.length > 0 && (
          <Card heading={t("triage.whyThis")}>
            {result.advice.map((r, i) => (
              <Text key={i} style={styles.reason}>{"\u2022 " + r}</Text>
            ))}
          </Card>
        )}
        {tierKey === "SELF_CARE" && dangerSigns.length > 0 && (
          <Card heading={t("triage.watchFor")}>
            <Text style={styles.watchHelp}>{t("triage.watchForHelp")}</Text>
            {dangerSigns.slice(0, 5).map((s, i) => (
              <Text key={i} style={[styles.dangerSign, { color: system.failed }]}>{"\u26A0 " + s}</Text>
            ))}
          </Card>
        )}
        <Text style={styles.disclaimer}>{t("triage.disclaimer")}</Text>
        <View style={styles.buttons}>
          {showFacilities && <Button label={t("triage.findCare")} onPress={() => router.push({ pathname: "/(citizen)/facilities", params: { reportId } })} />}
          <Button label={t("action.startOver")} variant="secondary" onPress={() => router.replace("/")} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md },
  reason: { ...(type.body as object), color: ink.body, marginBottom: space.xs },
  watchHelp: { ...(type.body as object), color: ink.body, marginBottom: space.sm },
  dangerSign: { ...(type.body as object), fontWeight: "600", marginBottom: space.xs },
  disclaimer: { ...(type.meta as object), color: ink.muted, textAlign: "center", marginVertical: space.md },
  buttons: { marginTop: space.lg, gap: space.sm },
});
