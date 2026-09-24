import type { FastifyInstance } from "fastify";
import { abdm } from "@swasthyasetu/contracts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import { createCarePacket, publishRecord } from "../mock-abdm/service.ts";

export async function providerRecordRoutes(app:FastifyInstance):Promise<void>{
  app.post("/records",{onRequest:[requireProvider]},async(req,reply)=>{const data=await publishRecord(req.providerActor!,abdm.createRecordRequest.parse(req.body));reply.code(201);return{ok:true,data};});
  app.post("/care-packets",{onRequest:[requireProvider]},async(req,reply)=>{const data=await createCarePacket(req.providerActor!,abdm.createCarePacketRequest.parse(req.body));reply.code(201);return{ok:true,data};});
}
