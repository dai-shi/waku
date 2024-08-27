import { describe, it, expect } from 'vitest';
import { parseFormData } from '../src/lib/utils/form';

describe('parseFormData', () => {
  it('should parse text fields correctly', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('field1')).toBe('value1');
  });

  it('should parse multiple text fields', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="field2"\r\n\r\nvalue2\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('field1')).toBe('value1');
    expect(formData.get('field2')).toBe('value2');
  });

  it('should parse file fields correctly', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    const file = formData.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.txt');
    expect(file.type).toBe('text/plain');
  });

  it('should handle mixed text and file fields', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('field1')).toBe('value1');
    const file = formData.get('file') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.txt');
  });

  it('should handle empty fields', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="emptyField"\r\n\r\n\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('emptyField')).toBe('');
  });

  it('should handle fields with special characters', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="special"\r\n\r\n!@#$%^&*()\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('special')).toBe('!@#$%^&*()');
  });

  it('should handle fields with line breaks', () => {
    const boundary = 'boundary123';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="multiline"\r\n\r\nLine 1\r\nLine 2\r\nLine 3\r\n--${boundary}--`;
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const formData = parseFormData(new TextEncoder().encode(body), contentType);

    expect(formData.get('multiline')).toBe('Line 1\r\nLine 2\r\nLine 3');
  });
});
