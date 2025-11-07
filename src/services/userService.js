"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
var bcryptjs_1 = require("bcryptjs");
var crypto_1 = require("crypto");
var database_1 = require("@/config/database");
var redis_1 = require("@/config/redis");
var logger_1 = require("@/utils/logger");
var errorHandler_1 = require("@/middleware/errorHandler");
var auth_1 = require("@/types/auth");
var UserService = /** @class */ (function () {
    function UserService() {
        this.db = (0, database_1.getDatabase)();
        this.redis = (0, redis_1.getRedisClient)();
        // Current consent version
        this.CURRENT_CONSENT_VERSION = '1.0';
        // KMS encryption key (in production, this would be from AWS KMS)
        this.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-for-dev';
    }
    UserService.prototype.createUser = function (userData) {
        return __awaiter(this, void 0, void 0, function () {
            var email, password, role, department, _a, consentFlags, existingUser, passwordHash, defaultConsentFlags, finalConsentFlags, piiData, encryptedPii, user;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        email = userData.email, password = userData.password, role = userData.role, department = userData.department, _a = userData.consentFlags, consentFlags = _a === void 0 ? {} : _a;
                        return [4 /*yield*/, this.db('users').where({ email: email }).first()];
                    case 1:
                        existingUser = _b.sent();
                        if (existingUser) {
                            throw new errorHandler_1.AppError('User already exists', 409, 'USER_EXISTS');
                        }
                        return [4 /*yield*/, bcryptjs_1.default.hash(password, 12)];
                    case 2:
                        passwordHash = _b.sent();
                        defaultConsentFlags = {
                            locationTracking: false,
                            dataProcessing: false,
                            marketingCommunications: false,
                            consentVersion: this.CURRENT_CONSENT_VERSION,
                            consentDate: new Date()
                        };
                        finalConsentFlags = __assign(__assign(__assign({}, defaultConsentFlags), consentFlags), { consentVersion: this.CURRENT_CONSENT_VERSION, consentDate: new Date() });
                        piiData = { email: email };
                        encryptedPii = this.encryptPII(piiData);
                        return [4 /*yield*/, this.db('users').insert({
                                email: email,
                                role: role,
                                department: department,
                                password_hash: passwordHash,
                                status: 'pending', // Requires email verification
                                consent_flags: finalConsentFlags,
                                encrypted_pii: encryptedPii
                            }).returning('*')];
                    case 3:
                        user = (_b.sent())[0];
                        // Generate email verification token
                        return [4 /*yield*/, this.generateEmailVerificationToken(user.id, email)];
                    case 4:
                        // Generate email verification token
                        _b.sent();
                        logger_1.logger.info('User created', { userId: user.id, email: email, role: role, department: department });
                        return [2 /*return*/, this.mapUserFromDb(user)];
                }
            });
        });
    };
    UserService.prototype.getUserById = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var cachedUser, user, mappedUser;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.redis.get(redis_1.RedisKeys.userCache(userId))];
                    case 1:
                        cachedUser = _a.sent();
                        if (cachedUser) {
                            return [2 /*return*/, JSON.parse(cachedUser)];
                        }
                        return [4 /*yield*/, this.db('users').where({ id: userId }).first()];
                    case 2:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, null];
                        }
                        mappedUser = this.mapUserFromDb(user);
                        // Cache user for 1 hour
                        return [4 /*yield*/, this.redis.setEx(redis_1.RedisKeys.userCache(userId), 3600, JSON.stringify(mappedUser))];
                    case 3:
                        // Cache user for 1 hour
                        _a.sent();
                        return [2 /*return*/, mappedUser];
                }
            });
        });
    };
    UserService.prototype.getUserByEmail = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users').where({ email: email }).first()];
                    case 1:
                        user = _a.sent();
                        return [2 /*return*/, user ? this.mapUserFromDb(user) : null];
                }
            });
        });
    };
    UserService.prototype.updateUser = function (userId, updateData) {
        return __awaiter(this, void 0, void 0, function () {
            var existingUser, emailExists, updatedConsentFlags, encryptedPii, piiData, updatedUser;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users').where({ id: userId }).first()];
                    case 1:
                        existingUser = _a.sent();
                        if (!existingUser) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        if (!(updateData.email && updateData.email !== existingUser.email)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.db('users')
                                .where({ email: updateData.email })
                                .whereNot({ id: userId })
                                .first()];
                    case 2:
                        emailExists = _a.sent();
                        if (emailExists) {
                            throw new errorHandler_1.AppError('Email already in use', 409, 'EMAIL_EXISTS');
                        }
                        _a.label = 3;
                    case 3:
                        updatedConsentFlags = existingUser.consent_flags;
                        if (updateData.consentFlags) {
                            updatedConsentFlags = __assign(__assign(__assign({}, existingUser.consent_flags), updateData.consentFlags), { consentVersion: this.CURRENT_CONSENT_VERSION, consentDate: new Date() });
                        }
                        encryptedPii = existingUser.encrypted_pii;
                        if (updateData.email) {
                            piiData = { email: updateData.email };
                            encryptedPii = this.encryptPII(piiData);
                        }
                        return [4 /*yield*/, this.db('users')
                                .where({ id: userId })
                                .update({
                                email: updateData.email || existingUser.email,
                                department: updateData.department || existingUser.department,
                                consent_flags: updatedConsentFlags,
                                encrypted_pii: encryptedPii,
                                updated_at: new Date()
                            })
                                .returning('*')];
                    case 4:
                        updatedUser = (_a.sent())[0];
                        // Clear cache
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.userCache(userId))];
                    case 5:
                        // Clear cache
                        _a.sent();
                        logger_1.logger.info('User updated', { userId: userId, updatedFields: Object.keys(updateData) });
                        return [2 /*return*/, this.mapUserFromDb(updatedUser)];
                }
            });
        });
    };
    UserService.prototype.updateConsent = function (userId, consentData) {
        return __awaiter(this, void 0, void 0, function () {
            var user, currentConsent, updatedConsent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users').where({ id: userId }).first()];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        currentConsent = user.consent_flags;
                        updatedConsent = __assign(__assign(__assign({}, currentConsent), consentData), { consentVersion: this.CURRENT_CONSENT_VERSION, consentDate: new Date() });
                        return [4 /*yield*/, this.db('users')
                                .where({ id: userId })
                                .update({
                                consent_flags: updatedConsent,
                                updated_at: new Date()
                            })];
                    case 2:
                        _a.sent();
                        // Clear cache
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.userCache(userId))];
                    case 3:
                        // Clear cache
                        _a.sent();
                        // Log consent change for audit
                        logger_1.logger.info('User consent updated', {
                            userId: userId,
                            previousConsent: currentConsent,
                            newConsent: updatedConsent,
                            changedFields: Object.keys(consentData)
                        });
                        return [2 /*return*/, updatedConsent];
                }
            });
        });
    };
    UserService.prototype.getConsentHistory = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getUserById(userId)];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        return [2 /*return*/, [user.consentFlags]];
                }
            });
        });
    };
    UserService.prototype.verifyEmail = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var verificationData, _a, userId, email, result;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.redis.get(redis_1.RedisKeys.emailVerification(token))];
                    case 1:
                        verificationData = _b.sent();
                        if (!verificationData) {
                            throw new errorHandler_1.AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN');
                        }
                        _a = JSON.parse(verificationData), userId = _a.userId, email = _a.email;
                        return [4 /*yield*/, this.db('users')
                                .where({ id: userId, email: email })
                                .update({
                                status: 'active',
                                updated_at: new Date()
                            })];
                    case 2:
                        result = _b.sent();
                        if (result === 0) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        // Remove verification token
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.emailVerification(token))];
                    case 3:
                        // Remove verification token
                        _b.sent();
                        // Clear user cache
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.userCache(userId))];
                    case 4:
                        // Clear user cache
                        _b.sent();
                        logger_1.logger.info('Email verified', { userId: userId, email: email });
                        return [2 /*return*/, true];
                }
            });
        });
    };
    UserService.prototype.resendEmailVerification = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users').where({ email: email, status: 'pending' }).first()];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            throw new errorHandler_1.AppError('User not found or already verified', 404, 'USER_NOT_FOUND');
                        }
                        return [4 /*yield*/, this.generateEmailVerificationToken(user.id, email)];
                    case 2:
                        _a.sent();
                        logger_1.logger.info('Email verification resent', { userId: user.id, email: email });
                        return [2 /*return*/];
                }
            });
        });
    };
    UserService.prototype.changePassword = function (userId, currentPassword, newPassword) {
        return __awaiter(this, void 0, void 0, function () {
            var user, isValidPassword, newPasswordHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users').where({ id: userId }).first()];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        return [4 /*yield*/, bcryptjs_1.default.compare(currentPassword, user.password_hash)];
                    case 2:
                        isValidPassword = _a.sent();
                        if (!isValidPassword) {
                            throw new errorHandler_1.AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');
                        }
                        return [4 /*yield*/, bcryptjs_1.default.hash(newPassword, 12)];
                    case 3:
                        newPasswordHash = _a.sent();
                        return [4 /*yield*/, this.db('users')
                                .where({ id: userId })
                                .update({
                                password_hash: newPasswordHash,
                                updated_at: new Date()
                            })];
                    case 4:
                        _a.sent();
                        logger_1.logger.info('Password changed', { userId: userId });
                        return [2 /*return*/];
                }
            });
        });
    };
    UserService.prototype.deactivateUser = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users')
                            .where({ id: userId })
                            .update({
                            status: 'inactive',
                            updated_at: new Date()
                        })];
                    case 1:
                        result = _a.sent();
                        if (result === 0) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        // Clear cache
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.userCache(userId))];
                    case 2:
                        // Clear cache
                        _a.sent();
                        logger_1.logger.info('User deactivated', { userId: userId });
                        return [2 /*return*/];
                }
            });
        });
    };
    UserService.prototype.suspendUser = function (userId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db('users')
                            .where({ id: userId })
                            .update({
                            status: 'suspended',
                            updated_at: new Date()
                        })];
                    case 1:
                        result = _a.sent();
                        if (result === 0) {
                            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
                        }
                        // Clear cache
                        return [4 /*yield*/, this.redis.del(redis_1.RedisKeys.userCache(userId))];
                    case 2:
                        // Clear cache
                        _a.sent();
                        logger_1.logger.warn('User suspended', { userId: userId, reason: reason });
                        return [2 /*return*/];
                }
            });
        });
    };
    UserService.prototype.checkConsentCompliance = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getUserById(userId)];
                    case 1:
                        user = _a.sent();
                        if (!user) {
                            return [2 /*return*/, false];
                        }
                        // Check if consent version is current
                        if (user.consentFlags.consentVersion !== this.CURRENT_CONSENT_VERSION) {
                            logger_1.logger.warn('User has outdated consent version', {
                                userId: userId,
                                currentVersion: user.consentFlags.consentVersion,
                                requiredVersion: this.CURRENT_CONSENT_VERSION
                            });
                            return [2 /*return*/, false];
                        }
                        // Check if required consents are given
                        if (!user.consentFlags.dataProcessing) {
                            logger_1.logger.warn('User has not consented to data processing', { userId: userId });
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/, true];
                }
            });
        });
    };
    UserService.prototype.generateEmailVerificationToken = function (userId, email) {
        return __awaiter(this, void 0, void 0, function () {
            var token, expiresAt, verificationData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        token = crypto_1.default.randomBytes(32).toString('hex');
                        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        verificationData = {
                            token: token,
                            userId: userId,
                            email: email,
                            expiresAt: expiresAt
                        };
                        // Store in Redis with 24 hour expiration
                        return [4 /*yield*/, this.redis.setEx(redis_1.RedisKeys.emailVerification(token), 24 * 60 * 60, JSON.stringify(verificationData))];
                    case 1:
                        // Store in Redis with 24 hour expiration
                        _a.sent();
                        // In production, send email here
                        logger_1.logger.info('Email verification token generated', { userId: userId, email: email, token: token });
                        return [2 /*return*/, token];
                }
            });
        });
    };
    UserService.prototype.encryptPII = function (data) {
        // In production, use proper KMS encryption
        var cipher = crypto_1.default.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
        var encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return Buffer.from(encrypted, 'hex');
    };
    UserService.prototype.decryptPII = function (encryptedData) {
        // In production, use proper KMS decryption
        var decipher = crypto_1.default.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);
        var decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    };
    UserService.prototype.mapUserFromDb = function (dbUser) {
        return {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            department: dbUser.department,
            status: dbUser.status,
            consentFlags: dbUser.consent_flags,
            paymentTokenRef: dbUser.payment_token_ref,
            createdAt: dbUser.created_at,
            updatedAt: dbUser.updated_at
        };
    };
    return UserService;
}());
exports.UserService = UserService;
/**
    * Update worker availability status
    */
