export const parseFormData = async (
  buffer: ArrayBuffer,
  contentType: string,
): Promise<FormData> => {
  const response = new Response(buffer, {
    headers: {
      'content-type': contentType,
    },
  });
  return response.formData();
};

export const bufferToString = (buffer: ArrayBuffer): string => {
  const enc = new TextDecoder();
  return enc.decode(buffer);
};
