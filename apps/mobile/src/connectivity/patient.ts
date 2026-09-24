import * as SecureStore from "expo-secure-store";
import { getDb } from "../db/client.ts";
import { request } from "../api/client.ts";
import { PATIENT_TOKEN_KEY } from "../state/patientSession.ts";

type PatientOpType="CONSENT_DECIDE"|"CONSENT_REVOKE"|"CARE_CONTEXT_LINK";
interface Result { operationId:string;status:"APPLIED"|"DUPLICATE"|"CONFLICT"|"REJECTED";message?:string }
const CACHE_KEY="patient_diagnostic_cache_v1";

function uuid():string{return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16),v=c==="x"?r:(r&3)|8;return v.toString(16);});}
function canonical(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;}
function fingerprint(value:string):string{let hash=0x811c9dc5;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return`fnv1a-${(hash>>>0).toString(16).padStart(8,"0")}`;}

export function queuePatientOperation(opType:PatientOpType,payload:Record<string,unknown>):string{
 const operationId=uuid(),created=new Date().toISOString(),body=JSON.stringify(payload);
 getDb().runSync("INSERT INTO patient_operation_outbox(operation_id,op_type,client_created_at,payload_json,payload_hash,next_attempt_at) VALUES(?,?,?,?,?,?)",[operationId,opType,created,body,fingerprint(canonical(payload)),created]);
 return operationId;
}
export function pendingPatientOperations():number{return getDb().getFirstSync<{n:number}>("SELECT count(*) n FROM patient_operation_outbox WHERE status='PENDING'")?.n??0;}
export async function syncPatientOperations():Promise<{sent:number;rejected:number}>{
 const db=getDb();const rows=db.getAllSync<{operation_id:string;op_type:PatientOpType;client_created_at:string;payload_json:string;attempts:number}>("SELECT operation_id,op_type,client_created_at,payload_json,attempts FROM patient_operation_outbox WHERE status='PENDING' AND next_attempt_at<=? ORDER BY client_created_at LIMIT 50",[new Date().toISOString()]);
 if(!rows.length)return{sent:0,rejected:0};
 const operations=rows.map(row=>({operationId:row.operation_id,opType:row.op_type,clientCreatedAt:row.client_created_at,payload:JSON.parse(row.payload_json) as Record<string,unknown>}));
 const res=await request<{results:Result[]}>("/patients/sync/push",{method:"POST",body:{operations},tokenKey:PATIENT_TOKEN_KEY});
 if(!res.ok||!res.data){const next=new Date(Date.now()+Math.min(300_000,5_000*2**Math.min(6,Math.max(...rows.map(r=>r.attempts))))+Math.floor(Math.random()*1000)).toISOString();for(const row of rows)db.runSync("UPDATE patient_operation_outbox SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE operation_id=?",[next,res.error?.message??"No acknowledgement",row.operation_id]);return{sent:0,rejected:0};}
 let sent=0,rejected=0;for(const result of res.data.results){if(result.status==="APPLIED"||result.status==="DUPLICATE"){db.runSync("DELETE FROM patient_operation_outbox WHERE operation_id=?",[result.operationId]);sent++;}else{db.runSync("UPDATE patient_operation_outbox SET status='REJECTED',last_error=? WHERE operation_id=?",[result.message??result.status,result.operationId]);rejected++;}}
 return{sent,rejected};
}
export async function cachePatientDiagnostics(value:unknown):Promise<void>{await SecureStore.setItemAsync(CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),value}));}
export async function readPatientDiagnostics<T>():Promise<{savedAt:string;value:T}|null>{try{const text=await SecureStore.getItemAsync(CACHE_KEY);return text?JSON.parse(text) as {savedAt:string;value:T}:null;}catch{await purgePatientConnectivity();return null;}}
export async function purgePatientConnectivity():Promise<void>{await SecureStore.deleteItemAsync(CACHE_KEY);getDb().runSync("DELETE FROM patient_operation_outbox");}
