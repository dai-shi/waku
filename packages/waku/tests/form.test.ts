import { describe, it, expect } from 'vitest';
import { parseFormData } from '../src/lib/utils/form';

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
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('field1')).toBe('value1');
  });

  it('should parse multiple text fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="field2"\r\n\r\nvalue2\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
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
      new TextEncoder().encode(body),
      contentType,
    );

    const file = formData.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.txt');
    expect(file.type).toBe('text/plain');
  });

  it('should handle mixed text and file fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('field1')).toBe('value1');
    const file = formData.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.txt');
  });

  it('should handle empty fields', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="emptyField"\r\n\r\n\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('emptyField')).toBe('');
  });

  it('should handle fields with special characters', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="special"\r\n\r\n!@#$%^&*()\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('special')).toBe('!@#$%^&*()');
  });

  it('should handle fields with line breaks', async () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="multiline"\r\n\r\nLine 1\r\nLine 2\r\nLine 3\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('multiline')).toBe('Line 1\r\nLine 2\r\nLine 3');
  });

  it('should parse text file fields correctly and match input', async () => {
    const boundary = 'boundary123';
    const fileContent = 'file content';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="textFile"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n${fileContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    const file = formData.get('textFile') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.txt');
    expect(file.type).toBe('text/plain');

    const fileText = await file.text();
    expect(fileText).toBe(fileContent);
  });

  it('should parse PNG file fields correctly and match input', async () => {
    const boundary = 'boundary123';
    const pngContent = String.fromCharCode.apply(null, Array.from(PNG_HEADER));
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="pngFile"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n${pngContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    const file = formData.get('pngFile') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(PNG_HEADER.length);

    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });

  it('should handle mixed text, text file, and PNG file fields and match input', async () => {
    const boundary = 'boundary123';
    const textFieldContent = 'Hello, World!';
    const textFileContent = 'This is a text file.';
    const pngContent = String.fromCharCode.apply(null, Array.from(PNG_HEADER));

    const body = `--${boundary}\r\nContent-Disposition: form-data; name="textField"\r\n\r\n${textFieldContent}\r\n--${boundary}\r\nContent-Disposition: form-data; name="textFile"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n${textFileContent}\r\n--${boundary}\r\nContent-Disposition: form-data; name="pngFile"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n${pngContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('textField')).toBe(textFieldContent);

    const textFile = formData.get('textFile') as File;
    expect(textFile).toBeInstanceOf(File);
    expect(textFile.name).toBe('test.txt');
    expect(textFile.type).toBe('text/plain');
    const textFileText = await textFile.text();
    expect(textFileText).toBe(textFileContent);

    const pngFile = formData.get('pngFile') as File;
    expect(pngFile).toBeInstanceOf(File);
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
      new TextEncoder().encode(body),
      contentType,
    );

    const decodedContent = Buffer.from(
      formData.get('base64Field') as string,
      'base64',
    ).toString();
    expect(decodedContent).toBe(originalContent);
  });

  it('should handle quoted-printable encoded content', async () => {
    const boundary = 'boundary123';
    const originalContent = 'Hello, World! Special chars: =?!';
    const quotedPrintableContent = 'Hello, World! Special chars: =3D=3F=21';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="qpField"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintableContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('qpField')).toBe(originalContent);
  });

  it('should handle binary content', async () => {
    const boundary = 'boundary123';
    const binaryContent = String.fromCharCode.apply(
      null,
      Array.from(PNG_HEADER),
    );
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="binaryField"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n${binaryContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    const file = formData.get('binaryField') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.bin');
    expect(file.type).toBe('application/octet-stream');

    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });

  it('should handle mixed encodings in a single request', async () => {
    const boundary = 'boundary123';
    const plainContent = 'Plain text';
    const base64Content = Buffer.from('Base64 encoded text').toString('base64');
    const quotedPrintableContent = 'Quoted-Printable: Hello=20World=21';
    const binaryContent = String.fromCharCode.apply(
      null,
      Array.from(PNG_HEADER),
    );

    const body = `--${boundary}\r\nContent-Disposition: form-data; name="plainField"\r\n\r\n${plainContent}\r\n--${boundary}\r\nContent-Disposition: form-data; name="base64Field"\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Content}\r\n--${boundary}\r\nContent-Disposition: form-data; name="qpField"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintableContent}\r\n--${boundary}\r\nContent-Disposition: form-data; name="binaryField"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n${binaryContent}\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = await parseFormData(
      new TextEncoder().encode(body),
      contentType,
    );

    expect(formData.get('plainField')).toBe(plainContent);
    expect(
      Buffer.from(formData.get('base64Field') as string, 'base64').toString(),
    ).toBe('Base64 encoded text');
    expect(formData.get('qpField')).toBe('Quoted-Printable: Hello World!');

    const file = formData.get('binaryField') as File;
    expect(file).toBeInstanceOf(File);
    const fileArrayBuffer = await file.arrayBuffer();
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    expect(fileUint8Array).toEqual(PNG_HEADER);
  });
});
