// api/balance.js

export default async function handler(req, res) {
  try {
    console.log("📩 Запрос получен:", req.body);

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Метод не поддерживается" });
    }

    const { addresses } = req.body;
    console.log("📌 Адреса для анализа:", addresses);

    if (!addresses || addresses.length === 0) {
      return res.status(400).json({ error: "Нет адресов для анализа" });
    }

    const API_KEY = process.env.BASESCAN_API_KEY;
    const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973"; // Keeta
    const BASESCAN_URL = "https://api.basescan.org/api";

    let results = {};

    for (const addr of addresses) {
      try {
        console.log(`🔍 Проверяем адрес: ${addr}`);

        const url = `${BASESCAN_URL}?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${addr}&tag=latest&apikey=${API_KEY}`;
        console.log("🌍 Запрос к API:", url);

        const response = await fetch(url);
        const data = await response.json();

        console.log(`📦 Ответ API для ${addr}:`, data);

        if (data.status === "1") {
          // баланс в wei → делим на 1e18
          let raw = BigInt(data.result);
          let balance = Number(raw) / 1e18;
          results[addr] = balance.toFixed(4);
          console.log(`✅ Баланс ${addr}: ${results[addr]}`);
        } else {
          results[addr] = "ошибка";
          console.log(`❌ Ошибка для ${addr}:`, data.message);
        }

        // Задержка 200мс чтобы API не отрезало
        await new Promise(r => setTimeout(r, 200));

      } catch (err) {
        console.error(`🔥 Ошибка при обработке ${addr}:`, err);
        results[addr] = "ошибка";
      }
    }

    console.log("📊 Итог:", results);
    res.status(200).json(results);

  } catch (err) {
    console.error("💥 Общая ошибка:", err);
    res.status(500).json({ error: "Сбой сервера", details: err.message });
  }
}
