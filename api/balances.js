const fetch = require("node-fetch");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973"; // Keeta
  const DECIMALS = 18;

  const results = [];

  for (const [i, address] of addresses.entries()) {
    try {
      console.log(`🔍 [${i + 1}/${addresses.length}] Проверяем адрес: ${address}`);
      const url = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${address}&tag=latest&apikey=${API_KEY}`;
      console.log("🌍 Запрос:", url);

      const response = await fetch(url);
      const data = await response.json();
      console.log("📦 Ответ API:", data);

      if (data.status === "1") {
        const balance = Number(data.result) / 10 ** DECIMALS;
        results.push({ address, balance: balance.toFixed(4) });
      } else {
        results.push({ address, balance: "Ошибка: " + data.message });
      }
    } catch (err) {
      console.error("❌ Ошибка при запросе:", err.message);
      results.push({ address, balance: "Ошибка API: " + err.message });
    }

    if (i < addresses.length - 1) {
      await delay(600); // задержка между запросами
    }
  }

  return res.status(200).json(results);
};
