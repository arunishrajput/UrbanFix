import { describe, expect, it } from 'vitest';
import { redisUrl } from '../../src/config';

describe('REDIS_URL', () => {
  it('upgrades Upstash redis:// URLs to TLS', () => {
    expect(redisUrl.parse('redis://default:pw@eu1-cool-cat-123.upstash.io:6379')).toBe(
      'rediss://default:pw@eu1-cool-cat-123.upstash.io:6379',
    );
    expect(redisUrl.parse('rediss://default:pw@eu1-cool-cat-123.upstash.io:6379')).toBe(
      'rediss://default:pw@eu1-cool-cat-123.upstash.io:6379',
    );
  });

  it('leaves other servers alone and tolerates pasted quotes and whitespace', () => {
    expect(redisUrl.parse('redis://redis:6379')).toBe('redis://redis:6379');
    expect(redisUrl.parse(' "redis://localhost:6379"\n')).toBe('redis://localhost:6379');
    expect(redisUrl.parse(undefined)).toBe('redis://localhost:6379');
  });

  it('rejects the Upstash REST URL and URLs without a scheme', () => {
    for (const bad of ['https://eu1-cool-cat-123.upstash.io', 'default:pw@host:6379', '']) {
      const result = redisUrl.safeParse(bad);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/rediss:\/\//);
    }
  });
});
