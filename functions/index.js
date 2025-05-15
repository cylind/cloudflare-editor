import { Router, error, json, text, withParams } from 'itty-router';

// 创建一个新的 Router 实例
const router = Router();

// --- 中间件 (与您之前的版本完全相同) ---
const authenticateApi = (request, env) => {
    const token = request.headers.get('X-API-TOKEN');
    if (!token || token !== env.API_SECRET_TOKEN) {
        return error(401, 'Unauthorized: Missing or invalid API Token in X-API-TOKEN header.');
    }
};

const authenticatePathToken = (request, env) => {
    const { apiTokenFromPath } = request.params;
    if (!apiTokenFromPath || apiTokenFromPath !== env.API_SECRET_TOKEN) {
        return error(401, 'Unauthorized: Invalid or missing token in URL path.');
    }
};

// --- API 路由 (与您之前的版本完全相同) ---
// (这里应该是您所有的 GET /api/files, PUT /api/files/:fileName+, POST /api/files/rename 等路由定义)
// 请确保从之前的“完整代码”版本中复制所有这些路由到这里

// GET /api/files - 列出 R2 存储桶中的文件
router.get('/api/files', authenticateApi, async (request, env) => {
    console.log('[API /api/files] Handler invoked.'); // 添加日志
    try {
        const listed = await env.CONFIG_BUCKET.list();
        const files = listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
        }));
        return json(files);
    } catch (e) {
        console.error("[API /api/files] R2 List Error:", e.message, e.stack);
        return error(500, `Failed to list files: ${e.message}`);
    }
});

// GET /api/files/:fileName+ - 从 R2 获取特定文件内容
router.get('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
    console.log(`[API /api/files/:fileName+] Handler invoked for: ${fileName}`); // 添加日志
    if (!fileName) {
        return error(400, 'File name is required.');
    }
    try {
        const object = await env.CONFIG_BUCKET.get(decodeURIComponent(fileName));
        if (object === null) {
            return error(404, `File not found: ${decodeURIComponent(fileName)}`);
        }
        const headers = new Headers();
        if (object.httpMetadata?.contentType) {
            headers.set('Content-Type', object.httpMetadata.contentType);
        } else {
            headers.set('Content-Type', 'application/octet-stream');
        }
        if (object.httpEtag) {
            headers.set('ETag', object.httpEtag);
        }
        return new Response(object.body, { headers: headers });
    } catch (e) {
        console.error(`[API /api/files/:fileName+] R2 Get Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to retrieve file: ${e.message}`);
    }
});

// PUT /api/files/:fileName+
router.put('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
    console.log(`[API PUT /api/files/:fileName+] Handler invoked for: ${fileName}`);
    // ... (从之前完整代码复制其余的 PUT 逻辑, 包括 try/catch 和 console.error)
    if (!fileName) {
        return error(400, 'File name is required for PUT operation.');
    }
    try {
        const contentLength = request.headers.get('content-length');
        if (contentLength === '0' && !request.body) {
             await env.CONFIG_BUCKET.put(decodeURIComponent(fileName), new Uint8Array(), {
                httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
            });
        } else if (!request.body) {
            return error(400, 'Request body is missing for PUT operation.');
        } else {
            await env.CONFIG_BUCKET.put(decodeURIComponent(fileName), request.body, {
                httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
            });
        }
        return text(`File ${decodeURIComponent(fileName)} uploaded successfully.`);
    } catch (e) {
        console.error(`[API PUT /api/files/:fileName+] R2 Put Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to upload file: ${e.message}`);
    }
});

// DELETE /api/files/:fileName+
router.delete('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
    console.log(`[API DELETE /api/files/:fileName+] Handler invoked for: ${fileName}`);
    // ... (从之前完整代码复制其余的 DELETE 逻辑, 包括 try/catch 和 console.error)
    if (!fileName) {
        return error(400, 'File name is required for DELETE operation.');
    }
    try {
        await env.CONFIG_BUCKET.delete(decodeURIComponent(fileName));
        return text(`File ${decodeURIComponent(fileName)} deleted successfully.`);
    } catch (e) {
        console.error(`[API DELETE /api/files/:fileName+] R2 Delete Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to delete file: ${e.message}`);
    }
});

// POST /api/files/rename
router.post('/api/files/rename', authenticateApi, async (request, env) => {
    console.log(`[API POST /api/files/rename] Handler invoked.`);
    // ... (从之前完整代码复制其余的 POST /rename 逻辑, 包括 try/catch 和 console.error)
    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return error(400, "Invalid JSON payload for rename operation. Expected { \"oldKey\": \"...\", \"newKey\": \"...\" }");
    }
    const { oldKey, newKey } = payload;
    if (!oldKey || !newKey) {
        return error(400, 'Both oldKey and newKey are required in the JSON payload for rename.');
    }
    if (oldKey === newKey) {
        return text('Old key and new key are the same. No action taken.');
    }
    try {
        const object = await env.CONFIG_BUCKET.get(oldKey);
        if (object === null) {
            return error(404, `Source file not found for rename: ${oldKey}`);
        }
        await env.CONFIG_BUCKET.put(newKey, object.body, {
             httpMetadata: object.httpMetadata,
             customMetadata: object.customMetadata
        });
        await env.CONFIG_BUCKET.delete(oldKey);
        return text(`File renamed from ${oldKey} to ${newKey} successfully.`);
    } catch (e) {
        console.error(`[API POST /api/files/rename] R2 Rename Error (from ${oldKey} to ${newKey}):`, e.message, e.stack);
        return error(500, `Failed to rename file: ${e.message}`);
    }
});


