import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { abdm, common } from "@swasthyasetu/contracts";
import { requireAuth, requireRole } from "../../plugins/auth.ts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import * as service from "./service.ts";
const params=z.object({id:common.uuid});
export async function referralRoutes(app:FastifyInstance):Promise<void>{
 app.post("/",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.createReferral(req.providerActor!,abdm.createReferralRequest.parse(req.body));reply.code(201);return{ok:true,data};});
 app.get("/",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.listReferrals(req.providerActor!)}));
 app.post("/:id/transitions",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionReferral(req.providerActor!,params.parse(req.params).id,abdm.transitionReferralRequest.parse(req.body))}));
 app.get("/patient",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.patientReferrals(req.user.sub)}));
}
