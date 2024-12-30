import { describe, it, expect } from 'vitest';
import { bufferToString, parseFormData } from '../src/lib/utils/buffer.js';

// Minimal valid 1x1 pixel PNG image
const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2,
  0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe('parseFormData', () => {
  it('should parse text fields correctly', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('field1')).toBe('value1');
  });

  it('should parse multiple text fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="field2"\r\n\r\nvalue2\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('field1')).toBe('value1');
    expect(formData.get('field2')).toBe('value2');
  });

  it('should parse file fields correctly', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    const file = formData.get('file') as File;
    expect(file.name).toBe('test.txt');
    expect(file.type).toBe('text/plain');
    expect(file.size).toBe(12);
    expect(await file.text()).toBe('file content');
  });

  it('should handle mixed text and file fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('field1')).toBe('value1');
    const file = formData.get('file') as File;
    expect(file.name).toBe('test.txt');
    expect(file.type).toBe('text/plain');
    expect(file.size).toBe(12);
    expect(await file.text()).toBe('file content');
  });

  it('should handle empty fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="emptyField"\r\n\r\n\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('emptyField')).toBe('');
  });

  it('should handle fields with special characters', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="special"\r\n\r\n!@#$%^&*()\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('special')).toBe('!@#$%^&*()');
  });

  it('should handle fields with line breaks', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="multiline"\r\n\r\nLine 1\r\nLine 2\r\nLine 3\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    expect(formData.get('multiline')).toBe('Line 1\r\nLine 2\r\nLine 3');
  });

  it('should parse PNG file fields correctly and match input', async () => {
    const formData = new FormData();
    formData.append(
      'pngFile',
      new Blob([PNG_HEADER], { type: 'image/png' }),
      'test.png',
    );

    // Create a Request object
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const contentType = request.headers.get('Content-Type');

    // Get the body as ArrayBuffer
    const arrayBuffer = await request.arrayBuffer();

    // Convert ArrayBuffer to Uint8Array
    const body = new Uint8Array(arrayBuffer);

    // Now use your parseFormData function
    const parsedFormData = await parseFormData(body.buffer, contentType!);

    const file = parsedFormData.get('pngFile') as File;
    expect(file.name).toBe('test.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(PNG_HEADER.length);

    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });

  it('should handle mixed text, text file, and PNG file fields and match input', async () => {
    const formData = new FormData();
    formData.append('textField', 'Hello, World!');
    formData.append(
      'textFile',
      new Blob(['This is a text file.'], { type: 'text/plain' }),
      'test.txt',
    );
    formData.append(
      'pngFile',
      new Blob([PNG_HEADER], { type: 'image/png' }),
      'test.png',
    );

    // Create a Request object
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const contentType = request.headers.get('Content-Type');

    // Get the body as ArrayBuffer
    const arrayBuffer = await request.arrayBuffer();

    // Convert ArrayBuffer to Uint8Array
    const body = new Uint8Array(arrayBuffer);

    // Now use your parseFormData function
    const parsedFormData = await parseFormData(body.buffer, contentType!);

    expect(parsedFormData.get('textField')).toBe('Hello, World!');

    const textFile = parsedFormData.get('textFile') as File;
    expect(textFile.name).toBe('test.txt');
    expect(textFile.type).toBe('text/plain');
    const textFileText = await textFile.text();
    expect(textFileText).toBe('This is a text file.');

    const pngFile = parsedFormData.get('pngFile') as File;
    expect(pngFile.name).toBe('test.png');
    expect(pngFile.type).toBe('image/png');
    expect(pngFile.size).toBe(PNG_HEADER.length);
    const pngFileArrayBuffer = await pngFile.arrayBuffer();
    const pngFileUint8Array = new Uint8Array(pngFileArrayBuffer);
    expect(pngFileUint8Array).toEqual(PNG_HEADER);
  });

  it('should handle base64 encoded content', async () => {
    const boundary = 'boundary123';
    const originalContent = 'Hello, World!';
    const base64Content = Buffer.from(originalContent).toString('base64');
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="base64Field"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Content}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      contentType,
    );

    let decodedContent = formData.get('base64Field') as string;
    const [major, minor] = process.version.slice(1).split('.').map(Number) as [
      number,
      number,
      number,
    ];
    if (major < 20 || (major === 20 && minor < 16)) {
      // FIXME This means `parseFormData` is not working correctly across all Node.js versions
      decodedContent = Buffer.from(decodedContent, 'base64').toString();
    }

    expect(decodedContent).toBe(originalContent);
  });

  it('should handle binary content', async () => {
    const formData = new FormData();
    formData.append(
      'binaryField',
      new Blob([PNG_HEADER], { type: 'application/octet-stream' }),
      'test.bin',
    );

    // Create a Request object
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const contentType = request.headers.get('Content-Type');

    // Get the body as ArrayBuffer
    const arrayBuffer = await request.arrayBuffer();

    // Convert ArrayBuffer to Uint8Array
    const body = new Uint8Array(arrayBuffer);

    // Now use your parseFormData function
    const parsedFormData = await parseFormData(body.buffer, contentType!);

    const file = parsedFormData.get('binaryField') as File;
    expect(file.name).toBe('test.bin');
    expect(file.type).toBe('application/octet-stream');
    expect(file.size).toBe(PNG_HEADER.length);

    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });

  it('should handle mixed encodings in a single request', async () => {
    const plainContent = 'Plain text';
    const base64Content = Buffer.from('Base64 encoded text').toString('base64');
    const binaryContent = new Uint8Array(PNG_HEADER);

    const formData = new FormData();
    formData.append('plainField', plainContent);
    formData.append('base64Field', base64Content);
    formData.append(
      'binaryField',
      new Blob([binaryContent], { type: 'application/octet-stream' }),
      'test.bin',
    );

    // Create a Request object
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const contentType = request.headers.get('Content-Type');

    // Get the body as ArrayBuffer
    const arrayBuffer = await request.arrayBuffer();

    // Convert ArrayBuffer to Uint8Array
    const body = new Uint8Array(arrayBuffer);

    // Now use your parseFormData function
    const parsedFormData = await parseFormData(body.buffer, contentType!);

    expect(parsedFormData.get('plainField')).toBe(plainContent);
    expect(
      Buffer.from(
        parsedFormData.get('base64Field') as string,
        'base64',
      ).toString(),
    ).toBe('Base64 encoded text');

    const file = parsedFormData.get('binaryField') as File;
    expect(file.name).toBe('test.bin');
    expect(file.type).toBe('application/octet-stream');
    expect(file.size).toBe(PNG_HEADER.length);

    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });
});

describe('bufferToString', () => {
  it('should convert an empty ArrayBuffer to an empty string', () => {
    const buffer = new ArrayBuffer(0);
    expect(bufferToString(buffer)).toBe('');
  });

  it('should convert a simple ASCII string', () => {
    const text = 'Hello, World!';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(bufferToString(buffer as ArrayBuffer)).toBe(text);
  });

  it('should handle Unicode characters', () => {
    const text = '你好，世界！😊';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(bufferToString(buffer as ArrayBuffer)).toBe(text);
  });

  it('should handle a mix of ASCII and Unicode characters', () => {
    const text = 'Hello, 世界! 🌍';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(bufferToString(buffer as ArrayBuffer)).toBe(text);
  });

  it('should handle a large string', () => {
    const text = 'a'.repeat(1000000); // 1 million 'a' characters
    const buffer = new TextEncoder().encode(text).buffer;
    expect(bufferToString(buffer as ArrayBuffer)).toBe(text);
  });

  it('should handle null characters', () => {
    const text = 'Hello\0World';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(bufferToString(buffer as ArrayBuffer)).toBe(text);
  });
});
