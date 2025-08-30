# timal
Your story, across time.

## Architecture

- **Frontend**: Single-page web app (HTML/CSS/JS)
- **Backend**: Node.js with built-in HTTP module (no Express)
- **Database**: SQLite for user data and timeline entries
- **Storage**: Cloudflare R2 for media files (images/videos)
- **Authentication**: Session-based with built-in crypto

## Features

- 📝 Text-based timeline entries
- 🖼️ Image uploads with automatic optimization  
- 🎥 Video uploads with thumbnail generation
- 👥 User accounts and authentication
- 💰 Tiered pricing model (Free/Personal/Pro)
- 📱 Responsive design

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the environment template and configure:

```bash
cp env.example .env
```

Then edit `.env` with your settings:

```env
# Cloudflare R2 Configuration
CLOUDFLARE_R2_ACCESS_KEY_ID=your_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_secret_access_key
CLOUDFLARE_R2_BUCKET_NAME=timal-media
CLOUDFLARE_R2_ACCOUNT_ID=your_account_id

# Application Configuration  
NODE_ENV=development
PORT=3000
SESSION_SECRET=your_secure_random_string
DATABASE_PATH=./data/timal.db

# Feature Limits
FREE_TIER_STORAGE_MB=0
PERSONAL_TIER_STORAGE_MB=600
PRO_TIER_STORAGE_MB=-1
```

### 3. Cloudflare R2 Setup

1. **Create R2 Bucket:**
   - Log into Cloudflare Dashboard
   - Go to R2 Object Storage
   - Create bucket named `timal-media`

2. **Generate API Token:**
   - Go to R2 → Manage R2 API Tokens
   - Create token with "Object Read & Write" permissions
   - Copy Access Key ID and Secret Access Key to `.env`

3. **Get Account ID:**
   - Found in Cloudflare Dashboard sidebar
   - Add to `.env` as `CLOUDFLARE_R2_ACCOUNT_ID`

### 4. Development

```bash
# Setup database (first time only)
npm run setup-db

# Compile SASS to CSS
npm run build-css

# Start Node.js server
npm run dev

# Or start both in watch mode (recommended for development)
npm run dev:watch
```

### 5. Production

```bash
# Build assets
npm run build

# Start production server
npm start
```

## API Endpoints

### Authentication
- `POST /api/register` - Create new user account
- `POST /api/login` - User login
- `POST /api/logout` - User logout  
- `GET /api/account` - Get current user info

### Timeline
- `GET /api/timeline` - Get user's timeline entries
- `POST /api/timeline` - Create new timeline entry
- `PUT /api/timeline/:id` - Update timeline entry
- `DELETE /api/timeline/:id` - Delete timeline entry

### Media
- `POST /api/media/upload` - Upload image/video file
- `GET /api/media/:id` - Get media file URL
- `DELETE /api/media/:id` - Delete media file

## Database Schema

```sql
-- Users and authentication
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier TEXT DEFAULT 'free', -- 'free', 'personal', 'pro'
    storage_used_mb INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Timeline entries
CREATE TABLE timeline_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date DATE NOT NULL,
    entry_text TEXT,
    entry_type TEXT DEFAULT 'text', -- 'text', 'image', 'video', 'mixed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Media attachments
CREATE TABLE media_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    media_type TEXT NOT NULL, -- 'image', 'video'
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_mb REAL,
    r2_key TEXT NOT NULL, -- Cloudflare R2 object key
    thumbnail_r2_key TEXT, -- For video thumbnails
    width INTEGER,
    height INTEGER,
    duration INTEGER, -- For videos (seconds)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES timeline_entries (id) ON DELETE CASCADE
);
```

## Pricing Tiers

| Feature | Free | Personal (TBD) | Pro (TBD) |
|---------|------|----------------|-----------|
| Text Timeline Entries | TBD | TBD | TBD |
| Media Uploads | TBD | TBD | TBD |
| Media Storage | TBD | TBD | TBD |
| Export Options | TBD | TBD | TBD |
| Collaboration | TBD | TBD | TBD |
| Support | TBD | TBD | TBD |

## Tech Stack

- **Runtime**: Node.js 18+
- **Database**: SQLite3
- **Storage**: Cloudflare R2 (S3-compatible)
- **Frontend**: Vanilla JavaScript + SASS
- **Authentication**: Session-based with httpOnly cookies
- **File Processing**: Sharp for images, FFmpeg for videos

