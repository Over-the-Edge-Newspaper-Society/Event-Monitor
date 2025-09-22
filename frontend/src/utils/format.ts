export const formatTimestamp = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const describeMinutes = (minutes: number | null): string => {
  if (minutes == null) return "—";
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const minutesInDay = 60 * 24;
  const days = Math.floor(minutes / minutesInDay);
  const remainingAfterDays = minutes % minutesInDay;
  const hours = Math.floor(remainingAfterDays / 60);
  const remainingMinutes = remainingAfterDays % 60;

  if (days > 0) {
    const dayPart = `${days} d`;
    if (hours > 0) {
      return remainingMinutes > 0 ? `${dayPart} ${hours} h ${remainingMinutes} min` : `${dayPart} ${hours} h`;
    }
    return remainingMinutes > 0 ? `${dayPart} ${remainingMinutes} min` : dayPart;
  }

  if (hours > 0) {
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }

  return `${minutes} min`;
};
