/** STATUS: Implemented — deterministic keypad state machine; no clinical or AI decisions. */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { IvrCommand, IvrProviderEvent, IvrProviderResponse } from '@swasthyasetu/contracts/ivr';
import * as assignmentRepo from '../assignments/repo.ts';
import { badRequest, conflict, notFound } from '../../plugins/errors.ts';
import { IVR_CONFIG, optionByDigit, optionByValue, type IvrLanguage, type MenuOption } from './config.ts';
import * as repo from './repo.ts';

function expiry(): Date {
  const days = Number(process.env['CASE_RETENTION_DAYS']);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw badRequest('Configure CASE_RETENTION_DAYS before collecting prototype intake.');
  return new Date(Date.now() + days * 86_400_000);
}

const copy = {
  consent: {
    hi: 'यह एक स्वचालित प्रोटोटाइप सेवा है। यह निदान या आपातकालीन सहायता नहीं देती और कॉल रिकॉर्ड नहीं की जाती। जानकारी ASHA कार्यकर्ता के फ़ॉलो-अप के लिए रखी जाएगी। सहमत हों तो 1, मना करने के लिए 2 दबाएँ।',
    en: 'This is an automated prototype. It does not diagnose or provide emergency assistance, and this call is not recorded. Information will be stored for ASHA follow-up. Press 1 to consent or 2 to decline.',
  },
  relationship: { hi: 'अपने लिए कॉल कर रहे हैं तो 1, किसी और के लिए 2 दबाएँ।', en: 'Press 1 if calling for yourself, or 2 for someone else.' },
  village: { hi: 'अपने गाँव का अंक कोड डालें और फिर हैश दबाएँ।', en: 'Enter your village numeric code, then press hash.' },
  category: { hi: 'सामान्य स्वास्थ्य चिंता के लिए 1, माता या बच्चे के लिए 2, दवा या सेवा सहायता के लिए 3, अन्य या निश्चित नहीं के लिए 4 दबाएँ।', en: 'Press 1 for a general health concern, 2 for a maternal or child concern, 3 for medicine or service help, or 4 for other or unsure.' },
  duration: { hi: 'चिंता आज शुरू हुई तो 1, एक से तीन दिन के लिए 2, तीन दिन से अधिक के लिए 3, पता नहीं के लिए 4 दबाएँ।', en: 'Press 1 if it started today, 2 for one to three days, 3 for more than three days, or 4 if unknown.' },
  callbackChoice: { hi: 'इसी नंबर पर वापस कॉल की अनुमति के लिए 1, दूसरा नंबर डालने के लिए 2, वापस कॉल की अनुमति न देने के लिए 3 दबाएँ।', en: 'Press 1 to allow a callback to this number, 2 to enter another number, or 3 to give no callback permission.' },
  callbackNumber: { hi: 'वापस कॉल का नंबर डालें और फिर हैश दबाएँ।', en: 'Enter the callback number, then press hash.' },
  submitted: { hi: 'आपकी जानकारी भेज दी गई है। ASHA कार्यकर्ता उपलब्ध होने पर फ़ॉलो-अप करेंगे।', en: 'Your information has been submitted. An ASHA worker will follow up when available.' },
  human: { hi: 'इनपुट पूरा नहीं हो सका। उपलब्ध जानकारी मानव फ़ॉलो-अप के लिए भेजी गई है।', en: 'The keypad intake could not be completed. Available information was sent for human follow-up.' },
  failure: { hi: 'इनपुट पूरा नहीं हो सका। कृपया बाद में फिर कॉल करें या स्थानीय मानव सहायता लें।', en: 'The keypad intake could not be completed. Please call again later or seek local human assistance.' },
  declined: { hi: 'कोई स्वास्थ्य जानकारी जमा नहीं की गई। धन्यवाद।', en: 'No health information was submitted. Thank you.' },
  invalid: { hi: 'वह विकल्प मान्य नहीं है।', en: 'That option is not valid.' },
  timeout: { hi: 'कोई इनपुट नहीं मिला।', en: 'No input was received.' },
} as const;

