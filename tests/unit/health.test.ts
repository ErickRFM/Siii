import { describe, it, expect } from 'vitest';
import { GET as healthGET } from '@/app/api/health/route';
import { GET as readyGET } from '@/app/api/ready/route';

describe('health endpoints', () => {
  it('returns ok for health', async () => {
    const res = await healthGET();
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('returns ready for readiness', async () => {
    const res = await readyGET();
    const json = await res.json();
    expect(json.status).toBe('ready');
  });
});