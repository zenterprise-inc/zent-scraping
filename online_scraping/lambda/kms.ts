import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';

export class Kms {
  private readonly kms: KMSClient;

  constructor() {
    this.kms = new KMSClient({
      region: 'ap-northeast-2',
    });
  }

  async decrypt(ciphertextBlob: string): Promise<string> {
    if (await this.isBase64(ciphertextBlob)) {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertextBlob, 'base64'),
        KeyId: process.env.KMS_KEY,
      });

      const { Plaintext } = await this.kms.send(command);

      if (!Plaintext) {
        throw new Error('Failed to decrypt: Plaintext is undefined');
      }

      return Buffer.from(Plaintext).toString();
    }
    return ciphertextBlob;
  }

  async isBase64(str: any) {
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Pattern.test(str);
  }
}
