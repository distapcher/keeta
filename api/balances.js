const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не разрешен" });
  }

  const { addresses } = req.body || {};
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Нужен список адресов" });
  }

  const API_KEY = process.env.BASESCAN_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "API ключ не найден" });
  }

  const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
  const DECIMALS = 18;

  try {
    const results = [];

    for (const address of addresses) {
      const url = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${address}&tag=latest&apikey=${API_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.status === "1") {
        const balance = Number(data.result) / 10 ** DECIMALS;
        results.push({ address, balance: balance.toFixed(4) });
      } else {
        results.push({ address, balance: "Ошибка: " + data.message });
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: "Ошибка API: " + err.message });
  }
};
