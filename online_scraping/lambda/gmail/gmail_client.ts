import fs from 'fs';
import { google } from 'googleapis';

const CREDENTIALS_PATHS = ['gmail/credentials.json', 'gmail/credentials2.json'];
const TOKEN_PATHS = ['gmail/token.json', 'gmail/token2.json'];
const LABEL_IDS = ['Label_3813220765496748569', 'Label_4416260065788498661'];

export class GmailClient {
  private gmailClients: Array<ReturnType<typeof google.gmail> | null> = [
    null,
    null,
  ];

  constructor() {}

  async loadAuthenticatedClient(index: number) {
    if (this.gmailClients[index]) return this.gmailClients[index];

    const credentials = JSON.parse(
      fs.readFileSync(CREDENTIALS_PATHS[index], 'utf8'),
    );
    const token = JSON.parse(fs.readFileSync(TOKEN_PATHS[index], 'utf8'));

    const { client_id, client_secret, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0],
    );
    oAuth2Client.setCredentials(token);

    this.gmailClients[index] = google.gmail({
      version: 'v1',
      auth: oAuth2Client,
    });
    return this.gmailClients[index];
  }

  extractSixDigitCode(html: string): string[] {
    const text = html.replace(/<[^>]*>/g, '');
    const matches = text.match(/\b\d{6}\b/g);
    return matches || [];
  }

  async getLatestSixDigitCodeFromLabel(
    curTimestampInSec: number,
    index: number,
  ): Promise<string | null> {
    const gmail = await this.loadAuthenticatedClient(index);

    for (let attempt = 0; attempt < 15; attempt++) {
      const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [LABEL_IDS[index]],
        maxResults: 1,
        q: 'after:' + curTimestampInSec,
      });

      const messages = res.data.messages;
      if (messages && messages.length > 0) {
        const messageId = messages[0].id;

        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: messageId!,
          format: 'full',
        });

        const payload = msgRes.data.payload;
        const parts = payload?.parts || [];
        let body = payload?.body?.data;

        if (!body && parts.length > 0) {
          const part = parts.find(
            (p) => p.mimeType === 'text/plain' || p.mimeType === 'text/html',
          );
          body = part?.body?.data || '';
        }

        if (body) {
          const decoded = Buffer.from(body, 'base64').toString('utf-8');
          const codes = this.extractSixDigitCode(decoded);
          const firstCode = codes[0] || null;
          console.log('📧 인증번호:', firstCode);
          return firstCode;
        } else {
          console.log('본문이 없습니다.');
          return null;
        }
      } else {
        console.log(`해당 라벨에 이메일이 없습니다. (시도 ${attempt}/5)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return null;
  }
}
