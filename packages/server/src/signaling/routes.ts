import express, { type NextFunction, type Request, type Response } from 'express';
import {
  InviteAnswerAlreadySubmittedError,
  InvitePayloadTooLargeError,
  InviteStore,
  InviteStoreFullError,
  InviteValidationError,
} from './InviteStore';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITED_PAYLOAD = {
  error: 'RATE_LIMITED',
  message: '请求过于频繁，请稍后再试。',
} as const;

export function createSignalingRouter(store = new InviteStore()): express.Router {
  const router = express.Router();
  const createInviteRateLimit = createIpRateLimiter(20);
  const pollAnswerRateLimit = createIpRateLimiter(120);
  const submitAnswerRateLimit = createIpRateLimiter(60);

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/invites', createInviteRateLimit, (req, res) => {
    try {
      const record = store.create({
        roomId: req.body?.roomId,
        hostOffer: req.body?.hostOffer,
        hostName: req.body?.hostName,
        ttlMs: req.body?.ttlMs,
      });
      res.status(201).json({
        inviteId: record.inviteId,
        roomId: record.roomId,
        hostName: record.hostName,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/invites/:inviteId', (req, res) => {
    const record = store.get(req.params.inviteId);
    if (!record) {
      res.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'invite 不存在或已过期。' });
      return;
    }
    res.json({
      inviteId: record.inviteId,
      roomId: record.roomId,
      hostOffer: record.hostOffer,
      hostName: record.hostName,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      hasAnswer: Boolean(record.answer),
    });
  });

  router.post('/invites/:inviteId/answer', submitAnswerRateLimit, (req, res) => {
    try {
      const record = store.submitAnswer(req.params.inviteId, {
        answer: req.body?.answer,
        playerName: req.body?.playerName,
      });
      if (!record) {
        res.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'invite 不存在或已过期。' });
        return;
      }
      res.status(201).json({ ok: true, inviteId: record.inviteId, roomId: record.roomId, expiresAt: record.expiresAt });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/invites/:inviteId/answer', pollAnswerRateLimit, (req, res) => {
    const record = store.get(req.params.inviteId);
    if (!record) {
      res.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'invite 不存在或已过期。' });
      return;
    }
    const answer = store.getAnswer(req.params.inviteId);
    if (!answer) {
      res.status(204).send();
      return;
    }
    res.json(answer);
  });

  router.delete('/invites/:inviteId', (req, res) => {
    const deleted = store.delete(req.params.inviteId);
    if (!deleted) {
      res.status(404).json({ error: 'INVITE_NOT_FOUND', message: 'invite 不存在或已过期。' });
      return;
    }
    res.status(204).send();
  });

  return router;
}

export function getClientIp(req: Request): string {
  const directIp = typeof req.ip === 'string' ? req.ip.trim() : '';
  if (directIp) return directIp;

  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
    if (firstForwardedIp) return firstForwardedIp;
  }

  return req.socket.remoteAddress ?? 'unknown';
}

function createIpRateLimiter(maxRequestsPerMinute: number) {
  const buckets = new Map<string, { windowStart: number; count: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = getClientIp(req);
    const bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      buckets.set(ip, { windowStart: now, count: 1 });
      cleanupRateLimitBuckets(buckets, now);
      next();
      return;
    }

    if (bucket.count >= maxRequestsPerMinute) {
      res.status(429).json(RATE_LIMITED_PAYLOAD);
      return;
    }

    bucket.count += 1;
    next();
  };
}

function cleanupRateLimitBuckets(buckets: Map<string, { windowStart: number; count: number }>, now: number): void {
  for (const [ip, bucket] of buckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      buckets.delete(ip);
    }
  }
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof InviteValidationError) {
    res.status(error.status).json({ error: 'INVALID_INVITE', message: error.message });
    return;
  }
  if (error instanceof InvitePayloadTooLargeError) {
    res.status(error.status).json({ error: 'SIGNAL_TOO_LARGE', message: error.message });
    return;
  }
  if (error instanceof InviteStoreFullError) {
    res.status(error.status).json({ error: 'INVITE_STORE_FULL', message: error.message });
    return;
  }
  if (error instanceof InviteAnswerAlreadySubmittedError) {
    res.status(error.status).json({ error: 'ANSWER_ALREADY_SUBMITTED', message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'signaling relay 操作失败。';
  res.status(500).json({ error: 'SIGNALING_RELAY_ERROR', message });
}
