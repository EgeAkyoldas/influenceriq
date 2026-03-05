import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.TURSO_AUTH_TOKEN;

  // Try multiple possible URL formats
  const urls = [
    'https://lionalyze.atticawe-aws-eu-west-1.turso.io',
    'https://lionalyze-atticawe.aws-eu-west-1.turso.io',
    'https://lionalyze-atticawe.turso.io',
    'https://lionalyze.atticawe.turso.io',
  ];

  const results: Record<string, unknown>[] = [];

  for (const baseUrl of urls) {
    try {
      const res = await fetch(`${baseUrl}/v2/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            { type: 'execute', stmt: { sql: "SELECT 1 as test" } },
            { type: 'close' },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await res.json();
      results.push({ url: baseUrl, status: res.status, ok: res.ok, data });
    } catch (err) {
      results.push({ url: baseUrl, error: (err as Error).message });
    }
  }

  return NextResponse.json({ nodeVersion: process.version, results });
}
