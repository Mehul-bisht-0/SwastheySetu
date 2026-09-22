/** STATUS: Implemented — reviewed-copy placeholder and menus for the keypad prototype. */
export type IvrLanguage = 'hi' | 'mr' | 'en';

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
    { digit: '1', value: 'hi', label: { hi: 'हिन्दी', mr: 'हिंदी', en: 'Hindi' } },
    { digit: '2', value: 'mr', label: { hi: 'मराठी', mr: 'मराठी', en: 'Marathi' } },
    { digit: '3', value: 'en', label: { hi: 'अंग्रेज़ी', mr: 'इंग्रजी', en: 'English' } },
  ] satisfies MenuOption[],
  relationships: [
    { digit: '1', value: 'SELF', label: { hi: 'अपने लिए', mr: 'स्वतःसाठी', en: 'For myself' } },
    { digit: '2', value: 'OTHER', label: { hi: 'किसी और के लिए', mr: 'दुसऱ्या व्यक्तीसाठी', en: 'For someone else' } },
  ] satisfies MenuOption[],
  categories: [
    { digit: '1', value: 'GENERAL_CONCERN', label: { hi: 'सामान्य स्वास्थ्य चिंता', mr: 'सामान्य आरोग्यविषयक काळजी', en: 'General health concern' } },
    { digit: '2', value: 'MATERNAL_CHILD', label: { hi: 'माता या बच्चे से जुड़ी चिंता', mr: 'आई किंवा बाळाशी संबंधित काळजी', en: 'Maternal or child concern' } },
    { digit: '3', value: 'MEDICINE_SERVICE', label: { hi: 'दवा या स्वास्थ्य सेवा सहायता', mr: 'औषध किंवा आरोग्य सेवेसाठी मदत', en: 'Medicine or health-service help' } },
    { digit: '4', value: 'OTHER_UNSURE', label: { hi: 'अन्य या निश्चित नहीं', mr: 'इतर किंवा निश्चित माहीत नाही', en: 'Other or unsure' }, requiresHuman: true },
  ] satisfies MenuOption[],
  durations: [
    { digit: '1', value: 'TODAY', label: { hi: 'आज शुरू हुई', mr: 'आज सुरू झाली', en: 'Started today' } },
    { digit: '2', value: 'ONE_TO_THREE_DAYS', label: { hi: 'एक से तीन दिन', mr: 'एक ते तीन दिवस', en: 'One to three days' } },
    { digit: '3', value: 'MORE_THAN_THREE_DAYS', label: { hi: 'तीन दिन से अधिक', mr: 'तीन दिवसांपेक्षा जास्त', en: 'More than three days' } },
    { digit: '4', value: 'UNKNOWN', label: { hi: 'पता नहीं', mr: 'माहीत नाही', en: 'Unknown' } },
  ] satisfies MenuOption[],
} as const;

export function optionByDigit(options: readonly MenuOption[], digit: string): MenuOption | undefined {
  return options.find((option) => option.digit === digit);
}

export function optionByValue(options: readonly MenuOption[], value: string): MenuOption | undefined {
  return options.find((option) => option.value === value);
}
