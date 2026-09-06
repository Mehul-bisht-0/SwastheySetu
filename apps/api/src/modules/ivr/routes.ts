/** STATUS: Implemented — authenticated provider webhook only. */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ivrWebhookParams } from '@swasthyasetu/contracts/ivr';
import { AppError, unauthorized } from '../../plugins/errors.ts';
import { prototypeJsonAdapter } from './adapter.ts';
import * as service from './service.ts';

function authenticate(value: string|undefined): void {
  const expected=process.env['IVR_WEBHOOK_SECRET'];
  if (!expected || expected.length < 32) throw new AppError('INTERNAL','IVR webhook is not configured.',503);
  if (!value) throw unauthorized('Valid provider authentication is required.');
  const supplied=Buffer.from(value), wanted=Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied,wanted)) throw unauthorized('Valid provider authentication is required.');
}

export async function ivrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onSend',async (_req,reply,payload) => { reply.header('Cache-Control','no-store'); return payload; });
  app.post('/webhooks/:provider',{ config: { rateLimit: { max: 60,timeWindow: '1 minute' } } },async req => {
    authenticate(typeof req.headers['x-ivr-webhook-secret'] === 'string' ? req.headers['x-ivr-webhook-secret'] : undefined);
    const { provider }=ivrWebhookParams.parse(req.params);
    const event=prototypeJsonAdapter.parse(req.body);
    return prototypeJsonAdapter.render(await service.handle(provider,event));
  });
}
