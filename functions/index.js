// functions/index.js (临时测试代码)
export async function onRequest(context) {
  // context 对象包含 request, env, params, next, data 等
  console.log("Simplified function was called!");
  console.log("Request URL:", context.request.url);
  
  // 确保env中的绑定可以被访问 (如果Pages正确设置了它们)
  // console.log("API_SECRET_TOKEN exists:", !!context.env.API_SECRET_TOKEN);
  // console.log("CONFIG_BUCKET exists:", !!context.env.CONFIG_BUCKET);

  return new Response("Hello from simplified Cloudflare Pages Function!", {
    headers: { 'content-type': 'text/plain' },
  });
}