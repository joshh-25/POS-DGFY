export const REPORT_TIME_ZONE = 'Asia/Manila';

const reportDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

export const formatReportDateTime = (value) => {
    if (value === null || value === undefined || value === '') return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const parts = Object.fromEntries(
        reportDateTimeFormatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} (${REPORT_TIME_ZONE})`;
};

export const formatReportDate = (value) => {
    const formatted = formatReportDateTime(value);
    return formatted.endsWith(`(${REPORT_TIME_ZONE})`)
        ? formatted.slice(0, 10)
        : formatted;
};
