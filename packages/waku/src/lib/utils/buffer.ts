export const parseFormData = async (
  buffer: ArrayBuffer,
  contentType: string,
): Promise<FormData> => {
  const response = new Response(buffer, {
    headers: {
      'Content-Type': contentType,
    },
  });
  return response.formData();
};

export const bufferToString = (buffer: ArrayBuffer): string => {
  const enc = new TextDecoder('utf-8');
  return enc.decode(buffer);
};
