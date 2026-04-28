import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import slugify from 'slugify';

const app = express();
const rootDir = process.cwd();
const dataDir = path.join(rootDir, 'data');
const dataFile = path.join(dataDir, 'blog.json');
const publicDir = path.join(rootDir, 'public');
const viewsDir = path.join(rootDir, 'views');

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SITE_TITLE = process.env.SITE_TITLE || '墨屿笔记';
const SITE_TAGLINE = process.env.SITE_TAGLINE || '记录灵感、笔记与成长的个人博客';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';
const ADMIN_USERNAME_LOWER = ADMIN_USERNAME.toLowerCase();

app.set('view engine', 'ejs');
app.set('views', viewsDir);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(publicDir));

marked.setOptions({
  breaks: true,
  gfm: true,
});

const defaultStore = {
  site: {
    title: SITE_TITLE,
    tagline: SITE_TAGLINE,
  },
  posts: [
    {
      id: crypto.randomUUID(),
      title: '如何整理一篇高质量笔记',
      slug: 'how-to-write-better-notes',
      summary: '把知识点拆成问题、答案、例子和关联链接，记录效率会高很多。',
      category: '学习方法',
      tags: ['笔记', '学习', '方法论'],
      featured: true,
      status: 'published',
      publishedAt: '2026-04-15T09:00:00.000Z',
      createdAt: '2026-04-15T09:00:00.000Z',
      updatedAt: '2026-04-18T08:00:00.000Z',
      content: '# 如何整理一篇高质量笔记\n\n- 先写问题\n- 再写结论\n- 补一个可运行的例子\n- 最后加上自己的理解\n\n> 好的笔记不是抄下来，而是重组过一次。\n\n你可以把每篇笔记都当成一个小项目来维护。',
    },
    {
      id: crypto.randomUUID(),
      title: '前端面试题归档模板',
      slug: 'frontend-interview-archive-template',
      summary: '把面试题统一整理成“概念、原理、代码、坑点”四段式。',
      category: '面试',
      tags: ['面试', '前端', '模板'],
      featured: false,
      status: 'published',
      publishedAt: '2026-04-10T11:30:00.000Z',
      createdAt: '2026-04-10T11:30:00.000Z',
      updatedAt: '2026-04-21T15:10:00.000Z',
      content: '## 四段式结构\n\n1. 问题是什么\n2. 为什么会这样\n3. 怎么写代码\n4. 有哪些常见坑\n\n这个结构适合整理成自己的长期知识库。',
    },
    {
      id: crypto.randomUUID(),
      title: '2026 春季项目复盘',
      slug: '2026-spring-project-retrospective',
      summary: '把本季度做过的项目、踩过的坑和后续计划整理成归档。',
      category: '复盘',
      tags: ['复盘', '项目', '归档'],
      featured: false,
      status: 'published',
      publishedAt: '2026-04-01T08:30:00.000Z',
      createdAt: '2026-04-01T08:30:00.000Z',
      updatedAt: '2026-04-25T19:40:00.000Z',
      content: '### 本季度关键词\n\n- 交付\n- 调试\n- 文档\n- 复盘\n\n> 复盘不是总结给别人看，而是给下次的自己看。',
    },
  ],
};

const store = await loadStore();

app.use((req, res, next) => {
  res.locals.site = store.site;
  res.locals.user = getCurrentUser(req);
  res.locals.baseUrl = BASE_URL;
  res.locals.formatDate = formatDate;
  res.locals.navCategories = getCategories(store.posts);
  res.locals.navArchives = getArchiveGroups(store.posts).slice(0, 4);
  next();
});

