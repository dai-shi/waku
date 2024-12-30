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
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
};
