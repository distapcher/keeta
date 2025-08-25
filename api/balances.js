// api/balances.js
export default async function handler(req, res) {
  // настройка
  const API_KEY = process.env.BASESCAN_API_KEY;
  const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
  if (!API_KEY) return res.status(500).json({ error: "API ключ не настроен" });

  const { addresses } = req.body;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: "Нельзя опросить пустой список адресов" });
  }

  // отделяем валидные от невалидных
  const valid = addresses.filter(addr => /^0x[a-fA-F0-9]{40}$/.test(addr));
  const invalid = addresses.filter(addr => !/^0x[a-fA-F0-9]{40}$/.test(addr));

  let resultMap = {};
  invalid.forEach(addr => resultMap[addr] = "Неверный адрес");

  try {
    const query = valid.join(",");
    const url = `https://api.basescan.org/api/v2?module=account&action=balancemulti&contractaddress=${CONTRACT}&address=${query}&tag=latest&apikey=${API_KEY}`;

    console.log("Запрос Batch API V2:", url);
    const resp = await fetch(url);
    const data = await resp.json();
    console.log("Batch ответ:", data);

    if (data.status === "1" && Array.isArray(data.result)) {
      data.result.forEach(item => {
        const raw = BigInt(item.balance);
        const bal = Number(raw) / 1e18;
        resultMap[item.account] = bal.toLocaleString("en-US", { maximumFractionDigits: 4 });
      });
    } else {
      console.error("Batch API error:", data);
      valid.forEach(addr => resultMap[addr] = "Ошибка");
    }
  } catch (e) {
    console.error("Batch fetch failed:", e);
    valid.forEach(addr => resultMap[addr] = "Ошибка");
  }

  res.status(200).json(resultMap);
}
