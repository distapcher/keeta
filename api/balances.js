const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не разрешен" });
  }

  const { addresses } = req.body || {};
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Нужен список адресов" });
  }

  // Пример ответа с заглушкой
  const results = addresses.map(addr => ({ address: addr, balance: "0.0000" }));

  res.status(200).json(results);
};
