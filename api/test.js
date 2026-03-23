// api/test.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const RAPIDAPI_KEY = '69e2995a79mshcb657184ba6731cp16f684jsn32054a070ba5';

  const url = 'https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=UxxajLWwzqY';
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    const text = await response.text();

    try {
      const obj = JSON.parse(text);
      res.status(200).json(obj);
    } catch (e) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(response.status || 200).send(text);
    }
  } catch (error) {
    console.error('fetch error', error);
    res.status(500).json({ error: 'Failed to fetch remote API', details: String(error) });
  }
};
