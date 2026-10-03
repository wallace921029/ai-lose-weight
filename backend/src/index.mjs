import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { apiRouter, SECRET, ensureFounder } from './routes.mjs';
import { ROOT_DIR } from './db.mjs';

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '300kb' }));
app.use('/api', apiRouter);

// 生产模式：托管前端构建产物 + SPA 回退
const dist = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '7d', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开小差了' });
});

const founder = ensureFounder();
if (founder.configured) {
  console.log(`[破釜] 创始人账号就绪：${founder.username}${founder.created ? '（新建）' : ''}，AI 模型配置仅限该账号`);
} else {
  console.warn('[破釜] 未配置 FOUNDER_USERNAME/FOUNDER_PASSWORD，无人能配置 AI 模型');
}
if ((process.env.INVITE_CODE || '').trim()) {
  console.log('[破釜] 注册邀请码已配置（INVITE_CODE）');
} else {
  console.warn('[破釜] 未配置 INVITE_CODE：新用户注册已关闭');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[破釜] API listening on http://0.0.0.0:${PORT}`);
  console.log(`[破釜] DATA_DIR=${process.env.DATA_DIR || path.join(ROOT_DIR, 'data')}`);
  if (SECRET === 'pofu-dev-secret-change-me') {
    console.warn('[破釜] 警告：正在使用默认 JWT_SECRET，生产环境请设置环境变量 JWT_SECRET');
  }
});