function language(call: repo.IvrCall): IvrLanguage { return call.language ?? 'hi'; }
function prompt(key: string, text: string) { return { key, text }; }
function gather(call: repo.IvrCall, key: string, text: string, minDigits = 1, maxDigits = 1, finishOnKey?: '#'): IvrProviderResponse {
  const command: IvrCommand = { type: 'GATHER', prompt: prompt(key,text), minDigits,maxDigits,timeoutSeconds: IVR_CONFIG.gatherTimeoutSeconds,
    ...(finishOnKey ? { finishOnKey } : {}) };
  return { callId: call.provider_call_id,state: call.state,commands: [command] };
}
function hangup(call: repo.IvrCall, key: string, text: string): IvrProviderResponse {
  return { callId: call.provider_call_id,state: call.state,commands: [{ type: 'PLAY',prompt: prompt(key,text) },{ type: 'HANGUP' }] };
}
function basePrompt(call: repo.IvrCall): IvrProviderResponse {
  const lang = language(call);
  switch (call.state) {
    case 'LANGUAGE': return gather(call,'language','हिन्दी के लिए 1 दबाएँ। Press 2 for English.');
    case 'CONSENT': return gather(call,'consent',copy.consent[lang]);
    case 'RELATIONSHIP': return gather(call,'relationship',copy.relationship[lang]);
    case 'VILLAGE': return gather(call,'village',copy.village[lang],1,8,'#');
    case 'CATEGORY': return gather(call,'category',copy.category[lang]);
    case 'DURATION': return gather(call,'duration',copy.duration[lang]);
    case 'CALLBACK_CHOICE': return gather(call,'callback-choice',copy.callbackChoice[lang]);
    case 'CALLBACK_NUMBER': return gather(call,'callback-number',copy.callbackNumber[lang],7,15,'#');
    case 'CONFIRM': return gather(call,'confirm',confirmationText(call,lang));
    case 'COMPLETED': return hangup(call,'submitted',copy.submitted[lang]);
    case 'FAILED': return hangup(call,'failure',copy.failure[lang]);
    case 'HUNG_UP': return { callId: call.provider_call_id,state: call.state,commands: [{ type: 'HANGUP' }] };
  }
}

function label(options: readonly MenuOption[], value: string, lang: IvrLanguage): string {
  return optionByValue(options,value)?.label[lang] ?? value;
}
function confirmationText(call: repo.IvrCall, lang: IvrLanguage): string {
  const r = call.responses;
  const relationship = label(IVR_CONFIG.relationships,r['relationship'] ?? '',lang);
  const category = label(IVR_CONFIG.categories,r['category'] ?? '',lang);
  const duration = label(IVR_CONFIG.durations,r['duration'] ?? '',lang);
  return lang === 'hi'
    ? `कृपया पुष्टि करें: ${relationship}, गाँव कोड ${r['villageDialCode'] ?? ''}, ${category}, ${duration}। भेजने के लिए 1, दोबारा भरने के लिए 2 दबाएँ।`
    : `Please confirm: ${relationship}, village code ${r['villageDialCode'] ?? ''}, ${category}, ${duration}. Press 1 to submit or 2 to start the intake again.`;
}
function retryPrompt(call: repo.IvrCall, prefix: string): IvrProviderResponse {
  const response = basePrompt(call);
  const command = response.commands[0];
  if (command?.type === 'GATHER') command.prompt = prompt(command.prompt.key,`${prefix} ${command.prompt.text}`);
  return response;
}