async;
updateWorkerAvailability(userId, string, available, boolean, reason ?  : string);
Promise < void  > {
    try: {
        await: await,
        this: .db('users')
            .where({ id: userId, role: 'worker' })
            .update({
            available: available,
            availability_reason: reason,
            updated_at: new Date()
        }),
        // Clear user cache
        await: await,
        this: .redis.del(redis_1.RedisKeys.userCache(userId)),
        logger: logger_1.logger,
        : .info('Worker availability updated', {
            userId: userId,
            available: available,
            reason: reason
        })
    },
    catch: function (error) {
        logger_1.logger.error('Failed to update worker availability', {
            error: error.message,
            userId: userId,
            available: available,
            reason: reason
        });
        throw error;
    }
};
/**
 * Update driver availability status
 */
async;
updateDriverAvailability(userId, string, available, boolean, reason ?  : string, location ?  : any);
Promise < void  > {
    try: {
        await: await,
        this: .db('users')
            .where({ id: userId, role: 'driver' })
            .update({
            available: available,
            availability_reason: reason,
            availability_location: location ? JSON.stringify(location) : null,
            updated_at: new Date()
        }),
        // Clear user cache
        await: await,
        this: .redis.del(redis_1.RedisKeys.userCache(userId)),
        logger: logger_1.logger,
        : .info('Driver availability updated', {
            userId: userId,
            available: available,
            reason: reason,
            hasLocation: !!location
        })
    },
    catch: function (error) {
        logger_1.logger.error('Failed to update driver availability', {
            error: error.message,
            userId: userId,
            available: available,
            reason: reason
        });
        throw error;
    }
};
/**
 * Update user consent flags
 */
async;
updateConsentFlags(userId, string, consentUpdates, ConsentUpdateData);
Promise < auth_1.User > {
    try: {
        const: user = await this.getUser(userId),
        if: function (, user) {
            throw new errorHandler_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        },
        const: updatedConsentFlags,
        ConsentFlags: auth_1.ConsentFlags,
        await: await,
        this: .db('users')
            .where({ id: userId })
            .update({
            consent_flags: JSON.stringify(updatedConsentFlags),
            updated_at: new Date()
        }),
        // Clear user cache
        await: await,
        this: .redis.del(redis_1.RedisKeys.userCache(userId)),
        // Log consent changes for audit
        logger: logger_1.logger,
        : .info('User consent flags updated', {
            userId: userId,
            consentUpdates: consentUpdates,
            previousConsent: user.consentFlags,
            newConsent: updatedConsentFlags
        }),
        // Return updated user
        return: await this.getUser(userId)
    },
    catch: function (error) {
        logger_1.logger.error('Failed to update consent flags', {
            error: error.message,
            userId: userId,
            consentUpdates: consentUpdates
        });
        throw error;
    }
};
