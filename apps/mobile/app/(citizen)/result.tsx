import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { Card } from "../../src/ui/Card.tsx";
import { TierBanner } from "../../src/ui/TierBanner.tsx";
import { getReport } from "../../src/db/dao/reports.ts";
import { RULES } from "@swasthyasetu/core";
import { getLocale, t } from "../../src/i18n/strings.ts";
import { useVoicePrompt } from "../../src/ivr/useVoicePrompt.ts";
import { ink, type, space, system } from "../../src/theme/tokens.ts";
import type { TierKey } from "../../src/theme/tokens.ts";
import type { ReportRow } from "../../src/db/dao/reports.ts";
import { getPatientSession } from "../../src/state/patientSession.ts";

export default function ResultScreen(): React.ReactNode {
  const router = useRouter();
  const { reportId, voice } = useLocalSearchParams<{ reportId: string; voice?: string }>();
  const [report, setReport] = useState<ReportRow | null>(null);

  useEffect(() => {
    if (reportId) setReport(getReport(reportId));
  }, [reportId]);

  const spokenTier = report?.tier as TierKey | undefined;
  const spokenResult = spokenTier
    ? `${t(`triage.${spokenTier}.headline`)} ${t(`triage.${spokenTier}.support`)} ${t("triage.disclaimer")}`
    : "";
  const { repeat, speechFailed } = useVoicePrompt(
    spokenResult,
    getLocale(),
    voice === "1" && report !== null,
  );

  if (!report) return <Screen><Text style={{ color: ink.muted, textAlign: "center" }}>Loading...</Text></Screen>;

  const { tier, result } = report;
  const tierKey = tier as TierKey;
  const showFacilities = tierKey !== "SELF_CARE";
  const urgent = tierKey === "EMERGENCY" || tierKey === "GO_NOW";
  const verifiedPatient = getPatientSession()?.verificationStatus === "VERIFIED";

  // SELF_CARE danger-sign list: all red-flag labels except those that fired
  const dangerSigns: string[] = tierKey === "SELF_CARE"
    ? RULES.filter((r) => r.tier === "EMERGENCY" || r.tier === "GO_NOW").map((r) => r.label)
    : [];

  return (
    <ScrollView>
      <TierBanner tier={tierKey} />
      <View style={styles.body}>
        {result.advice.length > 0 && (
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
        <Text style={styles.offlineNote}>{t("triage.offlineNote")}</Text>
        <Text style={styles.disclaimer}>{t("triage.disclaimer")}</Text>
        {urgent && !verifiedPatient ? (
          <View style={styles.dispatchNotice}>
            <Text style={styles.dispatchHeading}>Verified-patient facility alert</Text>
            <Text style={styles.reason}>Verify your patient profile before sharing an urgent request with a selected facility. You can still call 112 or view nearby care.</Text>
          </View>
        ) : null}
        {voice === "1" && speechFailed ? (
          <Text style={styles.voiceNotice}>{t("ivr.voice.failed")}</Text>
        ) : null}
        <View style={styles.buttons}>
          {voice === "1" ? <Button label={t("ivr.result.repeat")} variant="secondary" onPress={repeat} /> : null}
          {tierKey === "EMERGENCY" ? <Button label="Call 112 now / अभी 112 पर कॉल करें" variant="emergency" onPress={() => void Linking.openURL("tel:112")} /> : null}
          {urgent && verifiedPatient ? (
            <Button
              label="Share urgent details and request facility help"
              variant="emergency"
              onPress={() => router.push({ pathname: "/(patient)/sos", params: { reportId } })}
            />
          ) : null}
          {urgent && !verifiedPatient ? <Button label="Go to patient verification" onPress={() => router.replace("/(patient)/home")} /> : null}
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
  offlineNote: { ...(type.meta as object), color: ink.body, textAlign: "center", marginTop: space.md },
  disclaimer: { ...(type.meta as object), color: ink.muted, textAlign: "center", marginVertical: space.md },
  voiceNotice: { ...(type.body as object), color: ink.body, textAlign: "center", marginBottom: space.md },
  dispatchNotice: { backgroundColor: "#FFF3E8", borderColor: system.failed, borderWidth: 1, borderRadius: 12, padding: space.md, gap: space.xs },
  dispatchHeading: { ...(type.section as object), color: ink.strong },
  buttons: { marginTop: space.lg, gap: space.sm },
});
