// TODO is this correct? better to use a library?
export const parseFormData = (body: string, contentType: string) => {
  const boundary = contentType.split('boundary=')[1];
  const parts = body.split(`--${boundary}`);
  const formData = new FormData();
  for (const part of parts) {
    if (part.trim() === '' || part === '--') continue;
    const [rawHeaders, content] = part.split('\r\n\r\n', 2);
    const headers = rawHeaders!.split('\r\n').reduce(
      (acc, currentHeader) => {
        const [key, value] = currentHeader.split(': ');
        acc[key!.toLowerCase()] = value!;
        return acc;
      },
      {} as Record<string, string>,
    );
    const contentDisposition = headers['content-disposition'];
    const nameMatch = /name="([^"]+)"/.exec(contentDisposition!);
    const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition!);
    if (nameMatch) {
      const name = nameMatch[1];
      if (filenameMatch) {
        const filename = filenameMatch[1];
        const type = headers['content-type'] || 'application/octet-stream';
        const blob = new Blob([content!], { type });
        formData.append(name!, blob, filename);
      } else {
        formData.append(name!, content!.trim());
      }
    }
  }
  return formData;
};