// --- 直接下载路由 (与您之前的版本完全相同) ---
router.get('/:apiTokenFromPath/:fileNameForDirectDownload+', authenticatePathToken, withParams, async (request, env) => {
    const { apiTokenFromPath, fileNameForDirectDownload } = request.params;
    console.log(`[Direct Download] Handler invoked for token: ${apiTokenFromPath}, file: ${fileNameForDirectDownload}`);
    // ... (从之前完整代码复制其余的直接下载逻辑, 包括 try/catch 和 console.error)
    if (!fileNameForDirectDownload) {
        return error(400, 'File name is required for direct download.');
    }
    try {
        const object = await env.CONFIG_BUCKET.get(decodeURIComponent(fileNameForDirectDownload));
        if (object === null) {
            return error(404, `File not found for direct download: ${decodeURIComponent(fileNameForDirectDownload)}`);
        }
        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        const actualFileName = decodeURIComponent(fileNameForDirectDownload).split('/').pop();
        headers.set('Content-Disposition', `attachment; filename="${actualFileName}"`);
        if (object.httpEtag) {
            headers.set('ETag', object.httpEtag);
        }
        if (object.cacheControl) {
            headers.set('Cache-Control', object.cacheControl);
        }
        return new Response(object.body, { headers: headers });
    } catch (e) {
        console.error(`[Direct Download] R2 Direct Download Error for ${fileNameForDirectDownload}:`, e.message, e.stack);
        return error(500, `Failed to retrieve file for download: ${e.message}`);
    }
});


// --- 新增：明确的根路径 '/' 路由，用于测试 ---
router.get('/', (request, env, pagesContext) => {
  console.log('[itty-router] Explicit GET / route hit.');
  // 此处理函数通常只在 Cloudflare Pages 将根路径 '/' 路由到此 Function 时才会被调用。
  // 正常情况下，如果 `public/index.html` 存在，Pages 会优先提供静态文件。
  return new Response('Hello from itty-router GET / route! If you see this, Pages routed / to the Function.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
});

// --- Catch-all / 404 (确保这是最后一个路由) ---
router.all('*', (request, env, pagesContext) => {
  console.log(`[itty-router] Catch-all * route hit for: ${request.method} ${request.url}`);
  return error(404, `Route not found by itty-router. Original URL: ${request.url}`);
});


// functions/index.js
// ... (所有顶层的 IMPORTS, const router = Router(); 实例化, 以及所有的 router.get(), router.post() 等路由定义保持不变)
// ... (确保您之前添加的 router.get('/') 和 router.all('*',...) 调试路由也还在)
// --- Worker 入口：再次修改此部分以测试最简化的 router.handle() 调用 ---
export async function onRequest(context) {
  console.log(`[onRequest DEBUG] Received request for: ${context.request.method} ${new URL(context.request.url).pathname}`);
  const envKeys = context.env ? Object.keys(context.env).join(', ') : 'env is null/undefined';
  console.log(`[onRequest DEBUG] env keys available: ${envKeys}`); // 我们知道 env 是正确填充的

  let response;
  try {
    // 测试：最简化的调用 - 只传递 request 对象。
    // 路由处理函数 (例如我们为 GET / 或 * 定义的简单处理函数) 将会以 (request) 的形式被调用。
    // 任何期望 (request, env) 签名的处理函数将会收到 (request, undefined) 从而可能出错，
    // 但我们的目标是看 itty-router 的核心分发是否工作。
    console.log(`[onRequest DEBUG] Calling router.handle(context.request)`);
    response = await router.handle(context.request); // <--- 主要变化在这里！

    if (response instanceof Response) {
      console.log(`[onRequest DEBUG] router.handle() returned a Response object with status: ${response.status}`);
      return response;
    } else {
      console.error(`[onRequest DEBUG] CRITICAL_ERROR: router.handle() did NOT return a Response object. Returned:`, response);
      return new Response('Error: Main handler did not produce a valid Response object from router.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  } catch (e) {
    console.error(`[onRequest DEBUG] CRITICAL_ERROR: Exception caught directly from router.handle() or its promise: Name: ${e.name}, Message: ${e.message}, Stack: ${e.stack}`);
    return new Response(`Unhandled exception in main function handler: ${e.name}: ${e.message}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}