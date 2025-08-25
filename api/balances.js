export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Invalid addresses" });
  }

  const API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";
  const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
  const API_URL = "https://api.basescan.org/api";

  let results = [];

  for (let address of addresses) {
    try {
      const url = `${API_URL}?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${address}&tag=latest&apikey=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "1") {
        let balance = Number(data.result) / 1e18; // у Keeta 18 знаков после запятой
        results.push({ address, balance });
      } else {
        results.push({ address, balance: "Ошибка" });
      }
    } catch (err) {
      results.push({ address, balance: "Ошибка" });
    }
  }

  res.status(200).json(results);
}
