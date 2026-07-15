const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parsePersistedDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input : input.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBeijingTime(value, fallback = "未知时间") {
  const date = parsePersistedDate(value);
  if (!date) return fallback;
  const parts = { year: "", month: "", day: "", hour: "", minute: "", second: "" };
  BEIJING_TIME_FORMATTER.formatToParts(date).forEach((part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day" || part.type === "hour" || part.type === "minute" || part.type === "second") parts[part.type] = part.value;
  });
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export { BEIJING_TIME_ZONE };
