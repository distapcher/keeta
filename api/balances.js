const BASE_API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";
const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";

// Функция паузы
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Неверный формат данных" });
  }

  const results = [];

  for (const address of addresses) {
    // Проверка корректности адреса
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      results.push({ address, balance: "Неверный адрес" });
      continue;
    }

    try {
      const response = await fetch(
        `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${KTA_CONTRACT}&address=${address}&tag=latest&apikey=${BASE_API_KEY}`
      );
      const data = await response.json();

      if (data.status === "1" && data.result) {
        const balance = (Number(data.result) / 10 ** 18).toFixed(4);
        results.push({ address, balance });
      } else {
        results.push({ address, balance: "0.0000" });
      }
    } catch (err) {
      results.push({ address, balance: "0.0000" });
    }
