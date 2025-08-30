const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const Database = require('../db/database');
const AuthService = require('./auth-service');
const MediaHandler = require('./media-handler');

class TimalServer {
    constructor() {
        this.port = process.env.PORT || 3000;
        this.db = new Database();
        this.auth = new AuthService(this.db);
        this.media = new MediaHandler(this.db);
        
        // Initialize database
        this.init();
    }

    async init() {
        try {
            await this.db.initialize();
            console.log('✅ Database initialized');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            process.exit(1);
        }
    }

    /**
     * Main request handler
     */
    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Enable CORS for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            // API routes
            if (pathname.startsWith('/api/')) {
                await this.handleApiRequest(req, res, pathname);
                return;
            }

            // Static file serving
            if (pathname === '/' || pathname === '/index.html') {
                await this.serveStaticFile(res, 'public/index.html', 'text/html');
                return;
            }

            // Serve other static files
            if (pathname.startsWith('/')) {
                const filePath = path.join('public', pathname);
                await this.serveStaticFile(res, filePath);
                return;
            }

            // 404 Not Found
            this.sendError(res, 404, 'Not Found');

        } catch (error) {
            console.error('Request handling error:', error);
            this.sendError(res, 500, 'Internal Server Error');
        }
    }

    /**
     * Handle API requests
     */
    async handleApiRequest(req, res, pathname) {
        const method = req.method;
        const segments = pathname.split('/').filter(Boolean); // ['api', 'endpoint', ...]

        // Parse request body for POST/PUT requests
        let body = null;
        if (method === 'POST' || method === 'PUT') {
            body = await this.parseRequestBody(req);
        }

        // Route API requests
        switch (segments[1]) { // segments[0] is 'api'
            case 'auth':
                await this.handleAuthRequest(req, res, method, segments.slice(2), body);
                break;
            case 'timeline':
                await this.handleTimelineRequest(req, res, method, segments.slice(2), body);
                break;
            case 'media':
                await this.handleMediaRequest(req, res, method, segments.slice(2), body);
                break;
            default:
                this.sendError(res, 404, 'API endpoint not found');
        }
    }

    /**
     * Handle authentication requests
     */
    async handleAuthRequest(req, res, method, segments, body) {
        switch (segments[0]) {
            case 'register':
                if (method === 'POST') {
                    const result = await this.auth.register(body.username, body.email, body.password);
                    this.sendJson(res, result);
                } else {
                    this.sendError(res, 405, 'Method not allowed');
                }
                break;
            case 'login':
                if (method === 'POST') {
                    const result = await this.auth.login(body.username, body.password);
                    if (result.success) {
                        // Set session cookie
                        res.setHeader('Set-Cookie', `session=${result.sessionId}; HttpOnly; Path=/; Max-Age=86400`);
                    }
                    this.sendJson(res, result);
                } else {
                    this.sendError(res, 405, 'Method not allowed');
                }
                break;
            case 'logout':
                if (method === 'POST') {
                    const sessionId = this.getSessionFromCookie(req);
                    await this.auth.logout(sessionId);
                    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
                    this.sendJson(res, { success: true });
                } else {
                    this.sendError(res, 405, 'Method not allowed');
                }
                break;
            case 'account':
                if (method === 'GET') {
                    const user = await this.getCurrentUser(req);
                    if (user) {
                        this.sendJson(res, { user: { id: user.id, username: user.username, email: user.email, tier: user.tier } });
                    } else {
                        this.sendError(res, 401, 'Not authenticated');
                    }
                } else {
                    this.sendError(res, 405, 'Method not allowed');
                }
                break;
            default:
                this.sendError(res, 404, 'Auth endpoint not found');
        }
    }

    /**
     * Handle timeline requests
     */
    async handleTimelineRequest(req, res, method, segments, body) {
        const user = await this.getCurrentUser(req);
        if (!user) {
            this.sendError(res, 401, 'Authentication required');
            return;
        }

        switch (method) {
            case 'GET':
                if (segments.length === 0) {
                    // Get all timeline entries for user
                    const entries = await this.db.getTimelineEntries(user.id);
                    this.sendJson(res, { entries });
                } else {
                    // Get specific entry
                    const entryId = parseInt(segments[0]);
                    const entry = await this.db.getTimelineEntry(entryId, user.id);
                    if (entry) {
                        this.sendJson(res, { entry });
                    } else {
                        this.sendError(res, 404, 'Timeline entry not found');
                    }
                }
                break;
            case 'POST':
                // Create new timeline entry
                const entryId = await this.db.createTimelineEntry({
                    user_id: user.id,
                    entry_date: body.date,
                    entry_text: body.text,
                    entry_type: body.type || 'text'
                });
                this.sendJson(res, { id: entryId, success: true });
                break;
            case 'PUT':
                // Update timeline entry
                const updateId = parseInt(segments[0]);
                await this.db.updateTimelineEntry(updateId, user.id, {
                    entry_date: body.date,
                    entry_text: body.text
                });
                this.sendJson(res, { success: true });
                break;
            case 'DELETE':
                // Delete timeline entry
                const deleteId = parseInt(segments[0]);
                await this.db.deleteTimelineEntry(deleteId, user.id);
                this.sendJson(res, { success: true });
                break;
            default:
                this.sendError(res, 405, 'Method not allowed');
        }
    }

    /**
     * Handle media requests
     */
    async handleMediaRequest(req, res, method, segments, body) {
        const user = await this.getCurrentUser(req);
        if (!user) {
            this.sendError(res, 401, 'Authentication required');
            return;
        }

        // TODO: Implement multipart form parsing for file uploads
        // For now, this is a placeholder structure
        this.sendError(res, 501, 'Media endpoints not yet implemented');
    }

    /**
     * Get current user from session
     */
    async getCurrentUser(req) {
        const sessionId = this.getSessionFromCookie(req);
        if (!sessionId) return null;
        
        return await this.auth.getUserFromSession(sessionId);
    }

    /**
     * Extract session ID from cookie
     */
    getSessionFromCookie(req) {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) return null;
        
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        
        return cookies.session || null;
    }

    /**
     * Parse request body
     */
    async parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error('Invalid JSON'));
                }
            });
            req.on('error', reject);
        });
    }

    /**
     * Serve static files
     */
    async serveStaticFile(res, filePath, contentType = null) {
        try {
            const fullPath = path.resolve(filePath);
            const data = await fs.promises.readFile(fullPath);
            
            if (!contentType) {
                const ext = path.extname(fullPath);
                contentType = this.getContentType(ext);
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.sendError(res, 404, 'File not found');
            } else {
                this.sendError(res, 500, 'Error reading file');
            }
        }
    }

    /**
     * Get content type by file extension
     */
    getContentType(ext) {
        const types = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        return types[ext] || 'application/octet-stream';
    }

    /**
     * Send JSON response
     */
    sendJson(res, data) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Send error response
     */
    sendError(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
    }

    /**
     * Start the server
     */
    start() {
        const server = http.createServer((req, res) => this.handleRequest(req, res));
        
        server.listen(this.port, () => {
            console.log(`🚀 Timal server running on http://localhost:${this.port}`);
            console.log(`📁 Serving static files from: public/`);
            console.log(`🗃️  Database: ${process.env.DATABASE_PATH || './db/timal.db'}`);
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down server...');
            await this.db.close();
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new TimalServer();
    server.start();
}

module.exports = TimalServer;
