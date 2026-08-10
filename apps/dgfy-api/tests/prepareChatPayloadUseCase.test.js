import { jest } from '@jest/globals';
import { buildPrepareChatPayloadUseCase } from '../src/modules/ai/usecases/prepareChatPayloadUseCase.js';

describe('prepareChatPayloadUseCase', () => {
  it('encapsulates text uploads and appends to final message text', async () => {
    const readFile = jest.fn().mockResolvedValue('hello from file');
    const useCase = buildPrepareChatPayloadUseCase({
      readFile,
      encapsulateFileContent: jest.fn((name, ext, content) => `<<${name}:${ext}>>${content}`),
      getPdfParse: jest.fn(),
      getMammoth: jest.fn(),
      logger: { warn: jest.fn() }
    });

    const result = await useCase({
      message: 'base message',
      files: [
        {
          path: '/tmp/a.txt',
          originalname: 'a.txt',
          mimetype: 'text/plain'
        }
      ]
    });

    expect(readFile).toHaveBeenCalledWith('/tmp/a.txt', 'utf8');
    expect(result.uploadedPaths).toEqual(['/tmp/a.txt']);
    expect(result.finalMessageText).toContain('base message');
    expect(result.finalMessageText).toContain('<<a.txt:txt>>hello from file');
    expect(result.messagePayload).toBe(result.finalMessageText);
  });

  it('builds multimodal payload when image uploads are present', async () => {
    const readFile = jest.fn().mockResolvedValue(Buffer.from('image-bytes'));
    const useCase = buildPrepareChatPayloadUseCase({
      readFile,
      encapsulateFileContent: jest.fn(),
      getPdfParse: jest.fn(),
      getMammoth: jest.fn(),
      logger: { warn: jest.fn() }
    });

    const result = await useCase({
      message: 'check image',
      files: [
        {
          path: '/tmp/image.png',
          originalname: 'image.png',
          mimetype: 'image/png'
        }
      ]
    });

    expect(Array.isArray(result.messagePayload)).toBe(true);
    expect(result.messagePayload[0]).toEqual({ type: 'text', text: 'check image' });
    expect(result.messagePayload[1].type).toBe('image_url');
    expect(result.messagePayload[1].image_url.url).toContain('data:image/png;base64,');
  });

  it('adds human-readable error marker when PDF parsing fails', async () => {
    const readFile = jest.fn().mockResolvedValue(Buffer.from('pdf-bytes'));
    const pdfParse = jest.fn().mockRejectedValue(new Error('bad pdf'));
    const logger = { warn: jest.fn() };

    const useCase = buildPrepareChatPayloadUseCase({
      readFile,
      encapsulateFileContent: jest.fn(),
      getPdfParse: () => pdfParse,
      getMammoth: jest.fn(),
      logger
    });

    const result = await useCase({
      message: 'check pdf',
      files: [
        {
          path: '/tmp/file.pdf',
          originalname: 'file.pdf',
          mimetype: 'application/pdf'
        }
      ]
    });

    expect(result.finalMessageText).toContain('[Error reading PDF file.pdf: bad pdf]');
    expect(logger.warn).toHaveBeenCalled();
  });
});
