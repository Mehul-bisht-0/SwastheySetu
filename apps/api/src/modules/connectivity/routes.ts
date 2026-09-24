import type { FastifyInstance } from "fastify";
import * as connectivity from "@swasthyasetu/contracts/connectivity";
import { requireAuth,requireRole } from "../../plugins/auth.ts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import { pushPatient,pushProvider } from "./service.ts";
export async function providerConnectivityRoutes(app:FastifyInstance):Promise<void>{app.post("/push",{onRequest:[requireProvider],config:{rateLimit:{max:600,timeWindow:"1 minute"}}},async req=>({ok:true,data:await pushProvider(req.providerActor!,connectivity.providerPushRequest.parse(req.body).operations)}));}
export async function patientConnectivityRoutes(app:FastifyInstance):Promise<void>{app.post("/push",{onRequest:[requireAuth,requireRole("PATIENT")],config:{rateLimit:{max:600,timeWindow:"1 minute"}}},async req=>({ok:true,data:await pushPatient(req.user.sub,connectivity.patientPushRequest.parse(req.body).operations)}));}