async function createCase(db: pg.PoolClient, call: repo.IvrCall, complete: boolean, reason: 'UNDERSTANDING_DIFFICULTY'|'UNSUPPORTED_REQUEST'|'CALLER_REQUEST'|null): Promise<string|null> {
  if (!call.consent_at) return null;
  const r = call.responses, villageId = r['villageId'], district = r['districtCode'];
  if (!villageId || !district || !call.language) return null;
  if (!await assignmentRepo.village(db,villageId,district)) return null;
  const assigned = await assignmentRepo.primary(db,villageId,district);
  const category = label(IVR_CONFIG.categories,r['category'] ?? 'INCOMPLETE',call.language);
  const duration = label(IVR_CONFIG.durations,r['duration'] ?? 'UNKNOWN',call.language);
  const callbackPermission = r['callbackPermission'] ?? 'NOT_REACHED';
  const phone = r['callbackNumber'] ?? call.caller_phone;
  if (!phone) return null;
  const caseId = randomUUID(), now = new Date().toISOString();
  const inserted = await assignmentRepo.insertIvr(db,{
    caseId,villageId,districtCode: district,language: call.language,complete,handoffReason: reason,
    intake: {
      name: r['relationship'] === 'OTHER' ? 'Person represented by caller (identity not verified)' : 'Caller (identity not verified)',
      phone, location: `Village dial code ${r['villageDialCode'] ?? 'not confirmed'}: ${r['villageName'] ?? 'unknown'}`,
      reason: complete ? category : 'Incomplete keypad intake — human review requested',
      duration, callback: callbackPermission === 'NO' ? 'Caller did not grant callback permission.' : `Callback permission: ${callbackPermission}.`,
      context: `Caller relationship: ${r['relationship'] ?? 'not collected'}.`,
      notes: complete ? 'Submitted and confirmed through keypad IVR.' : 'Call ended or retries were exhausted before confirmation.',
    }, consentVersion: call.consent_version ?? IVR_CONFIG.consentVersion,consentAt: call.consent_at,confirmedAt: now,
  },assigned,new Date(call.expires_at));
  if (!inserted) throw conflict('IVR case identifier collision.');
  await assignmentRepo.auditSystem(db,district,'IVR_CREATED',new Date(call.expires_at),caseId,villageId,assigned);
  call.case_id = caseId;
  return caseId;
}

async function fail(call: repo.IvrCall, db: pg.PoolClient, reason: 'UNDERSTANDING_DIFFICULTY'|'CALLER_REQUEST'): Promise<IvrProviderResponse> {
  const madeCase = await createCase(db,call,false,reason);
  call.state = 'FAILED'; call.terminal_reason = reason;
  return hangup(call,madeCase ? 'human-follow-up' : 'failure',madeCase ? copy.human[language(call)] : copy.failure[language(call)]);
}

