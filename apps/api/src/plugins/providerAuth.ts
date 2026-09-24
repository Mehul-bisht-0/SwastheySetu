import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "./errors.ts";
import { sha256 } from "../util/hash.ts";
import { actorByTokenHash, type ProviderActor } from "../modules/provider-auth/repo.ts";

declare module "fastify" {
  interface FastifyRequest { providerActor: ProviderActor | null }
}

function bearer(req: FastifyRequest): string | null {
  const value = req.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export function registerProviderAuth(app: FastifyInstance): void {
  app.decorateRequest("providerActor", null);
}

export async function requireProvider(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = bearer(req);
  if (!token) throw unauthorized("Provider sign in required.");
  const actor = await actorByTokenHash(sha256(token));
  if (!actor) throw unauthorized("Provider session is no longer valid.");
  req.providerActor = actor;
}

export function requireProviderRole(...roles: ProviderActor["role"][]) {
  return async function roleGuard(req: FastifyRequest): Promise<void> {
    if (!req.providerActor) throw unauthorized("Provider sign in required.");
    if (!roles.includes(req.providerActor.role)) throw forbidden("Your provider role cannot perform this action.");
  };
}
