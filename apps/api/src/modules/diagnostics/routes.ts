import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as diagnostics from "@swasthyasetu/contracts/diagnostics";
import { common } from "@swasthyasetu/contracts";
import { requireAuth,requireRole } from "../../plugins/auth.ts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import * as service from "./service.ts";

const id=z.object({id:common.uuid});
const ashaSignal=z.object({
 operationId:common.uuid,
 payload:z.object({
  serviceId:common.uuid,
  evidenceType:diagnostics.serviceEvidenceType,
  observedAt:common.isoDateTime,
  note:z.string().trim().max(500).optional(),
 }),
});
export async function diagnosticRoutes(app:FastifyInstance):Promise<void>{
 app.get("/reference",async req=>({ok:true,data:await service.reference(diagnostics.diagnosticReferenceQuery.parse(req.query))}));
 app.get("/services/search",async req=>({ok:true,data:await service.search(diagnostics.diagnosticSearchQuery.parse(req.query))}));
 app.post("/signals/push",{onRequest:[requireAuth,requireRole("ASHA","SUPERVISOR","ADMIN")]},async req=>{const input=z.object({operations:z.array(ashaSignal).min(1).max(50)}).parse(req.body);const data=[];for(const op of input.operations){try{const result=await service.addAshaEvidence(req.user.sub,req.user.district,{operationId:op.operationId,...op.payload});data.push({operationId:op.operationId,status:result.created?"APPLIED":"DUPLICATE"});}catch(error){data.push({operationId:op.operationId,status:"REJECTED",message:error instanceof Error?error.message:"Rejected"});}}return{ok:true,data:{results:data,serverTime:new Date().toISOString()}};});
}
export async function providerDiagnosticRoutes(app:FastifyInstance):Promise<void>{
 app.post("/services",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.configure(req.providerActor!,diagnostics.configureServiceRequest.parse(req.body));reply.code(201);return{ok:true,data};});
 app.post("/services/:id/evidence",{onRequest:[requireProvider]},async(req,reply)=>{const body=z.object({operationId:common.uuid,evidenceType:diagnostics.serviceEvidenceType,observedAt:common.isoDateTime,note:z.string().trim().max(500).optional()}).parse(req.body);const data=await service.addEvidence(req.providerActor!,{...body,serviceId:id.parse(req.params).id});reply.code(data.created?201:200);return{ok:true,data};});
 app.post("/orders",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.createOrder(req.providerActor!,diagnostics.createDiagnosticOrderRequest.parse(req.body));reply.code(201);return{ok:true,data};});
 app.get("/orders",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.listProviderOrders(req.providerActor!)}));
 app.get("/orders/:id",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.getProviderOrder(req.providerActor!,id.parse(req.params).id)}));
 app.post("/orders/:id/transitions",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionOrder(req.providerActor!,id.parse(req.params).id,diagnostics.transitionDiagnosticOrderRequest.parse(req.body))}));
 app.post("/orders/:id/appointment",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionAppointment(req.providerActor!,id.parse(req.params).id,diagnostics.transitionDiagnosticAppointmentRequest.parse(req.body))}));
 app.post("/orders/:id/specimen-transitions",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionSpecimen(req.providerActor!,id.parse(req.params).id,diagnostics.transitionSpecimenRequest.parse(req.body))}));
 app.post("/orders/:id/result",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.publishResult(req.providerActor!,id.parse(req.params).id,diagnostics.publishDiagnosticResultRequest.parse(req.body));reply.code(201);return{ok:true,data};});
}
export async function providerDiagnosticServiceRoutes(app:FastifyInstance):Promise<void>{
 app.post("/",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.configure(req.providerActor!,diagnostics.configureServiceRequest.parse(req.body));reply.code(201);return{ok:true,data};});
 app.post("/:id/evidence",{onRequest:[requireProvider]},async(req,reply)=>{const body=z.object({operationId:common.uuid,evidenceType:diagnostics.serviceEvidenceType,observedAt:common.isoDateTime,note:z.string().trim().max(500).optional()}).parse(req.body);const data=await service.addEvidence(req.providerActor!,{...body,serviceId:id.parse(req.params).id});reply.code(data.created?201:200);return{ok:true,data};});
}
export async function providerDiagnosticOrderRoutes(app:FastifyInstance):Promise<void>{
 app.post("/",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.createOrder(req.providerActor!,diagnostics.createDiagnosticOrderRequest.parse(req.body));reply.code(201);return{ok:true,data};});
 app.get("/",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.listProviderOrders(req.providerActor!)}));
 app.get("/:id",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.getProviderOrder(req.providerActor!,id.parse(req.params).id)}));
 app.post("/:id/transitions",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionOrder(req.providerActor!,id.parse(req.params).id,diagnostics.transitionDiagnosticOrderRequest.parse(req.body))}));
 app.post("/:id/appointment",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionAppointment(req.providerActor!,id.parse(req.params).id,diagnostics.transitionDiagnosticAppointmentRequest.parse(req.body))}));
 app.post("/:id/specimen-transitions",{onRequest:[requireProvider]},async req=>({ok:true,data:await service.transitionSpecimen(req.providerActor!,id.parse(req.params).id,diagnostics.transitionSpecimenRequest.parse(req.body))}));
 app.post("/:id/result",{onRequest:[requireProvider]},async(req,reply)=>{const data=await service.publishResult(req.providerActor!,id.parse(req.params).id,diagnostics.publishDiagnosticResultRequest.parse(req.body));reply.code(201);return{ok:true,data};});
}
export async function patientDiagnosticRoutes(app:FastifyInstance):Promise<void>{app.get("/",{onRequest:[requireAuth,requireRole("PATIENT")]},async req=>({ok:true,data:await service.listPatientOrders(req.user.sub)}));}
