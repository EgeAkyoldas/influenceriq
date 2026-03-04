import { NextRequest } from 'next/server';
import { streamWithFallback } from '@/lib/services/gemini-client';
import { getDb } from '@/lib/db';

function fetchDBContext() {
  const db = getDb();

  // Lead status counts
  const leadStats = db.prepare(`
    SELECT fetch_status, COUNT(*) as count FROM leads GROUP BY fetch_status
  `).all() as Array<{ fetch_status: string; count: number }>;

  const totalLeads = leadStats.reduce((s, r) => s + r.count, 0);
  const statusMap = Object.fromEntries(leadStats.map(r => [r.fetch_status, r.count]));

  // Niche distribution
  const nicheStats = db.prepare(`
    SELECT csv_niche, COUNT(*) as count FROM leads WHERE csv_niche IS NOT NULL GROUP BY csv_niche ORDER BY count DESC LIMIT 10
  `).all() as Array<{ csv_niche: string; count: number }>;

  // Top candidates (Tier A/B with highest authority)
  const topCandidates = db.prepare(`
    SELECT p.username, p.followers_count, a.primary_cluster, a.tier, a.authority_score, a.engagement_rate, a.content_summary
    FROM analysis_results a
    JOIN profiles p ON p.id = a.profile_id
    WHERE a.tier IN ('A', 'B')
    ORDER BY a.authority_score DESC
    LIMIT 15
  `).all() as Array<{
    username: string; followers_count: number; primary_cluster: string;
    tier: string; authority_score: number; engagement_rate: number; content_summary: string;
  }>;

  // Tier distribution
  const tierStats = db.prepare(`
    SELECT tier, COUNT(*) as count FROM analysis_results WHERE tier IS NOT NULL GROUP BY tier ORDER BY tier
  `).all() as Array<{ tier: string; count: number }>;

  // Recent batch job
  const lastBatch = db.prepare(`
    SELECT * FROM batch_jobs ORDER BY id DESC LIMIT 1
  `).get() as { status: string; total_leads: number; processed: number; fetched: number; errors: number; unfetchable: number } | undefined;

  // Cluster distribution
  const clusterStats = db.prepare(`
    SELECT primary_cluster, COUNT(*) as count FROM analysis_results WHERE primary_cluster IS NOT NULL GROUP BY primary_cluster ORDER BY count DESC
  `).all() as Array<{ primary_cluster: string; count: number }>;

  return {
    totalLeads,
    statusMap,
    nicheStats,
    topCandidates,
    tierStats,
    lastBatch,
    clusterStats,
  };
}

function buildSystemPrompt(context: ReturnType<typeof fetchDBContext>): string {
  const candidateList = context.topCandidates.map(c =>
    `@${c.username} — ${c.primary_cluster}, Tier ${c.tier}, Authority: ${c.authority_score}/10, Followers: ${c.followers_count?.toLocaleString()}, ER: ${c.engagement_rate?.toFixed(2)}%`
  ).join('\n');

  const nicheList = context.nicheStats.map(n => `${n.csv_niche}: ${n.count}`).join(', ');
  const tierList = context.tierStats.map(t => `Tier ${t.tier}: ${t.count}`).join(', ');
  const clusterList = context.clusterStats.map(c => `${c.primary_cluster}: ${c.count}`).join(', ');

  return `Sen InfluencerIQ platformunun AI asistanısın. Kullanıcıya platform, veriler ve analizler hakkında yardımcı olursun.

## Platform Hakkında
InfluencerIQ, erkek odaklı Instagram nişlerinde influencer keşfi ve analizi yapar. CSV'den lead import eder, Instagram API ile profil çeker, AI ile sınıflandırır.

## Niche Taxonomy
- **dating**: Erkek flörtü, çekicilik, dating tavsiyeleri
- **mindset**: Kişisel gelişim, motivasyon, disiplin, stoikçilik
- **relationships**: İlişki tavsiyeleri, evlilik, iletişim
- **masculinity**: Erkeklik, fitness, yaşam tarzı, kardeşlik

## Tier Sistemi
- **A** (authority 8-10): Elit influencer, yüksek otorite
- **B** (6-7.9): İyi influencer
- **C** (4-5.9): Orta seviye
- **D** (<4): Düşük kalite

## Canlı Veriler (Şu An)

### Lead İstatistikleri
- Toplam: ${context.totalLeads} lead
- Pending: ${context.statusMap.pending || 0}
- Fetched: ${context.statusMap.fetched || 0}
- Unfetchable: ${context.statusMap.unfetchable || 0}
- Error: ${context.statusMap.error || 0}
- Fetching: ${context.statusMap.fetching || 0}

### Niche Dağılımı (CSV)
${nicheList || 'Veri yok'}

### Tier Dağılımı (Analiz Edilenler)
${tierList || 'Henüz analiz yapılmadı'}

### Cluster Dağılımı (AI Sınıflandırma)
${clusterList || 'Henüz sınıflandırma yapılmadı'}

### En İyi Adaylar (Top 15)
${candidateList || 'Henüz aday yok'}

### Son Batch İşi
${context.lastBatch ? `Status: ${context.lastBatch.status}, Total: ${context.lastBatch.total_leads}, Processed: ${context.lastBatch.processed}, Fetched: ${context.lastBatch.fetched}, Errors: ${context.lastBatch.errors}` : 'Henüz batch çalışmadı'}

## Pipeline Akışı
CSV Import → URL Parse → Dedup → DB Upsert → Batch Fetch (Rate Limited, 5s) → Instagram API → Store Profile + Media → Pre-Filter (min followers, engagement, English) → AI Analysis (Gemini) → Classification (cluster + tier + scores) → Candidates

## Kurallar
- Türkçe yanıt ver (kullanıcı Türkçe yazıyorsa)
- Kısa ve net ol, gereksiz uzun cevaplar verme
- Verilere dayalı somut yanıtlar ver
- Kullanıcıya yol göster, öneriler sun
- Markdown formatla (bold, listeler, tablolar kullan)
- Pipeline ve sistem hakkında sorulara teknik detayla yanıt ver`;
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
    }

    const context = fetchDBContext();
    const systemPrompt = buildSystemPrompt(context);

    // Build conversation history for Gemini
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

    // Stream response via SSE
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
