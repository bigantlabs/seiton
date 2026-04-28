import { request as httpRequest } from 'node:http';
import { z } from 'zod';
import { BwItemSchema, BwFolderSchema, makeBwError, BwErrorCode } from './domain/types.js';
import type { BwItem, BwFolder } from './domain/types.js';
import type { BwAdapter, BwResult } from './bw.js';
import type { Logger } from '../adapters/logging.js';

interface ServeResponse {
  statusCode: number;
  body: string;
}

function httpCall(
  baseUrl: string,
  method: string,
  path: string,
  body?: string,
): Promise<ServeResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }
    const req = httpRequest(url, { method, headers, timeout: 30_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timed out'));
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function mapHttpError(statusCode: number, body: string): BwResult<never> {
  if (statusCode === 404) {
    return { ok: false, error: makeBwError(BwErrorCode.NOT_FOUND, `Not found: ${body}`, statusCode) };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, error: makeBwError(BwErrorCode.SESSION_MISSING, `Auth error: ${body}`, statusCode) };
  }
  return { ok: false, error: makeBwError(BwErrorCode.UNKNOWN, `bw serve error (${statusCode}): ${body}`, statusCode) };
}

export function createBwServeAdapter(
  baseUrl: string,
  cliFallback: BwAdapter,
  logger?: Logger,
): BwAdapter {
  async function serveCall<T>(
    method: string,
    path: string,
    parser: (raw: unknown) => BwResult<T>,
    body?: string,
  ): Promise<BwResult<T>> {
    logger?.debug('bw-serve: request', { method, path });
    let res: ServeResponse;
    try {
      res = await httpCall(baseUrl, method, path, body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: makeBwError(BwErrorCode.UNKNOWN, `bw serve request failed: ${msg}`) };
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      return mapHttpError(res.statusCode, res.body);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(res.body);
    } catch {
      return { ok: false, error: makeBwError(BwErrorCode.INVALID_JSON, 'Failed to parse bw serve response') };
    }

    return parser(raw);
  }

  return {
    getVersion(): Promise<BwResult<string>> {
      return cliFallback.getVersion();
    },

    async getStatus(): Promise<BwResult<{ status: string }>> {
      return serveCall('GET', '/status', (raw) => {
        const obj = raw as { status?: string };
        return { ok: true, data: { status: obj.status ?? 'unknown' } };
      });
    },

    async getItem(_session: string, itemId: string): Promise<BwResult<BwItem>> {
      return serveCall('GET', `/object/item/${encodeURIComponent(itemId)}`, (raw) => {
        const parsed = BwItemSchema.safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'Item failed schema validation') };
        }
        return { ok: true, data: parsed.data };
      });
    },

    async listItems(_session: string): Promise<BwResult<BwItem[]>> {
      return serveCall('GET', '/list/object/items', (raw) => {
        const parsed = z.array(BwItemSchema).safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const path = issue?.path.length ? issue.path.join('.') : '(root)';
          return { ok: false, error: makeBwError(
            BwErrorCode.SCHEMA_MISMATCH,
            `Vault items failed schema validation at ${path}: ${issue?.message ?? 'unknown error'}`,
          ) };
        }
        return { ok: true, data: parsed.data };
      });
    },

    async listFolders(_session: string): Promise<BwResult<BwFolder[]>> {
      return serveCall('GET', '/list/object/folders', (raw) => {
        const parsed = z.array(BwFolderSchema).safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'Folders failed schema validation') };
        }
        return { ok: true, data: parsed.data };
      });
    },

    async editItem(_session: string, itemId: string, encodedJson: string): Promise<BwResult<void>> {
      let jsonBody: string;
      try {
        jsonBody = Buffer.from(encodedJson, 'base64').toString('utf8');
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'Failed to decode base64 item JSON') };
      }

      return serveCall('PUT', `/object/item/${encodeURIComponent(itemId)}`, () => {
        return { ok: true, data: undefined };
      }, jsonBody);
    },

    async deleteItem(_session: string, itemId: string): Promise<BwResult<void>> {
      return serveCall('DELETE', `/object/item/${encodeURIComponent(itemId)}`, () => {
        return { ok: true, data: undefined };
      });
    },

    async createFolder(_session: string, encodedJson: string): Promise<BwResult<string>> {
      let jsonBody: string;
      try {
        jsonBody = Buffer.from(encodedJson, 'base64').toString('utf8');
      } catch {
        return { ok: false, error: makeBwError(BwErrorCode.UNKNOWN, 'Failed to decode base64 folder JSON') };
      }

      return serveCall('POST', '/object/folder', (raw) => {
        const obj = raw as { id?: string };
        if (!obj.id) {
          return { ok: false, error: makeBwError(BwErrorCode.SCHEMA_MISMATCH, 'bw serve create folder response missing id') };
        }
        return { ok: true, data: obj.id };
      }, jsonBody);
    },

    async sync(_session: string): Promise<BwResult<void>> {
      return serveCall('POST', '/sync', () => {
        return { ok: true, data: undefined };
      });
    },
  };
}
