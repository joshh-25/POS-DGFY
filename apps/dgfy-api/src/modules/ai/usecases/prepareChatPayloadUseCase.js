const TEXT_MIME_TYPES = [
  'text/plain', 'text/csv', 'text/html', 'text/xml', 'text/markdown',
  'text/tab-separated-values', 'text/css', 'text/javascript',
  'application/json', 'application/xml', 'application/javascript',
  'application/x-yaml', 'application/x-www-form-urlencoded'
];

const TEXT_EXTENSIONS = [
  'txt', 'csv', 'json', 'xml', 'md', 'yaml', 'yml', 'html', 'htm',
  'css', 'js', 'ts', 'jsx', 'tsx', 'sql', 'log', 'ini', 'cfg', 'conf',
  'sh', 'bat', 'ps1', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h',
  'go', 'rs', 'env', 'gitignore', 'tsv'
];

const EXCEL_EXTENSIONS = ['xlsx', 'xls', 'xlsm'];
const PDF_EXTENSIONS = ['pdf'];
const WORD_EXTENSIONS = ['docx', 'doc'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

const truncateFileContent = (content, limit = 50000) => {
  const truncated = content.length > limit;
  const safeContent = truncated
    ? `${content.substring(0, limit)}\n...[Content truncated at 50KB]...`
    : content;

  return { safeContent, truncated };
};

export const buildPrepareChatPayloadUseCase = ({
  readFile,
  encapsulateFileContent,
  getPdfParse,
  getMammoth,
  logger
}) => {
  const logWarn = logger?.warn?.bind(logger) || (() => {});

  return async ({ message, files = [] }) => {
    const uploadedPaths = [];
    let finalMessageText = message;
    const imageParts = [];
    const fileContents = [];

    for (const file of files) {
      uploadedPaths.push(file.path);

      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

      const isText =
        TEXT_MIME_TYPES.some((mimeType) => file.mimetype?.includes(mimeType)) ||
        TEXT_EXTENSIONS.includes(ext);

      if (isText) {
        try {
          const content = await readFile(file.path, 'utf8');
          const { safeContent } = truncateFileContent(content);
          fileContents.push(encapsulateFileContent(file.originalname, ext, safeContent));
        } catch (error) {
          logWarn(`Failed to read file ${file.originalname}: ${error.message}`);
          fileContents.push(`\n[Error reading file ${file.originalname}: ${error.message}]`);
        }
        continue;
      }

      if (EXCEL_EXTENSIONS.includes(ext)) {
        fileContents.push(`\n\n[Attached Excel File: ${file.originalname}]\n[Note: Excel parsing not yet implemented. Please export to CSV for import functionality.]\n`);
        continue;
      }

      if (PDF_EXTENSIONS.includes(ext)) {
        try {
          const pdfParse = getPdfParse();
          const dataBuffer = await readFile(file.path);
          const data = await pdfParse(dataBuffer);
          const content = data.text;
          const { safeContent } = truncateFileContent(content);
          fileContents.push(encapsulateFileContent(file.originalname, 'pdf', safeContent));
        } catch (error) {
          logWarn(`Failed to parse PDF ${file.originalname}: ${error.message}`);
          fileContents.push(`\n[Error reading PDF ${file.originalname}: ${error.message}]`);
        }
        continue;
      }

      if (WORD_EXTENSIONS.includes(ext)) {
        try {
          const mammoth = getMammoth();
          const result = await mammoth.extractRawText({ path: file.path });
          const content = result.value;
          const { safeContent } = truncateFileContent(content);
          fileContents.push(encapsulateFileContent(file.originalname, 'docx', safeContent));
        } catch (error) {
          logWarn(`Failed to parse DOCX ${file.originalname}: ${error.message}`);
          fileContents.push(`\n[Error reading DOCX ${file.originalname}: ${error.message}]`);
        }
        continue;
      }

      if (IMAGE_EXTENSIONS.includes(ext) || file.mimetype?.startsWith('image/')) {
        try {
          const imageBuffer = await readFile(file.path);
          const base64Image = imageBuffer.toString('base64');
          const mimeType = file.mimetype || 'image/jpeg';

          imageParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          });
        } catch (error) {
          logWarn(`Failed to process image ${file.originalname}: ${error.message}`);
          fileContents.push(`\n[Error reading Image ${file.originalname}: ${error.message}]`);
        }
        continue;
      }

      fileContents.push(`\n\n[Attached File: ${file.originalname} (${file.mimetype})]\n[Note: This file type is not yet supported for content extraction.]\n`);
    }

    if (fileContents.length > 0) {
      finalMessageText += `\n${fileContents.join('')}`;
    }

    let messagePayload = finalMessageText;
    if (imageParts.length > 0) {
      messagePayload = [
        { type: 'text', text: finalMessageText },
        ...imageParts
      ];
    }

    return {
      uploadedPaths,
      finalMessageText,
      messagePayload
    };
  };
};
