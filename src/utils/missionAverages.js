const valid = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const units = {
  zh: { locale: "zh-CN", km: "公里", hour: "小时", minute: "分钟", shortDistance: "不足 0.01 公里", shortTime: "不足 1 分钟" },
  en: { locale: "en-US", km: "km", hour: "h", minute: "min", shortDistance: "< 0.01 km", shortTime: "< 1 min" },
  ja: { locale: "ja-JP", km: "km", hour: "時間", minute: "分", shortDistance: "0.01 km 未満", shortTime: "1 分未満" },
};
export function formatAverageMissionDistance(meters, language = "zh") {
  if (!valid(meters)) return "—";
  const unit = units[language] ?? units.en;
  if (meters > 0 && meters < 10) return unit.shortDistance;
  return `${new Intl.NumberFormat(unit.locale, { maximumFractionDigits: 2 }).format(meters / 1000)} ${unit.km}`;
}
export function formatAverageMissionTime(milliseconds, language = "zh") {
  if (!valid(milliseconds)) return "—";
  const unit = units[language] ?? units.en;
  const total = Math.round(milliseconds / 60000);
  if (milliseconds > 0 && total === 0) return unit.shortTime;
  const hours = Math.floor(total / 60), minutes = total % 60;
  const format = new Intl.NumberFormat(unit.locale);
  return [hours ? `${format.format(hours)} ${unit.hour}` : "", minutes || !hours ? `${format.format(minutes)} ${unit.minute}` : ""].filter(Boolean).join(" ");
}
