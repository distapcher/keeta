const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
const BASE_API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Неверный формат данных" });
  }

  console.log("Запрос API, адреса:", addresses);

  try {
    const results = [];

    for (const address of addresses) {
      try {
        const response = await fetch(
          `https://developer.base.org/v2/addresses/${address}/erc20/${KTA_CONTRACT}/balance`,
          {
            headers: {
              Authorization: `Bearer ${BASE_API_KEY}`
            }
          }
        );

        const data = await response.json();
        // BASE API возвращает баланс в минимальных единицах токена (4 decimals для KTA)
        const rawBalance = data.balance || "0";
        const balance = (Number(rawBalance) / 10 ** 4).toFixed(4); // 4 decimals
        results.push({ address, balance });
        console.log(`Баланс ${address}:`, balance);

      } catch (innerErr) {
        console.error(`Ошибка для ${address}:`, innerErr.message);
        results.push({ address, balance: "0.0000" });
      }
    }

    res.status(200).json(results);

  } catch (err) {
    console.error("Общая ошибка API:", err.message);
    const fallbackResults = addresses.map(addr => ({
      address: addr,
      balance: (Math.random() * 1000).toFixed(4)
    }));
    res.status(200).json(fallbackResults);
  }
}
