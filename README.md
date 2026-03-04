# InfluencerIQ — Instagram Intelligence Platform

> Instagram influencer'larını toplu olarak analiz eden, sınıflandıran ve yöneten bir veri istihbarat platformu.

---

## Ne İşe Yarar?

InfluencerIQ, erkek odaklı Instagram nişlerinde (dating, mindset, masculinity, relationships) influencer keşfi ve analizi yapar. CSV dosyasından binlerce Instagram kullanıcı adını import eder, Instagram API üzerinden profillerini ve son paylaşımlarını çeker, AI ile sınıflandırır ve raporlar.

**Kısaca:**
```
CSV (9.600 kullanıcı) → Instagram API → Profil Verisi → AI Analiz → Sınıflandırma → Raporlama
```

---

## Teknoloji

| Katman | Teknoloji | Versiyon |
|--------|-----------|----------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui + Radix UI | — |
| Animations | Framer Motion | 12.x |
| Database | SQLite (better-sqlite3) | — |
| Instagram API | Meta Graph API | v21.0 |
| AI | Google Gemini | 2.0 Flash |
| Auth | JWT + bcrypt | — |

---

## Kurulum

### 1. Bağımlılıkları yükle
```bash
npm install
```

### 2. Environment dosyasını oluştur
```bash
cp .env.example .env.local
```

`.env.local` dosyasını düzenle:
```env
# Instagram API (Meta Graph API)
INSTAGRAM_ACCESS_TOKEN=<token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<instagram-account-id>

# AI (Google Gemini)
GEMINI_API_KEY=<api-key>

# Auth
AUTH_USERNAME=admin
AUTH_PASSWORD=admin123
JWT_SECRET=<random-secret>
```

### 3. Çalıştır
```bash
npm run dev
```
→ http://localhost:3000

---

## Instagram Token Nasıl Alınır?

1. [Meta Developers](https://developers.facebook.com/) → App oluştur (veya mevcut olanı kullan)
2. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) → Token oluştur
3. Gerekli izinler: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`
4. [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) → "Extend Access Token" ile 60 günlük token al
5. Token'ı `.env.local`'a yapıştır

> **Önemli:** `INSTAGRAM_BUSINESS_ACCOUNT_ID` Instagram hesap ID'sidir (17841440...), Facebook User ID değil! Token Debugger'daki "Granular Scopes" → `instagram_basic` altındaki ID'yi kullan.

---

## Proje Yapısı

```
src/
├── app/                          # Next.js sayfalar ve API
│   ├── page.tsx                  # Dashboard (ana sayfa)
│   ├── leads/page.tsx            # Lead yönetimi (CSV import, tablo, batch)
│   ├── candidates/               # Sınıflandırılmış profiller
│   ├── flow/page.tsx             # Veri akışı görselleştirme
│   ├── reports/page.tsx          # Raporlar
│   ├── settings/page.tsx         # Filtre ayarları
│   ├── test/page.tsx             # API test sayfası
│   └── api/
│       ├── chat/route.ts         # AI chatbot API
│       ├── leads/
│       │   ├── route.ts          # CRUD: GET, POST, DELETE
│       │   ├── [id]/route.ts     # Tekil: GET, PUT, DELETE
│       │   ├── batch/route.ts    # Toplu fetch: POST, GET, DELETE
│       │   └── import/route.ts   # CSV import: POST
│       ├── research/             # Araştırma pipeline'ı
│       ├── profiles/             # Profil verileri
│       ├── dashboard/route.ts    # Dashboard istatistikleri
│       └── settings/route.ts     # Ayarlar CRUD
│
├── components/
│   ├── layout/app-shell.tsx      # Sidebar + Header
│   └── ui/                       # shadcn bileşenleri
│
├── lib/
│   ├── db.ts                     # SQLite bağlantısı + şema
│   └── services/
│       ├── instagram-client.ts   # Instagram API istemcisi
│       ├── ai-analyzer.ts        # Gemini AI sınıflandırma
│       ├── pre-filter.ts         # Ön filtre (followers, engagement, vb.)
│       └── research-pipeline.ts  # Tam araştırma orkestratörü
│
└── types/index.ts                # TypeScript tip tanımları

