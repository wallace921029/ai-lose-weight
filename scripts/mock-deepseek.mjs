// 本地 mock DeepSeek 官方 API（/models + /chat/completions），用于验收与演示
// 用法：node scripts/mock-deepseek.mjs [port]  （接受任意 Bearer key）
import http from 'node:http';

const port = Number(process.argv[2] || 3990);

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    return send(200, { object: 'list', data: [{ id: 'deepseek-chat', object: 'model' }, { id: 'deepseek-reasoner', object: 'model' }] });
  }
  if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    return req.on('end', () => {
      const { messages = [], model = 'deepseek-chat' } = JSON.parse(body || '{}');
      const sys = messages[0]?.content || '';
      let content;
      if (sys.includes('饮食记录解析器')) {
        content = JSON.stringify([
          { name: '牛肉面', meal: 'lunch', qty: 1, unit: '碗', calories: 680 },
          { name: '卤蛋', meal: 'lunch', qty: 1, unit: '个', calories: 70 },
        ]);
      } else if (sys.includes('运动记录解析器')) {
        content = JSON.stringify([
          { activity: '慢跑(8km/h)', minutes: 35 },
          { activity: '跳绳', minutes: 20 },
        ]);
      } else if (sys.includes('指令路由器')) {
        // 教练指令路由：按用户内容模拟意图（记体重 / 记饮食 / 记运动 / 闲聊）
        // 日期从 system prompt 里抠（后端给的是服务器本地日期，别自己 new Date 犯时区错）
        const u = messages[1]?.content || '';
        const today = (sys.match(/今天是 (\d{4}-\d{2}-\d{2})/) || [])[1] || new Date().toISOString().slice(0, 10);
        let intent = { type: 'chat' };
        const wm = u.match(/(\d+(?:\.\d+)?)\s*(千克|公斤|kg)/i);
        if (/(记录|记一下|帮我记|刚称).*体重|体重.*(\d+(?:\.\d+)?)/.test(u) && wm) {
          intent = { type: 'weigh', weight_kg: parseFloat(wm[1]), date: today };
        } else if (/吃|喝|餐|面|饭|蛋|奶/.test(u)) {
          intent = { type: 'diet', date: today, items: [{ name: '五香牛肉面', meal: 'lunch', qty: 1, unit: '碗', calories: 550 }] };
        } else if (/跑|跳|游|练|运动|健身|走/.test(u)) {
          intent = { type: 'exercise', date: today, items: [{ activity: '慢跑(8km/h)', minutes: 30 }] };
        }
        content = JSON.stringify(intent);
      } else if (sys.includes('对话')) {
        content = `（${model} 模拟回复）先把这个问题拆开看：你今天的热量还有余额，嘴瘾是习惯不是饿。给我 20 个波比跳，做完还想吃再来聊。`;
      } else {
        content = `（${model} 模拟简报）趋势在降，热量没超支，本周契约还差一点火候。晚上十点后厨房禁止进入，明早空腹上秤。`;
      }
      send(200, {
        id: 'mock-' + Date.now(),
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
      });
    });
  }
  send(404, { error: { message: 'not found: ' + req.url } });
});

server.listen(port, () => console.log(`[mock-deepseek] http://127.0.0.1:${port} (任意 Bearer key 可用)`));
