import { ethers } from "ethers";

const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
const BASE_RPC_URL = "https://developer.base.org/v2/rpc";
const BASE_API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Метод не поддерживается" });
    return;
  }

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    res.status(400).json({ error: "Неверный формат данных" });
    return;
  }

  console.log("Запрос API получен, адреса:", addresses);

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, {
      headers: { "Authorization": `Bearer ${BASE_API_KEY}` }
    });

    const contract = new ethers.Contract(KTA_CONTRACT, ERC20_ABI, provider);
    const decimals = await contract.decimals();
    console.log("Decimals токена:", decimals);

    const results = await Promise.all(
      addresses.map(async (address) => {
        try {
          const raw = await contract.balanceOf(address);
          console.log(`Raw balance ${address}:`, raw.toString());
          const balance = ethers.formatUnits(raw, decimals); // точное значение
          return { address, balance };
        } catch (innerErr) {
          console.error(`Ошибка при получении баланса для ${address}:`, innerErr.message);
          return { address, balance: "0" };
        }
      })
    );

    console.log("Балансы получены:", results);
    res.status(200).json(results);

  } catch (err) {
    console.error("Ошибка при выполнении запроса к BASE API:", err.message);
    const fallbackResults = addresses.map(address => (
