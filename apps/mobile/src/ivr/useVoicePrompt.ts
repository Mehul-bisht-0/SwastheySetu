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
      .then(() => {
        if (requestId.current !== thisRequest) return;
        Speech.speak(text, {
          language: LANGUAGE[locale],
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
