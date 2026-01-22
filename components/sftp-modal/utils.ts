export const formatBytes = (bytes: number | string): string => {
  const numBytes = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(numBytes) || numBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(1024));
  const size = numBytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const formatDate = (dateStr: string | number | undefined): string => {
  if (!dateStr) return "--";
  const date = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
