// functions/index.js (极简运行时测试代码)
export async function onRequest(context) {
  // 测试 1: console.log 是否工作，以及是否能被日志系统捕获
  console.log("MINIMAL_RUNTIME_TEST: onRequest invoked.");
  console.log("MINIMAL_RUNTIME_TEST: Request URL:", context.request.url);

  let envInfo = "env seems okay.";
  let envKeysString = "N/A";

  // 测试 2: context.env 是否是一个有效的对象
  if (typeof context.env !== 'object' || context.env === null) {
    console.log("MINIMAL_RUNTIME_TEST_ERROR: context.env is NOT a valid object!");
    console.log("MINIMAL_RUNTIME_TEST_ERROR: typeof context.env is:", typeof context.env);
    envInfo = "Error: context.env is NOT a valid object. Type: " + typeof context.env;
    // 即使 env 有问题，我们仍然尝试返回一个响应
  } else {
    // 测试 3: 记录 context.env 中所有键的名称
    const envKeys = Object.keys(context.env);
    envKeysString = envKeys.length > 0 ? envKeys.join(', ') : "No keys found in context.env";
    console.log("MINIMAL_RUNTIME_TEST: context.env keys:", envKeysString);

    // 测试 4: 检查特定的绑定是否存在
    const apiTokenPresent = envKeys.includes('API_SECRET_TOKEN');
    const r2BucketPresent = envKeys.includes('CONFIG_BUCKET');
    console.log("MINIMAL_RUNTIME_TEST: API_SECRET_TOKEN present in env:", apiTokenPresent);
    console.log("MINIMAL_RUNTIME_TEST: CONFIG_BUCKET present in env:", r2BucketPresent);

    // 附加到响应信息中
    envInfo = `API_SECRET_TOKEN present: ${apiTokenPresent}, CONFIG_BUCKET present: ${r2BucketPresent}. All env keys: ${envKeysString}`;
  }

  // 尝试返回一个包含诊断信息的响应
  return new Response(
    `MINIMAL_RUNTIME_TEST: Reached end of onRequest. Request URL: ${context.request.url}. Env Status: ${envInfo}`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
}