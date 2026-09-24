import type { FastifyInstance } from "fastify";
import { abdm } from "@swasthyasetu/contracts";
import { requireProvider } from "../../plugins/providerAuth.ts";
import { loginProvider, providerView } from "./service.ts";
import { deleteSession } from "./repo.ts";
import { sha256 } from "../../util/hash.ts";

export async function providerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => ({
    ok: true,
    data: await loginProvider(abdm.providerLoginRequest.parse(req.body)),
  }));
  app.get("/me", { onRequest: [requireProvider] }, async (req) => ({ ok: true, data: providerView(req.providerActor!) }));
  app.post("/logout", { onRequest: [requireProvider] }, async (req) => {
    const token=req.headers.authorization?.slice(7);
    if(token)await deleteSession(sha256(token));
    return { ok:true,data:{ signedOut:true } };
  });
}
