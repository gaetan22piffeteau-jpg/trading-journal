exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { filter, currencies } = event.queryStringParameters || {};
  const url = `https://cryptopanic.com/api/free/v1/posts/?auth_token=demo&public=true&kind=news&filter=${filter||'rising'}&currencies=${currencies||'BTC,ETH,SOL,XRP,BNB'}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const news = (data.results || []).slice(0, 15).map(n => ({
      title: n.title,
      url: n.url,
      source: n.source?.title || 'News',
      published_at: n.published_at,
      currencies: (n.currencies || []).map(c => c.code),
      votes_up: n.votes?.positive || 0,
      votes_down: n.votes?.negative || 0,
      sentiment: (n.votes?.positive||0) > (n.votes?.negative||0) ? 'bull'
               : (n.votes?.negative||0) > (n.votes?.positive||0) ? 'bear' : 'neutral'
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ news }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ news: [], error: err.message }) };
  }
};