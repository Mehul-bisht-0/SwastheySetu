import { request, type Envelope } from "./client.ts";
import { PATIENT_TOKEN_KEY } from "../state/patientSession.ts";

export interface ConsentItem { consentRequestId:string;consentGrantId:string|null;purpose:string;requestedHiTypes:string[];approvedHiTypes:string[];status:"REQUESTED"|"GRANTED"|"DENIED"|"REVOKED"|"EXPIRED";validUntil:string;createdAt:string;requestingFacility:{name:string;hfrId:string};requestingPractitioner:{fullName:string;hprId:string};explanation:{en:string;hi:string;mr:string} }
export interface TimelineRecord { recordId:string;recordType:string;title:string;authoredAt:string;authorName:string;sourceFacility:{name:string;hfrId:string};summary:Record<string,unknown> }
export interface CareContext { careContextId:string;display:string;status:"PENDING"|"LINKED"|"UNLINKED";createdAt:string;facility:{name:string;hfrId:string} }
export interface AccessEvent { accessEventId:string;practitionerName:string;facilityName:string;purpose:string;action:string;recordIds:string[];occurredAt:string }
export interface Referral { referralId:string;reason:string;priority:string;requestedService:string;status:string;createdAt:string;updatedAt:string }
const patient=(path:string,method:"GET"|"POST"="GET",body?:unknown)=>request(path,{method,body,tokenKey:PATIENT_TOKEN_KEY});
export const listConsents=():Promise<Envelope<ConsentItem[]>>=>patient("/mock-abdm/patient/consents") as Promise<Envelope<ConsentItem[]>>;
export const decideConsent=(id:string,decision:"APPROVE"|"DENY",approvedHiTypes?:string[]):Promise<Envelope<ConsentItem>>=>patient(`/mock-abdm/patient/consents/${id}/decision`,"POST",{decision,...(approvedHiTypes?{approvedHiTypes}:{})}) as Promise<Envelope<ConsentItem>>;
export const revokeConsent=(id:string):Promise<Envelope<ConsentItem>>=>patient(`/mock-abdm/patient/consents/${id}/revoke`,"POST",{}) as Promise<Envelope<ConsentItem>>;
export const getTimeline=():Promise<Envelope<{records:TimelineRecord[]}>>=>patient("/mock-abdm/patient/records/timeline") as Promise<Envelope<{records:TimelineRecord[]}>>;
export const getContexts=():Promise<Envelope<CareContext[]>>=>patient("/mock-abdm/patient/care-contexts") as Promise<Envelope<CareContext[]>>;
export const linkContext=(id:string):Promise<Envelope<{careContextId:string;status:string}>>=>patient(`/mock-abdm/patient/care-contexts/${id}/link`,"POST",{}) as Promise<Envelope<{careContextId:string;status:string}>>;
export const getAccessHistory=():Promise<Envelope<AccessEvent[]>>=>patient("/mock-abdm/patient/access-history") as Promise<Envelope<AccessEvent[]>>;
export const getReferrals=():Promise<Envelope<Referral[]>>=>patient("/referrals/patient") as Promise<Envelope<Referral[]>>;
