import { NextRequest } from 'next/server';
import { streamWithFallback } from '@/lib/services/gemini-client';
import { buildChatSystemPrompt } from '@/lib/prompts/chat-system';
import { getOne, getAll } from '@/lib/db';

async function fetchDBContext() {
  const leadStats = await getAll<{ fetch_status: string; count: number }>(`
    SELECT fetch_status, COUNT(*) as count FROM leads GROUP BY fetch_status
  `);

  const totalLeads = leadStats.reduce((s, r) => s + Number(r.count), 0);
  const statusMap = Object.fromEntries(leadStats.map(r => [r.fetch_status, Number(r.count)]));

  const nicheStats = await getAll<{ csv_niche: string; count: number }>(`
    SELECT csv_niche, COUNT(*) as count FROM leads WHERE csv_niche IS NOT NULL GROUP BY csv_niche ORDER BY count DESC LIMIT 10
  `);

  const sourceStats = await getAll<{ source: string; count: number }>(`
    SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC
  `);

  const topCandidates = await getAll<{
    username: string; followers_count: number; primary_cluster: string;
    tier: string; authority_score: number; engagement_rate: number; content_summary: string;
  }>(`
    SELECT p.username, p.followers_count, a.primary_cluster, a.tier, a.authority_score, a.engagement_rate, a.content_summary
    FROM analysis_results a
    JOIN profiles p ON p.id = a.profile_id
    WHERE a.tier IN ('S', 'A', 'B')
    ORDER BY a.relevance_score DESC, a.authority_score DESC
    LIMIT 15
  `);

  const tierStats = await getAll<{ tier: string; count: number }>(`
    SELECT tier, COUNT(*) as count FROM analysis_results WHERE tier IS NOT NULL GROUP BY tier ORDER BY tier
  `);

  const lastBatch = await getOne<{
    status: string; total_leads: number; processed: number; fetched: number; errors: number; unfetchable: number;
  }>('SELECT * FROM batch_jobs ORDER BY id DESC LIMIT 1');

  const clusterStats = await getAll<{ primary_cluster: string; count: number }>(`
    SELECT primary_cluster, COUNT(*) as count FROM analysis_results WHERE primary_cluster IS NOT NULL GROUP BY primary_cluster ORDER BY count DESC
  `);

  const recentLeads = await getAll<{ username: string; source: string; fetch_status: string }>(`
    SELECT username, source, fetch_status FROM leads ORDER BY created_at DESC LIMIT 10
  `);

  return { totalLeads, statusMap, nicheStats, sourceStats, topCandidates, tierStats, lastBatch, clusterStats, recentLeads };
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
    }

    const context = await fetchDBContext();
    const systemPrompt = buildChatSystemPrompt({
      ...context,
      lastBatch: context.lastBatch ?? undefined,
    });

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const chunks = await streamWithFallback({
      contents,
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const text of chunks) {
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('[Chat] Stream error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Chat] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Chat error' }),
      { status: 500 }
    );
  }
}
