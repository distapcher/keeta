// api/balances.js
// Надёжная выдача балансов KTA через BaseScan с ретраями и ограничением скорости.

const CONTRACT = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973"; // Keeta (Base)
const API_URL = "https://api.basescan.org/api";

// ——— утилиты ———
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAddr = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);

// аккуратное форматирование BigInt с 18 decimals (до 4 знаков с округлением)
function formatUnits18(bi, dp = 4) {
  if (typeof bi === "string") bi = BigInt(bi);
  const scale = 10n ** 18n;
  const whole = bi / scale;
  const frac = bi % scale;
  const fracStr = frac.toString().padStart(18, "0"); // 18 знаков
  // округление до dp знаков
  const shown = fracStr.slice(0, dp);
  const next = fracStr.slice(dp, dp + 1);
  let rounded = shown;
  if (next && Number(next) >= 5) {
    rounded = (BigInt(shown || "0") + 1n).toString().padStart(dp, "0");
  }
  return dp === 0 ? whole.toString() : `${whole.toString()}.${rounded}`;
}

async function getBalanceViaBaseScan(address, apiKey, retries = 4) {
  const url = `${API_URL}?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${address}&tag=latest&apikey=${apiKey}`;

  let delay = 400; // стартовая задержка при ретраях
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { method: "GET" });
      const data = await resp.json().catch(() => ({}));

      if (data && data.status === "1" && typeof data.result === "string") {
        // успех
        return { ok: true, raw: data.result, source: i ? `basescan:retry#${i}` : "basescan:ok" };
      }

      // лимиты / NOTOK → ретрай
      const raw = JSON.stringify(data || {});
      const rateLimited = /rate limit|Max calls per sec|NOTOK|throttl/i.test(raw);
      if (rateLimited && i < retries) {
        await sleep(delay);
        delay = Math.min(delay * 2, 2000);
        continue;
      }

      // иная ошибка
      return { ok: false, error: "basescan_failed", detail: raw };
    } catch (e) {
      if (i < retries) {
        await sleep(delay);
        delay = Math.min(delay * 2, 2000);
        continue;
      }
      return { ok: false, error: "fetch_error", detail: String(e) };
    }
  }
}

// ограничитель параллелизма (для длинных списков адресов)
async function mapWithConcurrency(items, limit, mapper, gapMs = 350) {
  const results = new Array(items.length);
  let i = 0;
  let active = 0;
  let resolveAll;
  const done = new Promise((r) => (resolveAll = r));

  async function next() {
    if (i >= items.length && active === 0) return resolveAll();
    while (active < limit && i < items.length) {
      const idx = i++;
      active++;
      (async () => {
        if (idx > 0 && gapMs) await sleep(gapMs); // лёгкий «дроссель»
        try {
          results[idx] = await mapper(items[idx], idx);
        } catch (e) {
          results[idx] = { error: "mapper_error", detail: String(e) };
        } finally {
          active--;
          next();
        }
      })();
    }
  }
  next();
  await done;
  return results;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Чтение тела (совместимо и с Vercel, и с локальным Node)
    const payload = req.body ?? await new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
      });
    });

    const apiKey = process.env.BASESCAN_API_KEY || process.env.NEXT_PUBLIC_BASESCAN_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing BASESCAN_API_KEY" });
    }

    const addresses = Array.isArray(payload.addresses) ? payload.addresses : [];
    if (!addresses.length) {
      return res.status(400).json({ error: "addresses[] required" });
    }

    const norm = addresses
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);

    const results = await mapWithConcurrency(
      norm,
      2,                 // не более 2 одновременных (под лимит 2/sec)
      async (addr) => {
        if (!isAddr(addr)) {
          return { address: addr, balance: "Неверный адрес" };
        }

        // запрос к BaseScan с ретраями и мягким «дросселем»
        const r = await getBalanceViaBaseScan(addr, apiKey, 4);

        if (r?.ok) {
          // форматируем BigInt → 18 decimals → 4 знака
          const formatted = formatUnits18(BigInt(r.raw), 4);
          return {
            address: addr,
            balance: formatted,
            raw: r.raw,
            source: r.source,
          };
        } else {
          // если BaseScan не дал ответ — пометим ошибку
          return {
            address: addr,
            balance: "Ошибка",
            note: r?.error || "unknown",
            detail: r?.detail || "",
          };
        }
      },
      450 // пауза между стартами задач (доп. защита от лимитов)
    );

    return res.status(200).json({ contract: CONTRACT, count: results.length, results });
  } catch (e) {
    console.error("FATAL /api/balances:", e);
    return res.status(500).json({ error: "internal_error", detail: String(e) });
  }
}
