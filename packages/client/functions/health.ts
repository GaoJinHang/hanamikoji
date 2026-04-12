type PagesFunction<TEnv = unknown> = (context: { request: Request; env: TEnv }) => Response | Promise<Response>;

interface Env {
  VITE_SOCKET_URL?: string;
}

function getWorkerHealthUrl(env: Env): URL {
  const raw = (env.VITE_SOCKET_URL || '').trim();
  if (!raw) {
    throw new Error('Pages 环境变量 VITE_SOCKET_URL 未配置');
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) ? raw : `https://${raw}`;
  const httpUrl = withProtocol
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://');

  const url = new URL(httpUrl);
  url.pathname = '/health';
  return url;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const target = getWorkerHealthUrl(context.env);
    return fetch(target.toString(), {
      method: 'GET',
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Pages 健康检查代理配置错误' }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
};
