import { Router, error, json, text, withParams } from 'itty-router';

// 创建一个新的 Router 实例
const router = Router();

// --- 中间件 ---

// API Token 认证 (从请求头 X-API-TOKEN 获取)
const authenticateApi = (request, env) => {
    const token = request.headers.get('X-API-TOKEN');
    if (!token || token !== env.API_SECRET_TOKEN) {
        // API_SECRET_TOKEN 应该在 Cloudflare Worker 的 Secrets 中设置
        return error(401, 'Unauthorized: Missing or invalid API Token in X-API-TOKEN header.');
    }
};

// Path Token 认证 (从 URL 路径中获取)
const authenticatePathToken = (request, env) => {
    const { apiTokenFromPath } = request.params; // 从路由参数中提取
    if (!apiTokenFromPath || apiTokenFromPath !== env.API_SECRET_TOKEN) {
        return error(401, 'Unauthorized: Invalid or missing token in URL path.');
    }
};


// --- API 路由 ---

// GET /api/files - 列出 R2 存储桶中的文件
router.get('/api/files', authenticateApi, async (request, env) => {
    try {
        const listed = await env.CONFIG_BUCKET.list(); // CONFIG_BUCKET 是在 wrangler.toml 中绑定的 R2 存储桶
        const files = listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
            // customMetadata: obj.customMetadata, // 如果您设置了自定义元数据
            // httpMetadata: obj.httpMetadata,   // 如果您关心 HTTP 元数据如 ContentType
        }));
        return json(files);
    } catch (e) {
        console.error("R2 List Error:", e.message, e.stack);
        return error(500, `Failed to list files: ${e.message}`);
    }
});

// GET /api/files/:fileName - 从 R2 获取特定文件内容
// :fileName+ 表示它可以匹配包含斜杠的文件名
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
        // 从对象中获取元数据，特别是 Content-Type
        const headers = new Headers();
        if (object.httpMetadata?.contentType) {
            headers.set('Content-Type', object.httpMetadata.contentType);
        } else {
            headers.set('Content-Type', 'application/octet-stream'); // 默认类型
        }
        // 其他元数据可以按需添加，例如 ETag
        if (object.httpEtag) {
            headers.set('ETag', object.httpEtag);
        }

        return new Response(object.body, {
            headers: headers,
        });
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
        // 获取请求体的内容长度
        const contentLength = request.headers.get('content-length');
        if (contentLength === '0' && !request.body) {
             // 允许空文件上传, 但确保 request.body 存在
             await env.CONFIG_BUCKET.put(decodeURIComponent(fileName), new Uint8Array(), {
                httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
            });
        } else if (!request.body) {
            return error(400, 'Request body is missing for PUT operation.');
        } else {
            await env.CONFIG_BUCKET.put(decodeURIComponent(fileName), request.body, {
                httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
                // customMetadata: { uploadedBy: 'online-editor' }, // 可选的自定义元数据
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

// POST /api/files/rename - 重命名 R2 中的文件 (通过复制然后删除实现)
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
        return text('Old key and new key are the same. No action taken.'); // 或者 error(400, ...)
    }

    try {
        // 1. 获取旧对象
        const object = await env.CONFIG_BUCKET.get(oldKey);
        if (object === null) {
            return error(404, `Source file not found for rename: ${oldKey}`);
        }

        // 2. 将内容写入新对象 (保留元数据)
        await env.CONFIG_BUCKET.put(newKey, object.body, {
             httpMetadata: object.httpMetadata, // 保留如 Content-Type 等 HTTP 元数据
             customMetadata: object.customMetadata // 保留自定义元数据
        });

        // 3. 删除旧对象
        await env.CONFIG_BUCKET.delete(oldKey);

        return text(`File renamed from ${oldKey} to ${newKey} successfully.`);
    } catch (e) {
        console.error(`R2 Rename Error (from ${oldKey} to ${newKey}):`, e.message, e.stack);
        // 考虑更复杂的错误处理，例如如果删除旧key失败，是否要尝试删除新key（回滚）
        return error(500, `Failed to rename file: ${e.message}`);
    }
});


// --- 直接下载路由 ---
// GET /:apiTokenFromPath/:fileNameForDirectDownload+
// 例如: your-site.pages.dev/YOUR_API_TOKEN/config-files/production.yaml
router.get('/:apiTokenFromPath/:fileNameForDirectDownload+', authenticatePathToken, withParams, async (request, env) => {
    const { fileNameForDirectDownload } = request.params; // fileNameForDirectDownload 会包含路径的其余部分
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
        // 为了强制下载，而不是在浏览器中打开 (特别是对于 text/html, text/plain 等)
        // .pop() 获取路径的最后一部分作为文件名
        const actualFileName = decodeURIComponent(fileNameForDirectDownload).split('/').pop();
        headers.set('Content-Disposition', `attachment; filename="${actualFileName}"`);

        if (object.httpEtag) {
            headers.set('ETag', object.httpEtag);
        }
        // 可以根据需要从 object 复制更多 R2 特定的 HTTP 头，如 Cache-Control
        if (object.cacheControl) {
            headers.set('Cache-Control', object.cacheControl);
        }


        return new Response(object.body, {
            headers: headers,
        });
    } catch (e) {
        console.error(`R2 Direct Download Error for ${fileNameForDirectDownload}:`, e.message, e.stack);
        return error(500, `Failed to retrieve file for download: ${e.message}`);
    }
});


// --- Catch-all / 404 ---
// 匹配所有其他未被前面路由处理的请求
router.all('*', () => error(404, 'Route not found. Available API routes under /api/ or direct download format /TOKEN/filename.'));


// --- Worker 入口 ---
// 这是唯一的 export default
export default {
    async fetch(request, env, ctx) {
        // 将所有请求交给 itty-router 处理
        // itty-router 会根据上面定义的路由进行匹配
        // 如果没有匹配的路由，则会调用上面定义的 router.all('*', ...)
        return router.handle(request, env, ctx);
    }
};