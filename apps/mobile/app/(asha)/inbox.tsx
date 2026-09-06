/** STATUS: Implemented — online Phase 1 inbox; no persistent patient cache. */
import React, { useCallback, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../src/db/client.ts';
import type { AssignmentDirectory, CaseDetail, CaseMetadata, ChangeCase } from '@swasthyasetu/contracts/assignments';
import { api, type Envelope } from '../../src/api/client.ts';
import { getLocale } from '../../src/i18n/strings.ts';
import { Screen } from '../../src/ui/Screen.tsx';
import { Card } from '../../src/ui/Card.tsx';
import { Button } from '../../src/ui/Button.tsx';
import { Choice } from '../../src/ui/Field.tsx';

const words = {
  title: ['Case inbox','केस इनबॉक्स'], refresh: ['Refresh','ताज़ा करें'],
  connected: ['Connection required. Case content is cleared when you leave this screen.','इंटरनेट ज़रूरी है। स्क्रीन छोड़ने पर केस की जानकारी हटा दी जाती है।'],
  empty: ['No cases on this page.','इस पृष्ठ पर कोई केस नहीं है।'],
  error: ['Could not complete the request. Reconnect and refresh; the case may have changed.','अनुरोध पूरा नहीं हुआ। इंटरनेट जोड़कर ताज़ा करें; केस बदल गया हो सकता है।'],
  village: ['Village','गाँव'], worker: ['Worker','कार्यकर्ता'], none: ['No primary worker','कोई मुख्य कार्यकर्ता नहीं'],
  roster: ['Save primary worker for future cases','आने वाले केस के लिए मुख्य कार्यकर्ता सहेजें'],
  rosterNote: ['Roster changes affect future cases. Reassign existing cases individually.','रोस्टर बदलाव आने वाले केस पर लागू हैं। पुराने केस अलग से सौंपें।'],
  view: ['Read assigned case','सौंपा गया केस पढ़ें'], acknowledge: ['Acknowledge receipt','प्राप्ति स्वीकार करें'],
  handoff: ['Request human handoff','मानव सहायता का अनुरोध करें'], close: ['Human follow-up completed','मानव फ़ॉलो-अप पूरा हुआ'],
  reassign: ['Assign to selected worker','चुने गए कार्यकर्ता को सौंपें'],
  pending: ['AI summary is not implemented yet. Read the confirmed intake and transcript.','AI सारांश अभी नहीं बना है। पुष्ट जानकारी और प्रतिलेख पढ़ें।'],
  transcript: ['Transcript','प्रतिलेख'], missing: ['Not recorded','दर्ज नहीं है'],
  reason: ['Handoff reason','सहायता का कारण'],
  responsibility: ['A handoff request is not an emergency response. The current worker remains responsible until reassignment.','सहायता अनुरोध आपातकालीन सेवा नहीं है। दोबारा सौंपने तक वर्तमान कार्यकर्ता ज़िम्मेदार है।'],
  previous: ['Previous page','पिछला पृष्ठ'], next: ['Next page','अगला पृष्ठ'],
  sample: ['Submit synthetic test case','काल्पनिक परीक्षण केस भेजें'],
  consent: ['Test only: this is an automated prototype. Store this fictional intake for the configured retention period and send it to the assigned worker?','केवल परीक्षण: यह स्वचालित प्रोटोटाइप है। क्या काल्पनिक जानकारी निर्धारित अवधि तक सहेजकर कार्यकर्ता को भेजें?'],
  yes: ['I agree and confirm the fictional test details','मैं सहमत हूँ और काल्पनिक परीक्षण जानकारी की पुष्टि करता/करती हूँ'],
  test: ['Synthetic testing only. Do not enter real caller information.','केवल काल्पनिक परीक्षण। वास्तविक कॉलर की जानकारी न डालें।'],
  submitted: ['Test case submitted. Unassigned cases appear in the supervisor queue.','परीक्षण केस भेजा गया। बिना कार्यकर्ता वाले केस पर्यवेक्षक की कतार में दिखते हैं।'],
  ivr: ['Keypad phone intake','कीपैड फ़ोन जानकारी'], incomplete: ['Intake incomplete — review needed','जानकारी अधूरी — समीक्षा ज़रूरी'],
  saved: ['Saved.','सहेजा गया।'],
  UNASSIGNED: ['Needs assignment','कार्यकर्ता सौंपना बाकी'], ASSIGNED: ['Awaiting acknowledgement','स्वीकृति बाकी'],
  ACKNOWLEDGED: ['Human follow-up in progress','मानव फ़ॉलो-अप जारी'], HANDOFF_REQUESTED: ['Human handoff requested','मानव सहायता अनुरोध'], CLOSED: ['Follow-up completed','फ़ॉलो-अप पूरा'],
  CALLER_REQUEST: ['Caller requested assistance','कॉलर ने सहायता माँगी'], UNDERSTANDING_DIFFICULTY: ['Could not understand','समझने में कठिनाई'],
  UNSUPPORTED_REQUEST: ['Request outside supported workflow','अनुरोध कार्यप्रवाह से बाहर'], WORKER_UNABLE: ['Worker needs another person to take over','कार्यकर्ता को दूसरे व्यक्ति की सहायता चाहिए'],
} as const;
function w(key: keyof typeof words) { return words[key][getLocale() === 'hi' ? 1 : 0]; }
const intakeLabels: Record<string, readonly [string,string]> = {
  name: ['Name','नाम'], phone: ['Phone','फ़ोन'], location: ['Location','स्थान'], reason: ['Reason for contact','संपर्क का कारण'],
  context: ['Context','संदर्भ'], concerns: ['Stated concerns','बताई गई चिंताएँ'], duration: ['Duration / timing','अवधि / समय'],
  callback: ['Callback preference','वापस कॉल की पसंद'], notes: ['Notes','टिप्पणियाँ'],
};
function unwrap<T>(res: Envelope<T>): T { if (!res.ok || !res.data) throw new Error('Request failed'); return res.data; }

export default function Inbox(): React.ReactNode {
  const [directory,setDirectory] = useState<AssignmentDirectory | null>(null);
  const [items,setItems] = useState<CaseMetadata[]>([]);
  const [detail,setDetail] = useState<CaseDetail | null>(null);
  const [village,setVillage] = useState<string | null>(null), [worker,setWorker] = useState<string | null>(null);
  const [reason,setReason] = useState<NonNullable<ChangeCase['reason']>>('WORKER_UNABLE');
  const [consent,setConsent] = useState<string | null>(null);
  const [message,setMessage] = useState(''), [busy,setBusy] = useState(false), [offset,setOffset] = useState(0);
  const epoch = useRef(0), active = useRef(false);
  const clear = useCallback(() => { epoch.current++; setDetail(null); setItems([]); setDirectory(null); setConsent(null); setMessage(''); setBusy(false); },[]);
  const load = useCallback(async () => {
    const current = ++epoch.current; setDetail(null); setBusy(true); setMessage('');
    try {
      const d = unwrap(await api.get<AssignmentDirectory>('/assignments/directory'));
      const data = unwrap(await api.get<{ items: CaseMetadata[] }>('/assignments/cases?offset=' + offset));
      if (active.current && current === epoch.current) { setDirectory(d); setItems(data.items); }
    } catch { if (active.current && current === epoch.current) { setItems([]); setDirectory(null); setMessage(w('error')); } }
    finally { if (active.current && current === epoch.current) setBusy(false); }
  },[offset]);
  useFocusEffect(useCallback(() => {
    active.current = true; void load();
    const subscription = AppState.addEventListener('change',state => {
      if (state !== 'active') { active.current = false; clear(); }
      else { active.current = true; void load(); }
    });
    return () => { active.current = false; subscription.remove(); clear(); };
  },[load,clear]));
  async function mutate(path: string, body: unknown, success = w('saved')) {
    const current = ++epoch.current; setBusy(true); setDetail(null); setMessage('');
    try { unwrap(await api.post(path,body)); if (active.current && current === epoch.current) { await load(); setMessage(success); } }
    catch { if (active.current && current === epoch.current) setMessage(w('error')); }
    finally { if (active.current) setBusy(false); }
  }
  async function read(id: string) {
    const current = ++epoch.current; setDetail(null); setBusy(true); setMessage('');
    try { const data = unwrap(await api.get<CaseDetail>('/assignments/cases/' + id)); if (active.current && current === epoch.current) setDetail(data); }
    catch { if (active.current && current === epoch.current) setMessage(w('error')); }
    finally { if (active.current && current === epoch.current) setBusy(false); }
  }
  const action = (row: CaseMetadata, change: Omit<ChangeCase,'version'>) => void mutate('/assignments/cases/' + row.case_id,{ version: row.version,...change });
  function sample() {
    if (!village || !consent) return;
    const now = new Date().toISOString();
    const hex = getDb().getFirstSync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id')!.id;
    const caseId = hex.slice(0,8) + '-' + hex.slice(8,12) + '-4' + hex.slice(13,16) + '-8' + hex.slice(17,20) + '-' + hex.slice(20);
    void mutate('/assignments/cases',{
      caseId, villageId: village, language: getLocale(), synthetic: true,
      intake: { name: 'Fictional test caller', phone: '0000000000', location: 'Synthetic household', reason: 'Test callback request' },
      consent: { accepted: true, version: 'prototype-intake-v1', at: now }, confirmedAt: now,
    },w('submitted')); setConsent(null);
  }
  return <Screen title={w('title')}>
    <View style={{ gap: 12 }}>
      <Text>{w('connected')}</Text><Button label={w('refresh')} busy={busy} onPress={() => void load()} />
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      {directory?.canManage ? <Card heading={w('worker')}>
        <Text>{w('rosterNote')}</Text>
        <Choice label={w('village')} value={village} onChange={setVillage} options={directory.villages.map(v => ({ value: v.village_id,label: v.name + ' — ' + (directory.workers.find(u => u.user_id === v.asha_id)?.full_name ?? w('none')) }))} />
        <Choice label={w('worker')} value={worker} onChange={setWorker} options={[{ value: 'none',label: w('none') },...directory.workers.map(u => ({ value: u.user_id,label: u.full_name }))]} />
        <Button label={w('roster')} disabled={busy || !village || !worker} onPress={() => void mutate('/assignments/roster',{ villageId: village,ashaId: worker === 'none' ? null : worker })} />
      </Card> : null}
      {!items.length && !busy ? <Text>{w('empty')}</Text> : null}
      {items.map(row => <Card key={row.case_id} heading={w(row.status)}>
        <Text>{row.case_id}</Text><Text>{directory?.villages.find(v => v.village_id === row.village_id)?.name}</Text>
        <Text>{new Date(row.created_at).toLocaleString()} · {row.language === 'hi' ? 'हिन्दी' : 'English'}</Text>
        {row.source === 'KEYPAD_IVR' ? <Text>{w('ivr')}</Text> : null}
        {!row.intake_complete ? <Text>{w('incomplete')}</Text> : null}
        <Text>{row.assigned_asha_id ? directory?.workers.find(u => u.user_id === row.assigned_asha_id)?.full_name ?? row.assigned_asha_id : w('none')}</Text>
        {row.handoff_reason ? <Text>{w(row.handoff_reason)}</Text> : null}
        {directory?.canManage ? <Button label={w('reassign')} disabled={busy || !worker || worker === 'none' || worker === row.assigned_asha_id || row.status === 'CLOSED'} onPress={() => worker && action(row,{ action: 'REASSIGN',ashaId: worker })} /> : <>
          <Button label={w('view')} disabled={busy} onPress={() => void read(row.case_id)} />
          {detail?.case_id === row.case_id ? <View style={{ gap: 8 }}>
            {Object.entries(detail.intake).map(([key,value]) => <Text key={key}>{intakeLabels[key]?.[getLocale() === 'hi' ? 1 : 0] ?? key}: {value}</Text>)}
            <Text>{w('pending')}</Text><Text>{w('transcript')}: {detail.transcript ?? w('missing')}</Text>
          </View> : null}
          {row.status === 'ASSIGNED' ? <Button label={w('acknowledge')} disabled={busy} onPress={() => action(row,{ action: 'ACKNOWLEDGE' })} /> : null}
          {row.status !== 'CLOSED' ? <>
            <Text>{w('responsibility')}</Text>
            <Choice label={w('reason')} value={reason} onChange={setReason} options={(['CALLER_REQUEST','UNDERSTANDING_DIFFICULTY','UNSUPPORTED_REQUEST','WORKER_UNABLE'] as const).map(value => ({ value,label: w(value) }))} />
            <Button label={w('handoff')} disabled={busy} onPress={() => action(row,{ action: 'HANDOFF',reason })} />
          </> : null}
          {row.status === 'ACKNOWLEDGED' ? <Button label={w('close')} disabled={busy} onPress={() => action(row,{ action: 'CLOSE' })} /> : null}
        </>}
      </Card>)}
      <Button label={w('previous')} disabled={busy || offset === 0} onPress={() => setOffset(Math.max(0,offset - 50))} />
      <Button label={w('next')} disabled={busy || items.length < 50} onPress={() => setOffset(offset + 50)} />
      {directory && !directory.canManage ? <Card heading={w('test')}>
        <Choice label={w('village')} value={village} onChange={setVillage} options={directory.villages.map(v => ({ value: v.village_id,label: v.name }))} />
        <Text>{w('consent')}</Text><Text>Fictional test caller · 0000000000 · Synthetic household · Test callback request</Text>
        <Choice label={w('consent')} value={consent} onChange={setConsent} options={[{ value: 'yes',label: w('yes') }]} />
        <Button label={w('sample')} disabled={busy || !village || !consent} onPress={sample} />
      </Card> : null}
    </View>
  </Screen>;
}
