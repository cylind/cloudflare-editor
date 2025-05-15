// functions/index.js (绝对最小化测试，无外部路由依赖)

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  // 尝试记录每个进入此函数的请求
  console.log(`[ULTRA_MIN_TEST] Request: ${method} ${pathname}`);
  if (env && Object.keys(env).length > 0) {
    console.log(`[ULTRA_MIN_TEST] Env keys: ${Object.keys(env).join(', ')}`);
  } else {
    console.log("[ULTRA_MIN_TEST] Env object is empty or not present.");
  }


  // 手动处理 /api/files 路由
  if (pathname === '/api/files' && method === 'GET') {
    console.log('[ULTRA_MIN_TEST] Matched GET /api/files by manual routing.');
    
    // 模拟API Token认证 (非常简化)
    const apiTokenHeader = request.headers.get('X-API-TOKEN');
    if (!env.API_SECRET_TOKEN) {
        console.error('[ULTRA_MIN_TEST] API_SECRET_TOKEN is NOT DEFINED in env!');
        return new Response(JSON.stringify({ error: "Server configuration error: API secret not set." }), { 
            status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });
    }
    if (apiTokenHeader !== env.API_SECRET_TOKEN) {
      console.log('[ULTRA_MIN_TEST] Auth failed for /api/files. Token received:', apiTokenHeader);
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing API Token." }), { 
        status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } 
      });
    }
    console.log('[ULTRA_MIN_TEST] Auth success for /api/files.');

    // 模拟R2列表操作 (不实际调用R2，只返回mock数据)
    try {
      console.log('[ULTRA_MIN_TEST] Simulating R2 list operation for /api/files.');
      const mockFiles = [
        { key: "mock-file1.yaml", size: 123, uploaded: new Date().toISOString() },
        { key: "mock-file2.json", size: 456, uploaded: new Date().toISOString() }
      ];
      console.log('[ULTRA_MIN_TEST] Returning mock file list for /api/files.');
      return new Response(JSON.stringify(mockFiles), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (e) {
      console.error('[ULTRA_MIN_TEST] Error during mock R2 simulation:', e.message, e.stack);
      return new Response(JSON.stringify({ error: "Internal server error during mock R2 operation." }), { 
        status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } 
      });
    }
  }

  // （可选）手动处理直接下载链接的简化版 (如果需要测试)
  // 例如: /TOKEN/filename.txt (非常简化的匹配)
  const pathParts = pathname.slice(1).split('/');
  if (pathParts.length >= 2 && method === 'GET' && pathParts[0] !== 'api') { // 假设token后面直接是文件名
    const tokenFromPath = pathParts[0];
    const fileNameFromPath = pathParts.slice(1).join('/'); // 支持文件名中包含'/'的情况
    console.log(`[ULTRA_MIN_TEST] Matched potential direct download: Token=${tokenFromPath}, File=${fileNameFromPath}`);
    if (tokenFromPath !== env.API_SECRET_TOKEN) {
         console.log('[ULTRA_MIN_TEST] Auth failed for direct download.');
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid token for direct download." }), { 
            status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });
    }
    return new Response(`ULTRA_MIN_TEST: Mock download for file: ${fileNameFromPath}`, {
      status: 200,
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileNameFromPath}"`
      }
    });
  }


  // 对于所有其他未被上面手动处理的、但仍然被 _routes.json 路由到此函数的请求
  console.log(`[ULTRA_MIN_TEST] Path "${pathname}" (method ${method}) not explicitly handled. Returning 404.`);
  return new Response(JSON.stringify({ error: `ULTRA_MIN_TEST: Path not found: ${method} ${pathname}` }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}