data/
└── influencer-tracker.db         # SQLite veritabanı dosyası
```

---

## Veritabanı

SQLite dosyası `data/influencer-tracker.db` konumunda otomatik oluşturulur.

### Tablolar

| Tablo | Açıklama | Satır Örneği |
|-------|----------|--------------|
| `leads` | CSV'den import edilen ham veriler | `@garyvee, Mindset, 5k-10k, HQ:6.7` |
| `profiles` | Instagram'dan çekilen profil bilgileri | followers, bio, website, verified |
| `media` | Son 25 paylaşım (profil başına) | caption, like_count, comments_count |
| `analysis_results` | AI sınıflandırma sonuçları | cluster, tier, scores, risk_flags |
| `batch_jobs` | Toplu fetch iş takibi | total, processed, fetched, errors |
| `research` | Araştırma iş takibi | seed_type, status, profiles_found |
| `reports` | Oluşturulan raporlar | leaderboard, cluster_distribution |
| `settings` | Filtre eşik değerleri | min_followers: 5000 |

### Lead Durumları

```
pending     → Henüz çekilmedi
fetching    → Şu an çekiliyor
fetched     → Başarılı (profil + analiz kayıtlı)
unfetchable → Kişisel hesap veya bulunamadı
error       → API hatası (tekrar denenebilir)
```

---

## Özellikler

### 1. CSV Import (`/leads`)
- CSV dosyasını sürükle-bırak veya dosya seçici ile yükle
- Instagram URL'lerini otomatik parse eder (`instagram.com/username?igsh=...` → `username`)
- Duplicate'leri filtreler
- Sonuç: 9.605 satırlık CSV → 1.305 benzersiz lead

### 2. Batch Fetch (`/leads → Start Batch Fetch`)
- Arka planda tüm pending/error lead'leri sırayla çeker
- Rate limiter: 5 sn aralıkla istek (Meta API limitlerine uygun)
- Exponential backoff: Rate limit hatası gelince 60s → 480s bekler
- Her profil için: profil bilgisi + son 25 paylaşım kaydedilir

### 3. AI Sınıflandırma (otomatik, batch sırasında)
- Gemini 2.0 Flash kullanır
- Her profili 4 niche'den birine sınıflandırır:
  - **Dating** — flört, çekicilik, dating tavsiyeleri
  - **Mindset** — kişisel gelişim, motivasyon, disiplin
  - **Relationships** — ilişki tavsiyeleri, evlilik, iletişim
  - **Masculinity** — erkeklik, fitness, yaşam tarzı
- Tier sistemi: A (elit) → B (iyi) → C (orta) → D (düşük)
- Monetizasyon sinyalleri: coaching, course, affiliate, vb.
- Risk bayrakları: engagement bait, bot patterns, vb.

### 4. Veri Akışı Görselleştirme (`/flow`)
- n8n/Unreal Blueprint tarzı interaktif node grafiği
- 16 node, 16 bağlantı — tüm pipeline görsel olarak
- Pan & zoom, tıkla → detay paneli
- Her node'da: fonksiyon adı, dosya yolu, açıklama

### 5. Candidates (`/candidates`)
- Sınıflandırılmış profillerin listesi
- Tier, cluster, engagement rate ile filtreleme
- Profil detay sayfası

### 6. Dashboard (`/`)
- Genel istatistikler: toplam profil, tier dağılımı, cluster dağılımı
- Son araştırmalar

---

## API Referansı

### Lead Yönetimi

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/api/leads/import` | CSV yükle ve parse et |
| `GET` | `/api/leads` | Lead listesi (filtre, sıralama, sayfalama) |
| `POST` | `/api/leads` | Tekil lead ekle |
| `DELETE` | `/api/leads` | Toplu silme |
| `GET` | `/api/leads/:id` | Lead detayı |
| `PUT` | `/api/leads/:id` | Lead güncelle |
| `DELETE` | `/api/leads/:id` | Lead sil |

### Batch İşleme

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/api/leads/batch` | Batch fetch başlat |
| `GET` | `/api/leads/batch` | Batch durum sorgula |
| `DELETE` | `/api/leads/batch` | İptal veya error reset (`action: 'reset_errors'`) |

### Diğer

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/dashboard` | Dashboard istatistikleri |
| `POST/GET` | `/api/research` | Araştırma pipeline'ı |
| `GET` | `/api/profiles` | Profil listesi |
| `GET/PUT` | `/api/settings` | Filtre ayarları |
| `GET` | `/api/test/instagram` | API test endpoint'i |

---

## Rate Limiting

Meta Graph API saat başına ~200 istek limiti uygular (Development tier).

| Mekanizma | Açıklama |
|-----------|----------|
| **İstek aralığı** | 5 saniye (saatte ~720, ama burst korumalı) |
| **HTTP 429** | 60s → 120s → 240s → 480s exponential backoff |
| **Error #4** | Aynı backoff stratejisi |
| **Max retry** | 4 deneme, sonra hata olarak işaretle |

---

## Giriş Bilgileri

Varsayılan kullanıcı adı ve şifre:
```
Username: admin
Password: admin123
```

> ⚠️ Prodüksiyon ortamında mutlaka değiştirin!

---

## Lisans

Özel proje — dağıtıma kapalı.
