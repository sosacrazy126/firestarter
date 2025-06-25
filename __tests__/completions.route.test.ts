/* eslint-disable */
import { POST } from '@/app/api/v1/chat/completions/route';

describe('Chat completions route', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    (global.fetch as any) = jest.fn();
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  function mockRequest({ header = {}, body }: { header?: Record<string,string>; body: any }) {
    return {
      headers: new Headers(header),
      json: async () => body,
    } as any;
  }

  it('returns 400 when no provider header and model not firecrawl', async () => {
    const req = mockRequest({ body: { messages: [], stream: false } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when Google header provided but key missing', async () => {
    const req = mockRequest({ header: { 'x-use-google-ai':'true' }, body: { messages: [], stream:false }});
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('proxies to Google when header + key present', async () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = 'test-key';
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'abc', choices: [] }),
      headers: new Headers({ 'content-type':'application/json'}),
      body: null,
    });
    const req = mockRequest({ header: { 'x-use-google-ai':'true' }, body: { messages: [], stream:false }});
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('abc');
  });
});