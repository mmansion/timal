const crypto = require('crypto');

class AuthService {
    constructor(database) {
        this.db = database;
    }

    /**
     * Register a new user
     * @param {string} username - Username
     * @param {string} email - Email address
     * @param {string} password - Plain text password
     * @returns {Promise<object>} Registration result
     */
    async register(username, email, password) {
        try {
            // Validate input
            if (!username || !email || !password) {
                return { success: false, error: 'All fields are required' };
            }

            if (password.length < 6) {
                return { success: false, error: 'Password must be at least 6 characters' };
            }

            if (!this.isValidEmail(email)) {
                return { success: false, error: 'Invalid email format' };
            }

            // Check if user already exists
            const existingUser = await this.db.getUserByUsername(username);
            if (existingUser) {
                return { success: false, error: 'Username already exists' };
            }

            const existingEmail = await this.db.getUserByEmail(email);
            if (existingEmail) {
                return { success: false, error: 'Email already registered' };
            }

            // Hash password
            const passwordHash = this.hashPassword(password);

            // Create user
            const userId = await this.db.createUser({
                username,
                email,
                password_hash: passwordHash,
                tier: 'free'
            });

            return { 
                success: true, 
                user: { 
                    id: userId, 
                    username, 
                    email,
                    tier: 'free' 
                } 
            };

        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Registration failed' };
        }
    }

    /**
     * Login user
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {Promise<object>} Login result with session
     */
    async login(username, password) {
        try {
            if (!username || !password) {
                return { success: false, error: 'Username and password required' };
            }

            // Get user
            const user = await this.db.getUserByUsername(username);
            if (!user) {
                return { success: false, error: 'Invalid username or password' };
            }

            // Verify password
            if (!this.verifyPassword(password, user.password_hash)) {
                return { success: false, error: 'Invalid username or password' };
            }

            // Create session
            const sessionId = this.generateSessionId();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await this.db.createSession({
                session_id: sessionId,
                user_id: user.id,
                expires_at: expiresAt.toISOString()
            });

            return {
                success: true,
                sessionId,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    tier: user.tier
                }
            };

        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Login failed' };
        }
    }

    /**
     * Logout user by destroying session
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    async logout(sessionId) {
        try {
            if (!sessionId) return false;
            await this.db.deleteSession(sessionId);
            return true;
        } catch (error) {
            console.error('Logout error:', error);
            return false;
        }
    }

    /**
     * Get user from session ID
     * @param {string} sessionId - Session ID
     * @returns {Promise<object|null>} User object or null
     */
    async getUserFromSession(sessionId) {
        try {
            if (!sessionId) return null;

            const session = await this.db.getSession(sessionId);
            if (!session) return null;

            // Check if session is expired
            if (new Date(session.expires_at) < new Date()) {
                await this.db.deleteSession(sessionId);
                return null;
            }

            // Get user
            const user = await this.db.getUserById(session.user_id);
            return user;

        } catch (error) {
            console.error('Session validation error:', error);
            return null;
        }
    }

    /**
     * Hash password using crypto
     * @param {string} password - Plain text password
     * @returns {string} Hashed password
     */
    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }

    /**
     * Verify password against hash
     * @param {string} password - Plain text password
     * @param {string} storedHash - Stored hash from database
     * @returns {boolean} Password is valid
     */
    verifyPassword(password, storedHash) {
        try {
            const [salt, hash] = storedHash.split(':');
            const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
            return hash === verifyHash;
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }

    /**
     * Generate secure session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Basic email validation
     * @param {string} email - Email to validate
     * @returns {boolean} Email is valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Clean up expired sessions (call periodically)
     */
    async cleanupExpiredSessions() {
        try {
            await this.db.deleteExpiredSessions();
        } catch (error) {
            console.error('Session cleanup error:', error);
        }
    }
}

module.exports = AuthService;
