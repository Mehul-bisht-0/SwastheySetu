import { randomUUID } from "node:crypto";
import type { IvrProviderEvent,IvrProviderResponse,IvrPrompt } from "@swasthyasetu/contracts/ivr";
import { withTransaction } from "../../db/tx.ts";

type Lang="hi"|"mr"|"en";
interface CallRow{ivr_call_id:string;provider:string;provider_call_id:string;caller_phone:string;language:Lang;state:string;tracking_code:string|null;terminal:boolean;expires_at:Date}
const copy={
 language:"भाषा चुनें। हिंदी के लिए 1, मराठी के लिए 2, English के लिए 3 दबाएँ।",
 tracking:{hi:"अपने जाँच अनुरोध के सात अंक दर्ज करें।",mr:"तुमच्या तपासणी विनंतीचे सात अंक प्रविष्ट करा.",en:"Enter the seven digits of your diagnostic request."},
 confirm:{hi:"इस कॉल के फोन नंबर की पुष्टि के लिए 1 दबाएँ।",mr:"या कॉलच्या फोन नंबराची पुष्टी करण्यासाठी 1 दाबा.",en:"Press 1 to confirm the phone number used for this call."},
 invalid:{hi:"जानकारी मेल नहीं खाती। सुविधा से संपर्क करें।",mr:"माहिती जुळली नाही. सुविधेशी संपर्क साधा.",en:"The information did not match. Contact the facility."},
 states:{
  CREATED:{hi:"आपका अनुरोध दर्ज है।",mr:"तुमची विनंती नोंदवली आहे.",en:"Your request has been recorded."},ACCEPTED:{hi:"सुविधा ने अनुरोध स्वीकार किया है।",mr:"सुविधेने विनंती स्वीकारली आहे.",en:"The facility has accepted the request."},SCHEDULED:{hi:"आपका अनुरोध निर्धारित है।",mr:"तुमची विनंती नियोजित आहे.",en:"Your request is scheduled."},IN_PROGRESS:{hi:"जाँच प्रक्रिया चल रही है।",mr:"तपासणी प्रक्रिया सुरू आहे.",en:"The diagnostic process is in progress."},RESULT_READY:{hi:"अपडेट तैयार है। परिणाम के लिए ऐप या सुविधा का उपयोग करें।",mr:"अपडेट तयार आहे. निकालासाठी अॅप किंवा सुविधेचा वापर करा.",en:"An update is ready. Use the app or contact the facility for the result."},COMPLETED:{hi:"अनुरोध पूरा हो गया है।",mr:"विनंती पूर्ण झाली आहे.",en:"The request is complete."},DECLINED:{hi:"सुविधा अनुरोध पूरा नहीं कर सकी।",mr:"सुविधा विनंती पूर्ण करू शकली नाही.",en:"The facility could not accept the request."},CANCELLED:{hi:"अनुरोध रद्द है।",mr:"विनंती रद्द आहे.",en:"The request is cancelled."},
 } as Record<string,Record<Lang,string>>,
};
const prompt=(key:string,text:string):IvrPrompt=>({key,text});
const gather=(callId:string,state:string,key:string,text:string,minDigits:number,maxDigits:number):IvrProviderResponse=>({callId,state,commands:[{type:"GATHER",prompt:prompt(key,text),minDigits,maxDigits,timeoutSeconds:10,finishOnKey:"#"}]});
const hangup=(callId:string,state:string,key:string,text:string):IvrProviderResponse=>({callId,state,commands:[{type:"PLAY",prompt:prompt(key,text)},{type:"HANGUP"}]});

export async function handle(provider:string,event:IvrProviderEvent):Promise<IvrProviderResponse>{return withTransaction(async db=>{
 await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[provider,event.eventId]);const prior=(await db.query<{response:IvrProviderResponse}>(`SELECT response FROM diagnostic_ivr_events WHERE provider=$1 AND provider_event_id=$2`,[provider,event.eventId])).rows[0];if(prior)return prior.response;
 let call:CallRow|undefined;if(event.type==="START"){await db.query(`INSERT INTO diagnostic_ivr_calls(ivr_call_id,provider,provider_call_id,caller_phone,expires_at) VALUES($1,$2,$3,$4,now()+interval '20 minutes') ON CONFLICT(provider,provider_call_id) DO NOTHING`,[randomUUID(),provider,event.callId,event.callerNumber]);call=(await db.query<CallRow>(`SELECT * FROM diagnostic_ivr_calls WHERE provider=$1 AND provider_call_id=$2 FOR UPDATE`,[provider,event.callId])).rows[0];}else call=(await db.query<CallRow>(`SELECT * FROM diagnostic_ivr_calls WHERE provider=$1 AND provider_call_id=$2 AND expires_at>now() FOR UPDATE`,[provider,event.callId])).rows[0];
 if(!call)throw new Error("Diagnostic status call not found or expired.");let response:IvrProviderResponse;
 if(event.type==="HANGUP"){call.terminal=true;response={callId:event.callId,state:"HUNG_UP",commands:[{type:"HANGUP"}]};}
 else if(event.type==="START")response=gather(event.callId,"LANGUAGE","diagnostic-language",copy.language,1,1);
 else if(event.type==="TIMEOUT")response=hangup(event.callId,"FAILED","diagnostic-timeout",copy.invalid[call.language]);
 else if(call.state==="LANGUAGE"){const language:Lang=event.digits==="2"?"mr":event.digits==="3"?"en":"hi";call.language=language;call.state="TRACKING";response=gather(event.callId,"TRACKING","diagnostic-tracking",copy.tracking[language],7,7);}
 else if(call.state==="TRACKING"&&event.digits){call.tracking_code=`D${event.digits.replace(/#/g,"")}`;call.state="CONFIRM_PHONE";response=gather(event.callId,"CONFIRM_PHONE","diagnostic-confirm-phone",copy.confirm[call.language],1,1);}
 else if(call.state==="CONFIRM_PHONE"&&event.digits==="1"&&call.tracking_code){const order=(await db.query<{status:string}>(`SELECT o.status FROM diagnostic_orders o JOIN patients p USING(patient_id) WHERE o.tracking_code=$1 AND p.phone=$2`,[call.tracking_code,call.caller_phone])).rows[0];call.terminal=true;call.state="COMPLETED";response=order?hangup(event.callId,"COMPLETED","diagnostic-status",copy.states[order.status]?.[call.language]??copy.states["CREATED"]![call.language]):hangup(event.callId,"COMPLETED","diagnostic-not-found",copy.invalid[call.language]);}
 else response=hangup(event.callId,"FAILED","diagnostic-invalid",copy.invalid[call.language]);
 await db.query(`UPDATE diagnostic_ivr_calls SET language=$2,state=$3,tracking_code=$4,terminal=$5 WHERE ivr_call_id=$1`,[call.ivr_call_id,call.language,call.state,call.tracking_code,call.terminal]);await db.query(`INSERT INTO diagnostic_ivr_events(provider,provider_event_id,ivr_call_id,event_type,response) VALUES($1,$2,$3,$4,$5)`,[provider,event.eventId,call.ivr_call_id,event.type,response]);return response;
 });}
