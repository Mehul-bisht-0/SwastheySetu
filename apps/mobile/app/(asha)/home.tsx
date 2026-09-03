import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/ui/Screen.tsx";
import { Button } from "../../src/ui/Button.tsx";
import { t } from "../../src/i18n/strings.ts";
import { space } from "../../src/theme/tokens.ts";

export default function HomeScreen(): React.ReactNode {
  const router = useRouter();
  return (
    <Screen title={t("asha.home.title")}>
      <View style={{ gap: space.md }}>
        <Button label={t("asha.home.newVisit")} onPress={() => router.push("/(asha)/visit")} />
        <Button label={t("asha.home.newTriage")} variant="secondary" onPress={() => router.push("/(citizen)/patient")} />
      </View>
    </Screen>
  );
}