async function acceptDigit(call: repo.IvrCall, digits: string, db: pg.PoolClient): Promise<IvrProviderResponse> {
  const clean = digits.endsWith('#') ? digits.slice(0,-1) : digits;
  const r = call.responses;
  if (call.state === 'LANGUAGE') {
    const chosen = optionByDigit(IVR_CONFIG.languages,clean);
    if (chosen) { call.language = chosen.value as IvrLanguage; call.state = 'CONSENT'; }
    else return invalid(call,db);
  } else if (call.state === 'CONSENT') {
    if (clean === '1') { call.consent_version=IVR_CONFIG.consentVersion; call.consent_at=new Date().toISOString(); call.state='RELATIONSHIP'; }
    else if (clean === '2') { call.state='FAILED'; call.terminal_reason='CONSENT_DECLINED'; return hangup(call,'consent-declined',copy.declined[language(call)]); }
    else return invalid(call,db);
  } else if (call.state === 'RELATIONSHIP') {
    const chosen=optionByDigit(IVR_CONFIG.relationships,clean); if (!chosen) return invalid(call,db);
    r['relationship']=chosen.value; call.state='VILLAGE';
  } else if (call.state === 'VILLAGE') {
    const village=await repo.villageRoute(db,clean); if (!village) return invalid(call,db);
    r['villageDialCode']=clean; r['villageId']=village.village_id; r['districtCode']=village.district_code; r['villageName']=village.name; call.state='CATEGORY';
  } else if (call.state === 'CATEGORY') {
    const chosen=optionByDigit(IVR_CONFIG.categories,clean); if (!chosen) return invalid(call,db);
    r['category']=chosen.value; call.state='DURATION';
  } else if (call.state === 'DURATION') {
    const chosen=optionByDigit(IVR_CONFIG.durations,clean); if (!chosen) return invalid(call,db);
    r['duration']=chosen.value; call.state='CALLBACK_CHOICE';
  } else if (call.state === 'CALLBACK_CHOICE') {
    if (clean === '1') { r['callbackPermission']='CURRENT_NUMBER'; if (call.caller_phone) r['callbackNumber']=call.caller_phone; call.state='CONFIRM'; }
    else if (clean === '2') { r['callbackPermission']='OTHER_NUMBER'; call.state='CALLBACK_NUMBER'; }
    else if (clean === '3') { r['callbackPermission']='NO'; call.state='CONFIRM'; }
    else return invalid(call,db);
  } else if (call.state === 'CALLBACK_NUMBER') {
    if (!/^\+?[0-9]{7,15}$/.test(clean)) return invalid(call,db);
    r['callbackNumber']=clean; call.state='CONFIRM';
  } else if (call.state === 'CONFIRM') {
    if (clean === '2') { call.responses={}; call.state='RELATIONSHIP'; }
    else if (clean === '1') {
      const category=optionByValue(IVR_CONFIG.categories,r['category'] ?? '');
      await createCase(db,call,true,category?.requiresHuman ? 'UNSUPPORTED_REQUEST' : null);
      call.state='COMPLETED'; return hangup(call,'submitted',copy.submitted[language(call)]);
    } else return invalid(call,db);
  } else return basePrompt(call);
  call.invalid_attempts=0; call.timeout_attempts=0;
  return basePrompt(call);
}

async function invalid(call: repo.IvrCall, db: pg.PoolClient): Promise<IvrProviderResponse> {
  call.invalid_attempts += 1;
  if (call.invalid_attempts > IVR_CONFIG.retryLimit) return fail(call,db,'UNDERSTANDING_DIFFICULTY');
  return retryPrompt(call,copy.invalid[language(call)]);
}

async function timeout(call: repo.IvrCall, db: pg.PoolClient): Promise<IvrProviderResponse> {
  call.timeout_attempts += 1;
  if (call.timeout_attempts > IVR_CONFIG.timeoutLimit) return fail(call,db,'UNDERSTANDING_DIFFICULTY');
  return retryPrompt(call,copy.timeout[language(call)]);
}

export async function handle(provider: string, event: IvrProviderEvent): Promise<IvrProviderResponse> {
  return assignmentRepo.transaction(async db => {
    await repo.lockEvent(db,provider,event.eventId);
    const prior=await repo.priorEvent(db,provider,event.eventId); if (prior) return prior;
    let call = event.type === 'START'
      ? await repo.startCall(db,randomUUID(),provider,event.callId,event.callerNumber ?? '',expiry())
      : await repo.lockCall(db,provider,event.callId);
    if (!call) throw notFound('Call session not found or expired.');
    let response: IvrProviderResponse;
    if (event.type === 'START') response=basePrompt(call);
    else if (call.state === 'COMPLETED' || call.state === 'FAILED' || call.state === 'HUNG_UP') response=basePrompt(call);
    else if (event.type === 'HANGUP') { await createCase(db,call,false,'CALLER_REQUEST'); call.state='HUNG_UP'; call.terminal_reason='CALLER_HUNG_UP'; response=basePrompt(call); }
    else if (event.type === 'TIMEOUT') response=await timeout(call,db);
    else response=await acceptDigit(call,event.digits ?? '',db);
    await repo.saveCall(db,call);
    await repo.saveEvent(db,provider,event.eventId,call,event.type,response);
    return response;
  });
}
