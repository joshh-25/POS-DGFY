const safeCell = (value) => {
    const text = String(value ?? '');
    // Spreadsheet applications evaluate cells beginning with formula control characters.
    // Prefix with a tab inside the quoted export field so formula evaluation stays disabled
    // even if a spreadsheet later removes a leading apostrophe during re-save.
    return /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(text) ? `\t${text}` : text;
};

const xmlEscape = (value) => safeCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const titleCase = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const buildBusinessAdminReportExport = ({ dataset, format = 'csv', dateFrom, dateTo }) => {
    const headers = dataset.available_sort_fields;
    const rows = dataset.rows;
    const suffix = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : 'as_of_current';
    if (format === 'xls') {
        const cells = (values) => values.map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`).join('');
        const content = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table><Row>${cells(headers.map(titleCase))}</Row>${rows.map((row) => `<Row>${cells(headers.map((header) => row[header]))}</Row>`).join('')}</Table></Worksheet></Workbook>`;
        return { filename: `business-${dataset.definition.key}-${suffix}.xls`, contentType: 'application/vnd.ms-excel; charset=utf-8', content };
    }
    const content = [headers.map(titleCase), ...rows.map((row) => headers.map((header) => safeCell(row[header])))]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    return { filename: `business-${dataset.definition.key}-${suffix}.csv`, contentType: 'text/csv; charset=utf-8', content: `\uFEFF${content}` };
};
