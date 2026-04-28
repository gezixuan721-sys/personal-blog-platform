import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  summary: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    default: '未分类',
  },
  tags: [{
    type: String
  }],
  featured: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['published', 'draft'],
    default: 'draft',
  },
  publishedAt: {
    type: Date,
  },
  content: {
    type: String,
    required: true,
  },
}, {
  timestamps: true // 自动管理 createdAt 和 updatedAt
});

export const Post = mongoose.model('Post', postSchema);