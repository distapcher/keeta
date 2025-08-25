// api/balances.js
const BASE_API_KEY = "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC";
const KTA_CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
// KTA в сети Base имеет 18 decimals (по данным BaseScan)
const DECIMALS = 18;

// --- утилиты --- //

// форматирование BigInt с decimals и округлением до fixedDp знаков (по умолчанию 4)
function formatUnitsBigInt(valueBigInt, decimals = 18, fixedDp = 4) {
  const ten = 10n;
  const base = ten ** BigInt(decimals);
  // хотим округлить до fixedDp => масштаб до (decimals - fixedDp)
  const outScale = BigInt(decimals - fixedDp);
  const scaleDiv = ten ** outScale;

  // делим на 10^(decimals - fixedDp), получаем целое число в единицах 10^-fixedDp
  const q = valueBigInt / scaleDiv;
  const r = valueBigInt % scaleDiv;

  // округление: если r >= 0.5 * scaleDiv => +1
  const half = scaleDiv / 2n;
  const rounded = q + (r >= half ? 1n : 0n);

  // теперь вставляем десятичную точку fixedDp разрядов с конца
  const s = rounded.toString();
  if (fixedDp === 0) return s;

  const pad = fixedDp - Math.min(fixedDp, s.length);
  const intPart =
    s.length > fixedDp ? s.slice(0, s.length - fixedDp) : "0";
  const fracPart =
    (pad > 0 ? "0".repeat(pad) : "") + s.slice(Math.max(0, s.length - fixedDp));

  // убираем хвостовые нули, но оставляем как минимум 1 ноль
  const fracTrimmed = fracPart.replace(/0+$/, "") || "0";

  return `${intPart}.${fracTrimmed}`;
}

function isValidAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetries(url, opts = {}, retries = 3, backoffMs = 400) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      // некоторые рейты возвращают 200 с status:"0" в теле — это обработаем на уровне парсинга
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await sleep(backoffMs * (i + 1));
    }
  }
  throw lastErr;
}

// основной вызов BaseScan для ERC-20 баланса
async function getKtaBalanceRaw(address) {
  const url = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${KTA_CONTRACT}&address=${address}&tag=latest&apikey=${BASE_API_KEY}`;
  const res = await fetchWithRetries(url, { method: "GET" }, 3, 500);
  const data = await res.json();

  // успешный ответ BaseScan: { status: "1", result: "123456..." }
  if (data && data.status === "1" && typeof data.result === "string") {
    // важно: число может быть очень большим => BigInt
    // иногда BaseScan возвращает "0x..." — на всякий случай обработаем это тоже
    const raw = data.result.startsWith("0x")
      ? BigInt(data.result)
      : BigInt(data.result);
    return raw;
  }

  // если status "0" — часто это rate-limit/empty — вернём 0n, но отметим в логе
  console.warn("BaseScan non-success for", address, data);
  return 0n;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  try {
    const { addresses } = await req.json?.() || req.body || {};
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: "Неверный формат данных: ожидается { addresses: string[] }" });
    }

    // ограничим парралельность вручную чанками (на случай длинного списка)
    const chunkSize = 8;
    const results = [];

    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);

      const chunkPromises = chunk.map(async (address) => {
        const addr = String(address).trim();

        if (!isValidAddress(addr)) {
          return { address: addr, balance: "Неверный адрес" };
        }

        try {
          const raw = await getKtaBalanceRaw(addr);
          const formatted = formatUnitsBigInt(raw, DECIMALS, 4);
          return { address: addr, balance: formatted };
        } catch (e) {
          console.error("Balance error for", addr, e);
          return { address: addr, balance: "0.0000" };
        }
      });

      const chunkRes = await Promise.all(chunkPromises);
      results.push(...chunkRes);

      // мягкая пауза между чанками (смягчает рейт-лимиты)
      await sleep(250);
    }

    return res.status(200).json(results);
  } catch (e) {
    console.error("API fatal error:", e);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
