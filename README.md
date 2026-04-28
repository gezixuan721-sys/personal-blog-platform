# 墨屿笔记平台

一个可部署的个人博客系统，包含：

- 多页面首页、文章页、分类页、归档页
- 登录后台
- 文章新建、编辑、删除
- 置顶、分类、标签、发布时间
- 云端保存到服务器上的 JSON 数据文件

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

复制 `.env.example` 为 `.env`，然后修改账号密码和密钥。

3. 启动

```bash
npm run dev
```

打开 `http://localhost:3000`。

## 部署建议

这个项目是标准 Node.js 应用，适合部署到：

- Render
- Fly.io
- Railway
- 自己的 VPS

部署时需要配置这些环境变量：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `SITE_TITLE`
- `SITE_TAGLINE`
- `BASE_URL`

## 说明

- 文章正文使用 Markdown 书写。
- 登录后可以在后台创建和编辑文章。
- 数据会写入 `data/blog.json`，适合单站个人博客。
- 如果你要我继续，我可以再把它改成 Prisma + PostgreSQL + 真正的多人账号体系。
