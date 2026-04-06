const CORS_ORIGIN = String(process.env.CORS_ORIGIN || "*");

const CONFUSABLE_MAP = {
  a: ["\u0391", "\u0410", "\uFF21"],
  e: ["\u0395", "\u0415", "\uFF25"],
  o: ["\u039F", "\u041E", "\uFF2F"],
  i: ["\u0406", "\u0131", "\uFF29"],
  s: ["\u0455", "\uFF33"],
  c: ["\u03F2", "\uFF23"],
  p: ["\u03C1", "\uFF30"]
};

const EMOJI_FAMILIES = {
  eye: ["\u{1F441}", "\u{1F440}", "\u{1F9FF}"],
  mouth: ["\u{1F444}", "\u{1F445}", "\u{1F48B}"]
};

const EMOJI_TO_FAMILY = {
  "\u{1F441}": "eye",
  "\u{1F440}": "eye",
  "\u{1F9FF}": "eye",
  "\u{1F444}": "mouth",
  "\u{1F445}": "mouth",
  "\u{1F48B}": "mouth"
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function normalizeSimple(s) {
  if (s == null) return "";
  return String(s)
    .normalize("NFKC")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200D\uFE0E\uFE0F]/g, "")
    .toLowerCase()
    .trim();
}

function expandConfusables(s, maxVariants = 40) {
  const chars = Array.from(String(s));
  const slots = chars.map((ch) => {
    const lower = ch.toLowerCase();
    const base = [lower];
    if (CONFUSABLE_MAP[lower]) base.push(...CONFUSABLE_MAP[lower]);
    return base;
  });

  const results = new Set();
  function backtrack(i, acc) {
    if (results.size >= maxVariants) return;
    if (i === slots.length) {
      results.add(acc.join(""));
      return;
    }
    for (const opt of slots[i]) {
      acc.push(opt);
      backtrack(i + 1, acc);
      acc.pop();
      if (results.size >= maxVariants) return;
    }
  }

  backtrack(0, []);
  return Array.from(results);
}

function expandEmojiFamilies(s, maxVariants = 80) {
  const units = Array.from(String(s));
  const slots = units.map((u) => {
    if (EMOJI_TO_FAMILY[u]) return EMOJI_FAMILIES[EMOJI_TO_FAMILY[u]] || [u];
    return [u];
  });

  const results = new Set();
  function backtrack(i, acc) {
    if (results.size >= maxVariants) return;
    if (i === slots.length) {
      results.add(acc.join(""));
      results.add(acc.join(" "));
      return;
    }
    for (const opt of slots[i]) {
      acc.push(opt);
      backtrack(i + 1, acc);
      acc.pop();
      if (results.size >= maxVariants) return;
    }
  }

  backtrack(0, []);
  return Array.from(results);
}

module.exports = function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({ ok: true, endpoint: "/api/generateVariants" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const text = String(req.body?.text || "");
    if (!text) {
      res.status(200).json([]);
      return;
    }

    const base = normalizeSimple(text);
    const conf = expandConfusables(text, 40).map(normalizeSimple);
    const emoji = expandEmojiFamilies(text, 80).map(normalizeSimple);
    const combined = [base, ...conf, ...emoji].filter(Boolean);
    const seen = new Set();
    const out = [];

    for (const value of combined) {
      if (!seen.has(value)) {
        seen.add(value);
        out.push(value);
      }
    }

    res.status(200).json(out.slice(0, 200));
  } catch (error) {
    console.error("generateVariants error:", error);
    res.status(500).json([]);
  }
};
