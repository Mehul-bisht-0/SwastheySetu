import url from "node:url";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.ts";
import { withTransaction } from "../db/tx.ts";

interface Job{job_id:string;job_type:string;order_id:string;payload:Record<string,unknown>;attempt_count:number;tracking_code:string;sms_opt_in:boolean;voice_opt_in:boolean;quiet_now:boolean}
export async function enqueueOverdueFollowups():Promise<number>{const result=await pool.query(`INSERT INTO notification_jobs(job_type,order_id,idempotency_key,payload)
 SELECT 'DIAGNOSTIC_OVERDUE_FOLLOWUP',o.order_id,'diag:'||o.order_id||':overdue:'||current_date,jsonb_build_object('trackingCodeOnly',true,'status','OVERDUE')
 FROM diagnostic_orders o JOIN diagnostic_notification_preferences p USING(patient_id) WHERE o.expected_by<now() AND o.status NOT IN ('RESULT_READY','COMPLETED','DECLINED','CANCELLED')
 AND (p.sms_opt_in OR p.voice_opt_in) ON CONFLICT(idempotency_key) DO NOTHING`);return result.rowCount??0;}
export async function deliverBatch(limit=25):Promise<{sent:number;deferred:number}>{return withTransaction(async client=>{await client.query(`UPDATE notification_jobs SET status='FAILED',last_error='Retry limit reached.' WHERE status='PENDING' AND attempt_count>=5`);const jobs=(await client.query<Job>(`SELECT j.job_id,j.job_type,j.order_id,j.payload,j.attempt_count,o.tracking_code,p.sms_opt_in,p.voice_opt_in,
 (localtime>=p.quiet_hours_start OR localtime<p.quiet_hours_end) AS quiet_now FROM notification_jobs j JOIN diagnostic_orders o USING(order_id)
 JOIN diagnostic_notification_preferences p USING(patient_id) WHERE j.status='PENDING' AND j.attempt_count<5 AND j.next_attempt_at<=now() ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT $1`,[limit])).rows;
 let sent=0,deferred=0;for(const job of jobs){if(job.quiet_now){await client.query(`UPDATE notification_jobs SET next_attempt_at=date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata')+interval '1 day 8 hours',status='PENDING' WHERE job_id=$1`,[job.job_id]);deferred+=1;continue;}
  const channel=job.job_type.endsWith("VOICE")?"MOCK_VOICE":"MOCK_SMS";const permitted=channel==="MOCK_VOICE"?job.voice_opt_in:job.sms_opt_in;if(!permitted){await client.query(`UPDATE notification_jobs SET status='CANCELLED' WHERE job_id=$1`,[job.job_id]);continue;}
  // The mock adapter records only a generic provider reference. No phone, test name,
  // result, condition or clinical note enters logs or the delivery-attempt payload.
  await client.query(`INSERT INTO notification_delivery_attempts(job_id,channel,outcome,provider_reference,detail) VALUES($1,$2,'SENT',$3,$4)`,[job.job_id,channel,`mock-${randomUUID()}`,{trackingCode:job.tracking_code,status:String(job.payload["status"]??"UPDATE"),message:`A SwasthyaSetu update exists for tracking code ${job.tracking_code}. Open the app, call the status line, or contact the facility.`}]);
  await client.query(`UPDATE notification_jobs SET status='SENT',attempt_count=attempt_count+1,last_error=NULL WHERE job_id=$1`,[job.job_id]);sent+=1;}
 return{sent,deferred};});}
export async function runDiagnosticJobs():Promise<void>{const enqueued=await enqueueOverdueFollowups();const delivered=await deliverBatch();console.log(JSON.stringify({job:"diagnostic-notifications",enqueued,...delivered}));}
if(import.meta.url===url.pathToFileURL(process.argv[1]??"").href)runDiagnosticJobs().catch(error=>{console.error(error instanceof Error?error.message:"Diagnostic job failed.");process.exit(1);}).finally(()=>pool.end());
