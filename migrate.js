import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure it loads exactly from the personal-blog-platform directory
dotenv.config({ path: path.join(__dirname, '.env'), encoding: 'utf8' });
import { Post } from './models/Post.js';
import fs from 'node:fs/promises';

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gezixuan721_db_user:dnZDG9iYPD7mZ67L@cluster0.reyadls.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

if (!MONGO_URI) {
  console.error("请在 .env 文件中设置 MONGO_URI");
  process.exit(1);
}

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.");

    const dataFile = path.join(process.cwd(), 'data', 'blog.json');
    let posts = [];
    try {
      const raw = await fs.readFile(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      posts = parsed.posts || [];
    } catch (e) {
      console.log('No local blog.json found or failed to read, skipping migration.');
    }

    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts in local file. Starting import...`);
      for (const p of posts) {
        const exists = await Post.findOne({ slug: p.slug });
        if (!exists) {
          const newPost = new Post({
            title: p.title,
            slug: p.slug,
            summary: p.summary,
            category: p.category,
            tags: p.tags,
            featured: p.featured,
            status: p.status,
            publishedAt: p.publishedAt,
            content: p.content,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          });
          await newPost.save();
          console.log(`Imported: ${p.title}`);
        } else {
          console.log(`Skipped (already exists): ${p.title}`);
        }
      }
      console.log("Migration complete!");
    } else {
      console.log("No posts to migrate.");
    }
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();