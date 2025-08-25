import { ethers } from "ethers";

const BASE_RPC = "https://base-mainnet.public.blastapi.io"; // публичный RPC Base
const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";

// Стандартный ABI ERC-20 только с функцией balanceOf и decimals
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: "Неверный формат данных" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const contract = new ethers.Contract(KTA_CONTRACT, ERC20_ABI, provider);

    // Получаем decimals токена один раз
    const decimals = await contract.decimals();

    const promises = addresses.map(async (address) => {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return { address, balance: "Неверный адрес" };
      }

      try {
        const rawBalance = await contract.balanceOf(address);
        // Преобразуем в число с учетом decimals
        const balance = Number(ethers.formatUnits(rawBalance, decimals)).toFixed(4);
        return { address, balance };
      } catch (err) {
        return { address, balance: "0.0000" };
      }
    });

    const results = await Promise.all(promises);
    res.status(200).json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
