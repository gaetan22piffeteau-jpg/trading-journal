export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { filter, currencies } = req.query || {};
  const url = `https://cryptopanic.com/api/free/v1/posts/?auth_token=demo&public=true&kind=news&filter=${filter||'rising'}&currencies=${currencies||'BTC,ETH,SOL,XRP,BNB'}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`CryptoPanic error: ${response.status}`);

    const data = await response.json();

    const news = (data.results || []).slice(0, 15).map(n => ({
      title: n.title,
      url: n.url,
      source: n.source?.title || 'News',
      published_at: n.published_at,
      currencies: (n.currencies || []).map(c => c.code),
      votes_up: n.votes?.positive || 0,
      votes_down: n.votes?.negative || 0,
      sentiment: (n.votes?.positive || 0) > (n.votes?.negative || 0) ? 'bull'
               : (n.votes?.negative || 0) > (n.votes?.positive || 0) ? 'bear'
               : 'neutral'
    }));

    return res.status(200).json({ news });

  } catch (err) {
    return res.status(500).json({ news: [], error: err.message });
  }
}
