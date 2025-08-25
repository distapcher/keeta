import { ethers } from "ethers";

const BASE_RPC = "https://base-mainnet.public.blastapi.io";
const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Разбивает массив на чанки
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не поддерживается" });

  const { addresses } = req.body;
  if (!addresses || !Array.isArray(addresses)) return res.status(400).json({ error: "Неверный формат данных" });

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const contract = new ethers.Contract(KTA_CONTRACT, ERC20_ABI, provider);
    const decimals = await contract.decimals();

    const results = [];
    const chunks = chunkArray(addresses, 5); // параллельно по 5 адресов

    for (const chunk of chunks) {
      const promises = chunk.map(async (address) => {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { address, balance: "Неверный адрес" };
        try {
          const rawBalance = await contract.balanceOf(address);
          const balance = Number(ethers.formatUnits(rawBalance, decimals)).toFixed(4);
          return { address, balance };
        } catch {
          return { address, balance: "0.0000" };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    res.status(200).json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
