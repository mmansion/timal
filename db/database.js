const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'timal.db');
        this.db = null;
    }

    /**
     * Initialize database connection and create tables
     */
    async initialize() {
        try {
            // Ensure db directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Create database connection
            this.db = new sqlite3.Database(this.dbPath);
            
            // Enable foreign keys
            await this.run('PRAGMA foreign_keys = ON');
            
            // Create tables
            await this.createTables();
            
            console.log(`✅ Database connected: ${this.dbPath}`);
        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                tier TEXT DEFAULT 'free' CHECK(tier IN ('free', 'personal', 'pro')),
                storage_used_mb REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Sessions table
            `CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,

            // Timeline entries table
            `CREATE TABLE IF NOT EXISTS timeline_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                entry_date DATE NOT NULL,
                entry_text TEXT,
                entry_type TEXT DEFAULT 'text' CHECK(entry_type IN ('text', 'image', 'video', 'mixed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )`,

            // Media attachments table
            `CREATE TABLE IF NOT EXISTS media_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id INTEGER NOT NULL,
                media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_size_mb REAL,
                r2_key TEXT NOT NULL,
                thumbnail_r2_key TEXT,
                width INTEGER,
                height INTEGER,
                duration INTEGER,
                upload_status TEXT DEFAULT 'complete' CHECK(upload_status IN ('pending', 'processing', 'complete', 'failed')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entry_id) REFERENCES timeline_entries (id) ON DELETE CASCADE
            )`
        ];

        for (const table of tables) {
            await this.run(table);
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_timeline_entries_user_id ON timeline_entries(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_timeline_entries_date ON timeline_entries(entry_date)',
            'CREATE INDEX IF NOT EXISTS idx_media_attachments_entry_id ON media_attachments(entry_id)'
        ];

        for (const index of indexes) {
            await this.run(index);
        }
    }

    /**
     * Run a SQL query with parameters
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Get a single row
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get multiple rows
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // USER OPERATIONS

    /**
     * Create a new user
     */
    async createUser(userData) {
        const { username, email, password_hash, tier = 'free' } = userData;
        const result = await this.run(
            'INSERT INTO users (username, email, password_hash, tier) VALUES (?, ?, ?, ?)',
            [username, email, password_hash, tier]
        );
        return result.id;
    }

    /**
     * Get user by ID
     */
    async getUserById(userId) {
        return await this.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    /**
     * Get user by username
     */
    async getUserByUsername(username) {
        return await this.get('SELECT * FROM users WHERE username = ?', [username]);
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email) {
        return await this.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    /**
     * Update user storage usage
     */
    async updateUserStorageUsage(userId, storageUsedMb) {
        await this.run('UPDATE users SET storage_used_mb = ? WHERE id = ?', [storageUsedMb, userId]);
    }

    // SESSION OPERATIONS

    /**
     * Create a new session
     */
    async createSession(sessionData) {
        const { session_id, user_id, expires_at } = sessionData;
        await this.run(
            'INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)',
            [session_id, user_id, expires_at]
        );
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        return await this.get('SELECT * FROM sessions WHERE session_id = ?', [sessionId]);
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        await this.run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    }

    /**
     * Delete expired sessions
     */
    async deleteExpiredSessions() {
        await this.run('DELETE FROM sessions WHERE expires_at < datetime("now")');
    }

    // TIMELINE OPERATIONS

    /**
     * Create timeline entry
     */
    async createTimelineEntry(entryData) {
        const { user_id, entry_date, entry_text, entry_type = 'text' } = entryData;
        const result = await this.run(
            'INSERT INTO timeline_entries (user_id, entry_date, entry_text, entry_type) VALUES (?, ?, ?, ?)',
            [user_id, entry_date, entry_text, entry_type]
        );
        return result.id;
    }

    /**
     * Get all timeline entries for a user
     */
    async getTimelineEntries(userId) {
        const entries = await this.all(`
            SELECT te.*, 
                   GROUP_CONCAT(ma.id) as media_ids,
                   GROUP_CONCAT(ma.media_type) as media_types,
                   GROUP_CONCAT(ma.r2_key) as media_keys
            FROM timeline_entries te
            LEFT JOIN media_attachments ma ON te.id = ma.entry_id
            WHERE te.user_id = ?
            GROUP BY te.id
            ORDER BY te.entry_date DESC, te.created_at DESC
        `, [userId]);

        // Process media attachments
        return entries.map(entry => ({
            ...entry,
            media: entry.media_ids ? entry.media_ids.split(',').map((id, index) => ({
                id: parseInt(id),
                type: entry.media_types.split(',')[index],
                key: entry.media_keys.split(',')[index]
            })) : []
        }));
    }

    /**
     * Get single timeline entry
     */
    async getTimelineEntry(entryId, userId) {
        const entry = await this.get(`
            SELECT te.* FROM timeline_entries te 
            WHERE te.id = ? AND te.user_id = ?
        `, [entryId, userId]);

        if (!entry) return null;

        // Get media attachments
        const media = await this.all(
            'SELECT * FROM media_attachments WHERE entry_id = ?',
            [entryId]
        );

        return { ...entry, media };
    }

    /**
     * Update timeline entry
     */
    async updateTimelineEntry(entryId, userId, updates) {
        const { entry_date, entry_text } = updates;
        await this.run(`
            UPDATE timeline_entries 
            SET entry_date = ?, entry_text = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `, [entry_date, entry_text, entryId, userId]);
    }

    /**
     * Delete timeline entry
     */
    async deleteTimelineEntry(entryId, userId) {
        await this.run('DELETE FROM timeline_entries WHERE id = ? AND user_id = ?', [entryId, userId]);
    }

    // MEDIA OPERATIONS

    /**
     * Create media attachment
     */
    async createMediaAttachment(mediaData) {
        const {
            entry_id, media_type, filename, original_filename, file_size_mb,
            r2_key, thumbnail_r2_key, width, height, duration
        } = mediaData;

        const result = await this.run(`
            INSERT INTO media_attachments 
            (entry_id, media_type, filename, original_filename, file_size_mb, r2_key, thumbnail_r2_key, width, height, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [entry_id, media_type, filename, original_filename, file_size_mb, r2_key, thumbnail_r2_key, width, height, duration]);

        return result.id;
    }

    /**
     * Get media attachment with entry info
     */
    async getMediaAttachment(mediaId) {
        return await this.get(`
            SELECT ma.*, te.user_id as entry_user_id
            FROM media_attachments ma
            JOIN timeline_entries te ON ma.entry_id = te.id
            WHERE ma.id = ?
        `, [mediaId]);
    }

    /**
     * Delete media attachment
     */
    async deleteMediaAttachment(mediaId) {
        await this.run('DELETE FROM media_attachments WHERE id = ?', [mediaId]);
    }

    /**
     * Get user storage statistics
     */
    async getUserStorageStats(userId) {
        const stats = await this.get(`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(CASE WHEN entry_type != 'text' THEN 1 END) as media_entries,
                COALESCE(SUM(ma.file_size_mb), 0) as storage_used_mb
            FROM timeline_entries te
            LEFT JOIN media_attachments ma ON te.id = ma.entry_id
            WHERE te.user_id = ?
        `, [userId]);

        return stats;
    }

    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) console.error('Database close error:', err);
                    else console.log('✅ Database connection closed');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Database;
