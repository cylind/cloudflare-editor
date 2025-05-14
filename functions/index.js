import { Router, error, json, text, withParams } from 'itty-router';

// 创建一个新的 Router 实例
const router = Router();

// --- 中间件 ---

// API Token 认证 (从请求头 X-API-TOKEN 获取)
// itty-router 的处理函数签名是 (request, env, context_passed_to_handle)
const authenticateApi = (request, env) => {
    const token = request.headers.get('X-API-TOKEN');
    if (!token || token !== env.API_SECRET_TOKEN) {
        return error(401, 'Unauthorized: Missing or invalid API Token in X-API-TOKEN header.');
    }
};

// Path Token 认证 (从 URL 路径中获取)
// `withParams` 会将路径参数附加到 request.params
const authenticatePathToken = (request, env) => {
    const { apiTokenFromPath } = request.params; // 由 withParams 提供
    if (!apiTokenFromPath || apiTokenFromPath !== env.API_SECRET_TOKEN) {
        return error(401, 'Unauthorized: Invalid or missing token in URL path.');
    }
};


// --- API 路由 (与您之前的版本完全相同) ---

// GET /api/files - 列出 R2 存储桶中的文件
router.get('/api/files', authenticateApi, async (request, env) => {
    try {
        const listed = await env.CONFIG_BUCKET.list();
        const files = listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
        }));
        return json(files);
    } catch (e) {
        console.error("R2 List Error:", e.message, e.stack);
        return error(500, `Failed to list files: ${e.message}`);
    }
});

// GET /api/files/:fileName+ - 从 R2 获取特定文件内容
router.get('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
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
        console.error(`R2 Get Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to retrieve file: ${e.message}`);
    }
});

// PUT /api/files/:fileName+ - 上传或更新 R2 中的文件
router.put('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
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
        console.error(`R2 Put Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to upload file: ${e.message}`);
    }
});

// DELETE /api/files/:fileName+ - 从 R2 删除文件
router.delete('/api/files/:fileName+', authenticateApi, withParams, async (request, env) => {
    const { fileName } = request.params;
    if (!fileName) {
        return error(400, 'File name is required for DELETE operation.');
    }
    try {
        await env.CONFIG_BUCKET.delete(decodeURIComponent(fileName));
        return text(`File ${decodeURIComponent(fileName)} deleted successfully.`);
    } catch (e) {
        console.error(`R2 Delete Error for ${fileName}:`, e.message, e.stack);
        return error(500, `Failed to delete file: ${e.message}`);
    }
});

// POST /api/files/rename - 重命名 R2 中的文件
router.post('/api/files/rename', authenticateApi, async (request, env) => {
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
        console.error(`R2 Rename Error (from ${oldKey} to ${newKey}):`, e.message, e.stack);
        return error(500, `Failed to rename file: ${e.message}`);
    }
});

// --- 直接下载路由 (与您之前的版本完全相同) ---
router.get('/:apiTokenFromPath/:fileNameForDirectDownload+', authenticatePathToken, withParams, async (request, env) => {
    const { fileNameForDirectDownload } = request.params;
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
        console.error(`R2 Direct Download Error for ${fileNameForDirectDownload}:`, e.message, e.stack);
        return error(500, `Failed to retrieve file for download: ${e.message}`);
    }
});

// --- Catch-all / 404 (与您之前的版本完全相同) ---
router.all('*', () => error(404, 'Route not found. Available API routes under /api/ or direct download format /TOKEN/filename.'));


// --- Worker 入口：修改为此种形式 ---
export async function onRequest(context) {
  // context 对象包含:
  // - request:  传入的请求对象
  // - env:      环境变量和绑定 (如 R2, KV, Secrets)
  // - params:   路径参数 (用于基于文件系统的动态路由，如 /items/[id].js - itty-router 会创建自己的 request.params)
  // - waitUntil: 用于延长函数生命周期以完成异步任务
  // - next:     用于中间件链中的下一个函数
  // - data:     用于在中间件之间传递数据

  // 将 context.request, context.env, 和 context 本身传递给 itty-router
  // itty-router 的处理函数和中间件将能够接收到 (request, env, pagesContext)
  // 其中 pagesContext 就是这里的 context 对象，如果它们需要访问 waitUntil 等。
  return router.handle(context.request, context.env, context);
}