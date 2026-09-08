import type { Href, ImperativeRouter } from "expo-router";

/** Avoid dispatching GO_BACK when a QR/deep link opened the current screen as the stack root. */
export function safeBack(router: ImperativeRouter, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
