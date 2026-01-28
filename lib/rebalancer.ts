export type Row = {
  id: string;
  ticker: string;
  current: string;
  target: string;
};

export type SortKey = "ticker" | "current" | "target" | "amount";
export type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

export type Totals = {
  totalCurrent: number;
  nonCashTarget: number;
  cashTarget: number;
};

export type TradeSummary = {
  buys: { ticker: string; amount: number }[];
  sells: { ticker: string; amount: number }[];
};

export const makeRowId = (index: number) => `row-${index}`;

export const createRow = (id: string): Row => ({
  id,
  ticker: "",
  current: "",
  target: "",
});

export const DEFAULT_ROWS: Row[] = [
  { id: makeRowId(0), ticker: "CASH", current: "1500", target: "" },
  { id: makeRowId(1), ticker: "AAPL", current: "12500", target: "35" },
  { id: makeRowId(2), ticker: "MSFT", current: "9800", target: "30" },
  { id: makeRowId(3), ticker: "TLT", current: "6200", target: "20" },
];

export const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCurrency = (value: string) => {
  const normalized = value.replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

export const formatPercent = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

export const getNextRowIndex = (rows: Row[]) => {
  const maxIndex = rows.reduce((max, row) => {
    const match = row.id.match(/^row-(\d+)$/);
    if (!match) {
      return max;
    }
    const index = Number(match[1]);
    return Number.isFinite(index) ? Math.max(max, index) : max;
  }, -1);
  return maxIndex + 1;
};

export const serializeRows = (rows: Row[], cashTarget: number) =>
  rows
    .filter((row) => row.ticker || row.current || row.target)
    .map((row, index) => {
      const targetValue =
        index === 0 ? cashTarget.toFixed(2) : row.target;
      return [row.ticker, row.current, targetValue].join("|");
    })
    .join(";");

export const parseRows = (value: string | null) => {
  if (!value) {
    return null;
  }

  const rows = value
    .split(";")
    .map((entry) => entry.split("|"))
    .filter((entry) => entry.some((item) => item.trim().length > 0))
    .map(([ticker = "", current = "", target = ""], index) => ({
      id: makeRowId(index),
      ticker,
      current,
      target,
    }));

  return rows.length > 0 ? rows : null;
};

export const normalizeRows = (rows: Row[] | null): Row[] => {
  if (!rows || rows.length === 0) {
    return [{ id: makeRowId(0), ticker: "CASH", current: "", target: "" }];
  }

  const cashCandidate = rows.find(
    (row) => row.ticker.toUpperCase() === "CASH",
  );
  const [first, ...rest] = rows;
  const cashRow = {
    id: cashCandidate?.id ?? first.id ?? makeRowId(0),
    ticker: "CASH",
    current: cashCandidate?.current ?? "",
    target: "",
  };
  const filteredRest = rest.filter(
    (row) => row.ticker.toUpperCase() !== "CASH",
  );
  return [cashRow, ...filteredRest];
};

export const computeTotals = (rows: Row[]): Totals => {
  const totalCurrent = rows.reduce(
    (sum, row) => sum + toNumber(row.current),
    0,
  );
  const nonCashTarget = rows.slice(1).reduce(
    (sum, row) => sum + toNumber(row.target),
    0,
  );
  const cashTarget = Math.max(0, 100 - nonCashTarget);
  return { totalCurrent, nonCashTarget, cashTarget };
};

export const computeSortOrder = (
  rows: Row[],
  totals: Totals,
  key: SortKey,
  direction: "asc" | "desc",
) => {
  const rest = rows.slice(1);
  const getTargetValue = (row: Row) => toNumber(row.target);
  const getAmountValue = (row: Row) => {
    const currentValue = toNumber(row.current);
    const desiredValue =
      totals.totalCurrent * (getTargetValue(row) / 100);
    return Math.abs(desiredValue - currentValue);
  };

  const compare = (a: Row, b: Row) => {
    let result = 0;
    switch (key) {
      case "ticker":
        result = a.ticker.localeCompare(b.ticker);
        break;
      case "current":
        result = toNumber(a.current) - toNumber(b.current);
        break;
      case "target":
        result = getTargetValue(a) - getTargetValue(b);
        break;
      case "amount":
        result = getAmountValue(a) - getAmountValue(b);
        break;
      default:
        result = 0;
    }

    return direction === "asc" ? result : -result;
  };

  return [...rest].sort(compare).map((row) => row.id);
};

export const computeTradeSummary = (
  rows: Row[],
  totals: Totals,
): TradeSummary => {
  const buys: { ticker: string; amount: number }[] = [];
  const sells: { ticker: string; amount: number }[] = [];

  rows.slice(1).forEach((row) => {
    const currentValue = toNumber(row.current);
    const targetValue = toNumber(row.target);
    const desiredValue = totals.totalCurrent * (targetValue / 100);
    const delta = desiredValue - currentValue;
    if (Math.abs(delta) < 0.01) {
      return;
    }
    if (delta > 0) {
      buys.push({ ticker: row.ticker || "—", amount: delta });
    } else {
      sells.push({ ticker: row.ticker || "—", amount: Math.abs(delta) });
    }
  });

  buys.sort((a, b) => b.amount - a.amount);
  sells.sort((a, b) => b.amount - a.amount);

  return { buys, sells };
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
};

export const parseFidelityCsv = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerIndex = lines.findIndex((line) =>
    line.toLowerCase().startsWith("account number,"),
  );
  if (headerIndex === -1) {
    return { cashCurrent: 0, positions: [] as { ticker: string; current: number }[] };
  }

  const header = parseCsvLine(lines[headerIndex]).map((value) =>
    value.toLowerCase(),
  );
  const symbolIndex = header.indexOf("symbol");
  const descriptionIndex = header.indexOf("description");
  const currentValueIndex = header.indexOf("current value");

  if (symbolIndex === -1 || currentValueIndex === -1) {
    return { cashCurrent: 0, positions: [] as { ticker: string; current: number }[] };
  }

  const positions: { ticker: string; current: number }[] = [];
  const positionMap = new Map<string, number>();
  let cashCurrent = 0;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      line.startsWith('"The data and information') ||
      line.startsWith('"Brokerage services') ||
      line.startsWith('"Date downloaded')
    ) {
      break;
    }

    const fields = parseCsvLine(line);
    const symbol = fields[symbolIndex] ?? "";
    const description = descriptionIndex >= 0 ? fields[descriptionIndex] ?? "" : "";
    const currentValue = fields[currentValueIndex] ?? "";
    const current = parseCurrency(currentValue);

    const isCash =
      symbol.trim().length === 0 ||
      symbol.includes("**") ||
      /money market/i.test(description) ||
      /cash/i.test(description);

    if (isCash) {
      cashCurrent += current;
      continue;
    }

    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      continue;
    }

    const nextValue = (positionMap.get(ticker) ?? 0) + current;
    positionMap.set(ticker, nextValue);
  }

  for (const [ticker, current] of positionMap.entries()) {
    positions.push({ ticker, current });
  }

  return { cashCurrent, positions };
};
