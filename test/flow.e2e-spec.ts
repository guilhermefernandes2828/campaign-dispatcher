import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createValidationPipe } from '../src/common/validation';
import { DISPATCH_QUEUE } from '../src/dispatch/dispatch.constants';
import { DispatchJobData } from '../src/dispatch/dispatch.types';
import { DispatchService } from '../src/dispatch/dispatch.service';
import { PrismaService } from '../src/prisma/prisma.service';

type DispatchBody = {
  contactId: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  events: Array<{ status: string }>;
};

type CampaignBody = {
  id: string;
  status: string;
  dispatches: DispatchBody[];
};

const webhookSecret = process.env.WEBHOOK_SECRET ?? 'test-webhook-secret';

async function waitFor(
  load: () => Promise<CampaignBody>,
  ready: (campaign: CampaignBody) => boolean,
): Promise<CampaignBody> {
  const started = Date.now();
  let last: CampaignBody | undefined;
  while (Date.now() - started < 15_000) {
    last = await load();
    if (ready(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Tempo esgotado esperando a campanha: ${JSON.stringify(last)}`);
}

describe('fluxo de disparo', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let dispatchService: DispatchService;

  beforeAll(async () => {
    try {
      execSync('npx prisma migrate deploy', {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
        env: process.env,
      });
    } catch {
      throw new Error(
        'Postgres inacessível. Suba a infra com: docker compose up -d postgres redis',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.enableShutdownHooks();
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    dispatchService = app.get(DispatchService);

    const queue = app.get<Queue<DispatchJobData>>(getQueueToken(DISPATCH_QUEUE));
    await queue.pause();
    await queue.obliterate({ force: true });
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
    await queue.resume();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(email: string) {
    const response = await request(server).post('/auth/register').send({
      email,
      password: 'senha-segura',
    });
    expect(response.status).toBe(201);
    return response.body as { accessToken: string; user: { id: string } };
  }

  async function loadCampaign(token: string, id: string): Promise<CampaignBody> {
    const response = await request(server)
      .get(`/campaigns/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return response.body as CampaignBody;
  }

  it('exige JWT para criar campanha e segredo para o webhook', async () => {
    const missingToken = await request(server).post('/campaigns').send({});
    expect(missingToken.status).toBe(401);

    const missingSecret = await request(server).post('/webhooks/status').send({});
    expect(missingSecret.status).toBe(401);

    const health = await request(server).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
  });

  it('enfileira WhatsApp, confirma o webhook uma vez e não reenvia', async () => {
    const owner = await register('ana@example.com');
    const login = await request(server).post('/auth/login').send({
      email: 'ana@example.com',
      password: 'senha-segura',
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    expect(token).toBeTruthy();

    const created = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Oferta de sexta',
        channel: 'WHATSAPP',
        message: 'Oi {{name}}, temos uma oferta',
        contacts: [
          { name: 'Ana', phone: '+5511999990001' },
          { name: 'Bruno', phone: '+5511999990002' },
          { name: 'Ana de novo', phone: '+5511999990001' },
        ],
      });
    expect(created.status).toBe(201);
    expect(created.body.enqueued).toBe(2);
    const campaignId = created.body.campaign.id as string;

    const sent = await waitFor(
      () => loadCampaign(token, campaignId),
      (campaign) =>
        campaign.status === 'COMPLETED' &&
        campaign.dispatches.every(
          (dispatch) => dispatch.status === 'SENT' && dispatch.attempts === 1 && !!dispatch.providerMessageId,
        ),
    );
    expect(sent.dispatches).toHaveLength(2);
    expect(sent.dispatches.every((dispatch) => dispatch.providerMessageId?.startsWith('wa_'))).toBe(true);

    for (const dispatch of sent.dispatches) {
      await expect(
        dispatchService.execute({ campaignId, contactId: dispatch.contactId }),
      ).resolves.toBe('skipped');
    }

    const sends = await prisma.providerSend.count({ where: { campaignId } });
    expect(sends).toBe(2);
    const reread = await loadCampaign(token, campaignId);
    expect(reread.dispatches.every((dispatch) => dispatch.attempts === 1)).toBe(true);

    const target = reread.dispatches[0];
    const payload = {
      provider: 'WHATSAPP',
      campaignId,
      contactId: target.contactId,
      status: 'DELIVERED',
      providerMessageId: target.providerMessageId,
    };
    const delivered = await request(server)
      .post('/webhooks/status')
      .set('x-webhook-secret', webhookSecret)
      .send(payload);
    expect(delivered.status).toBe(200);
    expect(delivered.body).toMatchObject({
      campaignId,
      contactId: target.contactId,
      applied: true,
      duplicate: false,
      stale: false,
      status: 'DELIVERED',
    });

    const duplicate = await request(server)
      .post('/webhooks/status')
      .set('x-webhook-secret', webhookSecret)
      .send(payload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({
      applied: false,
      duplicate: true,
      status: 'DELIVERED',
    });

    const stale = await request(server)
      .post('/webhooks/status')
      .set('x-webhook-secret', webhookSecret)
      .send({ ...payload, status: 'SENT' });
    expect(stale.status).toBe(200);
    expect(stale.body).toMatchObject({ applied: false, stale: true, status: 'DELIVERED' });

    const mismatch = await request(server)
      .post('/webhooks/status')
      .set('x-webhook-secret', webhookSecret)
      .send({ ...payload, provider: 'ADS', status: 'READ' });
    expect(mismatch.status).toBe(409);

    const afterWebhook = await loadCampaign(token, campaignId);
    const updated = afterWebhook.dispatches.find((dispatch) => dispatch.contactId === target.contactId);
    expect(updated?.status).toBe('DELIVERED');
    expect(updated?.events).toEqual([expect.objectContaining({ status: 'DELIVERED' })]);

    const requeue = await request(server)
      .post(`/campaigns/${campaignId}/enqueue`)
      .set('Authorization', `Bearer ${token}`);
    expect(requeue.status).toBe(201);
    expect(requeue.body).toEqual({ campaignId, enqueued: 0 });

    const stranger = await register('outro@example.com');
    const hidden = await request(server)
      .get(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(hidden.status).toBe(404);
    expect(owner.user.id).not.toBe(stranger.user.id);
  });

  it('enfileira um público de Ads', async () => {
    const { accessToken } = await register('ads@example.com');
    const created = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Lookalike',
        channel: 'ADS',
        message: 'Criativo {{externalId}}',
        contacts: [{ name: 'Segmento A', externalId: 'aud-100' }],
      });
    expect(created.status).toBe(201);
    expect(created.body.enqueued).toBe(1);

    const sent = await waitFor(
      () => loadCampaign(accessToken, created.body.campaign.id as string),
      (campaign) => campaign.dispatches[0]?.status === 'SENT',
    );
    expect(sent.dispatches[0].providerMessageId).toMatch(/^ads_/);
    expect(sent.status).toBe('COMPLETED');
  });

  it('esgota as tentativas quando o provider recusa o destino', async () => {
    process.env.MOCK_REJECT_TO = '+5511888880000';
    try {
      const { accessToken } = await register('falha@example.com');
      const created = await request(server)
        .post('/campaigns')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Destino inválido',
          channel: 'WHATSAPP',
          message: 'não deve sair',
          contacts: [{ name: 'Caio', phone: '+5511888880000' }],
        });
      expect(created.status).toBe(201);
      const campaignId = created.body.campaign.id as string;

      const failed = await waitFor(
        () => loadCampaign(accessToken, campaignId),
        (campaign) => campaign.status === 'FAILED' && campaign.dispatches[0]?.status === 'FAILED',
      );
      expect(failed.dispatches[0].attempts).toBe(3);
      expect(failed.dispatches[0].providerMessageId).toBeNull();
      const sends = await prisma.providerSend.count({ where: { campaignId } });
      expect(sends).toBe(0);
    } finally {
      process.env.MOCK_REJECT_TO = '';
    }
  });
});