app.get('/', (req, res) => {
  const { category, q } = req.query;
  const posts = getPublishedPosts(store.posts)
    .filter((post) => !category || post.category === category)
    .filter((post) => {
      if (!q) return true;
      const query = String(q).toLowerCase();
      const haystack = `${post.title} ${post.summary} ${post.content} ${post.category} ${post.tags.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });

  const featured = posts.filter((post) => post.featured).slice(0, 2);
  const recent = posts.slice(0, 6);
  const categories = getCategories(posts);
  const archives = getArchiveGroups(posts);

  res.render('home', {
    pageTitle: `${store.site.title} · 首页`,
    posts,
    featured,
    recent,
    categories,
    archives,
    activeCategory: category || '',
    query: q || '',
    stats: buildStats(store.posts),
    buildPageUrl: (pathName) => `${BASE_URL}${pathName}`,
  });
});

app.get('/posts/:slug', (req, res, next) => {
  const post = store.posts.find((item) => item.slug === req.params.slug && item.status === 'published');
  if (!post) {
    return next();
  }

  const related = getPublishedPosts(store.posts)
    .filter((item) => item.id !== post.id && (item.category === post.category || item.tags.some((tag) => post.tags.includes(tag))))
    .slice(0, 3);

  res.render('post', {
    pageTitle: `${post.title} · ${store.site.title}`,
    post,
    related,
    htmlContent: renderMarkdown(post.content),
  });
});

app.get('/categories', (req, res) => {
  const categories = getCategories(getPublishedPosts(store.posts)).map((category) => ({
    name: category,
    count: getPublishedPosts(store.posts).filter((post) => post.category === category).length,
  }));

  res.render('categories', {
    pageTitle: `分类 · ${store.site.title}`,
    categories,
  });
});

app.get('/categories/:category', (req, res, next) => {
  const category = req.params.category;
  const posts = getPublishedPosts(store.posts).filter((post) => post.category === category);
  if (!posts.length) {
    return next();
  }

  res.render('category', {
    pageTitle: `${category} · ${store.site.title}`,
    category,
    posts,
  });
});

app.get('/archives', (req, res) => {
  const archives = getArchiveGroups(getPublishedPosts(store.posts));
  res.render('archives', {
    pageTitle: `归档 · ${store.site.title}`,
    archives,
  });
});

app.get('/archives/:year/:month', (req, res, next) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const posts = getPublishedPosts(store.posts).filter((post) => {
    const date = new Date(post.publishedAt);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });

  if (!posts.length) {
    return next();
  }

  res.render('archive', {
    pageTitle: `${year}-${String(month).padStart(2, '0')} 归档 · ${store.site.title}`,
    year,
    month,
    posts,
  });
});

app.get('/login', (req, res) => {
  if (res.locals.user) {
    return res.redirect('/admin');
  }

  res.render('login', {
    pageTitle: `登录 · ${store.site.title}`,
    error: '',
  });
});

app.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const isUsernameValid = username === ADMIN_USERNAME_LOWER;
  const isPasswordValid = password === ADMIN_PASSWORD;

  if (!isUsernameValid || !isPasswordValid) {
    return res.status(401).render('login', {
      pageTitle: `登录 · ${store.site.title}`,
      error: '账号或密码不正确',
    });
  }

  const token = jwt.sign({ username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('moyu_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.redirect('/admin');
});

app.post('/logout', (req, res) => {
  res.clearCookie('moyu_auth');
  res.redirect('/');
});

app.get('/admin', requireAuth, (req, res) => {
  res.render('admin', {
    pageTitle: `后台 · ${store.site.title}`,
    posts: sortPosts(store.posts),
    stats: buildStats(store.posts),
  });
});

app.get('/admin/posts/new', requireAuth, (req, res) => {
  res.render('post-form', {
    pageTitle: `新建文章 · ${store.site.title}`,
    mode: 'create',
    post: emptyPost(),
    categories: getCategories(store.posts),
  });
});

app.post('/admin/posts', requireAuth, async (req, res) => {
  const post = normalizePostInput(req.body, { creating: true });
  store.posts.unshift(post);
  await saveStore(store);
  res.redirect('/admin');
});

app.get('/admin/posts/:id/edit', requireAuth, (req, res, next) => {
  const post = store.posts.find((item) => item.id === req.params.id);
  if (!post) {
    return next();
  }

  res.render('post-form', {
    pageTitle: `编辑文章 · ${store.site.title}`,
    mode: 'edit',
    post,
    categories: getCategories(store.posts),
  });
});

app.post('/admin/posts/:id', requireAuth, async (req, res, next) => {
  const index = store.posts.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return next();
  }

  const current = store.posts[index];
  const nextPost = normalizePostInput(req.body, { creating: false, current });
  store.posts[index] = {
    ...current,
    ...nextPost,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await saveStore(store);
  res.redirect('/admin');
});

app.post('/admin/posts/:id/delete', requireAuth, async (req, res, next) => {
  const index = store.posts.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return next();
  }

  store.posts.splice(index, 1);
  await saveStore(store);
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).render('not-found', {
    pageTitle: `404 · ${store.site.title}`,
  });
});

app.listen(PORT, () => {
  console.log(`Blog running at ${BASE_URL}`);
});

function requireAuth(req, res, next) {
  if (!getCurrentUser(req)) {
    return res.redirect('/login');
  }

  next();
}

function getCurrentUser(req) {
  const token = req.cookies?.moyu_auth;
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function emptyPost() {
  return {
    id: '',
    title: '',
    slug: '',
    summary: '',
    category: '',
    tags: '',
    featured: false,
    status: 'draft',
    publishedAt: '',
    content: '',
  };
}

function normalizePostInput(body, { creating, current } = {}) {
  const title = String(body.title || '').trim();
  const rawSlug = String(body.slug || '').trim();
  const summary = String(body.summary || '').trim();
  const category = String(body.category || '').trim() || '未分类';
  const tags = String(body.tags || '')
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  const content = String(body.content || '').trim();
  const status = body.status === 'published' ? 'published' : 'draft';
  const featured = body.featured === 'on';
  const publishedAtInput = String(body.publishedAt || '').trim();
  const publishedAt = status === 'published'
    ? (publishedAtInput ? new Date(publishedAtInput).toISOString() : current?.publishedAt || new Date().toISOString())
    : '';
  const baseSlug = rawSlug || slugify(title, { lower: true, strict: true, locale: 'zh' }) || crypto.randomUUID();
  const slug = creating ? ensureUniqueSlug(baseSlug) : ensureUniqueSlug(baseSlug, current?.id);

  return {
    id: current?.id || crypto.randomUUID(),
    title,
    slug,
    summary,
    category,
    tags,
    featured,
    status,
    publishedAt,
    content,
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function ensureUniqueSlug(baseSlug, currentId = null) {
  let candidate = baseSlug;
  let counter = 2;
  while (store.posts.some((post) => post.slug === candidate && post.id !== currentId)) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function renderMarkdown(markdown) {
  const html = marked.parse(markdown || '');
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'span',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'pre',
      'code',
    ]),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      code: ['class'],
      '*': ['class'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noreferrer noopener', target: '_blank' }),
    },
  });
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => new Date(right.publishedAt || right.updatedAt).getTime() - new Date(left.publishedAt || left.updatedAt).getTime());
}

function getPublishedPosts(posts) {
  return sortPosts(posts.filter((post) => post.status === 'published'));
}

function getCategories(posts) {
  return [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function getArchiveGroups(posts) {
  const map = new Map();
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const date = new Date(post.publishedAt);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const current = map.get(key) || { year, month, count: 0 };
    current.count += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((left, right) => `${right.year}${String(right.month).padStart(2, '0')}`.localeCompare(`${left.year}${String(left.month).padStart(2, '0')}`));
}

function buildStats(posts) {
  const published = posts.filter((post) => post.status === 'published').length;
  const drafts = posts.length - published;
  const featured = posts.filter((post) => post.featured).length;
  const categories = getCategories(posts).length;
  return { total: posts.length, published, drafts, featured, categories };
}

function formatDate(value) {
  if (!value) return '未发布';

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function loadStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      site: {
        title: parsed.site?.title || SITE_TITLE,
        tagline: parsed.site?.tagline || SITE_TAGLINE,
      },
      posts: Array.isArray(parsed.posts) && parsed.posts.length ? parsed.posts : defaultStore.posts,
    };
  } catch {
    await saveStore(defaultStore);
    return structuredClone(defaultStore);
  }
}

async function saveStore(nextStore) {
  const payload = JSON.stringify(nextStore, null, 2);
  await fs.writeFile(dataFile, payload, 'utf8');
}
