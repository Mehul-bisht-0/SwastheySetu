/** STATUS: Implemented — provider-neutral Stage 2 Phase 2 keypad IVR contract. */
import { z } from 'zod';

export const ivrProviderEvent = z.object({
  eventId: z.string().trim().min(1).max(200),
  callId: z.string().trim().min(1).max(200),
  type: z.enum(['START','DTMF','TIMEOUT','HANGUP']),
  digits: z.string().regex(/^[0-9#*]{1,16}$/).optional(),
  callerNumber: z.string().regex(/^\+?[0-9]{7,15}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.type === 'START' && !value.callerNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['callerNumber'], message: 'Required for START.' });
  }
  if (value.type === 'DTMF' && !value.digits) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['digits'], message: 'Required for DTMF.' });
  }
});

export const ivrWebhookParams = z.object({ provider: z.literal('prototype') });
export type IvrProviderEvent = z.infer<typeof ivrProviderEvent>;

export interface IvrPrompt { key: string; text: string }
export type IvrCommand =
  | { type: 'GATHER'; prompt: IvrPrompt; minDigits: number; maxDigits: number; timeoutSeconds: number; finishOnKey?: '#' }
  | { type: 'PLAY'; prompt: IvrPrompt }
  | { type: 'HANGUP' };
export interface IvrProviderResponse {
  callId: string;
  state: string;
  commands: IvrCommand[];
}
