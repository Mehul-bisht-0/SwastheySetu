/**
 * On-device text-to-speech for the in-app IVR flow.
 *
 * This module only presents already-approved copy. It never interprets speech,
 * changes an answer, or participates in the urgency decision.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";

import type { Locale } from "../i18n/strings.ts";

const LANGUAGE: Record<Locale, string> = {
  hi: "hi-IN",
  mr: "mr-IN",
  en: "en-IN",
};

export function useVoicePrompt(
  text: string,
  locale: Locale,
  enabled: boolean,
): { repeat: () => void; speechFailed: boolean } {
  const [speechFailed, setSpeechFailed] = useState(false);
  const requestId = useRef(0);

  const repeat = useCallback(() => {
    if (!enabled || text.length === 0) return;
    const thisRequest = requestId.current + 1;
    requestId.current = thisRequest;
    setSpeechFailed(false);
    void Speech.stop()
      .then(async () => {
        if (requestId.current !== thisRequest) return;
        const voices = await Speech.getAvailableVoicesAsync();
        if (requestId.current !== thisRequest) return;
        const requestedLanguage = LANGUAGE[locale].toLowerCase();
        const voice = voices.find((candidate) => candidate.language.toLowerCase() === requestedLanguage)
          ?? voices.find((candidate) => candidate.language.toLowerCase().startsWith(`${locale}-`));
        // Some platforms return no inventory even though system TTS works. Only
        // block a known-missing Marathi voice; never substitute English speech.
        if (locale === "mr" && voices.length > 0 && !voice) {
          setSpeechFailed(true);
          return;
        }
        Speech.speak(text, {
          language: LANGUAGE[locale],
          ...(voice ? { voice: voice.identifier } : {}),
          pitch: 1,
          rate: 0.82,
          onError: () => setSpeechFailed(true),
        });
      })
      .catch(() => setSpeechFailed(true));
  }, [enabled, locale, text]);

  useEffect(() => {
    repeat();
    return () => {
      requestId.current += 1;
      void Speech.stop();
    };
  }, [repeat]);

  return { repeat, speechFailed };
}

export function stopVoicePrompt(): void {
  void Speech.stop();
}
