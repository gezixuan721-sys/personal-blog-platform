import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import slugify from 'slugify';
import mongoose from 'mongoose';
import { Post } from './models/Post.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const dataFile = path.join(dataDir, 'blog.json');

const defaultStore = {
  site: {
    title: process.env.SITE_TITLE || '墨屿笔记',
    tagline: process.env.SITE_TAGLINE || '记录灵感、笔记与成长的个人博客',
  },
  posts: []
};

dotenv.config({ path: path.join(__dirname, '.env') });
const app = express();
const publicDir = path.join(rootDir, 'public');
const viewsDir = path.join(rootDir, 'views');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SITE_TITLE = process.env.SITE_TITLE || '墨屿笔记';
const SITE_TAGLINE = process.env.SITE_TAGLINE || '记录灵感、笔记与成长的个人博客';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const JWT_SECRET = process.env.JWT_SECRET || 'please-change-this-secret';
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gezixuan721_db_user:dnZDG9iYPD7mZ67L@cluster0.reyadls.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
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

const defaultSiteConfig = {
  title: SITE_TITLE,
  tagline: SITE_TAGLINE,
};

mongoose.connect(MONGO_URI).then(() => {
  console.log("Connected to MongoDB database.");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

app.use(async (req, res, next) => {
  const posts = await Post.find().lean() || [];
  
  res.locals.site = defaultSiteConfig;
  res.locals.user = getCurrentUser(req);
  res.locals.baseUrl = BASE_URL;
  res.locals.formatDate = formatDate;
  res.locals.navCategories = getCategories(posts);
  res.locals.navArchives = getArchiveGroups(posts).slice(0, 4);
  next();
});

app.get('/', async (req, res) => {
  const { category, q } = req.query;
  const storePosts = await Post.find().lean() || [];
  
  const posts = getPublishedPosts(storePosts)
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
    pageTitle: `${defaultSiteConfig.title} · 首页`,
    posts,
    featured,
    recent,
    categories,
    archives,
    activeCategory: category || '',
    query: q || '',
    stats: buildStats(storePosts),
    buildPageUrl: (pathName) => `${BASE_URL}${pathName}`,
  });
});

app.get('/posts/:slug', async (req, res, next) => {
  const post = await Post.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!post) {
    return next();
  }
  
  const storePosts = await Post.find().lean() || [];
  const related = getPublishedPosts(storePosts)
    .filter((item) => String(item._id) !== String(post._id) && (item.category === post.category || item.tags.some((tag) => post.tags.includes(tag))))
    .slice(0, 3);

  res.render('post', {
    pageTitle: `${post.title} · ${defaultSiteConfig.title}`,
    post,
    related,
    htmlContent: renderMarkdown(post.content),
  });
});

app.get('/categories', async (req, res) => {
  const storePosts = await Post.find().lean() || [];
  const categories = getCategories(getPublishedPosts(storePosts)).map((category) => ({
    name: category,
    count: getPublishedPosts(storePosts).filter((post) => post.category === category).length,
  }));

  res.render('categories', {
    pageTitle: `分类 · ${defaultSiteConfig.title}`,
    categories,
  });
});

app.get('/categories/:category', async (req, res, next) => {
  const category = req.params.category;
  const storePosts = await Post.find().lean() || [];
  const posts = getPublishedPosts(storePosts).filter((post) => post.category === category);
  if (!posts.length) {
    return next();
  }

  res.render('category', {
    pageTitle: `${category} · ${defaultSiteConfig.title}`,
    category,
    posts,
  });
});

app.get('/archives', async (req, res) => {
  const storePosts = await Post.find().lean() || [];
  const archives = getArchiveGroups(getPublishedPosts(storePosts));
  res.render('archives', {
    pageTitle: `归档 · ${defaultSiteConfig.title}`,
    archives,
  });
});

app.get('/archives/:year/:month', async (req, res, next) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const storePosts = await Post.find().lean() || [];
  const posts = getPublishedPosts(storePosts).filter((post) => {
    const date = new Date(post.publishedAt);
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
  });

  if (!posts.length) {
    return next();
  }

  res.render('archive', {
    pageTitle: `${year}-${String(month).padStart(2, '0')} 归档 · ${defaultSiteConfig.title}`,
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
    pageTitle: `登录 · ${defaultSiteConfig.title}`,
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
      pageTitle: `登录 · ${defaultSiteConfig.title}`,
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

app.get('/admin', requireAuth, async (req, res) => {
  const storePosts = await Post.find().lean() || [];
  res.render('admin', {
    pageTitle: `后台 · ${defaultSiteConfig.title}`,
    posts: sortPosts(storePosts),
    stats: buildStats(storePosts),
  });
});

app.get('/admin/posts/new', requireAuth, async (req, res) => {
  const storePosts = await Post.find().lean() || [];
  res.render('post-form', {
    pageTitle: `新建文章 · ${defaultSiteConfig.title}`,
    mode: 'create',
    post: emptyPost(),
    categories: getCategories(storePosts),
  });
});

app.post('/admin/posts', requireAuth, async (req, res) => {
  const allPosts = await Post.find().lean();
  const postData = normalizePostInput(req.body, { creating: true, allPosts });
  const post = new Post(postData);
  await post.save();
  res.redirect('/admin');
});

app.get('/admin/posts/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).lean();
    if (!post) {
      return next();
    }

    const storePosts = await Post.find().lean() || [];
    res.render('post-form', {
      pageTitle: `编辑文章 · ${defaultSiteConfig.title}`,
      mode: 'edit',
      post: { ...post, id: String(post._id) },
      categories: getCategories(storePosts),
    });
  } catch (error) {
    return next();
  }
});

app.post('/admin/posts/:id', requireAuth, async (req, res, next) => {
  try {
    const current = await Post.findById(req.params.id).lean();
    if (!current) {
      return next();
    }

    const allPosts = await Post.find().lean();
    const nextPostData = normalizePostInput(req.body, { creating: false, current, allPosts });
    await Post.findByIdAndUpdate(req.params.id, nextPostData, { new: true });

    res.redirect('/admin');
  } catch (error) {
    return next();
  }
});

app.post('/admin/posts/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const deleted = await Post.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return next();
    }
    res.redirect('/admin');
  } catch (error) {
    return next();
  }
});

app.use((req, res) => {
  res.status(404).render('not-found', {
    pageTitle: `404 · ${defaultSiteConfig.title}`,
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

function normalizePostInput(body, { creating, current, allPosts = [] } = {}) {
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
  const slug = creating ? ensureUniqueSlug(baseSlug, null, allPosts) : ensureUniqueSlug(baseSlug, current?._id, allPosts);

  return {
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

function ensureUniqueSlug(baseSlug, currentId = null, allPosts = []) {
  let candidate = baseSlug;
  let counter = 2;
  while (allPosts.some((post) => post.slug === candidate && String(post._id) !== String(currentId))) {
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
