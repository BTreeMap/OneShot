export function formatBytes(sizeBytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${value} ${units[unitIndex]}`;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
