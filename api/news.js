export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // RSS CoinDesk via rss2json — gratuit, pas de CORS côté serveur
    const feeds = [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
      { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
      { url: 'https://decrypt.co/feed', source: 'Decrypt' }
    ];

    const results = await Promise.allSettled(
      feeds.map(f =>
        fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}&count=8`)
          .then(r => r.json())
          .then(d => (d.items || []).map(item => ({
            title: item.title,
            url: item.link,
            source: f.source,
            published_at: item.pubDate,
            currencies: detectCoins(item.title),
            votes_up: 0,
            votes_down: 0,
            sentiment: detectSentiment(item.title)
          })))
      )
    );

    let news = [];
    results.forEach(r => { if (r.status === 'fulfilled') news.push(...r.value); });
    news.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    news = news.slice(0, 20);

    return res.status(200).json({ news });

  } catch (err) {
    return res.status(500).json({ news: [], error: err.message });
  }
}

function detectCoins(title) {
  const t = title.toUpperCase();
  const coins = ['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT','MATIC'];
  return coins.filter(c => t.includes(c) || t.includes(coinName(c)));
}

function coinName(c) {
  const map = { BTC:'BITCOIN', ETH:'ETHEREUM', SOL:'SOLANA', BNB:'BINANCE', XRP:'RIPPLE', ADA:'CARDANO', DOGE:'DOGECOIN', AVAX:'AVALANCHE', LINK:'CHAINLINK', DOT:'POLKADOT', MATIC:'POLYGON' };
  return map[c] || c;
}

function detectSentiment(title) {
  const t = title.toLowerCase();
  const bull = ['surge','rally','rises','gains','bullish','up','high','record','growth','pump','soars','jumps','breaks','recovery','bottom'];
  const bear = ['crash','drop','falls','bearish','down','low','loss','dump','decline','fear','sell','plunge','tumbles','slumps','warning'];
  const b = bull.filter(w => t.includes(w)).length;
  const d = bear.filter(w => t.includes(w)).length;
  return b > d ? 'bull' : d > b ? 'bear' : 'neutral';
}
