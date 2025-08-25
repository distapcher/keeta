// api/balances.js
// Node.js serverless (Vercel). Надёжная выдача балансов KTA на Base с ретраями и fallback на RPC.

const CONTRACT = process.env.KETA_CONTRACT || "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";
const API_KEY = process.env.BASESCAN_API_KEY || "G5Y8AY1BQRYGFXG5AQKKIW53TWA4SJRIJC"; // можешь оставить env в Vercel
const BASESCAN = "https://api.basescan.org/api";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org"; // публичный RPC от Base

// ——— утилиты ———
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// форматирование BigInt в строку с decimals
function formatUnits(bi, decimals) {
  const neg = bi < 0n;
  if (neg) bi = -bi;
  const base = 10n ** BigInt(decimals);
  const whole = bi / base;
  const frac = bi % base;
  // покажем до 4 знаков (с округлением)
  const fracStrFull = frac.toString().padStart(decimals, "0");
  const frac4 = fracStrFull.slice(0, 4);
  const nextDigit = fracStrFull.slice(4, 5);
  let fracRounded = frac4;
  if (nextDigit && Number(nextDigit) >= 5) {
    // простое округление последней цифры
    const n = (BigInt(frac4) + 1n).toString().padStart(4, "0");
    fracRounded = n;
  }
  return `${neg ? "-" : ""}${whole.toString()}.${fracRounded}`;
}

// кодирование данных для eth_call: balanceOf(address)
function encodeBalanceOfData(address) {
  const selector = "0x70a08231";
  const addr = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return selector + addr;
}
function encodeDecimalsData() {
  return "0x313ce567"; // decimals()
}
function hexToBigInt(hex) {
  if (!hex) return 0n;
  return BigInt(hex);
}

// безопасная загрузка JSON с таймаутом
async function fetchJson(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // иногда BaseScan отдаёт HTML при нагрузке
      return { _rawText: text, _statusCode: res.status };
    }
    return json;
  } finally {
    clearTimeout(id);
  }
}

// ——— запрос decimals (кеш) ———
let DECIMALS_CACHE = null;
async function getTokenDecimals() {
  if (DECIMALS_CACHE != null) return DECIMALS_CACHE;

  // Сначала попробуем через RPC (надежнее, не зависит от лимитов)
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        { to: CONTRACT, data: encodeDecimalsData() },
        "latest",
      ],
    };
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json && json.result) {
      const dec = Number(hexToBigInt(json.result));
      if (Number.isFinite(dec) && dec >= 0 && dec <= 36) {
        DECIMALS_CACHE = dec;
        return dec;
      }
    }
  } catch (e) {
    console.error("decimals via RPC error:", e);
  }

  // Фолбэк: доверимся BaseScan (страница подтверждает 18)
  // Но лучше явно вернуть 18, чтобы не рушить работу
  DECIMALS_CACHE = 18;
  return 18;
}

// ——— баланс через BaseScan с ретраями ———
async function getBalanceViaBaseScan(address, { retries = 4, initialDelay = 350 } = {}) {
  const url = `${BASESCAN}?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${address}&tag=latest&apikey=${API_KEY}`;
  let delay = initialDelay;
  for (let i = 0; i <= retries; i++) {
    const json = await fetchJson(url);
    // корректный ответ
    if (json && json.status === "1" && typeof json.result === "string") {
      return { ok: true, raw: BigInt(json.result), note: i === 0 ? "basescan:ok" : `basescan:retry#${i}` };
    }
    // если лимит/NOTOK — ждём и пробуем ещё
    const raw = JSON.stringify(json);
    const maybeRate =
      raw && /rate limit|Max rate|NOTOK|error|busy|throttl/i.test(raw);
    if (maybeRate && i < retries) {
      await sleep(delay);
      delay = Math.min(delay * 2, 2000); // экспоненциально до 2с
      continue;
    }
    // если здесь — BaseScan не дал нормальный ответ
    return { ok: false, error: "basescan_failed", detail: raw || "no_json" };
  }
}

// ——— баланс через RPC (eth_call balanceOf) ———
async function getBalanceViaRpc(address) {
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        { to: CONTRACT, data: encodeBalanceOfData(address) },
        "latest",
      ],
    };
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json && json.result) {
      // result — hex вроде 0x0000...
      const bi = hexToBigInt(json.result);
      return { ok: true, raw: bi, note: "rpc:ok" };
    }
    return { ok: false, error: "rpc_no_result", detail: JSON.stringify(json) };
  } catch (e) {
    return { ok: false, error: "rpc_error", detail: String(e) };
  }
}

// простейший ограничитель параллелизма + базовая задержка между задачами
async function mapWithConcurrency(items, limit, mapper, gapMs = 200) {
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
      // небольшая пауза между стартами, чтобы не «забивать» API
      // eslint-disable-next-line no-loop-func
      (async () => {
        if (idx > 0 && gapMs) await sleep(gapMs);
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

    const { addresses } = await (async () => {
      try {
        return await req.json?.() || await new Promise((resolve, reject) => {
          let data = "";
          req.on("data", (c) => (data += c));
          req.on("end", () => {
            try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); }
          });
          req.on("error", reject);
        });
      } catch {
        return {};
      }
    })();

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: "No addresses" });
    }

    const decimals = await getTokenDecimals(); // раз узнаём – дальше кеш

    // санитайзинг адресов
    const norm = addresses
      .map(String)
      .map((s) => s.trim())
      .filter((s) => s.length)
      .map((s) => (s.startsWith("0x") ? s : "0x" + s))
      .map((s) => s.toLowerCase());

    // основная логика с ограничением параллелизма
    const out = await mapWithConcurrency(
      norm,
      3,              // не больше 3 одновременных запросов
      async (addr) => {
        // 1) пробуем BaseScan с ретраями
        let r1 = await getBalanceViaBaseScan(addr);
        if (r1?.ok) {
          return {
            address: addr,
            source: r1.note,
            decimals,
            raw: r1.raw.toString(),
            balance: formatUnits(r1.raw, decimals),
            note: "",
          };
        }

        // 2) fallback RPC
        let r2 = await getBalanceViaRpc(addr);
        if (r2?.ok) {
          return {
            address: addr,
            source: r2.note,
            decimals,
            raw: r2.raw.toString(),
            balance: formatUnits(r2.raw, decimals),
            note: r1?.error ? `fallback_from:${r1.error}` : "fallback_from:unknown",
          };
        }

        // 3) оба способа не сработали
        return {
          address: addr,
          error: "fetch_failed",
          source: r1?.error ? `basescan:${r1.error}` : "basescan:unknown",
          note: r2?.error ? `rpc:${r2.error}` : "rpc:unknown",
        };
      },
      250 // задержка между стартом соседних задач
    );

    return res.status(200).json({
      contract: CONTRACT,
      decimals,
      count: out.length,
      results: out,
    });
  } catch (e) {
    console.error("FATAL /api/balances:", e);
    return res.status(500).json({ error: "internal_error", detail: String(e) });
  }
}
