import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const hash = (fname: string) =>
  new Promise<string>((resolve) => {
    const sha256 = createHash('sha256');
    sha256.on('readable', () => {
      const data = sha256.read();
      if (data) {
        resolve(data.toString('hex').slice(0, 9));
      }
    });
    createReadStream(fname).pipe(sha256);
  });
