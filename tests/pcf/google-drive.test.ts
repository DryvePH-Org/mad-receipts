import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { driveConfigured, driveSafeName, uploadToDrive } from '@/lib/pcf/google-drive';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const photo = {
  folders: ['Main / Fund', '2026-11'],
  fileName: 'PCV-2026-0001-receipt.jpg',
  mimeType: 'image/jpeg',
  bytes: new TextEncoder().encode('jpeg-bytes').buffer as ArrayBuffer,
};

// Voucher photos go to Drive through MAD's Apps Script bridge (action pcf.upload).
describe('google drive client', () => {
  beforeEach(() => {
    vi.stubEnv('APPS_SCRIPT_URL', 'https://script.google.com/macros/s/abc/exec');
    vi.stubEnv('APPS_SCRIPT_SECRET', 'bridge-secret');
    vi.stubEnv('PCF_DRIVE_FOLDER_ID', 'pcf-folder');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off until the bridge and the petty cash folder are both set', () => {
    expect(driveConfigured()).toBe(true);
    vi.stubEnv('PCF_DRIVE_FOLDER_ID', '');
    expect(driveConfigured()).toBe(false);
    vi.stubEnv('PCF_DRIVE_FOLDER_ID', 'pcf-folder');
    vi.stubEnv('APPS_SCRIPT_SECRET', '');
    expect(driveConfigured()).toBe(false);
  });

  it('makes names safe for Drive', () => {
    expect(driveSafeName('a/b\\c:d*e?"f<g>h|i')).toBe('a-b-c-d-e--f-g-h-i');
    expect(driveSafeName('  two   spaces​ ')).toBe('two spaces');
    expect(driveSafeName('')).toBe('untitled');
    expect(driveSafeName('x'.repeat(200))).toHaveLength(80);
  });

  it('sends the photo to the bridge with the folder and safe names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true, data: { id: 'file-1', url: 'https://drive.google.com/file/d/file-1/view' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadToDrive(photo)).resolves.toEqual({ id: 'file-1', url: 'https://drive.google.com/file/d/file-1/view' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://script.google.com/macros/s/abc/exec');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      secret: 'bridge-secret',
      action: 'pcf.upload',
      folderId: 'pcf-folder',
      folders: ['Main - Fund', '2026-11'],
      name: 'PCV-2026-0001-receipt.jpg',
      mimeType: 'image/jpeg',
    });
    expect(Buffer.from(body.base64, 'base64').toString()).toBe('jpeg-bytes');
  });

  it('rejects a bridge that refuses or answers with a foreign link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ok: false, code: 403, message: 'That file is not allowed.' })));
    await expect(uploadToDrive(photo)).rejects.toThrow(/not allowed/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ok: true, data: { id: 'x', url: 'https://evil.example/x' } })));
    await expect(uploadToDrive(photo)).rejects.toThrow(/unexpected link/);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ok: true, data: {} })));
    await expect(uploadToDrive(photo)).rejects.toThrow(/refused/);
  });
});
