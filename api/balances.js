import { ethers } from "ethers";

// Настройки токена и BASE API
const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973"; // замените на реальный адрес $KTA
const BASE_RPC_URL = "https://developer.base.org/v2/rpc";
const BASE_API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";

// Минимальный ABI ERC20
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

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, {
      headers: {
        "Authorization": `Bearer ${BASE_API_KEY}`
      }
    });

    const contract = new ethers.Contract(KTA_CONTRACT, ERC20_ABI, provider);
    const decimals = await contract.decimals();

    const results = await Promise.all(
      addresses.map(async (address) => {
        const raw = await contract.balanceOf(address);
        const balance = Number(raw) / 10 ** decimals;
        return { address, balance };
      })
    );

    res.status(200).json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при получении балансов", details: err.message });
  }
}
