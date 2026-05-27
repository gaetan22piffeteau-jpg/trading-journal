// api/news.js — Vercel API Route (syntaxe correcte)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-anthropic-key, x-newsdata-key');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Clés depuis headers (envoyées par l'app front)
  const ANTHROPIC_KEY = req.headers['x-anthropic-key'] || '';
  const NEWSDATA_KEY  = req.headers['x-newsdata-key']  || '';

  if (!NEWSDATA_KEY) {
    return res.status(400).json({
      news: [],
      error: 'Clé NewsData manquante — configure-la dans Paramètres'
    });
  }

  try {
    // ── 1. Fetch news via NewsData.io ──────────────────────────────────────
    const newsUrl = new URL('https://newsdata.io/api/1/news');
    newsUrl.searchParams.set('apikey',    NEWSDATA_KEY);
    newsUrl.searchParams.set('q',         'bitcoin OR ethereum OR crypto OR blockchain OR DeFi OR altcoin');
    newsUrl.searchParams.set('language',  'en');
    newsUrl.searchParams.set('category',  'business,technology');
    newsUrl.searchParams.set('size',      '10');

    const newsRes  = await fetch(newsUrl.toString());
    const newsData = await newsRes.json();

    if (newsData.status !== 'success') {
      throw new Error(newsData.message || `NewsData error: ${newsRes.status}`);
    }

    const rawNews = (newsData.results || []).map(a => ({
      title:        a.title        || '',
      description:  (a.description || '').substring(0, 300),
      url:          a.link         || null,
      source:       a.source_name  || 'News',
      published_at: a.pubDate      || new Date().toISOString(),
    }));

    // ── 2. Traduction + analyse sentiment via Claude ───────────────────────
    if (ANTHROPIC_KEY && rawNews.length > 0) {
      const prompt = `Tu es un analyste crypto senior. Voici ${rawNews.length} news en anglais.
Pour chacune :
1. Traduis le titre en français (concis, percutant)
2. Écris un résumé de 1 phrase en français (max 120 caractères, va droit au but)
3. Détermine le sentiment : "bull" (positif pour le marché crypto), "bear" (négatif), ou "neutral"

NEWS :
${rawNews.map((n, i) => `${i + 1}. TITRE: ${n.title}\nDESC: ${n.description}`).join('\n\n')}

Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte avant ou après :
[{"title":"titre FR","summary":"résumé FR","sentiment":"bull|bear|neutral"},...]`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 2500,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        const rawText    = claudeData.content?.[0]?.text || '[]';
        const clean      = rawText.replace(/```json|```/g, '').trim();
        const start      = clean.indexOf('[');
        const end        = clean.lastIndexOf(']');

        if (start !== -1 && end !== -1) {
          const translated = JSON.parse(clean.substring(start, end + 1));
          const news = translated.map((t, i) => ({
            title:        t.title    || rawNews[i]?.title || '',
            summary:      t.summary  || null,
            url:          rawNews[i]?.url          || null,
            source:       rawNews[i]?.source       || 'News',
            published_at: rawNews[i]?.published_at || new Date().toISOString(),
            currencies:   detectCoins(rawNews[i]?.title || ''),
            votes_up:     0,
            votes_down:   0,
            sentiment:    t.sentiment || detectSentiment(rawNews[i]?.title || ''),
          }));
          return res.status(200).json({ news, translated: true });
        }
      }
    }

    // ── 3. Fallback : news brutes sans traduction ──────────────────────────
    const news = rawNews.map(a => ({
      title:        a.title,
      summary:      null,
      url:          a.url,
      source:       a.source,
      published_at: a.published_at,
      currencies:   detectCoins(a.title),
      votes_up:     0,
      votes_down:   0,
      sentiment:    detectSentiment(a.title),
    }));

    return res.status(200).json({ news, translated: false });

  } catch (err) {
    console.error('[api/news] error:', err);
    return res.status(500).json({ news: [], error: err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function detectCoins(text) {
  const t = (text || '').toUpperCase();
  const map = {
    BTC:  ['BITCOIN', 'BTC'],
    ETH:  ['ETHEREUM', 'ETH', 'ETHER'],
    SOL:  ['SOLANA', 'SOL'],
    BNB:  ['BINANCE', 'BNB'],
    XRP:  ['RIPPLE', 'XRP'],
    ADA:  ['CARDANO', 'ADA'],
    DOGE: ['DOGECOIN', 'DOGE'],
    AVAX: ['AVALANCHE', 'AVAX'],
    LINK: ['CHAINLINK', 'LINK'],
    DOT:  ['POLKADOT', 'DOT'],
    MATIC:['POLYGON', 'MATIC'],
    ATOM: ['COSMOS', 'ATOM'],
  };
  return Object.entries(map)
    .filter(([, words]) => words.some(w => t.includes(w)))
    .map(([ticker]) => ticker);
}

function detectSentiment(text) {
  const t = (text || '').toLowerCase();
  const bull = ['surge','rally','rises','gains','bullish','jumps','soars','record','recovery','high','break','above','launch','approve','etf','adoption','partnership','upgrade'];
  const bear = ['crash','drop','falls','bearish','plunge','tumbles','warning','fear','dump','low','loss','down','below','hack','scam','ban','regulation','lawsuit','fine'];
  const b = bull.filter(w => t.includes(w)).length;
  const d = bear.filter(w => t.includes(w)).length;
  return b > d ? 'bull' : d > b ? 'bear' : 'neutral';
}
