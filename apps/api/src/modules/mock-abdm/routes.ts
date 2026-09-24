import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { abdm, common } from "@swasthyasetu/contracts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import * as service from "./service.ts";

const idParam=z.object({id:common.uuid});
const timelineQuery=z.object({patientId:common.uuid,consentGrantId:common.uuid,includeBundle:z.coerce.boolean().default(false)});

export async function mockAbdmRoutes(app:FastifyInstance):Promise<void>{
  app.get("/registry",async()=>({ok:true,data:await service.listRegistry()}));
  app.post("/discovery/lookup",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.lookupPatient(abdm.patientLookupRequest.parse(req.body).identifier)}));

  app.post("/consents",{onRequest:[requireProvider]},async(req,reply)=>{const actor=req.providerActor!;const data=await service.requestConsent(actor,abdm.createConsentRequest.parse(req.body));reply.code(201);return{ok:true,data};});
  app.get("/consents",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.listProviderConsents(req.providerActor!)}));
  app.get("/patient/consents",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.listPatientConsents(req.user.sub)}));
  app.post("/patient/consents/:id/decision",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.decideConsent(req.user.sub,idParam.parse(req.params).id,abdm.decideConsentRequest.parse(req.body))}));
  app.post("/patient/consents/:id/revoke",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.revokeConsent(req.user.sub,idParam.parse(req.params).id)}));

  app.get("/records/timeline",{onRequest:[requireProvider]},async req=>{const q=timelineQuery.parse(req.query);return{ok:true,data:await service.providerTimeline(req.providerActor!,q.patientId,q.consentGrantId,q.includeBundle)};});
  app.get("/patient/records/timeline",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.ownTimeline(req.user.sub)}));
  app.get("/patient/care-contexts",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.contexts(req.user.sub)}));
  app.post("/patient/care-contexts/:id/link",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.linkContext(req.user.sub,idParam.parse(req.params).id)}));
  app.get("/patient/access-history",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.accessHistory(req.user.sub)}));
}
