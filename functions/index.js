// functions/index.js
import { Router, json as ittyJsonRenamed, error as ittyErrorRenamed } from 'itty-router'; // 重命名导入以防冲突

const router = Router();

// 极简化的 /api/files 路由，用于最终测试
router.get('/api/files', async (request, env) => {
  const requestUrl = new URL(request.url);
  console.log(`[API /api/files SUPER_DEBUG] Handler for "${requestUrl.pathname}" invoked.`);
  const simpleJSONResponse = { 
    message: "SUPER_DEBUG: Test JSON response from /api/files", 
    timestamp: new Date().toISOString(),
    env_keys: env ? Object.keys(env).join(', ') : "env is missing" // 检查env是否真的传递进来了
  };
  try {
    console.log('[API /api/files SUPER_DEBUG] Attempting to return JSON response.');
    return ittyJsonRenamed(simpleJSONResponse);
  } catch (e) {
    const errorMsg = `[API /api/files SUPER_DEBUG] Error creating JSON: ${e.message}`;
    console.error(errorMsg, e.stack);
    return new Response(JSON.stringify({ error: errorMsg }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
});

// 简化其他路由用于减少干扰，或者暂时注释掉它们
router.get('/:token/:filename+', async (request, env) => {
    console.log(`[Direct Download SUPER_DEBUG] Route invoked for token: ${request.params.token}, file: ${request.params.filename}`);
    return new Response(`SUPER_DEBUG: Direct download route. Token: ${request.params.token}, File: ${request.params.filename}`, {status: 200, headers: {'Content-Type': 'text/plain'}});
});

// Catch-all
router.all('*', (request) => {
  const requestUrl = new URL(request.url);
  console.log(`[Catch-all SUPER_DEBUG] Route hit for: ${requestUrl.pathname}`);
  const notFoundResponse = { error: "SUPER_DEBUG: Route not found by itty-router", status: 404, requestedUrl: requestUrl.href };
  return new Response(JSON.stringify(notFoundResponse), { 
    status: 404, 
    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
  });
});

export async function onRequest(context) {
  const url = new URL(context.request.url);
  console.log(`[onRequest SUPER_DEBUG] Request for: ${context.request.method} ${url.pathname}`);
  try {
    // 确保 context.env 真的存在并传递给了 router.handle
    if (!context.env) {
        console.error("[onRequest SUPER_DEBUG] CRITICAL: context.env is undefined or null!");
        // 即使env有问题，也尝试让router处理，看它如何反应
    } else {
        const envKeys = Object.keys(context.env).join(', ');
        console.log(`[onRequest SUPER_DEBUG] context.env keys: ${envKeys}`);
    }

    const response = await router.handle(context.request, context.env); // 保持这个调用方式

    if (!response || !(response instanceof Response)) {
        const errorMsg = "[onRequest SUPER_DEBUG] CRITICAL: router.handle returned invalid or no response!";
        console.error(errorMsg, response);
        return new Response(JSON.stringify({error: errorMsg, originalResponse: String(response)}), {status: 500, headers: {'Content-Type': 'application/json'}});
    }
    console.log(`[onRequest SUPER_DEBUG] router.handle successful for ${url.pathname}, status: ${response.status}`);
    return response;
  } catch (e) {
    const errorMsg = `[onRequest SUPER_DEBUG] CRITICAL: Exception from router.handle for ${url.pathname}: ${e.name} - ${e.message}`;
    console.error(errorMsg, e.stack);
    return new Response(JSON.stringify({error: errorMsg, stack: e.stack}), {status: 500, headers: {'Content-Type': 'application/json'}});
  }
}