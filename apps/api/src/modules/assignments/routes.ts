/** STATUS: Implemented — authenticated HTTP only. */
import type { FastifyInstance } from 'fastify';
import * as schemas from '@swasthyasetu/contracts/assignments';
import * as service from './service.ts';
import { requireAuth } from '../../plugins/auth.ts';
export async function assignmentRoutes(app: FastifyInstance) {
  app.addHook('onRequest',requireAuth);
  app.addHook('onSend',async (_req,reply,payload) => { reply.header('Cache-Control','no-store'); return payload; });
  app.get('/directory',async req => ({ ok: true, data: await service.directory(req.user.sub) }));
  app.post('/roster',async req => {
    const input = schemas.rosterChange.parse(req.body);
    return { ok: true, data: await service.setRoster(req.user.sub,input.villageId,input.ashaId) };
  });
  app.get('/cases',async req => ({ ok: true, data: await service.list(req.user.sub,schemas.listQuery.parse(req.query).offset) }));
  app.post('/cases',async (req,reply) => {
    const data = await service.create(req.user.sub,schemas.createCase.parse(req.body));
    reply.code(201); return { ok: true,data };
  });
  app.get('/cases/:id',async req => ({ ok: true, data: await service.detail(req.user.sub,schemas.caseIdParam.parse(req.params).id) }));
  app.get('/cases/:id/history',async req => ({ ok: true, data: await service.history(req.user.sub,schemas.caseIdParam.parse(req.params).id) }));
  app.post('/cases/:id',async req => ({ ok: true, data: await service.change(req.user.sub,schemas.caseIdParam.parse(req.params).id,schemas.changeCase.parse(req.body)) }));
}
