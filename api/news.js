export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-anthropic-key, x-newsdata-key');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Lire les clés depuis les headers envoyés par l'app
  const ANTHROPIC_KEY = req.headers['x-anthropic-key'] || '';
  const NEWSDATA_KEY = req.headers['x-newsdata-key'] || '';

  if (!NEWSDATA_KEY) {
    return res.status(400).json({ news: [], error: 'Clé NewsData manquante — configure-la dans Paramètres' });
  }

  try {
    // 1. Récupérer les news
    const newsUrl = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&category=business,technology&q=bitcoin OR ethereum OR crypto OR blockchain&language=en&size=8`;
    const newsRes = await fetch(newsUrl);
    const newsData = await newsRes.json();

    if (newsData.status !== 'success') throw new Error(newsData.message || 'NewsData error');

    const rawNews = (newsData.results || []).map(a => ({
      title: a.title,
      description: (a.description || '').substring(0, 200),
      url: a.link,
      source: a.source_name || 'News',
      published_at: a.pubDate
    }));

    // 2. Si clé Anthropic dispo → traduire + résumer
    if (ANTHROPIC_KEY) {
      const prompt = `Tu es un analyste crypto. Voici ${rawNews.length} news en anglais. Pour chacune, traduis le titre en français et fais un résumé de 1 phrase claire en français.

NEWS :
${rawNews.map((n,i) => `${i+1}. ${n.title}\n${n.description}`).join('\n\n')}

Réponds UNIQUEMENT en JSON, tableau dans l'ordre :
[{"title":"titre FR","summary":"résumé 1 phrase FR","sentiment":"bull ou bear ou neutral"},...]
Aucun texte avant ou après.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const claudeData = await claudeRes.json();
      const raw = claudeData.content?.[0]?.text || '[]';
      const clean = raw.replace(/```json|```/g,'').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      const translated = JSON.parse(clean.substring(start, end+1));

      const news = translated.map((t,i) => ({
        title: t.title,
        summary: t.summary,
        url: rawNews[i]?.url || null,
        source: rawNews[i]?.source || 'News',
        published_at: rawNews[i]?.published_at || new Date().toISOString(),
        currencies: detectCoins(rawNews[i]?.title || ''),
        votes_up: 0, votes_down: 0,
        sentiment: t.sentiment || 'neutral'
      }));

      return res.status(200).json({ news, translated: true });
    }

    // 3. Sans clé Anthropic → news brutes en anglais
    const news = rawNews.map(a => ({
      title: a.title,
      summary: null,
      url: a.url,
      source: a.source,
      published_at: a.published_at,
      currencies: detectCoins(a.title),
      votes_up: 0, votes_down: 0,
      sentiment: detectSentiment(a.title)
    }));

    return res.status(200).json({ news, translated: false });

  } catch (err) {
    return res.status(500).json({ news: [], error: err.message });
  }
}

function detectCoins(text) {
  const t = text.toUpperCase();
  const map = { BTC:'BITCOIN', ETH:'ETHEREUM', SOL:'SOLANA', BNB:'BINANCE', XRP:'RIPPLE', ADA:'CARDANO', DOGE:'DOGECOIN', AVAX:'AVALANCHE', LINK:'CHAINLINK' };
  return Object.entries(map).filter(([k,v]) => t.includes(k)||t.includes(v)).map(([k])=>k);
}

function detectSentiment(text) {
  const t = text.toLowerCase();
  const bull = ['surge','rally','rises','gains','bullish','jumps','soars','record','recovery','high','break','above'];
  const bear = ['crash','drop','falls','bearish','plunge','tumbles','warning','fear','dump','low','loss','down','below'];
  const b = bull.filter(w=>t.includes(w)).length;
  const d = bear.filter(w=>t.includes(w)).length;
  return b>d?'bull':d>b?'bear':'neutral';
}
