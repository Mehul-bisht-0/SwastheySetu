/** STATUS: Implemented — Stage 2 Phase 1 additive wire contract. */
import { z } from 'zod';

export const handoffReason = z.enum(['CALLER_REQUEST','UNDERSTANDING_DIFFICULTY','UNSUPPORTED_REQUEST','WORKER_UNABLE']);
export const createCase = z.object({
  caseId: z.string().uuid(), villageId: z.string().uuid(), language: z.enum(['hi','en']),
  intake: z.object({
    name: z.string().trim().min(1).max(160), phone: z.string().regex(/^\+?[0-9]{7,15}$/),
    location: z.string().trim().min(1).max(500), reason: z.string().trim().min(1).max(2000),
    context: z.string().max(2000).optional(), concerns: z.string().max(2000).optional(),
    duration: z.string().max(300).optional(), callback: z.string().max(300).optional(), notes: z.string().max(2000).optional(),
  }).strict(),
  transcript: z.string().max(30000).optional(),
  consent: z.object({ accepted: z.literal(true), version: z.literal('prototype-intake-v1'), at: z.string().datetime() }).strict(),
  confirmedAt: z.string().datetime(),
  synthetic: z.literal(true),
}).strict();
export const changeCase = z.object({
  version: z.number().int().positive(),
  action: z.enum(['ACKNOWLEDGE','HANDOFF','CLOSE','REASSIGN']),
  ashaId: z.string().uuid().optional(), reason: handoffReason.optional(),
}).strict();
export const rosterChange = z.object({ villageId: z.string().uuid(), ashaId: z.string().uuid().nullable() }).strict();
export const caseIdParam = z.object({ id: z.string().uuid() });
export const listQuery = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) });
export type CreateCase = z.infer<typeof createCase>;
export type ChangeCase = z.infer<typeof changeCase>;
export interface CaseMetadata {
  case_id: string; village_id: string; assigned_asha_id: string | null;
  language: 'hi' | 'en'; status: 'UNASSIGNED' | 'ASSIGNED' | 'ACKNOWLEDGED' | 'HANDOFF_REQUESTED' | 'CLOSED';
  handoff_reason: z.infer<typeof handoffReason> | null; version: number;
  source: 'ASHA_TEST' | 'KEYPAD_IVR'; intake_complete: boolean;
  created_at: string; updated_at: string; expires_at: string;
}
export interface CaseDetail extends CaseMetadata {
  intake: CreateCase['intake']; transcript: string | null;
  summary: null; summaryStatus: 'NOT_IMPLEMENTED';
}
export interface AssignmentDirectory {
  canManage: boolean;
  villages: Array<{ village_id: string; name: string; asha_id: string | null }>;
  workers: Array<{ user_id: string; full_name: string }>;
}
