/** STATUS: Implemented — reviewed-copy placeholder and menus for the keypad prototype. */
export type IvrLanguage = 'hi' | 'en';

export interface MenuOption {
  digit: string;
  value: string;
  label: Record<IvrLanguage, string>;
  requiresHuman?: boolean;
}

export const IVR_CONFIG = {
  consentVersion: 'prototype-keypad-ivr-v1',
  retryLimit: 2,
  timeoutLimit: 2,
  gatherTimeoutSeconds: 7,
  languages: [
    { digit: '1', value: 'hi', label: { hi: 'हिन्दी', en: 'Hindi' } },
    { digit: '2', value: 'en', label: { hi: 'अंग्रेज़ी', en: 'English' } },
  ] satisfies MenuOption[],
  relationships: [
    { digit: '1', value: 'SELF', label: { hi: 'अपने लिए', en: 'For myself' } },
    { digit: '2', value: 'OTHER', label: { hi: 'किसी और के लिए', en: 'For someone else' } },
  ] satisfies MenuOption[],
  categories: [
    { digit: '1', value: 'GENERAL_CONCERN', label: { hi: 'सामान्य स्वास्थ्य चिंता', en: 'General health concern' } },
    { digit: '2', value: 'MATERNAL_CHILD', label: { hi: 'माता या बच्चे से जुड़ी चिंता', en: 'Maternal or child concern' } },
    { digit: '3', value: 'MEDICINE_SERVICE', label: { hi: 'दवा या स्वास्थ्य सेवा सहायता', en: 'Medicine or health-service help' } },
    { digit: '4', value: 'OTHER_UNSURE', label: { hi: 'अन्य या निश्चित नहीं', en: 'Other or unsure' }, requiresHuman: true },
  ] satisfies MenuOption[],
  durations: [
    { digit: '1', value: 'TODAY', label: { hi: 'आज शुरू हुई', en: 'Started today' } },
    { digit: '2', value: 'ONE_TO_THREE_DAYS', label: { hi: 'एक से तीन दिन', en: 'One to three days' } },
    { digit: '3', value: 'MORE_THAN_THREE_DAYS', label: { hi: 'तीन दिन से अधिक', en: 'More than three days' } },
    { digit: '4', value: 'UNKNOWN', label: { hi: 'पता नहीं', en: 'Unknown' } },
  ] satisfies MenuOption[],
} as const;

export function optionByDigit(options: readonly MenuOption[], digit: string): MenuOption | undefined {
  return options.find((option) => option.digit === digit);
}

export function optionByValue(options: readonly MenuOption[], value: string): MenuOption | undefined {
  return options.find((option) => option.value === value);
}
