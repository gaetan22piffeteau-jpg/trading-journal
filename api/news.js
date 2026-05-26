export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const feeds = [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
      { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
      { url: 'https://decrypt.co/feed', source: 'Decrypt' },
      { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' }
    ];

    const results = await Promise.allSettled(
      feeds.map(async f => {
        const r = await fetch(f.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
            'Accept': 'application/rss+xml, application/xml, text/xml'
          }
        });
        const xml = await r.text();
        return parseRSS(xml, f.source);
      })
    );

    let news = [];
    results.forEach(r => { if (r.status === 'fulfilled') news.push(...r.value); });
    news.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    return res.status(200).json({ news: news.slice(0, 20) });

  } catch (err) {
    return res.status(500).json({ news: [], error: err.message });
  }
}

function parseRSS(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = stripTags(getTag(item, 'title'));
    const link = getTag(item, 'link') || getTag(item, 'guid');
    const pubDate = getTag(item, 'pubDate');
    if (!title) continue;
    items.push({
      title,
      url: link || null,
      source,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      currencies: detectCoins(title),
      votes_up: 0,
      votes_down: 0,
      sentiment: detectSentiment(title)
    });
  }
  return items.slice(0, 8);
}

function getTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>')) ||
            xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
  return m ? m[1].trim() : '';
}

function stripTags(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,'').trim();
}

function detectCoins(title) {
  const t = title.toUpperCase();
  const map = { BTC:'BITCOIN', ETH:'ETHEREUM', SOL:'SOLANA', BNB:'BINANCE', XRP:'RIPPLE', ADA:'CARDANO', DOGE:'DOGECOIN', AVAX:'AVALANCHE', LINK:'CHAINLINK', DOT:'POLKADOT', MATIC:'POLYGON' };
  return Object.entries(map).filter(([k,v]) => t.includes(k) || t.includes(v)).map(([k]) => k);
}

function detectSentiment(title) {
  const t = title.toLowerCase();
  const bull = ['surge','rally','rises','gains','bullish','jumps','soars','breaks','record','recovery','pump','high'];
  const bear = ['crash','drop','falls','bearish','plunge','tumbles','slumps','warning','fear','dump','low','loss'];
  const b = bull.filter(w => t.includes(w)).length;
  const d = bear.filter(w => t.includes(w)).length;
  return b > d ? 'bull' : d > b ? 'bear' : 'neutral';
}
